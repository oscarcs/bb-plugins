// Host entry: wraps the shared ACP provider bridge for `agy acp --stdio`,
// discovers models & per-model thinking levels, and serves the host probe RPC.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import readline from "node:readline";
import {
  experimental_acpProviderBridge,
} from "@get-bb/plugin-sdk/provider-bridge/acp";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { agyHostContract } from "./contract.js";
import { probeLocal, resolveAgyBinary } from "./probe.js";
import { renderAgyAcpProxyScript } from "./proxy-script.js";
import {
  normalizeModelId,
  normalizeEffort,
  parseRawModels,
  resolveRawModelId,
  rawListsEqual,
  type RawModel,
  type ModelCatalog,
} from "./model-utils.js";

const PLUGIN_DATA_DIR = path.join(os.homedir(), ".bb", "plugins", "google-antigravity-acp");
const CACHE_FILE = path.join(PLUGIN_DATA_DIR, "models-cache.json");
const PROXY_FILE = path.join(PLUGIN_DATA_DIR, "acp-proxy.mjs");

const CACHE_VERSION = 3;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — picker never stale, background refresh handles rotation

// ---- Proxy materialization ------------------------------------------------

let lastWrittenProxySource: string | null = null;

function ensureProxyScript(): string {
  const source = renderAgyAcpProxyScript();
  if (lastWrittenProxySource === source && fs.existsSync(PROXY_FILE)) {
    return PROXY_FILE;
  }
  fs.mkdirSync(PLUGIN_DATA_DIR, { recursive: true });
  let existing = "";
  try {
    existing = fs.readFileSync(PROXY_FILE, "utf8");
  } catch {}
  if (existing !== source) {
    const tmp = `${PROXY_FILE}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, source, { encoding: "utf8", mode: 0o755 });
    fs.renameSync(tmp, PROXY_FILE);
  }
  lastWrittenProxySource = source;
  return PROXY_FILE;
}

// ---- Per-provider default configurability ---------------------------------

function getPreferredDefault(launchEnv?: Record<string, string>): { model: string; effort: string } | null {
  const envModel = launchEnv?.BB_ANTIGRAVITY_DEFAULT_MODEL || process.env.BB_ANTIGRAVITY_DEFAULT_MODEL;
  const envEffort = launchEnv?.BB_ANTIGRAVITY_DEFAULT_REASONING || process.env.BB_ANTIGRAVITY_DEFAULT_REASONING;
  if (envModel && envModel.trim()) {
    return {
      model: normalizeModelId(envModel),
      effort: normalizeEffort(envEffort || "medium"),
    };
  }
  return null;
}

function getAcceptEditsMode(launchEnv?: Record<string, string>): string {
  const raw = (
    launchEnv?.BB_ANTIGRAVITY_ACCEPT_EDITS_MODE ??
    process.env.BB_ANTIGRAVITY_ACCEPT_EDITS_MODE ??
    "auto"
  )
    .trim()
    .toLowerCase();
  if (raw === "default" || raw === "none" || raw === "off") return "";
  if (raw === "accept-edits" || raw === "auto") return raw;
  return "auto";
}

function parseWithSettings(rawList: RawModel[], launchEnv?: Record<string, string>): ModelCatalog {
  const pref = getPreferredDefault(launchEnv);
  return parseRawModels(rawList, undefined, pref);
}

// ---- Discovery and caching ------------------------------------------------

let activeCatalog: ModelCatalog = {
  families: new Map(),
  models: [],
  defaultFamilyId: "",
  rawModels: [],
};
let isInitialized = false;
let discoveryPromise: Promise<void> | null = null;
let cacheTimestamp = 0;
let lastRefreshAt = 0;

function isCacheStale(): boolean {
  if (!cacheTimestamp) return true;
  return Date.now() - cacheTimestamp > CACHE_TTL_MS;
}

function loadFromDiskCache(launchEnv?: Record<string, string>): boolean {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
      if (data.cacheVersion === CACHE_VERSION && Array.isArray(data.rawModels) && data.rawModels.length > 0) {
        cacheTimestamp = typeof data.timestamp === "number" ? data.timestamp : 0;
        activeCatalog = parseWithSettings(data.rawModels, launchEnv);
        isInitialized = true;
        lastRefreshAt = cacheTimestamp || Date.now();
        return true;
      }
    }
  } catch (err) {
    if (process.env.DEBUG) console.error("[acp-antigravity] Failed loading disk cache:", err);
  }
  return false;
}

function saveToDiskCache(rawModels: RawModel[]) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    cacheTimestamp = Date.now();
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({ cacheVersion: CACHE_VERSION, rawModels, timestamp: cacheTimestamp }),
      "utf8",
    );
  } catch (err) {
    if (process.env.DEBUG) console.error("[acp-antigravity] Failed saving disk cache:", err);
  }
}

function findModelConfigOption(configOptions: any[] | undefined) {
  const list = Array.isArray(configOptions) ? configOptions : [];
  return list.find((c: any) => c?.category === "model") ?? list.find((c: any) => c?.id === "model");
}

function findThoughtLevelConfigOption(configOptions: any[] | undefined) {
  const list = Array.isArray(configOptions) ? configOptions : [];
  return list.find((c: any) => c?.category === "thought_level") ?? list.find((c: any) => c?.id === "thinking_level");
}

function extractThoughtLevelFields(thoughtOption: any): Pick<RawModel, "reasoningEfforts" | "defaultReasoningEffort"> {
  const reasoningEfforts = (thoughtOption?.options ?? [])
    .filter((o: any) => o && typeof o.value === "string" && o.value.trim())
    .map((o: any) => ({
      value: o.value,
      ...(typeof o.name === "string" && o.name.trim() ? { name: o.name.trim() } : {}),
    }));
  const defaultReasoningEffort =
    typeof thoughtOption?.currentValue === "string" && thoughtOption.currentValue.trim()
      ? thoughtOption.currentValue.trim()
      : undefined;
  return {
    reasoningEfforts,
    ...(defaultReasoningEffort ? { defaultReasoningEffort } : {}),
  };
}

async function queryAcpServer(
  command: string,
  args: string[],
  env: Record<string, string>,
): Promise<RawModel[]> {
  const resolvedCommand = resolveAgyBinary(command) ?? command;
  return new Promise((resolve, reject) => {
    const proc = spawn(resolvedCommand, args, {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "ignore"],
    });

    const rl = readline.createInterface({ input: proc.stdout });
    let nextId = 1;
    const pending = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();

    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error("ACP server query timed out"));
    }, 20000);

    proc.once("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    rl.on("line", (line) => {
      try {
        const msg = JSON.parse(line);
        if (msg.id && pending.has(msg.id)) {
          const entry = pending.get(msg.id)!;
          pending.delete(msg.id);
          if (msg.error) entry.reject(new Error(msg.error.message));
          else entry.resolve(msg.result);
        }
      } catch {}
    });

    function send(method: string, params: any) {
      const id = nextId++;
      return new Promise((res, rej) => {
        pending.set(id, { resolve: res, reject: rej });
        proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      });
    }

    (async () => {
      try {
        await send("initialize", {
          protocolVersion: 1,
          clientInfo: { name: "bb", version: "1.0.0" },
          clientCapabilities: {},
        });
        const session: any = await send("session/new", { cwd: process.cwd(), mcpServers: [] });
        const modelOption = findModelConfigOption(session?.configOptions);
        const initialThoughtOption = findThoughtLevelConfigOption(session?.configOptions);
        const options = Array.isArray(modelOption?.options) ? modelOption.options : [];
        let rawList: RawModel[];

        if (session?.sessionId && modelOption?.id) {
          // Probe each model's available thought_level options (some models like Orchestrator
          // and GPT-OSS intentionally omit thought_level).
          const initialModelValue = modelOption.currentValue;
          let switched = false;
          rawList = [];
          for (const o of options) {
            let thoughtOption = initialThoughtOption;
            if (o.value !== initialModelValue) {
              try {
                const updated: any = await send("session/set_config_option", {
                  sessionId: session.sessionId,
                  configId: modelOption.id,
                  value: o.value,
                });
                switched = true;
                if (Array.isArray(updated?.configOptions)) {
                  thoughtOption = findThoughtLevelConfigOption(updated.configOptions);
                }
              } catch {
                // Keep initialThoughtOption if switching a model fails.
              }
            }
            rawList.push({
              id: o.value,
              name: o.name ?? o.value,
              ...extractThoughtLevelFields(thoughtOption),
            });
          }
          if (switched && initialModelValue) {
            try {
              await send("session/set_config_option", {
                sessionId: session.sessionId,
                configId: modelOption.id,
                value: initialModelValue,
              });
            } catch {}
          }
        } else {
          rawList = options.map((o: any) => ({
            id: o.value,
            name: o.name ?? o.value,
          }));
        }

        clearTimeout(timeout);
        proc.kill();
        resolve(rawList);
      } catch (err) {
        clearTimeout(timeout);
        proc.kill();
        reject(err);
      }
    })();
  });
}

async function refreshModels(launchSpec?: { command: string; args: string[]; env: Record<string, string> }) {
  if (discoveryPromise) return discoveryPromise;
  const cmd = launchSpec?.command || "agy";
  const args = launchSpec?.args?.length ? launchSpec.args : ["acp", "--stdio"];
  const env = launchSpec?.env || {};

  discoveryPromise = queryAcpServer(cmd, args, env)
    .then((rawList) => {
      if (rawList && rawList.length > 0) {
        if (!isInitialized || !rawListsEqual(rawList, activeCatalog.rawModels)) {
          activeCatalog = parseWithSettings(rawList, env);
          isInitialized = true;
          saveToDiskCache(rawList);
        } else {
          cacheTimestamp = Date.now();
          try {
            const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
            data.cacheVersion = CACHE_VERSION;
            data.timestamp = cacheTimestamp;
            fs.writeFileSync(CACHE_FILE, JSON.stringify(data), "utf8");
          } catch {}
        }
        lastRefreshAt = Date.now();
      }
    })
    .catch((err) => {
      if (process.env.DEBUG) console.error("[acp-antigravity] Failed refreshing models:", err);
    })
    .finally(() => {
      discoveryPromise = null;
    });

  return discoveryPromise;
}

// Attempt initial load from disk cache.
loadFromDiskCache();

export const experimental_providerBridge = {
  experimental_apiVersion: 1 as const,
  handleLine: async (line: string) => {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object") {
        if (parsed.method === "provider/health" || parsed.method === "provider/installation/status") {
          const launchSpec = parsed.params?.providerOptions?.acpLaunchSpec;
          if (launchSpec && typeof launchSpec.command === "string") {
            const resolved = resolveAgyBinary(launchSpec.command);
            if (resolved) {
              launchSpec.command = resolved;
              line = JSON.stringify(parsed);
            }
          }
        }

        if (parsed.method === "model/list") {
          const launchSpec = parsed.params?.providerOptions?.acpLaunchSpec;
          if (!isInitialized || isCacheStale()) {
            await refreshModels(launchSpec);
          } else {
            activeCatalog = parseWithSettings(activeCatalog.rawModels, launchSpec?.env);
            if (Date.now() - lastRefreshAt > 60_000) {
              refreshModels(launchSpec);
            }
          }

          process.stdout.write(
            JSON.stringify({
              jsonrpc: "2.0",
              id: parsed.id,
              result: {
                models: activeCatalog.models,
                selectedOnlyModels: [],
              },
            }) + "\n",
          );
          return;
        }

        if (
          parsed.method === "thread/start" ||
          parsed.method === "thread/resume" ||
          parsed.method === "thread/fork"
        ) {
          if (!parsed.params.options) {
            parsed.params.options = {};
          }
          const launchSpec = parsed.params?.options?.providerOptions?.acpLaunchSpec;
          if (!isInitialized) {
            loadFromDiskCache(launchSpec?.env);
            if (!isInitialized && launchSpec) {
              await refreshModels(launchSpec);
            }
          }

          const resolvedModel = resolveRawModelId(
            parsed.params.options.model,
            parsed.params.options.reasoningLevel,
            activeCatalog,
          );
          parsed.params.options.model = resolvedModel;

          if (launchSpec && typeof launchSpec === "object") {
            const cliCommand =
              resolveAgyBinary(typeof launchSpec.command === "string" ? launchSpec.command : "agy") ??
              (typeof launchSpec.command === "string" ? launchSpec.command : "agy");
            const proxyPath = ensureProxyScript();
            const permissionMode = parsed.params.options.permissionMode;
            const proxyArgs: string[] = [proxyPath];
            const nextEnv: Record<string, string> = {
              ...(launchSpec.env ?? {}),
              AGY_CLI_COMMAND: cliCommand,
            };

            if (permissionMode === "full") {
              // Full access: run completely unsandboxed and auto-approve all tool requests.
              proxyArgs.push("--dangerously-skip-permissions");
              delete nextEnv.AGY_ACP_SESSION_MODE;
            } else {
              // Accept edits: apply configured agy session mode (default: "auto", with Seatbelt sandbox).
              const sessionMode = getAcceptEditsMode(launchSpec.env);
              if (sessionMode) {
                nextEnv.AGY_ACP_SESSION_MODE = sessionMode;
              } else {
                delete nextEnv.AGY_ACP_SESSION_MODE;
              }
            }

            launchSpec.command = process.execPath;
            launchSpec.args = proxyArgs;
            launchSpec.env = nextEnv;
          }

          line = JSON.stringify(parsed);
        }
      }
    } catch (err) {
      if (process.env.DEBUG) console.error("[acp-antigravity] Error in handleLine:", err);
    }
    return experimental_acpProviderBridge.handleLine(line);
  },
  onClose: () => {
    return experimental_acpProviderBridge.onClose?.();
  },
};

export default experimental_defineHostEntry({
  contract: agyHostContract,
  handlers: {
    probe: async (params) => {
      return probeLocal(params.cliCommand ?? "agy");
    },
  },
});
