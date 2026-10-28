import { expect, it } from "vitest";
import fs from "node:fs";

// Behavior is covered by applyAutocompleteTag tests; these guard the session wiring
// that keeps the suggestion list dismissible and tied to the word it was made for.
it("keeps tag autocomplete tied to its word and dismissible", () => {
  const app = fs.readFileSync("src/App.tsx", "utf8");
  const editor = app.slice(app.indexOf("function PromptTextarea("), app.indexOf("// ── Shared UI primitives"));
  expect(editor).toContain("anchorRef.current = { start, cursor, word };");
  expect(editor).toContain("request !== requestRef.current || !ta || document.activeElement !== ta");
  expect(editor).toContain("applyAutocompleteTag(value, anchor, tag)");
  expect(editor).not.toContain("ta.selectionStart ?? value.length");
  expect(editor).toContain("onSelect={");
  expect(editor).toContain('document.addEventListener("pointerdown", outside, true)');
  expect(editor).toContain('e.key === "Escape") { e.preventDefault(); e.stopPropagation(); clearSuggestions(); }');
  expect(editor).toContain("onBlur={clearSuggestions}");
});
