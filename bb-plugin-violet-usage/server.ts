import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default function plugin(bb: BbPluginApi) {
  bb.onInstall(async () => {
    await bb.sdk.theme.set("plugin:violet-usage:violet");
  });
}
