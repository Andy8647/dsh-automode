# dsh-automode

[English](README.md) | [中文](README.zh.md)

A **fourth permission preset** for DeepSeek Harness: pick **Automode** in the composer's permission dropdown and the session runs on full access with an LLM classifier as the only gate before every tool call. No approval prompts — the classifier answers for you.

The permission model stays 3 + 1: the three official sandbox levels, plus one auto tier. Selecting any other preset turns the plugin off; there is no second switch.

## How it works

```text
model wants a tool call
        │
        ├─ preset ≠ automode ──────────────► untouched (official behavior)
        │
        └─ preset = automode
                 │
                 ├─ L0 rules (hard deny) ───► deny   (rm -rf /, curl | sh, self-kill …)
                 ├─ trusted tools / bash prefixes ──► allow
                 └─ L1 classifier ──────────► allow | deny   (fail-closed: timeout/parse/no-model → deny)
```

- **L0** — regex deny rules, self-kill guard, trusted-tool and bash-prefix allowlists. Deterministic, no model call.
- **L1** — the latest real user message plus the bare tool call go to a two-stage classifier (fast single-token filter → deep CoT check when flagged). Tool output is never shown to the classifier, so injected content cannot talk it into an allow.
- **Fail-closed** — a timeout, a parse failure, or a missing model denies the call.

The preset writes the same knobs as `danger-full-access` (full access + approval `never`), so nothing else asks the user either. What distinguishes the two entries is the plugin's gate — and the official preset service keeps the last selected name, so the dropdown shows which one you picked.

## Install

```sh
dsh plugin --profile web add dsh-automode
```

Then pick **Automode** in the permission dropdown next to the composer (or `/permission automode`). The first time you do so in a browser, a one-time notice explains the trade-off (the official "Enable Full access?" gate is keyed to `danger-full-access` and never fires for a custom preset). The `Auto` chip then appears beside the preset selector with cumulative allow/deny counts and a click-through decision table.

Source install: clone the repo, `pnpm install && pnpm run build`, then `dsh plugin --profile web add link:/<path>`.

## Configuration

`$DSH_HOME/settings.yaml`, hot-reloaded:

```yaml
automode:
  denyPatterns:
    - 'rm\s+(-[a-z]*[fr][a-z]*\s+)*/\s*$'
    - 'curl\s+[^|]*\x7c\s*(ba)?sh'
  autoApproveTools: [read, write, edit, glob, grep, ls]
  bashCommandPrefixes: [ls, pwd, git status, git diff, pnpm test]
  classifierFastProvider: deepseek-official
  classifierFastModel: deepseek-v4-flash
  classifierDeepProvider: deepseek-official
  classifierDeepModel: deepseek-v4-pro
  classifierGuidance: 'Prefer allowing read-only and test commands.'
```

Every key is optional. `denyPatterns` / `autoApproveTools` / `bashCommandPrefixes` **replace** the defaults wholesale (YAML arrays do not merge), so restate the values you want to keep.

Without `classifierFastProvider`/`classifierFastModel` there is no L1, and automode fails closed: only trusted tools and allowlisted commands run, everything else is denied. That is deliberate — a session with no classifier is not a safety net, and silently allowing everything would make the gate a rubber stamp.

## Permissions and data

| Surface | What this plugin does |
|---|---|
| Reads | Tool-call arguments under review; the session log (only to find the latest real user message as classifier intent) |
| Writes | `$DSH_HOME/logs/automode.log` — a local JSON-lines audit file, best-effort; a write failure only logs a warning |
| Network | Only when L1 is configured: the user message + tool call go to that LLM provider |
| Executes | Nothing. No subprocess, no shell, no file mutation outside the audit log |
| Intercepts | `tools/pre-execute` (prepended) plus a monotonic `ctx.tools.guard()` deny guard — both gated on the session's preset |
| Failure bounds | L1 timeout / parse failure / missing model → **deny**; invalid config throws at load (fail-loud); a missing settings service falls back to the composition entry config |

## Compatibility

Tracks the latest official DeepSeek Harness release. Currently verified against `@deepseek-ai/dsh` **0.1.2-rc.1** (install → boot → real tool-call decision in a disposable `DSH_HOME`). Older releases are not supported.

The bundle patch restates the official preset table, so a base release that adds a preset needs this file updated too.

## Development

```sh
pnpm install
pnpm run typecheck
pnpm run test
pnpm run build     # lib/index.js (host) + lib/client.js (browser)
```

## License

BSD-3-Clause
