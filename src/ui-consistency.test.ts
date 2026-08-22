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

  it("never renders semantic icon names as visible panel text", () => {
    const source = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    expect(source).not.toContain("<span>{meta.icon}</span>");
    expect(source).toContain('<span aria-hidden="true"><Icon name={meta.icon} /></span>');
  });

  it("keeps the final SVG icon contract inline, clipped, and flex-safe", () => {
    const styles = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    const rules = [...styles.matchAll(/(?:^|\n)\.ui-icon\s*\{([^}]*)\}/g)];
    const finalRule = rules.at(-1)?.[1] ?? "";
    expect(finalRule).toContain("display: inline-block");
    expect(finalRule).toContain("overflow: hidden");
    expect(finalRule).toContain("flex: 0 0 var(--ui-icon-size, 16px)");
  });

  it("keeps the style-folder create action on one icon and one text baseline", () => {
    const source = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    const styles = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    expect(source).toContain('className="style-folder-create"');
    expect(source).toContain('<Icon name="plus" /><span>{t("prompt.styleGroupCreate")}</span>');
    expect(styles).not.toContain(".style-folder-create .ui-icon + .ui-icon");
  });

  it("lets the modal preset picker create presets without exposing export actions", () => {
    const source = fs.readFileSync(path.join(projectRoot, "src", "ReferencePresetManager.tsx"), "utf8");
    expect(source).toContain('modal && <div className="reference-preset-actions reference-preset-picker-actions"');
    expect(source).toContain('variant="primary" onClick={() => setShowCreate(true)}');
    expect(source).toContain("{!modal && <div className=\"reference-preset-actions\"");
  });
});
