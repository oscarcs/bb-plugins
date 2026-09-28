import { useEffect, useRef, useState } from "react";
import {
  definePluginApp,
  experimental_SidebarNavigationIcon,
  experimental_useSidebarNavigation,
  experimental_useSidebarNavigationSplit,
  useBbNavigate,
  useSdk,
} from "@get-bb/plugin-sdk/app";
import type { ExperimentalSidebarNavigationItem } from "@get-bb/plugin-sdk/app";
import "./rail.css";

type Destination = "home" | "plugins" | "skills" | "automations" | "settings";
const FEATURED: { id: string; destination: Destination }[] = [
  { id: "__bb__/extensions", destination: "plugins" },
  { id: "__bb__/skills", destination: "skills" },
  { id: "__bb__/automations", destination: "automations" },
];
const LINKS: { destination: Destination; label: string; href: string }[] = [
  { destination: "home", label: "Home", href: "/" },
  { destination: "plugins", label: "Plugins", href: "/plugins" },
  { destination: "skills", label: "Skills", href: "/skills" },
  { destination: "automations", label: "Automations", href: "/plugins/automations/automations" },
  { destination: "settings", label: "Settings", href: "/settings" },
];
const NavigationIcon = experimental_SidebarNavigationIcon;

function destinationForPath(path: string): Destination {
  if (path.startsWith("/plugins/automations/")) return "automations";
  if (path === "/plugins" || path.startsWith("/plugins/")) return "plugins";
  if (path === "/skills" || path.startsWith("/skills/")) return "skills";
  if (path === "/settings" || path.startsWith("/settings/")) return "settings";
  return "home";
}

function useDestination(): Destination {
  const [path, setPath] = useState(() => location.pathname);
  useEffect(() => {
    const update = () => setPath(location.pathname);
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", update);
    document.addEventListener("bb-rail-route-change", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", update);
      document.removeEventListener("bb-rail-route-change", update);
    };
  }, []);
  return destinationForPath(path);
}

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

function RailGlyph({ destination }: { destination: Destination }) {
  const common = { className: "bb-rail-icon", viewBox: "0 0 24 24", "aria-hidden": true as const };
  const outlineProps = { ...common, className: "bb-rail-icon bb-rail-outline", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const solidProps = { ...common, className: "bb-rail-icon bb-rail-solid", fill: "currentColor" };
  let outline;
  let solid;
  switch (destination) {
    case "home":
      outline = <svg {...outlineProps}><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><path d="M9 21v-7h6v7" /></svg>;
      solid = <svg {...solidProps}><path d="M12 2 2 10v10a2 2 0 0 0 2 2h5v-8h6v8h5a2 2 0 0 0 2-2V10L12 2Z" /></svg>;
      break;
    case "plugins":
      outline = <svg {...outlineProps}><path d="M8 3v5m8-5v5M6 8h12v4a6 6 0 0 1-12 0V8ZM12 18v3" /></svg>;
      solid = <svg {...solidProps}><path d="M7 2a1 1 0 0 1 1 1v4h8V3a1 1 0 1 1 2 0v4h1v5a7 7 0 0 1-6 6.93V22h-2v-3.07A7 7 0 0 1 5 12V7h1V3a1 1 0 0 1 1-1Z" /></svg>;
      break;
    case "skills":
      outline = <svg {...outlineProps}><path d="m13 2-9 12h7l-1 8L20 9h-7V2Z" /></svg>;
      solid = <svg {...solidProps}><path d="M13 2 4 14h7l-1 8L20 9h-7V2Z" /></svg>;
      break;
    case "automations":
      outline = <svg {...outlineProps}><path d="M4 10a8 8 0 0 1 14-5l2 2m0-4v4h-4M20 14a8 8 0 0 1-14 5l-2-2m0 4v-4h4" /></svg>;
      solid = <svg {...solidProps}><path d="M4 10a8 8 0 0 1 13.7-5.7L20 6.6V3h2v7h-7V8h3.2l-2-2A6 6 0 0 0 6 10H4Zm16 4a8 8 0 0 1-13.7 5.7L4 17.4V21H2v-7h7v2H5.8l2 2A6 6 0 0 0 18 14h2Z" /></svg>;
      break;
    case "settings":
      outline = <svg {...outlineProps}><path d="M9.7 3h4.6l.6 2.1a7.5 7.5 0 0 1 1.8 1l2.1-.5 2.3 4-1.5 1.6a7.7 7.7 0 0 1 0 2l1.5 1.6-2.3 4-2.1-.5a7.5 7.5 0 0 1-1.8 1l-.6 2.1H9.7l-.6-2.1a7.5 7.5 0 0 1-1.8-1l-2.1.5-2.3-4 1.5-1.6a7.7 7.7 0 0 1 0-2L2.9 9.6l2.3-4 2.1.5a7.5 7.5 0 0 1 1.8-1L9.7 3Z" /><circle cx="12" cy="12" r="3" /></svg>;
      solid = <svg {...solidProps}><path d="M9.7 3h4.6l.6 2.1a7.5 7.5 0 0 1 1.8 1l2.1-.5 2.3 4-1.5 1.6a7.7 7.7 0 0 1 0 2l1.5 1.6-2.3 4-2.1-.5a7.5 7.5 0 0 1-1.8 1l-.6 2.1H9.7l-.6-2.1a7.5 7.5 0 0 1-1.8-1l-2.1.5-2.3-4 1.5-1.6a7.7 7.7 0 0 1 0-2L2.9 9.6l2.3-4 2.1.5a7.5 7.5 0 0 1 1.8-1L9.7 3Z" /><circle cx="12" cy="12" r="3" fill="var(--sidebar-accent)" /></svg>;
      break;
  }
  return <span className="bb-rail-glyph">{outline}{solid}</span>;
}

function RailItem({ item, destination }: { item: ExperimentalSidebarNavigationItem; destination: Destination }) {
  const { isShortcutModifierHeld, actions } = experimental_useSidebarNavigation();
  const split = experimental_useSidebarNavigationSplit(item.id);
  return <button type="button" className="bb-rail-button" aria-label={item.label} data-bb-rail-destination={destination}
    disabled={item.isDisabled || item.isLoading} {...split.splitProps}
    onClick={(event) => actions.activate(item.id, { openInSplit: event.metaKey || event.ctrlKey })}>
    <RailGlyph destination={destination} />
    <span className="bb-rail-shortcut" hidden>{isShortcutModifierHeld && item.shortcut ? ` · ${item.shortcut.label}` : ""}</span>
  </button>;
}

function RailIcons() {
  const { items, actions } = experimental_useSidebarNavigation();
  const navigate = useBbNavigate();
  const moreRef = useRef<HTMLDetailsElement>(null);
  const featured = FEATURED.map(({ id, destination }) => ({ item: items.find((item) => item.id === id), destination }))
    .filter((entry): entry is { item: ExperimentalSidebarNavigationItem; destination: Destination } => entry.item !== undefined);
  const overflow = items.filter((item) => !FEATURED.some((entry) => entry.id === item.id) && item.id !== "__bb__/new-thread");

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) moreRef.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  return <div className="bb-rail-nav">
    <div className="bb-rail-icons">
      <button type="button" className="bb-rail-button" aria-label="Home" data-bb-rail-destination="home"
        onClick={() => navigate.toCompose()}>
        <RailGlyph destination="home" />
      </button>
      {featured.map(({ item, destination: kind }) => <RailItem key={item.id} item={item} destination={kind} />)}
      <a className="bb-rail-button" href="/settings" aria-label="Settings" data-bb-rail-destination="settings">
        <RailGlyph destination="settings" />
      </a>
      <details className="bb-rail-more" ref={moreRef}>
        <summary className="bb-rail-button" aria-label="More navigation">
          <svg className="bb-rail-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
        </summary>
        <div className="bb-rail-menu" role="menu" aria-label="More navigation">
          {overflow.map((item) => <button key={item.id} type="button" role="menuitem"
            disabled={item.isDisabled || item.isLoading}
            onClick={(event) => { moreRef.current!.open = false; actions.activate(item.id, { openInSplit: event.metaKey || event.ctrlKey }); }}>
            <NavigationIcon icon={item.icon} className="bb-rail-menu-icon" />
            <span>{item.label}</span>
          </button>)}
          <button type="button" role="menuitem" onClick={() => { moreRef.current!.open = false; actions.openCustomize(); }}>Customize sidebar</button>
        </div>
      </details>
    </div>
  </div>;
}

function Rail() {
  const { items, actions } = experimental_useSidebarNavigation();
  const sdk = useSdk();
  const destination = useDestination();
  const newThread = items.find((item) => item.id === "__bb__/new-thread");
  const [usage, setUsage] = useState<{ codex: { percent: number; window: string; resetsAt: string | null } | null; claude: { percent: number; window: string; resetsAt: string | null } | null }>({ codex: null, claude: null });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const limits = await sdk.system.usageLimits();
        if (cancelled) return;
        const firstWindow = (id: string) => {
          const provider = limits[id];
          const window = provider?.status === "ok" ? provider.windows[0] : undefined;
          return window && Number.isFinite(window.usedPercent)
            ? { percent: Math.max(0, Math.min(100, window.usedPercent)), window: window.label, resetsAt: window.resetsAt }
            : null;
        };
        setUsage({ codex: firstWindow("codex"), claude: firstWindow("claude-code") });
      } catch { /* Keep the last successful reading when the host is unavailable. */ }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 120_000);
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [sdk]);
  return <>
    <RailIcons />
    <div className="bb-rail-usage" aria-label="Provider usage">
      {(["codex", "claude"] as const).map((provider) => {
        const reading = usage[provider];
        const name = provider === "codex" ? "Codex" : "Claude";
        const reset = resetCountdown(reading?.resetsAt ?? null, now);
        const resetDate = reading?.resetsAt ? new Date(reading.resetsAt).toLocaleString() : "not reported";
        return <div className={`bb-rail-usage-row bb-rail-usage-${provider}`} key={provider}
          title={reading ? `${name}: ${Math.round(reading.percent)}% used · ${reading.window} · resets ${resetDate}` : `${name}: usage unavailable`}
          aria-label={reading ? `${name}: ${Math.round(reading.percent)}% used, ${reading.window}, resets in ${reset}` : `${name}: usage unavailable`}>
          <span className="bb-rail-usage-track"><span className="bb-rail-usage-fill" style={{ width: `${reading?.percent ?? 0}%` }} /></span>
          <span className="bb-rail-usage-percent">{reading ? `${Math.round(reading.percent)}%` : "—"}</span>
          <span className="bb-rail-usage-reset">{reset}</span>
        </div>;
      })}
    </div>
    <div className="bb-rail-panel-top">
      {destination !== "home" && <div className="bb-rail-heading">{LINKS.find((link) => link.destination === destination)?.label}</div>}
      {destination === "home" && newThread && <button className="bb-rail-new-thread" type="button"
        disabled={newThread.isDisabled || newThread.isLoading}
        onClick={(event) => actions.activate(newThread.id, { openInSplit: event.metaKey || event.ctrlKey })}>
        <span aria-hidden="true">＋</span> New thread
      </button>}
    </div>
  </>;
}

function ExternalRail() {
  return <div className="bb-rail-external-overlay"><div className="bb-rail-icons">
    {LINKS.map((link) => <a key={link.destination} className="bb-rail-button" href={link.href}
      aria-label={link.label} data-bb-rail-destination={link.destination}>
      <RailGlyph destination={link.destination} />
    </a>)}
  </div></div>;
}

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "sidebar-shell",
    mount({ signal }) {
      const attached = new Map<HTMLElement, ResizeObserver>();
      let externalSidebar: HTMLElement | null = null;
      let lastPath = location.pathname;
      const markSubheading = (root: Element | null, label: string) => {
        if (!root) return null;
        const existing = [...root.querySelectorAll<HTMLElement>(".bb-rail-subheading")].find((element) => element.textContent?.trim() === label);
        if (existing) return existing;
        const heading = [...root.querySelectorAll<HTMLElement>("*")].filter((element) => {
          const top = element.getBoundingClientRect().top;
          return element.textContent?.trim() === label && top >= 0 && top < 200;
        }).at(-1);
        heading?.classList.add("bb-rail-subheading");
        return heading ?? null;
      };
      const inlineNewThread = document.createElement("button");
      inlineNewThread.type = "button";
      inlineNewThread.className = "bb-rail-inline-new-thread";
      inlineNewThread.textContent = "+ New";
      inlineNewThread.setAttribute("aria-label", "New thread");
      inlineNewThread.addEventListener("click", (event) => {
        const original = document.querySelector<HTMLElement>(".bb-rail-new-thread");
        original?.dispatchEvent(new MouseEvent("click", { bubbles: true, metaKey: event.metaKey, ctrlKey: event.ctrlKey }));
      });
      const tooltip = document.createElement("div");
      tooltip.className = "bb-rail-tooltip";
      tooltip.setAttribute("role", "tooltip");
      document.body.appendChild(tooltip);
      const showTooltip = (target: EventTarget | null) => {
        const button = target instanceof Element ? target.closest<HTMLElement>(".bb-rail-button") : null;
        if (!button || button.closest(".bb-rail-external-overlay") && !document.body.matches(".bb-rail-external, .bb-rail-collapsed")) return;
        const label = button.getAttribute("aria-label");
        if (!label) return;
        const shortcut = button.querySelector(".bb-rail-shortcut")?.textContent ?? "";
        const rect = button.getBoundingClientRect();
        tooltip.textContent = label + shortcut;
        tooltip.style.left = `${rect.right + 9}px`;
        tooltip.style.top = `${rect.top + rect.height / 2}px`;
        tooltip.classList.add("bb-rail-tooltip-visible");
      };
      const hideTooltip = (event: Event) => {
        const next = event instanceof PointerEvent ? event.relatedTarget : event instanceof FocusEvent ? event.relatedTarget : null;
        const button = event.target instanceof Element ? event.target.closest(".bb-rail-button") : null;
        if (button && next instanceof Node && button.contains(next)) return;
        tooltip.classList.remove("bb-rail-tooltip-visible");
      };
      const onPointerOver = (event: PointerEvent) => showTooltip(event.target);
      const onPointerMove = (event: PointerEvent) => {
        if (!(event.target instanceof Element) || !event.target.closest(".bb-rail-button")) tooltip.classList.remove("bb-rail-tooltip-visible");
      };
      const onFocusIn = (event: FocusEvent) => showTooltip(event.target);
      document.addEventListener("pointerover", onPointerOver);
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("focusin", onFocusIn);
      document.addEventListener("pointerout", hideTooltip);
      document.addEventListener("focusout", hideTooltip);
      let frame = 0;
      let transitionTimer = 0;
      const holdRailDuringTransition = () => {
        document.body.classList.add("bb-rail-transition-overlay");
        window.clearTimeout(transitionTimer);
        transitionTimer = window.setTimeout(() => {
          document.body.classList.remove("bb-rail-transition-overlay");
          schedule();
        }, 500);
      };
      const attach = () => {
        frame = 0;
        const path = location.pathname;
        if (path !== lastPath) {
          const previousDestination = destinationForPath(lastPath);
          const nextDestination = destinationForPath(path);
          if (nextDestination !== previousDestination && (nextDestination === "home" || nextDestination === "automations")) holdRailDuringTransition();
          lastPath = path;
          tooltip.classList.remove("bb-rail-tooltip-visible");
          document.dispatchEvent(new Event("bb-rail-route-change"));
        }
        const isExternal = ((path === "/plugins" || path.startsWith("/plugins/"))
          && !path.startsWith("/plugins/automations/")) || path === "/skills" || path.startsWith("/skills/")
          || path === "/settings" || path.startsWith("/settings/");
        const nativeNav = document.querySelector<HTMLElement>('[data-sidebar="sidebar"] > [data-testid="sidebar-navigation-region"] .bb-rail-nav');
        const rect = nativeNav?.getBoundingClientRect();
        const nativeVisible = !!(nativeNav && rect && rect.width >= 40 && rect.height >= 60
          && rect.left >= 0 && rect.right <= innerWidth
          && getComputedStyle(nativeNav).visibility !== "hidden");
        const isCollapsed = !isExternal && !nativeVisible;
        document.body.classList.toggle("bb-rail-external", isExternal);
        document.body.classList.toggle("bb-rail-collapsed", isCollapsed);
        document.body.classList.toggle("bb-rail-native-visible", !isExternal && !isCollapsed);
        const destination = destinationForPath(path);
        document.body.classList.toggle("bb-rail-home", destination === "home");
        document.body.classList.toggle("bb-rail-landing", path === "/");
        document.body.classList.toggle("bb-rail-automations-page", destination === "automations");
        for (const button of document.querySelectorAll<HTMLElement>(".bb-rail-button[data-bb-rail-destination]")) {
          const selected = button.dataset.bbRailDestination === destination;
          button.classList.toggle("bb-rail-selected", selected);
          if (selected) button.setAttribute("aria-current", "page");
          else button.removeAttribute("aria-current");
        }
        externalSidebar?.classList.remove("bb-rail-external-sidebar");
        document.querySelectorAll(".bb-rail-back-link").forEach((link) => link.classList.remove("bb-rail-back-link"));
        externalSidebar = null;
        if (isExternal) {
          const back = [...document.querySelectorAll<HTMLAnchorElement>("a")].find((link) => link.textContent?.trim() === "Back to app");
          back?.classList.add("bb-rail-back-link");
          let ancestor = back?.parentElement ?? null;
          while (ancestor) {
            const rect = ancestor.getBoundingClientRect();
            if (rect.width >= 250 && rect.width <= 600 && rect.height >= innerHeight * 0.6) {
              externalSidebar = ancestor;
              ancestor.classList.add("bb-rail-external-sidebar");
              const right = `${rect.right}px`;
              if (document.body.style.getPropertyValue("--bb-rail-external-sidebar-right") !== right) {
                document.body.style.setProperty("--bb-rail-external-sidebar-right", right);
              }
              break;
            }
            ancestor = ancestor.parentElement;
          }
          markSubheading(externalSidebar, LINKS.find((link) => link.destination === destination)?.label ?? "");
        } else if (destination === "home") {
          const sidebar = document.querySelector('[data-sidebar="sidebar"]');
          for (const button of sidebar?.querySelectorAll<HTMLButtonElement>('button[aria-label^="New thread in "]') ?? []) {
            const section = button.getAttribute("aria-label")?.slice("New thread in ".length);
            if (!section || section === "Threads") continue;
            const heading = [...sidebar!.querySelectorAll<HTMLElement>("*")].find((element) =>
              element.textContent?.trim() === section
              && ![...element.children].some((child) => child.textContent?.trim() === section),
            );
            heading?.classList.add("bb-rail-subheading");
            let ancestor = button.parentElement;
            for (let depth = 0; ancestor && depth < 5; depth++, ancestor = ancestor.parentElement) {
              const style = getComputedStyle(ancestor);
              if (Number(style.opacity) < 1 || style.visibility === "hidden" || style.pointerEvents === "none") {
                ancestor.classList.add("bb-rail-project-actions-visible");
              }
            }
          }
          const heading = markSubheading(sidebar, "Threads");
          if (heading && !isCollapsed) {
            if (!inlineNewThread.isConnected) document.body.appendChild(inlineNewThread);
            const headingRect = heading.getBoundingClientRect();
            const sidebarRect = heading.closest<HTMLElement>('[data-sidebar="sidebar"]')?.getBoundingClientRect();
            const buttonRect = inlineNewThread.getBoundingClientRect();
            const menuRect = document.querySelector<HTMLButtonElement>('button[aria-label="Threads actions"]')?.getBoundingClientRect();
            const menuLeft = menuRect && menuRect.width > 0 && menuRect.left > headingRect.right + buttonRect.width + 8
              ? menuRect.left
              : (sidebarRect?.right ?? headingRect.right) - 40;
            const left = `${menuLeft - buttonRect.width - 8}px`;
            const top = `${headingRect.top + (headingRect.height - buttonRect.height) / 2}px`;
            if (inlineNewThread.style.left !== left) inlineNewThread.style.left = left;
            if (inlineNewThread.style.top !== top) inlineNewThread.style.top = top;
          } else inlineNewThread.remove();
        }
        if (destination !== "home") inlineNewThread.remove();
        document.body.classList.toggle("bb-rail-external-ready", isExternal && externalSidebar !== null);
        for (const root of document.querySelectorAll<HTMLElement>('[data-sidebar="sidebar"]')) {
          root.classList.toggle("bb-rail-automations", path.startsWith("/plugins/automations/"));
          const nav = root.querySelector(':scope > [data-testid="sidebar-navigation-region"]');
          if (!nav || attached.has(root)) continue;
          const measure = () => {
            const reserve = root.querySelector<HTMLElement>(':scope > [data-testid="app-sidebar-top-reserve-row"]');
            const top = `${reserve?.offsetHeight ?? 44}px`;
            const width = `${Math.max(0, root.clientWidth - 60)}px`;
            const right = `${root.getBoundingClientRect().right}px`;
            if (root.style.getPropertyValue("--bb-rail-top") !== top) root.style.setProperty("--bb-rail-top", top);
            if (root.style.getPropertyValue("--bb-rail-panel-width") !== width) root.style.setProperty("--bb-rail-panel-width", width);
            if (document.body.style.getPropertyValue("--bb-rail-native-sidebar-right") !== right) {
              document.body.style.setProperty("--bb-rail-native-sidebar-right", right);
            }
          };
          root.classList.add("bb-rail-shell");
          const observer = new ResizeObserver(() => { measure(); schedule(); });
          observer.observe(root);
          const reserve = root.querySelector<HTMLElement>(':scope > [data-testid="app-sidebar-top-reserve-row"]');
          if (reserve) observer.observe(reserve);
          attached.set(root, observer);
          measure();
        }
      };
      const schedule = () => { if (!signal.aborted && !frame) frame = requestAnimationFrame(attach); };
      const mutations = new MutationObserver((records) => {
        if (records.some((record) => record.type === "childList" || record.attributeName !== "class"
          || !(record.target instanceof Element)
          || !record.target.matches(".bb-rail-button, .bb-rail-back-link, .bb-rail-external-sidebar, [data-sidebar='sidebar'], body"))) schedule();
      });
      mutations.observe(document.body, { childList: true, attributes: true, attributeFilter: ["class", "data-state", "style"], subtree: true });
      const onSidebarToggle = (event: MouseEvent) => {
        const button = event.target instanceof Element ? event.target.closest("button") : null;
        if (button?.getAttribute("aria-label")?.startsWith("Toggle sidebar")) {
          holdRailDuringTransition();
          schedule();
          window.setTimeout(schedule, 350);
        }
      };
      const onRailNavigate = (event: MouseEvent) => {
        const button = event.target instanceof Element ? event.target.closest<HTMLElement>(".bb-rail-button[data-bb-rail-destination]") : null;
        if (button?.dataset.bbRailDestination === "home" || button?.dataset.bbRailDestination === "automations") holdRailDuringTransition();
      };
      const onSidebarShortcut = (event: KeyboardEvent) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "\\") holdRailDuringTransition();
      };
      const onSidebarTransition = (event: TransitionEvent) => {
        if (event.target instanceof Element && event.target.closest('[data-sidebar="sidebar"], [data-sidebar="inset"], [data-sidebar="container"]')) schedule();
      };
      document.addEventListener("click", onSidebarToggle);
      document.addEventListener("click", onRailNavigate, true);
      document.addEventListener("keydown", onSidebarShortcut, true);
      document.addEventListener("transitionend", onSidebarTransition);
      window.addEventListener("popstate", schedule);
      schedule();
      const cleanup = () => {
        mutations.disconnect();
        cancelAnimationFrame(frame);
        window.clearTimeout(transitionTimer);
        document.removeEventListener("click", onSidebarToggle);
        document.removeEventListener("click", onRailNavigate, true);
        document.removeEventListener("keydown", onSidebarShortcut, true);
        document.removeEventListener("transitionend", onSidebarTransition);
        window.removeEventListener("popstate", schedule);
        document.body.classList.remove("bb-rail-external");
        document.body.classList.remove("bb-rail-collapsed");
        document.body.classList.remove("bb-rail-transition-overlay");
        document.body.classList.remove("bb-rail-home", "bb-rail-landing", "bb-rail-automations-page", "bb-rail-external-ready", "bb-rail-native-visible");
        document.body.style.removeProperty("--bb-rail-external-sidebar-right");
        document.body.style.removeProperty("--bb-rail-native-sidebar-right");
        inlineNewThread.remove();
        document.removeEventListener("pointerover", onPointerOver);
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("focusin", onFocusIn);
        document.removeEventListener("pointerout", hideTooltip);
        document.removeEventListener("focusout", hideTooltip);
        externalSidebar?.classList.remove("bb-rail-external-sidebar");
        document.querySelectorAll(".bb-rail-back-link").forEach((link) => link.classList.remove("bb-rail-back-link"));
        tooltip.remove();
        for (const [root, observer] of attached) {
          observer.disconnect();
          root.classList.remove("bb-rail-shell");
          root.classList.remove("bb-rail-automations");
          root.style.removeProperty("--bb-rail-top");
          root.style.removeProperty("--bb-rail-panel-width");
        }
        attached.clear();
      };
      signal.addEventListener("abort", cleanup, { once: true });
      return cleanup;
    },
  });
  app.slots.experimental_sidebarNavigation({
    id: "rail", title: "Icon rail", description: "A narrow icon column beside the thread list.",
    component: ({ isCompactViewport, experimental_Original: Original }) => isCompactViewport ? <Original /> : <Rail />,
  });
  app.slots.experimental_appOverlay({ id: "external-rail", component: ExternalRail });
});
