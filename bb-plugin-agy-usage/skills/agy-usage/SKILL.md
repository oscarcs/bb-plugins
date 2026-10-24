---
name: agy-usage
description: Read or troubleshoot Antigravity quotas collected from the official agy terminal usage panel.
---

# Agy usage

This plugin adds Antigravity to BB's Provider Usage panel through the discoverable
`provider-usage.v1.listResources` and `provider-usage.v1.getResource` RPCs.
Use the panel's refresh action for a new reading. Ordinary requests may reuse a
reading for two minutes. Inventory never starts agy.

Requirements on each monitored host: `agy` and `python3` on PATH, and a completed
interactive agy login. If collection fails, run `agy` in a terminal and check
`/usage`. The collector has a 25-second deadline and uses an empty plugin-owned
workspace. It runs no model prompt. Terminal text and credentials are not stored.
The parser supports the five Gemini, Claude/GPT, and Argon windows in agy 1.4.3.
Changed layouts fail visibly and require a parser update. Reset times are
approximate because agy displays rounded durations. Quota available has no reset.

The plugin reads only agy's rendered terminal UI. Do not add credential extraction
or direct quota endpoint requests as a troubleshooting workaround.
