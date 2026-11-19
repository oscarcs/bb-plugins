import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifyAcpHandshake } from "../install.ts";

test("verifies the ACP initialize handshake and times out silent agents", async () => {
  const fake = join(process.cwd(), "test/fixtures/fake-agent.mjs");
  const never = join(process.cwd(), "test/fixtures/never-agent.mjs");
  const ok = await verifyAcpHandshake(process.execPath, [fake]);
  assert.deepEqual(ok, { ok: true, error: null });
  const started = Date.now();
  const failed = await verifyAcpHandshake(process.execPath, [never], 2_000);
  assert.equal(failed.ok, false);
  assert.ok(Date.now() - started < 5_000);
});

test("keeps stdin open until initialize completes (1.5.0 exits immediately on stdin EOF)", async () => {
  const root = await mkdtemp(join(tmpdir(), "agy-handshake-eof-"));
  const eofSensitive = join(root, "eof-sensitive-agent.mjs");
  await writeFile(
    eofSensitive,
    `import readline from "node:readline";
let closed = false;
process.stdin.on("end", () => {
  closed = true;
  process.exit(0);
});
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.method === "initialize") {
    setTimeout(() => {
      if (!closed) {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: 1 } }) + "\\n");
      }
    }, 30);
  }
});
`,
    "utf8",
  );
  const ok = await verifyAcpHandshake(process.execPath, [eofSensitive]);
  assert.deepEqual(ok, { ok: true, error: null });
});
