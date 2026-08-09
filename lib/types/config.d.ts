/**
 * 配置 schema 与 fail-loud 解析：schemastery 负责默认值，{@link resolveConfig}
 * 负责 schema 表达不了的校验（正则预编译、provider/model 成对、数值边界）。
 * 任何非法配置在插件加载时直接 throw，绝不在运行时静默降级（M1）。
 * @module @deepseek-ai/dsh-auto-approval/config
 */
import z from 'schemastery';
/** 插件配置（全部可选，schemastery schema 提供默认值——上游惯例）。 */
export interface Config {
    /** 总开关：false 时完全旁路（瀑布 fallback 为 allow）。 */
    enabled?: boolean;
    /** 命中即 deny 的正则列表（硬规则，匹配 command/code 全文，区分大小写）。 */
    denyPatterns?: string[];
    /** 命中即 ask（转人工审批）的正则列表。 */
    askPatterns?: string[];
    /** 直接放行的 tool name 白名单（如 read、grep、ls 类只读工具）。 */
    autoApproveTools?: string[];
    /**
     * bash 命令前缀白名单：`bash` tool 的命令以这些前缀开头且不含 shell 元字符
     * （`|` `>` `<` `;` `&` 反引号 `$(`）时直接放行，跳过 L1。
     * 白名单按 tool 名匹配，bash 子命令（ls/cat/pwd 等）无法被 autoApproveTools
     * 豁免，这是给只读 shell 命令的唯一免 L1 通道。
     */
    bashCommandPrefixes?: string[];
    /** 连续被 deny N 次后暂停自动放行，本 turn 内全部转人工（防失控）。 */
    consecutiveDenyLimit?: number;
    /** L1 Stage 1（fast 过滤）的 provider；须与 classifierFastModel 成对。 */
    classifierFastProvider?: string;
    /** L1 Stage 1（fast 过滤）的 model；设置后启用 L1。 */
    classifierFastModel?: string;
    /** L1 Stage 2（CoT 深查）的 provider；缺省沿用 fast。 */
    classifierDeepProvider?: string;
    /** L1 Stage 2（CoT 深查）的 model；缺省沿用 fast。 */
    classifierDeepModel?: string;
    /** L1 单次模型调用的超时（毫秒），超时 fail-closed 转 ask。 */
    classifierTimeoutMs?: number;
    /** 用户自定义判定准则，作为 guidance 注入 L1 prompt（不是硬规则）。 */
    classifierGuidance?: string;
}
/** Runtime configuration schema (schemastery fills defaults before construction). */
export declare const Config: z<Config>;
/** 一个具体的模型路由（ctx.llm 要求 provider + model 成对）。 */
export interface ModelRoute {
    readonly provider: string;
    readonly model: string;
}
/** L1 classifier 的解析后配置。 */
export interface ResolvedClassifierConfig {
    /** Stage 1 fast 单 token 过滤。 */
    readonly fast: ModelRoute;
    /** Stage 2 CoT 深查（缺省与 fast 相同）。 */
    readonly deep: ModelRoute;
    /** 单次模型调用超时（毫秒）。 */
    readonly timeoutMs: number;
    /** 用户 guidance 文本（注入 prompt，非硬规则）。 */
    readonly guidance?: string;
}
/**
 * apply() 实际使用的解析后配置：正则已预编译（M1）、路由已成对校验、
 * 白名单已 Set 化。命中的 pattern 原文保留在 {@link denySources} /
 * {@link askSources}（与编译结果同序），只进审计与日志，不进 deny/ask 的
 * reason（M2）。
 */
export interface ResolvedConfig {
    readonly enabled: boolean;
    readonly deny: readonly RegExp[];
    readonly denySources: readonly string[];
    readonly ask: readonly RegExp[];
    readonly askSources: readonly string[];
    readonly autoApproveTools: ReadonlySet<string>;
    /** bash 命令前缀白名单（前缀匹配 + 无 shell 元字符校验）。 */
    readonly bashCommandPrefixes: readonly string[];
    readonly consecutiveDenyLimit: number;
    /** 未配置 fast 路由时为 undefined（L1 关闭，L0 未命中即 allow）。 */
    readonly classifier?: ResolvedClassifierConfig;
}
/**
 * 解析并校验配置。schema 先填默认值，这里做 schema 表达不了的校验；
 * 任一违规 throw（插件加载失败优于运行时静默放行）。
 * @param config - Loader 或测试传入的原始配置。
 * @returns 不可变的解析后配置。
 */
export declare function resolveConfig(config?: Config): ResolvedConfig;
//# sourceMappingURL=config.d.ts.map