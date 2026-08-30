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

  it("centers weight text and provides direct character-position dragging", () => {
    const source = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    const styles = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    expect(source).toContain('className="prompt-tool-btn weight-tool-btn"');
    expect(source).toContain('<span>{generateText.prompt.weightAdjust}');
    expect(styles).toContain(".weight-tool-btn");
    expect(styles).toContain("grid-template-columns: 15px minmax(0, 1fr) 15px");
    expect(source).toContain('className="char-position-stage"');
    expect(source).toContain('className="char-position-marker"');
    expect(source).toContain("setPointerCapture(event.pointerId)");
    expect(source).toContain('updateCharCaption(caption.id, { ...patch, useCoords: true })');
  });

  it("lets each character prompt card collapse independently", () => {
    const source = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    const styles = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    expect(source).toContain("collapsedCharacters");
    expect(source).toContain('aria-expanded={!collapsed}');
    expect(source).toContain('className="char-row-content"');
    expect(source).toContain('t(collapsed ? "character.expand" : "character.collapse")');
    expect(styles).toContain(".char-row-toggle");
    expect(styles).toContain(".char-row.collapsed");
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
    expect(source).toContain('artistMinCount: 3,');
    expect(source).toContain('artistMaxCount: 7,');
    expect(source).toContain('artistWeightMin: 0.2,');
    expect(source).toContain('artistWeightMax: 1.2,');
    expect(source).toContain('franchiseMinCount: 0,');
    expect(source).toContain('franchiseMaxCount: 2,');
    expect(source).toContain('franchiseWeightMin: 0.15,');
    expect(source).toContain('franchiseWeightMax: 0.8,');
    expect(source).toContain('const pairSeeds = new Map<string, number>()');
    expect(source).toContain('session.seedMode === "fixed" ? session.seed : freshNaiSeed()');
    expect(source).toContain('ready: "当前候选库共 {count} 名画师"');
    expect(source).toContain('hint: "画师 Tag 来源：Danbooru"');
    expect(source).not.toContain('Pixiv 昵称或数字 ID');
    expect(source).not.toContain('Danbooru 验证：33/33');
    expect(styles).toContain('.random-artist-settings > label');
    expect(styles).toContain('.random-size-presets > button.active');
    expect(styles).toContain('grid-template-rows: max-content 44px');
    expect(styles).toContain('grid-auto-rows: max-content');
  });

  it("shares preview, aspect-ratio, tabs, and action placement across artist draws", () => {
    const randomSource = fs.readFileSync(path.join(projectRoot, "src", "RandomArtistLab.tsx"), "utf8");
    const repairSource = fs.readFileSync(path.join(projectRoot, "src", "V5ArtistWeightRepair.tsx"), "utf8");
    const drawEntrySource = fs.readFileSync(path.join(projectRoot, "src", "ArtistStringWeightDraw.tsx"), "utf8");
    const styles = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");

    expect(drawEntrySource).toContain('<V5ArtistWeightRepair mode="draw"');
    for (const source of [randomSource, repairSource]) {
      expect(source).toContain('className="artist-candidate-media');
      expect(source).toContain('className="artist-candidate-preview-button"');
      expect(source).toContain('style={{ aspectRatio:');
      expect(source).toContain('className="artist-candidate-actions"');
      expect(source).toContain('className="artist-result-preview"');
      expect(source).toContain('<AppPortal>');
    }
    expect(randomSource).toContain('onDoubleClick={() => setPreviewResult(result)}');
    expect(repairSource).toContain('onDoubleClick={() => setPreviewCandidate(candidate)}');
    expect(randomSource).toContain('className="artist-result-tabs"');
    expect(repairSource).toContain('className="artist-result-tabs artist-string-result-tabs"');
    expect(randomSource).toContain('className="artist-candidate-grid"');
    expect(repairSource).toContain('className="artist-candidate-grid v5-draw-grid"');
    expect(randomSource).toContain('className="artist-result-toolbar"');
    expect(repairSource).toContain('className="artist-result-toolbar artist-string-result-toolbar"');
    expect(randomSource).toContain('className="artist-result-actions"');
    expect(repairSource).toContain('className="artist-result-actions"');
    expect(randomSource.indexOf('className="artist-lab-panel artist-queue-panel"')).toBeLessThan(
      randomSource.indexOf('className="artist-result-toolbar"'),
    );
    expect(repairSource.indexOf('v5-draw-generation-settings')).toBeLessThan(
      repairSource.indexOf('className="artist-result-toolbar artist-string-result-toolbar"'),
    );
    expect(repairSource).not.toContain('className="v5-artist-repair-actions"');
    expect(styles).toContain('.artist-candidate-media img { width: 100%; height: 100%; object-fit: contain;');
    expect(styles).toContain('.artist-result-preview > img { width: 100%; height: 100%; object-fit: contain; }');
    expect(styles).toContain('.artist-result-toolbar {');
    expect(styles).not.toContain('.v5-draw-tabs {');
  });

  it("defaults proxy setup to automatic system/VPN routing", () => {
    const appSource = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    const storeSource = fs.readFileSync(path.join(projectRoot, "electron", "ipc", "store.ts"), "utf8");
    const proxySource = fs.readFileSync(path.join(projectRoot, "electron", "ipc", "proxy.ts"), "utf8");
    expect(appSource).toContain('<option value="auto">{t("proxy.auto")}</option>');
    expect(storeSource).toContain('proxyMode: "auto"');
    expect(storeSource).toContain('settings.proxyMode = "auto"');
    expect(proxySource).toContain("systemProxyResolver");
    expect(proxySource).toContain("probeLocalProxy");
    expect(proxySource).toContain('settings.proxyMode === "auto"');
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
