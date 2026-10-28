import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  defaultPositivePromptPresetName,
  positivePromptPresetStorageId,
  samePositivePromptPreset,
  uniquePositivePromptPresetName,
  resolvePositivePresetApplication,
} from "./positive-prompt-presets";

describe("positive prompt presets", () => {
  it("derives a compact default name without changing Danbooru punctuation", () => {
    expect(defaultPositivePromptPresetName("  1girl, cinematic lighting, masterpiece  "))
      .toBe("1girl, cinematic lighting");
    expect(defaultPositivePromptPresetName("", 3)).toBe("正面提示词 3");
  });

  it("increments same-name presets while ignoring the edited item", () => {
    const presets = [
      { id: "a", name: "夜景" },
      { id: "b", name: "夜景 (1)" },
    ];
    expect(uniquePositivePromptPresetName(presets, "夜景")).toEqual({
      value: "夜景 (2)",
      renamed: true,
    });
    expect(uniquePositivePromptPresetName(presets, "夜景", "a")).toEqual({
      value: "夜景",
      renamed: false,
    });
  });

  it("uses exact name and prompt content for duplicate detection", () => {
    expect(samePositivePromptPreset(
      { name: "Preset", prompt: "1girl, blue hair" },
      { name: "Preset", prompt: "1girl, blue hair" },
    )).toBe(true);
    expect(samePositivePromptPreset(
      { name: "Preset", prompt: "1girl" },
      { name: "Preset", prompt: "1boy" },
    )).toBe(false);
    expect(positivePromptPresetStorageId("abc")).toBe("positive-prompt-abc");
  });
});


describe('unified character preset library', () => {
 it('migrates complete roles, avoids ID/name collisions and preserves zero/blank fields', async () => {
  const {mergeCharacterPresets}=await import('./positive-prompt-presets');
  const existing={id:'character-old',name:'Team',prompt:'base',createdAt:'now'};
  const next=mergeCharacterPresets([existing],[{id:'old',name:'Team',createdAt:'then',captions:[{prompt:'alice',negativePrompt:'hat',x:0,y:1,useCoords:true},{prompt:'',negativePrompt:'',x:.5,y:0,useCoords:false}]}]);
  expect(next[0]).toBe(existing);expect(next[1].id).toBe('character-old-imported');expect(next[1].name).toBe('Team (1)');
  expect(next[1].captions?.[0]).toEqual({prompt:'alice',negativePrompt:'hat',x:0,y:1,useCoords:true});expect(next[1].captions?.[1].prompt).toBe('');
  expect(mergeCharacterPresets(next,[])).toEqual(next);
 });
 it('does not mistake different character configurations for duplicate text presets',()=>{
  const a={name:'Role',prompt:'alice',captions:[{prompt:'alice',negativePrompt:'hat',x:0,y:1,useCoords:true}]};
  expect(samePositivePromptPreset(a,{name:'Role',prompt:'alice'})).toBe(false);
  expect(samePositivePromptPreset(a,{...a,captions:[{...a.captions[0],x:1}]})).toBe(false);
  expect(samePositivePromptPreset(a,JSON.parse(JSON.stringify(a)))).toBe(true);
 });
});

describe('positive/negative preset layout integration', () => {
  const source = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');

  it('keeps both libraries visible under the editor instead of inside the collapsed toolbar or More', () => {
    const app = source('./App.tsx');
    const toolbar = app.slice(app.indexOf('<SlidingPromptToolbar language={settings?.language}'), app.indexOf('</SlidingPromptToolbar>'));
    expect(toolbar).not.toContain('data-preset-toolbar');
    expect(toolbar).not.toContain('PositivePromptPresetControl');
    expect(toolbar).not.toContain('NegativePromptLibraryControl');
    expect(toolbar).not.toContain('PromptChunkControl');
    expect(toolbar.indexOf('label={generateText.prompt.normalize}')).toBeGreaterThan(toolbar.indexOf('<PromptToolsPopover'));
    expect(app.indexOf('className="prompt-library-bar"')).toBeGreaterThan(app.indexOf('</SlidingPromptToolbar>'));
    const bar = app.slice(app.indexOf('className="prompt-library-bar"'), app.indexOf('<div className="token-counter">'));
    const positive = bar.indexOf('<PositivePromptPresetControl variant="bar"');
    const negative = bar.indexOf('<NegativePromptLibraryControl variant="bar"');
    expect(positive).toBeGreaterThan(0);
    expect(negative).toBeGreaterThan(positive);
    expect(bar).toContain('setPromptField("positivePrompt",value)');
    expect(bar).toContain('setPromptField("negativePrompt",value)');
  });

  it('retains the shared 1120 × 760 viewport-bounded frame without widening main-toolbar buttons', () => {
    for (const file of ['./PositivePromptPresets.tsx', './NegativePromptLibrary.tsx']) {
      expect(source(file)).toContain('./prompt-preset-layout.css');
    }
    const css = source('./prompt-preset-layout.css');
    expect(css).toContain(':is(.positive-preset-modal, .negative-library-dialog)');
    expect(css).toContain('width: min(1120px,');
    expect(css).toContain('height: min(760px,');
    expect(css).toContain('100dvh');
    expect(css).toContain('--prompt-preset-gutter: 16px');
    expect(css).toContain('--prompt-preset-gutter: 8px');
    expect(css).not.toContain('[data-preset-toolbar]');
    expect(css).not.toContain('flex: 0 0 36px');
  });
});

describe("applying positive prompt presets", () => {
  const caption = (prompt: string, negativePrompt = "") => ({ prompt, negativePrompt, useCoords: false, x: 0.5, y: 0.5 });
  const context = { value: "1girl, 1.2::blue hair::", currentCaptions: [caption("existing")], maxCharacters: 2 };

  it("replaces or appends plain prompt text without rewriting weights", () => {
    const preset = { prompt: "smile, 0.8::frown::" };
    expect(resolvePositivePresetApplication(preset, "replace", context)).toEqual({ kind: "prompt", appended: false, prompt: "smile, 0.8::frown::" });
    expect(resolvePositivePresetApplication(preset, "append", context)).toEqual({ kind: "prompt", appended: true, prompt: "1girl, 1.2::blue hair::, smile, 0.8::frown::" });
    expect(resolvePositivePresetApplication(preset, "append", { ...context, value: "" })).toMatchObject({ prompt: "smile, 0.8::frown::" });
  });

  it("replaces characters or adds them after the existing ones within the model limit", () => {
    const one = { prompt: "", captions: [caption("saved")] };
    expect(resolvePositivePresetApplication(one, "replace", context)).toEqual({ kind: "characters", appended: false, row: false, captions: [caption("saved")] });
    expect(resolvePositivePresetApplication(one, "append", context)).toEqual({ kind: "characters", appended: true, row: false, captions: [caption("existing"), caption("saved")] });
    const two = { prompt: "", captions: [caption("a"), caption("b")] };
    expect(resolvePositivePresetApplication(two, "replace", context)).toMatchObject({ kind: "characters" });
    expect(resolvePositivePresetApplication(two, "append", context)).toEqual({ kind: "over-capacity" });
  });

  it("appends one saved character into the character row being edited", () => {
    const character = { id: "row", ...caption("red coat", "hat") };
    const result = resolvePositivePresetApplication(
      { prompt: "", captions: [caption("smile", "blur")] },
      "append",
      { ...context, value: "red coat", character },
    );
    expect(result).toEqual({ kind: "characters", appended: true, row: true, captions: [{ ...character, prompt: "red coat, smile", negativePrompt: "hat, blur" }] });
    expect(resolvePositivePresetApplication({ prompt: "smile" }, "append", { ...context, value: "red coat", character }))
      .toEqual({ kind: "prompt", appended: true, prompt: "red coat, smile" });
  });
});
