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

  it("supports autocomplete and user prompt blocks inside character prompts", () => {
    const source = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    const styles = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    const chunks = fs.readFileSync(path.join(projectRoot, "src", "PromptChunks.tsx"), "utf8");
    const characterModal = source.slice(
      source.indexOf("function CharCaptionsModal"),
      source.indexOf("function StylePresetImagesModal"),
    );
    expect(characterModal).toContain("toggleCharacterAutoComplete");
    expect(characterModal).toContain('<Icon name="bulb" />');
    expect(characterModal.match(/<PromptTextarea/g)).toHaveLength(2);
    expect(characterModal).toContain("<PromptChunkControl");
    expect(characterModal).toContain("<PositivePromptPresetControl");
    expect(chunks).toContain('setSetting("promptChunks", next)');
    expect(chunks).toContain("?? EMPTY_PROMPT_CHUNKS");
    expect(chunks).not.toContain("state.settings?.promptChunks ?? []");
    expect(chunks).toContain("不会替换或调用正面预设");
    expect(chunks).not.toContain("positivePromptPresets");
    expect(chunks).toContain('aria-label={text.save}');
    expect(chunks).toContain("nextErrors.name || nextErrors.content");
    expect(chunks).toContain('className="prompt-chunk-validation"');
    expect(chunks).toContain('data-placement={position.placement}');
    expect(chunks).toContain('placement === "top-right"');
    expect(chunks).toContain('resolvedPlacement === "top-right"');
    expect(chunks).toContain("resolvePromptChunkTop(");
    expect(source).toContain('placement="top-right"');
    expect(chunks).toContain('save: "确认保存"');
    expect(styles).toContain(".char-prompt-tools .prompt-tool-btn");
    expect(styles).toContain(".prompt-chunk-popover");
    expect(styles).toContain(".prompt-chunk-content");
    expect(chunks).toContain("prompt-chunk-popover-footer");
    expect(styles).toContain("grid-template-rows: auto auto minmax(0, 1fr) auto");
    expect(styles).toContain('.prompt-chunk-editor input[aria-invalid="true"]');
    expect(styles).toContain(".prompt-inline-tool-pair");
    expect(styles).toMatch(/\.prompt-chunk-popover\s*\{[^}]*background:\s*var\(--bg-panel,\s*#fff\)/s);
    expect(styles).toMatch(/\.prompt-chunk-popover\s*\{[^}]*isolation:\s*isolate/s);
    expect(styles).toMatch(/\.prompt-chunk-editor-actions button\.primary\s*\{[^}]*background:\s*var\(--accent,\s*#6d28d9\)/s);
    expect(styles).toMatch(/\.prompt-chunk-editor-actions button\.primary:disabled\s*\{[^}]*opacity:\s*1/s);
    expect(styles).not.toMatch(/\.prompt-chunk-editor-actions button\.primary\s*\{[^}]*var\(--primary\)/s);
  });

  it("keeps weight help opaque and artist ranking previews uncropped", () => {
    const styles = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    expect(styles).toMatch(/\.weight-help-popover\s*\{[^}]*background:\s*#fff/s);
    expect(styles).toMatch(/\.weight-help-popover\s*\{[^}]*font-family:\s*inherit/s);
    expect(styles).toMatch(/\.artist-ranking-preview img\s*\{[^}]*width:\s*auto[^}]*height:\s*auto[^}]*object-fit:\s*contain/s);
    expect(styles).toMatch(/\.artist-ranking-thumb img\s*\{[^}]*object-fit:\s*contain/s);
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

  it("keeps generation completion stable across the canvas and both side rails", () => {
    const source = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    const store = fs.readFileSync(path.join(projectRoot, "src", "store.ts"), "utf8");
    const styles = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    expect(source).toContain("handoffPreview");
    expect(source).toContain('className="run-state-swap"');
    expect(source).toContain('className="history-item history-item-pending"');
    expect(source).not.toContain('f("account.lastSpent", { amount: lastAnlasSpent })');
    expect(store).toContain("completedImageBridges");
    expect(store).toContain("preloadCompletedImage(item.fileUrl)");
    expect(styles).toContain(".generating-overlay.is-completing.is-leaving");
    expect(styles).toContain("grid-template-rows: 0fr");
    expect(styles).toContain(".history-item-pending");
  });

  it("lets metadata restoration read images directly from history groups", () => {
    const source = fs.readFileSync(path.join(projectRoot, "src", "MetadataInspector.tsx"), "utf8");
    const styles = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    expect(source).toContain('window.naiDesktop.getHistory()');
    expect(source).toContain('window.naiDesktop.getHistoryGroups()');
    expect(source).toContain('readMetadataSnapshotFromPath(item.filePath)');
    expect(source).toContain('activeTab !== "metadata"');
    expect(source).toContain('loadMetadataSnapshot().then((file) =>');
    expect(source).toContain('className="metadata-history-grid"');
    expect(source).not.toContain('setHistoryOpen(false)');
    expect(styles).toContain('.metadata-history-picker');
    expect(styles).toContain('min-height: 72px;');
    expect(styles).toContain('flex: 0 0 auto;');
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

  it("shares positive-only presets across generation and artist-string tools without batch coupling", () => {
    const appSource = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    const repairSource = fs.readFileSync(path.join(projectRoot, "src", "V5ArtistWeightRepair.tsx"), "utf8");
    const randomArtistSource = fs.readFileSync(path.join(projectRoot, "src", "RandomArtistLab.tsx"), "utf8");
    const presetSource = fs.readFileSync(path.join(projectRoot, "src", "PositivePromptPresets.tsx"), "utf8");
    const backupSource = fs.readFileSync(path.join(projectRoot, "electron", "ipc", "data-backup.ts"), "utf8");
    const batchSource = fs.readFileSync(path.join(projectRoot, "src", "ComicGenerator.tsx"), "utf8");
    expect(appSource).toContain("<PositivePromptPresetControl");
    expect(repairSource.match(/<PositivePromptPresetControl/g)).toHaveLength(2);
    expect(randomArtistSource).toContain("<PositivePromptPresetControl");
    expect(presetSource).toContain("onApply(preset.prompt)");
    expect(presetSource).toContain("POSITIVE_PROMPT_PRESET_IMAGE_LIMIT");
    expect(presetSource).toContain('"positive-preset-large-preview"');
    expect(backupSource).toContain("positivePromptPresets: positivePrompts");
    expect(backupSource).toContain("positivePromptPresetStorageId(target.id)");
    expect(batchSource).not.toContain("PositivePromptPresetControl");
  });

  it("uses non-blocking confirmations, moves Enhance into Generate, and keeps Post focused", () => {
    const sourceFiles = [
      "App.tsx",
      "ComicGenerator.tsx",
      "PositivePromptPresets.tsx",
      "ReferencePresetManager.tsx",
      "comic/TagComicGenerator.tsx",
      "AgentPage.tsx",
    ];
    for (const file of sourceFiles) {
      const source = fs.readFileSync(path.join(projectRoot, "src", file), "utf8");
      expect(source, file).not.toContain("window.confirm(");
    }
    const tabs = fs.readFileSync(path.join(projectRoot, "src", "app", "AppTabBar.tsx"), "utf8");
    const app = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    const navigation = fs.readFileSync(path.join(projectRoot, "src", "app", "navigation.ts"), "utf8");
    const promptData = fs.readFileSync(path.join(projectRoot, "src", "prompt-data.ts"), "utf8");
    expect(tabs).not.toContain('filter((item) => item.value !== "upscale")');
    expect(navigation).not.toContain('"upscale"');
    expect(promptData).not.toContain('value: "upscale"');
    expect(app).not.toContain('activeTab === "upscale"');
    expect(app).toContain('aria-label={t("postprocess.tools")}');
    expect(app).toContain('generateMode === "enhance"');
    expect(app).toContain('mode === "upscale"');
    expect(app).toContain('t("upscale.explain")');
    expect(app).toContain('t("enhance.explain")');
    const postprocessPanel = app.slice(
      app.indexOf("function PostprocessPanel"),
      app.indexOf("// ── Inspect panel"),
    );
    expect(postprocessPanel).not.toContain('"enhance"');
    expect(postprocessPanel).toContain('<UpscalePanel openSettings={openSettings} />');
    expect(postprocessPanel).toContain('<DirectorPanel openSettings={openSettings} />');
  });

  it("keeps before/after comparison owned by its exact surface and hides it elsewhere", () => {
    const app = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    const store = fs.readFileSync(path.join(projectRoot, "src", "store.ts"), "utf8");
    expect(store).toContain("comparisonSurface: CanvasSurface | null");
    expect(store).toContain("activeCanvasSurface: CanvasSurface");
    expect(store).toContain("comparisonSurface: options.compareBefore ? options.comparisonSurface ?? state.activeCanvasSurface : null");
    expect(app).toContain("comparisonBelongsToActiveTab && comparisonSurface === activeCanvasSurface");
    expect(app).toContain('comparisonSurface?.startsWith("generate:")');
    expect(app).toContain('comparisonSurface?.startsWith("postprocess:")');
    expect(app).toContain('setActiveCanvasSurface(`generate:${generateMode}`)');
    expect(app).toContain('setActiveCanvasSurface(mode === "upscale" ? "postprocess:upscale" : "postprocess:director")');
  });

  it("keeps reverse and conversion single-pass and removes the two optional clutter cards", () => {
    const app = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    const nai = fs.readFileSync(path.join(projectRoot, "electron", "ipc", "nai.ts"), "utf8");
    const reversePanel = app.slice(app.indexOf("function ReversePanel"), app.indexOf("function PromptConverterPanel"));
    const convertPanel = app.slice(app.indexOf("function PromptConverterPanel"), app.indexOf("// ── AI call log panel"));
    for (const panel of [reversePanel, convertPanel]) {
      expect(panel).not.toContain("FeatureCostCard");
      expect(panel).not.toContain("PromptCodexEnhancementCard");
    }
    expect(nai).not.toMatch(/codexEnabled|ruleRepairEnabled|matureTagNames/);
    expect(nai).not.toContain("提示词转换 · 规则修复");
    expect(nai).not.toContain("AI 反推 · 法典增强");
  });

  it("renders weight help as one SVG circle with a collision-aware popover", () => {
    const css = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    const controls = fs.readFileSync(path.join(projectRoot, "src", "components", "WeightDistributionControls.tsx"), "utf8");
    expect(controls).not.toContain("title={help}");
    expect(controls).toContain('aria-label={`${label}: ${help}`}');
    expect(controls).toContain("<FiHelpCircle");
    expect(controls).toContain("createPortal(");
    expect(controls).toContain('role="tooltip"');
    expect(controls).toContain('const placement = fitsAbove || !fitsBelow ? "top" : "bottom"');
    expect(css).toContain(".weight-help-popover");
    expect(css).toMatch(/\.weight-help\s*\{[^}]*border:\s*0/s);
    expect(css).toMatch(/\.weight-help svg\s*\{[^}]*width:\s*16px/s);
    expect(css).toMatch(/\.weight-advanced-grid\s*>\s*label\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  });

  it("keeps an explicit redraw source policy and comparison handoff", () => {
    const app = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    const store = fs.readFileSync(path.join(projectRoot, "src", "store.ts"), "utf8");
    expect(app).toContain('t("inpaint.sourceOriginal")');
    expect(app).toContain('t("inpaint.sourceLatest")');
    expect(store).toContain('i2iSourceMode: "original"');
    expect(store).toContain("compareBefore: sourceImage");
    expect(store).toContain('loadWorkbench: state.i2iSourceMode === "latest"');
    expect(app).toContain('aria-label={t("inpaint.nextSourceLabel")}');
    expect(store).toContain('inpaintSourceMode: "original"');
    expect(store).toContain('loadWorkbench: state.inpaintSourceMode === "latest"');
    expect(fs.readFileSync(path.join(projectRoot, "src", "InpaintCanvas.tsx"), "utf8"))
      .toContain("currentImage!.fileUrl");
  });

  it("makes postprocess tabs visibly interactive without harsh black borders", () => {
    const css = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    expect(css).toContain(".postprocess-mode-switcher button:hover");
    expect(css).toContain("cursor: pointer !important");
    expect(css).toContain("transform: translateY(-1px)");
  });

  it("keeps muted text AA-safe and the analytical weight preview geometrically faithful", () => {
    const css = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    const preview = fs.readFileSync(path.join(projectRoot, "src", "components", "WeightDistributionControls.tsx"), "utf8");
    const app = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    const i18n = fs.readFileSync(path.join(projectRoot, "src", "i18n.ts"), "utf8");
    expect(css.match(/--text-muted\s*:/g)).toHaveLength(2);
    expect(css).toContain("--text-muted:     #736a82");
    expect(css).toContain("--muted:          var(--text-muted)");
    expect(css).toContain("select:not(:disabled) { cursor: pointer; }");
    expect(preview).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(preview).toContain("const chartLeft = 68");
    expect(preview).toContain("controlledWeightPdf");
    expect(preview).toContain("weight-preview-likely-band");
    expect(preview).toContain("weight-preview-summary");
    expect(preview).toContain("const height = 188");
    expect(css).toMatch(/\.weight-distribution-preview\s*\{[^}]*max-width:\s*1040px/s);
    expect(css).toMatch(/\.weight-distribution-preview\s*>\s*svg\s*\{[^}]*height:\s*auto/s);
    expect(css).not.toMatch(/\.weight-distribution-preview\s+svg\s*\{/);
    expect(css).toMatch(/\.weight-distribution-preview\s*\{[^}]*margin:\s*0 0 42px/s);
    expect(app).toContain('t("postprocess.emptyTitle")');
    expect(i18n).toContain('"postprocess.emptyHint"');
  });

  it("defines every custom property used without a fallback", () => {
    const css = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    const usedWithoutFallback = new Set(
      [...css.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map((match) => match[1]),
    );
    const defined = new Set(
      [...css.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((match) => match[1]),
    );
    const injected = new Set([
      "--ws-left",
      "--ws-right",
      "--tavern-background",
      "--tavern-popover-pointer",
      "--reference-catalog-columns",
      "--reference-preset-columns",
    ]);
    expect([...usedWithoutFallback].filter((token) => !defined.has(token) && !injected.has(token))).toEqual([]);
    expect(css).not.toMatch(/font:\s*[^;]*var\(--font-sans/);
    expect(css).not.toMatch(/animation:\s*[^;]*var\(--ease-in-out/);
    expect(css.match(/^:root\s*\{/gm)).toHaveLength(1);
    expect(css.match(/^\.theme-dark\s*\{/gm)).toHaveLength(1);
  });

  it("keeps shorthand variables defined and theme tokens unique per scope", () => {
    const css = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    const defined = new Set(
      [...css.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((match) => match[1]),
    );
    for (const shorthand of css.matchAll(/\b(font|animation)\s*:\s*([^;{}]*)/g)) {
      for (const variable of shorthand[2].matchAll(/var\(\s*(--[\w-]+)\s*(?:,|\))/g)) {
        expect(defined.has(variable[1]), `${shorthand[1]} references ${variable[1]}`).toBe(true);
      }
    }

    for (const selector of [":root", ".theme-dark"]) {
      const pattern = selector === ":root"
        ? /^:root\s*\{([^}]*)\}/gm
        : /^\.theme-dark\s*\{([^}]*)\}/gm;
      const blocks = [...css.matchAll(pattern)];
      expect(blocks, selector).toHaveLength(1);
      const names = [...blocks[0][1].matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((match) => match[1]);
      expect(new Set(names).size, `${selector} contains duplicate tokens`).toBe(names.length);
    }
  });

  it("keeps motion explicit, typography owned by the app, and active theme selectors live", () => {
    const css = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    const app = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    const ui = fs.readFileSync(path.join(projectRoot, "src", "components", "ui.tsx"), "utf8");
    const catalog = fs.readFileSync(path.join(projectRoot, "src", "ReferenceCatalogPanel.tsx"), "utf8");
    const presets = fs.readFileSync(path.join(projectRoot, "src", "ReferencePresetManager.tsx"), "utf8");

    expect(css).not.toContain("prefers-reduced-motion");
    expect(css).not.toContain('[data-theme=');
    expect(css).toMatch(/html, html body, html body #root\s*\{[^}]*font-family:\s*var\(--font-sans\)/s);
    expect(css).toMatch(/--font-sans:[^;]*"Microsoft YaHei UI"[^;]*"PingFang SC"/);
    expect(css).toContain("html.motion-reduced *");
    expect(css).toContain(".persistent-tools-view.is-active > * { animation: page-enter");
    expect(css).not.toContain(".tools-hub > * { animation: page-enter");
    expect(app).toContain('update("reduceMotion", value)');
    expect(app).toContain('classList.toggle("motion-reduced", settings?.reduceMotion === true)');
    for (const source of [ui, catalog, presets]) {
      expect(source).not.toContain("prefers-reduced-motion");
    }
  });

  it("keeps tab recovery stateful and defers noncritical route warming", () => {
    const app = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    const css = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    expect(app).toContain('className="persistent-workbench-view"');
    expect(app).toContain('className="workspace"');
    expect(app).not.toContain("WIDE_WORKSPACE_TABS.has(activeTab)");
    expect(css).not.toContain(".workspace-tools {");
    expect(app).toContain('resetKey={activeTab}');
    expect(app).not.toContain('<AppErrorBoundary key={activeTab}');
    expect(app).toContain("const SPLASH_MIN_VISIBLE_MS = 300");
    expect(app).toContain("const warmCriticalScreen = loadInpaintCanvas()");
    expect(app).toContain('typeof idleWindow.requestIdleCallback === "function"');
    const criticalStart = app.indexOf("const warmCriticalScreen");
    const minimumStart = app.indexOf("const minimumSplash", criticalStart);
    expect(app.slice(criticalStart, minimumStart)).not.toMatch(/load(?:ToolsHub|OnlineGalleryPage|AgentPage|MetadataInspector)\(/);
  });

  it("keeps the saved NovelAI token revealable and provides an AI translation provider", () => {
    const app = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    const types = fs.readFileSync(path.join(projectRoot, "src", "types.ts"), "utf8");
    const main = fs.readFileSync(path.join(projectRoot, "electron", "main.ts"), "utf8");
    const preload = fs.readFileSync(path.join(projectRoot, "electron", "preload.ts"), "utf8");
    const store = fs.readFileSync(path.join(projectRoot, "electron", "ipc", "store.ts"), "utf8");
    const nai = fs.readFileSync(path.join(projectRoot, "electron", "ipc", "nai.ts"), "utf8");
    const i18n = fs.readFileSync(path.join(projectRoot, "src", "i18n.ts"), "utf8");

    expect(types).toContain('TranslateProvider = "google" | "baidu" | "ai"');
    expect(main).toContain('ipcMain.handle("nai:storedToken", () => getToken())');
    expect(preload).toContain('storedToken: () => ipcRenderer.invoke("nai:storedToken")');
    expect(app).toContain("window.naiDesktop.storedToken().then(setToken)");
    expect(app).toContain('<option value="ai">{t("settings.aiTranslate")}</option>');
    expect(app).toContain('detectModels("translate")');
    expect(app).toContain('update("translateAiModel", e.target.value)');
    expect(store).toContain('"translateAiApiKey"');
    expect(nai).toContain('settings.translateProvider === "ai"');
    expect(nai).toContain('`${base}/chat/completions`');
    expect(i18n.match(/"settings\.aiTranslate"/g)).toHaveLength(5);
  });

  it("uses the shared listbox selector across every desktop feature", () => {
    const files = [
      "src/App.tsx",
      "src/AgentPage.tsx",
      "src/AitagGallery.tsx",
      "src/ArtistLab.tsx",
      "src/ComicGenerator.tsx",
      "src/PromptCodex.tsx",
      "src/RandomArtistLab.tsx",
      "src/V5ArtistWeightRepair.tsx",
      "src/comic/TagComicGenerator.tsx",
    ];
    for (const file of files) {
      const source = fs.readFileSync(path.join(projectRoot, file), "utf8");
      expect(source, file).not.toMatch(/<select\b/i);
    }
    const ui = fs.readFileSync(path.join(projectRoot, "src", "components", "ui.tsx"), "utf8");
    const styles = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    expect(ui).toContain("export function SelectMenuCompat");
    expect(ui).toContain("collectSelectOptions(children)");
    expect(ui).toContain('role="listbox"');
    expect(styles).toMatch(/\.select-menu-trigger\s*\{[^}]*justify-content:\s*flex-start/s);
    expect(styles).toMatch(/\.select-menu-value\s*\{[^}]*flex:\s*1 1 auto[^}]*text-align:\s*left/s);
    expect(styles).toContain("button:has(> .ui-icon):not(.select-menu-trigger)");
    expect(styles).not.toMatch(/button:has\(> \.ui-icon\)\s*\{[^}]*justify-content:\s*center/s);
  });

  it("keeps custom selects truthful, keyboard-safe, labelled, and scroll-contained", () => {
    const ui = fs.readFileSync(path.join(projectRoot, "src", "components", "ui.tsx"), "utf8");
    const styles = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    const tagComic = fs.readFileSync(path.join(projectRoot, "src", "comic", "TagComicGenerator.tsx"), "utf8");
    expect(ui).toContain("const selectedIndex = options.findIndex");
    expect(ui).toContain("selectedIndex >= 0 ? options[selectedIndex] : undefined");
    expect(ui).toContain('event.key === "Tab"');
    expect(ui).toContain('document.addEventListener("focusin", onFocusIn, true)');
    expect(ui).toContain("aria-controls={menuId}");
    expect(ui).toContain("id={menuId}");
    expect(ui).toContain("const accessibleLabel = selected?.label ? `${ariaLabel}: ${selected.label}` : ariaLabel");
    expect(ui).toContain("findTypeaheadOptionIndex(options, query, activeIndex)");
    expect(ui).toContain("if (open && renderMenu) updatePosition();");
    expect(ui).toContain("[open, renderMenu, updatePosition]");
    expect(styles).toMatch(/\.select-menu-popover\s*\{[^}]*overscroll-behavior:\s*contain/s);
    expect(tagComic).toContain('<option value="">{text(language, "useProjectSize")}</option>');
    expect(tagComic).toContain('if (event.target.value === "")');
  });

  it("keeps every top-level tab mounted with animated transitions and a shared indicator", () => {
    const app = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    const tabs = fs.readFileSync(path.join(projectRoot, "src", "app", "AppTabBar.tsx"), "utf8");
    const css = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    expect(app).toContain('active={activeTab === "records"}');
    expect(app).toContain("PersistentCanvasSurface");
    expect(app).toContain('active ? "is-active" : "is-hidden"');
    expect(css).not.toMatch(/\.persistent-tools-view\.is-hidden\s*\{[^}]*display:\s*none/s);
    expect(css).toMatch(/\.persistent-tools-view\.is-hidden\s*\{[^}]*opacity:\s*0[^}]*visibility:\s*hidden/s);
    expect(css).toMatch(/\.persistent-tools-view\.is-hidden\s*\{[^}]*transition:\s*none/s);
    expect(css).not.toMatch(/\.persistent-tools-view\.is-hidden\s*\{[^}]*visibility\s+0s\s+\.?\d+s/s);
    expect(css).toMatch(/\.persistent-canvas-surface\s*>\s*\.canvas-area\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/s);
    expect(tabs).toContain("startTransition(() => setActiveTab(value))");
    expect(tabs).toContain("tab-active-indicator");
    expect(tabs).toContain("export default memo(AppTabBar)");
  });

  it("uses non-blocking dialogs and virtualizes large history grids", () => {
    const app = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    const agent = fs.readFileSync(path.join(projectRoot, "src", "AgentPage.tsx"), "utf8");
    const ui = fs.readFileSync(path.join(projectRoot, "src", "components", "ui.tsx"), "utf8");
    expect(`${app}\n${agent}`).not.toMatch(/window\.(?:alert|prompt)\s*\(/);
    expect(agent).toContain("stylePresetDialog");
    expect(app).toContain("useVirtualizer({");
    expect(app).toContain("virtualizeHistory = history.length >= 80");
    expect(app).toContain("const MemoizedHistoryPanel = memo(HistoryPanel)");
    expect(ui).toContain("onComplete: () => setRenderMenu(false)");
  });

  it("keeps the reference catalog independent from global UI framework CSS", () => {
    const catalog = fs.readFileSync(path.join(projectRoot, "src", "ReferenceCatalogPanel.tsx"), "utf8");
    const presets = fs.readFileSync(path.join(projectRoot, "src", "ReferencePresetManager.tsx"), "utf8");
    const css = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies).not.toHaveProperty("weui");
    for (const source of [catalog, presets, css]) expect(source).not.toMatch(/\bweui(?:-|\/)/i);
    expect(css).toContain(".reference-ui-btn {");
    expect(css).toContain(".reference-ui-dialog {");
    expect(css).toContain(".reference-ui-tabs { display: flex; }");
  });

  it("lets the tag comic workspace follow the active theme", () => {
    const css = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    expect(css).toMatch(/\.tag-comic\s*\{[^}]*color:\s*var\(--text-primary\)[^}]*background:\s*var\(--bg-window\)/s);
    expect(css).not.toMatch(/\.theme-dark \.tag-comic[^}]*background:\s*#fff/s);
    expect(css).not.toMatch(/\.theme-dark \.tag-comic-(?:card|header|panel-editor)[^}]*background:\s*#fff/s);
  });

  it("keeps feature controls out of broad descendant sizing rules", () => {
    const css = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    expect(css).toContain('.tag-comic input:not([type="checkbox"]):not([type="range"]):not([type="file"])');
    expect(css).not.toMatch(/\.tag-comic input,\s*\n\.tag-comic select/);
    expect(css).toContain("--accent-text:  #ffffff");
  });

  it("keeps render and rejected-request recovery wired", () => {
    const main = fs.readFileSync(path.join(projectRoot, "src", "main.tsx"), "utf8");
    const app = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    const boundary = fs.readFileSync(path.join(projectRoot, "src", "components", "AppErrorBoundary.tsx"), "utf8");
    const comic = fs.readFileSync(path.join(projectRoot, "src", "comic", "TagComicGenerator.tsx"), "utf8");
    const tavern = fs.readFileSync(path.join(projectRoot, "src", "AgentPage.tsx"), "utf8");
    const store = fs.readFileSync(path.join(projectRoot, "src", "store.ts"), "utf8");
    const updater = fs.readFileSync(path.join(projectRoot, "electron", "ipc", "auto-update.ts"), "utf8");
    const nai = fs.readFileSync(path.join(projectRoot, "electron", "ipc", "nai.ts"), "utf8");
    expect(main).toContain('window.addEventListener("unhandledrejection"');
    expect(main).toContain('<AppErrorBoundary scope="app" root>');
    expect(app).toContain('scope={`tab:${activeTab}`}');
    expect(boundary).toContain("getDerivedStateFromError");
    expect(comic).toMatch(/try \{[\s\S]*generateCandidate[\s\S]*finally \{[\s\S]*queueRef\.current\.running = false/);
    expect(tavern).toMatch(/catch \(error\) \{\s*setComposer\(text\)/);
    expect(store).toMatch(/catch \(error\) \{[\s\S]*status: "failed"/);
    expect(updater).toContain("mainWindow.webContents.isDestroyed()");
    expect(nai).toContain('signal?.removeEventListener("abort", onAbort)');
    expect(app).toContain("Number.isFinite(days) ? days : 30");
  });

  it("uses a fluid custom model picker after detection", () => {
    const source = fs.readFileSync(path.join(projectRoot, "src", "AgentPage.tsx"), "utf8");
    const css = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    expect(source).not.toContain('list="tavern-models"');
    expect(source).not.toContain('<datalist id="tavern-models"');
    expect(source).toContain('role="combobox"');
    expect(source).toContain('role="listbox"');
    expect(source).toContain("discoverAndOpen");
    expect(source).toContain("closeOnOutside");
    expect(css).toMatch(/\.tavern-model-results\s*\{[^}]*position:\s*absolute/s);
    expect(css).toContain("animation: tavern-model-list-in");
  });

  it("keeps the retired novel-shorts module out of active product code", () => {
    for (const retiredPath of [
      "src/tuiwen",
      "scripts/create-tuiwen-jianying-validation.mjs",
      "docs/TUIWEN_VALIDATION_STATUS.md",
      "docs/assets/tuiwen-jianying-10.9-golden-open.png",
    ]) {
      expect(fs.existsSync(path.join(projectRoot, retiredPath)), retiredPath).toBe(false);
    }
    const activeFiles = [
      "electron/main.ts",
      "electron/preload.ts",
      "electron/ipc/nai.ts",
      "src/types.ts",
      "src/i18n.ts",
      "src/styles.css",
      "package.json",
      "README.md",
    ];
    for (const file of activeFiles) {
      const source = fs.readFileSync(path.join(projectRoot, file), "utf8");
      expect(source, file).not.toMatch(/tuiwen|小说推文|小說推文|novel shorts|小説ショート|소설 숏폼|novel-tuiwen/i);
    }
  });

  it("keeps Prompt Codex active while excluding its retired request enhancer", () => {
    const tools = fs.readFileSync(path.join(projectRoot, "src", "ToolsHub.tsx"), "utf8");
    const component = fs.readFileSync(path.join(projectRoot, "src", "PromptCodex.tsx"), "utf8");
    const nai = fs.readFileSync(path.join(projectRoot, "electron", "ipc", "nai.ts"), "utf8");
    expect(tools).toContain('setActiveTool("promptCodex")');
    expect(component).toContain("promptCodexBundled()");
    expect(fs.existsSync(path.join(projectRoot, "public", "prompt-codex.json.gz"))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, "src", "data", "prompt-codex.json"))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, "src", "prompt-codex-retrieval.ts"))).toBe(false);
    expect(nai).not.toMatch(/codexEnabled|ruleRepairEnabled|PromptCodexMatch/);
  });

  it("keeps typography, radii, stacking and breakpoints on bounded scales", () => {
    const css = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    for (const match of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
      expect(Number(match[1]), `font-size ${match[0]}`).toBeGreaterThanOrEqual(10);
    }
    for (const match of css.matchAll(/border(?:-[\w]+)*-radius:\s*([^;{}]+)/g)) {
      expect(match[1], match[0]).not.toMatch(/\d+(?:\.\d+)?(?:px|%)/);
    }
    const zValues = [...css.matchAll(/z-index:\s*([^;{}]+)/g)].map((match) => match[1].trim());
    expect(new Set(zValues).size).toBeLessThanOrEqual(10);
    expect(zValues.every((value) => /^var\(--z-[\w-]+\)$/.test(value))).toBe(true);
    const breakpoints = new Set(
      [...css.matchAll(/@media\s*\([^)]*max-width:\s*(\d+)px/g)].map((match) => Number(match[1])),
    );
    expect([...breakpoints].sort((a, b) => a - b)).toEqual([480, 640, 768, 960, 1200, 1440]);
  });

  it("keeps compact prompt and tavern controls easy to hit without changing layout", () => {
    const css = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    expect(css).toMatch(/\.lock-btn,\s*button\.prompt-chip-head,\s*\.tavern-image-status > button\s*\{\s*position:\s*relative;/s);
    expect(css).toMatch(/\.lock-btn::after,\s*button\.prompt-chip-head::after,\s*\.tavern-image-status > button::after\s*\{[^}]*content:\s*"";[^}]*position:\s*absolute;[^}]*inset:\s*-4px 0;/s);
  });

  it("names high stacking layers by height instead of misleading dialog semantics", () => {
    const css = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    expect(css).toContain("--z-floating: 1000");
    expect(css).toContain("--z-overlay: 10000");
    expect(css).toContain("--z-overlay-raised: 11000");
    expect(css).toContain("--z-overlay-top: 20000");
    expect(css).not.toMatch(/--z-(?:dialog|popover|modal)\b/);
  });

  it("keeps large-image comparison scoped and compositor-driven", () => {
    const app = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    const inpaint = fs.readFileSync(path.join(projectRoot, "src", "InpaintCanvas.tsx"), "utf8");
    const css = fs.readFileSync(path.join(projectRoot, "src", "styles.css"), "utf8");
    const viewer = app.slice(app.indexOf("function ZoomableImageStage"), app.indexOf("function ImageCanvas"));
    expect(viewer).not.toContain("setCompareX");
    expect(viewer).not.toContain('window.addEventListener("pointermove"');
    expect(viewer).toContain("requestAnimationFrame");
    expect(viewer).toContain("compareClipRef.current.style.clipPath");
    expect(viewer).toContain("setPointerCapture(event.pointerId)");
    expect(inpaint).toContain('comparisonSurface === "inpaint"');
    expect(inpaint).not.toContain("setCompareX");
    expect(inpaint).not.toContain('window.addEventListener("pointermove"');
    expect(inpaint).toContain("compareClipRef.current.style.clipPath");
    expect(css).toMatch(/\.compare-after-clip\s*\{[^}]*will-change:\s*clip-path/s);
    expect(css).toMatch(/\.inpaint-compare-after-clip\s*\{[^}]*contain:\s*paint/s);
  });

  it("blocks oversized Enhance 2x targets before any generation request", () => {
    const source = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");
    const panel = source.slice(
      source.indexOf("function EnhancePanel"),
      source.indexOf("function DirectorPanel"),
    );
    const guard = panel.indexOf("if (enhanceScale > 1 && requestedTarget.exceedsLimit) return;");
    const request = panel.indexOf("await generateI2I()");
    expect(guard).toBeGreaterThan(-1);
    expect(request).toBeGreaterThan(guard);
    expect(panel).toContain("disabled={outputTooLarge}");
    expect(panel).toContain("disabledReason={outputLimitReason}");
  });

  it("pages the complete artist ranking and local preset libraries on both clients", () => {
    const gallery = fs.readFileSync(path.join(projectRoot, "src", "AitagGallery.tsx"), "utf8");
    const artistIpc = fs.readFileSync(path.join(projectRoot, "electron", "ipc", "artist-lab.ts"), "utf8");
    const presets = fs.readFileSync(path.join(projectRoot, "src", "ReferencePresetManager.tsx"), "utf8");
    const mobileGallery = fs.readFileSync(path.join(projectRoot, "mobile", "lib", "screens", "online_gallery_screen.dart"), "utf8");
    const mobileArtists = fs.readFileSync(path.join(projectRoot, "mobile", "lib", "services", "artist_tag_service.dart"), "utf8");
    const mobilePresets = fs.readFileSync(path.join(projectRoot, "mobile", "lib", "screens", "generate_screen.dart"), "utf8");
    expect(gallery).toContain("artistLabArtistRanking(targetPage, targetPageSize, targetQuery, force)");
    expect(gallery).toContain("artistPageSize");
    expect(artistIpc).toContain("DANBOORU_TAG_PAGE_SIZE = 1000");
    expect(artistIpc).toContain("countActiveArtistTags");
    const ranking = artistIpc.slice(artistIpc.indexOf("export async function loadPopularArtistRanking"), artistIpc.indexOf("async function scorer"));
    expect(ranking).not.toContain("5000");
    expect(presets).toContain("LOCAL_PAGE_SIZE_OPTIONS");
    expect(presets).toContain("LocalPresetPageNumberInput");
    expect(mobileGallery).toContain("artistService.rankingPage");
    expect(mobileGallery).toContain("_chooseArtistPage");
    expect(mobileArtists).toContain("_apiPageSize = 1000");
    expect(mobileArtists).toContain("Future<ArtistRankingPage> rankingPage");
    expect(mobilePresets).toContain("referencePresets.pagePosition");
    expect(mobilePresets).not.toContain("reference-preset-load-more");
  });
});
