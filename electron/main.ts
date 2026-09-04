import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  session,
  shell,
} from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import {
  LEGACY_USER_DATA_DIRS,
  migrateLegacyUserDataStore,
  STABLE_USER_DATA_DIR,
  STORE_FILE_NAME,
} from "./user-data-migration";
import {
  installLocalMediaProtocol,
  localMediaUrlToPath,
  registerLocalMediaScheme,
} from "./ipc/local-media-protocol";
import {
  augmentImg,
  analyzeComicScript,
  cancelGeneration,
  checkComicConsistency,
  clearAiCallLog,
  clearWorkbenchImage,
  getAiCallLog,
  convertComicPanels,
  convertPromptText,
  exportTagComicSelectedZip,
  generateComicPanel,
  generateTagComicCandidate,
  importTagComicReference,
  deleteTagComicReference,
  generateArtistLabImage,
  promoteArtistLabFavorite,
  deleteArtistLabTemporary,
  clearArtistLabTemporary,
  generateI2I,
  generateImage,
  redrawImage,
  inpaintImage,
  loadImageFile,
  loadImageFromPath,
  listAiModels,
  quoteAnlasCost,
  refreshStoredAccount,
  reversePromptImage,
  searchTagServer,
  suggestTags,
  testTagServer,
  translateText,
  upscaleImg,
  verifyToken,
} from "./ipc/nai";

registerLocalMediaScheme();
import {
  artistStyleCatalog,
  danbooruStatus,
  downloadDanbooruTags,
  browseDanbooru,
  searchDanbooru,
} from "./ipc/danbooru-tags";
import {
  clearResourceQueryCache,
  downloadResourceDatabase,
  getResourceDatabaseOverview,
  openResourceDatabaseDirectory,
  pauseResourceDatabaseDownload,
  relatedResourceTags,
  restorePreviousResourceDatabase,
} from "./ipc/resource-databases";
import {
  clearAitagDataCache,
  getAitagConfig,
  getAitagSnapshot,
  getAitagWork,
  prewarmAitag,
  searchAitag,
  searchAitagFresh,
} from "./ipc/aitag";
import {
  aitagCacheStats,
  cacheAitagImage,
  clearAitagCache,
  cacheOnlineGalleryImage,
} from "./ipc/aitag-cache";
import { clearOnlineGalleryDataCache, getOnlineGalleryDetail, searchOnlineGallery } from "./ipc/online-gallery";
import {
  artistLabModelStatus,
  artistStylePreview,
  discoverSimilarArtists,
  clearArtistLabModels,
  loadPopularArtistRanking,
  loadPopularArtistTags,
  pickArtistLabTarget,
  scoreArtistLabImages,
  searchArtistTags,
} from "./ipc/artist-lab";
import {
  ARTIST_FAVORITE_COLLECTIONS,
  loadArtistFavoriteLibrary,
  saveArtistFavoriteCollection,
  type ArtistFavoriteCollectionName,
} from "./ipc/artist-favorites";
import {
  loadPromptCodexCache,
  loadBundledPromptCodex,
  updatePromptCodex,
} from "./ipc/prompt-codex";
import {
  loadMetadataSnapshotFile,
  readMetadataSnapshotFromPath,
  saveMetadataSnapshotFile,
  saveMetadataSnapshotFromPath,
} from "./ipc/metadata-snapshot";
import {
  createReferencePresetGroup,
  deleteReferencePresetGroup,
  deleteReferencePreset,
  exportReferencePresets,
  importReferencePresets,
  listReferencePresets,
  moveReferencePresetToGroup,
  readReferencePreset,
  saveReferencePreset,
} from "./ipc/reference-presets";
import {
  deleteStylePromptPresetImage,
  deleteStylePromptPresetImages,
  copyStylePromptPreviewImages,
  importStylePromptPresetImages,
  reconcileStylePromptPreviewImages,
} from "./ipc/style-preset-images";
import {
  exportDataBackup,
  getDataBackupStatus,
  importDataBackup,
  inspectDataBackup,
  openBackupDirectory,
  runAutomaticBackup,
  selectBackupDirectory,
} from "./ipc/data-backup";
import type {
  AnlasQuoteRequest,
  AugmentOptions,
  BatchExportFile,
  BatchRedrawRequest,
  ComicAnalyzeRequest,
  ComicConsistencyRequest,
  ComicConvertRequest,
  ComicGeneratePanelRequest,
  TagComicExportZipRequest,
  TagComicGenerateRequest,
  TagComicReferenceImportRequest,
  DirectorTool,
  DataBackupExportRequest,
  DataBackupImportRequest,
  GenerationPreviewEvent,
  I2IParams,
  MetadataSnapshotPayload,
  NAIInpaintModel,
  StylePromptPreviewImage,
  UpscaleScale,
  TextToolHistoryItem,
  ResourceDatabaseId,
} from "../src/types";
import {
  addTextToolHistoryItem,
  clearToken,
  clearTextToolHistory,
  completeSetup,
  getAccountSummary,
  getReversePromptTemplateDefaults,
  getSetting,
  getSettings,
  getTextToolHistory,
  pruneMissingHistoryItem,
  pruneMissingReverseHistoryItem,
  readStore,
  removeTextToolHistoryItem,
  setSetting,
} from "./ipc/store";
import {
  assignHistoryGroup,
  createGroup,
  deleteHistoryItem,
  exportFiles,
  exportGroup,
  listHistory,
  listHistoryDates,
  listHistoryGroups,
  openTarget,
  removeGroup,
  renameGroup,
  renameHistoryItem,
  selectOutputDir,
} from "./ipc/storage";
import { checkUpdate } from "./ipc/update";
import {
  downloadUpdate,
  installUpdate,
  wireAutoUpdater,
} from "./ipc/auto-update";
import { isPortableBuild } from "./ipc/app-mode";
import {
  configureSystemProxyResolver,
  refreshSystemProxy,
} from "./ipc/proxy";
import {
  installGlobalLogging,
  getLogInfo,
  selectLogDir,
  openLogFile,
  openLogDir,
  readRecentLog,
} from "./ipc/logger";
import {
  createAgentConversation,
  deleteAgentAttachment,
  deleteAgentConversation,
  deleteAgentMemory,
  deleteAgentSkill,
  importAgentFiles,
  exportAgentAttachment,
  readAgentWorkspace,
  renameAgentConversation,
  saveTavernWorkspace,
  selectAgentConversation,
  upsertAgentMemory,
  upsertAgentSkill,
} from "./ipc/agent-store";
import {
  abortAgentMessage,
  compactAgentConversation,
  getAgentPendingPermissions,
  getAgentRuntimeStatus,
  respondAgentPermission,
  restartAgentRuntime,
  sendAgentMessage,
  setAgentEventSink,
  stopAgentRuntime,
  generateTavernImage,
} from "./ipc/agent-runtime";
import { discoverAgentModels } from "./ipc/agent-model-discovery";
import { getAgentWorkspaceLocation, openAgentWorkspaceDirectory } from "./ipc/agent-workspace-location";
import { exportTavernCard, importTavernCards, importTavernVisualAsset } from "./ipc/tavern-card";
import type {
  AgentMemory,
  AgentProviderProbe,
  AgentSendRequest,
  AgentSkill,
  AgentWorkspaceData,
  TavernCardExportRequest,
  TavernImageRequest,
} from "../src/agent/types";

// Launching the app while it's already running should focus the existing
// window, not spawn a second process fighting over the same userData store.
const uiCapturePath = process.env.NAI_UI_CAPTURE_PATH?.trim();
const uiCaptureUserData = process.env.NAI_UI_CAPTURE_USER_DATA?.trim();
const normalizedUiCapturePath = uiCapturePath?.replaceAll("\\", "/").toLowerCase() ?? "";
if (uiCaptureUserData) app.setPath("userData", path.resolve(uiCaptureUserData));
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

/**
 * Right-click context menu for text fields: 剪切 / 复制 / 粘贴 / 全选. Electron
 * ships no default editing menu, so we build one per right-click based on what's
 * available (editable field, current selection, clipboard text).
 */
function attachEditContextMenu(win: BrowserWindow) {
  win.webContents.on("context-menu", (_event, params) => {
    const { isEditable, editFlags } = params;
    const hasSelection = params.selectionText.trim().length > 0;
    if (!isEditable && !hasSelection) return;
    const template: Electron.MenuItemConstructorOptions[] = [];
    if (isEditable) {
      template.push({ label: "剪切", role: "cut", enabled: editFlags.canCut });
    }
    template.push({ label: "复制", role: "copy", enabled: editFlags.canCopy });
    if (isEditable) {
      template.push({
        label: "粘贴",
        role: "paste",
        enabled: editFlags.canPaste,
      });
    }
    template.push({ type: "separator" }, { label: "全选", role: "selectAll" });
    Menu.buildFromTemplate(template).popup({ window: win });
  });
}

function pinUserDataAndMigrate() {
  const appData = app.getPath("appData");
  const stableDir = path.join(appData, STABLE_USER_DATA_DIR);
  try {
    app.setPath("userData", stableDir);
    migrateLegacyUserDataStore({
      appData,
      stableDir,
      legacyDirs: LEGACY_USER_DATA_DIRS,
      storeFile: STORE_FILE_NAME,
    });
  } catch {
    // Non-fatal: fall back to whatever userData Electron resolved.
  }
}

function createWindow() {
  const iconPath = isDev
    ? path.join(__dirname, "../../public/icon.png")
    : path.join(__dirname, "../../dist/icon.png");

  mainWindow = new BrowserWindow({
    width: normalizedUiCapturePath.includes("/compact/") ? 1120 : 1385,
    height: normalizedUiCapturePath.includes("/compact/") ? 760 : 900,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    frame: false,
    backgroundColor: "#f0eff9",
    title: "Langbai NovelAI Studio",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      // Disable the native spellchecker so prompts (English Danbooru tags)
      // don't get red squiggly underlines.
      spellcheck: false,
    },
  });

  attachEditContextMenu(mainWindow);

  // Defense in depth: the app never needs to navigate this window away from
  // its own bundled UI, or open a second BrowserWindow. External links
  // already go through the dedicated window:openExternal IPC channel (which
  // validates http/https itself) — closing these off means a future XSS or
  // malicious-content bug can't escalate into loading an arbitrary remote
  // page inside the app (with its Electron API surface) or spawning one.
  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    const current = mainWindow?.webContents.getURL();
    if (current && targetUrl !== current) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  mainWindow.once("ready-to-show", () => {
    if (!uiCapturePath) mainWindow?.show();
  });

  if (uiCapturePath) {
    mainWindow.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        try {
          await mainWindow?.webContents.executeJavaScript(`(() => {
            const skip = [...document.querySelectorAll('button')].find((button) =>
              (button.textContent || '').includes('跳过向导'));
            if (skip) skip.click();
          })()`);
          await new Promise((resolve) => setTimeout(resolve, 1200));
          await new Promise((resolve) => setTimeout(resolve, 450));
          if (normalizedUiCapturePath.includes("/dark/")) {
            await mainWindow?.webContents.executeJavaScript(
              "document.documentElement.classList.add('theme-dark')",
            );
          }
          if (normalizedUiCapturePath.includes("settings-") && normalizedUiCapturePath.includes("-bottom")) {
            const scrollSettingsBottom = () => mainWindow?.webContents.executeJavaScript(`new Promise((resolve) => {
              const startedAt = Date.now();
              const scrollSettings = () => {
                const content = document.querySelector('.settings-content');
                if (content) {
                  const target = content.querySelector('.settings-form')?.lastElementChild;
                  target?.scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'instant' });
                  content.scrollTop = content.scrollHeight;
                  content.getBoundingClientRect();
                  resolve(true);
                  return;
                }
                if (Date.now() - startedAt > 2500) {
                  resolve(false);
                  return;
                }
                setTimeout(scrollSettings, 80);
              };
              scrollSettings();
            })`);
            await scrollSettingsBottom();
            await new Promise((resolve) => setTimeout(resolve, 450));
            await scrollSettingsBottom();
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
          if (normalizedUiCapturePath.includes("random-artist-params")) {
            const revealRandomParameters = () => mainWindow?.webContents.executeJavaScript(`(() => {
              const target = document.querySelector('.random-generation-settings');
              const scroller = document.querySelector('.random-artist-lab');
              if (!target || !scroller) return false;
              scroller.scrollTop = Math.max(0, target.offsetTop - 16);
              target.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' });
              scroller.scrollTop = Math.max(0, scroller.scrollTop - 16);
              return true;
            })()`);
            // The popularity pool resolves asynchronously and can relayout the
            // page once. Reveal twice so the evidence screenshot always shows
            // the actual parameter editor rather than the page header.
            await revealRandomParameters();
            await new Promise((resolve) => setTimeout(resolve, 450));
            await revealRandomParameters();
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
          if (normalizedUiCapturePath.includes("agent-reasoning")) {
            await mainWindow?.webContents.executeJavaScript(`(() => {
              const chips = [...document.querySelectorAll('.tavern-tool-chip')];
              const trigger = chips.find((button) =>
                (button.textContent || '').includes('推理强度')) || chips.find((button) =>
                !button.classList.contains('is-command') && !button.classList.contains('is-secondary') &&
                (button.textContent || '').includes('自动'));
              window.__agentReasoningCapture = {
                chipCount: chips.length,
                found: Boolean(trigger),
                disabled: Boolean(trigger?.disabled),
                text: String(trigger?.textContent || '').trim(),
              };
              if (!trigger || trigger.disabled) return false;
              trigger.focus();
              trigger.click();
              return true;
            })()`);
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
          const audit = await mainWindow?.webContents.executeJavaScript(`(() => {
            const visible = (element) => {
              const style = getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
            };
            const describe = (element) => ({
              tag: element.tagName.toLowerCase(),
              className: String(element.className || '').slice(0, 180),
              text: String(element.getAttribute('aria-label') || element.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 120),
            });
            const hasHorizontalScroller = (element) => {
              let parent = element.parentElement;
              while (parent) {
                if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowX)) return true;
                parent = parent.parentElement;
              }
              return false;
            };
            const viewportOverflow = [...document.querySelectorAll('button, input, select, textarea, [role="button"]')]
              .filter(visible)
              .filter((element) => {
                const rect = element.getBoundingClientRect();
                if (rect.bottom <= 0 || rect.top >= innerHeight) return false;
                return !hasHorizontalScroller(element) && (rect.left < -1 || rect.right > innerWidth + 1);
              })
              .map(describe);
            const contentOverflow = [...document.querySelectorAll('button, label, .btn, .menu-action, .tab-bar button, .reference-catalog-select')]
              .filter(visible)
              .filter((element) => {
                const style = getComputedStyle(element);
                return element.scrollWidth > element.clientWidth + 2 && !['auto', 'scroll'].includes(style.overflowX);
              })
              .map(describe);
            const iconOverflow = [...document.querySelectorAll('.ui-icon')]
              .filter(visible)
              .flatMap((icon) => {
                const container = icon.closest('.btn-icon, .tab-icon, .reference-catalog-cloud-mark, .reference-catalog-series-icon, button');
                if (!container || !visible(container)) return [];
                const ir = icon.getBoundingClientRect();
                const cr = container.getBoundingClientRect();
                return ir.left < cr.left - 1 || ir.right > cr.right + 1 || ir.top < cr.top - 1 || ir.bottom > cr.bottom + 1
                  ? [{ icon: describe(icon), container: describe(container) }]
                  : [];
              });
            const iconMisalignment = [...document.querySelectorAll('button .ui-icon, .btn .ui-icon')]
              .filter(visible)
              .flatMap((icon) => {
                const container = icon.closest('button, .btn');
                if (!container || !visible(container) || !(container.textContent || '').trim()) return [];
                // Large empty-state/drop-zone buttons deliberately stack an
                // icon above multiple text rows; they are not inline controls.
                if (container.getBoundingClientRect().height > 58) return [];
                const ir = icon.getBoundingClientRect();
                const cr = container.getBoundingClientRect();
                const deltaY = Math.abs((ir.top + ir.height / 2) - (cr.top + cr.height / 2));
                return deltaY > 2.5 ? [{ icon: describe(icon), container: describe(container), deltaY: Number(deltaY.toFixed(2)) }] : [];
              });
            const textMisalignment = [...document.querySelectorAll('button, .btn')]
              .filter(visible)
              .flatMap((element) => {
                if (element.getBoundingClientRect().height > 58) return [];
                const style = getComputedStyle(element);
                // Inspector destinations deliberately stack icon and label.
                // Their text is not expected to share the button's vertical
                // midpoint like an inline action.
                if (style.display === 'grid' || style.flexDirection === 'column') return [];
                const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
                const rects = [];
                let node;
                while ((node = walker.nextNode())) {
                  if (!node.textContent?.trim()) continue;
                  const range = document.createRange();
                  range.selectNodeContents(node);
                  const rect = range.getBoundingClientRect();
                  if (rect.width > 0 && rect.height > 0) rects.push(rect);
                }
                if (!rects.length) return [];
                const top = Math.min(...rects.map((rect) => rect.top));
                const bottom = Math.max(...rects.map((rect) => rect.bottom));
                const cr = element.getBoundingClientRect();
                const deltaY = Math.abs((top + bottom) / 2 - (cr.top + cr.height / 2));
                return deltaY > 3 ? [{ element: describe(element), deltaY: Number(deltaY.toFixed(2)) }] : [];
              });
            const duplicateArrowRisk = [...document.querySelectorAll('select')]
              .filter(visible)
              .filter((element) => getComputedStyle(element).appearance !== 'none' && Boolean(element.closest('.reference-catalog-select')))
              .map(describe);
            const openSelectMenus = [...document.querySelectorAll('.select-menu-popover')]
              .filter(visible)
              .map((element) => ({ ...describe(element), optionCount: element.querySelectorAll('[role="option"]').length }));
            const randomArtistDetails = [...document.querySelectorAll('.random-generation-settings, .artist-weight-tuner')]
              .map((element) => {
                const style = getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                return { ...describe(element), open: Boolean(element.open), scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, rect: { top: rect.top, bottom: rect.bottom, height: rect.height }, display: style.display, height: style.height, maxHeight: style.maxHeight, overflow: style.overflow };
              });
            const settingsScroll = [...document.querySelectorAll('.settings-content')]
              .map((element) => ({ scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }));
            const galleryImageStates = [...document.querySelectorAll('.aitag-card-image')]
              .slice(0, 12)
              .map((element) => {
                const image = element.querySelector('img');
                return image
                  ? { hasImage: true, complete: image.complete, naturalWidth: image.naturalWidth, src: image.currentSrc || image.src }
                  : { hasImage: false, text: String(element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80) };
              });
            const composerPopovers = [...document.querySelectorAll('.tavern-composer-popover')]
              .filter(visible)
              .map((element) => {
                const rect = element.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const style = getComputedStyle(element);
                const ancestors = [];
                let parent = element.parentElement;
                while (parent && ancestors.length < 8) {
                  const parentStyle = getComputedStyle(parent);
                  ancestors.push({
                    ...describe(parent),
                    overflow: parentStyle.overflow,
                    overflowX: parentStyle.overflowX,
                    overflowY: parentStyle.overflowY,
                    position: parentStyle.position,
                    zIndex: parentStyle.zIndex,
                  });
                  parent = parent.parentElement;
                }
                return {
                  ...describe(element),
                  rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
                  style: { display: style.display, visibility: style.visibility, opacity: style.opacity, position: style.position, zIndex: style.zIndex, backgroundColor: style.backgroundColor },
                  topAtCenter: document.elementsFromPoint(centerX, centerY).slice(0, 8).map(describe),
                  ancestors,
                };
              });
            return { viewport: { width: innerWidth, height: innerHeight }, viewportOverflow, contentOverflow, iconOverflow, iconMisalignment, textMisalignment, duplicateArrowRisk, openSelectMenus, randomArtistDetails, settingsScroll, galleryImageStates, composerPopovers, agentReasoningCapture: window.__agentReasoningCapture ?? null };
          })()`);
          const image = await mainWindow?.webContents.capturePage();
          if (image) {
            const target = path.resolve(uiCapturePath);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, image.toPNG());
            fs.writeFileSync(`${target}.audit.json`, JSON.stringify(audit, null, 2));
          }
        } finally {
          app.quit();
        }
      }, 5000);
    });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (isDev) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL!);
  } else {
    const captureTheme = normalizedUiCapturePath.includes("/dark/")
      ? "dark"
      : "light";
    const captureTab = [
      ["01-generate", "generate"],
      ["02-inpaint", "inpaint"],
      ["03-upscale", "upscale"],
      ["04-postprocess", "postprocess"],
      ["05-inspect", "inspect"],
      ["05-reverse", "inspect"],
      ["06-convert", "convert"],
      ["07-metadata", "metadata"],
      ["08-tools", "tools"],
      ["09-reference-presets", "referencePresets"],
      ["10-online-gallery", "onlineGallery"],
      ["11-agent", "agent"],
      ["12-records", "records"],
      ["11-records", "records"],
      ["09-records", "records"],
      ["10-records", "records"],
    ].find(([needle]) => normalizedUiCapturePath.includes(needle))?.[1];
    const captureSurface = normalizedUiCapturePath.includes("v5-artist-repair")
      ? "v5ArtistRepair"
      : normalizedUiCapturePath.includes("artist-string-draw")
      ? "artistStringDraw"
      : normalizedUiCapturePath.includes("random-artist")
      ? "randomArtist"
      : normalizedUiCapturePath.includes("opus-inline")
      ? "opusInline"
      : normalizedUiCapturePath.includes("opus-usage")
      ? "opusUsage"
      : normalizedUiCapturePath.includes("reference-modal")
      ? "referenceModal"
      : normalizedUiCapturePath.includes("settings")
        ? "settings"
        : captureTab ?? "referencePresets";
    const captureSettingsSection = [
      "api",
      "storage",
      "ai-reverse",
      "convert-api",
      "templates",
      "prompt",
      "language",
      "appearance",
      "performance",
      "about",
    ].find((section) => normalizedUiCapturePath.includes(`settings-${section}`));
    const captureCatalogState = normalizedUiCapturePath.includes("series-confirm")
      ? "confirm"
      : normalizedUiCapturePath.includes("series-progress")
        ? "progress"
        : normalizedUiCapturePath.includes("series-failed")
          ? "failed"
          : normalizedUiCapturePath.includes("series-complete")
            ? "complete"
            : normalizedUiCapturePath.includes("catalog-preview")
              ? "preview"
              : normalizedUiCapturePath.includes("series-selected")
                ? "selected"
                : "empty";
    const capturePresetSection = normalizedUiCapturePath.includes("local-presets") ? "local" : "online";
    void mainWindow.loadFile(
      path.join(__dirname, "../../dist/index.html"),
      uiCapturePath
        ? { query: { uiCapture: captureSurface, uiTheme: captureTheme, uiSettingsSection: captureSettingsSection ?? "", uiCatalogState: captureCatalogState, uiPresetSection: capturePresetSection, uiSelectOpen: normalizedUiCapturePath.includes("select-open") ? "1" : "0", uiPresetPicker: normalizedUiCapturePath.includes("preset-picker") ? "1" : "0", uiPresetCreate: normalizedUiCapturePath.includes("preset-create") ? "1" : "0", uiStylePresetOpen: normalizedUiCapturePath.includes("style-preset-menu") || normalizedUiCapturePath.includes("style-preset-images") ? "1" : "0", uiStylePresetActions: normalizedUiCapturePath.includes("style-preset-actions") ? "1" : "0", uiStylePresetImages: normalizedUiCapturePath.includes("style-preset-images") ? "1" : "0" } }
        : undefined,
    );
  }
}

function registerIpc() {
  ipcMain.handle("agent:getWorkspace", () => readAgentWorkspace());
  ipcMain.handle("agent:saveWorkspace", (_event, workspace: AgentWorkspaceData) => saveTavernWorkspace(workspace));
  ipcMain.handle("agent:createConversation", (_event, title?: string) => createAgentConversation(title));
  ipcMain.handle("agent:selectConversation", (_event, conversationId: string) => selectAgentConversation(conversationId));
  ipcMain.handle("agent:renameConversation", (_event, conversationId: string, title: string) => renameAgentConversation(conversationId, title));
  ipcMain.handle("agent:deleteConversation", (_event, conversationId: string) => deleteAgentConversation(conversationId));
  ipcMain.handle("agent:importFiles", (_event, conversationId: string, sourcePaths?: string[]) => importAgentFiles(conversationId, sourcePaths));
  ipcMain.handle("agent:deleteAttachment", (_event, conversationId: string, attachmentId: string) => deleteAgentAttachment(conversationId, attachmentId));
  ipcMain.handle("agent:exportAttachment", (_event, conversationId: string, messageId: string, attachmentId: string) => exportAgentAttachment(conversationId, messageId, attachmentId));
  ipcMain.handle("agent:send", (_event, request: AgentSendRequest) => sendAgentMessage(request));
  ipcMain.handle("agent:generateImage", (_event, request: TavernImageRequest) => generateTavernImage(request));
  ipcMain.handle("agent:importCards", (_event, sourcePaths?: string[]) => importTavernCards(sourcePaths));
  ipcMain.handle("agent:exportCard", (_event, request: TavernCardExportRequest) => exportTavernCard(request));
  ipcMain.handle("agent:importVisual", (_event, kind: "avatar" | "background") => importTavernVisualAsset(kind));
  ipcMain.handle("agent:abort", (_event, conversationId: string) => abortAgentMessage(conversationId));
  ipcMain.handle("agent:compact", (_event, conversationId: string) => compactAgentConversation(conversationId));
  ipcMain.handle("agent:respondPermission", (_event, permissionId: string, response: "once" | "always" | "reject") => respondAgentPermission(permissionId, response));
  ipcMain.handle("agent:upsertSkill", (_event, skill: Partial<AgentSkill> & Pick<AgentSkill, "name" | "instructions">) => upsertAgentSkill(skill));
  ipcMain.handle("agent:deleteSkill", (_event, skillId: string) => deleteAgentSkill(skillId));
  ipcMain.handle("agent:upsertMemory", (_event, memory: Partial<AgentMemory> & Pick<AgentMemory, "title" | "content" | "scope">) => upsertAgentMemory(memory));
  ipcMain.handle("agent:deleteMemory", (_event, memoryId: string) => deleteAgentMemory(memoryId));
  ipcMain.handle("agent:runtimeStatus", () => getAgentRuntimeStatus());
  ipcMain.handle("agent:pendingPermissions", () => getAgentPendingPermissions());
  ipcMain.handle("agent:restartRuntime", () => restartAgentRuntime());
  ipcMain.handle("agent:discoverModels", (_event, probe: AgentProviderProbe) => discoverAgentModels(probe));
  ipcMain.handle("agent:workspaceLocation", () => getAgentWorkspaceLocation());
  ipcMain.handle("agent:openWorkspace", () => openAgentWorkspaceDirectory());
  ipcMain.handle("promptCodex:cache", () => loadPromptCodexCache());
  ipcMain.handle("promptCodex:bundled", () => loadBundledPromptCodex());
  ipcMain.handle("promptCodex:update", () => updatePromptCodex());
  ipcMain.handle("artistLab:pickTarget", () => pickArtistLabTarget());
  ipcMain.handle(
    "artistLab:searchArtists",
    (_event, query: unknown, limit: unknown) => searchArtistTags(query, limit),
  );
  ipcMain.handle(
    "artistLab:popularArtists",
    (_event, limit: unknown, force: unknown) =>
      loadPopularArtistTags(limit, force, true),
  );
  ipcMain.handle(
    "artistLab:artistRanking",
    (_event, limit: unknown, force: unknown) =>
      loadPopularArtistRanking(limit, force),
  );
  ipcMain.handle(
    "artistLab:scoreImages",
    (_event, mode: unknown, targetPath: unknown, candidatePath: unknown) =>
      scoreArtistLabImages(mode, targetPath, candidatePath),
  );
  ipcMain.handle("artistLab:modelStatus", (_event, mode: unknown) =>
    artistLabModelStatus(mode),
  );
  ipcMain.handle(
    "artistLab:discoverSimilar",
    (_event, mode: unknown, targetPath: unknown, offset: unknown, scanCount: unknown, shortlist: unknown, force: unknown) =>
      discoverSimilarArtists(mode, targetPath, offset, scanCount, shortlist, force),
  );
  ipcMain.handle("artistLab:clearModels", () => clearArtistLabModels());
  ipcMain.handle("artistLab:stylePreview", (_event, tag: unknown) =>
    artistStylePreview(tag),
  );
  ipcMain.handle("aitag:config", () => getAitagConfig());
  ipcMain.handle("aitag:search", (_event, request: unknown) =>
    searchAitag(request),
  );
  ipcMain.handle("aitag:search-fresh", (_event, request: unknown) =>
    searchAitagFresh(request),
  );
  ipcMain.handle("aitag:snapshot", () => getAitagSnapshot());
  ipcMain.handle("aitag:work", (_event, id: unknown) => getAitagWork(id));
  ipcMain.handle("aitag:prewarm", (_event, days: unknown) =>
    prewarmAitag(days),
  );
  ipcMain.handle("aitag:clear-data-cache", () => clearAitagDataCache());
  ipcMain.handle("aitag:cache-image", (_event, url: unknown, days: unknown, force: unknown) =>
    cacheAitagImage(url, days, force),
  );
  ipcMain.handle("aitag:cache-stats", () => aitagCacheStats());
  ipcMain.handle("aitag:clear-cache", () => clearAitagCache());
  ipcMain.handle("online-gallery:search", (_event, request: unknown) => searchOnlineGallery(request));
  ipcMain.handle("online-gallery:detail", (_event, request: unknown) => getOnlineGalleryDetail(request));
  ipcMain.handle("online-gallery:clear-data-cache", () => clearOnlineGalleryDataCache());
  ipcMain.handle("online-gallery:cache-image", (_event, source: unknown, url: unknown, days: unknown, force: unknown) =>
    cacheOnlineGalleryImage(source, url, days, force),
  );
  ipcMain.handle("nai:hasToken", async () => {
    const summary = getAccountSummary();
    if (!summary.hasToken) return summary;
    return refreshStoredAccount();
  });
  // Local-only summary (token presence + last cached balance), no network. Used
  // at boot so a slow/blocked NovelAI connection can't delay app startup; the
  // renderer refreshes the live balance via nai:hasToken after the first frame.
  ipcMain.handle("nai:accountCached", () => getAccountSummary());
  ipcMain.handle("nai:verify", (_event, token: string) => verifyToken(token));
  ipcMain.handle("nai:clearToken", () => {
    clearToken();
    return { ok: true };
  });
  ipcMain.handle("nai:quoteAnlas", (_event, request: AnlasQuoteRequest) =>
    quoteAnlasCost(request),
  );
  ipcMain.handle("nai:generate", (event, params, extras, previewRequestId?: string) => {
    const onPreview = typeof previewRequestId === "string" && previewRequestId
      ? (preview: Omit<GenerationPreviewEvent, "requestId">) => {
          if (event.sender.isDestroyed()) return;
          event.sender.send("nai:generationPreview", {
            ...preview,
            requestId: previewRequestId,
          } satisfies GenerationPreviewEvent);
        }
      : undefined;
    return generateImage(params, extras, { onPreview });
  });
  ipcMain.handle("nai:generateArtistLab", (_event, params, extras, mode) =>
    generateArtistLabImage(params, extras, mode),
  );
  ipcMain.handle("artistLab:promoteFavorite", (_event, item) =>
    promoteArtistLabFavorite(item),
  );
  ipcMain.handle("artistLab:listPromotedFavorites", () =>
    listHistory().filter((item) => (
      item.feature === "artist-lab"
      && typeof item.filePath === "string"
      && path.basename(item.filePath).toLowerCase().startsWith("artist-lab-random")
    )),
  );
  ipcMain.handle("artistLab:loadFavoriteLibrary", () =>
    loadArtistFavoriteLibrary(app.getPath("userData")),
  );
  ipcMain.handle(
    "artistLab:saveFavoriteCollection",
    (_event, collection: unknown, favorites: unknown) => {
      if (!ARTIST_FAVORITE_COLLECTIONS.some((value) => value === collection)) {
        throw new TypeError("Unknown artist favorite collection.");
      }
      return saveArtistFavoriteCollection(
        app.getPath("userData"),
        collection as ArtistFavoriteCollectionName,
        favorites,
      ).then(() => ({ ok: true }));
    },
  );
  ipcMain.handle("artistLab:deleteTemporary", (_event, filePath) =>
    deleteArtistLabTemporary(filePath),
  );
  ipcMain.handle("artistLab:clearTemporary", () => clearArtistLabTemporary());
  ipcMain.handle("nai:generateI2I", (_event, params, i2i: I2IParams, extras) =>
    generateI2I(params, i2i, extras),
  );
  ipcMain.handle("nai:redrawImage", (_event, request: BatchRedrawRequest) =>
    redrawImage(request),
  );
  ipcMain.handle(
    "nai:inpaint",
    (
      _event,
      params,
      inpaintModel: NAIInpaintModel,
      maskBase64: string,
      strength: number,
      noise: number,
    ) => inpaintImage(params, inpaintModel, maskBase64, strength, noise),
  );
    ipcMain.handle("nai:upscale", (_event, scale: UpscaleScale, model: string) =>
      upscaleImg(scale, model),
    );
  ipcMain.handle(
    "nai:augment",
    (_event, tool: DirectorTool, options: AugmentOptions) =>
      augmentImg(tool, options),
  );
  ipcMain.handle("nai:loadImage", () => loadImageFile());
  ipcMain.handle("nai:loadImageFromPath", (_event, filePath: string) =>
    loadImageFromPath(filePath),
  );
  ipcMain.handle("metadata:saveSnapshot", (_event, payload: MetadataSnapshotPayload) =>
    saveMetadataSnapshotFile(app.getPath("userData"), payload),
  );
  ipcMain.handle("metadata:saveSnapshotFromPath", (_event, filePath: string) =>
    saveMetadataSnapshotFromPath(app.getPath("userData"), filePath),
  );
  ipcMain.handle("metadata:readSnapshotFromPath", (_event, filePath: string) =>
    readMetadataSnapshotFromPath(app.getPath("userData"), filePath),
  );
  ipcMain.handle("metadata:loadSnapshot", () =>
    loadMetadataSnapshotFile(app.getPath("userData")),
  );
  ipcMain.handle("nai:clearWorkbenchImage", () => clearWorkbenchImage());
  ipcMain.handle(
    "nai:reversePrompt",
    (
      _event,
      imageBase64: string,
      mode: string,
      scope?: string,
      hint?: string,
      knownCharacter?: boolean,
      templateVersion?: string,
    ) =>
      reversePromptImage(
        imageBase64,
        (mode as "tags" | "natural" | "mixed") ?? "tags",
        scope,
        hint,
        knownCharacter,
        templateVersion === "v4.5" ? "v4.5" : "v5",
      ),
  );
  ipcMain.handle(
    "nai:convertPrompt",
    (_event, text: string, mode: string, knownCharacter?: boolean, templateVersion?: string) =>
      convertPromptText(
        text,
        (mode as "tags" | "natural" | "mixed") ?? "tags",
        knownCharacter,
        templateVersion === "v4.5" ? "v4.5" : "v5",
      ),
  );
  ipcMain.handle(
    "comic:analyzeScript",
    (_event, request: ComicAnalyzeRequest) => analyzeComicScript(request),
  );
  ipcMain.handle(
    "comic:convertPanels",
    (_event, request: ComicConvertRequest) => convertComicPanels(request),
  );
  ipcMain.handle(
    "comic:checkConsistency",
    (_event, request: ComicConsistencyRequest) =>
      checkComicConsistency(request),
  );
  ipcMain.handle(
    "comic:reverseAsset",
    (
      _event,
      imageBase64: string,
      mode: string,
      scope?: string,
      hint?: string,
      knownCharacter?: boolean,
    ) =>
      reversePromptImage(
        imageBase64,
        (mode as "tags" | "natural" | "mixed") ?? "tags",
        scope,
        hint,
        knownCharacter,
      ),
  );
  ipcMain.handle(
    "comic:generatePanel",
    (_event, request: ComicGeneratePanelRequest) => generateComicPanel(request),
  );
  ipcMain.handle(
    "tagComic:generateCandidate",
    (_event, request: TagComicGenerateRequest) =>
      generateTagComicCandidate(request),
  );
  ipcMain.handle(
    "tagComic:importReference",
    (_event, request: TagComicReferenceImportRequest) =>
      importTagComicReference(request),
  );
  ipcMain.handle(
    "tagComic:deleteReference",
    (_event, projectId: string, referenceId: string) =>
      deleteTagComicReference(projectId, referenceId),
  );
  ipcMain.handle(
    "tagComic:exportSelectedZip",
    (_event, request: TagComicExportZipRequest) =>
      exportTagComicSelectedZip(request),
  );
  ipcMain.handle("ai:getLog", () => getAiCallLog());
  ipcMain.handle("ai:clearLog", () => clearAiCallLog());
  ipcMain.handle("nai:listModels", (_event, kind: "reverse" | "convert") =>
    listAiModels(kind),
  );
  ipcMain.handle("nai:testTagServer", (_event, query: string) =>
    testTagServer(query),
  );
  ipcMain.handle("nai:suggestTags", (_event, model: string, prompt: string) =>
    suggestTags(model, prompt),
  );
  ipcMain.handle(
    "nai:searchTagServer",
    (_event, query: string, limit?: number) => searchTagServer(query, limit),
  );
  ipcMain.handle("nai:danbooruStatus", () => danbooruStatus());
  ipcMain.handle("nai:downloadDanbooru", () => downloadDanbooruTags());
  ipcMain.handle(
    "nai:danbooruBrowse",
    (_event, category: number, offset: number, limit: number) =>
      browseDanbooru(category, offset, limit),
  );
  ipcMain.handle("nai:danbooruSearch", (_event, query: string, limit: number) =>
    searchDanbooru(query, limit),
  );
  ipcMain.handle(
    "nai:artistStyleCatalog",
    (_event, scope: import("../src/types").ArtistStyleCatalogScope, query: string, offset: number, limit: number) =>
      artistStyleCatalog(scope, query, offset, limit),
  );
  ipcMain.handle("resource-database:overview", () => getResourceDatabaseOverview());
  ipcMain.handle("resource-database:download", (_event, id: ResourceDatabaseId, confirmReplace?: boolean) =>
    downloadResourceDatabase(id, confirmReplace),
  );
  ipcMain.handle("resource-database:pause", (_event, id: ResourceDatabaseId) =>
    pauseResourceDatabaseDownload(id),
  );
  ipcMain.handle("resource-database:restore-previous", (_event, id: ResourceDatabaseId, confirmed?: boolean) =>
    restorePreviousResourceDatabase(id, confirmed),
  );
  ipcMain.handle("resource-database:open-directory", () => openResourceDatabaseDirectory());
  ipcMain.handle("resource-database:clear-cache", () => clearResourceQueryCache());
  ipcMain.handle("resource-database:related-tags", (_event, tags: string[], limit?: number) =>
    relatedResourceTags(Array.isArray(tags) ? tags : [], limit),
  );
  ipcMain.handle("nai:translate", (_event, text: string, target?: string) =>
    translateText(text, target),
  );
  ipcMain.handle("nai:cancel", () => cancelGeneration());

  ipcMain.handle(
    "storage:getHistory",
    (_event, date?: string, groupId?: string) => listHistory(date, groupId),
  );
  ipcMain.handle("storage:getHistoryDates", () => listHistoryDates());
  ipcMain.handle("storage:getHistoryGroups", () => listHistoryGroups());
  ipcMain.handle("storage:createGroup", (_event, name: string) =>
    createGroup(name),
  );
  ipcMain.handle("storage:renameGroup", (_event, id: string, name: string) =>
    renameGroup(id, name),
  );
  ipcMain.handle("storage:deleteGroup", (_event, id: string) =>
    removeGroup(id),
  );
  ipcMain.handle("storage:exportGroup", (_event, groupId: string) =>
    exportGroup(groupId),
  );
  ipcMain.handle(
    "storage:exportFiles",
    (_event, files: BatchExportFile[], defaultName?: string) =>
      exportFiles(files, defaultName),
  );
  ipcMain.handle(
    "storage:setHistoryGroup",
    (_event, id: string, groupId?: string) => assignHistoryGroup(id, groupId),
  );
  ipcMain.handle("storage:delete", (_event, id: string) =>
    deleteHistoryItem(id),
  );
  ipcMain.handle("storage:pruneMissing", (_event, id: string) =>
    pruneMissingHistoryItem(id),
  );
  ipcMain.handle("storage:renameItem", (_event, id: string, name: string) =>
    renameHistoryItem(id, name),
  );
  ipcMain.handle("storage:open", (_event, targetPath: string) =>
    openTarget(targetPath),
  );

  ipcMain.handle("texttool:getConvertHistory", () =>
    getTextToolHistory("convert"),
  );
  ipcMain.handle(
    "texttool:addConvertHistoryItem",
    (_event, item: TextToolHistoryItem) => {
      addTextToolHistoryItem("convert", item);
      return { ok: true };
    },
  );
  ipcMain.handle("texttool:deleteConvertHistoryItem", (_event, id: string) => {
    removeTextToolHistoryItem("convert", id);
    return { ok: true };
  });
  ipcMain.handle("texttool:clearConvertHistory", () => {
    clearTextToolHistory("convert");
    return { ok: true };
  });
  ipcMain.handle("texttool:getReverseHistory", () =>
    getTextToolHistory("reverse"),
  );
  ipcMain.handle(
    "texttool:addReverseHistoryItem",
    (_event, item: TextToolHistoryItem) => {
      addTextToolHistoryItem("reverse", item);
      return { ok: true };
    },
  );
  ipcMain.handle("texttool:deleteReverseHistoryItem", (_event, id: string) => {
    removeTextToolHistoryItem("reverse", id);
    return { ok: true };
  });
  ipcMain.handle("texttool:clearReverseHistory", () => {
    clearTextToolHistory("reverse");
    return { ok: true };
  });
  ipcMain.handle(
    "texttool:pruneMissingReverseHistoryItem",
    (_event, id: string) => pruneMissingReverseHistoryItem(id),
  );
  ipcMain.handle("storage:selectDir", () => selectOutputDir());

  // Native drag-out: drag a generated/history image straight to the desktop,
  // Explorer, Photoshop, a chat window, etc. as a real PNG file. Uses the saved
  // file on disk. Some Windows chat clients reject a drag source whose original
  // file is still being indexed/written or whose path has non-shell-friendly
  // segments, so expose a stable ASCII-named temp copy for the OLE drag session.
  ipcMain.on("image:startDrag", (event, filePathOrUrl: string) => {
    try {
      if (!filePathOrUrl) return;
      const sourcePath = localMediaUrlToPath(filePathOrUrl)
        ?? (filePathOrUrl.startsWith("file://") ? fileURLToPath(filePathOrUrl) : filePathOrUrl);
      const resolvedSource = path.resolve(sourcePath);
      if (!fs.existsSync(resolvedSource) || !fs.statSync(resolvedSource).isFile()) return;
      const dragDirectory = path.join(app.getPath("temp"), "langbai-nai-drag");
      fs.mkdirSync(dragDirectory, { recursive: true });
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      for (const name of fs.readdirSync(dragDirectory)) {
        const candidate = path.join(dragDirectory, name);
        try { if (fs.statSync(candidate).mtimeMs < cutoff) fs.rmSync(candidate, { force: true }); } catch { /* best effort */ }
      }
      const extension = path.extname(resolvedSource).toLowerCase() || ".png";
      const dragPath = path.join(dragDirectory, `langbai-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`);
      fs.copyFileSync(resolvedSource, dragPath);
      const icon = nativeImage.createFromPath(dragPath);
      if (icon.isEmpty()) return; // startDrag throws on an empty icon
      event.sender.startDrag({
        file: dragPath,
        icon: icon.resize({ height: 96 }),
      });
    } catch (error) {
      console.warn("[image:startDrag] failed", error);
    }
  });

  ipcMain.handle("log:getInfo", () => getLogInfo());
  ipcMain.handle("log:selectDir", () => selectLogDir());
  ipcMain.handle("log:openFile", () => openLogFile());
  ipcMain.handle("log:openDir", () => openLogDir());
  ipcMain.handle("log:read", () => readRecentLog());

  ipcMain.handle("settings:get", (_event, key) => getSetting(key));
  ipcMain.handle("settings:set", async (_event, key, value) => {
    const saved = setSetting(key, value);
    if ([
      "proxyMode",
      "proxyUrl",
      "apiBaseUrl",
      "visionApiUrl",
      "convertApiUrl",
      "tagServerUrl",
    ].includes(String(key))) {
      await refreshSystemProxy();
    }
    if (String(key).startsWith("agent")) await stopAgentRuntime();
    return saved;
  });
  ipcMain.handle("settings:getAll", () => getSettings());
  ipcMain.handle(
    "stylePreset:importImages",
    (_event, presetId: string, availableSlots: number, dialogTitle?: string) =>
      importStylePromptPresetImages(presetId, availableSlots, dialogTitle),
  );
  ipcMain.handle(
    "stylePreset:deleteImage",
    (_event, presetId: string, imageId: string) =>
      deleteStylePromptPresetImage(presetId, imageId),
  );
  ipcMain.handle("stylePreset:deleteImages", (_event, presetId: string) =>
    deleteStylePromptPresetImages(presetId),
  );
  ipcMain.handle(
    "stylePreset:importImagePaths",
    (_event, sourcePaths: string[], presetId: string, availableSlots: number) =>
      copyStylePromptPreviewImages(sourcePaths, presetId, availableSlots),
  );
  ipcMain.handle(
    "stylePreset:reconcileImages",
    (_event, presetId: string, knownImages: StylePromptPreviewImage[]) =>
      reconcileStylePromptPreviewImages(presetId, knownImages),
  );
  ipcMain.handle("referencePreset:list", () => listReferencePresets());
  ipcMain.handle("referencePreset:save", (_event, request) =>
    saveReferencePreset(request),
  );
  ipcMain.handle("referencePreset:read", (_event, presetId: string) =>
    readReferencePreset(presetId),
  );
  ipcMain.handle("referencePreset:delete", (_event, presetId: string) =>
    deleteReferencePreset(presetId),
  );
  ipcMain.handle("referencePreset:createGroup", (_event, name: string) =>
    createReferencePresetGroup(name),
  );
  ipcMain.handle("referencePreset:deleteGroup", (_event, name: string) =>
    deleteReferencePresetGroup(name),
  );
  ipcMain.handle(
    "referencePreset:moveToGroup",
    (_event, presetId: string, group: string) =>
      moveReferencePresetToGroup(presetId, group),
  );
  ipcMain.handle("referencePreset:import", () => importReferencePresets());
  ipcMain.handle("referencePreset:export", (_event, request) =>
    exportReferencePresets(request),
  );
  ipcMain.handle(
    "referenceCatalog:download",
    async (event, request: { id?: string; urls?: string[] }) => {
      const id = String(request?.id ?? "");
      const allowedHosts = new Set([
        "gitee.com",
        "raw.giteeusercontent.com",
        "media.githubusercontent.com",
        "raw.githubusercontent.com",
      ]);
      const urls = [...new Set((request?.urls ?? []).filter((value) => {
        try {
          const parsed = new URL(value);
          return parsed.protocol === "https:" && allowedHosts.has(parsed.hostname);
        } catch {
          return false;
        }
      }))];
      let lastError: unknown;
      for (const url of urls) {
        try {
          const response = await fetch(url, { redirect: "follow" });
          if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
          const total = Number(response.headers.get("content-length")) || 0;
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let loaded = 0;
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            if (!next.value) continue;
            chunks.push(next.value);
            loaded += next.value.byteLength;
            if (!event.sender.isDestroyed()) {
              event.sender.send("referenceCatalog:downloadProgress", { id, loaded, total: total || loaded });
            }
          }
          const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
          return { ok: true, base64: bytes.toString("base64"), bytes: bytes.byteLength };
        } catch (error) {
          lastError = error;
        }
      }
      return { ok: false, message: lastError instanceof Error ? lastError.message : "Reference asset unavailable" };
    },
  );
  ipcMain.handle("settings:getReverseDefaults", () =>
    getReversePromptTemplateDefaults(),
  );
  ipcMain.handle("dataBackup:export", (_event, request: DataBackupExportRequest) =>
    exportDataBackup(request),
  );
  ipcMain.handle("dataBackup:inspect", () => inspectDataBackup());
  ipcMain.handle("dataBackup:import", (_event, request: DataBackupImportRequest) =>
    importDataBackup(request),
  );
  ipcMain.handle("dataBackup:status", () => getDataBackupStatus());
  ipcMain.handle("dataBackup:runAutomatic", (_event, workspaceData?: Record<string, string>) =>
    runAutomaticBackup(workspaceData),
  );
  ipcMain.handle("dataBackup:selectDirectory", () => selectBackupDirectory());
  ipcMain.handle("dataBackup:openDirectory", () => openBackupDirectory());
  ipcMain.handle("settings:isFirstRun", () => !getSettings().hasOnboarded);
  ipcMain.handle("settings:completeSetup", () => {
    completeSetup();
    return { ok: true };
  });

  ipcMain.handle("window:minimize", () => mainWindow?.minimize());
  ipcMain.handle("window:maximize", () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.handle("window:close", () => mainWindow?.close());
  ipcMain.handle("window:openExternal", (_event, url: string) => {
    // Only ever hand http(s) URLs to the OS — never file:, javascript:, or other
    // schemes that a crafted link in the renderer could abuse.
    let parsed: URL;
    try {
      parsed = new URL(String(url));
    } catch {
      return { ok: false };
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      return { ok: false };
    void shell.openExternal(parsed.toString());
    return { ok: true };
  });
  ipcMain.handle("app:checkUpdate", () => checkUpdate(getSettings().updateSource));
  ipcMain.handle("app:isPortable", () => isPortableBuild());
  ipcMain.handle("app:downloadUpdate", () => downloadUpdate(getSettings().updateSource));
  ipcMain.handle("app:installUpdate", () => installUpdate());
}

app.whenReady().then(async () => {
  await installLocalMediaProtocol();
  if (!uiCaptureUserData) pinUserDataAndMigrate();
  readStore();
  // Materialize/repair the built-in Character Tavern workspace before the
  // renderer opens. This prevents an unreleased broken workspace from
  // lingering until the user happens to visit the Tavern page.
  readAgentWorkspace();
  installGlobalLogging();
  configureSystemProxyResolver((url) => session.defaultSession.resolveProxy(url));
  await refreshSystemProxy();
  setAgentEventSink((event) => {
    if (!mainWindow?.isDestroyed()) mainWindow?.webContents.send("agent:event", event);
  });
  const proxyRefreshTimer = setInterval(() => {
    void refreshSystemProxy();
  }, 30_000);
  proxyRefreshTimer.unref();
  registerIpc();
  wireAutoUpdater(() => mainWindow);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  void stopAgentRuntime();
});
