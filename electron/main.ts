import { app, BrowserWindow, ipcMain, Menu, nativeImage, shell } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
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
  exportComicProjectZip,
  generateComicPanel,
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
import { danbooruStatus, downloadDanbooruTags, browseDanbooru, searchDanbooru } from "./ipc/danbooru-tags";
import { getTuiwenTtsCatalog, saveTuiwenImportedAudio, synthesizeTuiwenSpeech } from "./ipc/tuiwen-audio";
import { importTuiwenFile } from "./ipc/tuiwen-import";
import { detectJianYingDraftRoot, exportTuiwenJianYingDraft } from "./ipc/tuiwen-jianying";
import {
  loadTuiwenProjectSnapshot as loadTuiwenProjectSnapshotFile,
  saveTuiwenProjectSnapshot as saveTuiwenProjectSnapshotFile,
} from "./ipc/tuiwen-snapshot";
import type {
  AnlasQuoteRequest,
  AugmentOptions,
  BatchRedrawRequest,
  ComicAnalyzeRequest,
  ComicConsistencyRequest,
  ComicConvertRequest,
  ComicGeneratePanelRequest,
  ComicProject,
  DirectorTool,
  I2IParams,
  NAIInpaintModel,
  UpscaleScale,
  TuiwenExportJianYingRequest,
  TuiwenImportFileRequest,
  TuiwenProject,
  TuiwenSaveImportedAudioRequest,
  TuiwenTtsRequest,
} from "../src/types";
import {
  clearToken,
  completeSetup,
  getAccountSummary,
  getReversePromptTemplateDefaults,
  getSetting,
  getSettings,
  pruneMissingHistoryItem,
  readStore,
  setSetting,
} from "./ipc/store";
import {
  assignHistoryGroup,
  createGroup,
  deleteHistoryItem,
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
import { proxyConfig } from "./ipc/proxy";
import {
  installGlobalLogging,
  getLogInfo,
  selectLogDir,
  openLogFile,
  openLogDir,
  readRecentLog,
} from "./ipc/logger";

let mainWindow: BrowserWindow | null = null;

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

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
      template.push({ label: "粘贴", role: "paste", enabled: editFlags.canPaste });
    }
    template.push({ type: "separator" }, { label: "全选", role: "selectAll" });
    Menu.buildFromTemplate(template).popup({ window: win });
  });
}

const STORE_FILE = "novelai-image-desktop.json";
// Legacy userData folder names this app has shipped under. Renames change
// app.getName()/productName which moves userData, orphaning the saved token and
// history. We pin userData to a stable folder and migrate the newest legacy
// store into it so settings survive any future rename.
const LEGACY_DIRS = ["Langbai NovelAI Studio", "langbai-novelai-studio", "NovelAI Studio"];

function pinUserDataAndMigrate() {
  const appData = app.getPath("appData");
  const stableDir = path.join(appData, "novelai-image-desktop");
  try {
    fs.mkdirSync(stableDir, { recursive: true });
    app.setPath("userData", stableDir);

    const target = path.join(stableDir, STORE_FILE);
    const targetHasToken = (() => {
      try {
        return Boolean(JSON.parse(fs.readFileSync(target, "utf8"))?.token);
      } catch {
        return false;
      }
    })();
    if (targetHasToken) return;

    // Find the newest legacy store that actually holds a token.
    let best: { file: string; mtime: number } | null = null;
    for (const dir of LEGACY_DIRS) {
      const candidate = path.join(appData, dir, STORE_FILE);
      try {
        const raw = JSON.parse(fs.readFileSync(candidate, "utf8"));
        if (!raw?.token) continue;
        const mtime = fs.statSync(candidate).mtimeMs;
        if (!best || mtime > best.mtime) best = { file: candidate, mtime };
      } catch {
        // missing or unreadable — skip
      }
    }
    if (best) fs.copyFileSync(best.file, target);
  } catch {
    // Non-fatal: fall back to whatever userData Electron resolved.
  }
}

function createWindow() {
  const iconPath = isDev
    ? path.join(__dirname, "../../public/icon.png")
    : path.join(__dirname, "../../dist/icon.png");

  mainWindow = new BrowserWindow({
    width: 1385,
    height: 900,
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

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (isDev) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL!);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
  }
}

function registerIpc() {
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
  ipcMain.handle("nai:quoteAnlas", (_event, request: AnlasQuoteRequest) => quoteAnlasCost(request));
  ipcMain.handle("nai:generate", (_event, params, extras) => generateImage(params, extras));
  ipcMain.handle("nai:generateI2I", (_event, params, i2i: I2IParams, extras) => generateI2I(params, i2i, extras));
  ipcMain.handle("nai:redrawImage", (_event, request: BatchRedrawRequest) => redrawImage(request));
  ipcMain.handle("nai:inpaint", (_event, params, inpaintModel: NAIInpaintModel, maskBase64: string, strength: number, noise: number) =>
    inpaintImage(params, inpaintModel, maskBase64, strength, noise),
  );
  ipcMain.handle("nai:upscale", (_event, scale: UpscaleScale) => upscaleImg(scale));
  ipcMain.handle("nai:augment", (_event, tool: DirectorTool, options: AugmentOptions) => augmentImg(tool, options));
  ipcMain.handle("nai:loadImage", () => loadImageFile());
  ipcMain.handle("nai:loadImageFromPath", (_event, filePath: string) => loadImageFromPath(filePath));
  ipcMain.handle("nai:clearWorkbenchImage", () => clearWorkbenchImage());
  ipcMain.handle("nai:reversePrompt", (_event, imageBase64: string, mode: string, scope?: string, hint?: string, knownCharacter?: boolean) =>
    reversePromptImage(imageBase64, (mode as "tags" | "natural" | "mixed") ?? "tags", scope, hint, knownCharacter),
  );
  ipcMain.handle("nai:convertPrompt", (_event, text: string, mode: string, knownCharacter?: boolean) =>
    convertPromptText(text, (mode as "tags" | "natural" | "mixed") ?? "tags", knownCharacter),
  );
  ipcMain.handle("comic:analyzeScript", (_event, request: ComicAnalyzeRequest) => analyzeComicScript(request));
  ipcMain.handle("comic:convertPanels", (_event, request: ComicConvertRequest) => convertComicPanels(request));
  ipcMain.handle("comic:checkConsistency", (_event, request: ComicConsistencyRequest) => checkComicConsistency(request));
  ipcMain.handle("comic:reverseAsset", (_event, imageBase64: string, mode: string, scope?: string, hint?: string, knownCharacter?: boolean) =>
    reversePromptImage(imageBase64, (mode as "tags" | "natural" | "mixed") ?? "tags", scope, hint, knownCharacter),
  );
  ipcMain.handle("comic:generatePanel", (_event, request: ComicGeneratePanelRequest) => generateComicPanel(request));
  ipcMain.handle("comic:exportProjectZip", (_event, project: ComicProject) => exportComicProjectZip(project));
  ipcMain.handle("tuiwen:importFile", (_event, request: TuiwenImportFileRequest) => importTuiwenFile(request));
  ipcMain.handle("tuiwen:ttsProviders", () => getTuiwenTtsCatalog());
  ipcMain.handle("tuiwen:tts", (_event, request: TuiwenTtsRequest) => {
    const proxy = proxyConfig("ai");
    return synthesizeTuiwenSpeech(request, {
      outputRoot: getSetting("outputDir"),
      agent: (proxy.httpsAgent ?? proxy.httpAgent) as import("http").Agent | undefined,
    });
  });
  ipcMain.handle("tuiwen:saveImportedAudio", (_event, request: TuiwenSaveImportedAudioRequest) =>
    saveTuiwenImportedAudio(request, getSetting("outputDir")));
  ipcMain.handle("tuiwen:exportJianYing", (_event, request: TuiwenExportJianYingRequest) => {
    const outDir = request.outDir?.trim()
      || request.project.exportSettings.jianyingDraftDir?.trim()
      || detectJianYingDraftRoot()
      || path.join(getSetting("outputDir"), "Jianying Drafts");
    fs.mkdirSync(outDir, { recursive: true });
    return exportTuiwenJianYingDraft(request.project, outDir);
  });
  ipcMain.handle("tuiwen:saveProjectSnapshot", (_event, project: TuiwenProject) =>
    saveTuiwenProjectSnapshotFile(project, app.getPath("userData")));
  ipcMain.handle("tuiwen:loadProjectSnapshot", () => loadTuiwenProjectSnapshotFile(app.getPath("userData")));
  ipcMain.handle("ai:getLog", () => getAiCallLog());
  ipcMain.handle("ai:clearLog", () => clearAiCallLog());
  ipcMain.handle("nai:listModels", (_event, kind: "reverse" | "convert") => listAiModels(kind));
  ipcMain.handle("nai:testTagServer", (_event, query: string) => testTagServer(query));
  ipcMain.handle("nai:suggestTags", (_event, model: string, prompt: string) => suggestTags(model, prompt));
  ipcMain.handle("nai:searchTagServer", (_event, query: string, limit?: number) => searchTagServer(query, limit));
  ipcMain.handle("nai:danbooruStatus", () => danbooruStatus());
  ipcMain.handle("nai:downloadDanbooru", () => downloadDanbooruTags());
  ipcMain.handle("nai:danbooruBrowse", (_event, category: number, offset: number, limit: number) =>
    browseDanbooru(category, offset, limit),
  );
  ipcMain.handle("nai:danbooruSearch", (_event, query: string, limit: number) => searchDanbooru(query, limit));
  ipcMain.handle("nai:translate", (_event, text: string, target?: string) => translateText(text, target));
  ipcMain.handle("nai:cancel", () => cancelGeneration());

  ipcMain.handle("storage:getHistory", (_event, date?: string, groupId?: string) => listHistory(date, groupId));
  ipcMain.handle("storage:getHistoryDates", () => listHistoryDates());
  ipcMain.handle("storage:getHistoryGroups", () => listHistoryGroups());
  ipcMain.handle("storage:createGroup", (_event, name: string) => createGroup(name));
  ipcMain.handle("storage:renameGroup", (_event, id: string, name: string) => renameGroup(id, name));
  ipcMain.handle("storage:deleteGroup", (_event, id: string) => removeGroup(id));
  ipcMain.handle("storage:exportGroup", (_event, groupId: string) => exportGroup(groupId));
  ipcMain.handle("storage:setHistoryGroup", (_event, id: string, groupId?: string) => assignHistoryGroup(id, groupId));
  ipcMain.handle("storage:delete", (_event, id: string) => deleteHistoryItem(id));
  ipcMain.handle("storage:pruneMissing", (_event, id: string) => pruneMissingHistoryItem(id));
  ipcMain.handle("storage:renameItem", (_event, id: string, name: string) => renameHistoryItem(id, name));
  ipcMain.handle("storage:open", (_event, targetPath: string) => openTarget(targetPath));
  ipcMain.handle("storage:selectDir", () => selectOutputDir());

  // Native drag-out: drag a generated/history image straight to the desktop,
  // Explorer, Photoshop, a chat window, etc. as a real PNG file. Uses the saved
  // file on disk; the drag icon is a downscaled copy of the image itself.
  ipcMain.on("image:startDrag", (event, filePathOrUrl: string) => {
    try {
      if (!filePathOrUrl) return;
      const filePath = filePathOrUrl.startsWith("file://") ? fileURLToPath(filePathOrUrl) : filePathOrUrl;
      const icon = nativeImage.createFromPath(filePath);
      if (icon.isEmpty()) return; // startDrag throws on an empty icon
      event.sender.startDrag({ file: filePath, icon: icon.resize({ height: 96 }) });
    } catch {
      /* ignore — a failed drag must never crash the main process */
    }
  });

  ipcMain.handle("log:getInfo", () => getLogInfo());
  ipcMain.handle("log:selectDir", () => selectLogDir());
  ipcMain.handle("log:openFile", () => openLogFile());
  ipcMain.handle("log:openDir", () => openLogDir());
  ipcMain.handle("log:read", () => readRecentLog());

  ipcMain.handle("settings:get", (_event, key) => getSetting(key));
  ipcMain.handle("settings:set", (_event, key, value) => setSetting(key, value));
  ipcMain.handle("settings:getAll", () => getSettings());
  ipcMain.handle("settings:getReverseDefaults", () => getReversePromptTemplateDefaults());
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
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { ok: false };
    void shell.openExternal(parsed.toString());
    return { ok: true };
  });
  ipcMain.handle("app:checkUpdate", () => checkUpdate());
}

app.whenReady().then(() => {
  pinUserDataAndMigrate();
  readStore();
  installGlobalLogging();
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
