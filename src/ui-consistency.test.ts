import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { iconNameForLegacyGlyph } from "./components/icons";
import { TAB_ITEMS } from "./prompt-data";

const projectRoot = process.cwd();

describe("desktop UI consistency guards", () => {
  it("uses a unique semantic SVG icon for every primary navigation item", () => {
    const icons = TAB_ITEMS.map((item) => item.icon);
    expect(new Set(icons).size).toBe(icons.length);
    expect(icons.every((icon) => /^[a-z][A-Za-z]+$/.test(icon))).toBe(true);
  });

  it("normalizes legacy structural glyphs rendered by IconText", () => {
    for (const glyph of ["⚙", "❔", "↺", "↻", "✓", "✕", "+", "＋", "−", "⌧", "↗", "▶", "✎", "⌫", "◎", "⇄", "↙", "⇥", "⧉", "✦", "☆", "◈", "▣", "▧", "▤", "◇", "◒", "♙", "…"]) {
      expect(iconNameForLegacyGlyph(glyph), glyph).toBeTruthy();
    }
  });

  it("keeps the reference catalog free of the overflowing WeUI download icon and duplicate select arrows", () => {
    const source = fs.readFileSync(path.join(projectRoot, "src", "ReferenceCatalogPanel.tsx"), "utf8");
    const styles = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    expect(source).not.toContain("weui-icon-download");
    expect(source).not.toContain("weui-cell_select");
    expect(source).not.toContain("<select");
    expect(source).toContain("<SelectMenu");
    expect(styles).toContain(".select-menu-popover");
  });
});
