/**
 * 审计：每次判定落一条 `auto-approval/decision` session 事件（可回放），
 * 命中的 pattern 原文只出现在这里和日志里，不进返回给模型的 reason（M2）。
 *
 * 审计是 best-effort：append 失败（如无 session、数据不可序列化）只记
 * warn，绝不影响审批决策本身。
 * @module @deepseek-ai/dsh-auto-approval/audit
 */
import { appendFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
/**
 * 独立决策日志：`$DSH_HOME/logs/auto-approval.log`（默认 `~/.dsh/logs/...`）。
 * UI 没有任何通道渲染插件的决策（host 白名单 + toolviews 硬编码，见 issue 调研），
 * 文件日志是用户侧唯一不依赖 UI 的观测手段。每行一条 JSON，人读友好。
 *
 * 写入走串行队列（appendFile 本身无锁，同进程并发会交叉），失败只 warn，
 * 与 session 审计一样 best-effort，绝不阻塞审批决策。
 */
const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh');
export const DECISION_LOG_PATH = join(DSH_HOME, 'logs', 'auto-approval.log');
/** 首次写入前的 mkdir 一次性准备。 */
let logReady;
function ensureLogReady() {
    logReady ??= mkdir(join(DSH_HOME, 'logs'), { recursive: true }).then(() => undefined);
    return logReady;
}
/** 串行写队列：前一条落盘后才写下一条，保证同进程内顺序。 */
let writeChain = Promise.resolve();
function enqueueLogLine(ctx, line) {
    const logger = ctx.logger('auto-approval');
    writeChain = writeChain
        .then(async () => {
        await ensureLogReady();
        await appendFile(DECISION_LOG_PATH, `${JSON.stringify(line)}\n`, 'utf8');
    })
        .catch((error) => {
        logger.warn(`decision log append failed: ${error instanceof Error ? error.message : String(error)}`);
    });
}
/** 插件生命周期记录：arm（启用）时的配置摘要，第一行即可确认插件是否在跑。 */
export function auditArmed(ctx, summary) {
    enqueueLogLine(ctx, { type: 'auto-approval/armed', time: new Date().toISOString(), ...summary });
}
/**
 * 落一条审计事件。无 agent（无 session）时跳过；append 异常被吞掉并记
 * warn——审计永远不该阻断 tool 执行。
 */
export function audit(ctx, agent, event) {
    enqueueLogLine(ctx, { type: 'auto-approval/decision', time: new Date().toISOString(), ...event });
    if (agent === undefined) {
        ctx.logger('auto-approval').debug(`decision (agent-less, no session): ${JSON.stringify(event)}`);
        return;
    }
    try {
        // 结构化收窄：Session.append 的泛型签名无法直接赋入最小接口，这里只
        // 断言行存在（真实 Session 必有 append；mock 也会提供）。
        const session = agent.session;
        session.append('auto-approval/decision', event);
    }
    catch (error) {
        ctx.logger('auto-approval').warn(`audit append failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
//# sourceMappingURL=audit.js.map