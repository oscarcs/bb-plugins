import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default function plugin(bb: BbPluginApi) {
  bb.onInstall(async () => {
    const { preferences } = await bb.sdk.system.uiPreferences.list();
    await bb.sdk.system.uiPreferences.set({
      key: "sidebar.navigationProvider",
      value: "sidebar-rail/rail",
      expectedRevision: preferences["sidebar.navigationProvider"].revision,
    });
  });
}
