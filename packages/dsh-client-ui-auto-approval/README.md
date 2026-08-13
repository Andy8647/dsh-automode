# dsh-client-ui-auto-approval

[English](../README.md) | [中文](../README.zh.md)

The **client companion** for dsh-auto-approval: a status chip beside the composer's access-mode selector (Read Only / Workspace Write / Full access) showing the host's auto-approval runtime state — armed config, per-turn deny counts, **cumulative stats (approved / denied)** and pause state.

```
[Access mode: Workspace Write]  ● AA on   [Select model...]
```

## Interactions

- **Hover the chip**: tooltip shows the run state — safety rule count, review model, cumulative stats (`✓ approved · ✗ denied`).
- **Click the chip**: opens a dialog with —
  - **On/off switch** (drives the host `setEnabled` remote; persisted to settings when available, hot-reloaded and survives restarts);
  - **Config summary**: Safety rules / Review model / Trusted tools;
  - **Recent decisions**: the last 100 decisions for this session (time, tool, stage, verdict, matched pattern / L1 rationale), newest first, refreshed every 2s while open.

## How it works

Data flows over a Typert remote (`autoApprovalStatus/getStatus` + `getHistory` + `setEnabled`); the host's `AutoApprovalStatusService` reads in-memory state (resolved config + deny tracker + DecisionHistory ring buffer) — no session events written.

> Not using projections: projection values must fold from session events, and since 08-12 final writing custom session events makes a session unopenable after restart (`KNOWN_SESSION_EVENT_TYPES` allowlist).

## Install

Requires [dsh-auto-approval](../dsh-auto-approval) (the host half):

```sh
dsh plugin --profile web add dsh-client-ui-auto-approval
```

## Development

```sh
pnpm run build   # outputs lib/client.js (browser bundle) + lib/index.js (node-half empty apply)
```

## License

BSD-3-Clause
