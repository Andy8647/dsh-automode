import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
 * Official components (Pill / Tooltip / Modal / Button) ride the platform
 * module table, so no CSS-module pipeline is needed here; locally composed
 * parts (stat tiles, table, dot) use inline styles over the same tokens.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Modal, Pill, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
/** Poll cadence while the chip stays mounted (no event forwarding for third-party remotes). */
const POLL_MS = 2000;
/* ------------------------------------------------------------------ */
/* Official design tokens (alias layer: theme switching is automatic). */
/* ------------------------------------------------------------------ */
const SUCCESS = 'var(--dsw-alias-state-success-primary)';
const ERROR = 'var(--dsw-alias-state-error-primary)';
const WARN = 'var(--dsw-alias-state-warn-primary)';
const LABEL_PRIMARY = 'var(--dsw-alias-label-primary)';
const LABEL_SECONDARY = 'var(--dsw-alias-label-secondary)';
const LABEL_CAPTION = 'var(--dsw-alias-label-caption)';
const BORDER_L1 = 'var(--dsw-alias-border-l1)';
const BORDER_L2 = 'var(--dsw-alias-border-l2)';
const BG_LAYER_2 = 'var(--dsw-alias-bg-layer-2)';
const BG_LAYER_3 = 'var(--dsw-alias-bg-layer-3)';
const MONO_FONT = 'var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace)';
/**
 * Width override for the official Modal: the figma dialog is min(380px, 100%),
 * which cramps the toggle row (the "Turn off" label wraps) and truncates the
 * decision table. We keep every official behavior (mask, blur, Escape, portal,
 * aria) and only widen the card via a class injected below — no !important on
 * layout-critical properties, just the dialog width.
 */
const DIALOG_WIDTH_CSS = '.aa-modal-wide { width: min(660px, 100%) !important; }';
/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */
/** Cumulative counts as a compact "✓ n · ✗ n" line for the tooltip. */
function countLine(status) {
    return `✓ ${status.approvals} approved · ✗ ${status.totalDenials} denied`;
}
/** From "provider/model" take the model segment (keeps the tooltip short). */
function shortModel(classifier) {
    const slash = classifier.lastIndexOf('/');
    return slash >= 0 ? classifier.slice(slash + 1) : classifier;
}
/** One-line tooltip: concise armed state + cumulative counts (full config lives in the dialog). */
function describe(status) {
    const counts = countLine(status);
    if (!status.enabled)
        return `auto-approval off — ${counts}`;
    const parts = [
        `L0 ${status.denyPatterns + status.askPatterns} rules`,
        status.classifier === 'disabled' ? 'L1 off' : `L1 ${shortModel(status.classifier)}`,
        counts,
    ];
    if (status.paused)
        parts.push('paused');
    return `auto-approval on — ${parts.join(' · ')}`;
}
/* ------------------------------------------------------------------ */
/* Decision table pieces                                               */
/* ------------------------------------------------------------------ */
const CELL = {
    padding: '8px 10px',
    fontSize: 12,
    lineHeight: '18px',
    textAlign: 'left',
    verticalAlign: 'top',
};
const HEADER_CELL = {
    ...CELL,
    fontWeight: 600,
    color: LABEL_SECONDARY,
    borderBottom: `1px solid ${BORDER_L2}`,
    // Sticky header stays readable while the table body scrolls; the fill must
    // be opaque or scrolled rows would bleed through.
    position: 'sticky',
    top: 0,
    background: BG_LAYER_2,
};
/** Verdict label: colored by the official state-token pair (allow/deny only). */
function VerdictBadge({ decision }) {
    const color = decision === 'allow' ? SUCCESS : ERROR;
    return _jsx("span", { style: { color, fontWeight: 600, whiteSpace: 'nowrap' }, children: decision });
}
function DecisionRow({ record }) {
    const detail = record.pattern !== undefined ? `pattern /${record.pattern}/` : (record.detail ?? '');
    const time = new Date(record.time);
    const timeText = Number.isNaN(time.getTime())
        ? record.time
        : time.toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return (_jsxs("tr", { style: { borderTop: `1px solid ${BORDER_L1}` }, children: [_jsx("td", { style: { ...CELL, whiteSpace: 'nowrap', color: LABEL_CAPTION, fontFamily: MONO_FONT }, children: timeText }), _jsx("td", { style: { ...CELL, whiteSpace: 'nowrap', color: LABEL_PRIMARY, fontFamily: MONO_FONT }, children: record.tool }), _jsx("td", { style: {
                    ...CELL, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: LABEL_SECONDARY,
                }, title: record.stage, children: record.stage }), _jsx("td", { style: CELL, children: _jsx(VerdictBadge, { decision: record.decision }) }), _jsx("td", { style: {
                    ...CELL, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: LABEL_SECONDARY,
                }, title: detail, children: detail })] }));
}
/* ------------------------------------------------------------------ */
/* Stat tile                                                           */
/* ------------------------------------------------------------------ */
/** Stat tile: raised surface (layer-3) on the layer-2 dialog card. */
function StatTile({ label, value, color }) {
    return (_jsxs("div", { style: {
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            padding: '10px 8px',
            borderRadius: 12,
            border: `1px solid ${BORDER_L1}`,
            background: BG_LAYER_3,
        }, children: [_jsx("span", { style: { fontSize: 20, lineHeight: '24px', fontWeight: 600, color }, children: value }), _jsx("span", { style: { fontSize: 11, lineHeight: '16px', color: LABEL_CAPTION }, children: label })] }));
}
/* ------------------------------------------------------------------ */
/* Config summary (dialog)                                             */
/* ------------------------------------------------------------------ */
/** Formatted armed-config rows: label + value on their own line. */
function ConfigSummary({ status }) {
    const rows = [
        ['L0 rules', `${status.denyPatterns + status.askPatterns} (${status.denyPatterns} deny + ${status.askPatterns} legacy ask)`],
        ['L1 route', status.classifier === 'disabled' ? 'off' : status.classifier],
        ['Auto-approve', `${status.autoApproveTools} tools`],
    ];
    return (_jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 3, marginTop: 12 }, children: rows.map(([label, value]) => (_jsxs("div", { style: { display: 'flex', gap: 10, fontSize: 12, lineHeight: '18px' }, children: [_jsx("span", { style: { width: 92, flexShrink: 0, color: LABEL_CAPTION }, children: label }), _jsx("span", { style: { color: LABEL_SECONDARY }, children: value })] }, label))) }));
}
/* ------------------------------------------------------------------ */
/* Dialog body                                                         */
/* ------------------------------------------------------------------ */
function DialogContent({ status, history, toggling, error, onToggle, }) {
    return (_jsxs(_Fragment, { children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, children: [_jsxs("div", { style: { minWidth: 0 }, children: [_jsx("div", { style: { fontSize: 14, lineHeight: '22px', fontWeight: 600, color: LABEL_PRIMARY }, children: status.enabled ? 'Enabled' : 'Disabled' }), _jsx("div", { style: { fontSize: 12, lineHeight: '18px', color: LABEL_SECONDARY }, children: status.enabled
                                    ? 'Matching calls are auto-approved (L0 rules still hard-deny).'
                                    : 'All calls fall through to the normal approval flow.' })] }), _jsx(Button, { variant: status.enabled ? 'outline' : 'primary', size: "sm", disabled: toggling, onClick: onToggle, style: { flexShrink: 0, whiteSpace: 'nowrap' }, children: status.enabled ? 'Turn off' : 'Turn on' })] }), _jsx(ConfigSummary, { status: status }), status.paused && (_jsx("div", { style: { marginTop: 10, fontSize: 12, lineHeight: '18px', color: WARN }, children: "Paused: deny limit reached this turn \u2014 calls are denied until the next turn." })), _jsxs("div", { style: { display: 'flex', gap: 8, marginTop: 16 }, children: [_jsx(StatTile, { label: "Approved", value: status.approvals, color: SUCCESS }), _jsx(StatTile, { label: "Denied", value: status.totalDenials, color: ERROR })] }), _jsxs("div", { style: { marginTop: 16, fontSize: 13, lineHeight: '20px', fontWeight: 600, color: LABEL_PRIMARY }, children: ["Recent decisions", history.length > 0 && (_jsxs("span", { style: { fontSize: 11, fontWeight: 400, color: LABEL_CAPTION, marginLeft: 6 }, children: [history.length, " shown \u00B7 newest first"] }))] }), history.length === 0
                ? (_jsx("div", { style: { padding: '12px 0', fontSize: 12, lineHeight: '18px', color: LABEL_SECONDARY }, children: "No auto-approval decisions recorded for this session yet." }))
                : (
                // The official dialog is min(380px, 100%) wide; the table scrolls
                // vertically inside the card rather than stretching it.
                _jsx("div", { style: { marginTop: 6, maxHeight: '38vh', overflowY: 'auto' }, children: _jsxs("table", { style: { width: '100%', borderCollapse: 'collapse' }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: HEADER_CELL, children: "Time" }), _jsx("th", { style: HEADER_CELL, children: "Tool" }), _jsx("th", { style: HEADER_CELL, children: "Stage" }), _jsx("th", { style: HEADER_CELL, children: "Verdict" }), _jsx("th", { style: HEADER_CELL, children: "Detail" })] }) }), _jsx("tbody", { children: history.map((record, index) => _jsx(DecisionRow, { record: record }, index)) })] }) })), error !== undefined && (_jsx("div", { style: { marginTop: 10, fontSize: 12, lineHeight: '18px', color: ERROR }, children: error }))] }));
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
export function AutoApprovalChip({ getStatus, getHistory, setEnabled }) {
    const [state, setState] = useState({ kind: 'loading' });
    const [dialogOpen, setDialogOpen] = useState(false);
    const [history, setHistory] = useState([]);
    const [toggling, setToggling] = useState(false);
    const [dialogError, setDialogError] = useState(undefined);
    const alive = useRef(true);
    const pollStatus = useCallback(() => {
        void getStatus().then((result) => {
            if (!alive.current)
                return;
            if (result.ok)
                setState({ kind: 'status', status: result.value });
            else
                setState({ kind: 'error', message: result.error.message });
        }, (reason) => {
            if (!alive.current)
                return;
            setState({ kind: 'error', message: reason instanceof Error ? reason.message : String(reason) });
        });
    }, [getStatus]);
    useEffect(() => {
        alive.current = true;
        pollStatus();
        const timer = setInterval(pollStatus, POLL_MS);
        return () => {
            alive.current = false;
            clearInterval(timer);
        };
    }, [pollStatus]);
    // Refresh the decision history while the dialog is open (2s cadence, same as status).
    useEffect(() => {
        if (!dialogOpen)
            return;
        let cancelled = false;
        const refresh = () => {
            void getHistory().then((result) => {
                if (cancelled)
                    return;
                if (result.ok)
                    setHistory(result.value);
                else
                    setDialogError(result.error.message);
            }, (reason) => {
                if (cancelled)
                    return;
                setDialogError(reason instanceof Error ? reason.message : String(reason));
            });
        };
        refresh();
        const timer = setInterval(refresh, POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [dialogOpen, getHistory]);
    const toggle = useCallback(() => {
        if (toggling)
            return;
        const current = state.kind === 'status' ? state.status.enabled : false;
        setToggling(true);
        setDialogError(undefined);
        void setEnabled(!current).then((result) => {
            if (!alive.current)
                return;
            setToggling(false);
            if (result.ok)
                setState({ kind: 'status', status: result.value });
            else
                setDialogError(result.error.message);
        }, (reason) => {
            if (!alive.current)
                return;
            setToggling(false);
            setDialogError(reason instanceof Error ? reason.message : String(reason));
        });
    }, [state, toggling, setEnabled]);
    let dot = LABEL_CAPTION;
    let label = 'AA';
    let title = 'auto-approval';
    if (state.kind === 'loading') {
        dot = LABEL_CAPTION;
        label = 'AA';
        title = 'auto-approval: loading…';
    }
    else if (state.kind === 'error') {
        dot = ERROR;
        label = 'AA';
        title = `auto-approval: ${state.message}`;
    }
    else if (!state.status.enabled) {
        dot = LABEL_CAPTION;
        label = 'AA off';
        title = describe(state.status);
    }
    else if (state.status.paused) {
        dot = WARN;
        label = 'AA paused';
        title = describe(state.status);
    }
    else {
        dot = SUCCESS;
        label = state.status.denials > 0 ? `AA ·${state.status.denials}` : 'AA on';
        title = describe(state.status);
    }
    return (_jsxs(_Fragment, { children: [_jsx("style", { children: DIALOG_WIDTH_CSS }), _jsx(Tooltip, { label: title, side: "top", delayMs: 300, children: _jsx("span", { style: { display: 'inline-flex' }, children: _jsxs(Pill, { onClick: () => setDialogOpen(true), "aria-label": title, "aria-haspopup": "dialog", children: [_jsx("span", { style: { width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }, "aria-hidden": true }), label] }) }) }), _jsx(Modal, { open: dialogOpen, onClose: () => setDialogOpen(false), title: "Auto-approval", className: "aa-modal-wide", children: state.kind === 'status'
                    ? (_jsx(DialogContent, { status: state.status, history: history, toggling: toggling, error: dialogError, onToggle: toggle }))
                    : (_jsx("div", { style: { fontSize: 12, lineHeight: '18px', color: LABEL_SECONDARY }, children: state.kind === 'loading'
                            ? 'Loading auto-approval status…'
                            : `Status unavailable: ${state.message}` })) })] }));
}
//# sourceMappingURL=AutoApprovalChip.js.map