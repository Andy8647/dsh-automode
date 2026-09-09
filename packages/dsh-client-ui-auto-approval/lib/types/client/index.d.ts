import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { AutoApprovalStatus, DecisionRecord } from './remote.ts';
export type { AutoApprovalStatus, DecisionRecord } from './remote.ts';
/** Injected business face of the composer status chip. */
export interface AutoApprovalChipInjected {
    /** Read the current auto-approval status for this session's agent. */
    getStatus: () => Promise<RemoteResult<AutoApprovalStatus>>;
    /** Read the recent auto-approval decisions for this session's agent. */
    getHistory: () => Promise<RemoteResult<DecisionRecord[]>>;
    /** Toggle auto-approval on/off (persisted via host settings when available). */
    setEnabled: (enabled: boolean) => Promise<RemoteResult<AutoApprovalStatus>>;
}
/** Required services: the seat's slot registry, the Client Remote mount, and the locale registry. */
export declare const inject: string[];
/**
 * Client plugin body: mount the host remote contribution, then register the
 * status chip into the composer input-left list slot.
 *
 * The namespace service is read through `ctx.get()` (global store) rather than
 * `ctx.remote.autoApprovalStatus` (per-fiber store chain): `$mount` creates the
 * namespace under the gateway's fiber, a sibling of this plugin — the
 * traceable-proxy path cannot see a sibling-provided service, and declaring it
 * in `inject` would deadlock (the namespace only exists once this apply mounts
 * it). `ctx.get` reads the global reflect store and resolves it directly.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): Promise<void>;
//# sourceMappingURL=index.d.ts.map