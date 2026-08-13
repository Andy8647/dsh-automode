/**
 * Composer status chip for the auto-approval runtime. Reads the host state via
 * the injected `getStatus` remote call and renders an official Pill: a
 * token-colored state dot plus a short state word, with cumulative stats in
 * the hover Tooltip.
 *
 * Clicking the chip opens the official Modal showing:
 * - the on/off toggle (drives the host `setEnabled` remote, persisted via
 *   settings when available);
 * - cumulative counts (approved / denied / asked);
 * - the recent decisions table (time, tool, stage, verdict, matched
 *   pattern / rationale).
 *
 * Theming: every color resolves through `--dsw-alias-*` semantic tokens
 * (`--dsw-static-*` only where no alias exists), which `ui-theme` redefines
 * under `body[data-ds-dark-theme]` — dark/light switching is automatic.
 * Official components (Pill / Tooltip / Modal / Button) ride the platform
 * module table, so no CSS-module pipeline is needed here; locally composed
 * parts (stat tiles, table, dot) use inline styles over the same tokens.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Modal, Pill, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
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

/* ------------------------------------------------------------------ */
/* Official design tokens (alias layer: theme switching is automatic). */
/* ------------------------------------------------------------------ */

const SUCCESS = 'var(--dsw-alias-state-success-primary)'
const ERROR = 'var(--dsw-alias-state-error-primary)'
const WARN = 'var(--dsw-alias-state-warn-primary)'
const LABEL_PRIMARY = 'var(--dsw-alias-label-primary)'
const LABEL_SECONDARY = 'var(--dsw-alias-label-secondary)'
const LABEL_CAPTION = 'var(--dsw-alias-label-caption)'
const BORDER_L1 = 'var(--dsw-alias-border-l1)'
const BORDER_L2 = 'var(--dsw-alias-border-l2)'
const BG_LAYER_2 = 'var(--dsw-alias-bg-layer-2)'
const BG_LAYER_3 = 'var(--dsw-alias-bg-layer-3)'
const MONO_FONT = 'var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace)'

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

/** Cumulative counts as a compact "✓ n · ✗ n · ? n" line for the tooltip. */
function countLine(status: AutoApprovalStatus): string {
  return `✓ ${status.approvals} approved · ✗ ${status.totalDenials} denied · ? ${status.asks} asked`
}

/** Armed-config summary (no counts; the dialog shows those as tiles). */
function summaryLine(status: AutoApprovalStatus): string {
  const parts = [
    `L0: ${status.denyPatterns} deny / ${status.askPatterns} ask patterns`,
    `${status.autoApproveTools} auto-approve tools`,
    status.classifier === 'disabled' ? 'L1 off' : `L1 ${status.classifier}`,
  ]
  return parts.join(' · ')
}

/** One human-readable tooltip line: config summary + cumulative stats. */
function describe(status: AutoApprovalStatus): string {
  if (!status.enabled) return `auto-approval disabled — ${countLine(status)}`
  const parts = [summaryLine(status), countLine(status)]
  if (status.paused) parts.push('paused (deny limit reached)')
  if (status.denials > 0) parts.push(`${status.denials} denial(s) this turn`)
  return `auto-approval armed — ${parts.join(' · ')}`
}

/* ------------------------------------------------------------------ */
/* Decision table pieces                                               */
/* ------------------------------------------------------------------ */

const CELL: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 11,
  lineHeight: '16px',
  textAlign: 'left',
  verticalAlign: 'top',
}

const HEADER_CELL: React.CSSProperties = {
  ...CELL,
  fontWeight: 600,
  color: LABEL_SECONDARY,
  borderBottom: `1px solid ${BORDER_L2}`,
  // Sticky header stays readable while the table body scrolls; the fill must
  // be opaque or scrolled rows would bleed through.
  position: 'sticky',
  top: 0,
  background: BG_LAYER_2,
}

/** Verdict label: colored by the official state-token triad. */
function VerdictBadge({ decision }: { decision: DecisionRecord['decision'] }): ReactNode {
  const color = decision === 'allow' ? SUCCESS : decision === 'deny' ? ERROR : WARN
  return <span style={{ color, fontWeight: 600, whiteSpace: 'nowrap' }}>{decision}</span>
}

function DecisionRow({ record }: { readonly record: DecisionRecord }): ReactNode {
  const detail = record.pattern !== undefined ? `pattern /${record.pattern}/` : (record.detail ?? '')
  const time = new Date(record.time)
  const timeText = Number.isNaN(time.getTime())
    ? record.time
    : time.toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return (
    <tr style={{ borderTop: `1px solid ${BORDER_L1}` }}>
      <td style={{ ...CELL, whiteSpace: 'nowrap', color: LABEL_CAPTION, fontFamily: MONO_FONT }}>{timeText}</td>
      <td style={{ ...CELL, whiteSpace: 'nowrap', color: LABEL_PRIMARY, fontFamily: MONO_FONT }}>{record.tool}</td>
      <td style={{
        ...CELL, maxWidth: 92, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: LABEL_SECONDARY,
      }} title={record.stage}>
        {record.stage}
      </td>
      <td style={CELL}><VerdictBadge decision={record.decision} /></td>
      <td style={{
        ...CELL, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: LABEL_SECONDARY,
      }} title={detail}>
        {detail}
      </td>
    </tr>
  )
}

/* ------------------------------------------------------------------ */
/* Stat tile                                                           */
/* ------------------------------------------------------------------ */

/** Stat tile: raised surface (layer-3) on the layer-2 dialog card. */
function StatTile({ label, value, color }: { label: string; value: number; color: string }): ReactNode {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 2,
      padding: '10px 8px',
      borderRadius: 12,
      border: `1px solid ${BORDER_L1}`,
      background: BG_LAYER_3,
    }}>
      <span style={{ fontSize: 20, lineHeight: '24px', fontWeight: 600, color }}>{value}</span>
      <span style={{ fontSize: 11, lineHeight: '16px', color: LABEL_CAPTION }}>
        {label}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Dialog body                                                         */
/* ------------------------------------------------------------------ */

function DialogContent({
  status, history, toggling, error, onToggle,
}: {
  status: AutoApprovalStatus
  history: readonly DecisionRecord[]
  toggling: boolean
  error: string | undefined
  onToggle: () => void
}): ReactNode {
  return (
    <>
      {/* Toggle row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, lineHeight: '22px', fontWeight: 600, color: LABEL_PRIMARY }}>
            {status.enabled ? 'Enabled' : 'Disabled'}
          </div>
          <div style={{ fontSize: 12, lineHeight: '18px', color: LABEL_SECONDARY }}>
            {status.enabled
              ? 'Matching calls are auto-approved (L0 rules still hard-deny).'
              : 'All calls fall through to the normal approval flow.'}
          </div>
        </div>
        <Button
          variant={status.enabled ? 'outline' : 'primary'}
          size="sm"
          disabled={toggling}
          onClick={onToggle}
        >
          {status.enabled ? 'Turn off' : 'Turn on'}
        </Button>
      </div>

      {/* Paused notice */}
      {status.paused && (
        <div style={{ marginTop: 10, fontSize: 12, lineHeight: '18px', color: WARN }}>
          Paused: deny limit reached this turn — calls require manual approval.
        </div>
      )}

      {/* Cumulative counts */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <StatTile label="Approved" value={status.approvals} color={SUCCESS} />
        <StatTile label="Denied" value={status.totalDenials} color={ERROR} />
        <StatTile label="Asked" value={status.asks} color={WARN} />
      </div>

      {/* Recent decisions */}
      <div style={{ marginTop: 16, fontSize: 13, lineHeight: '20px', fontWeight: 600, color: LABEL_PRIMARY }}>
        Recent decisions
        {history.length > 0 && (
          <span style={{ fontSize: 11, fontWeight: 400, color: LABEL_CAPTION, marginLeft: 6 }}>
            {history.length} shown · newest first
          </span>
        )}
      </div>
      {history.length === 0
        ? (
          <div style={{ padding: '12px 0', fontSize: 12, lineHeight: '18px', color: LABEL_SECONDARY }}>
            No auto-approval decisions recorded for this session yet.
          </div>
        )
        : (
          // The official dialog is min(380px, 100%) wide; the table scrolls
          // vertically inside the card rather than stretching it.
          <div style={{ marginTop: 6, maxHeight: '38vh', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={HEADER_CELL}>Time</th>
                  <th style={HEADER_CELL}>Tool</th>
                  <th style={HEADER_CELL}>Stage</th>
                  <th style={HEADER_CELL}>Verdict</th>
                  <th style={HEADER_CELL}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {history.map((record, index) => <DecisionRow key={index} record={record} />)}
              </tbody>
            </table>
          </div>
        )}

      {error !== undefined && (
        <div style={{ marginTop: 10, fontSize: 12, lineHeight: '18px', color: ERROR }}>{error}</div>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Chip                                                                */
/* ------------------------------------------------------------------ */

/**
 * The status pill. It owns its polling and is intentionally silent on failure:
 * a failed remote read renders an error-colored "AA" with the error in the
 * tooltip rather than breaking the composer. Clicking opens the dialog
 * (toggle + history).
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

  let dot = LABEL_CAPTION
  let label = 'AA'
  let title = 'auto-approval'

  if (state.kind === 'loading') {
    dot = LABEL_CAPTION
    label = 'AA'
    title = 'auto-approval: loading…'
  } else if (state.kind === 'error') {
    dot = ERROR
    label = 'AA'
    title = `auto-approval: ${state.message}`
  } else if (!state.status.enabled) {
    dot = LABEL_CAPTION
    label = 'AA off'
    title = describe(state.status)
  } else if (state.status.paused) {
    dot = WARN
    label = 'AA paused'
    title = describe(state.status)
  } else {
    dot = SUCCESS
    label = state.status.denials > 0 ? `AA ·${state.status.denials}` : 'AA on'
    title = describe(state.status)
  }

  return (
    <>
      {/*
       * The Tooltip anchor must be a host element: Tooltip attaches its ref
       * via cloneElement, and the official Pill is a function component
       * without forwardRef — wrapping it in this span keeps the tooltip
       * working while Pill provides the official capsule visuals and hover.
       */}
      <Tooltip label={title} side="top" delayMs={300}>
        <span style={{ display: 'inline-flex' }}>
          <Pill onClick={() => setDialogOpen(true)} aria-label={title} aria-haspopup="dialog">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} aria-hidden />
            {label}
          </Pill>
        </span>
      </Tooltip>
      <Modal
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Auto-approval"
        {...state.kind === 'status' ? { description: summaryLine(state.status) } : {}}
      >
        {state.kind === 'status'
          ? (
            <DialogContent
              status={state.status}
              history={history}
              toggling={toggling}
              error={dialogError}
              onToggle={toggle}
            />
          )
          : (
            <div style={{ fontSize: 12, lineHeight: '18px', color: LABEL_SECONDARY }}>
              {state.kind === 'loading'
                ? 'Loading auto-approval status…'
                : `Status unavailable: ${state.message}`}
            </div>
          )}
      </Modal>
    </>
  )
}
