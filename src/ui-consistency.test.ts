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

  it("keeps random artist numeric parameters independently editable and baseline aligned", () => {
    const source = fs.readFileSync(path.join(projectRoot, "src", "RandomArtistLab.tsx"), "utf8");
    const styles = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    expect(source).toContain("function NumericDraftInput");
    expect(source).toContain("cancelBlurRef.current = true");
    expect(source).toContain('className="artist-lab-panel random-generation-settings" open');
    expect(source).toContain('className="artist-weight-tuner-submit"');
    expect(source).toContain('const RANDOM_SIZE_PRESETS = [');
    expect(source).toContain('className="random-size-presets"');
    expect(source).toContain('aria-pressed={active}');
    expect(source).toContain('artistMinCount: 3, artistMaxCount: 7');
    expect(source).toContain('artistWeightMin: 0.3, artistWeightMax: 2');
    expect(source).toContain('franchiseMinCount: 0, franchiseMaxCount: 2');
    expect(source).toContain('franchiseWeightMin: 0.5, franchiseWeightMax: 1.5');
    expect(source).toContain('const pairSeeds = new Map<string, number>()');
    expect(source).toContain('session.seedMode === "fixed" ? session.seed : freshNaiSeed()');
    expect(source).not.toContain('Danbooru 验证：33/33');
    expect(styles).toContain('.random-artist-settings > label');
    expect(styles).toContain('.random-size-presets > button.active');
    expect(styles).toContain('grid-template-rows: max-content 44px');
    expect(styles).toContain('grid-auto-rows: max-content');
  });

  it("shares one 44px field baseline across preset search and filters", () => {
    const source = fs.readFileSync(path.join(projectRoot, "src", "ReferencePresetManager.tsx"), "utf8");
    const styles = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    expect(source).toContain('className="field reference-preset-search-field"');
    expect(styles).toContain('grid-template-rows: 18px 44px');
    expect(styles).toContain('.reference-preset-search-row .select-menu-trigger');
  });

  it("uses compact non-overflowing history hover actions", () => {
    const source = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    const styles = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    expect(source).toContain('label={<Icon name="folder" />}');
    expect(source).toContain('className="history-item-group-row"');
    expect(styles).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(styles).toContain('left: 6px;');
    expect(styles).toContain('right: 6px;');
    expect(styles).toContain('min-width: 0;');
    expect(styles).toContain('.history-item:hover .history-item-group-row');
    expect(source).toContain('saveMetadataSnapshotFromPath(item.filePath)');
    expect(styles).toContain('.history-item-group-row .select-menu-value');
  });

  it("persists the compact account and V5 allowance footer", () => {
    const source = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    expect(source).toContain('langbai.account-details-collapsed');
    expect(source).toContain('className="account-details-toggle"');
    expect(source).toContain('className={clsx("account-details-shell", accountDetailsCollapsed && "collapsed")}');
    expect(source).toContain('className="account-details-content"');
    expect(source).toContain('!accountDetailsCollapsed && (');
  });

  it("lets metadata restoration read images directly from history groups", () => {
    const source = fs.readFileSync(path.join(projectRoot, "src", "MetadataInspector.tsx"), "utf8");
    const styles = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    expect(source).toContain('window.naiDesktop.getHistory()');
    expect(source).toContain('window.naiDesktop.getHistoryGroups()');
    expect(source).toContain('saveMetadataSnapshotFromPath(item.filePath)');
    expect(source).toContain('className="metadata-history-grid"');
    expect(source).not.toContain('setHistoryOpen(false)');
    expect(styles).toContain('.metadata-history-picker');
    expect(styles).toContain('min-height: 72px;');
    expect(styles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
  });

  it("deletes a history image without opening a blocking native confirmation dialog", () => {
    const source = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    expect(source).not.toContain('window.confirm(f("history.deleteImageConfirm"');
    expect(source).toContain('const deleted = await deleteHistory(item.id)');
    expect(source).toContain('setToast(t("history.deleteImageDone"))');
  });

  it("renders official V5 Opus allowance as a live progress bar", () => {
    const source = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    const styles = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    expect(source).toContain('className="opus-usage-track"');
    expect(source).toContain('role="progressbar"');
    expect(source).toContain('className={`account-opus-usage${account.stale ? " stale" : ""}`}');
    expect(source).toContain('className="account-opus-track"');
    expect(source).toContain('account.tierLevel === 3 && Boolean(model && isNAIV5Model(model))');
    expect(source).toContain('account.opusUsage');
    expect(source).toContain('60_000');
    expect(source).toContain('account.stale');
    expect(source).toContain('t("opusUsage.stale")');
    expect(styles).toContain('.account-opus-usage');
  });

  it("supports an isolated Opus usage screenshot surface", () => {
    const appSource = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    const mainSource = fs.readFileSync(path.join(projectRoot, "electron", "main.ts"), "utf8");
    expect(mainSource).toContain('normalizedUiCapturePath.includes("opus-usage")');
    expect(appSource).toContain('captureSurface === "opusUsage"');
    expect(appSource).toContain('percent: 73.4');
  });
});
