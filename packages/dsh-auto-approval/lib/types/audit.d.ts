/**
 * 审计：每次判定落一条 `auto-approval/decision` session 事件（可回放），
 * 命中的 pattern 原文只出现在这里和日志里，不进返回给模型的 reason（M2）。
 *
 * 审计是 best-effort：append 失败（如无 session、数据不可序列化）只记
 * warn，绝不影响审批决策本身。
 * @module @deepseek-ai/dsh-auto-approval/audit
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ModelRoute } from './config.ts';
import type { AgentLike } from './tracker.ts';
/** 判定来源阶段。 */
export type DecisionStage = 
/** L0 deny 规则命中（含 guard 路径）。 */
'L0-deny'
/** L0 自毁护栏：终止宿主进程的命令。 */
 | 'L0-selfkill'
/** L0 ask 规则命中（语义已改：askPatterns 命中即 deny，全托管不转人工）。 */
 | 'L0-ask'
/** M5：escalation 参数豁免，交给 sandbox 升级通道审批。 */
 | 'escalation-bypass'
/** autoApproveTools 白名单。 */
 | 'whitelist'
/** L1 Stage 1 fast 过滤直接放行。 */
 | 'L1-fast'
/** L1 Stage 2 CoT 深查得出结论。 */
 | 'L1-deep'
/** L1 不可用（无模型/无意图/超时/解析失败），fail-closed 转 deny。 */
 | 'L1-fail-closed'
/** 连续 deny 达上限，本 turn 暂停自动放行（M6）。 */
 | 'paused'
/** 未命中任何规则，默认放行。 */
 | 'default-allow';
/** `auto-approval/decision` 事件载荷（必须 lossless JSON）。
 * 全托管收敛为 allow/deny 两态：不确定的调用（原 askPatterns 命中、L1 ASK、
 * fail-closed、防失控 pause）统一 deny。 */
export interface AutoApprovalDecisionEvent {
    /** tool 名。 */
    readonly tool: string;
    /** 本次调用 id。 */
    readonly callId: string;
    /** 判定来源阶段。 */
    readonly stage: DecisionStage;
    /** 二态结论。 */
    readonly decision: 'allow' | 'deny';
    /** 命中的 pattern 原文（仅 L0-* 阶段；pattern 的唯一落点）。 */
    readonly pattern?: string;
    /** L1 使用的模型路由（仅 L1-* 阶段）。 */
    readonly route?: ModelRoute;
    /** L1 耗时（毫秒，仅 L1-* 阶段）。 */
    readonly latencyMs?: number;
    /** 补充说明（如 fail-closed 的原因、pause 的计数）。 */
    readonly detail?: string;
}
declare module '@deepseek-ai/dsh-session' {
    interface SessionEventMap {
        /** auto-approval 插件的每次 tool-call 判定记录（log-only，不进模型历史）。 */
        'auto-approval/decision': AutoApprovalDecisionEvent;
    }
}
export declare const DECISION_LOG_PATH: string;
/** 插件生命周期记录：arm（启用）时的配置摘要，第一行即可确认插件是否在跑。 */
export declare function auditArmed(ctx: Context, summary: {
    readonly deny: number;
    readonly ask: number;
    readonly autoApproveTools: number;
    readonly consecutiveDenyLimit: number;
    readonly classifier: string;
}): void;
/**
 * 落一条审计事件。无 agent（无 session）时跳过；append 异常被吞掉并记
 * warn——审计永远不该阻断 tool 执行。
 *
 * 08-12 final 起 session 读取对未声明事件类型 fail-closed
 * （`KNOWN_SESSION_EVENT_TYPES` 白名单，`Session.append()` 无 ignorable
 * 通道），写自定义事件会使该 session 重启后无法打开——session 事件写入
 * 由 `auditSessionEvents` 开关控制（默认 false）；文件日志
 * `~/.dsh/logs/auto-approval.log` 始终记录，不受影响。
 */
export declare function audit(ctx: Context, agent: AgentLike | undefined, event: AutoApprovalDecisionEvent, sessionEvents: boolean): void;
//# sourceMappingURL=audit.d.ts.map