/**
 * Composer status chip for the auto-approval runtime. Reads the host state via
 * the injected `getStatus` remote call and renders a compact pill: a color-coded
 * dot plus a short state word, with cumulative stats in the hover tooltip.
 *
 * Clicking the chip opens a dialog (portaled overlay, inline styles) showing:
 * - the on/off toggle (drives the host `setEnabled` remote, persisted via
 *   settings when available);
 * - cumulative counts (approved / denied / asked);
 * - a scrollable table of the recent decisions (time, tool, stage, verdict,
 *   matched pattern / rationale).
 *
 * Inline styles on purpose (no CSS-module dependency): the standalone client
 * bundle skips the upstream lightningcss pipeline. The overlay mirrors the
 * upstream Modal tokens (mask + centered card) without importing the modal's
 * CSS module.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (the input.left seat + SessionStandardProps).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { AutoApprovalChipInjected } from './index.ts'
import type { AutoApprovalStatus, DecisionRecord } from './remote.ts'

/** Full chip component props: the runtime standard kit + owner share + injected face. */
export type AutoApprovalChipProps = PropsRuntime<'conversation.input.left'> & InjectFace<AutoApprovalChipInjected>

/** Poll cadence while the chip stays mounted (no event forwarding for third-party remotes). */
const POLL_MS = 2000

type ChipState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'status'; readonly status: AutoApprovalStatus }

const DOT: React.CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: '50%',
  flexShrink: 0,
}

const PILL: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  height: 22,
  padding: '0 8px',
  borderRadius: 11,
  border: '1px solid var(--color-border, rgba(128,128,128,0.4))',
  background: 'var(--color-bg-subtle, transparent)',
  color: 'var(--color-text-secondary, inherit)',
  fontSize: 11,
  lineHeight: '22px',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  userSelect: 'none',
}

/** Cumulative counts as a compact "✓ n · ✗ n · ? n" line for the tooltip. */
function countLine(status: AutoApprovalStatus): string {
  return `✓ ${status.approvals} approved · ✗ ${status.totalDenials} denied · ? ${status.asks} asked`
}

/** One human-readable tooltip line: config summary + cumulative stats. */
function describe(status: AutoApprovalStatus): string {
  if (!status.enabled) return `auto-approval disabled — ${countLine(status)}`
  const parts = [
    `L0: ${status.denyPatterns} deny / ${status.askPatterns} ask`,
    `${status.autoApproveTools} auto-approve tools`,
    status.classifier === 'disabled' ? 'L1 off' : `L1 ${status.classifier}`,
    countLine(status),
  ]
  if (status.paused) parts.push('paused (deny limit reached)')
  if (status.denials > 0) parts.push(`${status.denials} denial(s) this turn`)
  return `auto-approval armed — ${parts.join(' · ')}`
}

/* ------------------------------------------------------------------ */
/* Dialog (portaled overlay, inline styles)                            */
/* ------------------------------------------------------------------ */

const OVERLAY: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background: 'rgba(0,0,0,0.35)',
}

const DIALOG: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: 560,
  maxWidth: '100%',
  maxHeight: '80vh',
  overflow: 'hidden',
  borderRadius: 16,
  border: '1px solid var(--color-border, rgba(128,128,128,0.4))',
  background: 'var(--color-bg, #fff)',
  boxShadow: '0 16px 48px rgba(0,0,0,0.25)',
}

const DIALOG_HEADER: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderBottom: '1px solid var(--color-border, rgba(128,128,128,0.25))',
}

const DIALOG_BODY: React.CSSProperties = {
  padding: 16,
  overflowY: 'auto',
}

/** Row of the recent-decisions table. */
interface DecisionRowProps {
  readonly record: DecisionRecord
}

const STAGE_COLORS: Record<string, string> = {
  'L0-deny': '#ef4444',
  'L0-selfkill': '#ef4444',
  'L1-deep': '#ef4444',
  'L0-ask': '#f59e0b',
  'L1-fast': '#22c55e',
  'whitelist': '#22c55e',
  'escalation-bypass': '#22c55e',
  'default-allow': '#22c55e',
  'L1-fail-closed': '#f59e0b',
  'paused': '#f59e0b',
}

/** Verdict badge: colored text chip matching the decision's meaning. */
function VerdictBadge({ decision }: { decision: DecisionRecord['decision'] }): ReactNode {
  const map: Record<DecisionRecord['decision'], { text: string; color: string }> = {
    allow: { text: 'allow', color: '#22c55e' },
    deny: { text: 'deny', color: '#ef4444' },
    ask: { text: 'ask', color: '#f59e0b' },
  }
  const { text, color } = map[decision]
  return (
    <span style={{ color, fontWeight: 600 }}>{text}</span>
  )
}

function DecisionRow({ record }: DecisionRowProps): ReactNode {
  const detail = record.pattern !== undefined ? `pattern /${record.pattern}/` : (record.detail ?? '')
  const time = new Date(record.time)
  const timeText = Number.isNaN(time.getTime())
    ? record.time
    : time.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const stageColor = STAGE_COLORS[record.stage] ?? undefined
  return (
    <tr style={{ borderTop: '1px solid var(--color-border, rgba(128,128,128,0.15))' }}>
      <td style={{ ...CELL, whiteSpace: 'nowrap', color: 'var(--color-text-secondary, inherit)' }}>{timeText}</td>
      <td style={{ ...CELL, fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>{record.tool}</td>
      <td style={{ ...CELL, whiteSpace: 'nowrap', ...(stageColor !== undefined ? { color: stageColor } : {}) }}>
        {record.stage}
      </td>
      <td style={CELL}><VerdictBadge decision={record.decision} /></td>
      <td style={{ ...CELL, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-secondary, inherit)' }} title={detail}>
        {detail}
      </td>
    </tr>
  )
}

const CELL: React.CSSProperties = {
  padding: '5px 8px',
  fontSize: 11,
  textAlign: 'left',
  verticalAlign: 'top',
}

/** Stat tile: a number with a colored label, used for the three cumulative counts. */
function StatTile({ label, value, color }: { label: string; value: number; color: string }): ReactNode {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 2,
      padding: '10px 8px',
      borderRadius: 10,
      border: '1px solid var(--color-border, rgba(128,128,128,0.25))',
      background: 'var(--color-bg-subtle, transparent)',
    }}>
      <span style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1.2 }}>{value}</span>
      <span style={{ fontSize: 10, color: 'var(--color-text-secondary, inherit)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </span>
    </div>
  )
}

/** Dialog body content: toggle row + stat tiles + decision table. */
function DialogContent({
  status, history, toggling, onToggle, onClose,
}: {
  status: AutoApprovalStatus
  history: readonly DecisionRecord[]
  toggling: boolean
  onToggle: () => void
  onClose: () => void
}): ReactNode {
  return (
    <>
      <div style={DIALOG_HEADER}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Auto-approval</span>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>
      <div style={DIALOG_BODY}>
        {/* Toggle row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {status.enabled ? 'Enabled' : 'Disabled'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary, inherit)' }}>
              {status.enabled
                ? 'Matching calls are auto-approved (L0 rules still hard-deny).'
                : 'All calls fall through to the normal approval flow.'}
            </div>
          </div>
          <Button
            variant={status.enabled ? 'primary' : 'outline'}
            size="sm"
            disabled={toggling}
            onClick={onToggle}
          >
            {status.enabled ? 'Turn off' : 'Turn on'}
          </Button>
        </div>

        {/* Cumulative counts */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <StatTile label="Approved" value={status.approvals} color="#22c55e" />
          <StatTile label="Denied" value={status.totalDenials} color="#ef4444" />
          <StatTile label="Asked" value={status.asks} color="#f59e0b" />
        </div>

        {/* Recent decisions table */}
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
          Recent decisions
          {history.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--color-text-secondary, inherit)', marginLeft: 6 }}>
              {history.length} shown (newest first)
            </span>
          )}
        </div>
        {history.length === 0
          ? (
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary, inherit)', padding: '12px 0' }}>
              No auto-approval decisions recorded for this session yet.
            </div>
          )
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ ...CELL, color: 'var(--color-text-secondary, inherit)', fontWeight: 600 }}>Time</th>
                  <th style={{ ...CELL, color: 'var(--color-text-secondary, inherit)', fontWeight: 600 }}>Tool</th>
                  <th style={{ ...CELL, color: 'var(--color-text-secondary, inherit)', fontWeight: 600 }}>Stage</th>
                  <th style={{ ...CELL, color: 'var(--color-text-secondary, inherit)', fontWeight: 600 }}>Verdict</th>
                  <th style={{ ...CELL, color: 'var(--color-text-secondary, inherit)', fontWeight: 600 }}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {history.map((record, index) => <DecisionRow key={index} record={record} />)}
              </tbody>
            </table>
          )}
      </div>
    </>
  )
}

/**
 * The status pill. It owns its polling and is intentionally silent on failure:
 * a failed remote read renders a red "AA" with the error in the tooltip rather
 * than breaking the composer. Clicking opens the dialog (toggle + history).
 */
export function AutoApprovalChip({ getStatus, getHistory, setEnabled }: AutoApprovalChipProps) {
  const [state, setState] = useState<ChipState>({ kind: 'loading' })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [history, setHistory] = useState<readonly DecisionRecord[]>([])
  const [toggling, setToggling] = useState(false)
  const [dialogError, setDialogError] = useState<string | undefined>(undefined)
  const alive = useRef(true)

  const pollStatus = useCallback((): void => {
    void getStatus().then(
      (result) => {
        if (!alive.current) return
        if (result.ok) setState({ kind: 'status', status: result.value })
        else setState({ kind: 'error', message: result.error.message })
      },
      (reason: unknown) => {
        if (!alive.current) return
        setState({ kind: 'error', message: reason instanceof Error ? reason.message : String(reason) })
      },
    )
  }, [getStatus])

  useEffect(() => {
    alive.current = true
    pollStatus()
    const timer = setInterval(pollStatus, POLL_MS)
    return () => {
      alive.current = false
      clearInterval(timer)
    }
  }, [pollStatus])

  // Refresh the decision history while the dialog is open (2s cadence, same as status).
  useEffect(() => {
    if (!dialogOpen) return
    let cancelled = false
    const refresh = (): void => {
      void getHistory().then(
        (result) => {
          if (cancelled) return
          if (result.ok) setHistory(result.value)
          else setDialogError(result.error.message)
        },
        (reason: unknown) => {
          if (cancelled) return
          setDialogError(reason instanceof Error ? reason.message : String(reason))
        },
      )
    }
    refresh()
    const timer = setInterval(refresh, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [dialogOpen, getHistory])

  // Close on Escape, mirroring the upstream Modal behavior.
  useEffect(() => {
    if (!dialogOpen) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setDialogOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [dialogOpen])

  const toggle = useCallback((): void => {
    if (toggling) return
    const current = state.kind === 'status' ? state.status.enabled : false
    setToggling(true)
    setDialogError(undefined)
    void setEnabled(!current).then(
      (result) => {
        if (!alive.current) return
        setToggling(false)
        if (result.ok) setState({ kind: 'status', status: result.value })
        else setDialogError(result.error.message)
      },
      (reason: unknown) => {
        if (!alive.current) return
        setToggling(false)
        setDialogError(reason instanceof Error ? reason.message : String(reason))
      },
    )
  }, [state, toggling, setEnabled])

  let dot = '#9ca3af'
  let label = 'AA'
  let title = 'auto-approval'

  if (state.kind === 'loading') {
    dot = '#9ca3af'
    label = 'AA'
    title = 'auto-approval: loading…'
  } else if (state.kind === 'error') {
    dot = '#ef4444'
    label = 'AA'
    title = `auto-approval: ${state.message}`
  } else if (!state.status.enabled) {
    dot = '#9ca3af'
    label = 'AA off'
    title = describe(state.status)
  } else if (state.status.paused) {
    dot = '#f59e0b'
    label = 'AA paused'
    title = describe(state.status)
  } else {
    dot = '#22c55e'
    label = state.status.denials > 0 ? `AA ·${state.status.denials}` : 'AA on'
    title = describe(state.status)
  }

  const chip = (
    <span
      style={PILL}
      title={title}
      aria-label={title}
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      onClick={() => setDialogOpen(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setDialogOpen(true)
        }
      }}
    >
      <span style={{ ...DOT, background: dot }} aria-hidden />
      {label}
    </span>
  )

  return (
    <>
      <Tooltip label={title} side="bottom" delayMs={300}>
        {chip}
      </Tooltip>
      {dialogOpen && state.kind === 'status' && createPortal(
        <div style={OVERLAY} onClick={() => setDialogOpen(false)}>
          <div style={DIALOG} role="dialog" aria-modal="true" aria-label="Auto-approval" onClick={(e) => e.stopPropagation()}>
            <DialogContent
              status={state.status}
              history={history}
              toggling={toggling}
              onToggle={toggle}
              onClose={() => setDialogOpen(false)}
            />
            {dialogError !== undefined && (
              <div style={{ padding: '0 16px 12px', fontSize: 11, color: '#ef4444' }}>{dialogError}</div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
