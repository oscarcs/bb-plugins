// Resolves the official `agy` CLI binary and verifies its built-in `agy acp --stdio` server.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile, spawn } from "node:child_process";
import readline from "node:readline";

export interface ProbeResult {
  ok: boolean;
  platform: string;
  arch: string;
  binaryPath: string | null;
  version: string | null;
  acpVersion: string | null;
  error: string | null;
}

export interface HandshakeResult {
  ok: boolean;
  acpVersion: string | null;
  error: string | null;
}

export function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

function isExecutableFile(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    if (process.platform !== "win32") {
      fs.accessSync(filePath, fs.constants.X_OK);
    }
    return true;
  } catch {
    return false;
  }
}

export function resolveAgyBinary(cliCommand = "agy"): string | null {
  const requested = expandHome(cliCommand.trim() || "agy");
  const isWin = process.platform === "win32";
  const suffixes = isWin && !/\.(exe|cmd|bat)$/i.test(requested) ? ["", ".exe", ".cmd", ".bat"] : [""];

  if (requested.includes("/") || requested.includes("\\")) {
    for (const suffix of suffixes) {
      const candidate = requested + suffix;
      if (isExecutableFile(candidate)) return candidate;
    }
    return null;
  }

  const searchDirs: string[] = [];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (dir && !searchDirs.includes(dir)) searchDirs.push(dir);
  }
  const fallbackDirs = isWin
    ? [path.join(os.homedir(), ".local", "bin")]
    : [
        path.join(os.homedir(), ".local", "bin"),
        "/opt/homebrew/bin",
        "/usr/local/bin",
      ];
  for (const dir of fallbackDirs) {
    if (!searchDirs.includes(dir)) searchDirs.push(dir);
  }

  for (const dir of searchDirs) {
    for (const suffix of suffixes) {
      const candidate = path.join(dir, requested + suffix);
      if (isExecutableFile(candidate)) return candidate;
    }
  }

  return null;
}

function readCliVersion(binaryPath: string, timeoutMs = 5_000): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(binaryPath, ["--version"], { timeout: timeoutMs }, (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      const line = String(stdout ?? "").trim().split(/\r?\n/)[0]?.trim();
      resolve(line || null);
    });
  });
}

function stderrTail(stderr: string, max = 300): string {
  const trimmed = stderr.trim();
  if (!trimmed) return "";
  return trimmed.length > max ? `...${trimmed.slice(-max)}` : trimmed;
}

export async function verifyAcpHandshake(
  command: string,
  args: string[] = ["acp", "--stdio"],
  env: Record<string, string> = {},
  timeoutMs = 10_000,
): Promise<HandshakeResult> {
  let stderr = "";
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    if (stderr.length < 4096) stderr += chunk;
  });

  const rl = readline.createInterface({ input: child.stdout });
  const outcome = await new Promise<{ ok: boolean; acpVersion: string | null; reason?: string }>((resolve) => {
    let settled = false;
    const settle = (value: { ok: boolean; acpVersion: string | null; reason?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rl.close();
      try { child.stdin.end(); } catch {}
      try { child.kill(); } catch {}
      resolve(value);
    };

    const timer = setTimeout(() => {
      settle({ ok: false, acpVersion: null, reason: `ACP initialize handshake timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    child.once("error", (err: Error) => {
      settle({ ok: false, acpVersion: null, reason: `Failed to spawn ${command}: ${err.message}` });
    });
    child.once("exit", (code, signal) => {
      settle({
        ok: false,
        acpVersion: null,
        reason: `Server exited before answering initialize (code=${code ?? "null"}, signal=${signal ?? "null"})`,
      });
    });

    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const msg = JSON.parse(trimmed);
        if (msg && msg.id === 1) {
          if (msg.error) {
            settle({
              ok: false,
              acpVersion: null,
              reason: `ACP initialize error: ${msg.error.message ?? JSON.stringify(msg.error)}`,
            });
          } else if (msg.result) {
            const acpVersion =
              typeof msg.result?.agentInfo?.version === "string"
                ? msg.result.agentInfo.version
                : null;
            settle({ ok: true, acpVersion });
          }
        }
      } catch {
        // Ignore non-JSON preamble lines.
      }
    });

    // Keep stdin open until the server replies; ACP stdio servers exit on stdin EOF.
    const initReq = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: 1,
        clientInfo: { name: "bb-probe", version: "1.0.0" },
        clientCapabilities: {},
      },
    });
    try {
      child.stdin.write(initReq + "\n");
    } catch (err) {
      settle({ ok: false, acpVersion: null, reason: `Failed writing initialize: ${(err as Error).message}` });
    }
  });

  if (outcome.ok) {
    return { ok: true, acpVersion: outcome.acpVersion, error: null };
  }
  const tail = stderrTail(stderr);
  return {
    ok: false,
    acpVersion: null,
    error: [outcome.reason, tail].filter(Boolean).join(" — stderr: "),
  };
}

export async function probeLocal(cliCommand = "agy"): Promise<ProbeResult> {
  const binaryPath = resolveAgyBinary(cliCommand);
  if (!binaryPath) {
    return {
      ok: false,
      platform: process.platform,
      arch: process.arch,
      binaryPath: null,
      version: null,
      acpVersion: null,
      error: `Could not find '${cliCommand}' on PATH or in ~/.local/bin. Install the official Antigravity CLI (agy >= 1.5.0).`,
    };
  }

  const [version, handshake] = await Promise.all([
    readCliVersion(binaryPath),
    verifyAcpHandshake(binaryPath, ["acp", "--stdio"]),
  ]);

  if (!handshake.ok) {
    return {
      ok: false,
      platform: process.platform,
      arch: process.arch,
      binaryPath,
      version,
      acpVersion: null,
      error: handshake.error ?? "agy acp --stdio handshake failed",
    };
  }

  return {
    ok: true,
    platform: process.platform,
    arch: process.arch,
    binaryPath,
    version,
    acpVersion: handshake.acpVersion,
    error: null,
  };
}
