import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { experimental_acpProviderBridge } from "@get-bb/plugin-sdk/provider-bridge/acp";

test("a turn with fresh environment variables retains the session's proxy launch settings", async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "agy-first-turn-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  t.mock.method(os, "homedir", () => home);
  // BB supplies require to the bundled SDK host entry.
  globalThis.require = createRequire(import.meta.url);
  t.after(() => { delete globalThis.require; });
  const { experimental_providerBridge: bridge } = await import("../host.ts");
  let forwarded;
  t.mock.method(experimental_acpProviderBridge, "handleLine", (line) => {
    forwarded = JSON.parse(line).params.options;
  });

  const options = {
    permissionMode: "accept-edits",
    providerOptions: { acpLaunchSpec: { command: process.execPath, args: [], env: {} } },
  };
  const envVars = { BB_FIRST_TURN: "1" };
  await bridge.handleLine(JSON.stringify({ method: "turn/start", params: { options: { ...options, envVars } } }));
  const launch = forwarded.providerOptions.acpLaunchSpec;
  assert.equal(launch.env.AGY_CLI_COMMAND, process.execPath);
  assert.equal(launch.env.AGY_ACP_SESSION_MODE, "auto");
  assert.deepEqual(forwarded.envVars, envVars);
});
