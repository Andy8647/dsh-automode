/**
 * 决策历史环形缓冲 + 累计计数（per agent）。
 *
 * 给 client 伴侣包的弹窗表格提供最近决策（时间 / 工具 / 阶段 / 结论 /
 * 命中的 pattern），给 chip 的 hover tooltip 提供累计统计
 * （approvals / denials / asks）。
 *
 * 与 tracker 的分工：tracker 只算「本 turn 连续 deny」（防失控用），
 * 这里算「插件加载以来的累计决策」。无 agent 的调用不记录（与 tracker
 * fail-closed 一致）。
 * @module @deepseek-ai/dsh-auto-approval/history
 */
import type { AgentLike } from './tracker.ts';
import type { DecisionStage } from './audit.ts';
/** 单条决策记录（UI 展示用；不含 callId 等调试细节）。 */
export interface DecisionRecord {
    /** ISO 时间戳。 */
    readonly time: string;
    /** tool 名。 */
    readonly tool: string;
    /** 判定来源阶段。 */
    readonly stage: DecisionStage;
    /** 三态结论。 */
    readonly decision: 'allow' | 'deny' | 'ask';
    /** 命中的 pattern 原文（仅 L0-* 阶段）。 */
    readonly pattern?: string;
    /** 补充说明（L1 rationale / fail-closed 原因 / pause 计数）。 */
    readonly detail?: string;
}
/** 累计决策统计（插件加载以来，per agent）。 */
export interface DecisionCounts {
    readonly approvals: number;
    readonly denials: number;
    readonly asks: number;
}
/**
 * per-agent 决策历史。记录 append-only，超容量丢最旧的（环形语义）；
 * 累计计数不受容量截断影响（记录被丢但计数保留）。
 */
export declare class DecisionHistory {
    private readonly capacity;
    private readonly states;
    constructor(capacity?: number);
    /** 记录一条决策。无 agent（无 session）的调用不记录、不计数。 */
    record(agent: AgentLike | undefined, event: Omit<DecisionRecord, 'time'>): void;
    /** 该 agent 的最近决策（新→旧，最多 capacity 条）。无 agent 返回空数组。 */
    records(agent: AgentLike | undefined): readonly DecisionRecord[];
    /** 该 agent 的累计统计。无 agent 返回全零。 */
    counts(agent: AgentLike | undefined): DecisionCounts;
}
//# sourceMappingURL=history.d.ts.map