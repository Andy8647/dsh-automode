# dsh-auto-approval

[English](../README.md) | [中文](../README.zh.md)

Automated tool-call approval for DeepSeek Harness: adds an `auto` tier to the approval policy — every tool call is classified as **allow / deny** (fully autonomous, no human in the loop, uncertain calls are denied) before dispatch. Think Claude Code automode / Codex "approve for me".

> This is the **host half**. For the real-time status chip in the composer (`AA on` / deny counts), install [dsh-client-ui-auto-approval](../dsh-client-ui-auto-approval) (the client half).

## How it works

Hooked at the front of the `tools/pre-execute` waterfall (`prepend: true`), decision priority **L0 deny > L1 classifier** (two-state allow/deny):

| Layer | Responsibility | Default |
|---|---|---|
| **L0 rule engine** | deny blacklist (incl. legacy `askPatterns` — now denying) + read-only tool whitelist, deterministic and free | ✅ on |
| **L1 LLM classifier** | gray zone: feeds the user message + current tool call to a model for intent alignment (two stages: fast → deep) | ⚪ off |

**Fully-autonomous two-state decisions**: decisions converge to allow/deny; no human in the loop. Uncertain calls (legacy askPatterns hits, L1 ASK verdicts, fail-closed, etc.) are all **denied** — the `askPatterns` field is kept for config compatibility, its semantics merged into deny.

Hard guarantees: L0 deny has double insurance (waterfall listener + `ctx.tools.guard()` monotonic guard), a self-kill guard (`killall`/`pkill`/`taskkill`/`Stop-Process` denied as a class, escape hatch `kill <specific pid>`), reasons never leak the matched rule, config fails loudly, and file tools (`write`/`edit`/`str_replace_editor`) are whitelisted — code review and the sandbox boundary own them, so AA focuses on bash / run_code.

Relationship with sandbox escalation: two approval layers coexist — the sandbox governs file-effect boundaries, this plugin governs call danger; calls carrying escalation arguments skip L1 (L0 deny is never exempted) to avoid double approval.

## Install

Published to npm, ships built artifacts:

```sh
# Install into an existing working profile (⚠️ don't create a fresh one: the default
# base layer has no UI and will hang silently)
dsh plugin --profile web add dsh-auto-approval

# Restart dsh
```

Source install (development / self-hosting): clone the repo, then `dsh plugin --profile web add link:/<path>/packages/dsh-auto-approval` (dependencies come from npm; `@deepseek-ai/*` runtime deps are provided by dsh itself).

## Configuration

Via `$DSH_HOME/settings.yaml` (default `~/.dsh/settings.yaml`), hot-reloaded:

```yaml
auto-approval:
  enabled: true
  denyPatterns:
    - 'rm\s+(-[a-z]*[fr][a-z]*\s+)*/\s*$'
    - 'curl\s+[^|]*\|\s*(ba)?sh'
  askPatterns:   # kept for config compatibility; hits now deny (fully autonomous)
    - 'sudo\s'
    - 'git\s+push\s+--force'
  autoApproveTools: [read, grep, find]
  # Enable L1 (omit to disable — L0 unmatched calls are then allowed)
  # classifierFastProvider: deepseek
  # classifierFastModel: deepseek-chat
  # classifierDeepProvider: deepseek   # defaults to fast
  # classifierDeepModel: deepseek-reasoner
```

| Key | Default | Description |
|---|---|---|
| `enabled` | `true` | master switch |
| `denyPatterns` | see `src/config.ts` | regexes, matched ⇒ deny (hard rule) |
| `askPatterns` | see `src/config.ts` | regexes, matched ⇒ **deny** (formerly ask; kept for config compatibility) |
| `autoApproveTools` | read-only tools + file-write tools (`write`/`edit`/`str_replace_editor`) | tool-name whitelist, bypasses all checks. File writes have independent review (code review + sandbox boundary); the main audit target is bash / run_code |
| `bashCommandPrefixes` | empty | bash prefix whitelist (`ls`/`cat` both go through the bash tool, which the tool-name whitelist can't exempt — this is the only L1 bypass for read-only shell commands) |
| `selfKillGuard` | `true` | self-kill guard, see above |
| `auditSessionEvents` | `false` | whether to write session events. **Keep off**: since 08-12 final, sessions fail-closed on undeclared event types — enabling this makes sessions unopenable after restart |
| `classifierFastProvider` / `classifierFastModel` | unset | L1 fast model route (must be paired; setting enables L1) |
| `classifierDeepProvider` / `classifierDeepModel` | unset | L1 deep model route (paired; defaults to fast) |
| `classifierTimeoutMs` | `20000` | per-call L1 timeout, fail-closed ⇒ deny |
| `classifierGuidance` | unset | custom judgment guidance (advisory, not hard rules) |

## Audit

Every decision is appended to `$DSH_HOME/logs/auto-approval.log` (JSON lines; first line is the `armed` config summary):

```sh
tail -f ~/.dsh/logs/auto-approval.log
```

## Verification

1. After restart, the first line of `~/.dsh/logs/auto-approval.log` should be `auto-approval/armed`
2. Ask the model to run `echo danger_test` (with a matching deny rule configured) — it should be rejected, and the log shows `L0-deny`

## Known limitations

- **No Web UI settings section**: the host `api-proxy` `exposedNamespaces()` is a hard-coded allowlist; third-party settings namespaces aren't exposed by default. Configure via `settings.yaml` (hot-reloaded). Filed with the community issue tracker (#485, merged into #349).
- **`settings.yaml` sections replace wholesale** (arrays don't merge) — override a key and you must list the full array.

## Development

```sh
# repo root (monorepo: host + client packages)
pnpm install          # export NPM_TOKEN=$(cat ~/.dsh/npm-token) if needed
pnpm run typecheck    # tsc strict
pnpm run test         # vitest
pnpm run build        # tsc → tsdown
```

Dependencies install from npm (rc.5 series; `@deepseek-ai/*` runtime deps are provided by dsh).

## License

BSD-3-Clause
