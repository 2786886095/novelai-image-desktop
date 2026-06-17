import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "path";
import fs from "fs";
import {
  augmentImg,
  cancelGeneration,
  clearWorkbenchImage,
  convertPromptText,
  generateI2I,
  generateImage,
  inpaintImage,
  loadImageFile,
  loadImageFromPath,
  listAiModels,
  refreshStoredAccount,
  reversePromptImage,
  suggestTags,
  testTagServer,
  translateText,
  upscaleImg,
  verifyToken,
} from "./ipc/nai";
import type { AugmentOptions, DirectorTool, I2IParams, NAIInpaintModel, UpscaleScale } from "../src/types";
import {
  clearToken,
  completeSetup,
  getAccountSummary,
  getSetting,
  getSettings,
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

let mainWindow: BrowserWindow | null = null;

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

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
    },
  });

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
  ipcMain.handle("nai:verify", (_event, token: string) => verifyToken(token));
  ipcMain.handle("nai:clearToken", () => {
    clearToken();
    return { ok: true };
  });
  ipcMain.handle("nai:generate", (_event, params, extras) => generateImage(params, extras));
  ipcMain.handle("nai:generateI2I", (_event, params, i2i: I2IParams, extras) => generateI2I(params, i2i, extras));
  ipcMain.handle("nai:inpaint", (_event, params, inpaintModel: NAIInpaintModel, maskBase64: string) =>
    inpaintImage(params, inpaintModel, maskBase64),
  );
  ipcMain.handle("nai:upscale", (_event, scale: UpscaleScale) => upscaleImg(scale));
  ipcMain.handle("nai:augment", (_event, tool: DirectorTool, options: AugmentOptions) => augmentImg(tool, options));
  ipcMain.handle("nai:loadImage", () => loadImageFile());
  ipcMain.handle("nai:loadImageFromPath", (_event, filePath: string) => loadImageFromPath(filePath));
  ipcMain.handle("nai:clearWorkbenchImage", () => clearWorkbenchImage());
  ipcMain.handle("nai:reversePrompt", (_event, imageBase64: string, mode: string) =>
    reversePromptImage(imageBase64, (mode as "tags" | "natural" | "mixed") ?? "tags"),
  );
  ipcMain.handle("nai:convertPrompt", (_event, text: string, mode: string) =>
    convertPromptText(text, (mode as "tags" | "natural" | "mixed") ?? "tags"),
  );
  ipcMain.handle("nai:listModels", (_event, kind: "reverse" | "convert") => listAiModels(kind));
  ipcMain.handle("nai:testTagServer", (_event, query: string) => testTagServer(query));
  ipcMain.handle("nai:suggestTags", (_event, model: string, prompt: string) => suggestTags(model, prompt));
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
  ipcMain.handle("storage:renameItem", (_event, id: string, name: string) => renameHistoryItem(id, name));
  ipcMain.handle("storage:open", (_event, targetPath: string) => openTarget(targetPath));
  ipcMain.handle("storage:selectDir", () => selectOutputDir());

  ipcMain.handle("settings:get", (_event, key) => getSetting(key));
  ipcMain.handle("settings:set", (_event, key, value) => setSetting(key, value));
  ipcMain.handle("settings:getAll", () => getSettings());
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
  ipcMain.handle("window:openExternal", (_event, url: string) => shell.openExternal(url));
  ipcMain.handle("app:checkUpdate", () => checkUpdate());
}

app.whenReady().then(() => {
  pinUserDataAndMigrate();
  readStore();
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
