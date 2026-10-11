# Violet & Usage

A purple-blue palette and compact usage bars beside BB’s sidebar footer buttons. Blue is Codex; orange is Claude. Hover for details.

Requires BB 0.46 or later. Install from the repository root:

```sh
bb plugin install path:. --plugin violet-usage --yes
```

## Development

```sh
cd bb-plugin-violet-usage
npm ci
npm run typecheck
bb plugin build
bb plugin reload violet-usage
```

Edit [themes/violet.css](./themes/violet.css) to change the colours, then rebuild, reload, and reapply:

```sh
bb theme set plugin:violet-usage:violet
```
