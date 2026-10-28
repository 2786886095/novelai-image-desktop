import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { characterPresetText } from "./character-presets";

// The actual library components and their tag filter run in a hook harness:
// state persists between render passes and effects run after each pass.
// Framework and desktop ports are mocked; these assertions are not a GUI trial.
const harness = vi.hoisted(() => {
  type Slot = { value?: unknown; set?: (value: unknown) => void; deps?: unknown[]; cleanup?: () => void };
  const slots: Slot[] = [];
  const effects: Array<() => void> = [];
  let cursor = 0;
  const changed = (a?: unknown[], b?: unknown[]) => !a || !b || a.length !== b.length || a.some((x, i) => !Object.is(x, b[i]));
  return {
    store: {} as Record<string, any>,
    begin() { cursor = 0; },
    state(initial: unknown) {
      const slot = (slots[cursor++] ??= { value: typeof initial === "function" ? initial() : initial });
      slot.set ??= (value) => { slot.value = typeof value === "function" ? value(slot.value) : value; };
      return [slot.value, slot.set];
    },
    ref(initial: unknown) { return (slots[cursor++] ??= { value: { current: initial } }).value; },
    memo(factory: () => unknown, deps?: unknown[]) {
      const i = cursor++;
      if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: factory(), deps };
      return slots[i].value;
    },
    effect(callback: () => void | (() => void), deps?: unknown[]) {
      const i = cursor++;
      if (slots[i] && !changed(slots[i].deps, deps)) return;
      const previous = slots[i]?.cleanup;
      const slot: Slot = (slots[i] = { deps });
      effects.push(() => {
        previous?.();
        const cleanup = callback();
        slot.cleanup = typeof cleanup === "function" ? cleanup : undefined;
      });
    },
    flush() { while (effects.length) effects.shift()!(); },
    reset() { for (const slot of slots) slot.cleanup?.(); slots.length = 0; effects.length = 0; cursor = 0; },
  };
});
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => harness.state(initial),
  useRef: (initial: unknown) => harness.ref(initial),
  useMemo: (factory: () => unknown, deps?: unknown[]) => harness.memo(factory, deps),
  useCallback: (callback: unknown, deps?: unknown[]) => harness.memo(() => callback, deps),
  useEffect: (callback: () => void | (() => void), deps?: unknown[]) => harness.effect(callback, deps),
  useLayoutEffect: (callback: () => void | (() => void), deps?: unknown[]) => harness.effect(callback, deps),
}));
vi.mock("./store", () => ({
  useAppStore: Object.assign(
    (selector: (state: Record<string, any>) => unknown) => selector(harness.store),
    { getState: () => harness.store },
  ),
}));
import { PositivePromptPresetControl } from "./PositivePromptPresets";
import { NegativePromptLibraryControl } from "./NegativePromptLibrary";
import { PromptChunkControl } from "./PromptChunks";
import { PromptTagFilter, PromptTagInput } from "./components/PromptTagControls";

type Node = ReactElement<Record<string, any>>;
let tree: Node[] = [];
function walk(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(walk);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Node;
  return [node, ...walk(node.props.children)];
}
function visible(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(visible).join("");
  if (value && typeof value === "object" && "props" in value) return visible((value as Node).props.children);
  return "";
}
/** Render passes of a library and the tag filter it shows, running effects after each pass. */
function render(library: () => unknown, passes = 3) {
  for (let pass = 0; pass < passes; pass++) {
    harness.begin();
    const nodes = walk(library());
    for (const filter of nodes.filter((node) => node.type === PromptTagFilter)) {
      nodes.push(...walk(PromptTagFilter(filter.props as Parameters<typeof PromptTagFilter>[0])));
    }
    tree = nodes;
    harness.flush();
  }
}
function click(node: Node | undefined) {
  expect(node, "clickable node").toBeTruthy();
  node!.props.onClick({ preventDefault() {}, stopPropagation() {} });
}
const byClass = (name: string) => tree.find((node) => String(node.props.className ?? "").split(" ").includes(name));
const chips = () => tree
  .filter((node) => node.type === "button" && String(node.props.className).startsWith("prompt-tag-chip"))
  .map((node) => visible(node.props.children) + (node.props["aria-pressed"] ? "*" : ""));
const chip = (label: string) => tree.find((node) => node.type === "button"
  && String(node.props.className).startsWith("prompt-tag-chip") && visible(node.props.children).startsWith(label));
const names = (container: Node | undefined) => walk(container?.props.children).filter((node) => node.type === "strong").map((node) => visible(node));
const button = (label: string) => tree.find((node) => typeof node.props.onClick === "function" && visible(node.props.children).includes(label));

const created = "2026-10-01T00:00:00.000Z";
let settings: Record<string, any>;
beforeEach(() => {
  harness.reset();
  settings = { language: "zh-CN" };
  harness.store = { settings, setToast: vi.fn(), refreshSettings: vi.fn(), setCharCaptions: vi.fn(), activeTab: "generate", params: { model: "nai-diffusion-5-full" }, inpaintModel: "nai-diffusion-5-full-inpainting", charCaptions: [] };
  vi.stubGlobal("window", {
    innerWidth: 1440,
    innerHeight: 960,
    addEventListener() {},
    removeEventListener() {},
    naiDesktop: { reconcileStylePromptPresetImages: async (_id: string, known: unknown) => known },
  });
  vi.stubGlobal("document", { documentElement: { classList: { contains: () => true } }, addEventListener() {}, removeEventListener() {} });
});
afterEach(() => { harness.reset(); vi.unstubAllGlobals(); });
/** What a save does: new settings arrive in the store. */
function storeSettings(patch: Record<string, unknown>) {
  settings = { ...settings, ...patch };
  harness.store.settings = settings;
}

describe("saved-prompt libraries reset a tag filter whose chip disappears (hook harness, not GUI)", () => {
  it("positive presets: deleting the only tagged preset brings back the rest", () => {
    const blue = { id: "p1", name: "蓝发少女", prompt: "1girl, blue hair", tags: ["夜景"], captions: [], createdAt: created, previewImages: [] };
    const rain = { id: "p2", name: "雨夜城市", prompt: "city, night, rain", captions: [], createdAt: created, previewImages: [] };
    storeSettings({ positivePromptPresets: [blue, rain] });
    const library = () => PositivePromptPresetControl({ variant: "bar", value: "1girl", onApply: vi.fn() });
    render(library);
    click(byClass("positive-preset-bar-trigger"));
    render(library);
    click(chip("#夜景"));
    render(library);
    expect(names(byClass("positive-preset-list"))).toEqual(["蓝发少女"]);
    storeSettings({ positivePromptPresets: [rain] });
    render(library);
    expect(chips()).toEqual([]);
    expect(names(byClass("positive-preset-list"))).toEqual(["雨夜城市"]);
    // The new-preset form no longer inherits the removed tag.
    click(button("手动新建"));
    render(library);
    expect(tree.find((node) => node.type === PromptTagInput)?.props.value).toBe("");
  });

  it("positive presets: with other tags left, the filter returns to 全部", () => {
    storeSettings({
      positivePromptPresets: [
        { id: "p1", name: "蓝发少女", prompt: "1girl", tags: ["夜景"], captions: [], createdAt: created, previewImages: [] },
        { id: "p2", name: "雨夜城市", prompt: "city", tags: ["角色"], captions: [], createdAt: created, previewImages: [] },
      ],
    });
    const library = () => PositivePromptPresetControl({ variant: "bar", value: "1girl", onApply: vi.fn() });
    render(library);
    click(byClass("positive-preset-bar-trigger"));
    render(library);
    click(chip("#夜景"));
    render(library);
    storeSettings({ positivePromptPresets: [{ ...settings.positivePromptPresets[0], tags: undefined }, settings.positivePromptPresets[1]] });
    render(library);
    expect(chips()).toEqual(["全部2*", "#角色1", "未加标签1"]);
    expect(names(byClass("positive-preset-list"))).toEqual(["蓝发少女", "雨夜城市"]);
  });

  it("negative library: deleting the only tagged entry brings back the rest", () => {
    storeSettings({
      negativePromptPresets: [
        { id: "n1", name: "通用", prompt: "lowres, bad anatomy", tags: ["通用"], createdAt: created },
        { id: "n2", name: "模糊", prompt: "blurry", createdAt: created },
      ],
    });
    const library = () => NegativePromptLibraryControl({ variant: "bar", value: "lowres", onApply: vi.fn() });
    render(library);
    click(byClass("negative-library-trigger"));
    render(library);
    click(chip("#通用"));
    render(library);
    const list = () => tree.find((node) => node.type === "nav");
    expect(names(list())).toEqual(["通用"]);
    storeSettings({ negativePromptPresets: [settings.negativePromptPresets[1]] });
    render(library);
    expect(chips()).toEqual([]);
    expect(names(list())).toEqual(["模糊"]);
  });

  it("prompt chunks: removing the only tag, or tagging the last untagged chunk, brings back the list", () => {
    const outfit = { id: "c1", name: "服装", content: "white dress", tags: ["衣服"], createdAt: created, updatedAt: created };
    const smile = { id: "c2", name: "表情", content: "smile", createdAt: created, updatedAt: created };
    storeSettings({ promptChunks: [outfit, smile] });
    const library = () => PromptChunkControl({ value: "1girl", onApply: vi.fn() });
    render(library);
    click(byClass("prompt-chunk-trigger"));
    render(library);
    const list = () => names(byClass("prompt-chunk-list"));
    click(chip("#衣服"));
    render(library);
    expect(list()).toEqual(["服装"]);
    storeSettings({ promptChunks: [{ ...outfit, tags: undefined }, smile] });
    render(library);
    expect(list()).toEqual(["服装", "表情"]);

    storeSettings({ promptChunks: [outfit, smile] });
    render(library);
    click(chip("未加标签"));
    render(library);
    expect(list()).toEqual(["表情"]);
    expect(chips()).toContain("未加标签1*");
    storeSettings({ promptChunks: [outfit, { ...smile, tags: ["表情"] }] });
    render(library);
    expect(chips()[0]).toBe("全部2*");
    expect(chips().slice(1).sort()).toEqual(["#表情1", "#衣服1"].sort());
    expect(list()).toEqual(["服装", "表情"]);
  });
});

describe("new entries skip a tag filter that went stale while the library was closed (hook harness, not GUI)", () => {
  const labelled = (label: string) => tree.find((node) => node.props["aria-label"] === label);
  const draftTags = () => tree.find((node) => node.type === PromptTagInput)?.props.value;

  it("positive presets: the bar's 保存当前 keeps a tag that exists and drops one that was removed", () => {
    const night = { id: "p1", name: "蓝发少女", prompt: "1girl", tags: ["夜景"], captions: [], createdAt: created, previewImages: [] };
    const role = { id: "p2", name: "雨夜城市", prompt: "city", tags: ["角色"], captions: [], createdAt: created, previewImages: [] };
    storeSettings({ positivePromptPresets: [night, role] });
    const library = () => PositivePromptPresetControl({ variant: "bar", value: "1girl, smile", onApply: vi.fn() });
    render(library);
    click(byClass("positive-preset-bar-trigger"));
    render(library);
    click(chip("#角色"));
    render(library);
    click(labelled("关闭"));
    render(library);
    click(byClass("positive-preset-save-current"));
    render(library);
    expect(draftTags()).toBe("角色");
    click(button("取消"));
    render(library);
    click(labelled("关闭"));
    render(library);
    // Another library instance (each character row has one) or a restore removes the tag.
    storeSettings({ positivePromptPresets: [night, { ...role, tags: undefined }] });
    render(library);
    click(byClass("positive-preset-save-current"));
    render(library);
    expect(draftTags()).toBe("");
    // The filter is reset at the same time, so the list is complete as soon as the editor closes.
    click(button("取消"));
    render(library, 1);
    expect(chips()[0]).toBe("全部2*");
    expect(names(byClass("positive-preset-list"))).toEqual(["蓝发少女", "雨夜城市"]);
  });

  it("negative library: the bar's 保存当前 keeps a tag that exists and drops one that was removed", () => {
    const general = { id: "n1", name: "通用", prompt: "lowres, bad anatomy", tags: ["通用"], createdAt: created };
    const blur = { id: "n2", name: "模糊", prompt: "blurry", tags: ["画质"], createdAt: created };
    storeSettings({ negativePromptPresets: [general, blur] });
    const library = () => NegativePromptLibraryControl({ variant: "bar", value: "lowres", onApply: vi.fn() });
    render(library);
    click(byClass("negative-library-trigger"));
    render(library);
    click(chip("#画质"));
    render(library);
    click(labelled("关闭"));
    render(library);
    click(byClass("negative-library-save-current"));
    render(library, 1);
    expect(draftTags()).toBe("画质");
    click(button("取消"));
    render(library);
    click(labelled("关闭"));
    render(library);
    storeSettings({ negativePromptPresets: [general, { ...blur, tags: undefined }] });
    render(library);
    click(byClass("negative-library-save-current"));
    render(library, 1);
    expect(draftTags()).toBe("");
    expect(chips()[0]).toBe("全部2*");
  });
});

describe("character presets on the inpaint tab (hook harness, not GUI)", () => {
  const role = (id: string) => ({ id, enabled: true, prompt: id, negativePrompt: "", useCoords: false, x: 0.5, y: 0.5 });
  const preset = (count: number) => ({
    id: "trio",
    name: "角色组",
    prompt: "",
    captions: Array.from({ length: count }, (_, i) => ({ prompt: `role ${i}`, negativePrompt: "", useCoords: false, x: 0.5, y: 0.5 })),
    createdAt: created,
    previewImages: [],
  });
  function openWith(count: number) {
    storeSettings({ positivePromptPresets: [preset(count)] });
    const library = () => PositivePromptPresetControl({ variant: "bar", value: "1girl", onApply: vi.fn() });
    render(library);
    click(byClass("positive-preset-bar-trigger"));
    render(library);
    return library;
  }

  it("checks the character limit of the inpaint model, not the generate model", () => {
    Object.assign(harness.store, {
      activeTab: "inpaint",
      params: { model: "nai-diffusion-5-full" },
      inpaintModel: "nai-diffusion-4-5-full-inpainting",
      charCaptions: ["a", "b", "c", "d", "e"].map(role),
    });
    const library = openWith(3);
    click(button("追加这些角色"));
    render(library);
    expect(harness.store.setCharCaptions).not.toHaveBeenCalled();
    expect(visible(byClass("positive-preset-status"))).toBe(characterPresetText("zh-CN").capacity);

    harness.store.activeTab = "generate";
    click(button("追加这些角色"));
    expect(harness.store.setCharCaptions).toHaveBeenCalledTimes(1);
    expect(harness.store.setCharCaptions.mock.calls[0][0]).toHaveLength(8);
  });

  it("allows a preset the inpaint model can hold even if the generate model cannot", () => {
    Object.assign(harness.store, {
      activeTab: "inpaint",
      params: { model: "nai-diffusion-4-5-full" },
      inpaintModel: "nai-diffusion-5-full-inpainting",
    });
    const library = openWith(7);
    click(button("应用 · 7"));
    render(library);
    expect(harness.store.setCharCaptions).toHaveBeenCalledTimes(1);
    expect(harness.store.setCharCaptions.mock.calls[0][0]).toHaveLength(7);
  });
});
