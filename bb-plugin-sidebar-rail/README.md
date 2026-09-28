# Sidebar Rail

A local bb plugin that places an icon rail to the left of the native thread list. Home, Plugins, Skills, and Automations appear in the rail. Other navigation items remain in More on thread and plugin-panel pages. The existing thread list, footer, and resize handle stay host owned.

Home shows `+ New` and the Threads three-dots menu as matching buttons beside the Threads heading, visible even when the heading is not hovered. Automations hides the thread list. On the Plugins and Skills browser pages, an app-wide rail takes the place of bb's Back to app link. Hover and keyboard-focus labels float above the page content.

Two compact usage bars sit to the right of the footer's bug icon, blue for Codex and orange for Claude. Each row shows the used percentage and a muted countdown to that limit's reset; hover for the provider, window, and full local reset date. They use bb's live provider usage API and show each provider's first reported limit. Readings refresh every two minutes and when the app regains focus; countdowns update every minute. If a provider has no reading, the counter shows a dash.

The current page's icon is solid white on a lighter background. Other icons are outlines. Selection follows the displayed route, including when navigation moves between the native sidebar and the app-wide rail. There is no separate edge marker.

The Threads, Plugins, Skills, and Automations submenu labels share the same type and colour. The top frame uses one continuous divider across the window, including the empty Home page and the junction with the sidebar. The Plugins and Skills header seams and the Automations submenu's top fade are covered while their panels are visible.

The native sidebar toggle still controls bb's whole sidebar state. When collapsed, the plugin shows a separate four-icon rail so only the thread-list column disappears visually. The toggle or its keyboard shortcut expands the native sidebar again. A fixed rail remains in front while Home or Automations changes view and while the native menu collapses or expands.

The plugin applies a deep violet-indigo theme in bb's dark mode. The rail, sidebar chrome, and page header share `--bb-rail-frame`, forming one continuous frame across the left and top edges. A thin line separates the frame from the content below it, while the vertical divider begins beneath the top strip. The main canvas, second column, cards, highlights, borders, and text use the palette variables at the top of `rail.css`; edit those hex values to adjust the colours, then run `bb plugin build && bb plugin reload sidebar-rail`.

From the repository root, install with `bb plugin install path:. --plugin sidebar-rail --yes`. The plugin selects its navigation provider on install. Disable it or select the bundled Navigation provider in Settings → Appearance to restore the original layout.

The plugin uses bb's navigation and app-overlay slots plus a content script that measures and tags the shell. Plugins and Skills browser pages do not expose the native sidebar navigation items, so the overlay uses direct links for its four icons. CSS targets bb 0.44's `[data-sidebar]` and `data-testid` attributes, as well as the browser pages' Back to app link. These selectors may need updating after bb releases.
