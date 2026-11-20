# Google Antigravity (ACP) for bb

Runs **Google Antigravity** threads in [bb](https://getbb.app) through the official Antigravity CLI's native ACP server (`agy acp --stdio`, available in `agy >= 1.5.0`).

## Features

- **Native `agy acp --stdio` backend**: Single Go binary, fast startup, auto-updated by `agy`, native multimodal image viewing (both pasted images and on-disk image files), and native context-window `usage_update` notifications.
- **Provider Usage quota bars**: Reports Antigravity account quotas (Gemini, Claude & GPT, Gemini 4 Argon, and any future groups) directly to BB's **Provider Usage** panel via `agy -p "/usage" --output-format json` — zero model turns, exact UTC reset timestamps, 2-minute in-memory cache, and no PTY/Python scraping.
- **Full dynamic model & reasoning catalog**: Discovers every model available to your account (Gemini 4 Neon/Argon/Hydrogen, Orchestrator, Gemini 3.8 Flash, Claude, GPT-OSS) and probes each model's exact `thought_level` options (`low`, `medium`, `high`, `xhigh`, or none).
- **Permission modes**:
  - **Accept edits**: Applies `acceptEditsMode` (default `auto` — approves workspace edits, runs shell commands inside the OS terminal sandbox, and reviews commands that leave the sandbox; falls back to `accept-edits` if `auto` isn't available on the account). Can also be set to `accept-edits` (no sandbox) or `default`.
  - **Full access**: Launches with `--dangerously-skip-permissions` and no sandbox, auto-approving all tool calls with zero round-trip permission prompts.
- **BB runtime directory access**: Automatically merges existing BB directories (`~/.bb/runtime/global-skills`, `~/.bb/skills`, `~/.bb/skills-generated`, `~/.bb/thread-storage`, `~/.bb/attachments`) into `additionalDirectories` on `session/new`, `session/load`, and `session/resume`.

## Prerequisites

Install and sign in to the official Antigravity CLI (`agy >= 1.5.0`) on each host where you want to run Antigravity threads:

```sh
agy --version
```

## Install in bb

```sh
bb plugin install https://github.com/oscarcs/bb-plugins.git --plugin google-antigravity-acp
bb google-antigravity-acp status
bb google-antigravity-acp usage
```

## Settings

Configure in bb Settings → Plugins → Google Antigravity (ACP) or with `bb plugin config google-antigravity-acp set <key> <value>`:

| Setting | Default | Description |
| --- | --- | --- |
| `cliCommand` | `agy` | Executable name or path for `agy` (also checks `~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin`). |
| `acceptEditsMode` | `auto` | `agy acp` session mode used in BB's **Accept edits** mode: `auto` (sandboxed), `accept-edits` (unsandboxed), or `default`. |
| `defaultModel` | `""` | Preferred default model ID (e.g. `gemini-4-neon`, `gemini-3.8-flash`). Empty selects the latest Flash model. |
| `defaultReasoningEffort` | `""` | Preferred reasoning effort for `defaultModel` (e.g. `low`, `medium`, `high`, `xhigh`). |

## Environment variable overrides

- `AGY_ACP_EXTRA_DIRS`: Path-delimiter-separated extra directories to append to `additionalDirectories`.
- `AGY_ACP_DISABLE_BB_DIRS=1`: Disable automatic injection of `~/.bb/*` directories.
- `BB_HOME`: Override `~/.bb` when locating BB shared directories.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```
