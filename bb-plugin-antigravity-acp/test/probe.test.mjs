import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { verifyAcpHandshake } from "../probe.ts";

test("verifyAcpHandshake keeps stdin open until initialize completes and returns acpVersion", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-probe-test-"));
  const serverPath = path.join(dir, "eof-sensitive.mjs");
  fs.writeFileSync(
    serverPath,
    `
import readline from "node:readline";
process.stdin.on("end", () => process.exit(0));
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.method === "initialize") {
    setTimeout(() => {
      process.stdout.write(JSON.stringify({
        jsonrpc: "2.0",
        id: msg.id,
        result: { protocolVersion: 1, agentInfo: { name: "Antigravity ACP Server", version: "1.5.13" } },
      }) + "\\n");
    }, 30);
  }
});
`,
    "utf8",
  );

  try {
    const res = await verifyAcpHandshake(process.execPath, [serverPath], {}, 3000);
    assert.equal(res.ok, true);
    assert.equal(res.acpVersion, "1.5.13");
    assert.equal(res.error, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("verifyAcpHandshake fails cleanly when server times out", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-probe-timeout-"));
  const silentPath = path.join(dir, "silent.mjs");
  fs.writeFileSync(silentPath, "setInterval(() => {}, 1000);\n", "utf8");

  try {
    const res = await verifyAcpHandshake(process.execPath, [silentPath], {}, 300);
    assert.equal(res.ok, false);
    assert.match(res.error ?? "", /timed out/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
