import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Composer status chip for the auto-approval runtime. Reads the host state via
 * the injected `getStatus` remote call and renders a compact pill: a color-coded
 * dot plus a short state word, with the full snapshot in the native tooltip.
 *
 * Inline styles on purpose (no CSS-module dependency): the standalone client
 * bundle skips the upstream lightningcss pipeline, and this MVP only needs a
 * small pill that sits beside the access-mode selector.
 */
import { useEffect, useState } from 'react';
/** Poll cadence while the chip stays mounted (no event forwarding for third-party remotes). */
const POLL_MS = 2000;
const DOT = {
    width: 7,
    height: 7,
    borderRadius: '50%',
    flexShrink: 0,
};
const PILL = {
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
    cursor: 'default',
};
/** One human-readable status line for the tooltip. */
function describe(status) {
    if (!status.enabled)
        return 'auto-approval disabled';
    const parts = [
        `L0: ${status.denyPatterns} deny / ${status.askPatterns} ask`,
        `${status.autoApproveTools} auto-approve tools`,
        status.classifier === 'disabled' ? 'L1 off' : `L1 ${status.classifier}`,
    ];
    if (status.paused)
        parts.push('paused (deny limit reached)');
    if (status.denials > 0)
        parts.push(`${status.denials} denial(s) this turn`);
    return `auto-approval armed — ${parts.join(' · ')}`;
}
/**
 * The status pill. It owns its polling and is intentionally silent on failure:
 * a failed remote read renders a red "AA" with the error in the tooltip rather
 * than breaking the composer.
 */
export function AutoApprovalChip({ getStatus }) {
    const [state, setState] = useState({ kind: 'loading' });
    useEffect(() => {
        let alive = true;
        const poll = () => {
            void getStatus().then((result) => {
                if (!alive)
                    return;
                if (result.ok)
                    setState({ kind: 'status', status: result.value });
                else
                    setState({ kind: 'error', message: result.error.message });
            }, (reason) => {
                if (!alive)
                    return;
                setState({ kind: 'error', message: reason instanceof Error ? reason.message : String(reason) });
            });
        };
        poll();
        const timer = setInterval(poll, POLL_MS);
        return () => {
            alive = false;
            clearInterval(timer);
        };
    }, [getStatus]);
    let dot = '#9ca3af';
    let label = 'AA';
    let title = 'auto-approval';
    if (state.kind === 'loading') {
        dot = '#9ca3af';
        label = 'AA';
        title = 'auto-approval: loading…';
    }
    else if (state.kind === 'error') {
        dot = '#ef4444';
        label = 'AA';
        title = `auto-approval: ${state.message}`;
    }
    else if (!state.status.enabled) {
        dot = '#9ca3af';
        label = 'AA off';
        title = describe(state.status);
    }
    else if (state.status.paused) {
        dot = '#f59e0b';
        label = 'AA paused';
        title = describe(state.status);
    }
    else {
        dot = '#22c55e';
        label = state.status.denials > 0 ? `AA ·${state.status.denials}` : 'AA on';
        title = describe(state.status);
    }
    return (_jsxs("span", { style: PILL, title: title, "aria-label": title, children: [_jsx("span", { style: { ...DOT, background: dot }, "aria-hidden": true }), label] }));
}
//# sourceMappingURL=AutoApprovalChip.js.map