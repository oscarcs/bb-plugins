# Agy Usage

A separate BB plugin that adds Antigravity quota bars to **Provider Usage**.
It opens the official `agy` terminal UI and reads `/usage`; authentication and
quota requests stay inside agy. No token files, Keychain credentials, or private
Google endpoints are accessed by this plugin.

Requires `agy` (tested with 1.4.3), a completed agy login, and `python3` on each
monitored host. Uses Python's standard-library PTY and a headless terminal emulator.
The collector runs in an empty plugin-owned workspace, confirms trust for that
workspace, sends only `/usage`, and terminates its process group after collection.
It never sends a model prompt. Readings are cached in memory for two minutes;
manual refresh bypasses the cache. Concurrent requests share one collection.

Displays Gemini and Claude/GPT weekly and five-hour usage, plus Argon weekly
usage. Percentages are converted from remaining to consumed. Reset timestamps
are approximate, derived from CLI countdowns; “Quota available” has no timestamp.
The complete known panel is required: changed layouts, partial output, and timeouts
produce an error rather than misleading zero usage. Raw terminal output is never
persisted or returned. agy may maintain its own normal application state.

```sh
npm ci --include=dev
npm test
npm run typecheck
bb plugin build
bb plugin install . --yes
```

If collection fails, verify `agy /usage` interactively on the relevant host.
The Provider Usage panel discovers this plugin's standard v1 resource RPCs;
no frontend injection or provider changes are needed.
