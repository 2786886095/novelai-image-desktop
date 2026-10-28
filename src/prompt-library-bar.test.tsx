import { afterEach, expect, it, vi } from "vitest";
import fs from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { PositivePromptPresetControl } from "./PositivePromptPresets";
import { PromptChunkControl } from "./PromptChunks";
import { useAppStore } from "./store";

afterEach(() => useAppStore.setState(useAppStore.getInitialState(), true));

it("keeps the saved-prompt libraries visible under the prompt editor, outside the collapsed toolbar", () => {
  const app = fs.readFileSync("src/App.tsx", "utf8");
  const editor = app.slice(app.indexOf('<div className="prompt-editor"'), app.indexOf('<div className="token-counter">'));
  const popover = editor.slice(editor.indexOf("<PromptToolsPopover"), editor.indexOf("</PromptToolsPopover>"));
  const bar = editor.slice(editor.indexOf('className="prompt-library-bar"'));
  expect(popover).not.toContain("PositivePromptPresetControl");
  expect(popover).not.toContain("NegativePromptLibraryControl");
  expect(popover).not.toContain("PromptChunkControl");
  expect(editor.indexOf("</SlidingPromptToolbar>")).toBeLessThan(editor.indexOf('className="prompt-library-bar"'));
  expect(bar).toContain('<PositivePromptPresetControl variant="bar"');
  expect(bar).toContain("<PromptChunkControl ");
  expect(bar).toContain('placement="top-right"');
  expect(bar).toContain('<NegativePromptLibraryControl variant="bar"');
});

it("positive bar variant renders labelled library and save-current buttons", () => {
  // SSR renders with the unloaded-settings fallback language (zh-CN for these controls).
  const html = renderToStaticMarkup(<PositivePromptPresetControl variant="bar" value="1girl" onApply={vi.fn()} />);
  expect(html).toContain('class="prompt-tool-btn positive-preset-bar-trigger"');
  expect(html).toContain("<span>正面预设</span>");
  expect(html).toContain('class="prompt-tool-btn positive-preset-save-current"');
  expect(html).toContain("<span>保存当前</span>");
  expect(renderToStaticMarkup(<PositivePromptPresetControl variant="bar" value=" " onApply={vi.fn()} />))
    .toMatch(/positive-preset-save-current"[^>]*disabled=""/);
  const chunk = renderToStaticMarkup(<PromptChunkControl value="1girl" onApply={vi.fn()} />);
  expect(chunk).toContain("prompt-tool-btn prompt-chunk-trigger");
  expect(chunk).toContain("<span>自定义提词</span>");
});
