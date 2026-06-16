import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  AugmentOptions,
  DirectorTool,
  GenerateExtras,
  GenerateParams,
  I2IParams,
  NAIInpaintModel,
  SettingKey,
  UpscaleScale,
} from "../src/types";

contextBridge.exposeInMainWorld("naiDesktop", {
  hasToken: () => ipcRenderer.invoke("nai:hasToken"),
  verifyToken: (token: string) => ipcRenderer.invoke("nai:verify", token),
  clearToken: () => ipcRenderer.invoke("nai:clearToken"),
  generate: (params: GenerateParams, extras: GenerateExtras) =>
    ipcRenderer.invoke("nai:generate", params, extras),
  generateI2I: (params: GenerateParams, i2i: I2IParams, extras: GenerateExtras) =>
    ipcRenderer.invoke("nai:generateI2I", params, i2i, extras),
  inpaint: (params: GenerateParams, inpaintModel: NAIInpaintModel, maskBase64: string) =>
    ipcRenderer.invoke("nai:inpaint", params, inpaintModel, maskBase64),
  upscaleImage: (scale: UpscaleScale) => ipcRenderer.invoke("nai:upscale", scale),
  augmentImage: (tool: DirectorTool, options: AugmentOptions) =>
    ipcRenderer.invoke("nai:augment", tool, options),
  cancel: () => ipcRenderer.invoke("nai:cancel"),
  reversePrompt: (imageBase64: string, mode: string) => ipcRenderer.invoke("nai:reversePrompt", imageBase64, mode),
  convertPrompt: (text: string, mode: string) => ipcRenderer.invoke("nai:convertPrompt", text, mode),
  listAiModels: (kind: "reverse" | "convert") => ipcRenderer.invoke("nai:listModels", kind),
  testTagServer: (query: string) => ipcRenderer.invoke("nai:testTagServer", query),
  suggestTags: (model: string, prompt: string) => ipcRenderer.invoke("nai:suggestTags", model, prompt),
  loadImage: () => ipcRenderer.invoke("nai:loadImage"),
  loadImageFromPath: (filePath: string) => ipcRenderer.invoke("nai:loadImageFromPath", filePath),
  clearWorkbenchImage: () => ipcRenderer.invoke("nai:clearWorkbenchImage"),

  getHistory: (date?: string, groupId?: string) => ipcRenderer.invoke("storage:getHistory", date, groupId),
  getHistoryDates: () => ipcRenderer.invoke("storage:getHistoryDates"),
  getHistoryGroups: () => ipcRenderer.invoke("storage:getHistoryGroups"),
  createHistoryGroup: (name: string) => ipcRenderer.invoke("storage:createGroup", name),
  renameHistoryGroup: (id: string, name: string) => ipcRenderer.invoke("storage:renameGroup", id, name),
  deleteHistoryGroup: (id: string) => ipcRenderer.invoke("storage:deleteGroup", id),
  exportHistoryGroup: (groupId: string) => ipcRenderer.invoke("storage:exportGroup", groupId),
  setHistoryGroup: (id: string, groupId?: string) => ipcRenderer.invoke("storage:setHistoryGroup", id, groupId),
  deleteHistory: (id: string) => ipcRenderer.invoke("storage:delete", id),
  openInExplorer: (targetPath: string) => ipcRenderer.invoke("storage:open", targetPath),
  selectOutputDir: () => ipcRenderer.invoke("storage:selectDir"),

  getSetting: <K extends SettingKey>(key: K) => ipcRenderer.invoke("settings:get", key),
  setSetting: <K extends SettingKey>(key: K, value: AppSettings[K]) =>
    ipcRenderer.invoke("settings:set", key, value),
  getSettings: () => ipcRenderer.invoke("settings:getAll"),
  isFirstRun: () => ipcRenderer.invoke("settings:isFirstRun"),
  completeSetup: () => ipcRenderer.invoke("settings:completeSetup"),

  checkUpdate: () => ipcRenderer.invoke("app:checkUpdate"),
  minimize: () => ipcRenderer.invoke("window:minimize"),
  maximize: () => ipcRenderer.invoke("window:maximize"),
  close: () => ipcRenderer.invoke("window:close"),
  openExternal: (url: string) => ipcRenderer.invoke("window:openExternal", url),
});
