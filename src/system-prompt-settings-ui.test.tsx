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
  h.settings = { language: "zh-CN", reverseConvertPromptPresets: [createDefaultImageTaskPromptPreset("convert"), createDefaultImageTaskPromptPreset("reverse")], convertSystemPromptPresetId: "builtin-ig5-convert", reverseSystemPromptPresetId: "builtin-ig5-reverse", reverseConvertPromptPresetId: "builtin-ig5-convert", reverseConvertDshEnabled: false, visionApiUrl: "https://fixture.invalid/v1", visionApiKey: "", visionApiModel: "fixture", convertApiUrl: "https://fixture.invalid/v1", convertApiKey: "", convertApiModel: "fixture", convertPromptTemplates: { tags: "USER TEMPLATE", natural: "", mixed: "" }, reversePromptTemplates: { tags: "USER REVERSE", natural: "", mixed: "" }, reversePromptTemplatesV45: {}, convertPromptTemplatesV45: {}, aiMaxTokens: 4096 };
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
  await wait(() => render().some(n => n.props.role === "status" && n.props.children.includes("导入失败")));
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
  const toggle = render().find(n => n.props.label === "启用系统提示词（转换／反推）")!;
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
it('settings editor saves only the chosen model/edition map and preserves the old custom bodies',async()=>{
 h.section='templates';Object.assign(h.settings,{reversePromptTemplateVersion:'v5',convertPromptTemplateVersion:'v5',promptAssistantTemplateVersion:'v5',promptAssistantSkillVersion:'2.0.0',reversePromptTemplatesV2:{tags:'V2 reverse',natural:'V2 natural',mixed:'V2 mixed'},convertPromptTemplatesV2:{tags:'V2 convert',natural:'',mixed:''},promptOptimizeTemplate:'old optimization',promptAssistantTemplate:'old assistant'});
 const original=structuredClone(h.settings),nodes=render();
 const editors=nodes.filter(n=>typeof n.type==='function'&&n.type.name==='VersionedModeTemplateEditor');expect(editors).toHaveLength(2);
 await editors[0].props.onChange('v5',{tags:'new reverse',natural:'V2 natural',mixed:'V2 mixed'},'2.0.0');
 expect(h.settings.reversePromptTemplatesV2.tags).toBe('new reverse');expect(h.settings.reversePromptTemplates).toEqual(original.reversePromptTemplates);
 await editors[1].props.onChange('v4.5',{tags:'V45 edit',natural:'',mixed:''},'1.0.0');
 expect(h.settings.convertPromptTemplatesV45.tags).toBe('V45 edit');expect(h.settings.convertPromptTemplatesV2).toEqual(original.convertPromptTemplatesV2);
 const overlay=nodes.filter(n=>typeof n.type==='function'&&n.type.name==='SingleTemplateEditor');expect(overlay).toHaveLength(2);
 await overlay[0].props.onChange('new optimization');await overlay[1].props.onChange('new assistant');
 expect(h.settings.promptOptimizeTemplateV2).toBe('new optimization');expect(h.settings.promptAssistantTemplateV2).toBe('new assistant');
 expect(h.settings.promptOptimizeTemplate).toBe(original.promptOptimizeTemplate);expect(h.settings.promptAssistantTemplate).toBe(original.promptAssistantTemplate);
});
it('actual per-mode restore handler preserves other V2 modes and the entire legacy map',async()=>{
 h.section='templates';Object.assign(h.settings,{reversePromptTemplateVersion:'v5',convertPromptTemplateVersion:'v5',reversePromptTemplatesV2:{tags:'V2 custom tag',natural:'V2 custom prose',mixed:'V2 custom mixed'}});
 const original=structuredClone(h.settings),editor=render().find(n=>typeof n.type==='function'&&n.type.name==='VersionedModeTemplateEditor')!;
 h.slots=[];h.cursor=0;const children=walk((editor.type as any)(editor.props));
 const modes=children.find(n=>typeof n.type==='function'&&n.type.name==='ModeTemplateEditor')!;
 h.slots=[];h.cursor=0;const controls=walk((modes.type as any)(modes.props));
 const restore=controls.find(n=>n.type==='button'&&String(n.props.title).includes('selected mode'))??controls.filter(n=>n.type==='button').at(-1)!;
 restore.props.onClick();await tick();
 expect(h.settings.reversePromptTemplatesV2.tags).toBe(editor.props.v2Defaults.tags);
 expect(h.settings.reversePromptTemplatesV2.natural).toBe('V2 custom prose');expect(h.settings.reversePromptTemplatesV2.mixed).toBe('V2 custom mixed');expect(h.settings.reversePromptTemplates).toEqual(original.reversePromptTemplates);
});
