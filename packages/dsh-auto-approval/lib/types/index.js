/**
 * DSH 权限自动审批插件 — `@deepseek-ai/dsh-auto-approval`
 *
 * 在 `tools/pre-execute` 瀑布最前挂一个三层 classifier，给 dsh 的 approval
 * policy 增加第三档 `auto`（现有：`ask` / `never`）：
 *
 *   L0 规则引擎（硬底线）→ L1 LLM classifier（意图对齐，可配）→ L2 人工兜底
 *
 * 设计要点（详见 README「方案设计」）：
 * - L0 deny 同时走 `ctx.tools.guard()` 单调注册（M3），prepend 旁路不掉
 * - deny/ask 的 reason 是通用文案，pattern 只进审计与日志（M2）
 * - 检测到 sandbox escalation 参数即豁免 ask/L1，避免双重审批（M5）
 * - 连续 deny 达上限后本 turn 暂停自动放行（M6），turn 边界从 session log 推导
 * - L1 一切失败 fail-closed 转 ask，绝不默认放行
 *
 * @module @deepseek-ai/dsh-auto-approval
 */
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';
import { Config, resolveConfig } from "./config.js";
import { classifyL1 } from "./classifier.js";
import { ASK_REASON, createDenyGuard, DENY_REASON, extractMatchableText, hasEscalationArgs, matchBashPrefix, matchFirst, matchSelfKill, selfKillDenyReason } from "./rules.js";
import { audit, auditArmed } from "./audit.js";
import { AutoApprovalStatusService } from "./remote.js";
import { remoteManifest } from "./remote-manifest.js";
import { DenialTracker } from "./tracker.js";
import { DecisionHistory } from "./history.js";
export const name = 'auto-approval';
/** settings 命名空间：settings.yaml 的 section 名，也是 Web UI 设置页的 section。 */
export const NS = settingsNamespace('auto-approval');
export { Config } from "./config.js";
/** 连续 deny 达上限后转人工的文案（通用，不含计数细节以外信息）。 */
const PAUSED_REASON = 'auto-approval: auto-approval is paused after repeated denials this turn. ' +
    'Stop attempting blocked actions and check with the user before continuing.';
/** L1 不可用（无模型服务或无用户意图上下文）时 fail-closed 的文案。 */
const L1_UNAVAILABLE_REASON = 'auto-approval: automatic classifier is unavailable; deferring to manual approval.';
/** L1 判定失败（超时/解析失败）时 fail-closed 的文案。 */
const L1_FAILED_REASON = 'auto-approval: automatic classifier failed; deferring to manual approval.';
/**
 * 从 session log 提取最近一条真实用户消息的文本（L1 的意图输入）。
 * 只看 `source.kind === 'user'` 的消息：plugin 注入（ask-user 类工具的
 * 返回、agent.inject 上下文）都不算授权。往回扫到 log 开头为止；这条
 * 路径只在 L1 启用且未被 L0/白名单短路时走到，频率低，线性扫可接受。
 */
function latestUserIntent(agent) {
    if (agent === undefined)
        return undefined;
    const events = agent.session.events;
    for (let seq = events.length - 1; seq >= 0; seq--) {
        const event = events[seq];
        if (event === undefined || event.type !== 'user/message' || event.data.source.kind !== 'user')
            continue;
        const text = event.data.content
            .map(block => block.type === 'text' ? block.text : `[${block.type} content]`)
            .join('\n')
            .trim();
        if (text.length > 0)
            return text;
    }
    return undefined;
}
/** 一次调用的决策上下文：tracker/audit 共用的 agent 与 callId 提取。 */
function callFacts(exec) {
    return { agent: exec.agent, callId: String(exec.callId) };
}
/**
 * 插件入口：挂载 `tools/pre-execute` 瀑布（prepend 最先跑）+ L0 deny 的
 * 单调 guard。配置非法直接 throw（fail-loud，M1）。
 *
 * 配置走 `installSettingsSection`（settings 命名空间 `auto-approval`）：
 * composition entry 是 base 层，`$DSH_HOME/settings.yaml` 的
 * `auto-approval:` section 和 Web UI 设置页是 user 层，改动**热生效**——
 * `enabled` 就是 Web UI 里的 automode 开关。`validate` 钩子让带非法正则
 * / 不成对路由的写在提交前被拒（UI 层 fail-loud）。settings 服务缺席的
 * 组合（如 headless）自动回退 entry config。
 */
export function apply(ctx, config = {}) {
    let current = () => config;
    let resolved = resolveConfig(config);
    let tracker = new DenialTracker(resolved.consecutiveDenyLimit);
    const history = new DecisionHistory();
    const logger = ctx.logger('auto-approval');
    /**
     * 运行时 enabled override：`setEnabled` 写 settings 失败（settings 服务缺席 /
     * 只读 provider）时的兜底，只影响当前进程。成功写 settings 时清空，让
     * settings 值成为唯一权威（重启后保持）。
     */
    let runtimeEnabled;
    /** settings provider 引用（兄弟 entry 服务，用 ctx.inject 等就绪后保存）。 */
    let settingsProvider;
    ctx.inject(['settings'], (sctx) => {
        settingsProvider = sctx.get('settings');
    });
    /** 实际生效的 enabled：运行时 override 优先，否则配置值。 */
    const effectiveEnabled = () => runtimeEnabled ?? resolved.enabled;
    /** 审计入口：文件日志始终写；session 事件按 `auditSessionEvents` 开关（默认关）
     * ——08-12 final 起 session 读取对未声明事件类型 fail-closed（KNOWN_SESSION_EVENT_TYPES
     * 白名单 + append() 无 ignorable 通道），写 session 事件会使该 session 重启后无法打开。
     * 同时把决策记入内存 history（供 remote getHistory / 累计统计），best-effort 不阻塞。 */
    const auditDecision = (ctx, agent, event) => {
        audit(ctx, agent, event, resolved.auditSessionEvents ?? false);
        history.record(agent, event);
    };
    /** remote 状态读取：读 resolved 配置摘要 + tracker 的 per-agent 运行态 + history 累计统计，不落 session 事件。 */
    const readStatus = (agent) => {
        const counts = history.counts(agent);
        return {
            enabled: effectiveEnabled(),
            denyPatterns: resolved.deny.length,
            askPatterns: resolved.ask.length,
            autoApproveTools: resolved.autoApproveTools.size,
            classifier: resolved.classifier === undefined
                ? 'disabled'
                : `${resolved.classifier.fast.provider}/${resolved.classifier.fast.model}`,
            denials: tracker.denials(agent),
            paused: tracker.isPaused(agent),
            approvals: counts.approvals,
            asks: counts.asks,
            totalDenials: counts.denials,
        };
    };
    /** remote 最近决策读取：直接读内存 history（无 agent 返回空数组）。 */
    const readHistory = (agent) => history.records(agent);
    /**
     * remote 开关写入：优先持久化到 settings（热生效且重启后保持）；settings
     * 缺席或只读时降级为进程内 override（仅本次运行）。失败不影响返回——
     * 调用方拿返回的 status 决定 UI 显示。
     */
    const writeEnabled = async (enabled) => {
        const provider = settingsProvider;
        if (provider !== undefined && provider.writable !== false) {
            try {
                await provider.update(NS, { enabled });
                runtimeEnabled = undefined;
                return;
            }
            catch (error) {
                logger.warn(`setEnabled: settings update failed (${error instanceof Error ? error.message : String(error)}); using runtime override`);
            }
        }
        runtimeEnabled = enabled;
    };
    // 注册 remote 服务：Cordis Service 构造器自 provide，并绑定 Typert Gateway。
    new AutoApprovalStatusService(ctx, { read: readStatus, history: readHistory, setEnabled: writeEnabled });
    // 把严格描述符注册进运行时的 typert registry（strict dispatch）。
    // 不能走 SRC fallback（`@Remote` marker 的 WeakMap 是模块级状态，独立
    // 仓库的插件和运行时各持一份 `typert-protocol`，marker 跨不过去——
    // 双包危害）；strict descriptor 直接写进运行时的 registry，绕开共享状态。
    // `ctx.get` 读全局 store（`typert` 由 dsh-typert-registry 提供，是兄弟
    // entry，走 per-fiber store 链会找不到），注册时机早于任何 client 调用。
    // 把严格描述符注册进运行时的 typert registry（strict dispatch）。
    // 不能走 SRC fallback（`@Remote` marker 的 WeakMap 是模块级状态，独立
    // 仓库的插件和运行时各持一份 `typert-protocol`，marker 跨不过去——
    // 双包危害）；strict descriptor 直接写进运行时的 registry，绕开共享状态。
    // `typert` 由 dsh-typert-registry 提供（兄弟 entry），且激活晚于本插件，
    // 用 `ctx.inject` 等它就绪后再注册。
    ctx.inject(['typert'], (typertCtx) => {
        const typert = typertCtx.get('typert');
        typert.register(remoteManifest);
    });
    const arm = () => {
        logger.info(`auto-approval armed: ${resolved.deny.length} deny / ${resolved.ask.length} ask patterns, ` +
            `${resolved.autoApproveTools.size} auto-approve tools, ${resolved.bashCommandPrefixes.length} bash prefixes, ` +
            `consecutiveDenyLimit=${resolved.consecutiveDenyLimit}` +
            (resolved.classifier === undefined
                ? ', L1 disabled'
                : `, L1 fast=${resolved.classifier.fast.provider}/${resolved.classifier.fast.model}`));
        auditArmed(ctx, {
            deny: resolved.deny.length,
            ask: resolved.ask.length,
            autoApproveTools: resolved.autoApproveTools.size,
            consecutiveDenyLimit: resolved.consecutiveDenyLimit,
            classifier: resolved.classifier === undefined
                ? 'disabled'
                : `${resolved.classifier.fast.provider}/${resolved.classifier.fast.model}`,
        });
    };
    let settingsAttached = false;
    installSettingsSection(ctx, NS, Config, config, {
        setSource: (source) => { current = source; },
        // 拒绝无法执行的写（非法正则、不成对路由）：throw 使 update/replace 失败，
        // 运行中的实例保留上一份好配置。
        validate: (value) => { resolveConfig(value); },
        onChange: () => {
            settingsAttached = true;
            resolved = resolveConfig(current());
            // 配置换了计数语义也可能变（如新的 limit），重置防失控计数最保守。
            tracker = new DenialTracker(resolved.consecutiveDenyLimit);
            arm();
        },
    });
    // M3：L0 deny 注册为单调 guard——在所有 pre-execute listener 之后执行，
    // 只能 deny 不能 allow，其它 prepend 插件旁路不掉这条硬底线。guard 读
    // thunk，settings 热更新即时生效。ctx.tools 缺席（罕见：core 未加载
    // tools）时降级为只挂瀑布并告警。用 `ctx.get('tools')` 而非 `ctx.tools`：
    // tools 由 dsh-tools entry（兄弟 fiber）提供，per-fiber store 链找不到，
    // 只有全局 store（`ctx.get`）能解析。
    const tools = ctx.get('tools');
    if (tools !== undefined) {
        // guard 读 effective enabled：toggle 关闭时 L0 硬底线同步旁路。
        tools.guard(createDenyGuard(() => ({ ...resolved, enabled: effectiveEnabled() })));
    }
    else {
        logger.warn('ctx.tools is not available; L0 deny guard NOT registered (pre-execute listener still active)');
    }
    ctx.on('tools/pre-execute', async (exec, next) => {
        if (!effectiveEnabled())
            return next();
        const { agent, callId } = callFacts(exec);
        const text = extractMatchableText(exec.arguments);
        // ---- L0 deny（硬底线，最高优先级；escalation 豁免不适用） ----
        if (text !== undefined) {
            const hit = matchFirst(text, resolved.deny);
            if (hit !== undefined) {
                tracker.recordDenial(agent);
                const pattern = resolved.denySources[hit.index];
                logger.info(`deny ${exec.name} (${callId}): matched deny pattern /${pattern ?? '?'}/`);
                auditDecision(ctx, agent, {
                    tool: exec.name, callId, stage: 'L0-deny', decision: 'deny',
                    ...pattern === undefined ? {} : { pattern },
                });
                return { kind: 'deny', reason: DENY_REASON };
            }
        }
        // ---- L0 自毁护栏：终止宿主进程（node）的命令，硬底线 deny。 ----
        // kill <pid> 仅当目标是宿主 PID 时 deny；其它具体 PID 放行（逃生通道）。
        if (text !== undefined && resolved.selfKillGuard) {
            const selfKill = matchSelfKill(text);
            if (selfKill !== undefined && (selfKill.pid === undefined || selfKill.pid === process.pid)) {
                tracker.recordDenial(agent);
                logger.info(`deny ${exec.name} (${callId}): self-kill guard matched (host pid ${process.pid})`);
                auditDecision(ctx, agent, {
                    tool: exec.name, callId, stage: 'L0-selfkill', decision: 'deny',
                    ...selfKill.pid === undefined ? {} : { detail: `target pid ${selfKill.pid}` },
                });
                return { kind: 'deny', reason: selfKillDenyReason(process.pid) };
            }
        }
        // ---- M6 防失控：本 turn 连续 deny 达上限，暂停自动放行 ----
        if (tracker.isPaused(agent)) {
            auditDecision(ctx, agent, {
                tool: exec.name, callId, stage: 'paused', decision: 'ask',
                detail: `consecutiveDenyLimit=${resolved.consecutiveDenyLimit} reached`,
            });
            return { kind: 'ask', reason: PAUSED_REASON };
        }
        // ---- M5：sandbox escalation 请求豁免 ask/L1（避免双重审批） ----
        if (hasEscalationArgs(exec.arguments)) {
            auditDecision(ctx, agent, { tool: exec.name, callId, stage: 'escalation-bypass', decision: 'allow' });
            return next();
        }
        // ---- L0 ask（转人工） ----
        if (text !== undefined) {
            const hit = matchFirst(text, resolved.ask);
            if (hit !== undefined) {
                const pattern = resolved.askSources[hit.index];
                logger.info(`ask ${exec.name} (${callId}): matched ask pattern /${pattern ?? '?'}/`);
                auditDecision(ctx, agent, {
                    tool: exec.name, callId, stage: 'L0-ask', decision: 'ask',
                    ...pattern === undefined ? {} : { pattern },
                });
                return { kind: 'ask', reason: ASK_REASON };
            }
        }
        // ---- 只读工具白名单 / bash 命令前缀白名单 ----
        if (resolved.autoApproveTools.has(exec.name)
            || (exec.name === 'bash' && matchBashPrefix(text, resolved.bashCommandPrefixes))) {
            auditDecision(ctx, agent, { tool: exec.name, callId, stage: 'whitelist', decision: 'allow' });
            return next();
        }
        // ---- L1 LLM classifier（配置 fast 路由后启用） ----
        if (resolved.classifier !== undefined) {
            const llm = ctx.get('llm');
            const intent = latestUserIntent(agent);
            if (llm === undefined || intent === undefined) {
                const detail = llm === undefined ? 'no ctx.llm service' : 'no user message in session log';
                auditDecision(ctx, agent, { tool: exec.name, callId, stage: 'L1-fail-closed', decision: 'ask', detail });
                return { kind: 'ask', reason: L1_UNAVAILABLE_REASON };
            }
            const outcome = await classifyL1(llm, resolved.classifier, {
                intent,
                toolName: exec.name,
                args: exec.arguments,
                ...agent === undefined ? {} : { sessionId: agent.session.id },
                signal: exec.signal,
            });
            if (outcome.status === 'fail-closed') {
                logger.warn(`L1 ${outcome.stage} failed for ${exec.name} (${callId}): ${outcome.error}`);
                auditDecision(ctx, agent, { tool: exec.name, callId, stage: 'L1-fail-closed', decision: 'ask', detail: outcome.error });
                return { kind: 'ask', reason: L1_FAILED_REASON };
            }
            const stage = outcome.stage;
            if (outcome.status === 'deny') {
                tracker.recordDenial(agent);
                logger.info(`L1 deny ${exec.name} (${callId})${outcome.stage === 'L1-deep' ? `: ${outcome.rationale}` : ''}`);
                auditDecision(ctx, agent, {
                    tool: exec.name, callId, stage, decision: 'deny', route: outcome.route,
                    latencyMs: outcome.latencyMs,
                    ...outcome.stage === 'L1-deep' ? { detail: outcome.rationale } : {},
                });
                return { kind: 'deny', reason: DENY_REASON };
            }
            auditDecision(ctx, agent, {
                tool: exec.name, callId, stage, decision: outcome.status, route: outcome.route,
                latencyMs: outcome.latencyMs,
                ...outcome.stage === 'L1-deep' ? { detail: outcome.rationale } : {},
            });
            if (outcome.status === 'ask')
                return { kind: 'ask', reason: ASK_REASON };
            return next();
        }
        // ---- 未命中任何规则：默认放行（与瀑布 fallback 一致） ----
        auditDecision(ctx, agent, { tool: exec.name, callId, stage: 'default-allow', decision: 'allow' });
        return next();
    }, { prepend: true });
    // settings 服务缺席（无 inject 回调）时，entry config 已在上面手动 resolve。
    if (!settingsAttached)
        arm();
}
export default apply;
//# sourceMappingURL=index.js.map