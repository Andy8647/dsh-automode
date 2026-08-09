/**
 * 防失控计数（M6）：每 agent 的"当前 turn 内连续 deny 次数"。
 *
 * turn 边界不从 agent 事件订阅，而是惰性读 session log 里最后一个
 * `turn/start`——append-only、seq 连续的 log 配上扫描游标，每次同步是
 * O(增量事件数)，且不存在订阅漏接/时序漂移问题。
 *
 * 无 agent 的调用（`exec.agent === undefined`）拿不到 session，fail-closed：
 * 不参与计数，也永远不会被 pause 影响。
 * @module @deepseek-ai/dsh-auto-approval/tracker
 */
export class DenialTracker {
    limit;
    states = new WeakMap();
    constructor(limit) {
        this.limit = limit;
    }
    /**
     * 同步 agent 的 turn 状态：从游标处扫到 log 末尾，遇到 turn 号变化即
     * 清零连续 deny 计数（新 turn = 新的用户意图上下文，防失控重新起算）。
     */
    sync(agent) {
        let state = this.states.get(agent);
        if (state === undefined) {
            state = { turn: -1, denials: 0, cursor: 0 };
            this.states.set(agent, state);
        }
        const events = agent.session.events;
        for (let seq = state.cursor; seq < events.length; seq++) {
            const event = events[seq];
            if (event !== undefined && event.type === 'turn/start' && event.data.turn !== state.turn) {
                state.turn = event.data.turn;
                state.denials = 0;
            }
        }
        state.cursor = events.length;
        return state;
    }
    /**
     * 该 agent 是否已进入"暂停自动放行"状态（本 turn 连续 deny 达到上限）。
     * 无 agent 的调用永远返回 false（fail-closed 不计数）。
     */
    isPaused(agent) {
        if (agent === undefined)
            return false;
        return this.sync(agent).denials >= this.limit;
    }
    /** 记录一次本插件发出的 deny。无 agent 的调用不计数。 */
    recordDenial(agent) {
        if (agent === undefined)
            return;
        this.sync(agent).denials += 1;
    }
}
//# sourceMappingURL=tracker.js.map