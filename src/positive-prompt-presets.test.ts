import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  defaultPositivePromptPresetName,
  positivePromptPresetStorageId,
  samePositivePromptPreset,
  uniquePositivePromptPresetName,
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

  it('places both libraries first in More without consuming a main-toolbar slot', () => {
    const app = source('./App.tsx');
    const toolbar = app.slice(app.indexOf('<SlidingPromptToolbar language={settings?.language}'), app.indexOf('</SlidingPromptToolbar>'));
    expect(toolbar).not.toContain('data-preset-toolbar');
    const translation = toolbar.indexOf('label={translationText(settings?.language).title}');
    const positive = toolbar.indexOf('<PositivePromptPresetControl compact');
    const negative = toolbar.indexOf('<NegativePromptLibraryControl');
    const optimize = toolbar.indexOf('label={editorText.optimize}');
    const more = toolbar.indexOf('<PromptToolsPopover');
    expect(translation).toBeGreaterThan(0);
    expect(more).toBeGreaterThan(optimize);
    expect(positive).toBeGreaterThan(more);
    expect(negative).toBeGreaterThan(positive);
    expect(toolbar.slice(0, more)).not.toContain('PositivePromptPresetControl');
    expect(toolbar.slice(0, more)).not.toContain('NegativePromptLibraryControl');
    expect(toolbar.indexOf('label={generateText.prompt.normalize}')).toBeGreaterThan(negative);
    expect(toolbar).toContain('setPromptField("positivePrompt",value)');
    expect(toolbar).toContain('setPromptField("negativePrompt",value)');
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
