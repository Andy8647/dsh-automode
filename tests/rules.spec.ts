import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.ts'
import {
  ASK_REASON,
  createDenyGuard,
  DENY_REASON,
  extractMatchableText,
  hasEscalationArgs,
  matchBashPrefix,
  matchFirst,
} from '../src/rules.ts'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'

describe('resolveConfig（M1 fail-loud）', () => {
  it('非法 deny 正则在启动时直接 throw', () => {
    expect(() => resolveConfig({ denyPatterns: ['(unclosed'] })).toThrow(/invalid deny pattern/)
  })

  it('非法 ask 正则在启动时直接 throw', () => {
    expect(() => resolveConfig({ askPatterns: ['['] })).toThrow(/invalid ask pattern/)
  })

  it('provider/model 不成对即 throw', () => {
    expect(() => resolveConfig({ classifierFastModel: 'm' })).toThrow(/together/)
    expect(() => resolveConfig({ classifierFastProvider: 'p' })).toThrow(/together/)
  })

  it('deep 不能脱离 fast 单独配置', () => {
    expect(() => resolveConfig({
      classifierDeepProvider: 'p', classifierDeepModel: 'm',
    })).toThrow(/requires classifierFast/)
  })

  it('fast 配置后 deep 缺省沿用 fast', () => {
    const resolved = resolveConfig({ classifierFastProvider: 'p', classifierFastModel: 'm' })
    expect(resolved.classifier?.fast).toEqual({ provider: 'p', model: 'm' })
    expect(resolved.classifier?.deep).toEqual({ provider: 'p', model: 'm' })
  })

  it('未配置 fast 时 L1 关闭', () => {
    expect(resolveConfig({}).classifier).toBeUndefined()
  })
})

describe('matchFirst / extractMatchableText', () => {
  it('返回第一个命中的下标', () => {
    const patterns = [/foo/, /bar/]
    expect(matchFirst('xx bar yy', patterns)).toEqual({ index: 1 })
    expect(matchFirst('nothing', patterns)).toBeUndefined()
  })

  it('提取 command 或 code，其它形态返回 undefined', () => {
    expect(extractMatchableText({ command: 'ls' })).toBe('ls')
    expect(extractMatchableText({ code: 'print(1)' })).toBe('print(1)')
    expect(extractMatchableText({ path: '/tmp' })).toBeUndefined()
    expect(extractMatchableText('string')).toBeUndefined()
    expect(extractMatchableText(undefined)).toBeUndefined()
  })
})

describe('hasEscalationArgs（M5）', () => {
  it('sandbox_permissions + justification 成对出现才算', () => {
    expect(hasEscalationArgs({ sandbox_permissions: 'workspace-write', justification: 'need it' })).toBe(true)
    expect(hasEscalationArgs({ sandbox_permissions: 'workspace-write' })).toBe(false)
    expect(hasEscalationArgs({ justification: 'need it' })).toBe(false)
    expect(hasEscalationArgs({ command: 'ls' })).toBe(false)
  })
})

describe('matchBashPrefix（bash 命令前缀白名单）', () => {
  const ls = ['ls']

  it('精确命令与前缀 + 参数都命中', () => {
    expect(matchBashPrefix('ls', ls)).toBe(true)
    expect(matchBashPrefix('ls -la /tmp', ls)).toBe(true)
    expect(matchBashPrefix('  ls -la  ', ls)).toBe(true)
  })

  it('词边界：less 不命中 ls；git push 不命中 git status', () => {
    expect(matchBashPrefix('less big.log', ls)).toBe(false)
    expect(matchBashPrefix('git push', ['git status'])).toBe(false)
    expect(matchBashPrefix('git status --short', ['git status'])).toBe(true)
  })

  it('shell 元字符一律拒绝（管道/重定向/拼接/命令替换）', () => {
    expect(matchBashPrefix('ls | rm -rf /', ls)).toBe(false)
    expect(matchBashPrefix('ls > /tmp/out', ls)).toBe(false)
    expect(matchBashPrefix('ls; rm -rf /', ls)).toBe(false)
    expect(matchBashPrefix('ls &', ls)).toBe(false)
    expect(matchBashPrefix('ls $(echo x)', ls)).toBe(false)
    expect(matchBashPrefix('echo `whoami`', ['echo'])).toBe(false)
    expect(matchBashPrefix('ls\nrm -rf /', ls)).toBe(false)
  })

  it('无前缀列表或空命令不命中', () => {
    expect(matchBashPrefix('ls', [])).toBe(false)
    expect(matchBashPrefix(undefined, ls)).toBe(false)
    expect(matchBashPrefix('', ls)).toBe(false)
    expect(matchBashPrefix('ls', ['  '])).toBe(false)
  })
})

describe('createDenyGuard（M2/M3）', () => {
  const exec = (command: string): ToolExecution => ({
    callId: 'c1', name: 'bash', arguments: { command },
    signal: new AbortController().signal, token: Symbol('t'),
  }) as unknown as ToolExecution

  it('命中 deny 规则返回通用文案，且不包含 pattern', () => {
    const guard = createDenyGuard(() => resolveConfig({ denyPatterns: ['secret-pattern'] }))
    const reason = guard(exec('run secret-pattern now'))
    expect(reason).toBe(DENY_REASON)
    expect(reason).not.toContain('secret-pattern')
    expect(ASK_REASON).not.toMatch(/pattern/)
  })

  it('未命中返回 undefined（单调：guard 永远不能 allow）', () => {
    const guard = createDenyGuard(() => resolveConfig({ denyPatterns: ['secret-pattern'] }))
    expect(guard(exec('echo hello'))).toBeUndefined()
  })

  it('disabled 时不拦截', () => {
    const guard = createDenyGuard(() => resolveConfig({ enabled: false, denyPatterns: ['rm'] }))
    expect(guard(exec('rm -rf /'))).toBeUndefined()
  })
})
