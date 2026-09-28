# BB plugins

Personal BB plugins, with each plugin in its own directory. The `.bb/plugins.json` index lists plugins that BB can install from this repository.

## Sidebar Rail

Source: [`bb-plugin-sidebar-rail`](./bb-plugin-sidebar-rail/README.md)

From this repository's root:

```sh
bb plugin install path:. --plugin sidebar-rail --yes
```

To make changes, work in the plugin directory and run:

```sh
cd bb-plugin-sidebar-rail
npm ci
npx tsc --noEmit
bb plugin build
bb plugin reload sidebar-rail
```

For future plugins, add a new directory with its own `package.json`, then add its name and relative source path to `.bb/plugins.json`.
