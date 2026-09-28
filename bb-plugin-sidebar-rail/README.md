# Sidebar Rail

Sidebar Rail gives BB a narrow icon column beside the thread list and a deep violet theme. The same rail stays visible when you open Plugins, Skills, Automations, or Settings.

## What you get

- Five destinations: Home, Plugins, Skills, Automations, and Settings. Hover over an icon to see its name. The current destination has a solid white icon and a lighter background.
- A thread list that you can collapse while keeping the rail visible. Automations hides the thread list while it is open.
- Matching `+ New` and three-dots buttons beside the Threads and project headings.
- Codex and Claude usage bars in the sidebar footer. The bars show used percentages and time until reset; hover for more detail. A dash means BB has no reading for that provider.
- A violet palette across the sidebar, top bar, and main content in dark mode.

## Install

Requires BB 0.44 or later. From the repository root:

```sh
bb plugin install path:. --plugin sidebar-rail --yes
```

The plugin becomes the selected sidebar navigation provider. To return to BB's original navigation, open **Settings → Appearance → Navigation** and choose the bundled **Navigation** provider.

## Change the colours

Edit the palette variables at the top of [rail.css](./rail.css), then run this from the plugin directory:

```sh
bb plugin build
bb plugin reload sidebar-rail
```

This plugin adjusts BB's sidebar and page layout through its plugin API and page styles. BB updates may change those page structures, so the layout may occasionally need an update too.
