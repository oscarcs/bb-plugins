import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";
import { renderAgyAcpProxyScript } from "../proxy-script.ts";

function makeFakeAgyCli(dir, opts = {}) {
  const cliPath = path.join(dir, "fake-agy.mjs");
  const argsFile = path.join(dir, "argv.json");
  const reqsFile = path.join(dir, "reqs.jsonl");
  const modes = opts.modes ?? ["default", "accept-edits", "auto", "plan"];
  const rejectAuto = Boolean(opts.rejectAuto);

  const script = `#!/usr/bin/env node
import fs from "node:fs";
import readline from "node:readline";

fs.writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)));
const modes = ${JSON.stringify(modes)};
const rejectAuto = ${JSON.stringify(rejectAuto)};
let currentMode = "default";

function makeConfigOptions() {
  return [
    { id: "model", name: "Model", category: "model", type: "select", currentValue: "gemini-4-neon", options: [{ value: "gemini-4-neon", name: "Gemini 4 Neon" }] },
    { id: "mode", name: "Mode", category: "mode", type: "select", currentValue: currentMode, options: modes.map((m) => ({ value: m, name: m })) },
  ];
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  const msg = JSON.parse(line);
  fs.appendFileSync(${JSON.stringify(reqsFile)}, line + "\\n");
  if (msg.method === "initialize") {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: 1, agentInfo: { name: "Fake", version: "1.5.13" } } }) + "\\n");
    return;
  }
  if (msg.method === "session/new") {
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        sessionId: "sess-1",
        modes: { currentModeId: currentMode, availableModes: modes.map((m) => ({ id: m, name: m })) },
        configOptions: makeConfigOptions(),
      },
    }) + "\\n");
    return;
  }
  if (msg.method === "session/load") {
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        modes: { currentModeId: currentMode, availableModes: modes.map((m) => ({ id: m, name: m })) },
        configOptions: makeConfigOptions(),
      },
    }) + "\\n");
    return;
  }
  if (msg.method === "session/set_config_option" && msg.params?.configId === "mode") {
    if (rejectAuto && msg.params.value === "auto") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32602, message: "auto disabled by policy" } }) + "\\n");
      return;
    }
    currentMode = msg.params.value;
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0",
      method: "session/update",
      params: { sessionId: msg.params.sessionId, update: { sessionUpdate: "config_option_update", configOptions: makeConfigOptions() } },
    }) + "\\n");
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0",
      id: msg.id,
      result: { configOptions: makeConfigOptions() },
    }) + "\\n");
  }
});
`;
  fs.writeFileSync(cliPath, script, { mode: 0o755 });
  return { cliPath, argsFile, reqsFile };
}

function runProxySession(proxyPath, extraArgs, env, requests) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [proxyPath, ...extraArgs], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const responses = [];
    const notifications = [];
    const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    let pendingCount = requests.length;

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("proxy test timed out"));
    }, 8000);

    rl.on("line", (line) => {
      const msg = JSON.parse(line);
      if (msg.id !== undefined) {
        responses.push(msg);
        pendingCount -= 1;
        if (pendingCount === 0) {
          clearTimeout(timer);
          child.stdin.end();
        }
      } else {
        notifications.push(msg);
      }
    });

    child.once("exit", () => {
      clearTimeout(timer);
      resolve({ responses, notifications });
    });

    for (const req of requests) {
      child.stdin.write(JSON.stringify(req) + "\n");
    }
  });
}

test("proxy merges BB additionalDirectories and switches mode to auto on session/new and session/load", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-proxy-test-"));
  const bbHome = path.join(dir, ".bb");
  const skillsDir = path.join(bbHome, "runtime", "global-skills");
  const attachmentsDir = path.join(bbHome, "attachments");
  const extraDir = path.join(dir, "extra");
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.mkdirSync(attachmentsDir, { recursive: true });
  fs.mkdirSync(extraDir, { recursive: true });

  const proxyPath = path.join(dir, "acp-proxy.mjs");
  fs.writeFileSync(proxyPath, renderAgyAcpProxyScript(), "utf8");
  const { cliPath, argsFile, reqsFile } = makeFakeAgyCli(dir);

  try {
    const { responses, notifications } = await runProxySession(
      proxyPath,
      [],
      {
        AGY_CLI_COMMAND: cliPath,
        AGY_ACP_SESSION_MODE: "auto",
        BB_HOME: bbHome,
        AGY_ACP_EXTRA_DIRS: extraDir,
      },
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: 1, clientCapabilities: {} } },
        { jsonrpc: "2.0", id: 2, method: "session/new", params: { cwd: dir, mcpServers: [], additionalDirectories: [skillsDir] } },
        { jsonrpc: "2.0", id: 3, method: "session/load", params: { sessionId: "sess-1", cwd: dir, mcpServers: [] } },
      ],
    );

    assert.deepEqual(JSON.parse(fs.readFileSync(argsFile, "utf8")), ["acp", "--stdio"]);

    const newRes = responses.find((r) => r.id === 2);
    assert.equal(newRes.result.modes.currentModeId, "auto");
    assert.equal(newRes.result.configOptions.find((c) => c.category === "mode").currentValue, "auto");
    const loadRes = responses.find((r) => r.id === 3);
    assert.equal(loadRes.result.modes.currentModeId, "auto");
    assert.equal(loadRes.result.configOptions.find((c) => c.category === "mode").currentValue, "auto");
    assert.equal(notifications.length, 0, "intermediate config_option_update should be suppressed");

    const seenReqs = fs.readFileSync(reqsFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const newReq = seenReqs.find((r) => r.method === "session/new");
    assert.deepEqual(newReq.params.additionalDirectories, [skillsDir, attachmentsDir, extraDir]);
    const loadReq = seenReqs.find((r) => r.method === "session/load");
    assert.deepEqual(loadReq.params.additionalDirectories, [skillsDir, attachmentsDir, extraDir]);
    const modeSwitchReqs = seenReqs.filter((r) => r.method === "session/set_config_option");
    assert.ok(modeSwitchReqs.length >= 1);
    for (const req of modeSwitchReqs) {
      assert.equal(req.params.value, "auto");
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("proxy falls back from auto to accept-edits when server rejects auto mode", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-proxy-fallback-"));
  const proxyPath = path.join(dir, "acp-proxy.mjs");
  fs.writeFileSync(proxyPath, renderAgyAcpProxyScript(), "utf8");
  const { cliPath } = makeFakeAgyCli(dir, { rejectAuto: true });

  try {
    const { responses } = await runProxySession(
      proxyPath,
      [],
      {
        AGY_CLI_COMMAND: cliPath,
        AGY_ACP_SESSION_MODE: "auto",
        AGY_ACP_DISABLE_BB_DIRS: "1",
      },
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: 1, clientCapabilities: {} } },
        { jsonrpc: "2.0", id: 2, method: "session/new", params: { cwd: dir, mcpServers: [] } },
      ],
    );

    const newRes = responses.find((r) => r.id === 2);
    assert.equal(newRes.result.modes.currentModeId, "accept-edits");
    assert.equal(newRes.result.configOptions.find((c) => c.category === "mode").currentValue, "accept-edits");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("proxy forwards --dangerously-skip-permissions and leaves mode untouched in full access mode", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-proxy-full-"));
  const proxyPath = path.join(dir, "acp-proxy.mjs");
  fs.writeFileSync(proxyPath, renderAgyAcpProxyScript(), "utf8");
  const { cliPath, argsFile, reqsFile } = makeFakeAgyCli(dir);

  try {
    const { responses } = await runProxySession(
      proxyPath,
      ["--dangerously-skip-permissions"],
      {
        AGY_CLI_COMMAND: cliPath,
        AGY_ACP_DISABLE_BB_DIRS: "1",
      },
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: 1, clientCapabilities: {} } },
        { jsonrpc: "2.0", id: 2, method: "session/new", params: { cwd: dir, mcpServers: [] } },
      ],
    );

    assert.deepEqual(JSON.parse(fs.readFileSync(argsFile, "utf8")), ["acp", "--stdio", "--dangerously-skip-permissions"]);
    const newRes = responses.find((r) => r.id === 2);
    assert.equal(newRes.result.modes.currentModeId, "default");

    const seenReqs = fs.readFileSync(reqsFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(seenReqs.some((r) => r.method === "session/set_config_option"), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
