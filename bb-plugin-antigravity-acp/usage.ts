// Collects and parses Antigravity account quotas from the official `agy` CLI
// using structured JSON output (`agy -p "/usage" --output-format json`).
import { spawn } from "node:child_process";
import os from "node:os";
import { resolveAgyBinary } from "./probe.js";

export interface UsageWindow {
  kind: "five-hour" | "daily" | "weekly" | "custom";
  id: string;
  label: string;
  usedPercent: number;
  resetsAt: string | null;
  model: string | null;
  cost: null;
}

export type UsageResult =
  | {
      status: "ok";
      plan: null;
      accountEmail: string | null;
      planLabel: string | null;
      windows: UsageWindow[];
    }
  | {
      status: "not_installed" | "unauthenticated";
      plan: null;
      accountEmail: string | null;
      planLabel: string | null;
    }
  | {
      status: "error";
      plan: null;
      accountEmail: string | null;
      planLabel: string | null;
      message: string;
    };

const MAX_OUTPUT_BYTES = 1_000_000;
const DEFAULT_TIMEOUT_MS = 20_000;

const UNAUTHENTICATED_PATTERN =
  /not (?:logged|signed) in|unauthenticated|authentication required|sign in|login required|run `agy`.*login|expired.*credential/i;

function normalizeGroupLabel(name: string): string {
  const trimmed = name.trim();
  if (/^gemini models$/i.test(trimmed)) return "Gemini";
  if (/^claude and gpt models$/i.test(trimmed)) return "Claude & GPT";
  return trimmed;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseIsoTimestamp(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function extractErrorMessage(payload: Record<string, unknown>): string | null {
  for (const key of ["error", "message", "response"] as const) {
    const val = payload[key];
    if (typeof val === "string" && val.trim()) return val.trim().slice(0, 300);
    if (val && typeof val === "object" && typeof (val as Record<string, unknown>).message === "string") {
      const msg = ((val as Record<string, unknown>).message as string).trim();
      if (msg) return msg.slice(0, 300);
    }
  }
  return null;
}

export function parseUsageJson(rawStdout: string): UsageResult {
  const trimmed = rawStdout.trim();
  if (!trimmed) {
    throw new Error("`agy -p \"/usage\" --output-format json` returned empty output.");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    // Some CLI invocations may print preamble lines before the final JSON object.
    const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const lastJsonLine = [...lines].reverse().find((line) => line.startsWith("{") && line.endsWith("}"));
    if (!lastJsonLine) {
      throw new Error("Could not parse JSON output from `agy -p \"/usage\"`.");
    }
    try {
      payload = JSON.parse(lastJsonLine);
    } catch {
      throw new Error("Could not parse JSON output from `agy -p \"/usage\"`.");
    }
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Unexpected usage payload from `agy`.");
  }
  const obj = payload as Record<string, unknown>;

  if (obj.status !== "SUCCESS") {
    const detail = extractErrorMessage(obj);
    if (detail && UNAUTHENTICATED_PATTERN.test(detail)) {
      return { status: "unauthenticated", plan: null, accountEmail: null, planLabel: null };
    }
    throw new Error(detail ? `agy /usage failed: ${detail}` : `agy /usage returned status '${String(obj.status ?? "unknown")}'.`);
  }

  const command = obj.command as Record<string, unknown> | undefined;
  if (!command || command.name !== "usage") {
    throw new Error("Missing `command.name === \"usage\"` in `agy` JSON output.");
  }
  const data = command.data as Record<string, unknown> | undefined;
  const groups = Array.isArray(data?.groups) ? data.groups : null;
  if (!groups || groups.length === 0) {
    throw new Error("No quota groups returned by `agy -p \"/usage\"`.");
  }

  const accountEmail =
    typeof data?.account_email === "string" && data.account_email.trim()
      ? data.account_email.trim()
      : typeof data?.accountEmail === "string" && data.accountEmail.trim()
        ? data.accountEmail.trim()
        : null;

  const windows: UsageWindow[] = [];
  const seenIds = new Set<string>();

  for (const rawGroup of groups) {
    if (!rawGroup || typeof rawGroup !== "object") continue;
    const group = rawGroup as Record<string, unknown>;
    const groupName = typeof group.name === "string" ? group.name.trim() : "";
    const model = groupName ? normalizeGroupLabel(groupName) : "Antigravity";
    const buckets = Array.isArray(group.buckets) ? group.buckets : [];

    for (const rawBucket of buckets) {
      if (!rawBucket || typeof rawBucket !== "object") continue;
      const bucket = rawBucket as Record<string, unknown>;
      const remaining = bucket.remaining_fraction;
      if (typeof remaining !== "number" || !Number.isFinite(remaining) || remaining < -0.001 || remaining > 1.001) {
        throw new Error(`Invalid remaining_fraction for bucket '${String(bucket.id ?? bucket.name ?? "unknown")}'.`);
      }
      const clampedRemaining = Math.max(0, Math.min(1, remaining));
      const usedPercent = Math.round((1 - clampedRemaining) * 10_000) / 100;

      const rawWindow = typeof bucket.window === "string" ? bucket.window.trim().toLowerCase() : "";
      const bucketName = typeof bucket.name === "string" ? bucket.name.trim() : "";

      let kind: UsageWindow["kind"];
      let label: string;
      if (rawWindow === "5h" || rawWindow === "five-hour" || /five[- ]hour/i.test(bucketName)) {
        // BB expands typed five-hour windows to "Five-hour limit · model".
        // A custom label keeps the model name visible in the narrow panel.
        kind = "custom";
        label = `5h · ${model}`;
      } else if (rawWindow === "weekly" || /weekly/i.test(bucketName)) {
        kind = "weekly";
        label = `${model} weekly`;
      } else if (rawWindow === "daily" || /daily/i.test(bucketName)) {
        kind = "daily";
        label = `${model} daily`;
      } else {
        kind = "custom";
        label = bucketName ? `${model} · ${bucketName}` : model;
      }

      const rawId = typeof bucket.id === "string" ? bucket.id.trim() : "";
      const id = rawId || slugify(`${model}-${rawWindow || bucketName || String(windows.length)}`);
      if (!id || seenIds.has(id)) {
        throw new Error(`Duplicate or missing quota bucket id '${id}'.`);
      }
      seenIds.add(id);

      // When a bucket is completely unused (remaining_fraction === 1 and no active
      // usage description), `agy` fills reset_time with a rolling `now + window`
      // placeholder rather than a real refresh deadline.
      const hasDescription = typeof bucket.description === "string" && bucket.description.trim().length > 0;
      const resetsAt = usedPercent === 0 && !hasDescription ? null : parseIsoTimestamp(bucket.reset_time);

      windows.push({
        kind,
        id,
        label,
        usedPercent,
        resetsAt,
        model,
        cost: null,
      });
    }
  }

  if (windows.length === 0) {
    throw new Error("No quota windows returned by `agy -p \"/usage\"`.");
  }

  return {
    status: "ok",
    plan: null,
    accountEmail,
    planLabel: null,
    windows,
  };
}

export interface CollectUsageOptions {
  cliCommand?: string;
  cwd: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function collectUsage(options: CollectUsageOptions): Promise<UsageResult> {
  const { cliCommand = "agy", cwd, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  signal?.throwIfAborted();

  const binaryPath = resolveAgyBinary(cliCommand);
  if (!binaryPath) {
    return {
      status: "not_installed",
      plan: null,
      accountEmail: null,
      planLabel: null,
    };
  }

  const args = ["--log-file", os.devNull, "-p", "/usage", "--output-format", "json"];

  return new Promise<UsageResult>((resolve, reject) => {
    const child = spawn(binaryPath, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        child.kill("SIGTERM");
      } catch {}
      reject(err);
    };

    const succeed = (value: UsageResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const onAbort = () => fail(new Error("Usage collection cancelled."));
    signal?.addEventListener("abort", onAbort, { once: true });

    const timer = setTimeout(() => {
      fail(new Error("Timed out reading `agy -p \"/usage\"`. Verify `agy` is signed in."));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (stdout.length + chunk.length > MAX_OUTPUT_BYTES) {
        fail(new Error("`agy -p \"/usage\"` output exceeded size limit."));
        return;
      }
      stdout += chunk;
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < 8192) {
        stderr += chunk;
      }
    });

    child.once("error", (err: Error) => {
      fail(new Error(`Could not start \`${cliCommand}\`: ${err.message}`));
    });

    child.once("close", (code, sig) => {
      if (settled) return;
      const combinedErr = `${stderr}\n${stdout}`.trim();
      if (code !== 0) {
        if (UNAUTHENTICATED_PATTERN.test(combinedErr)) {
          succeed({
            status: "unauthenticated",
            plan: null,
            accountEmail: null,
            planLabel: null,
          });
          return;
        }
        const detail = stderr.trim().split(/\r?\n/).slice(-3).join(" ").slice(0, 240);
        fail(
          new Error(
            detail
              ? `agy /usage failed (${code ?? sig ?? "error"}): ${detail}`
              : `agy /usage exited with ${sig ? `signal ${sig}` : `code ${code}`}. Verify \`agy\` is signed in.`,
          ),
        );
        return;
      }

      try {
        succeed(parseUsageJson(stdout));
      } catch (err) {
        fail(err instanceof Error ? err : new Error("Unable to parse `agy /usage` output."));
      }
    });
  });
}
