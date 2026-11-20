---
name: google-antigravity-acp
description: Troubleshoot or inspect the Google Antigravity ACP provider (`agy acp --stdio`) and its Provider Usage quotas in BB.
---

# Google Antigravity (ACP)

This plugin runs Google Antigravity threads in BB via the official Antigravity CLI (`agy acp --stdio`, `agy >= 1.5.0`) and reports Antigravity account quotas to BB's **Provider Usage** panel through the discoverable `provider-usage.v1.listResources` and `provider-usage.v1.getResource` RPCs.

## Commands

- `bb google-antigravity-acp status [--machine <id-or-name>] [--json]` — checks the resolved `agy` binary, version, and live `agy acp --stdio` `initialize` handshake.
- `bb google-antigravity-acp usage [--machine <id-or-name>] [--refresh] [--json]` — reads account quotas on the target host via `agy -p "/usage" --output-format json`.

## Quota collection

- Uses the official CLI's structured JSON output (`agy --log-file /dev/null -p "/usage" --output-format json`) inside an empty plugin-owned workspace (`usage-workspace`). Runs zero model turns and never reads token files, Keychain entries, or private Google endpoints.
- Readings are cached in memory for two minutes; manual refresh bypasses the cache, and concurrent requests share a single collection.
- Unused buckets (`remaining_fraction === 1`) omit `resetsAt` because `agy` reports a rolling placeholder timestamp until quota is consumed.
- If collection fails or reports `unauthenticated`, run `agy` (or `agy acp --login`) interactively on that host and re-check with `agy -p "/usage"`.

## Settings

Configure via `bb plugin config google-antigravity-acp set <key> <value>`:

- `cliCommand` (default `agy`) — executable name or path for `agy`.
- `acceptEditsMode` (default `auto`) — `agy acp` mode used in BB's **Accept edits** mode (`auto`, `accept-edits`, or `default`). **Full access** always runs unsandboxed with `--dangerously-skip-permissions`.
- `defaultModel` / `defaultReasoningEffort` — optional defaults for new threads.
