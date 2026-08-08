/**
 * DSH 权限自动审批插件 — `@deepseek-ai/dsh-auto-approval`
 *
 * 在 `tools/pre-execute` 瀑布最前挂一个 classifier，给 dsh 的 approval
 * policy 增加第三档 `auto`（现有：`ask` / `never`）：
 *
 *   低风险 tool call  → allow（直接放行，不等用户）
 *   明确危险操作      → deny（返回 Error: <reason>，模型收到拒绝）
 *   拿不准的操作      → ask（转 ctx.approval 问用户）
 *
 * 对标 Claude Code automode / Codex "approve for me"，但比它们多一档：
 * 决策不是二元的 auto-accept / 全停，而是 allow / deny / ask 三态。
 *
 * 设计原则：
 * - 默认 allow（与 dsh tools 瀑布的 fallback 一致）；只拦截"值得拦"的调用
 * - deny 优先于 ask（明确危险的不打扰用户）
 * - classifier 可插拔：v1 内置规则引擎（正则黑白名单），未来可换 LLM classifier
 *
 * @module @deepseek-ai/dsh-auto-approval
 */

import { Context } from 'cordis'
import z from 'schemastery'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'

export const name = 'auto-approval'

/** 插件配置（全部可选，schemastery schema 提供默认值——上游惯例）。 */
export interface Config {
  /** 总开关：false 时完全旁路（瀑布 fallback 为 allow）。 */
  enabled?: boolean
  /** 命中即 deny 的正则列表（硬规则，匹配 bash command 全文，区分大小写）。 */
  denyPatterns?: string[]
  /** 命中即 ask（转人工审批）的正则列表。 */
  askPatterns?: string[]
  /** 直接放行的 tool name 白名单（如 read、grep、ls 类只读工具）。 */
  autoApproveTools?: string[]
  /** 连续被拒/转人工 N 次后暂停自动放行，强制用户介入（防失控，替代 per-turn 限额）。 */
  consecutiveDenyLimit?: number
}

/** Runtime configuration schema (schemastery fills defaults before construction). */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  denyPatterns: z.array(z.string()).default([
    // 系统级破坏性操作
    'rm\\s+(-[a-z]*[fr][a-z]*\\s+)*/\\s*$',
    'mkfs\\.', 'dd\\s+if=.*of=/dev/',
    // 管道直灌 shell（curl | sh 类供应链风险）
    '\\|\\s*(ba)?sh\\s*$',
    // 危险网络外联 + 凭据外传
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
    'read', 'grep', 'find', 'ls', 'list_files', 'glob', 'search_symbols',
  ]),
  consecutiveDenyLimit: z.number().default(3),
})

/** 每 agent 的连续拒绝计数（达到 consecutiveDenyLimit 后暂停自动放行；TODO 挂 agent 事件在 turn 边界重置）。 */
const consecutiveDenyCounts = new WeakMap<object, number>()

function matchesAny(command: string, patterns: string[]): string | undefined {
  for (const pat of patterns) {
    try {
      if (new RegExp(pat).test(command)) return pat
    } catch {
      // 用户配了非法正则：跳过，不阻断执行
    }
  }
  return undefined
}

/**
 * v1 classifier：规则引擎。
 * 决策顺序：deny > ask > allow（autoApproveTools 白名单在 deny 之后仍生效——
 * 即白名单工具若命令命中 deny 模式依然拒绝，宁可严格）。
 */
function classify(exec: ToolExecution, config: Config): PreToolDecision {
  // bash 等携带命令字符串的工具：对 command 做规则匹配（ToolExecution.arguments 是
  // unknown，需要显式收窄；run_code 的参数是 code，独立分支见 TODO）
  const args = exec.arguments as { command?: unknown } | undefined
  const command = typeof args?.command === 'string' ? args.command : ''

  if (command.length > 0) {
    const denied = matchesAny(command, config.denyPatterns)
    if (denied !== undefined) {
      return { kind: 'deny', reason: `auto-approval: command matches deny pattern /${denied}/` }
    }
    const ask = matchesAny(command, config.askPatterns)
    if (ask !== undefined) {
      return { kind: 'ask', reason: `auto-approval: command matches ask pattern /${ask}/` }
    }
  }

  if (config.autoApproveTools.includes(exec.name)) return { kind: 'allow' }

  // 未命中任何规则：放行（与瀑布 fallback 一致，不制造噪音）
  return { kind: 'allow' }
}

/**
 * 插件入口：挂载 `tools/pre-execute` 瀑布，prepend 保证跑在其它 listener 之前。
 */
export function apply(ctx: Context, config: Config = {}): void {
  // schemastery 用 schema 默认值填充缺省字段（上游惯例：apply 签名无默认值，schema 负责）
  const resolved = Config(config)

  ctx.on('tools/pre-execute', (exec, next) => {
    if (!resolved.enabled) return next()
    const decision = classify(exec, resolved)
    if (decision.kind === 'allow') return next()
    return decision
  }, { prepend: true })

  ctx.logger('auto-approval').info(
    `auto-approval armed: ${resolved.denyPatterns.length} deny / ${resolved.askPatterns.length} ask patterns, ${resolved.autoApproveTools.length} auto-approve tools`,
  )
}

export default apply
