/**
 * Hand-written Typert Remote contribution for the host
 * `dsh-auto-approval` service.
 *
 * The upstream build generates this artifact from the Host FaceModel
 * (`@deepseek-ai/dsh-typert-generator` → `typert.remote-client.js`); this
 * standalone repo hand-writes it because the remote is a small hand-curated
 * surface and the generator is a whole-workspace TypeScript analyzer.
 *
 * Two halves must stay in lockstep with the host service
 * (`dsh-auto-approval/src/remote.ts`):
 * - the wire schemas (zod, strict) must parse exactly what
 *   `AutoApprovalStatusService` returns;
 * - the `TypertRemoteMap`/`TypertRemoteScopeMap` declaration merges type
 *   `ctx.remote.autoApprovalStatus.*` on the client.
 *
 * The `agent` parameter is a Typert lookup (`TypertLookupMap['agent']` =
 * `TypertLookup<Agent, SessionId>`, registered by the core `agents` service),
 * so its wire field is `agentId` and the client passes a `SessionId`.
 */
import { z } from 'zod'
import type {
  RemoteResult,
  TypertRemoteContribution,
  TypertRemoteNamespace,
} from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'

/** Wire snapshot of the host auto-approval runtime state (mirror of host `AutoApprovalStatus`). */
export interface AutoApprovalStatus {
  readonly enabled: boolean
  readonly denyPatterns: number
  readonly askPatterns: number
  readonly autoApproveTools: number
  readonly classifier: string
  readonly denials: number
  readonly approvals: number
  readonly totalDenials: number
}

/** Wire record of one auto-approval decision (mirror of host `DecisionRecord`). */
export interface DecisionRecord {
  readonly time: string
  readonly tool: string
  readonly stage: string
  readonly decision: 'allow' | 'deny'
  readonly pattern?: string
  readonly detail?: string
}

/** zod schema validating the host's `AutoApprovalStatus` at the wire boundary. */
const statusSchema = z.object({
  enabled: z.boolean().readonly(),
  denyPatterns: z.number().readonly(),
  askPatterns: z.number().readonly(),
  autoApproveTools: z.number().readonly(),
  classifier: z.string().readonly(),
  denials: z.number().readonly(),
  approvals: z.number().readonly(),
  totalDenials: z.number().readonly(),
})

/** zod schema validating the host's `DecisionRecord` array at the wire boundary. */
const decisionRecordSchema = z.object({
  time: z.string().readonly(),
  tool: z.string().readonly(),
  stage: z.string().readonly(),
  decision: z.enum(['allow', 'deny']).readonly(),
  pattern: z.string().readonly().optional(),
  detail: z.string().readonly().optional(),
})

/** Wire identity of the `agent` lookup parameter (SessionId, a branded string). */
const sessionIdSchema = z.intersection(z.string(), z.unknown())

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
} as const

/**
 * The generated Host-for-Client contribution, mounted by the client half via
 * `ctx.remote.$mount(TYPERT_REMOTE)`.
 */
export const TYPERT_REMOTE: TypertRemoteContribution = {
  package: 'dsh-auto-approval',
  descriptors: [
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
  ],
}

export default TYPERT_REMOTE

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'autoApprovalStatus/getStatus': (agentId: SessionId) => Promise<RemoteResult<AutoApprovalStatus>>
    'autoApprovalStatus/getHistory': (agentId: SessionId) => Promise<RemoteResult<DecisionRecord[]>>
    'autoApprovalStatus/setEnabled': (agentId: SessionId, enabled: boolean) => Promise<RemoteResult<AutoApprovalStatus>>
  }
  interface TypertRemoteNamespaceMap {
    'autoApprovalStatus': TypertRemoteNamespace<'autoApprovalStatus'>
  }
  interface TypertRemoteScopeMap {
    'agent:autoApprovalStatus/getStatus': () => Promise<RemoteResult<AutoApprovalStatus>>
    'agent:autoApprovalStatus/getHistory': () => Promise<RemoteResult<DecisionRecord[]>>
    'agent:autoApprovalStatus/setEnabled': (enabled: boolean) => Promise<RemoteResult<AutoApprovalStatus>>
  }
}
