# Google Antigravity (ACP) Plugin Overview

This plugin registers the `acp-antigravity` provider in BB backed by the official Antigravity CLI's native ACP server (`agy acp --stdio`).

## Architecture

- **`server.ts`**: Registers the `acp-antigravity` provider, plugin settings (`cliCommand`, `acceptEditsMode`, `defaultModel`, `defaultReasoningEffort`), discoverable `provider-usage.v1.*` RPCs for BB's Provider Usage panel, and the `bb google-antigravity-acp status` / `usage` CLI commands.
- **`host.ts`**: Wraps `@get-bb/plugin-sdk/provider-bridge/acp` and implements the host `probe` and `readUsage` RPCs:
  - Resolves `agy` (including `~/.local/bin`) for `provider/health`.
  - Queries `agy acp --stdio` on `model/list` to discover available models and per-model `thought_level` options, caching results in `~/.bb/plugins/google-antigravity-acp/models-cache.json`.
  - Materializes `~/.bb/plugins/google-antigravity-acp/acp-proxy.mjs` on `thread/start`, `thread/resume`, `thread/fork`, and `turn/start`, passing `--dangerously-skip-permissions` in BB `full` mode or `AGY_ACP_SESSION_MODE` (default `auto`) in BB `accept-edits` mode.
  - Caches `readUsage` results for 2 minutes with in-flight request deduplication.
- **`usage.ts`**: Collects and parses Antigravity account quotas from `agy --log-file <devNull> -p "/usage" --output-format json`.
- **`proxy-script.ts`**: Generates the lightweight stdio proxy that merges BB runtime directories into `additionalDirectories` and switches `agy acp`'s session `mode` after `session/new`, `session/load`, or `session/resume` when `AGY_ACP_SESSION_MODE` is set.
- **`model-utils.ts`**: Pure model catalog parsing, reasoning effort ordering, and legacy model ID migration.
- **`probe.ts`**: Resolves `agy`, reads `agy --version`, and verifies a live `agy acp --stdio` `initialize` handshake.
