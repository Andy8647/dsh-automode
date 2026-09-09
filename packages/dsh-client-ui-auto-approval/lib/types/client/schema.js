/** Reject one malformed boundary value with the offending field name. */
function invalid(what) {
    throw new Error(`auto-approval wire: invalid ${what}`);
}
function asRecord(value, what) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        invalid(what);
    return value;
}
function asString(value, what) {
    if (typeof value !== 'string')
        invalid(what);
    return value;
}
function asNumber(value, what) {
    if (typeof value !== 'number' || !Number.isFinite(value))
        invalid(what);
    return value;
}
function asBoolean(value, what) {
    if (typeof value !== 'boolean')
        invalid(what);
    return value;
}
/** Strict schema for `autoApprovalStatus.getStatus` / `setEnabled` results. */
export const statusSchema = {
    parse(value) {
        const row = asRecord(value, 'AutoApprovalStatus');
        return Object.freeze({
            enabled: asBoolean(row['enabled'], 'AutoApprovalStatus.enabled'),
            denyPatterns: asNumber(row['denyPatterns'], 'AutoApprovalStatus.denyPatterns'),
            askPatterns: asNumber(row['askPatterns'], 'AutoApprovalStatus.askPatterns'),
            autoApproveTools: asNumber(row['autoApproveTools'], 'AutoApprovalStatus.autoApproveTools'),
            classifier: asString(row['classifier'], 'AutoApprovalStatus.classifier'),
            denials: asNumber(row['denials'], 'AutoApprovalStatus.denials'),
            approvals: asNumber(row['approvals'], 'AutoApprovalStatus.approvals'),
            totalDenials: asNumber(row['totalDenials'], 'AutoApprovalStatus.totalDenials'),
        });
    },
};
/** Strict schema for one decision record. */
export const decisionRecordSchema = {
    parse(value) {
        const row = asRecord(value, 'DecisionRecord');
        const decision = asString(row['decision'], 'DecisionRecord.decision');
        if (decision !== 'allow' && decision !== 'deny')
            invalid('DecisionRecord.decision');
        return Object.freeze({
            time: asString(row['time'], 'DecisionRecord.time'),
            tool: asString(row['tool'], 'DecisionRecord.tool'),
            stage: asString(row['stage'], 'DecisionRecord.stage'),
            decision,
            ...row['pattern'] === undefined ? {} : { pattern: asString(row['pattern'], 'DecisionRecord.pattern') },
            ...row['detail'] === undefined ? {} : { detail: asString(row['detail'], 'DecisionRecord.detail') },
        });
    },
};
/** Strict schema for the decision-record array returned by `getHistory`. */
export const decisionListSchema = {
    parse(value) {
        if (!Array.isArray(value))
            invalid('DecisionRecord[]');
        return Object.freeze(value.map(entry => decisionRecordSchema.parse(entry)));
    },
};
/** Strict schema for the `agent` lookup value (a branded SessionId string). */
export const sessionIdSchema = {
    parse(value) {
        return asString(value, 'agentId');
    },
};
/** Strict schema for the boolean `setEnabled` parameter. */
export const booleanSchema = {
    parse(value) {
        return asBoolean(value, 'enabled');
    },
};
//# sourceMappingURL=schema.js.map