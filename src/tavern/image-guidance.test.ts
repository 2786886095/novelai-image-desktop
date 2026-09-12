import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { createHash } from "node:crypto";
import guidance from "../../shared/tavern-image-guidance.json";
import { createSoftwareImageStarterKit } from "./builtins";
import { activeLorebookEntries, buildTavernPromptMessages, resolveTavernImageProposalParameters } from "./prompt";
import { renderOriginalImageGuidance } from "./image-guidance";
import { normalizeTavernLorebook } from "./compat";
import type { AgentConversation, AgentMessage } from "../agent/types";

const user = (content: string): AgentMessage => ({ id: "u", role: "user", content, attachments: [], tools: [], status: "complete", createdAt: "2026-09-12T00:00:00Z" });
const selected = (model?: string) => activeLorebookEntries([createSoftwareImageStarterKit().lorebook], [user("修改外套")], model);

describe("original technical worldbooks", () => {
  it("ships identical offline content to Flutter with per-entry integrity hashes", () => {
    const dart = fs.readFileSync("mobile/lib/agent/tavern_image_guidance_data.dart", "utf8");
    expect(JSON.parse(dart.split("r'''")[1].split("'''")[0])).toEqual(guidance);
    expect(guidance.entries).toHaveLength(30);
    expect(new Set(guidance.entries.map(e => e.id)).size).toBe(30);
    for (const e of guidance.entries) {
      expect(createHash("sha256").update(e.content).digest("hex")).toBe(e.source.contentSha256);
      expect(["19", "24", "27", "15", "23", "2"]).not.toContain(e.source.uid);
    }
    expect(guidance.sources.map(s => s.sha256)).toEqual([
      "492c32de03d3f888190e6e6144d4f906c62dafef7489ceb8e705279d6e9f3249",
      "382e0d1930e7f4f3f344d8b51fb266c260fbf0f72528594fd6b6dc6ec22624fc",
    ]);
  });
  it.each([["nai-diffusion-5-full", "v5", "9.7"], ["nai-diffusion-4-5-full", "v45", "8.31"], ["nai-diffusion-4-5-curated", "v45", "8.31"]])("loads the complete correct technical set for %s", (model, family, version) => {
    const items = selected(model).filter(x => x.entry.id.startsWith("builtin-moyu-"));
    const expected = guidance.entries.filter(e => e.source.family === family);
    expect(items).toHaveLength(15);
    expect(new Set(items.map(x => x.entry.id))).toEqual(new Set(expected.map(e => e.id)));
    for (const {entry} of items) {
      expect(entry.comment).toContain(version);
      expect(entry.content).toBe(expected.find(e => e.id === entry.id)!.content);
    }
  });
  it("never guesses a model from chat or injects into unrelated books", () => {
    for (const model of [undefined, "nai-diffusion-3", "anima", "nai-diffusion-50-full"])
      expect(selected(model).some(x => x.entry.id.startsWith("builtin-moyu-"))).toBe(false);
    expect(activeLorebookEntries([], [user("V5")], "nai-diffusion-5-full")).toEqual([]);
  });
  it("preserves disabled entries, recursive matching and user content", () => {
    const book = createSoftwareImageStarterKit().lorebook;
    book.recursiveScanning = true;
    book.entries.find(e => e.id === "builtin-moyu-v5-9.7-3")!.enabled = false;
    const copy = normalizeTavernLorebook(JSON.parse(JSON.stringify(book)));
    const ids = activeLorebookEntries([copy], [], "nai-diffusion-5-full").map(x => x.entry.id);
    expect(ids).not.toContain("builtin-moyu-v5-9.7-3");
    expect(ids).toContain("builtin-moyu-v5-9.7-21");
    expect(ids.some(id => id.startsWith("builtin-moyu-v45-"))).toBe(false);
  });
  it("resolves forward macros locally without editing originals or evaluating scripts", () => {
    const items = selected("nai-diffusion-4-5-full");
    const before = JSON.stringify(items);
    const rendered = renderOriginalImageGuidance(items);
    const text = [...rendered.values()].join("\n");
    expect(text).not.toMatch(/\{\{(?:setvar|getvar)::/);
    expect(text).toContain("faceless male/female");
    expect(text).toContain("NovelAI");
    expect(text).toContain("size:1024x1024");
    expect(JSON.stringify(items)).toBe(before);
    const entry = {...items[0].entry, content:"{{setvar::secret::x}}{{getvar::secret}}", extensions:{}};
    expect(renderOriginalImageGuidance([{book:items[0].book,entry}]).size).toBe(0);
    expect(renderOriginalImageGuidance([]).size).toBe(0);
  });
  it("keeps variable scopes independent and permits disabling variable entries", () => {
    const kit = createSoftwareImageStarterKit();
    for (const uid of ["0", "8", "13"]) kit.lorebook.entries.find(e => e.id === `builtin-moyu-v5-9.7-${uid}`)!.enabled = false;
    expect(() => renderOriginalImageGuidance(activeLorebookEntries([kit.lorebook], [], "nai-diffusion-5-full"))).not.toThrow();
    const source = selected("nai-diffusion-5-full").find(x => x.entry.id.endsWith("9.7-0"))!;
    const left = {...source.entry,content:"{{setvar::male::first}}{{getvar::male}}"};
    const right = {...source.entry,content:"{{setvar::male::second}}{{getvar::male}}"};
    const rendered = renderOriginalImageGuidance([{book:source.book,entry:left},{book:{...source.book,id:"other-book"},entry:right}]);
    expect(rendered.get(left)).toBe("first");
    expect(rendered.get(right)).toBe("second");
  });
  it("detects malformed variable graphs rather than hanging or inventing text", () => {
    const item = selected("nai-diffusion-5-full").find(x=>x.entry.id.endsWith("9.7-0"))!;
    expect(()=>renderOriginalImageGuidance([{...item,entry:{...item.entry,content:"{{getvar::missing}}"}}])).toThrow("not defined");
    const content="{{setvar::a::{{getvar::a}}}}{{getvar::a}}";
    expect(()=>renderOriginalImageGuidance([{...item,entry:{...item.entry,content}}])).toThrow();
  });
  it.each(["nai-diffusion-5-full", "nai-diffusion-4-5-full"])("assembles %s with native output and unchanged authoritative parameters", model => {
    const kit = createSoftwareImageStarterKit();
    const conversation = {messages:[user("仅将甲的蓝外套改红，乙保持")],reasoningEffort:"low"} as AgentConversation;
    const defaults = {model,count:1,width:832,height:1216,scale:0,steps:28};
    const messages = buildTavernPromptMessages({conversation, characters:[kit.character],activeCharacter:kit.character,persona:kit.persona,lorebooks:[kit.lorebook],preset:kit.sampler,imageDefaults:defaults});
    const system = messages[0].content;
    if (typeof system !== "string") throw new Error("Expected text system prompt");
    expect(system).toContain("服装签名");
    expect(system).toContain("scenePatch");
    expect(system).toContain("promptPatch");
    expect(system.endsWith(guidance.runtimeContract)).toBe(true);
    // Unrelated user presets retain their own macro semantics.
    expect(system).not.toMatch(/\{\{(?:setvar|getvar)::(?:图片总数|尺寸|NAI|male|解析格式|Danbooru)/);
    expect(system).toContain(model.includes("4-5") ? "300~500 Token" : "层数按画面实际灵活决定");
    expect(resolveTavernImageProposalParameters({count:8,width:1024,scale:9,explicitParameters:[]},defaults)).toMatchObject(defaults);
  });
});
