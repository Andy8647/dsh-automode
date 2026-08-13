# dsh-auto-approval

[English](README.md) | [中文](README.zh.md)

Automated tool-call approval for DeepSeek Harness: an `auto` tier for the approval policy that classifies every tool call as **allow / deny** (fully autonomous — no human in the loop, uncertain calls are denied).

A monorepo of two packages:

| Package | Role |
|---|---|
| [`packages/dsh-auto-approval`](./packages/dsh-auto-approval) | **host half**: pre-execute classifier (L0 rules + L1 LLM, two-state allow/deny) |
| [`packages/dsh-client-ui-auto-approval`](./packages/dsh-client-ui-auto-approval) | **client half**: AA status chip beside the composer access-mode selector, fed by the host via a Typert remote |

## Demo

![auto-approval two-state decision demo](https://raw.githubusercontent.com/Andy8647/dsh-auto-approval/main/docs/demo.gif)

The **chip** next to the composer shows the run state (`AA on` / `AA off`); hover for cumulative stats, click for a dialog with the on/off switch, config summary and the recent-decisions table. The demo covers: file read/write and `ls` whitelisted and dispatched directly, a harmless command allowed by the L1 classifier, and dangerous commands rejected by deny rules / legacy-ask rules (now denying) / the self-kill guard.

## Install

Install both packages into the same profile (published to npm, ships built artifacts — no build environment needed):

```sh
# host half (required: the approval decision logic)
dsh plugin --profile web add dsh-auto-approval
# client half (optional: the AA status chip in the composer)
dsh plugin --profile web add dsh-client-ui-auto-approval
```

For source-based installs (development / self-hosting), see the [host package README](./packages/dsh-auto-approval).

## Development

```sh
pnpm install          # export NPM_TOKEN=$(cat ~/.dsh/npm-token) if any @deepseek-ai/* dep is still private
pnpm -r run build     # build both packages
pnpm -r run test      # host unit tests
```

## License

BSD-3-Clause
