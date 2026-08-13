/**
 * Hand-written Typert Remote contribution for the host
 * `@deepseek-ai/dsh-auto-approval` service.
 *
 * The upstream build generates this artifact from the Host FaceModel
 * (`@deepseek-ai/dsh-typert-generator` → `typert.remote-client.js`); this
 * standalone repo hand-writes it because the remote is a single method and
 * the generator is a whole-workspace TypeScript analyzer.
 *
 * Two halves must stay in lockstep with the host service
 * (`@deepseek-ai/dsh-auto-approval/src/remote.ts`):
 * - the wire schema (zod, strict) must parse exactly what
 *   `AutoApprovalStatusService.getStatus` returns;
 * - the `TypertRemoteMap`/`TypertRemoteScopeMap` declaration merges type
 *   `ctx.remote.autoApprovalStatus.getStatus` on the client.
 *
 * The `agent` parameter is a Typert lookup (`TypertLookupMap['agent']` =
 * `TypertLookup<Agent, SessionId>`, registered by the core `agents` service),
 * so its wire field is `agentId` and the client passes a `SessionId`.
 */
import { z } from 'zod';
/** zod schema validating the host's `AutoApprovalStatus` at the wire boundary. */
const statusSchema = z.object({
    enabled: z.boolean().readonly(),
    denyPatterns: z.number().readonly(),
    askPatterns: z.number().readonly(),
    autoApproveTools: z.number().readonly(),
    classifier: z.string().readonly(),
    denials: z.number().readonly(),
    paused: z.boolean().readonly(),
});
/** Wire identity of the `agent` lookup parameter (SessionId, a branded string). */
const sessionIdSchema = z.intersection(z.string(), z.unknown());
/**
 * The generated Host-for-Client contribution, mounted by the client half via
 * `ctx.remote.$mount(TYPERT_REMOTE)`.
 */
export const TYPERT_REMOTE = {
    package: '@deepseek-ai/dsh-auto-approval',
    descriptors: [
        {
            id: '@deepseek-ai/dsh-auto-approval#autoApprovalStatus/getStatus',
            service: 'autoApprovalStatus',
            namespace: 'autoApprovalStatus',
            method: 'getStatus',
            invocation: { kind: 'direct' },
            scope: { context: 'agent', wire: 'agentId' },
            parameters: [
                {
                    name: 'agent',
                    wire: 'agentId',
                    source: 'lookup',
                    lookup: 'agent',
                    codec: {
                        mode: 'strict',
                        typeSymbol: '@deepseek-ai/dsh-session/types#SessionId',
                        schema: sessionIdSchema,
                    },
                },
            ],
            result: {
                mode: 'strict',
                typeSymbol: '@deepseek-ai/dsh-auto-approval#AutoApprovalStatus',
                schema: statusSchema,
            },
        },
    ],
};
export default TYPERT_REMOTE;
//# sourceMappingURL=remote.js.map