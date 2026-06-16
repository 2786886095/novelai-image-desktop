import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "path";
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
  refreshStoredAccount,
  reversePromptImage,
  suggestTags,
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
import { deleteHistoryItem, listHistory, listHistoryDates, openTarget, selectOutputDir } from "./ipc/storage";
import { checkUpdate } from "./ipc/update";

let mainWindow: BrowserWindow | null = null;

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1385,
    height: 900,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    frame: false,
    backgroundColor: "#f0eff9",
    title: "NovelAI Studio",
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
  ipcMain.handle("nai:convertPrompt", (_event, text: string) => convertPromptText(text));
  ipcMain.handle("nai:suggestTags", (_event, model: string, prompt: string) => suggestTags(model, prompt));
  ipcMain.handle("nai:cancel", () => cancelGeneration());

  ipcMain.handle("storage:getHistory", (_event, date?: string) => listHistory(date));
  ipcMain.handle("storage:getHistoryDates", () => listHistoryDates());
  ipcMain.handle("storage:delete", (_event, id: string) => deleteHistoryItem(id));
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
