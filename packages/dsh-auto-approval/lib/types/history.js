/**
 * 决策历史环形缓冲 + 累计计数（per agent）。
 *
 * 给 client 伴侣包的弹窗表格提供最近决策（时间 / 工具 / 阶段 / 结论 /
 * 命中的 pattern），给 chip 的 hover tooltip 提供累计统计（approvals /
 * denials）。
 *
 * 与 tracker 的分工：tracker 只算「本 turn deny 计数」（chip 的本 turn 显示），
 * 这里算「插件加载以来的累计决策」。无 agent 的调用不记录（与 tracker
 * fail-closed 一致）。
 * @module @deepseek-ai/dsh-auto-approval/history
 */
/**
 * per-agent 决策历史。记录 append-only，超容量丢最旧的（环形语义）；
 * 累计计数不受容量截断影响（记录被丢但计数保留）。
 */
export class DecisionHistory {
    capacity;
    states = new WeakMap();
    constructor(capacity = 100) {
        this.capacity = capacity;
    }
    /** 记录一条决策。无 agent（无 session）的调用不记录、不计数。 */
    record(agent, event) {
        if (agent === undefined)
            return;
        let state = this.states.get(agent);
        if (state === undefined) {
            state = { records: [], counts: { approvals: 0, denials: 0 } };
            this.states.set(agent, state);
        }
        state.records.push({ time: new Date().toISOString(), ...event });
        if (state.records.length > this.capacity)
            state.records.shift();
        switch (event.decision) {
            case 'allow':
                state.counts.approvals += 1;
                break;
            case 'deny':
                state.counts.denials += 1;
                break;
        }
    }
    /** 该 agent 的最近决策（新→旧，最多 capacity 条）。无 agent 返回空数组。 */
    records(agent) {
        if (agent === undefined)
            return [];
        const records = this.states.get(agent)?.records;
        if (records === undefined)
            return [];
        // 内部 append-only（旧→新），对外暴露新→旧（UI 表格最新在最上）。
        return [...records].reverse();
    }
    /** 该 agent 的累计统计。无 agent 返回全零。 */
    counts(agent) {
        if (agent === undefined)
            return { approvals: 0, denials: 0 };
        const state = this.states.get(agent);
        if (state === undefined)
            return { approvals: 0, denials: 0 };
        return state.counts;
    }
}
//# sourceMappingURL=history.js.map