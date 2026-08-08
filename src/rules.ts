/**
 * L0 规则引擎：预编译正则的匹配原语、tool call 的文本提取，以及单调
 * deny guard（M3）的纯逻辑。全部同步、无状态，便于单测。
 * @module @deepseek-ai/dsh-auto-approval/rules
 */

import type { ToolExecution, ToolGuard } from '@deepseek-ai/dsh-tools'
import type { ResolvedConfig } from './config.ts'

/**
 * 一次命中：命中的正则下标（对应 ResolvedConfig.*Sources 取原文）。
 * pattern 原文只进审计/日志，不进返回给模型的 reason（M2）。
 */
export interface PatternHit {
  readonly index: number
}

/** 返回第一个命中的正则下标，未命中返回 undefined。 */
export function matchFirst(text: string, patterns: readonly RegExp[]): PatternHit | undefined {
  for (let index = 0; index < patterns.length; index++) {
    const pattern = patterns[index]
    if (pattern !== undefined && pattern.test(text)) return { index }
  }
  return undefined
}

/**
 * 提取 tool call 里要做规则匹配的文本：bash 类的 `command`，或 Code Mode
 * `run_code` 的 `code`。其它参数形态不做 L0 匹配（交给 L1 / 人工）。
 * `ToolExecution.arguments` 是 unknown，必须显式收窄。
 */
export function extractMatchableText(args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null) return undefined
  const record = args as Record<string, unknown>
  if (typeof record.command === 'string') return record.command
  if (typeof record.code === 'string') return record.code
  return undefined
}

/**
 * M5：检测 sandbox escalation 请求。`sandbox_permissions` 与 `justification`
 * 按上游 `validateEscalationArgs` 的约定成对出现；成对存在时本插件跳过
 * ask 规则与 L1（直接 allow），把审批留给 escalation 自己的通道，避免
 * 双重审批。L0 deny 不受此豁免影响（在调用方保证顺序）。
 */
export function hasEscalationArgs(args: unknown): boolean {
  if (typeof args !== 'object' || args === null) return false
  const record = args as Record<string, unknown>
  return record.sandbox_permissions !== undefined && record.justification !== undefined
}

/** deny 返回给模型的通用文案：不含命中规则（M2），但指导模型换安全做法。 */
export const DENY_REASON =
  'auto-approval: this call was denied by the auto-approval security policy. ' +
  'Do not retry the same action; choose a safer alternative or ask the user how to proceed.'

/** ask 转人工的通用文案：不含命中规则（M2）。 */
export const ASK_REASON = 'auto-approval: this call requires manual approval.'

/**
 * M3：由 L0 deny 规则构造单调 guard。guard 在所有 `tools/pre-execute`
 * listener 之后、tool body 之前执行，只能 deny 不能 allow——即使另一个
 * prepend 插件把我们的瀑布 listener 旁路掉，L0 硬底线依然生效。
 * @param getConfig - 解析后配置的 thunk（正则已预编译）；每次调用重读，
 *   settings 热更新即时生效。
 * @returns 可直接传给 `ctx.tools.guard()` 的同步 guard。
 */
export function createDenyGuard(getConfig: () => ResolvedConfig): ToolGuard {
  return (execution: Readonly<ToolExecution>): string | undefined => {
    const config = getConfig()
    if (!config.enabled) return undefined
    const text = extractMatchableText(execution.arguments)
    if (text === undefined) return undefined
    return matchFirst(text, config.deny) === undefined ? undefined : DENY_REASON
  }
}
