/**
 * Hand-rolled strict wire schemas for the client half.
 *
 * The Typert strict codec only needs `{ parse(value) }` (`TypertSchema` in
 * `@deepseek-ai/dsh-typert-protocol`), so the browser bundle validates with
 * these tiny parsers instead of bundling zod. Zod's feature detection calls
 * `new Function("")`, which both bloats the client bundle (~150 kB) and trips
 * static "dynamic code execution" scanners on published plugin sources.
 *
 * The shapes MUST stay in lockstep with the host service
 * (`packages/dsh-auto-approval/src/remote.ts`) and its strict manifest
 * (`packages/dsh-auto-approval/src/remote-manifest.ts`).
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Minimal runtime-schema capability carried by strict Typert codecs. */
export interface WireSchema<Output> {
  parse(value: unknown): Output
}

/** Wire snapshot of the host auto-approval runtime state. */
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

/** Wire record of one auto-approval decision. */
export interface DecisionRecord {
  readonly time: string
  readonly tool: string
  readonly stage: string
  readonly decision: 'allow' | 'deny'
  readonly pattern?: string
  readonly detail?: string
}

/** Reject one malformed boundary value with the offending field name. */
function invalid(what: string): never {
  throw new Error(`auto-approval wire: invalid ${what}`)
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(what)
  return value as Record<string, unknown>
}

function asString(value: unknown, what: string): string {
  if (typeof value !== 'string') invalid(what)
  return value as string
}

function asNumber(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(what)
  return value as number
}

function asBoolean(value: unknown, what: string): boolean {
  if (typeof value !== 'boolean') invalid(what)
  return value as boolean
}

/** Strict schema for `autoApprovalStatus.getStatus` / `setEnabled` results. */
export const statusSchema: WireSchema<AutoApprovalStatus> = {
  parse(value) {
    const row = asRecord(value, 'AutoApprovalStatus')
    return Object.freeze({
      enabled: asBoolean(row['enabled'], 'AutoApprovalStatus.enabled'),
      denyPatterns: asNumber(row['denyPatterns'], 'AutoApprovalStatus.denyPatterns'),
      askPatterns: asNumber(row['askPatterns'], 'AutoApprovalStatus.askPatterns'),
      autoApproveTools: asNumber(row['autoApproveTools'], 'AutoApprovalStatus.autoApproveTools'),
      classifier: asString(row['classifier'], 'AutoApprovalStatus.classifier'),
      denials: asNumber(row['denials'], 'AutoApprovalStatus.denials'),
      approvals: asNumber(row['approvals'], 'AutoApprovalStatus.approvals'),
      totalDenials: asNumber(row['totalDenials'], 'AutoApprovalStatus.totalDenials'),
    })
  },
}

/** Strict schema for one decision record. */
export const decisionRecordSchema: WireSchema<DecisionRecord> = {
  parse(value) {
    const row = asRecord(value, 'DecisionRecord')
    const decision = asString(row['decision'], 'DecisionRecord.decision')
    if (decision !== 'allow' && decision !== 'deny') invalid('DecisionRecord.decision')
    return Object.freeze({
      time: asString(row['time'], 'DecisionRecord.time'),
      tool: asString(row['tool'], 'DecisionRecord.tool'),
      stage: asString(row['stage'], 'DecisionRecord.stage'),
      decision,
      ...row['pattern'] === undefined ? {} : { pattern: asString(row['pattern'], 'DecisionRecord.pattern') },
      ...row['detail'] === undefined ? {} : { detail: asString(row['detail'], 'DecisionRecord.detail') },
    })
  },
}

/** Strict schema for the decision-record array returned by `getHistory`. */
export const decisionListSchema: WireSchema<readonly DecisionRecord[]> = {
  parse(value) {
    if (!Array.isArray(value)) invalid('DecisionRecord[]')
    return Object.freeze((value as unknown[]).map(entry => decisionRecordSchema.parse(entry)))
  },
}

/** Strict schema for the `agent` lookup value (a branded SessionId string). */
export const sessionIdSchema: WireSchema<SessionId> = {
  parse(value) {
    return asString(value, 'agentId') as SessionId
  },
}

/** Strict schema for the boolean `setEnabled` parameter. */
export const booleanSchema: WireSchema<boolean> = {
  parse(value) {
    return asBoolean(value, 'enabled')
  },
}
