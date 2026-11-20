import type {
  BbPluginApi,
  PluginCliContext,
} from "@get-bb/plugin-sdk";
import { agyHostContract } from "./contract.js";
import { probeLocal } from "./probe.js";

const PROVIDER_ID = "acp-antigravity";

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    cliCommand: {
      type: "string",
      label: "Antigravity CLI command",
      description:
        "Executable name or path for the official Antigravity CLI (`agy`). Defaults to `agy` on PATH or `~/.local/bin/agy`.",
      default: "agy",
    },
    acceptEditsMode: {
      type: "string",
      label: "Accept-edits session mode",
      description:
        "Session mode applied to `agy acp` when a BB thread runs in Accept edits mode: `auto` (workspace edits + OS terminal sandbox), `accept-edits` (workspace edits only, no sandbox), or `default` (prompt per agy settings). Full access mode always runs unsandboxed with `--dangerously-skip-permissions`.",
      default: "auto",
    },
    defaultModel: {
      type: "string",
      label: "Default model",
      description:
        "Default model ID for Google Antigravity threads (e.g. gemini-4-neon, gemini-4-argon, gemini-3.8-flash). Leave empty to use the latest Flash model.",
      default: "",
    },
    defaultReasoningEffort: {
      type: "string",
      label: "Default reasoning effort",
      description:
        "Preferred reasoning effort for the default model (e.g. low, medium, high, xhigh). Leave empty to use the model's own default.",
      default: "",
    },
  });
  let saved = await settings.get();

  function buildLaunchSpec(currentSettings: typeof saved) {
    const env: Record<string, string> = {};
    if (currentSettings.defaultModel?.trim()) {
      env.BB_ANTIGRAVITY_DEFAULT_MODEL = currentSettings.defaultModel.trim();
    }
    if (currentSettings.defaultReasoningEffort?.trim()) {
      env.BB_ANTIGRAVITY_DEFAULT_REASONING = currentSettings.defaultReasoningEffort.trim();
    }
    if (currentSettings.acceptEditsMode?.trim()) {
      env.BB_ANTIGRAVITY_ACCEPT_EDITS_MODE = currentSettings.acceptEditsMode.trim();
    }
    return {
      displayName: "Google Antigravity",
      command: currentSettings.cliCommand?.trim() || "agy",
      args: ["acp", "--stdio"],
      env,
    };
  }

  let providerRegistration: { dispose: () => void } | null = null;

  function registerProvider(currentSettings: typeof saved) {
    if (providerRegistration) {
      providerRegistration.dispose();
    }
    const launch = buildLaunchSpec(currentSettings);
    providerRegistration = bb.providers.register({
      id: PROVIDER_ID,
      displayName: "Google Antigravity",
      family: "acp",
      icon: "./icons/google-antigravity.svg",
      strings: {
        signInHint:
          "Run `agy` (or `agy acp --login`) on this machine to sign in to Google Antigravity.",
        expiredHint:
          "Your Google Antigravity session expired. Run `agy` (or `agy acp --login`) to re-authenticate.",
        installUrl: "https://antigravity.google/docs/cli",
        iconTint: { light: "#4285F4", dark: "#8AB4F8" },
      },
      reasoningLevels: [
        { id: "none", label: "None" },
        { id: "low", label: "Low" },
        { id: "medium", label: "Medium" },
        { id: "high", label: "High" },
        { id: "xhigh", label: "Extra High" },
        { id: "max", label: "Max" },
      ],
      experimental_visibility: "installed",
      models: { scope: "host" },
      maintenance: { health: true, usage: false, installation: false },
      capabilities: {
        supportsServiceTier: false,
        supportsNativeUserQuestion: false,
        supportsManualCompaction: false,
        supportsThreadArchive: false,
        supportsThreadRename: false,
        fork: "none",
        permissionModes: ["accept-edits", "full"],
        reasoningLevels: ["none", "low", "medium", "high", "xhigh", "max"],
      },
      composerActions: [],
      experimental_nativeSkillRoots: {
        user: [
          ".agents/skills",
          ".gemini/skills",
          ".gemini/config/skills",
          ".gemini/antigravity-cli/skills",
        ],
        project: [
          { path: ".agents/skills", ancestors: true },
          { path: ".gemini/skills", ancestors: true },
        ],
      },
      experimental_bridgeOptions: {
        acpLaunchSpec: launch,
      },
    });
  }

  registerProvider(saved);

  settings.onChange((next) => {
    saved = next;
    registerProvider(next);
  });

  const host = bb.hosts.experimental_client({ contract: agyHostContract });

  bb.cli.register({
    name: "google-antigravity-acp",
    summary: "Inspect the Google Antigravity ACP provider backed by `agy acp`",
    commands: [
      {
        name: "status",
        summary: "Show the resolved `agy` binary, version, and ACP handshake status",
        usage: "bb google-antigravity-acp status [--machine <id-or-name>] [--json]",
      },
    ],
    async run(argv, ctx) {
      return statusCmd(bb, argv.slice(argv[0] === "status" ? 1 : 0), ctx);
    },
  });

  async function statusCmd(
    bb: BbPluginApi,
    argv: string[],
    ctx: PluginCliContext,
  ): Promise<{ exitCode: number; stdout: string }> {
    const json = argv.includes("--json");
    const machine = flagValue(argv, "--machine");
    const current = await settings.get();
    const cliCommand = current.cliCommand?.trim() || "agy";
    const target = await resolveTarget(bb, ctx, machine);

    let probe;
    if (target.hostId && !target.error) {
      try {
        probe = await host.call("probe", { cliCommand }, { hostId: target.hostId, signal: ctx.signal });
      } catch (err) {
        probe = {
          ok: false,
          platform: "",
          arch: "",
          binaryPath: null,
          version: null,
          acpVersion: null,
          error: (err as Error).message,
        };
      }
    } else {
      probe = await probeLocal(cliCommand);
    }

    const currentLaunch = buildLaunchSpec(current);
    const status = {
      providerId: PROVIDER_ID,
      displayName: currentLaunch.displayName,
      command: currentLaunch.command,
      launchArgs: currentLaunch.args,
      acceptEditsMode: current.acceptEditsMode?.trim() || "auto",
      target: target.hostId
        ? `${target.label}${probe.ok ? "" : " (probe failed)"}`
        : target.error ?? "this machine (server)",
      platform: [probe.platform, probe.arch].filter(Boolean).join(" ") || "unknown",
      resolvedBinary: probe.binaryPath,
      version: probe.version,
      acpVersion: probe.acpVersion,
      ready: probe.ok,
      hint: probe.ok
        ? "Ready. `agy acp --stdio` answered initialize cleanly."
        : probe.error ?? "Install the official Antigravity CLI (`agy` >= 1.5.0) and sign in with `agy`.",
    };

    return {
      exitCode: 0,
      stdout: json
        ? JSON.stringify(status)
        : [
            `providerId:      ${status.providerId}`,
            `displayName:     ${status.displayName}`,
            `command:         ${status.command} ${status.launchArgs.join(" ")}`,
            `acceptEditsMode: ${status.acceptEditsMode}`,
            `target:          ${status.target}`,
            `platform:        ${status.platform}`,
            `binary:          ${status.resolvedBinary ?? "NOT FOUND"}`,
            `cliVersion:      ${status.version ?? "unknown"}`,
            `acpVersion:      ${status.acpVersion ?? "unknown"}`,
            "",
            status.hint,
          ].join("\n"),
    };
  }
}

function flagValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

async function resolveTarget(
  bb: BbPluginApi,
  ctx: PluginCliContext,
  machine: string | undefined,
): Promise<{ hostId: string | null; label: string; error?: string }> {
  if (machine) {
    const hosts = await bb.sdk.hosts.list({ signal: ctx.signal });
    const hit = hosts.find((h) => h.id === machine || h.name === machine);
    if (!hit) return { hostId: null, label: "", error: `Machine '${machine}' not found. See \`bb machine list\`.` };
    return { hostId: hit.id, label: hit.name };
  }
  if (ctx.threadId) {
    try {
      const thread = await bb.sdk.threads.get({ threadId: ctx.threadId, signal: ctx.signal });
      if (thread.environmentId) {
        const env = await bb.sdk.environments.get({ environmentId: thread.environmentId, signal: ctx.signal });
        return { hostId: env.hostId, label: `environment ${thread.environmentId} on ${env.hostId}` };
      }
    } catch {
      // fall through to server-local
    }
  }
  return { hostId: null, label: "this machine (server)" };
}
