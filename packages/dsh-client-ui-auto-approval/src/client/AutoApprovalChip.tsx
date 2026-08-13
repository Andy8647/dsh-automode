/**
 * Composer status chip for the auto-approval runtime. Reads the host state via
 * the injected `getStatus` remote call and renders an official Pill: a
 * token-colored state dot plus a short state word, with cumulative stats in
 * the hover Tooltip.
 *
 * Clicking the chip opens the official Modal showing:
 * - the on/off toggle (drives the host `setEnabled` remote, persisted via
 *   settings when available);
 * - cumulative counts (approved / denied);
 * - the recent decisions table (time, tool, stage, verdict, matched
 *   pattern / rationale).
 *
 * Theming: every color resolves through `--dsw-alias-*` semantic tokens
 * (`--dsw-static-*` only where no alias exists), which `ui-theme` redefines
 * under `body[data-ds-dark-theme]` — dark/light switching is automatic.
 * Official components (Pill / Tooltip / Modal) ride the platform
 * module table, so no CSS-module pipeline is needed here; locally composed
 * parts (stat tiles, table, dot) use inline styles over the same tokens.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Modal, Pill, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
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

/**
 * Width/space overrides for the official Modal: the figma dialog is
 * min(380px, 100%) wide (cramps the toggle row and truncates the decision
 * table) and the official body carries a 20px top margin (extra whitespace
 * under the title). We keep every official behavior (mask, blur, Escape,
 * portal, aria) and only adjust chrome via classes injected below — no
 * !important on layout-critical properties beyond these two overrides.
 */
const DIALOG_WIDTH_CSS = `
.aa-modal-wide { width: min(660px, 100%) !important; }
.aa-modal-flush > *:last-child { margin-top: 0 !important; }
`

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

/** Cumulative counts as a compact "✓ n · ✗ n" line for the tooltip. */
function countLine(status: AutoApprovalStatus): string {
  return `✓ ${status.approvals} approved · ✗ ${status.totalDenials} denied`
}

/** From "provider/model" take the model segment (keeps the tooltip short). */
function shortModel(classifier: string): string {
  const slash = classifier.lastIndexOf('/')
  return slash >= 0 ? classifier.slice(slash + 1) : classifier
}

/** One-line tooltip: concise armed state + cumulative counts (full config lives in the dialog). */
function describe(status: AutoApprovalStatus): string {
  const counts = countLine(status)
  if (!status.enabled) return `auto-approval off — ${counts}`
  const parts = [
    `${status.denyPatterns + status.askPatterns} rules`,
    status.classifier === 'disabled' ? 'no review model' : `model ${shortModel(status.classifier)}`,
    counts,
  ]
  if (status.paused) parts.push('paused')
  return `auto-approval on — ${parts.join(' · ')}`
}

/* ------------------------------------------------------------------ */
/* Decision table pieces                                               */
/* ------------------------------------------------------------------ */

const CELL: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 12,
  lineHeight: '18px',
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

/** Verdict label: colored by the official state-token pair (allow/deny only). */
function VerdictBadge({ decision }: { decision: DecisionRecord['decision'] }): ReactNode {
  const color = decision === 'allow' ? SUCCESS : ERROR
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
        ...CELL, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: LABEL_SECONDARY,
      }} title={record.stage}>
        {record.stage}
      </td>
      <td style={CELL}><VerdictBadge decision={record.decision} /></td>
      <td style={{
        ...CELL, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: LABEL_SECONDARY,
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
/* Config summary (dialog)                                             */
/* ------------------------------------------------------------------ */

/** Formatted armed-config rows: plain-language labels, no internal jargon. */
function ConfigSummary({ status }: { status: AutoApprovalStatus }): ReactNode {
  const rows: Array<[string, string]> = [
    ['Safety rules', `${status.denyPatterns + status.askPatterns}`],
    ['Review model', status.classifier === 'disabled' ? 'off' : shortModel(status.classifier)],
    ['Trusted tools', `${status.autoApproveTools}`],
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 12 }}>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', gap: 10, fontSize: 12, lineHeight: '18px' }}>
          <span style={{ width: 92, flexShrink: 0, color: LABEL_CAPTION }}>{label}</span>
          <span style={{ color: LABEL_SECONDARY }}>{value}</span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Switch + status tag                                                 */
/* ------------------------------------------------------------------ */

/** Minimal switch (track + thumb), styled with the official alias tokens. */
function Switch({ checked, disabled, onChange, label }: {
  checked: boolean
  disabled?: boolean
  onChange: () => void
  label: string
}): ReactNode {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      style={{
        position: 'relative',
        width: 40,
        height: 22,
        flexShrink: 0,
        borderRadius: 11,
        border: 'none',
        padding: 0,
        cursor: disabled ? 'default' : 'pointer',
        background: checked ? SUCCESS : BORDER_L2,
        opacity: disabled ? 0.6 : 1,
        transition: 'background 150ms',
      }}
    >
      <span style={{
        position: 'absolute',
        top: 3,
        left: checked ? 21 : 3,
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: 'var(--dsw-alias-label-primary)',
        transition: 'left 150ms',
      }} />
    </button>
  )
}

/** Status tag in the official plugin-list configTag style. */
function StatusTag({ enabled }: { enabled: boolean }): ReactNode {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      minHeight: 20,
      borderRadius: 5,
      padding: '1px 6px',
      background: enabled
        ? 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent)'
        : 'var(--dsw-alias-bg-layer-1)',
      color: enabled ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-secondary)',
      fontSize: 11,
      lineHeight: '16px',
      whiteSpace: 'nowrap',
    }}>
      {enabled ? 'Enabled' : 'Disabled'}
    </span>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusTag enabled={status.enabled} />
          </div>
          <div style={{ fontSize: 12, lineHeight: '18px', color: LABEL_SECONDARY, marginTop: 6 }}>
            {status.enabled
              ? 'Safe calls run automatically; dangerous ones are blocked.'
              : 'All calls go through the normal approval flow.'}
          </div>
        </div>
        <Switch
          checked={status.enabled}
          disabled={toggling}
          onChange={onToggle}
          label={status.enabled ? 'Turn off auto-approval' : 'Turn on auto-approval'}
        />
      </div>

      {/* Config summary */}
      <ConfigSummary status={status} />

      {/* Paused notice */}
      {status.paused && (
        <div style={{ marginTop: 10, fontSize: 12, lineHeight: '18px', color: WARN }}>
          Paused: deny limit reached this turn — calls are denied until the next turn.
        </div>
      )}

      {/* Cumulative counts */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <StatTile label="Approved" value={status.approvals} color={SUCCESS} />
        <StatTile label="Denied" value={status.totalDenials} color={ERROR} />
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
      {/* One-time global width override for the official Modal dialog. */}
      <style>{DIALOG_WIDTH_CSS}</style>
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
        className="aa-modal-wide"
        contentClassName="aa-modal-flush"
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
