/**
 * Strict Typert host manifest for the auto-approval remote.
 *
 * The upstream build generates this artifact (`typert.host.js`) via
 * `@deepseek-ai/dsh-typert-generator`; this standalone repo hand-writes it
 * because the remote is a small hand-curated surface and the generator is a
 * whole-workspace analyzer.
 *
 * WHY a strict manifest instead of SRC fallback: the gateway's SRC fallback
 * discovers `@Remote` methods through the `remoteMethods` marker WeakMap — a
 * module-level table that must be the SAME `@deepseek-ai/dsh-typert-protocol`
 * instance in the plugin and the runtime. An out-of-tree plugin bundles its
 * own npm copy (rc.3), while the 08-12 final runtime uses its own workspace
 * copy, so the marker never crosses that boundary (dual-package hazard). The
 * strict manifest is registered into `ctx.typert` (the runtime's own registry)
 * and makes the gateway dispatch through the strict descriptor path, which
 * reads the instance-level `typertRemote` binding + service name — no shared
 * module state.
 *
 * The wire schema MUST stay in lockstep with:
 * - `AutoApprovalStatusService` methods (this package's `remote.ts`), and
 * - the client companion's `dsh-client-ui-auto-approval/src/client/remote.ts`.
 */
import { z } from 'zod';
/** Wire snapshot of the auto-approval runtime state (mirror of `AutoApprovalStatus`). */
const statusSchema = z.object({
    enabled: z.boolean().readonly(),
    denyPatterns: z.number().readonly(),
    askPatterns: z.number().readonly(),
    autoApproveTools: z.number().readonly(),
    classifier: z.string().readonly(),
    denials: z.number().readonly(),
    approvals: z.number().readonly(),
    totalDenials: z.number().readonly(),
});
/** Wire record of one auto-approval decision (mirror of `DecisionRecord`). */
const decisionRecordSchema = z.object({
    time: z.string().readonly(),
    tool: z.string().readonly(),
    stage: z.string().readonly(),
    decision: z.enum(['allow', 'deny']).readonly(),
    pattern: z.string().readonly().optional(),
    detail: z.string().readonly().optional(),
});
/** Wire identity of the `agent` lookup parameter (SessionId, a branded string). */
const sessionIdSchema = z.intersection(z.string(), z.unknown());
/** Agent lookup parameter shared by every remote method. */
const agentParameter = {
    name: 'agent',
    wire: 'agentId',
    source: 'lookup',
    lookup: 'agent',
    codec: {
        mode: 'strict',
        typeSymbol: '@deepseek-ai/dsh-session/types#SessionId',
        schema: sessionIdSchema,
    },
};
/** The three Remote invocations, hand-written to match the generated descriptor shape. */
const descriptors = [
    {
        id: 'dsh-auto-approval#autoApprovalStatus/getStatus',
        service: 'autoApprovalStatus',
        namespace: 'autoApprovalStatus',
        method: 'getStatus',
        invocation: { kind: 'direct' },
        scope: { context: 'agent', wire: 'agentId' },
        parameters: [agentParameter],
        result: {
            mode: 'strict',
            typeSymbol: 'dsh-auto-approval#AutoApprovalStatus',
            schema: statusSchema,
        },
    },
    {
        id: 'dsh-auto-approval#autoApprovalStatus/getHistory',
        service: 'autoApprovalStatus',
        namespace: 'autoApprovalStatus',
        method: 'getHistory',
        invocation: { kind: 'direct' },
        scope: { context: 'agent', wire: 'agentId' },
        parameters: [agentParameter],
        result: {
            mode: 'strict',
            typeSymbol: 'dsh-auto-approval#DecisionRecord[]',
            schema: z.array(decisionRecordSchema).readonly(),
        },
    },
    {
        id: 'dsh-auto-approval#autoApprovalStatus/setEnabled',
        service: 'autoApprovalStatus',
        namespace: 'autoApprovalStatus',
        method: 'setEnabled',
        invocation: { kind: 'direct' },
        scope: { context: 'agent', wire: 'agentId' },
        parameters: [
            agentParameter,
            {
                name: 'enabled',
                wire: 'enabled',
                source: 'json',
                codec: {
                    mode: 'strict',
                    typeSymbol: 'boolean',
                    schema: z.boolean().readonly(),
                },
            },
        ],
        result: {
            mode: 'strict',
            typeSymbol: 'dsh-auto-approval#AutoApprovalStatus',
            schema: statusSchema,
        },
    },
];
/**
 * Host-face Typert contribution, registered into `ctx.typert` so the gateway
 * serves `autoApprovalStatus/*` from the strict descriptor table.
 * `schemas`/`model` are empty: the registry only consumes them for reflection
 * tooling, and this plugin exposes no public schemas or model surface.
 */
export const remoteManifest = {
    package: 'dsh-auto-approval',
    face: 'host',
    schemas: [],
    model: { services: [], events: [], objects: [] },
    invocations: descriptors,
};
//# sourceMappingURL=remote-manifest.js.map