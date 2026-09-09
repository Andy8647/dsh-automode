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
import type { SessionId } from '@deepseek-ai/dsh-session/types';
/** Minimal runtime-schema capability carried by strict Typert codecs. */
export interface WireSchema<Output> {
    parse(value: unknown): Output;
}
/** Wire snapshot of the host auto-approval runtime state. */
export interface AutoApprovalStatus {
    readonly enabled: boolean;
    readonly denyPatterns: number;
    readonly askPatterns: number;
    readonly autoApproveTools: number;
    readonly classifier: string;
    readonly denials: number;
    readonly approvals: number;
    readonly totalDenials: number;
}
/** Wire record of one auto-approval decision. */
export interface DecisionRecord {
    readonly time: string;
    readonly tool: string;
    readonly stage: string;
    readonly decision: 'allow' | 'deny';
    readonly pattern?: string;
    readonly detail?: string;
}
/** Strict schema for `autoApprovalStatus.getStatus` / `setEnabled` results. */
export declare const statusSchema: WireSchema<AutoApprovalStatus>;
/** Strict schema for one decision record. */
export declare const decisionRecordSchema: WireSchema<DecisionRecord>;
/** Strict schema for the decision-record array returned by `getHistory`. */
export declare const decisionListSchema: WireSchema<readonly DecisionRecord[]>;
/** Strict schema for the `agent` lookup value (a branded SessionId string). */
export declare const sessionIdSchema: WireSchema<SessionId>;
/** Strict schema for the boolean `setEnabled` parameter. */
export declare const booleanSchema: WireSchema<boolean>;
//# sourceMappingURL=schema.d.ts.map