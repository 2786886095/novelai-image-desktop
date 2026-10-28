import { expect, it } from "vitest";
import fs from "node:fs";
import { AUTOCOMPLETE_LIST_MAX_HEIGHT } from "./components/autocomplete-placement";

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
  // A press anywhere but the list closes it, including one in the prompt box itself.
  expect(editor).toContain("if (!dropdownRef.current?.contains(event.target as Node)) clearSuggestions();");
  expect(editor).toContain("ref={dropdownRef}");
  expect(editor).toContain('e.key === "Escape") { e.preventDefault(); e.stopPropagation(); clearSuggestions(); }');
  expect(editor).toContain("onBlur={clearSuggestions}");
});

it("picks a suggestion row only on pointer movement and highlights only that row", () => {
  const app = fs.readFileSync("src/App.tsx", "utf8");
  const editor = app.slice(app.indexOf("function PromptTextarea("), app.indexOf("// ── Shared UI primitives"));
  expect(editor).toContain("onMouseMove={() => setActiveIdx(i)}");
  expect(editor).not.toContain("onMouseEnter");
  const css = fs.readFileSync("src/styles.css", "utf8");
  expect(css).not.toContain(".ac-item:hover");
  expect(css).toMatch(/\.ac-active \{\s*background: var\(--bg-hover\);/);
});

it("measures the suggestion list so the panel around it never cuts it off", () => {
  const app = fs.readFileSync("src/App.tsx", "utf8");
  const editor = app.slice(app.indexOf("function PromptTextarea("), app.indexOf("// ── Shared UI primitives"));
  // Before paint, again for new suggestions, and on window resize.
  expect(editor).toContain("useLayoutEffect(() => {");
  expect(editor).toContain("fitAutocompleteList(line, visibleVerticalRange(list), height, AC_LINE_GAP)");
  expect(editor).toContain('window.addEventListener("resize", place);');
  expect(editor).toContain("}, [suggestions, acLine]);");
  const css = fs.readFileSync("src/styles.css", "utf8");
  const rules = css.slice(css.indexOf("/* ── Tag autocomplete dropdown"), css.indexOf(".ac-item {"));
  // The helper's height limit and gap match the stylesheet: 2px inline offset plus the 6px margin.
  expect(rules).toContain(`max-height: ${AUTOCOMPLETE_LIST_MAX_HEIGHT}px;`);
  expect(rules).toContain("margin-top: 6px;");
  expect(rules).toMatch(/\.ac-dropdown\.ac-dropdown-above \{\s*margin-top: 0;\s*margin-bottom: 6px;/);
  expect(app).toContain("const AC_LINE_GAP = 8;");
  expect(editor).toContain("bottom: `calc(100% - ${acLine.top - 2}px)`");
  expect(editor).toContain("top: acLine.bottom + 2");
});
