import { AutoApprovalChip } from "./AutoApprovalChip.js";
import { TYPERT_REMOTE } from "./remote.js";
/** Required services: the seat's slot registry and the Client Remote mount. */
export const inject = ['slots', 'remote'];
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
export async function apply(ctx) {
    // Mount the host's autoApprovalStatus remote before anything can call it.
    await ctx.remote.$mount(TYPERT_REMOTE);
    const statusRemote = ctx.get('remote.autoApprovalStatus');
    ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
        name: 'conversation.input.left',
        id: 'auto-approval-status',
        order: 0,
        inject: (sessionId) => ({
            getStatus: () => statusRemote.getStatus(sessionId),
            getHistory: () => statusRemote.getHistory(sessionId),
            setEnabled: (enabled) => statusRemote.setEnabled(sessionId, enabled),
        }),
    }, AutoApprovalChip));
}
//# sourceMappingURL=index.js.map