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

import { Context } from 'cordis'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { Config, resolveConfig } from './config.ts'
import type { ResolvedConfig } from './config.ts'
import { classifyL1 } from './classifier.ts'
import type { LlmLike } from './classifier.ts'
import { ASK_REASON, createDenyGuard, DENY_REASON, extractMatchableText, hasEscalationArgs, matchFirst } from './rules.ts'
import { audit } from './audit.ts'
import type { DecisionStage } from './audit.ts'
import { DenialTracker } from './tracker.ts'

export const name = 'auto-approval'

/** settings 命名空间：settings.yaml 的 section 名，也是 Web UI 设置页的 section。 */
export const NS = settingsNamespace('auto-approval')

export { Config } from './config.ts'

/** 连续 deny 达上限后转人工的文案（通用，不含计数细节以外信息）。 */
const PAUSED_REASON =
  'auto-approval: auto-approval is paused after repeated denials this turn. ' +
  'Stop attempting blocked actions and check with the user before continuing.'

/** L1 不可用（无模型服务或无用户意图上下文）时 fail-closed 的文案。 */
const L1_UNAVAILABLE_REASON = 'auto-approval: automatic classifier is unavailable; deferring to manual approval.'

/** L1 判定失败（超时/解析失败）时 fail-closed 的文案。 */
const L1_FAILED_REASON = 'auto-approval: automatic classifier failed; deferring to manual approval.'

/**
 * 从 session log 提取最近一条真实用户消息的文本（L1 的意图输入）。
 * 只看 `source.kind === 'user'` 的消息：plugin 注入（ask-user 类工具的
 * 返回、agent.inject 上下文）都不算授权。往回扫到 log 开头为止；这条
 * 路径只在 L1 启用且未被 L0/白名单短路时走到，频率低，线性扫可接受。
 */
function latestUserIntent(agent: Agent | undefined): string | undefined {
  if (agent === undefined) return undefined
  const events = agent.session.events
  for (let seq = events.length - 1; seq >= 0; seq--) {
    const event = events[seq]
    if (event === undefined || event.type !== 'user/message' || event.data.source.kind !== 'user') continue
    const text = event.data.content
      .map(block => block.type === 'text' ? block.text : `[${block.type} content]`)
      .join('\n')
      .trim()
    if (text.length > 0) return text
  }
  return undefined
}

/** 一次调用的决策上下文：tracker/audit 共用的 agent 与 callId 提取。 */
function callFacts(exec: ToolExecution): { agent: Agent | undefined; callId: string } {
  return { agent: exec.agent, callId: String(exec.callId) }
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
export function apply(ctx: Context, config: Config = {}): void {
  let current: () => Config = () => config
  let resolved: ResolvedConfig = resolveConfig(config)
  let tracker = new DenialTracker(resolved.consecutiveDenyLimit)
  const logger = ctx.logger('auto-approval')

  const arm = (): void => {
    logger.info(
      `auto-approval armed: ${resolved.deny.length} deny / ${resolved.ask.length} ask patterns, ` +
      `${resolved.autoApproveTools.size} auto-approve tools, consecutiveDenyLimit=${resolved.consecutiveDenyLimit}` +
      (resolved.classifier === undefined
        ? ', L1 disabled'
        : `, L1 fast=${resolved.classifier.fast.provider}/${resolved.classifier.fast.model}`),
    )
  }

  let settingsAttached = false
  installSettingsSection(ctx, NS, Config, config, {
    setSource: (source) => { current = source },
    // 拒绝无法执行的写（非法正则、不成对路由）：throw 使 update/replace 失败，
    // 运行中的实例保留上一份好配置。
    validate: (value) => { resolveConfig(value) },
    onChange: () => {
      settingsAttached = true
      resolved = resolveConfig(current())
      // 配置换了计数语义也可能变（如新的 limit），重置防失控计数最保守。
      tracker = new DenialTracker(resolved.consecutiveDenyLimit)
      arm()
    },
  })

  // M3：L0 deny 注册为单调 guard——在所有 pre-execute listener 之后执行，
  // 只能 deny 不能 allow，其它 prepend 插件旁路不掉这条硬底线。guard 读
  // thunk，settings 热更新即时生效。ctx.tools 缺席（罕见：core 未加载
  // tools）时降级为只挂瀑布并告警。
  if (ctx.get('tools') !== undefined) {
    ctx.tools.guard(createDenyGuard(() => resolved))
  } else {
    logger.warn('ctx.tools is not available; L0 deny guard NOT registered (pre-execute listener still active)')
  }

  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    if (!resolved.enabled) return next()
    const { agent, callId } = callFacts(exec)
    const text = extractMatchableText(exec.arguments)

    // ---- L0 deny（硬底线，最高优先级；escalation 豁免不适用） ----
    if (text !== undefined) {
      const hit = matchFirst(text, resolved.deny)
      if (hit !== undefined) {
        tracker.recordDenial(agent)
        const pattern = resolved.denySources[hit.index]
        logger.info(`deny ${exec.name} (${callId}): matched deny pattern /${pattern ?? '?'}/`)
        audit(ctx, agent, {
          tool: exec.name, callId, stage: 'L0-deny', decision: 'deny',
          ...pattern === undefined ? {} : { pattern },
        })
        return { kind: 'deny', reason: DENY_REASON }
      }
    }

    // ---- M6 防失控：本 turn 连续 deny 达上限，暂停自动放行 ----
    if (tracker.isPaused(agent)) {
      audit(ctx, agent, {
        tool: exec.name, callId, stage: 'paused', decision: 'ask',
        detail: `consecutiveDenyLimit=${resolved.consecutiveDenyLimit} reached`,
      })
      return { kind: 'ask', reason: PAUSED_REASON }
    }

    // ---- M5：sandbox escalation 请求豁免 ask/L1（避免双重审批） ----
    if (hasEscalationArgs(exec.arguments)) {
      audit(ctx, agent, { tool: exec.name, callId, stage: 'escalation-bypass', decision: 'allow' })
      return next()
    }

    // ---- L0 ask（转人工） ----
    if (text !== undefined) {
      const hit = matchFirst(text, resolved.ask)
      if (hit !== undefined) {
        const pattern = resolved.askSources[hit.index]
        logger.info(`ask ${exec.name} (${callId}): matched ask pattern /${pattern ?? '?'}/`)
        audit(ctx, agent, {
          tool: exec.name, callId, stage: 'L0-ask', decision: 'ask',
          ...pattern === undefined ? {} : { pattern },
        })
        return { kind: 'ask', reason: ASK_REASON }
      }
    }

    // ---- 只读工具白名单 ----
    if (resolved.autoApproveTools.has(exec.name)) {
      audit(ctx, agent, { tool: exec.name, callId, stage: 'whitelist', decision: 'allow' })
      return next()
    }

    // ---- L1 LLM classifier（配置 fast 路由后启用） ----
    if (resolved.classifier !== undefined) {
      const llm = ctx.get('llm') as LlmLike | undefined
      const intent = latestUserIntent(agent)
      if (llm === undefined || intent === undefined) {
        const detail = llm === undefined ? 'no ctx.llm service' : 'no user message in session log'
        audit(ctx, agent, { tool: exec.name, callId, stage: 'L1-fail-closed', decision: 'ask', detail })
        return { kind: 'ask', reason: L1_UNAVAILABLE_REASON }
      }
      const outcome = await classifyL1(llm, resolved.classifier, {
        intent,
        toolName: exec.name,
        args: exec.arguments as JsonValue,
        ...agent === undefined ? {} : { sessionId: agent.session.id },
        signal: exec.signal,
      })
      if (outcome.status === 'fail-closed') {
        logger.warn(`L1 ${outcome.stage} failed for ${exec.name} (${callId}): ${outcome.error}`)
        audit(ctx, agent, { tool: exec.name, callId, stage: 'L1-fail-closed', decision: 'ask', detail: outcome.error })
        return { kind: 'ask', reason: L1_FAILED_REASON }
      }
      const stage: DecisionStage = outcome.stage
      if (outcome.status === 'deny') {
        tracker.recordDenial(agent)
        logger.info(`L1 deny ${exec.name} (${callId})${outcome.stage === 'L1-deep' ? `: ${outcome.rationale}` : ''}`)
        audit(ctx, agent, {
          tool: exec.name, callId, stage, decision: 'deny', route: outcome.route,
          latencyMs: outcome.latencyMs,
          ...outcome.stage === 'L1-deep' ? { detail: outcome.rationale } : {},
        })
        return { kind: 'deny', reason: DENY_REASON }
      }
      audit(ctx, agent, {
        tool: exec.name, callId, stage, decision: outcome.status, route: outcome.route,
        latencyMs: outcome.latencyMs,
        ...outcome.stage === 'L1-deep' ? { detail: outcome.rationale } : {},
      })
      if (outcome.status === 'ask') return { kind: 'ask', reason: ASK_REASON }
      return next()
    }

    // ---- 未命中任何规则：默认放行（与瀑布 fallback 一致） ----
    audit(ctx, agent, { tool: exec.name, callId, stage: 'default-allow', decision: 'allow' })
    return next()
  }, { prepend: true })

  // settings 服务缺席（无 inject 回调）时，entry config 已在上面手动 resolve。
  if (!settingsAttached) arm()
}

export default apply
