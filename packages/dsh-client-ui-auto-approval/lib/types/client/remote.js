import { booleanSchema, decisionListSchema, sessionIdSchema, statusSchema, } from "./schema.js";
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
/**
 * The generated Host-for-Client contribution, mounted by the client half via
 * `ctx.remote.$mount(TYPERT_REMOTE)`.
 */
export const TYPERT_REMOTE = {
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
                schema: decisionListSchema,
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
                        schema: booleanSchema,
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
};
export default TYPERT_REMOTE;
//# sourceMappingURL=remote.js.map