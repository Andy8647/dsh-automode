/**
 * L1 LLM classifier（意图对齐，对齐 Claude Code automode 的方案）：
 *
 * - **输入范围（防注入关键）**：只看用户消息 + 当前 tool call（工具名 +
 *   参数）。不看 assistant 推理/回复，不看任何 tool 输出——恶意指令大多
 *   从 tool 输出进入上下文，排除它们就是最有效的 prompt injection 防线。
 * - **两阶段**：Stage 1 fast 单 token 过滤（`0`=allow / 其余=flagged）；
 *   只有 flagged 的调用进 Stage 2 CoT 深查（末行 `VERDICT: ALLOW|DENY`）。
 * - **fail-closed**：超时、解析失败、模型不可用、意外 tool-call 输出——
 *   一律返回 fail-closed（调用方转 deny），绝不默认放行。
 *
 * 本模块不碰 cordis：`llm` 以最小结构类型注入，测试可直接 stub。
 * @module dsh-auto-approval/classifier
 */
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { ModelRoute, ResolvedClassifierConfig } from './config.ts';
/** ctx.llm 的最小结构类型（真实 LlmService 可赋入，测试可 stub）。 */
export interface LlmLike {
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
/** 一次 L1 判定的输入。intent 即最近的用户消息文本（调用方负责提取）。 */
export interface ClassifierInput {
    readonly intent: string;
    readonly toolName: string;
    readonly args: unknown;
    readonly sessionId?: GenerateOptions['sessionId'];
    readonly signal?: AbortSignal;
}
export type ClassifierOutcome = 
/** Stage 1 直接放行。 */
{
    readonly status: 'allow';
    readonly stage: 'L1-fast';
    readonly route: ModelRoute;
    readonly latencyMs: number;
}
/** Stage 2 二态结论（rationale 进审计，不回模型）。全托管无 ask：不确定即 DENY。 */
 | {
    readonly status: 'allow' | 'deny';
    readonly stage: 'L1-deep';
    readonly route: ModelRoute;
    readonly latencyMs: number;
    readonly rationale: string;
}
/** 任一阶段的失败：超时/解析失败/模型异常。调用方必须转 deny（全托管 fail-closed 即拒）。 */
 | {
    readonly status: 'fail-closed';
    readonly stage: 'L1-fast' | 'L1-deep';
    readonly error: string;
};
/**
 * 跑 L1 两阶段判定。任何异常（含超时、解析失败）归一为 fail-closed 结果，
 * 绝不向上抛——审批路径不允许 classifier 的异常打断 tool 流水线。
 */
export declare function classifyL1(llm: LlmLike, config: ResolvedClassifierConfig, input: ClassifierInput): Promise<ClassifierOutcome>;
//# sourceMappingURL=classifier.d.ts.map