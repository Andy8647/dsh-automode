/**
 * host→browser 状态通道：把 auto-approval 的"运行态"（armed 配置摘要 +
 * 当前 agent 本 turn 的 deny 计数 / 暂停状态）通过 Typert remote 方法暴露
 * 给浏览器伴侣包，供权限选择器旁的 chip 读取。
 *
 * 选 remote 而非投影：chip 要的是运行态，投影必须从 session 事件 fold——
 * 写自定义事件会踩 08-12 final 的 `KNOWN_SESSION_EVENT_TYPES` 白名单
 * （第三方 `Session.append()` 无 ignorable 通道）。remote 直接读 host 内存态，
 * 不落 session 事件，且无 allowlist 限制。
 *
 * `@Remote` 方法里的 `Agent` 参数走 typert lookup：client 侧传 sessionId，
 * gateway 自动解析成 Agent 对象（与 `commands.list(agent)` 同机制）。
 * @module @deepseek-ai/dsh-auto-approval/remote
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
/** wire 上传输的 auto-approval 状态快照（纯 JSON，无运行态引用）。 */
export interface AutoApprovalStatus {
    /** 插件是否启用（enabled: false 时完全旁路）。 */
    readonly enabled: boolean;
    /** L0 deny 规则数。 */
    readonly denyPatterns: number;
    /** L0 ask 规则数。 */
    readonly askPatterns: number;
    /** 免审工具白名单数量。 */
    readonly autoApproveTools: number;
    /** L1 classifier 路由（`provider/model`），未配置时为 `'disabled'`。 */
    readonly classifier: string;
    /** 当前 agent 本 turn 内累计被 deny 的次数。 */
    readonly denials: number;
    /** 当前 agent 是否已进入"暂停自动放行"（deny 达上限）。 */
    readonly paused: boolean;
}
/** 状态读取 thunk：由 apply 闭包提供（读 resolved config + tracker）。 */
export type StatusReader = (agent: Agent | undefined) => AutoApprovalStatus;
/**
 * auto-approval 状态 remote 服务。注册为 Cordis 服务并绑定 Typert Gateway，
 * client 侧通过 `ctx.remote.autoApprovalStatus.getStatus(sessionId)` 调用。
 */
export declare class AutoApprovalStatusService extends TypertRemoteService {
    private readonly read;
    constructor(ctx: Context, read: StatusReader);
    /** 当前 agent 的 auto-approval 状态快照（无 agent 则 denials/paused 归零）。 */
    getStatus(agent: Agent): AutoApprovalStatus;
}
//# sourceMappingURL=remote.d.ts.map