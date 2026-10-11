import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { definePluginApp, useSdk } from "@get-bb/plugin-sdk/app";
import "./usage.css";

type UsageReading = { percent: number; window: string; resetsAt: string | null };
type Usage = Record<"codex" | "claude", UsageReading | null>;

function resetCountdown(resetsAt: string | null, now: number): string {
  if (!resetsAt) return "—";
  const remaining = Date.parse(resetsAt) - now;
  if (!Number.isFinite(remaining)) return "—";
  const minutes = Math.max(0, Math.ceil(remaining / 60_000));
  if (minutes === 0) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.ceil(hours / 24)}d`;
}

// The host owns navigation, shortcuts, split gestures, and sidebar collapse.
// Only the usage display needs a portal into the host's current footer.
function useSidebarFooter(): HTMLElement | null {
  const [footer, setFooter] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const update = () => setFooter(document.querySelector<HTMLElement>(
      '[data-testid="app-sidebar-body"] [data-sidebar="footer"], '
      + '[data-testid="sidebar-footer-row"] [data-sidebar="footer"]',
    ));
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    update();
    return () => observer.disconnect();
  }, []);
  return footer;
}

function ProviderUsage() {
  const footer = useSidebarFooter();
  const sdk = useSdk();
  const [usage, setUsage] = useState<Usage>({ codex: null, claude: null });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let cancelled = false;
    let refreshing = false;
    const refresh = async () => {
      if (document.visibilityState === "hidden" || refreshing) return;
      refreshing = true;
      try {
        const limits = await sdk.system.usageLimits();
        if (cancelled) return;
        const firstWindow = (id: string): UsageReading | null => {
          const provider = limits[id];
          const window = provider?.status === "ok" ? provider.windows[0] : undefined;
          return window && Number.isFinite(window.usedPercent)
            ? { percent: Math.max(0, Math.min(100, window.usedPercent)), window: window.label, resetsAt: window.resetsAt }
            : null;
        };
        setUsage({ codex: firstWindow("codex"), claude: firstWindow("claude-code") });
      } catch { /* Retain the last successful reading during a connection failure. */ }
      finally { refreshing = false; }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 120_000);
    const onVisible = () => { void refresh(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sdk]);

  if (!footer) return null;
  return createPortal(<div className="bb-violet-usage" aria-label="Provider usage">
    {(["codex", "claude"] as const).map((provider) => {
      const reading = usage[provider];
      const name = provider === "codex" ? "Codex" : "Claude";
      const reset = resetCountdown(reading?.resetsAt ?? null, now);
      const resetTime = reading?.resetsAt ? Date.parse(reading.resetsAt) : NaN;
      const resetDate = Number.isFinite(resetTime) ? new Date(resetTime).toLocaleString() : "not reported";
      return <div className={`bb-violet-usage-row bb-violet-usage-${provider}`} key={provider}
        title={reading ? `${name}: ${Math.round(reading.percent)}% used · ${reading.window} · resets ${resetDate}` : `${name}: usage unavailable`}
        aria-label={reading ? `${name}: ${Math.round(reading.percent)}% used, ${reading.window}, resets in ${reset}` : `${name}: usage unavailable`}>
        <span className="bb-violet-usage-track"><span className="bb-violet-usage-fill" style={{ width: `${reading?.percent ?? 0}%` }} /></span>
        <span className="bb-violet-usage-percent">{reading ? `${Math.round(reading.percent)}%` : "—"}</span>
        <span className="bb-violet-usage-reset">{reset}</span>
      </div>;
    })}
  </div>, footer);
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({ id: "provider-usage", component: ProviderUsage });
});
