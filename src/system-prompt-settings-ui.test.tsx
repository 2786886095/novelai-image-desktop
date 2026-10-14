import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { createDefaultImageTaskPromptPreset } from "./tavern/image-task-preset";
import { importImageSystemPrompt } from "./tavern/system-prompt-import";
import { imageTaskPromptPresetFromSampler } from "./tavern/image-task-preset";
// Actual SettingsModal handlers with deterministic hooks, not a DOM/GUI claim.
const h = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, settings: {} as any, writes: vi.fn(), section: "convert-api" }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: (initial: any) => { const n = h.cursor++; if (!(n in h.slots)) h.slots[n] = typeof initial === "function" ? initial() : initial; return [h.slots[n], (next: any) => { h.slots[n] = typeof next === "function" ? next(h.slots[n]) : next; }]; },
  useRef: (initial: any) => { const n = h.cursor++; return h.slots[n] ??= { current: initial }; },
  useMemo: (fn: () => any) => fn(), useCallback: (fn: any) => fn, useEffect: () => {}, useLayoutEffect: () => {},
}));
vi.mock("./store", () => ({ useAppStore: Object.assign((selector: any) => selector({ settings: h.settings, refreshSettings: async () => {}, setShowOnboarding: vi.fn() }), { getState: () => ({ settings: h.settings, setToast: vi.fn() }) }) }));
vi.mock("./use-studio-motion", () => ({ useStudioRegionMotion: () => ({ current: null }) }));
vi.mock("./prompt-ui-settings", async original => ({ ...await original<typeof import("./prompt-ui-settings")>(), takeRequestedSettingsSection: () => h.section }));
vi.mock("./components/confirm", () => ({ confirmAction: async () => true }));
import { SettingsModal } from "./App";
type Node = ReactElement<Record<string, any>>;
const walk = (value: any): Node[] => Array.isArray(value) ? value.flatMap(walk) : value && typeof value === "object" && "props" in value ? [value, ...walk(value.props.children)] : [];
const render = () => { h.cursor = 0; return walk(SettingsModal({ onClose: () => {} })); };
const input = () => render().find(n => n.type === "input" && n.props.type === "file" && n.props.accept?.includes(".md"))!;
const tick = () => new Promise(r => setTimeout(r, 10));
const wait = async (condition: () => boolean) => { for (let n = 0; n < 100 && !condition(); n++) await tick(); expect(condition()).toBe(true); };
beforeEach(() => {
  h.slots = []; h.cursor = 0; h.section = "convert-api"; h.writes.mockReset();
  h.settings = { language: "en-US", reverseConvertPromptPresets: [createDefaultImageTaskPromptPreset("convert"), createDefaultImageTaskPromptPreset("reverse")], convertSystemPromptPresetId: "builtin-ig5-convert", reverseSystemPromptPresetId: "builtin-ig5-reverse", reverseConvertPromptPresetId: "builtin-ig5-convert", reverseConvertDshEnabled: false, visionApiUrl: "https://fixture.invalid/v1", visionApiKey: "", visionApiModel: "fixture", convertApiUrl: "https://fixture.invalid/v1", convertApiKey: "", convertApiModel: "fixture", convertPromptTemplates: { tags: "USER TEMPLATE", natural: "", mixed: "" }, reversePromptTemplates: { tags: "USER REVERSE", natural: "", mixed: "" }, reversePromptTemplatesV45: {}, convertPromptTemplatesV45: {}, aiMaxTokens: 4096 };
  vi.stubGlobal("localStorage", { getItem: () => null });
  vi.stubGlobal("window", { location: { search: "" }, naiDesktop: { setSetting: async (key: string, value: any) => { h.writes(key, structuredClone(value)); h.settings[key] = structuredClone(value); } } });
});
afterEach(() => { vi.unstubAllGlobals(); });
it.each(["convert-api", "ai-reverse"])("imports full UTF-8 MD through the %s handler, selecting only that feature and keeping templates/off", async section => {
  h.section = section; const before = structuredClone(h.settings), node = input();
  expect(node.props.accept).toContain(".txt"); expect(node.props.accept).toContain(".json");
  node.props.onChange({ target: { files: [new File(["# Imported\n完整正文\n"], "fixture.md")] } });
  await wait(() => h.writes.mock.calls.length >= 2);
  const imported = h.settings.reverseConvertPromptPresets[0];
  expect(imported.systemPrompt).toBe("# Imported\n完整正文\n"); expect(imported.sourceHash).toMatch(/^[A-F0-9]{64}$/);
  const changed = section === "ai-reverse" ? "reverseSystemPromptPresetId" : "convertSystemPromptPresetId", unchanged = section === "ai-reverse" ? "convertSystemPromptPresetId" : "reverseSystemPromptPresetId";
  expect(h.settings[changed]).toBe(imported.id); expect(h.settings[unchanged]).toBe(before[unchanged]);
  expect(h.settings.reverseConvertDshEnabled).toBe(false);
  expect(h.settings.convertPromptTemplates).toEqual(before.convertPromptTemplates); expect(h.settings.reversePromptTemplates).toEqual(before.reversePromptTemplates);
});
it("rejects invalid UTF-8 through the actual file handler without any settings write", async () => {
  const before = structuredClone(h.settings);
  input().props.onChange({ target: { files: [new File([new Uint8Array([0xc3, 0x28])], "bad.txt")] } });
  await wait(() => render().some(n => n.props.role === "status" && n.props.children.includes("UTF-8")));
  expect(h.writes).not.toHaveBeenCalled(); expect(h.settings).toEqual(before);
});
it.each(["malformed-json", "bytes"])("rejects %s through the actual file handler before configuration is changed", async kind => {
  const before = structuredClone(h.settings), read = vi.fn();
  const file = kind === "malformed-json" ? new File(["{"], "bad.json") : { name: "large.md", size: 2 * 1024 * 1024 + 1, arrayBuffer: read };
  input().props.onChange({ target: { files: [file] } });
  await wait(() => render().some(n => n.props.role === "status" && n.props.children.includes("Import failed")));
  expect(h.writes).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled(); expect(h.settings).toEqual(before);
});
it("reimporting identical bytes preserves the entire user-edited profile in the real handler", async () => {
  const file = new File(["Full custom body\n"], "fixture.txt");
  input().props.onChange({ target: { files: [file] } }); await wait(() => h.writes.mock.calls.length >= 2);
  const imported = structuredClone(h.settings.reverseConvertPromptPresets[0]);
  const edited = { ...imported, name: "User rename", systemPrompt: "USER EDITED BODY", jailbreakPrompt: "USER EDITED POSTSCRIPT", updatedAt: "2001-02-03T04:05:06.000Z" };
  h.settings.reverseConvertPromptPresets[0] = edited;
  const count = h.settings.reverseConvertPromptPresets.length; h.writes.mockClear();
  input().props.onChange({ target: { files: [file] } }); await wait(() => h.writes.mock.calls.length >= 2);
  expect(h.settings.reverseConvertPromptPresets).toHaveLength(count);
  expect(h.settings.reverseConvertPromptPresets[0]).toEqual(edited);
});
it.each(["builtin-ig5-convert", "existing-custom"])("an imported JSON collision with %s cannot replace the existing library object", async collision => {
  if (collision === "existing-custom") {
    const custom = imageTaskPromptPresetFromSampler(importImageSystemPrompt("EXISTING USER BODY", { filename: "existing.txt", sourceHash: "different-existing-hash" }).preset);
    h.settings.reverseConvertPromptPresets.unshift({ ...custom, id: collision });
  }
  const old = structuredClone(h.settings.reverseConvertPromptPresets.find((p: any) => p.id === collision)), count = h.settings.reverseConvertPromptPresets.length;
  input().props.onChange({ target: { files: [new File([JSON.stringify({ id: collision, name: "New file", systemPrompt: "NEW DISTINCT BODY" })], "collision.json")] } });
  await wait(() => h.writes.mock.calls.length >= 2);
  const imported = h.settings.reverseConvertPromptPresets[0];
  expect(imported.id).not.toBe(collision); expect(imported.systemPrompt).toBe("NEW DISTINCT BODY");
  expect(h.settings.reverseConvertPromptPresets).toHaveLength(count + 1);
  expect(h.settings.reverseConvertPromptPresets.find((p: any) => p.id === collision)).toEqual(old);
});
it("a builtin provenance hash match must not deduplicate an explicitly imported file", async () => {
  const body = "Builtin-hash-collision fixture", digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  const hash = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, "0")).join("");
  h.settings.reverseConvertPromptPresets[0].sourceHash = hash;
  const old = structuredClone(h.settings.reverseConvertPromptPresets[0]), count = h.settings.reverseConvertPromptPresets.length;
  input().props.onChange({ target: { files: [new File([body], "collision.txt")] } }); await wait(() => h.writes.mock.calls.length >= 2);
  const imported = h.settings.reverseConvertPromptPresets[0];
  expect(imported.id).not.toBe(old.id); expect(imported.systemPrompt).toBe(body);
  expect(h.settings.reverseConvertPromptPresets).toHaveLength(count + 1);
  expect(h.settings.reverseConvertPromptPresets.find((p: any) => p.id === old.id)).toEqual(old);
});
it("the visible enable switch applies only the user's explicit click", async () => {
  const toggle = render().find(n => n.props.label === "Enable system prompts (conversion / reverse)")!;
  expect(toggle.props.checked).toBe(false); expect(h.writes).not.toHaveBeenCalled();
  await toggle.props.onChange(true);
  expect(h.writes).toHaveBeenCalledExactlyOnceWith("reverseConvertDshEnabled", true);
});
it("deleting a shared custom choice restores each feature's own default through the actual handler", async () => {
  const custom = imageTaskPromptPresetFromSampler(importImageSystemPrompt("CUSTOM", { filename: "custom.txt" }).preset);
  h.settings.reverseConvertPromptPresets.unshift(custom); h.settings.convertSystemPromptPresetId = custom.id; h.settings.reverseSystemPromptPresetId = custom.id;
  const button = render().find(n => n.props.variant === "danger" && typeof n.props.onClick === "function" && !n.props.disabled)!;
  button.props.onClick();
  await wait(() => h.writes.mock.calls.length >= 3);
  expect(h.settings.reverseConvertPromptPresets.some((p: any) => p.id === custom.id)).toBe(false);
  expect(h.settings.convertSystemPromptPresetId).toBe("builtin-ig5-convert"); expect(h.settings.reverseSystemPromptPresetId).toBe("builtin-ig5-reverse");
});
