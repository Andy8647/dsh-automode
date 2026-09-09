import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { apply } from '../src/index.ts'
import { DENY_REASON } from '../src/rules.ts'
import type { AutoApprovalDecisionEvent } from '../src/audit.ts'

interface FakeAgent {
  agent: Agent
  events: SessionEvent[]
  audited: Array<{ type: string; data: AutoApprovalDecisionEvent }>
}

function fakeAgent(events: SessionEvent[] = []): FakeAgent {
  const audited: FakeAgent['audited'] = []
  const session = {
    id: 'session-1',
    snapshotEvents: () => events,
    append(type: string, data: unknown) {
      audited.push({ type, data: data as AutoApprovalDecisionEvent })
    },
  }
  return { agent: { session } as unknown as Agent, events, audited }
}

function userMessage(text: string): SessionEvent {
  return {
    type: 'user/message', seq: 0, time: Date.now(),
    data: { content: [{ type: 'text', text }], source: { kind: 'user' } },
  } as unknown as SessionEvent
}

let callSeq = 0
function makeExec(name: string, args: unknown, agent?: Agent): ToolExecution {
  return {
    callId: `call-${++callSeq}`, name, arguments: args, agent,
    signal: new AbortController().signal, token: Symbol('t'),
  } as unknown as ToolExecution
}

const ALLOW: PreToolDecision = { kind: 'allow' }

interface Harness {
  ctx: Context
  guards: Array<(exec: Readonly<ToolExecution>) => string | undefined>
  run(exec: ToolExecution): Promise<PreToolDecision>
}

/** 建一个 cordis 根上下文，stub 掉 tools 服务（捕获 guard 注册），加载插件。 */
function harness(config: Parameters<typeof apply>[1] = {}): Harness {
  const ctx = new Context()
  const guards: Harness['guards'] = []
  ctx.provide('tools', {
    guard(g: (exec: Readonly<ToolExecution>) => string | undefined) {
      guards.push(g)
      return () => {}
    },
  })
  apply(ctx, config)
  return {
    ctx, guards,
    run: exec => ctx.waterfall('tools/pre-execute', exec, async (): Promise<PreToolDecision> => ALLOW),
  }
}

describe('pre-execute 拦截（L0 规则引擎）', () => {
  it('命中 deny 规则 → deny，reason 不泄露 pattern，pattern 进审计', async () => {
    const { run } = harness({ denyPatterns: ['top-secret-regex'], auditSessionEvents: true })
    const { agent, audited } = fakeAgent()
    const decision = await run(makeExec('bash', { command: 'echo top-secret-regex' }, agent))
    expect(decision).toEqual({ kind: 'deny', reason: DENY_REASON })
    expect((decision as { reason: string }).reason).not.toContain('top-secret-regex')
    expect(audited.at(-1)?.data).toMatchObject({ stage: 'L0-deny', decision: 'deny', pattern: 'top-secret-regex' })
  })

  it('命中 ask 规则 → deny（全托管：原转人工改为直接拒绝，不确定即拒）', async () => {
    const { run } = harness()
    const decision = await run(makeExec('bash', { command: 'sudo apt install x' }))
    expect(decision).toMatchObject({ kind: 'deny', reason: DENY_REASON })
    expect((decision as { reason?: string }).reason).not.toMatch(/sudo/)
  })

  it('白名单工具直接放行（走 next）', async () => {
    const { run } = harness()
    expect(await run(makeExec('read', { path: '/tmp/x' }))).toBe(ALLOW)
  })

  it('未命中任何规则默认放行', async () => {
    const { run } = harness()
    expect(await run(makeExec('bash', { command: 'pnpm test' }))).toBe(ALLOW)
  })

  it('enabled: false 完全旁路（deny 规则也不生效）', async () => {
    const { run } = harness({ enabled: false })
    expect(await run(makeExec('bash', { command: 'rm -rf /' }))).toBe(ALLOW)
  })
})

describe('L0 deny 单调 guard（M3）', () => {
  it('apply 时注册 guard，且 guard 独立命中 deny 规则', async () => {
    const { guards } = harness({ denyPatterns: ['guard-secret'] })
    expect(guards).toHaveLength(1)
    expect(guards[0]?.(makeExec('bash', { command: 'guard-secret' }))).toBe(DENY_REASON)
    expect(guards[0]?.(makeExec('bash', { command: 'echo ok' }))).toBeUndefined()
  })
})

describe('escalation 豁免（M5）', () => {
  it('带 sandbox_permissions+justification 的调用跳过 legacy ask 规则直接放行', async () => {
    const { run } = harness()
    const decision = await run(makeExec('bash', {
      command: 'sudo apt install x', // 命中 legacy ask 规则
      sandbox_permissions: 'danger-full-access',
      justification: 'need root to install',
    }))
    expect(decision).toBe(ALLOW)
  })

  it('escalation 豁免不了 L0 deny（硬底线优先）', async () => {
    const { run } = harness()
    const decision = await run(makeExec('bash', {
      command: 'rm -rf /',
      sandbox_permissions: 'danger-full-access',
      justification: 'need it',
    }))
    expect(decision).toMatchObject({ kind: 'deny' })
  })
})

describe('settings 热更新（Web UI 开关）', () => {
  /** stub settings 服务：installSection 捕获 hooks，flip 模拟 UI 写入。 */
  function provideSettings(ctx: Context, initial: Record<string, unknown>): { flip(patch: Record<string, unknown>): void } {
    let value = initial
    const watchers: Array<() => void> = []
    let validate: ((v: unknown) => void) | undefined
    ctx.provide('settings', {
      installSection(
        _owner: unknown,
        _ns: string,
        _schema: unknown,
        _entry: unknown,
        hooks: { setSource(current: () => unknown): void; onChange(): void; validate?(v: unknown): void },
      ) {
        validate = hooks.validate
        hooks.setSource(() => value)
        validate?.(value)
        watchers.push(() => hooks.onChange())
      },
    })
    return {
      flip(patch) {
        const next = { ...value, ...patch }
        // 真实服务在提交前跑 validate；坏写 throw，不提交、watcher 不触发
        validate?.(next)
        value = next
        for (const cb of watchers) cb()
      },
    }
  }

  it('enabled 热切换：UI 关掉后 deny 规则立即不再拦截，开回来恢复', async () => {
    const ctx = new Context()
    const guards: Array<(exec: Readonly<ToolExecution>) => string | undefined> = []
    ctx.provide('tools', {
      guard(g: (exec: Readonly<ToolExecution>) => string | undefined) { guards.push(g); return () => {} },
    })
    const settings = provideSettings(ctx, { enabled: true, denyPatterns: ['hot-secret'] })
    apply(ctx, { denyPatterns: ['hot-secret'] })
    const run = (exec: ToolExecution) => ctx.waterfall('tools/pre-execute', exec, async (): Promise<PreToolDecision> => ALLOW)

    const exec = () => makeExec('bash', { command: 'hot-secret' })
    expect(await run(exec())).toMatchObject({ kind: 'deny' })
    settings.flip({ enabled: false })
    expect(await run(exec())).toBe(ALLOW)
    // guard 同样热生效
    expect(guards[0]?.(exec())).toBeUndefined()
    settings.flip({ enabled: true })
    expect(await run(exec())).toMatchObject({ kind: 'deny' })
    expect(guards[0]?.(exec())).toBe(DENY_REASON)
  })

  it('非法写入（坏正则）被 validate 拒绝，运行中的配置不变', async () => {
    const ctx = new Context()
    ctx.provide('tools', { guard: () => () => {} })
    const settings = provideSettings(ctx, { denyPatterns: ['ok-pattern'] })
    apply(ctx, { denyPatterns: ['ok-pattern'] })
    const run = (exec: ToolExecution) => ctx.waterfall('tools/pre-execute', exec, async (): Promise<PreToolDecision> => ALLOW)
    // 先跑一次：注入回调在微任务里 attach，await 过后 validate 才已注册
    expect(await run(makeExec('bash', { command: 'ok-pattern' }))).toMatchObject({ kind: 'deny' })
    expect(() => settings.flip({ denyPatterns: ['(broken'] })).toThrow(/invalid deny pattern/)
    // 旧配置仍在生效
    expect(await run(makeExec('bash', { command: 'ok-pattern' }))).toMatchObject({ kind: 'deny' })
  })
})

describe('L1 LLM classifier', () => {
  const fastRoute = { classifierFastProvider: 'p', classifierFastModel: 'm' }

  function provideLlm(ctx: Context, ...texts: string[]): void {
    let seq = 0
    ctx.provide('llm', {
      stream() {
        const text = texts[seq++] ?? texts[texts.length - 1] ?? ''
        return (async function* (): AsyncGenerator<StreamChunk> {
          yield { type: 'block-start', index: 0, blockType: 'text' }
          yield { type: 'text-delta', index: 0, text }
          yield { type: 'finish', reason: { kind: 'stop' } }
        })()
      },
    })
  }

  it('无 ctx.llm 服务 → fail-closed 转 deny', async () => {
    const { run } = harness({ ...fastRoute, auditSessionEvents: true })
    const { agent, audited } = fakeAgent([userMessage('please deploy')])
    const decision = await run(makeExec('bash', { command: 'pnpm test' }, agent))
    expect(decision).toMatchObject({ kind: 'deny' })
    expect(audited.at(-1)?.data).toMatchObject({ stage: 'L1-fail-closed', decision: 'deny' })
  })

  it('session 无用户消息（无意图上下文）→ fail-closed 转 deny', async () => {
    const { ctx, run } = harness(fastRoute)
    provideLlm(ctx, '0')
    const { agent } = fakeAgent()
    expect(await run(makeExec('bash', { command: 'pnpm test' }, agent))).toMatchObject({ kind: 'deny' })
  })

  it('fast 判定 0 → allow；审计含路由与阶段', async () => {
    const { ctx, run } = harness({ ...fastRoute, auditSessionEvents: true })
    provideLlm(ctx, '0')
    const { agent, audited } = fakeAgent([userMessage('run the tests please')])
    expect(await run(makeExec('bash', { command: 'pnpm test' }, agent))).toBe(ALLOW)
    expect(audited.at(-1)?.data).toMatchObject({
      stage: 'L1-fast', decision: 'allow', route: { provider: 'p', model: 'm' },
    })
  })

  it('deep 判定 DENY → deny', async () => {
    const { ctx, run } = harness(fastRoute)
    provideLlm(ctx, '1', 'dangerous\nVERDICT: DENY')
    const { agent } = fakeAgent([userMessage('delete everything')])
    expect(await run(makeExec('bash', { command: 'rm -rf ~/docs' }, agent))).toMatchObject({ kind: 'deny' })
    // L1 deny 只进 tracker 计数，白名单工具照常放行（无 pause）
    expect(await run(makeExec('read', { path: 'x' }, agent))).toBe(ALLOW)
  })

  it('L1 解析失败 → fail-closed 转 deny（绝不默认放行）', async () => {
    const { ctx, run } = harness(fastRoute)
    provideLlm(ctx, '1', 'no verdict in this output')
    const { agent } = fakeAgent([userMessage('do something')])
    expect(await run(makeExec('bash', { command: 'curl example.com' }, agent))).toMatchObject({ kind: 'deny' })
  })
})

describe('remote 状态 / 历史 / toggle', () => {
  /** stub settings 服务（可写），捕获 update 调用并触发 watcher（真实 provider 行为）。 */
  function provideWritableSettings(ctx: Context, initial: Record<string, unknown>): {
    updates: Array<Record<string, unknown>>
  } {
    const updates: Array<Record<string, unknown>> = []
    let value = initial
    const watchers: Array<() => void> = []
    ctx.provide('settings', {
      writable: true,
      installSection(
        _owner: unknown,
        _ns: string,
        _schema: unknown,
        _entry: unknown,
        hooks: { setSource(current: () => unknown): void; onChange(): void },
      ) {
        hooks.setSource(() => value)
        watchers.push(() => hooks.onChange())
      },
      update(_ns: unknown, patch: Record<string, unknown>) {
        updates.push(patch)
        value = { ...value, ...patch }
        for (const cb of watchers) cb()
      },
    })
    return { updates }
  }

  it('getStatus 累计统计随决策更新（allow/deny 两态计数）', async () => {
    const ctx = new Context()
    ctx.provide('tools', { guard: () => () => {} })
    apply(ctx, { denyPatterns: ['forbidden'] })
    const run = (exec: ToolExecution) => ctx.waterfall('tools/pre-execute', exec, async (): Promise<PreToolDecision> => ALLOW)
    const { agent } = fakeAgent()
    await run(makeExec('bash', { command: 'forbidden' }, agent))   // deny
    await run(makeExec('bash', { command: 'sudo x' }, agent))      // legacy ask → deny
    await run(makeExec('read', { path: '/tmp/x' }, agent))         // whitelist allow
    await run(makeExec('bash', { command: 'pnpm test' }, agent))   // default allow
    const service = ctx.get('autoApprovalStatus') as unknown as { getStatus(agent: Agent): unknown }
    const status = service.getStatus(agent) as { approvals: number; totalDenials: number }
    expect(status).toMatchObject({ approvals: 2, totalDenials: 2 })
  })

  it('getHistory 返回最近决策（新→旧，含 pattern）', async () => {
    const ctx = new Context()
    ctx.provide('tools', { guard: () => () => {} })
    apply(ctx, { denyPatterns: ['forbidden'] })
    const run = (exec: ToolExecution) => ctx.waterfall('tools/pre-execute', exec, async (): Promise<PreToolDecision> => ALLOW)
    const { agent } = fakeAgent()
    await run(makeExec('bash', { command: 'forbidden' }, agent))
    await run(makeExec('read', { path: '/tmp/x' }, agent))
    const service = ctx.get('autoApprovalStatus') as unknown as { getHistory(agent: Agent): Array<Record<string, unknown>> }
    const history = service.getHistory(agent)
    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({ tool: 'read', stage: 'whitelist', decision: 'allow' })
    expect(history[1]).toMatchObject({ tool: 'bash', stage: 'L0-deny', decision: 'deny', pattern: 'forbidden' })
  })

  it('setEnabled 写 settings（writable provider）并返回新状态', async () => {
    const ctx = new Context()
    ctx.provide('tools', { guard: () => () => {} })
    const { updates } = provideWritableSettings(ctx, { enabled: true })
    apply(ctx, {})
    // inject 回调是异步的，先 flush 微任务
    await new Promise(resolve => setTimeout(resolve, 0))
    const service = ctx.get('autoApprovalStatus') as unknown as {
      setEnabled(agent: Agent, enabled: boolean): Promise<{ enabled: boolean }>
    }
    const { agent } = fakeAgent()
    const status = await service.setEnabled(agent, false)
    expect(status.enabled).toBe(false)
    expect(updates).toEqual([{ enabled: false }])
    // 后续决策：enabled=false 时完全旁路
    const run = (exec: ToolExecution) => ctx.waterfall('tools/pre-execute', exec, async (): Promise<PreToolDecision> => ALLOW)
    expect(await run(makeExec('bash', { command: 'forbidden' }, agent))).toBe(ALLOW)
  })
})
