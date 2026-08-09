/**
 * L0 规则引擎：预编译正则的匹配原语、tool call 的文本提取，以及单调
 * deny guard（M3）的纯逻辑。全部同步、无状态，便于单测。
 * @module @deepseek-ai/dsh-auto-approval/rules
 */
/** 返回第一个命中的正则下标，未命中返回 undefined。 */
export function matchFirst(text, patterns) {
    for (let index = 0; index < patterns.length; index++) {
        const pattern = patterns[index];
        if (pattern !== undefined && pattern.test(text))
            return { index };
    }
    return undefined;
}
/**
 * 提取 tool call 里要做规则匹配的文本：bash 类的 `command`，或 Code Mode
 * `run_code` 的 `code`。其它参数形态不做 L0 匹配（交给 L1 / 人工）。
 * `ToolExecution.arguments` 是 unknown，必须显式收窄。
 */
export function extractMatchableText(args) {
    if (typeof args !== 'object' || args === null)
        return undefined;
    const record = args;
    if (typeof record.command === 'string')
        return record.command;
    if (typeof record.code === 'string')
        return record.code;
    return undefined;
}
/**
 * bash 命令前缀白名单：command 以任一前缀开头且不含 shell 元字符时放行。
 * 元字符排除是安全底线——`ls | rm`、`ls > f`、`ls; rm`、`$(...)` 都不是
 * 纯只读调用，即使前缀匹配也拒绝。前缀要求词边界（`less` 不会命中 `ls`）。
 */
const SHELL_META = /[|<>;&`$\n]/;
export function matchBashPrefix(command, prefixes) {
    if (command === undefined || prefixes.length === 0)
        return false;
    if (SHELL_META.test(command))
        return false;
    const trimmed = command.trim();
    return prefixes.some(prefix => {
        const candidate = prefix.trim();
        if (candidate.length === 0)
            return false;
        return trimmed === candidate || trimmed.startsWith(`${candidate} `);
    });
}
/**
 * M5：检测 sandbox escalation 请求。`sandbox_permissions` 与 `justification`
 * 按上游 `validateEscalationArgs` 的约定成对出现；成对存在时本插件跳过
 * ask 规则与 L1（直接 allow），把审批留给 escalation 自己的通道，避免
 * 双重审批。L0 deny 不受此豁免影响（在调用方保证顺序）。
 */
export function hasEscalationArgs(args) {
    if (typeof args !== 'object' || args === null)
        return false;
    const record = args;
    return record.sandbox_permissions !== undefined && record.justification !== undefined;
}
/** deny 返回给模型的通用文案：不含命中规则（M2），但把模型行为收窄成确定动作。
 * 旧文案「choose a safer alternative or ask」是开放决策——v4-flash 面对"为什么被拒
 * （不可知）+ 替代方案（可能不存在）"会陷入长时间 reasoning；改为直接报告+询问，
 * 模型无需自行规划。 */
export const DENY_REASON = 'auto-approval: this call was denied by the auto-approval security policy. ' +
    'Do not retry it or attempt an alternative. Report the denial to the user and ask how to proceed.';
/** ask 转人工的通用文案：不含命中规则（M2）。 */
export const ASK_REASON = 'auto-approval: this call requires manual approval.';
/**
 * M3：由 L0 deny 规则构造单调 guard。guard 在所有 `tools/pre-execute`
 * listener 之后、tool body 之前执行，只能 deny 不能 allow——即使另一个
 * prepend 插件把我们的瀑布 listener 旁路掉，L0 硬底线依然生效。
 * @param getConfig - 解析后配置的 thunk（正则已预编译）；每次调用重读，
 *   settings 热更新即时生效。
 * @returns 可直接传给 `ctx.tools.guard()` 的同步 guard。
 */
export function createDenyGuard(getConfig) {
    return (execution) => {
        const config = getConfig();
        if (!config.enabled)
            return undefined;
        const text = extractMatchableText(execution.arguments);
        if (text === undefined)
            return undefined;
        return matchFirst(text, config.deny) === undefined ? undefined : DENY_REASON;
    };
}
//# sourceMappingURL=rules.js.map