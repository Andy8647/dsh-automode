import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { DenialTracker } from '../src/tracker.ts'
import type { AgentLike } from '../src/tracker.ts'

function fakeAgent(events: SessionEvent[] = []): AgentLike & { events: SessionEvent[] } {
  return { session: { events }, events }
}

function turnStart(turn: number): SessionEvent {
  return { type: 'turn/start', seq: 0, time: Date.now(), data: { turn } } as SessionEvent
}

describe('DenialTracker（M6 防失控）', () => {
  it('连续 deny 达到上限即 paused', () => {
    const tracker = new DenialTracker(3)
    const agent = fakeAgent()
    expect(tracker.isPaused(agent)).toBe(false)
    tracker.recordDenial(agent)
    tracker.recordDenial(agent)
    expect(tracker.isPaused(agent)).toBe(false)
    tracker.recordDenial(agent)
    expect(tracker.isPaused(agent)).toBe(true)
  })

  it('新 turn 的 turn/start 事件重置计数', () => {
    const tracker = new DenialTracker(2)
    const agent = fakeAgent([turnStart(1)])
    tracker.recordDenial(agent)
    tracker.recordDenial(agent)
    expect(tracker.isPaused(agent)).toBe(true)
    // turn 2 开始：log 追加 turn/start，计数清零
    agent.events.push(turnStart(2))
    expect(tracker.isPaused(agent)).toBe(false)
    tracker.recordDenial(agent)
    expect(tracker.isPaused(agent)).toBe(false)
  })

  it('游标增量扫描：同一 turn 内追加的其它事件不影响计数', () => {
    const tracker = new DenialTracker(2)
    const agent = fakeAgent([turnStart(1)])
    tracker.recordDenial(agent)
    agent.events.push({ type: 'assistant/chunk', seq: 1, time: Date.now(), data: { turn: 1, step: 1, chunk: { type: 'usage', usage: {} } } } as unknown as SessionEvent)
    expect(tracker.isPaused(agent)).toBe(false)
    tracker.recordDenial(agent)
    expect(tracker.isPaused(agent)).toBe(true)
  })

  it('无 agent 的调用 fail-closed：不计数、永不 paused', () => {
    const tracker = new DenialTracker(1)
    tracker.recordDenial(undefined)
    tracker.recordDenial(undefined)
    expect(tracker.isPaused(undefined)).toBe(false)
  })
})
