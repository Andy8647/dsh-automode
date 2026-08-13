import type { RemoteResult, TypertRemoteContribution, TypertRemoteNamespace } from '@deepseek-ai/dsh-typert-protocol';
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client';
/** Wire snapshot of the host auto-approval runtime state (mirror of host `AutoApprovalStatus`). */
export interface AutoApprovalStatus {
    readonly enabled: boolean;
    readonly denyPatterns: number;
    readonly askPatterns: number;
    readonly autoApproveTools: number;
    readonly classifier: string;
    readonly denials: number;
    readonly paused: boolean;
}
/**
 * The generated Host-for-Client contribution, mounted by the client half via
 * `ctx.remote.$mount(TYPERT_REMOTE)`.
 */
export declare const TYPERT_REMOTE: TypertRemoteContribution;
export default TYPERT_REMOTE;
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface TypertRemoteMap {
        'autoApprovalStatus/getStatus': (agentId: SessionId) => Promise<RemoteResult<AutoApprovalStatus>>;
    }
    interface TypertRemoteNamespaceMap {
        'autoApprovalStatus': TypertRemoteNamespace<'autoApprovalStatus'>;
    }
    interface TypertRemoteScopeMap {
        'agent:autoApprovalStatus/getStatus': () => Promise<RemoteResult<AutoApprovalStatus>>;
    }
}
//# sourceMappingURL=remote.d.ts.map