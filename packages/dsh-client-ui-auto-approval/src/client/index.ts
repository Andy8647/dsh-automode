/**
 * auto-approval 状态 chip 插件，browser half：contributes a status chip to
 * the composer tool row's `conversation.input.left` list slot (the left group
 * beside the access-mode selector). The chip reads the host runtime state via
 * the mounted `autoApprovalStatus` remote — armed config summary, this turn's
 * deny count, cumulative stats, and the recent-decision history — and offers a
 * click-through dialog (toggle + decision table).
 *
 * Remote (not projection) on purpose: the chip needs live host state, and
 * projection values must fold from session events — writing custom events
 * trips the 08-12 `KNOWN_SESSION_EVENT_TYPES` allowlist.
 */
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
// Type-only: pulls the ui-conversation SlotMap merge (the input.left seat + SessionStandardProps).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { AutoApprovalChip } from './AutoApprovalChip.tsx'
import type { AutoApprovalStatus, DecisionRecord } from './remote.ts'
import { TYPERT_REMOTE } from './remote.ts'

export type { AutoApprovalStatus, DecisionRecord } from './remote.ts'

/** Injected business face of the composer status chip. */
export interface AutoApprovalChipInjected {
  /** Read the current auto-approval status for this session's agent. */
  getStatus: () => Promise<RemoteResult<AutoApprovalStatus>>
  /** Read the recent auto-approval decisions for this session's agent. */
  getHistory: () => Promise<RemoteResult<DecisionRecord[]>>
  /** Toggle auto-approval on/off (persisted via host settings when available). */
  setEnabled: (enabled: boolean) => Promise<RemoteResult<AutoApprovalStatus>>
}

/** The mounted `remote.autoApprovalStatus` namespace service (resolved via the global store). */
interface AutoApprovalRemoteNamespace {
  getStatus: (agentId: SessionId) => Promise<RemoteResult<AutoApprovalStatus>>
  getHistory: (agentId: SessionId) => Promise<RemoteResult<DecisionRecord[]>>
  setEnabled: (agentId: SessionId, enabled: boolean) => Promise<RemoteResult<AutoApprovalStatus>>
}

/** Required services: the seat's slot registry and the Client Remote mount. */
export const inject = ['slots', 'remote']

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
export async function apply(ctx: ClientContext): Promise<void> {
  // Mount the host's autoApprovalStatus remote before anything can call it.
  await ctx.remote.$mount(TYPERT_REMOTE)
  const statusRemote = ctx.get('remote.autoApprovalStatus') as AutoApprovalRemoteNamespace

  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'auto-approval-status',
    order: 0,
    inject: (sessionId: SessionId): AutoApprovalChipInjected => ({
      getStatus: () => statusRemote.getStatus(sessionId),
      getHistory: () => statusRemote.getHistory(sessionId),
      setEnabled: (enabled: boolean) => statusRemote.setEnabled(sessionId, enabled),
    }),
  }, AutoApprovalChip))
}
