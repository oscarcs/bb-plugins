# bb-plugin-google-antigravity-acp

Google Antigravity as a first-class bb agent provider through Antigravity's
official **ACP** server (`agy_acp_server.par`).

Forked from `rawizhere/bb-plugin-antigravity-acp` with fixes for `1.5.0` and BB:

- **Pins `agy_acp_server` `1.5.0`** (`REGISTRY_COMMIT = 655791de14...`), restoring
  native multimodal `view_file` (images/PDFs on disk), `additionalDirectories`,
  and native `usage_update` notifications.
- **Atomic upgrades & automatic release detection** in `install.ts`: stages
  extracted binaries before swapping them into `~/.local/opt/agy-acp-server`,
  upgrades automatically when the installed manifest points to an older archive,
  fixes Windows `distKey` (`windows-*`), and ensures `~/.gemini/config/skills`
  exists.
- **ACP proxy wrapper fixes** in `wrapper-script.ts`:
  - Disables `clientCapabilities.fs` on `initialize` (`readTextFile: false`,
    `writeTextFile: false`, override with `AGY_ACP_ALLOW_CLIENT_FS=1`) so
    `agy_acp_server.par` uses Antigravity's native multimodal `view_file` and
    incremental `create_file`/`edit_file` instead of `client_*` custom host
    tools (which downgrade edits to full-file overwrites and leave tool calls
    stuck `in_progress`/falsely `failed`).
  - Auto-merges existing BB runtime directories (`~/.bb/runtime/global-skills`,
    `~/.bb/skills-generated`, `~/.bb/skills`, `~/.bb/thread-storage`,
    `~/.bb/attachments`, plus optional `AGY_ACP_EXTRA_DIRS`; disable with
    `AGY_ACP_DISABLE_BB_DIRS=1`) into `additionalDirectories` on `session/new`,
    `session/load`, and `session/resume`.
  - Pins `ANTIGRAVITY_HARNESS_PATH` to the sibling `localharness_external` next
    to the real server binary.
  - Defers to native `usage_update` events from `1.5.0+` instead of polling the
    SQLite database redundantly (retaining the SQLite fallback for older builds).

Registers the `acp-antigravity` provider (family `acp`), exactly like bb's
builtin ACP agents:

- `server.ts` — `bb.providers.register` with the launch spec in
  `experimental_bridgeOptions.acpLaunchSpec`; plugin settings for install
  paths; the `bb google-antigravity-acp status` and
  `bb google-antigravity-acp install` commands.
- `host.ts` — re-exports the canonical ACP provider bridge
  (`@get-bb/plugin-sdk/provider-bridge/acp`, the same bridge the builtin
  `provider-acp` plugin uses) and implements the host RPC the install/status
  commands call, so installs run on the target machine, not on the bb server.
- `install.ts` — shared install logic: resolves the official distribution
  from the ACP registry (pinned to a commit SHA), downloads, safely extracts
  atomically, and links the server binary, proxy wrapper, and sandbox helper
  onto PATH (no environment variables needed).
- `icons/google-antigravity.svg` — provider mark (path-shaped, theme-tinted).

## Install the plugin

From a local checkout:

```sh
bb plugin install ./bb-plugin-antigravity-acp
bb google-antigravity-acp install
```

Or on another machine from this Git repository (after pushing):

```sh
bb plugin install https://github.com/oscarcs/bb-plugins.git --plugin google-antigravity-acp
bb google-antigravity-acp install
```

## Install the server binary

```sh
bb google-antigravity-acp install
```

The command runs on the machine that will launch the agent (the current
thread's host, or `--machine <id-or-name>` to pick another enrolled machine):

- detects the platform/arch and takes the official zip URL for it from the
  ACP registry (`agentclientprotocol/registry` → `antigravity-acp`, pinned to
  `REGISTRY_COMMIT` in `install.ts`), falling back to a pinned copy embedded
  in the plugin;
- downloads and atomically extracts into `~/.local/opt/agy-acp-server`
  (configurable via `--install-dir`, or the `installDir` plugin setting).
  Extraction never uses `tar` (bsdtar does not sanitize `../` zip entries); it
  uses `unzip` or a validated `python3` zipfile extraction, and PowerShell's
  `Expand-Archive` on Windows;
- symlinks the raw binary `agy_acp_server_raw.par` and sandbox helper
  `localharness_external` into `~/.local/bin` (configurable via `--bin-dir` /
  `binDir`), and installs the ACP proxy wrapper as `agy_acp_server.par`; on
  Windows it copies them and only appends the dir to the user PATH when you
  pass `--update-path` (setx permanently edits `HKCU\Environment` — opt in
  explicitly, and be aware of its 1024-character truncation limit);
- makes the binaries executable and records the install in a manifest.

Install once per machine that should run Antigravity threads. The provider
only appears on a machine where the health probe finds `agy_acp_server.par`
on PATH; the ACP server finds the sandbox helper on PATH too (the install
links both into `binDir`), so no per-machine environment variables are
needed.

```sh
bb google-antigravity-acp install --machine macbook        # this machine
bb google-antigravity-acp install --machine other-host     # another enrolled machine
```

The machine's daemon shell must have `binDir` on PATH. The command warns
when it is not; pick a dir that is (e.g. `/usr/local/bin`) with `--bin-dir`.

Useful flags:

```sh
bb google-antigravity-acp install --machine macbook        # install on a specific machine
bb google-antigravity-acp install --force                  # re-download even if already installed
bb google-antigravity-acp install --from ./agy-acp.zip     # explicit source (URL or local file)
bb google-antigravity-acp install --update-path            # also append binDir to the user PATH (Windows)
bb google-antigravity-acp install --json                   # machine-readable output
```

`~/.local/bin` must be on the machine's PATH for the provider health probe to
find the server. The command warns when it is not.

## Verify

```sh
bb google-antigravity-acp status        # where the server is, per machine
bb provider list                        # acp-antigravity appears (visibility: installed)
bb provider models acp-antigravity
bb thread spawn --provider acp-antigravity --prompt 'hi'
```

## Model and reasoning selection

Antigravity exposes effort variants as separate models (`... Low`, `... Medium`,
and `... High`). Select the desired variant in the model picker. BB reasoning
remains `Medium` because Antigravity's ACP server manages it internally; Fast
mode is unavailable.

## Proxy wrapper & context window usage reporting

The POSIX install renders a lightweight transparent proxy wrapper as
`agy_acp_server.par`, pinning the verified Node interpreter and installed
real-binary path while keeping the official raw binary intact
(`agy_acp_server_raw.par`). Installation verifies an ACP `initialize` handshake
before succeeding.

On `agy_acp_server.par` `1.5.0+`, the server emits native `usage_update`
notifications directly, which the wrapper passes through without polling SQLite.
For older server builds that omit `usage_update`, the wrapper falls back to
reading token usage metadata from `~/.gemini/antigravity-acp/conversations/<sessionId>.db`.

## Security notes

- The ACP registry is fetched from a **pinned commit** (`REGISTRY_COMMIT`),
  never from an unpinned branch, so a registry compromise cannot inject an
  arbitrary binary onto PATH.
- The download source is explicit: the pinned registry URL, or an explicit
  `--from` flag. There is no environment-variable redirect.
- Extraction validates archive entries and refuses `../`/absolute paths.
- No code from this plugin executes the downloaded file except the server
  binary itself (`agy_acp_server.par`), which is Google's official release.

## Auth

Auth is handled in-band by the ACP server (Google account OAuth, Gemini API
key, Agent Platform). First run surfaces a login flow in the thread. State
lives under `~/.gemini/antigravity-acp/settings.json`.
