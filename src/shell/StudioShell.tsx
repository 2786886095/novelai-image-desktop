import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import clsx from "clsx";
import { Icon } from "../components/icons";
import { AppPortal } from "../components/ui";
import { useFeatureText } from "../feature-i18n";
import { desktopUiText, getChromeText, getLocalizedTabItems, getSettingsShellText } from "../i18n";
import { requestSettingsSection } from "../prompt-ui-settings";
import { useAppStore } from "../store";
import { APP_NAME, APP_VERSION } from "../types";
import type { ActiveTab } from "../app/navigation";
import { loadTabOrder, normalizeTabOrder, saveTabOrder, moveTab, TAB_ORDER_KEY } from "../app/tab-order";
import {
  groupedTabOrder, moveTabWithinGroup, NAV_GROUPS, rankCommands, requestOpenTool, SETTINGS_SECTIONS, TOOL_ENTRIES,
  type CommandItem, type ToolEntryId,
} from "./nav-model";
import { activeTaskCount, isActive, useTaskStore, type TaskRecord } from "./task-tracker";
import { fill, shellText } from "./shell-text";

const DOCS_URL = "https://docs.novelai.net/en/image/";
/** Without a saved order, the rail uses the functional group order. */
function defaultRailOrder() { return normalizeTabOrder(NAV_GROUPS.flatMap((group) => group.tabs)); }
function loadRailOrder() {
  try { return localStorage.getItem(TAB_ORDER_KEY) ? loadTabOrder() : defaultRailOrder(); }
  catch { return defaultRailOrder(); }
}
const RAIL_KEY = "langbai.shell.rail.v1";
const NOTICE_KEY = "langbai.shell.layout-notice.v3";
export const SHELL_EVENTS = { palette: "studio:shell-palette", tasks: "studio:shell-tasks", notice: "studio:shell-notice" } as const;

function useLanguage() {
  return useAppStore((state) => state.settings?.language);
}

/* ── Rail collapse preference ─────────────────────────────────────────────── */
type RailPref = "auto" | "expanded" | "collapsed";
function readRailPref(): RailPref {
  const value = localStorage.getItem(RAIL_KEY);
  return value === "expanded" || value === "collapsed" ? value : "auto";
}
export function useRailCollapsed() {
  const [pref, setPref] = useState<RailPref>(readRailPref);
  const [narrow, setNarrow] = useState(() => window.innerWidth < 1500);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 1500);
    const onPref = () => setPref(readRailPref());
    window.addEventListener("resize", onResize);
    window.addEventListener("studio:rail-pref", onPref);
    return () => { window.removeEventListener("resize", onResize); window.removeEventListener("studio:rail-pref", onPref); };
  }, []);
  const collapsed = pref === "auto" ? narrow : pref === "collapsed";
  const toggle = useCallback(() => {
    const next = collapsed ? "expanded" : "collapsed";
    try { localStorage.setItem(RAIL_KEY, next); } catch { /* preference only */ }
    setPref(next);
    window.dispatchEvent(new Event("studio:rail-pref"));
  }, [collapsed]);
  return { collapsed, toggle };
}
export function toggleRail() {
  const current = readRailPref();
  const collapsed = current === "auto" ? window.innerWidth < 1500 : current === "collapsed";
  try { localStorage.setItem(RAIL_KEY, collapsed ? "expanded" : "collapsed"); } catch { /* preference only */ }
  window.dispatchEvent(new Event("studio:rail-pref"));
}

/* ── Shared actions ───────────────────────────────────────────────────────── */
export function navigateTo(tab: ActiveTab) {
  const state = useAppStore.getState();
  if (state.showSettings) state.setShowSettings(false);
  startTransition(() => state.setActiveTab(tab));
}
export function openTool(tool: ToolEntryId) {
  navigateTo("tools");
  requestOpenTool(tool);
}
export function openSettings(section?: string) {
  if (section) requestSettingsSection(section);
  useAppStore.getState().setShowSettings(true);
}
async function toggleTheme() {
  const settings = useAppStore.getState().settings;
  if (!settings) return;
  const dark = document.documentElement.classList.contains("theme-dark");
  await window.naiDesktop.setSetting("theme", dark ? "light" : "dark");
  await useAppStore.getState().refreshSettings();
}
async function toggleStreamPreview() {
  const settings = useAppStore.getState().settings;
  if (!settings) return;
  await window.naiDesktop.setSetting("streamPreviewEnabled", !(settings.streamPreviewEnabled ?? true));
  await useAppStore.getState().refreshSettings();
}
function openOutputDir() {
  const dir = useAppStore.getState().settings?.outputDir;
  if (dir) window.naiDesktop.openInExplorer(dir);
}

/* ── Relative time ────────────────────────────────────────────────────────── */
function useNow(active: boolean, interval = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(timer);
  }, [active, interval]);
  return now;
}
function relative(language: unknown, at: number, now: number) {
  const text = shellText(language);
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 3) return text.justNow;
  if (seconds < 60) return fill(text.secondsAgo, { n: seconds });
  return fill(text.minutesAgo, { n: Math.round(seconds / 60) });
}
function clockTime(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/* ── Title bar ────────────────────────────────────────────────────────────── */
export function StudioTopBar({ account }: { account: ReactNode }) {
  const language = useLanguage();
  const text = shellText(language);
  const chrome = getChromeText(language);
  const settings = useAppStore((state) => state.settings);
  const accountState = useAppStore((state) => state.account);
  const refreshAccount = useAppStore((state) => state.refreshAccount);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);
  const streamEnabled = settings?.streamPreviewEnabled ?? true;
  const [streamBusy, setStreamBusy] = useState(false);
  const dark = settings?.theme === "dark" || (settings?.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  // Opus allowance refresh, unchanged from the previous title bar.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("uiCapture") === "opusUsage") return;
    if (!accountState.hasToken || accountState.tierLevel !== 3) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refreshAccount(); }, 60_000);
    return () => window.clearInterval(timer);
  }, [accountState.hasToken, accountState.tierLevel, refreshAccount]);

  return (
    <header className="shell-topbar title-bar" role="banner">
      <div className="shell-brand">
        <img className="title-icon" src="./icon.png" alt="" />
        <span className="shell-brand-name">{APP_NAME}</span>
        <span className="title-ver">v{APP_VERSION}</span>
      </div>
      <button type="button" className="shell-search-trigger" onClick={() => window.dispatchEvent(new Event(SHELL_EVENTS.palette))} aria-keyshortcuts="Control+K">
        <Icon name="search" />
        <span>{text.search}</span>
        <kbd>Ctrl K</kbd>
      </button>
      <div className="shell-topbar-spacer" />
      <TaskCenterButton />
      <div className={clsx("shell-account-status title-account", accountState.hasToken && "online")} title={accountState.hasToken ? `${accountState.tierName ?? t("title.connected")} · Anlas ${accountState.anlasBalance ?? t("common.unknown")}` : t("title.notConnected")}>
        <span className="pulse-dot" />
        <span>{accountState.hasToken
          ? `${accountState.tierName ?? t("title.connected")} · Anlas ${accountState.anlasBalance ?? t("common.unknown")}${accountState.stale ? t("title.cached") : ""}`
          : t("title.notConnected")}</span>
      </div>
      <div className="shell-account">{account}</div>
      <div className="shell-topbar-tools">
        <button
          type="button"
          className={clsx("shell-icon-btn stream-preview-toggle", streamEnabled && "active")}
          role="switch"
          aria-checked={streamEnabled}
          aria-label={`${chrome.streamPreview}：${streamEnabled ? chrome.streamOn : chrome.streamOff}`}
          title={streamEnabled ? text.streamOn : text.streamOff}
          disabled={!settings || streamBusy}
          onClick={() => { setStreamBusy(true); void toggleStreamPreview().finally(() => setStreamBusy(false)); }}
        >
          <Icon name={streamEnabled ? "eye" : "eyeOff"} />
        </button>
        <button type="button" className="shell-icon-btn" aria-label={text.actions.theme} title={`${text.actions.theme}（${dark ? text.themeDark : text.themeLight}）`} onClick={() => void toggleTheme()}>
          {dark ? <MoonGlyph /> : <SunGlyph />}
        </button>
      </div>
      <div className="window-controls">
        <button aria-label="Minimize" onClick={() => window.naiDesktop.minimize()}><Icon name="minimize" /></button>
        <button aria-label="Maximize" onClick={() => window.naiDesktop.maximize()}><Icon name="maximize" /></button>
        <button aria-label="Close" className="close" onClick={() => window.naiDesktop.close()}><Icon name="close" /></button>
      </div>
    </header>
  );
}

function SunGlyph() {
  return <svg className="ui-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="10" cy="10" r="3.4" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" /></svg>;
}
function MoonGlyph() {
  return <svg className="ui-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M15.8 12.6A6.5 6.5 0 0 1 7.4 4.2a6.5 6.5 0 1 0 8.4 8.4Z" /></svg>;
}

/* ── Navigation rail ──────────────────────────────────────────────────────── */
export function StudioNavRail() {
  const language = useLanguage();
  const text = shellText(language);
  const activeTab = useAppStore((state) => state.activeTab);
  const showSettings = useAppStore((state) => state.showSettings);
  const { collapsed, toggle } = useRailCollapsed();
  const [order, setOrder] = useState(loadRailOrder);
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState<ActiveTab | null>(null);
  const [toolsOpen, setToolsOpen] = useState(() => localStorage.getItem("langbai.shell.tools-open.v1") === "1");
  const items = useMemo(() => getLocalizedTabItems(language), [language]);
  const groups = useMemo(() => groupedTabOrder(order), [order]);
  const isWindows = window.naiDesktop?.platform === "win32";
  const tools = TOOL_ENTRIES.filter((tool) => (!tool.windowsOnly || isWindows) && (!tool.comfyOnly || Boolean(window.naiComfy)));

  useEffect(() => {
    const reload = () => setOrder(loadRailOrder());
    window.addEventListener("studio:collections-changed", reload);
    return () => window.removeEventListener("studio:collections-changed", reload);
  }, []);
  const persist = (next: ActiveTab[]) => {
    try { saveTabOrder(next); setOrder(normalizeTabOrder(next)); }
    catch { useAppStore.getState().setToast(text.arrangeHelp); }
  };
  const toggleTools = () => setToolsOpen((open) => {
    try { localStorage.setItem("langbai.shell.tools-open.v1", open ? "0" : "1"); } catch { /* preference only */ }
    return !open;
  });
  const focusSibling = (current: HTMLElement, delta: number) => {
    const all = [...(current.closest(".shell-rail")?.querySelectorAll<HTMLElement>("[data-rail-item]") ?? [])];
    const index = all.indexOf(current);
    all[(index + delta + all.length) % all.length]?.focus();
  };

  return (
    <nav className={clsx("shell-rail", collapsed && "is-collapsed", editing && "is-editing")} aria-label={text.paletteTitle}>
      <div className="shell-rail-scroll">
        {groups.map((group) => (
          <section className="shell-rail-group" key={group.id} aria-label={text.groups[group.id]}>
            <h2 className="shell-rail-group-title">{text.groups[group.id]}</h2>
            {group.tabs.map((tab) => {
              const item = items.find((entry) => entry.value === tab);
              if (!item) return null;
              const active = !showSettings && activeTab === tab;
              return (
                <div className="shell-rail-row" key={tab}>
                  <button
                    type="button"
                    data-rail-item
                    data-tab={tab}
                    className={clsx("shell-rail-item", active && "active", dragging === tab && "is-dragging")}
                    aria-current={active ? "page" : undefined}
                    title={editing ? text.arrangeHelp : `${item.title} — ${item.desc}`}
                    draggable={editing}
                    onDragStart={(event) => { setDragging(tab); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", tab); }}
                    onDragOver={(event) => { if (editing && dragging && group.tabs.includes(dragging)) event.preventDefault(); }}
                    onDrop={(event) => { if (editing && dragging && group.tabs.includes(dragging)) { event.preventDefault(); persist(moveTab(order, dragging, tab)); } setDragging(null); }}
                    onDragEnd={() => setDragging(null)}
                    onKeyDown={(event) => {
                      if (editing && event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
                        event.preventDefault();
                        persist(moveTabWithinGroup(order, tab, event.key === "ArrowUp" ? -1 : 1));
                        requestAnimationFrame(() => (document.querySelector(`.shell-rail [data-tab="${tab}"]`) as HTMLElement | null)?.focus());
                      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                        event.preventDefault();
                        focusSibling(event.currentTarget, event.key === "ArrowDown" ? 1 : -1);
                      } else if (event.key === "Escape" && editing) setEditing(false);
                    }}
                    onClick={() => { if (!editing) navigateTo(tab); }}
                  >
                    <span className="shell-rail-icon"><Icon name={item.icon} /></span>
                    <span className="shell-rail-label">{item.label}</span>
                    {editing ? <span className="shell-rail-grip" aria-hidden="true">⋮⋮</span> : null}
                    {tab === "tools" && !editing ? <TaskDot /> : null}
                  </button>
                  {tab === "tools" && !editing && !collapsed ? (
                    <button type="button" className="shell-rail-disclosure" aria-expanded={toolsOpen} aria-label={item.label} onClick={toggleTools}>
                      <Icon name="chevronRight" className={clsx("disclosure-chevron", toolsOpen && "open")} />
                    </button>
                  ) : null}
                  {tab === "tools" && toolsOpen && !editing && !collapsed ? (
                    <div className="shell-rail-sub" role="group" aria-label={item.label}>
                      {tools.map((tool) => (
                        <button type="button" data-rail-item key={tool.id} className="shell-rail-subitem" title={text.tools[tool.id]}
                          onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); focusSibling(event.currentTarget, event.key === "ArrowDown" ? 1 : -1); } }}
                          onClick={() => openTool(tool.id)}>
                          <Icon name={tool.icon} /><span>{text.tools[tool.id]}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        ))}
      </div>
      {editing ? (
        <div className="shell-rail-edit-help" role="note">
          <span>{text.arrangeHelp}</span>
          <button type="button" className="btn btn-sm" onClick={() => persist(defaultRailOrder())}>{text.arrangeReset}</button>
        </div>
      ) : null}
      <footer className="shell-rail-footer">
        <button type="button" data-rail-item className={clsx("shell-rail-item", showSettings && "active")} aria-current={showSettings ? "page" : undefined} title={`${text.settings} — ${text.settingsHint}`}
          onClick={() => (showSettings ? useAppStore.getState().setShowSettings(false) : openSettings())}>
          <span className="shell-rail-icon"><Icon name="settings" /></span><span className="shell-rail-label">{text.settings}</span>
        </button>
        <div className="shell-rail-utility">
          <button type="button" className="shell-icon-btn" title={text.outputDir} aria-label={text.outputDir} onClick={openOutputDir}><Icon name="folder" /></button>
          <button type="button" className="shell-icon-btn" title={text.docs} aria-label={text.docs} onClick={() => window.naiDesktop.openExternal(DOCS_URL)}><Icon name="help" /></button>
          <button type="button" className={clsx("shell-icon-btn", editing && "active")} aria-pressed={editing} title={editing ? text.arrangeDone : text.arrange} aria-label={editing ? text.arrangeDone : text.arrange}
            onClick={() => { if (collapsed && !editing) toggle(); setEditing(!editing); }}><Icon name="sliders" /></button>
          <button type="button" className="shell-icon-btn" title={collapsed ? text.expand : text.collapse} aria-label={collapsed ? text.expand : text.collapse} aria-keyshortcuts="Control+\" onClick={toggle}>
            <Icon name="chevronRight" className={clsx("shell-rail-collapse-icon", !collapsed && "is-open")} />
          </button>
        </div>
      </footer>
    </nav>
  );
}

function TaskDot() {
  const running = useTaskStore((state) => Boolean(state.batch && isActive(state.batch)));
  return running ? <span className="shell-task-dot" aria-hidden="true" /> : null;
}

/* ── Task center ──────────────────────────────────────────────────────────── */
function taskPercent(record: TaskRecord) {
  const finished = record.done + record.failed;
  const sample = record.state === "running" || record.state === "paused" ? (record.sampleProgress ?? 0) : 0;
  return Math.max(0, Math.min(100, Math.round(((finished + sample) / Math.max(record.total, 1)) * 100)));
}

export function TaskCenterButton() {
  const language = useLanguage();
  const text = shellText(language);
  const tasks = useTaskStore();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const count = activeTaskCount(tasks);
  const lead = [tasks.generation, tasks.batch, ...Object.values(tasks.textJobs)].find(isActive) ?? null;
  const percent = lead ? taskPercent(lead) : 0;
  const unseenFailure = tasks.recent.some((record) => record.state === "failed");
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(SHELL_EVENTS.tasks, show);
    return () => window.removeEventListener(SHELL_EVENTS.tasks, show);
  }, []);
  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={clsx("shell-task-button", count > 0 && "is-busy", lead?.state === "paused" && "is-paused", !count && unseenFailure && "has-failure")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        title={text.tasksTitle}
      >
        {count > 0 ? <span className="shell-task-ring" style={{ "--p": `${percent}%` } as CSSProperties} aria-hidden="true" /> : <Icon name="history" />}
        <span className="shell-task-label">{count > 0 && lead ? `${text.kind[lead.kind]} · ${lead.state === "paused" ? text.state.paused : text.step[lead.step]}` : text.tasks}</span>
        {count > 1 ? <span className="shell-task-count">{count}</span> : null}
        {count > 0 && lead ? <span className="shell-task-percent">{percent}%</span> : null}
      </button>
      {open ? <TaskCenterPopover anchor={anchor.current} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function TaskCenterPopover({ anchor, onClose }: { anchor: HTMLElement | null; onClose: () => void }) {
  const language = useLanguage();
  const text = shellText(language);
  const tasks = useTaskStore();
  const active = [tasks.generation, tasks.batch, ...Object.values(tasks.textJobs)].filter((record): record is TaskRecord => isActive(record));
  const recent = tasks.recent.filter((record) => !active.some((item) => item.id === record.id));
  const now = useNow(true);
  const panel = useRef<HTMLDivElement>(null);
  const rect = anchor?.getBoundingClientRect();
  useEffect(() => {
    panel.current?.focus();
    // Navigating anywhere (rail, palette, task "前往") closes the popover.
    const offNavigate = useAppStore.subscribe((state, previous) => {
      if (state.activeTab !== previous.activeTab || state.showSettings !== previous.showSettings) onClose();
    });
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); anchor?.focus(); } };
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !anchor?.contains(target)) onClose();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => { offNavigate(); document.removeEventListener("keydown", onKey, true); document.removeEventListener("pointerdown", onDown, true); };
  }, [anchor, onClose]);
  return (
    <div
      ref={panel}
      className="shell-task-popover"
      role="dialog"
      aria-label={text.tasksTitle}
      tabIndex={-1}
      style={{ top: (rect?.bottom ?? 40) + 6, right: Math.max(8, window.innerWidth - (rect?.right ?? window.innerWidth - 8)) }}
    >
      <header><strong>{text.tasksTitle}</strong>{recent.length ? <button type="button" className="btn btn-sm btn-ghost" onClick={() => useTaskStore.getState().dismissRecent()}>{text.clearRecent}</button> : null}</header>
      {active.length === 0 && recent.length === 0 ? <p className="shell-task-empty">{text.tasksEmpty}</p> : null}
      {active.map((record) => <TaskRow key={record.id} record={record} now={now} onNavigate={onClose} />)}
      {recent.length ? <h3>{text.recent}</h3> : null}
      {recent.map((record) => <TaskRow key={record.id} record={record} now={now} onNavigate={onClose} />)}
    </div>
  );
}

function tabForKind(kind: TaskRecord["kind"]): ActiveTab {
  switch (kind) {
    case "inpaint": return "inpaint";
    case "upscale": case "director": return "postprocess";
    case "reverse": return "inspect";
    case "convert": return "convert";
    case "batchRedraw": return "tools";
    default: return "generate";
  }
}

export function TaskRow({ record, now, onNavigate, compact = false }: { record: TaskRecord; now: number; onNavigate?: () => void; compact?: boolean }) {
  const language = useLanguage();
  const text = shellText(language);
  const queuePaused = useAppStore((state) => state.queuePaused);
  const running = record.state === "running" || record.state === "paused";
  const percent = taskPercent(record);
  const current = Math.min(record.total, record.done + record.failed + (running ? 1 : 0));
  const isGeneration = !["batchRedraw", "reverse", "convert"].includes(record.kind);
  const details = [
    running && (record.total > 1 || isGeneration) ? fill(text.progress, { current: Math.max(current, 1), total: record.total }) : "",
    !running && record.total > 1 ? fill(text.processed, { current: record.done + record.failed, total: record.total }) : "",
    record.done > 0 && record.total > 1 ? fill(text.saved, { n: record.done }) : "",
    record.failed > 0 ? fill(text.failedCount, { n: record.failed }) : "",
    record.waiting > 0 && running ? fill(text.waitingCount, { n: record.waiting }) : "",
    running && record.currentStep && record.totalSteps ? fill(text.sampling, { step: record.currentStep, steps: record.totalSteps }) : "",
  ].filter(Boolean);
  return (
    <article className={clsx("shell-task-row", `is-${record.state}`, compact && "is-compact")} aria-live={running ? "polite" : undefined}>
      <div className="shell-task-row-head">
        <span className={clsx("shell-task-state", `is-${record.state}`)}>{text.state[record.state]}</span>
        <strong>{text.kind[record.kind]}{record.label ? ` · ${record.label}` : ""}</strong>
        <time title={clockTime(record.updatedAt)}>{text.updatedAt} {relative(language, record.updatedAt, now)}</time>
      </div>
      <div className="shell-task-step">{record.state === "paused" ? text.state.paused : text.step[record.step]}{details.length ? ` · ${details.join(" · ")}` : ""}</div>
      {running ? (
        <div className="shell-task-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <span style={{ width: `${percent}%` }} />
        </div>
      ) : null}
      {!compact && record.message && (record.state === "failed" || record.state === "cancelled" || record.state === "done") ? <p className="shell-task-message" title={record.message}>{record.message}</p> : null}
      {!compact ? (
        <div className="shell-task-actions">
          {running && isGeneration && record.kind === "generate" ? (
            <button type="button" className="btn btn-sm" onClick={() => useAppStore.getState().togglePause()}>{queuePaused ? text.resume : text.pause}</button>
          ) : null}
          {running && isGeneration ? (
            <button type="button" className="btn btn-sm btn-danger" onClick={() => void useAppStore.getState().cancel()}>{text.stop}</button>
          ) : null}
          {running && record.kind === "batchRedraw" ? (
            <button type="button" className="btn btn-sm btn-danger" onClick={() => useAppStore.getState().requestBatchCancel()}>{text.stop}</button>
          ) : null}
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => {
            if (record.kind === "batchRedraw") openTool("redraw"); else navigateTo(tabForKind(record.kind));
            onNavigate?.();
          }}>{text.open}</button>
        </div>
      ) : null}
    </article>
  );
}

/** Inline progress beside the run button: step, count, last update. */
export function GenerationProgressLine() {
  const record = useTaskStore((state) => state.generation);
  const running = isActive(record);
  const now = useNow(running);
  if (!record || !running) return null;
  return <TaskRow record={record} now={now} compact />;
}

/* ── Command palette ──────────────────────────────────────────────────────── */
export function CommandPalette() {
  const language = useLanguage();
  const text = shellText(language);
  const ft = useFeatureText();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const restore = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const show = () => { restore.current = document.activeElement as HTMLElement | null; setQuery(""); setCursor(0); setOpen(true); };
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && key === "k") { event.preventDefault(); show(); }
      else if ((event.ctrlKey || event.metaKey) && !event.altKey && key === "\\") { event.preventDefault(); toggleRail(); }
    };
    window.addEventListener(SHELL_EVENTS.palette, show);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener(SHELL_EVENTS.palette, show); window.removeEventListener("keydown", onKey); };
  }, []);

  const commands = useMemo<CommandItem[]>(() => {
    if (!open) return [];
    const items = getLocalizedTabItems(language);
    const settingsNav = getSettingsShellText(language).nav as Record<string, string>;
    const extraSettingLabels: Record<string, string> = { sound: ft("提示音"), mcp: ft("MCP 服务") };
    const isWindows = window.naiDesktop?.platform === "win32";
    const pages: CommandItem[] = items.map((item) => ({
      id: `page:${item.value}`, label: item.label, hint: `${item.title} · ${item.desc}`, group: text.cmdGroups.page, icon: item.icon,
      keywords: item.value, run: () => navigateTo(item.value as ActiveTab),
    }));
    const tools: CommandItem[] = TOOL_ENTRIES.filter((tool) => (!tool.windowsOnly || isWindows) && (!tool.comfyOnly || Boolean(window.naiComfy))).map((tool) => ({
      id: `tool:${tool.id}`, label: text.tools[tool.id], hint: text.groups.automation, group: text.cmdGroups.tool, icon: tool.icon, keywords: tool.id, run: () => openTool(tool.id),
    }));
    const settings: CommandItem[] = [
      { id: "settings", label: text.settings, hint: text.settingsHint, group: text.cmdGroups.setting, icon: "settings", keywords: "settings preferences", run: () => openSettings() },
      ...SETTINGS_SECTIONS.map((section) => ({
        id: `setting:${section.id}`, label: settingsNav[section.id] ?? extraSettingLabels[section.id] ?? section.id, hint: text.settings, group: text.cmdGroups.setting,
        icon: section.icon, keywords: `${section.id} settings`, run: () => openSettings(section.id),
      })),
    ];
    const actions: CommandItem[] = [
      { id: "act:theme", label: text.actions.theme, hint: "", group: text.cmdGroups.action, icon: "palette", keywords: "theme dark light", run: () => void toggleTheme() },
      { id: "act:stream", label: text.actions.stream, hint: "", group: text.cmdGroups.action, icon: "eye", keywords: "stream preview", run: () => void toggleStreamPreview() },
      { id: "act:tasks", label: text.actions.tasks, hint: "", group: text.cmdGroups.action, icon: "history", keywords: "tasks queue progress", run: () => window.dispatchEvent(new Event(SHELL_EVENTS.tasks)) },
      { id: "act:history", label: text.actions.history, hint: "", group: text.cmdGroups.action, icon: "images", keywords: "history rail", run: () => { navigateTo("generate"); const s = useAppStore.getState(); s.setWsHistoryCollapsed(!s.wsHistoryCollapsed); } },
      { id: "act:rail", label: text.actions.rail, hint: "Ctrl+\\", group: text.cmdGroups.action, icon: "sliders", keywords: "navigation sidebar", run: toggleRail },
      { id: "act:output", label: text.actions.output, hint: "", group: text.cmdGroups.action, icon: "folder", keywords: "output folder explorer", run: openOutputDir },
      { id: "act:onboarding", label: text.actions.onboarding, hint: "", group: text.cmdGroups.action, icon: "help", keywords: "onboarding guide wizard", run: () => useAppStore.getState().setShowOnboarding(true) },
      { id: "act:layout", label: text.actions.layout, hint: "", group: text.cmdGroups.action, icon: "info", keywords: "layout changes moved", run: () => window.dispatchEvent(new Event(SHELL_EVENTS.notice)) },
      { id: "act:docs", label: text.actions.docs, hint: "", group: text.cmdGroups.action, icon: "externalLink", keywords: "docs help", run: () => window.naiDesktop.openExternal(DOCS_URL) },
    ];
    return [...pages, ...tools, ...settings, ...actions];
  }, [open, language, text, ft]);

  const results = useMemo(() => rankCommands(commands, query), [commands, query]);
  useEffect(() => { setCursor(0); }, [query]);
  useEffect(() => { if (open) requestAnimationFrame(() => input.current?.focus()); }, [open]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;
  const close = (focusBack = true) => { setOpen(false); if (focusBack) restore.current?.focus?.(); };
  const run = (item: CommandItem | undefined) => { if (!item) return; close(false); item.run(); };
  return (
    <AppPortal>
      <div className="shell-palette-backdrop" onMouseDown={() => close()}>
        <div className="shell-palette" role="dialog" aria-modal="true" aria-label={text.paletteTitle} onMouseDown={(event) => event.stopPropagation()}>
          <div className="shell-palette-input">
            <Icon name="search" />
            <input
              ref={input}
              value={query}
              placeholder={text.search}
              role="combobox"
              aria-expanded="true"
              aria-controls="shell-palette-list"
              aria-activedescendant={results[cursor] ? `shell-cmd-${cursor}` : undefined}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "ArrowDown") { event.preventDefault(); setCursor((value) => Math.min(results.length - 1, value + 1)); }
                else if (event.key === "ArrowUp") { event.preventDefault(); setCursor((value) => Math.max(0, value - 1)); }
                else if (event.key === "Enter") { event.preventDefault(); run(results[cursor]); }
                else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
              }}
            />
          </div>
          <div className="shell-palette-list" id="shell-palette-list" role="listbox" ref={list}>
            {results.length === 0 ? <p className="shell-palette-empty">{text.searchEmpty}</p> : results.map((item, index) => (
              <button
                type="button"
                role="option"
                id={`shell-cmd-${index}`}
                data-index={index}
                aria-selected={index === cursor}
                key={item.id}
                className={clsx("shell-palette-item", index === cursor && "active")}
                onMouseMove={() => setCursor(index)}
                onClick={() => run(item)}
                tabIndex={-1}
              >
                <Icon name={item.icon} />
                <span className="shell-palette-label">{item.label}</span>
                {item.hint ? <small>{item.hint}</small> : null}
                <em>{item.group}</em>
              </button>
            ))}
          </div>
          <footer className="shell-palette-footer">{text.paletteHint}</footer>
        </div>
      </div>
    </AppPortal>
  );
}

/* ── First-run notice about the reorganized layout ────────────────────────── */
export function LayoutNotice() {
  const language = useLanguage();
  const text = shellText(language);
  const showOnboarding = useAppStore((state) => state.showOnboarding);
  const [visible, setVisible] = useState(() => localStorage.getItem(NOTICE_KEY) !== "1" && !new URLSearchParams(window.location.search).get("uiCapture"));
  const [details, setDetails] = useState(false);
  useEffect(() => {
    const show = () => { setVisible(true); setDetails(true); };
    window.addEventListener(SHELL_EVENTS.notice, show);
    return () => window.removeEventListener(SHELL_EVENTS.notice, show);
  }, []);
  if (!visible || showOnboarding) return null;
  const dismiss = () => { try { localStorage.setItem(NOTICE_KEY, "1"); } catch { /* reminder only */ } setVisible(false); setDetails(false); };
  return (
    <aside className={clsx("shell-layout-notice", details && "is-expanded")} role="status">
      <div className="shell-layout-notice-main">
        <Icon name="info" />
        <div><strong>{text.layoutNoticeTitle}</strong><p>{text.layoutNoticeBody}</p></div>
        <div className="shell-layout-notice-actions">
          <button type="button" className="btn btn-sm" aria-expanded={details} onClick={() => setDetails((value) => !value)}>{text.layoutNoticeMore}</button>
          <button type="button" className="btn btn-sm btn-primary" onClick={dismiss}>{text.dismiss}</button>
        </div>
      </div>
      {details ? (
        <table className="shell-layout-changes">
          <tbody>{text.layoutChanges.map(([before, after]) => <tr key={before}><td>{before}</td><td aria-hidden="true">→</td><td>{after}</td></tr>)}</tbody>
        </table>
      ) : null}
    </aside>
  );
}
