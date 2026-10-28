import { expect, it } from "vitest";
import fs from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { SelectMenu, SelectMenuCompat } from "./ui";

it("shared SelectMenu associates the trigger with explanatory privacy text without a native select", () => {
  const html = renderToStaticMarkup(<SelectMenu id="metadata-mode" value="online" ariaLabel="Read mode" ariaDescribedBy="privacy-note" options={[{ value: "online", label: "Online" }, { value: "offline", label: "Offline" }]} onChange={() => {}} />);
  expect(html).toContain('aria-describedby="privacy-note"');
  expect(html).toContain('aria-label="Read mode: Online"');
  expect(html).toContain('aria-haspopup="listbox"');
  expect(html).toContain('class="select-menu-trigger"');
  expect(html).not.toContain("<select");
});
it("the native-authoring compatibility adapter also preserves aria-describedby", () => {
  const html = renderToStaticMarkup(<SelectMenuCompat value="online" aria-label="Read mode" aria-describedby="privacy-note"><option value="online">Online</option></SelectMenuCompat>);
  expect(html).toContain('aria-describedby="privacy-note"'); expect(html).not.toContain("<select");
});
it("lays out each option as one shrinkable label beside the check, so long names wrap inside the row", () => {
  const html = renderToStaticMarkup(<SelectMenu defaultOpen value="long" ariaLabel="Group" options={[{ value: "long", label: "Character_Preset_Long_Name_Without_Spaces_v5" }, { value: "short", label: "雨夜城市" }]} onChange={() => {}} />);
  expect(html).toContain('<span class="select-menu-option-content"><span>Character_Preset_Long_Name_Without_Spaces_v5</span></span>');
  expect(html).not.toContain("select-menu-option-icon");
  const css = fs.readFileSync("src/styles.css", "utf8");
  expect(css).toContain(".select-menu-option-content { display: flex; align-items: center; gap: 9px; min-width: 0; }");
  expect(css).toContain(".select-menu-option-content > span { min-width: 0; overflow-wrap: anywhere; }");
});
