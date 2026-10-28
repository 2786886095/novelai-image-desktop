import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { metadataRecoveryText } from "./metadata-recovery-i18n";
import { OFFICIAL_METADATA_ORIGINAL } from "../shared/official-metadata-result";

// Execute the actual Inspector handlers and promises in a deterministic hook
// harness. This is not a DOM/GUI acceptance test or a substitute for it.
const harness = vi.hoisted(() => {
  type Slot = { value?: unknown; deps?: unknown[]; cleanup?: () => void };
  const slots: Slot[] = [];
  const effects: Array<() => void> = [];
  let cursor = 0;
  const changed = (a?: unknown[], b?: unknown[]) => !a || !b || a.length !== b.length || a.some((x, i) => !Object.is(x, b[i]));
  return {
    slots, effects,
    store: { settings: { language: "zh-CN" }, activeTab: "metadata", setToast: vi.fn() },
    read: vi.fn(), loadMode: vi.fn(), saveMode: vi.fn(), loadSnapshot: vi.fn(), saveSnapshot: vi.fn(),
    history: vi.fn(), groups: vi.fn(),
    begin() { cursor = 0; },
    state(initial: unknown) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[i].value, (value: unknown) => { slots[i].value = typeof value === "function" ? value(slots[i].value) : value; }];
    },
    ref(initial: unknown) { const i = cursor++; return (slots[i] ??= { value: { current: initial } }).value; },
    memo(factory: () => unknown, deps?: unknown[]) {
      const i = cursor++;
      if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: factory(), deps };
      return slots[i].value;
    },
    effect(callback: () => void | (() => void), deps?: unknown[]) {
      const i = cursor++;
      if (!slots[i] || changed(slots[i].deps, deps)) {
        const previous = slots[i]?.cleanup;
        slots[i] = { deps };
        effects.push(() => { previous?.(); const cleanup = callback(); slots[i].cleanup = typeof cleanup === "function" ? cleanup : undefined; });
      }
    },
    flushEffects() { while (effects.length) effects.shift()!(); },
    reset() { for (const slot of slots) slot.cleanup?.(); slots.length = 0; effects.length = 0; cursor = 0; },
  };
});

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: (value: unknown) => harness.state(value),
  useRef: (value: unknown) => harness.ref(value),
  useMemo: (factory: () => unknown, deps?: unknown[]) => harness.memo(factory, deps),
  useCallback: (callback: unknown, deps?: unknown[]) => harness.memo(() => callback, deps),
  useEffect: (callback: () => void | (() => void), deps?: unknown[]) => harness.effect(callback, deps),
}));
vi.mock("./store", () => ({ useAppStore: (selector: (state: typeof harness.store) => unknown) => selector(harness.store) }));
vi.mock("./metadata-recovery", () => ({
  loadMetadataRecoveryMode: harness.loadMode, saveMetadataRecoveryMode: harness.saveMode,
  readImageMetadataForRecovery: harness.read,
}));
vi.mock("./metadata-snapshot", () => ({
  loadMetadataSnapshot: harness.loadSnapshot, saveMetadataSnapshot: harness.saveSnapshot,
  metadataSnapshotToFile: vi.fn(),
}));
vi.mock("./png-meta", () => ({
  inspectImageMetadata: (meta: Record<string, string>) => ({
    kind: "novelai", software: "NovelAI", imported: {}, characterCaptions: [], entries: [], warnings: [], rawMetadata: meta, rawText: JSON.stringify(meta),
  }),
}));
vi.mock("./metadata-selection", () => ({ metadataApplyKeys: () => [] }));
vi.mock("./MetadataApplyPanel", () => ({ MetadataApplyPanel: () => null }));
vi.mock("./components/CharacterEditing", () => ({ AnimatedCollapse: () => null }));
vi.mock("./components/ui", () => ({ Button: () => null, IconText: () => null, SelectMenu: () => null }));
vi.mock("./components/icons", () => ({ Icon: () => null }));

import MetadataInspector from "./MetadataInspector";

type Node = ReactElement<Record<string, any>>;
function walk(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(walk);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Node;
  return [node, ...walk(node.props.children)];
}
let tree: Node;
function render() { harness.begin(); tree = MetadataInspector({ onBack: vi.fn() }) as Node; harness.flushEffects(); return tree; }
function nodes() { return walk(tree); }
function modeSelect() { return nodes().find((node) => node.props.id === "metadata-recovery-mode")!; }
function chooseMode(mode: "online" | "offline") { modeSelect().props.onChange(mode); render(); }
function historySummary() { return nodes().find(node => node.props.className === "metadata-history-summary")!; }
function historyCount() { return String(walk(historySummary()).find(node => node.type === "em")!.props.children); }
function openHistory() { historySummary().props.onClick(); render(); render(); }
function retryHistory() { nodes().find(node => node.props.children === metadataRecoveryText("zh-CN").historyRetry)!.props.onClick(); render(); }
function historyRows() { return nodes().filter(node => /^metadata-history-item(?: |$)/.test(node.props.className ?? "")); }
function historyFixture(count: number) { return Array.from({ length: count }, (_, i) => ({ id: `fixture-${i}`, filePath: `F:/fixture/${i}.png`, fileUrl: `local-media://fixture/${i}`, width: 832, height: 1216, groupId: i % 2 ? "g1" : undefined })); }
function importFile(file: File) { nodes().find((node) => node.type === "input" && node.props.type === "file")!.props.onChange({ target: { files: [file], value: "fixture.png" } }); render(); }
function reportSource() { return nodes().find((node) => node.props.report)?.props.report?.rawMetadata?.Source; }
function textNodes(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(textNodes);
  if (value && typeof value === "object" && "props" in value) return textNodes((value as Node).props.children);
  return [];
}
function visibleText() { return textNodes(tree).join(" "); }
function fixtureFile(name: string, arrayBuffer = () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer)) {
  return { name, arrayBuffer: vi.fn(arrayBuffer) } as unknown as File;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((ok, bad) => { resolve = ok; reject = bad; });
  return { promise, resolve, reject };
}
async function settle() { for (let i = 0; i < 12; i += 1) await Promise.resolve(); render(); }

beforeEach(async () => {
  harness.reset();
  vi.clearAllMocks();
  harness.store.settings.language = "zh-CN";
  harness.store.activeTab = "metadata";
  harness.loadMode.mockReturnValue("online");
  harness.saveMode.mockReturnValue(true);
  harness.loadSnapshot.mockResolvedValue(null);
  harness.saveSnapshot.mockResolvedValue(undefined);
  harness.read.mockReset().mockResolvedValue({ Software: "NovelAI", Source: "fixture" });
  harness.history.mockReset().mockResolvedValue([]);
  harness.groups.mockReset().mockResolvedValue([]);
  vi.stubGlobal("window", { naiDesktop: { getHistory: harness.history, getHistoryGroups: harness.groups } });
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:fixture"), revokeObjectURL: vi.fn() });
  render(); await settle();
});
afterEach(() => { harness.reset(); vi.unstubAllGlobals(); });

describe("metadata recovery mode UI handlers (hook harness, not GUI)", () => {
  it("uses the shared SelectMenu and retains the privacy description association", () => {
    expect(nodes().some(node => node.type === "select")).toBe(false);
    expect(modeSelect().props).toMatchObject({ ariaLabel: "读取模式", ariaDescribedBy: "metadata-recovery-privacy", value: "online" });
    expect(modeSelect().props.options.map((option: { value: string }) => option.value)).toEqual(["online", "offline"]);
  });
  it("defaults online, explains local image processing, and uses the explicit saved mode", () => {
    expect(modeSelect().props.value).toBe("online");
    expect(visibleText()).toContain(metadataRecoveryText("zh-CN").onlinePrivacy);
    expect(visibleText()).not.toContain("零积分 · 不调用 AI · 不发送网络请求");
    harness.reset(); harness.loadMode.mockReturnValue("offline"); render();
    expect(modeSelect().props.value).toBe("offline");
    expect(visibleText()).toContain(metadataRecoveryText("zh-CN").offlinePrivacy);
  });

  it("shows an online failure without silent fallback and manually rereads the same original offline", async () => {
    const file = fixtureFile("original.png");
    harness.read.mockRejectedValueOnce(new Error("offline network fixture")).mockResolvedValueOnce({ Source: "offline-result" });
    importFile(file); await settle();
    expect(modeSelect().props.value).toBe("online"); expect(harness.read).toHaveBeenCalledTimes(1);
    expect(reportSource()).toBeUndefined();
    expect(nodes().some((node) => node.props.role === "alert")).toBe(true);
    const text = metadataRecoveryText("zh-CN");
    expect(visibleText()).toContain(text.onlineFailed);
    nodes().find((node) => node.props.children === text.chooseOffline)!.props.onClick();
    render(); await settle();
    expect(harness.saveMode).toHaveBeenCalledWith("offline");
    expect(harness.read.mock.calls.map((call) => call[1])).toEqual(["online", "offline"]);
    expect(file.arrayBuffer).toHaveBeenCalledTimes(2); expect(reportSource()).toBe("offline-result");
  });

  it("new mode wins when a pending online result resolves later; no old snapshot reload", async () => {
    const online = deferred<Record<string, string>>();
    harness.read.mockImplementation((_buffer, mode) => mode === "online" ? online.promise : Promise.resolve({ Source: "offline-new" }));
    importFile(fixtureFile("race.png")); await settle();
    chooseMode("offline"); await settle(); expect(reportSource()).toBe("offline-new");
    online.resolve({ Source: "online-old" }); await settle();
    expect(reportSource()).toBe("offline-new"); expect(harness.loadSnapshot).toHaveBeenCalledTimes(1);
    expect(harness.read.mock.calls.map((call) => call[1])).toEqual(["online", "offline"]);
  });

  it("aborts the previous mode's signal before starting the new mode's read", async () => {
    const online = deferred<Record<string, string>>();
    const offline = deferred<Record<string, string>>();
    harness.read.mockImplementation((_buffer, mode) => mode === "online" ? online.promise : offline.promise);
    importFile(fixtureFile("cancel-mode.png")); await settle();
    const onlineSignal = harness.read.mock.calls[0][2] as AbortSignal;
    expect(onlineSignal.aborted).toBe(false);
    chooseMode("offline"); await settle();
    const offlineSignal = harness.read.mock.calls[1][2] as AbortSignal;
    expect(onlineSignal.aborted).toBe(true); expect(offlineSignal.aborted).toBe(false);
    online.reject(new DOMException("cancelled", "AbortError")); await settle();
    expect(nodes().some((node) => node.props.role === "alert")).toBe(false);
    offline.resolve({ Source: "offline-after-cancel" }); await settle();
    expect(reportSource()).toBe("offline-after-cancel");
  });

  it.each(["leave", "unmount"])("aborts an active read on %s", async (action) => {
    const pending = deferred<Record<string, string>>();
    harness.read.mockImplementation(() => pending.promise);
    importFile(fixtureFile("cancel-page.png")); await settle();
    const signal = harness.read.mock.calls[0][2] as AbortSignal;
    expect(signal.aborted).toBe(false);
    if (action === "leave") { harness.store.activeTab = "generate"; render(); }
    else harness.reset();
    expect(signal.aborted).toBe(true);
  });

  it("captures mode before arrayBuffer and does not launch an obsolete online read afterward", async () => {
    const buffer = deferred<ArrayBuffer>();
    const file = fixtureFile("delayed-file.png");
    vi.mocked(file.arrayBuffer).mockImplementationOnce(() => buffer.promise).mockResolvedValue(new Uint8Array([4]).buffer);
    importFile(file); chooseMode("offline"); await settle();
    expect(harness.read.mock.calls.map((call) => call[1])).toEqual(["offline"]);
    buffer.resolve(new Uint8Array([5]).buffer); await settle();
    expect(harness.read.mock.calls.map((call) => call[1])).toEqual(["offline"]);
  });

  it("retains a newer offline failure and no old report when an earlier online read succeeds", async () => {
    const online = deferred<Record<string, string>>();
    harness.read.mockImplementation((_buffer, mode) => mode === "online" ? online.promise : Promise.reject(new Error("offline fixture failure")));
    importFile(fixtureFile("failure-race.png")); await settle(); chooseMode("offline"); await settle();
    expect(reportSource()).toBeUndefined(); expect(visibleText()).toContain(metadataRecoveryText("zh-CN").offlineFailed);
    online.resolve({ Source: "stale-success" }); await settle();
    expect(reportSource()).toBeUndefined(); expect(visibleText()).toContain(metadataRecoveryText("zh-CN").offlineFailed);
  });

  it("failed localStorage saves do not revert the chosen mode or prevent current-session reading", async () => {
    harness.saveMode.mockReturnValue(false);
    importFile(fixtureFile("storage.png")); await settle(); chooseMode("offline"); await settle();
    expect(modeSelect().props.value).toBe("offline");
    expect(visibleText()).toContain(metadataRecoveryText("zh-CN").preferenceNotSaved);
    expect(harness.read.mock.calls.map((call) => call[1])).toEqual(["online", "offline"]);
  });

  it("retries the selected mode explicitly, without changing it or using a fallback", async () => {
    harness.read.mockRejectedValueOnce(new Error("fixture failed")).mockResolvedValueOnce({ Source: "retry-result" });
    importFile(fixtureFile("retry.png")); await settle();
    nodes().find((node) => node.props.children === metadataRecoveryText("zh-CN").retry)!.props.onClick();
    render(); await settle();
    expect(harness.read.mock.calls.map((call) => call[1])).toEqual(["online", "online"]);
    expect(harness.saveMode).not.toHaveBeenCalled(); expect(reportSource()).toBe("retry-result");
  });

  it("does not let a previous file overwrite the newest file's report", async () => {
    const first = deferred<Record<string, string>>();
    harness.read.mockImplementationOnce(() => first.promise).mockResolvedValueOnce({ Source: "file-b" });
    importFile(fixtureFile("file-a.png")); await settle(); importFile(fixtureFile("file-b.png")); await settle();
    expect((harness.read.mock.calls[0][2] as AbortSignal).aborted).toBe(true);
    first.resolve({ Source: "file-a" }); await settle();
    expect(reportSource()).toBe("file-b"); expect(visibleText()).toContain("file-b.png");
  });

  it("keeps the official direct EXIF object in raw data while Comment is only a mapping adapter", async () => {
    const original = { prompt: "neutral fixture", seed: 123, steps: 28, scale: 5.5, sm: false, width: 832, height: 1216, uc: "" };
    const mapped = { Comment: JSON.stringify(original) };
    Object.defineProperty(mapped, OFFICIAL_METADATA_ORIGINAL, { value: original, enumerable: false });
    harness.read.mockResolvedValue(mapped);
    importFile(fixtureFile("official-exif.webp")); await settle();
    const report = nodes().find((node) => node.props.report)!.props.report;
    expect(JSON.parse(report.rawText)).toEqual(original);
    expect(typeof JSON.parse(report.rawText).seed).toBe("number");
    expect(typeof JSON.parse(report.rawText).sm).toBe("boolean");
    expect(Object.keys(report.rawMetadata)).toEqual(Object.keys(original));
    expect(report.rawMetadata).not.toHaveProperty("Comment");
    expect(report.rawMetadata.seed).toBe("123"); expect(report.rawMetadata.sm).toBe("false");
    expect(visibleText()).toContain(metadataRecoveryText("zh-CN").mappingWrapper);
  });
});

describe("metadata history state handlers (fixture data only, not user profile)", () => {
  it("does not call an unloaded collapsed picker empty or display a false zero", () => {
    expect(historyCount()).toBe(metadataRecoveryText("zh-CN").historyNotLoaded);
    expect(harness.history).not.toHaveBeenCalled(); expect(harness.groups).not.toHaveBeenCalled();
    expect(visibleText()).not.toContain("该分组中没有可读取的图片");
  });
  it("loads the real 6600 fixture count lazily and renders only the first 60 rows", async () => {
    const pending = deferred<ReturnType<typeof historyFixture>>(); harness.history.mockReturnValue(pending.promise);
    openHistory(); expect(historyCount()).toBe("…");
    pending.resolve(historyFixture(6600)); await settle();
    expect(harness.history).toHaveBeenCalledExactlyOnceWith(); expect(historyCount()).toBe("6600");
    expect(historyRows()).toHaveLength(60); expect(visibleText()).not.toContain("正在读取历史图片");
  });
  it("retains successful history when groups fail and retries the groups without claiming an empty library", async () => {
    harness.history.mockResolvedValue(historyFixture(6600)); harness.groups.mockRejectedValueOnce(Error("fixture group failure"));
    openHistory(); await settle();
    expect(historyCount()).toBe("6600"); expect(historyRows()).toHaveLength(60);
    expect(visibleText()).toContain(metadataRecoveryText("zh-CN").historyGroupsFailed);
    expect(visibleText()).not.toContain("该分组中没有可读取的图片");
    harness.groups.mockResolvedValue([{ id: "g1", name: "Fixture group" }]); retryHistory(); await settle();
    expect(historyCount()).toBe("6600"); expect(harness.history).toHaveBeenCalledTimes(2);
    expect(visibleText()).not.toContain(metadataRecoveryText("zh-CN").historyGroupsFailed);
  });
  it("shows a persistent history error rather than zero and permits an actual retry", async () => {
    harness.history.mockRejectedValueOnce(Error("fixture history failure")); openHistory(); await settle();
    expect(historyCount()).toBe(metadataRecoveryText("zh-CN").historyUnavailable);
    expect(nodes().some(node => node.props.role === "alert" && node.props.children === "无法读取历史图片列表。")).toBe(true);
    expect(visibleText()).not.toContain("该分组中没有可读取的图片");
    harness.history.mockResolvedValue(historyFixture(2)); retryHistory(); await settle();
    expect(historyCount()).toBe("2"); expect(historyRows()).toHaveLength(2); expect(harness.history).toHaveBeenCalledTimes(2);
  });
  it("shows zero only after a successful genuinely empty response", async () => {
    openHistory(); await settle(); expect(historyCount()).toBe("0");
    expect(visibleText()).toContain("该分组中没有可读取的图片");
  });
  it("does not let an older pending page-entry request replace a new list", async () => {
    const old = deferred<ReturnType<typeof historyFixture>>(); harness.history.mockReturnValueOnce(old.promise).mockResolvedValue(historyFixture(4));
    openHistory(); harness.store.activeTab = "generate"; render();
    harness.store.activeTab = "metadata"; render(); await settle(); expect(historyCount()).toBe("4");
    old.resolve(historyFixture(6600)); await settle(); expect(historyCount()).toBe("4");
  });
  it("collapsing a pending picker clears loading, ignores its stale result and can reopen", async () => {
    const old = deferred<ReturnType<typeof historyFixture>>(); harness.history.mockReturnValueOnce(old.promise).mockResolvedValue(historyFixture(3));
    openHistory(); expect(historyCount()).toBe("…"); historySummary().props.onClick(); render(); render();
    expect(historyCount()).toBe(metadataRecoveryText("zh-CN").historyNotLoaded);
    old.resolve(historyFixture(6600)); await settle(); expect(historyCount()).toBe(metadataRecoveryText("zh-CN").historyNotLoaded);
    openHistory(); await settle(); expect(historyCount()).toBe("3");
  });
  it("preserves filtering before pagination and expands only the rendered slice", async () => {
    harness.history.mockResolvedValue(historyFixture(6600)); harness.groups.mockResolvedValue([{ id: "g1", name: "Fixture group" }]); openHistory(); await settle();
    nodes().find(node => node.props.className === "metadata-history-more")!.props.onClick(); render();
    expect(historyRows()).toHaveLength(120); expect(historyCount()).toBe("6600");
    nodes().find(node => node.props.ariaLabel === "图片分组")!.props.onChange("g1"); render(); render();
    expect(historyCount()).toBe("3300"); expect(historyRows()).toHaveLength(60);
  });
});

it("has complete mode/privacy/failure copy", () => {
  const text = metadataRecoveryText("zh-CN");
  expect(Object.values(text).every((value) => value.trim().length > 0)).toBe(true);
  expect(text.online).not.toBe(text.offline); expect(text.onlinePrivacy).not.toBe(text.offlinePrivacy);
  expect(text.onlinePrivacy).toContain("PNG/WebP"); expect(text.onlinePrivacy).toContain("JPEG");
});
