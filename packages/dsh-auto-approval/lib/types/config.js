/**
 * 配置 schema 与 fail-loud 解析：schemastery 负责默认值，{@link resolveConfig}
 * 负责 schema 表达不了的校验（正则预编译、provider/model 成对、数值边界）。
 * 任何非法配置在插件加载时直接 throw，绝不在运行时静默降级（M1）。
 * @module @deepseek-ai/dsh-auto-approval/config
 */
import z from '@deepseek-ai/schemastery';
/** Runtime configuration schema (schemastery fills defaults before construction). */
export const Config = z.object({
    enabled: z.boolean().default(true),
    denyPatterns: z.array(z.string()).default([
        // 系统级破坏性操作
        'rm\\s+(-[a-z]*[fr][a-z]*\\s+)*/\\s*$',
        'mkfs\\.', 'dd\\s+if=.*of=/dev/', '>\\s*/dev/[a-zA-Z]+',
        // 管道直灌 shell（curl | sh 类供应链风险）
        'curl\\s+[^|]*\\|\\s*(ba)?sh',
        'wget\\s+[^|]*\\|\\s*(ba)?sh',
    ]),
    askPatterns: z.array(z.string()).default([
        // 写工作区外的系统路径
        'sudo\\s',
        '\\/etc\\/',
        '\\/usr\\/',
        '\\/var\\/',
        '\\/Library\\/',
        '\\/System\\/',
        'git\\s+push\\s+--force',
        'git\\s+reset\\s+--hard',
        'git\\s+clean\\s+-[a-z]*[fd][a-z]*',
        'drop\\s+table',
        'DROP\\s+TABLE',
    ]),
    autoApproveTools: z.array(z.string()).default([
        // 只读工具
        'read', 'read_image', 'grep', 'find', 'ls', 'list_files', 'glob', 'search_symbols',
        // 文件写入工具：写代码/改文件有独立审查（代码 review + 沙箱边界），AA 不重复检查
        'write', 'edit', 'str_replace_editor',
    ]),
    selfKillGuard: z.boolean().default(true),
    auditSessionEvents: z.boolean().default(false),
    bashCommandPrefixes: z.array(z.string()).default([]),
    consecutiveDenyLimit: z.number().step(1).min(1).default(3),
    classifierFastProvider: z.string(),
    classifierFastModel: z.string(),
    classifierDeepProvider: z.string(),
    classifierDeepModel: z.string(),
    classifierTimeoutMs: z.number().default(20_000),
    classifierGuidance: z.string(),
});
/** 预编译一组正则；任一非法即 throw（fail-loud，M1）。 */
function compilePatterns(kind, patterns) {
    return patterns.map((source) => {
        try {
            return new RegExp(source);
        }
        catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            throw new Error(`auto-approval: invalid ${kind} pattern ${JSON.stringify(source)}: ${detail}`);
        }
    });
}
/** 校验一对 provider/model 配置：要么都给且非空，要么都不给。 */
function resolveRoute(label, provider, model) {
    if (provider === undefined && model === undefined)
        return undefined;
    if (provider === undefined || model === undefined
        || provider.length === 0 || model.length === 0) {
        throw new Error(`auto-approval: ${label} provider and model must be supplied together as non-empty strings`);
    }
    return { provider, model };
}
/**
 * 解析并校验配置。schema 先填默认值，这里做 schema 表达不了的校验；
 * 任一违规 throw（插件加载失败优于运行时静默放行）。
 *
 * 语义变迁（全托管）：`askPatterns` 字段保留以兼容旧配置，但命中即
 * **deny**——插件初衷是无人介入的全托管，不确定的调用直接拒绝而非转
 * 人工。`ask` 在 resolved 里与 deny 同义，只保留列表独立以便审计区分来源。
 * @param config - Loader 或测试传入的原始配置。
 * @returns 不可变的解析后配置。
 */
export function resolveConfig(config = {}) {
    // schema 已填默认值；类型上字段仍可选（z<Config> 的输出类型），这里一次性
    // 收窄（与上游 "schema defaults + ?? narrows" 惯例同义，只是集中在一处）。
    const resolved = Config(config);
    const deny = compilePatterns('deny', resolved.denyPatterns);
    const ask = compilePatterns('ask', resolved.askPatterns);
    if (!Number.isInteger(resolved.consecutiveDenyLimit) || resolved.consecutiveDenyLimit < 1) {
        throw new Error('auto-approval: consecutiveDenyLimit must be a positive integer');
    }
    if (!Number.isFinite(resolved.classifierTimeoutMs) || resolved.classifierTimeoutMs <= 0) {
        throw new Error('auto-approval: classifierTimeoutMs must be a positive finite number');
    }
    const fast = resolveRoute('classifierFast', resolved.classifierFastProvider, resolved.classifierFastModel);
    const deep = resolveRoute('classifierDeep', resolved.classifierDeepProvider, resolved.classifierDeepModel);
    if (deep !== undefined && fast === undefined) {
        throw new Error('auto-approval: classifierDeep requires classifierFast (Stage 1 always runs before Stage 2)');
    }
    return {
        enabled: resolved.enabled,
        deny,
        denySources: resolved.denyPatterns,
        ask,
        askSources: resolved.askPatterns,
        autoApproveTools: new Set(resolved.autoApproveTools),
        bashCommandPrefixes: resolved.bashCommandPrefixes,
        consecutiveDenyLimit: resolved.consecutiveDenyLimit,
        selfKillGuard: resolved.selfKillGuard,
        auditSessionEvents: resolved.auditSessionEvents,
        ...fast === undefined ? {} : {
            classifier: {
                fast,
                deep: deep ?? fast,
                timeoutMs: resolved.classifierTimeoutMs,
                ...resolved.classifierGuidance === undefined ? {} : { guidance: resolved.classifierGuidance },
            },
        },
    };
}
//# sourceMappingURL=config.js.map