import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  AnlasQuoteRequest,
  AppSettings,
  AugmentOptions,
  BatchRedrawRequest,
  ComicAnalyzeRequest,
  ComicConvertRequest,
  ComicConsistencyRequest,
  ComicGeneratePanelRequest,
  ComicProject,
  DirectorTool,
  GenerateExtras,
  TagSuggestion,
  GenerateParams,
  I2IParams,
  NAIInpaintModel,
  SettingKey,
  UpscaleScale,
} from "../src/types";

contextBridge.exposeInMainWorld("naiDesktop", {
  hasToken: () => ipcRenderer.invoke("nai:hasToken"),
  accountCached: () => ipcRenderer.invoke("nai:accountCached"),
  verifyToken: (token: string) => ipcRenderer.invoke("nai:verify", token),
  clearToken: () => ipcRenderer.invoke("nai:clearToken"),
  quoteAnlas: (request: AnlasQuoteRequest) => ipcRenderer.invoke("nai:quoteAnlas", request),
  generate: (params: GenerateParams, extras: GenerateExtras) =>
    ipcRenderer.invoke("nai:generate", params, extras),
  generateI2I: (params: GenerateParams, i2i: I2IParams, extras: GenerateExtras) =>
    ipcRenderer.invoke("nai:generateI2I", params, i2i, extras),
  redrawImage: (request: BatchRedrawRequest) => ipcRenderer.invoke("nai:redrawImage", request),
  inpaint: (
    params: GenerateParams,
    inpaintModel: NAIInpaintModel,
    maskBase64: string,
    strength: number,
    noise: number,
  ) =>
    ipcRenderer.invoke("nai:inpaint", params, inpaintModel, maskBase64, strength, noise),
  upscaleImage: (scale: UpscaleScale) => ipcRenderer.invoke("nai:upscale", scale),
  augmentImage: (tool: DirectorTool, options: AugmentOptions) =>
    ipcRenderer.invoke("nai:augment", tool, options),
  cancel: () => ipcRenderer.invoke("nai:cancel"),
  reversePrompt: (imageBase64: string, mode: string, scope?: string, hint?: string, knownCharacter?: boolean) =>
    ipcRenderer.invoke("nai:reversePrompt", imageBase64, mode, scope, hint, knownCharacter),
  convertPrompt: (text: string, mode: string, knownCharacter?: boolean) =>
    ipcRenderer.invoke("nai:convertPrompt", text, mode, knownCharacter),
  comicAnalyzeScript: (request: ComicAnalyzeRequest) => ipcRenderer.invoke("comic:analyzeScript", request),
  comicConvertPanels: (request: ComicConvertRequest) => ipcRenderer.invoke("comic:convertPanels", request),
  comicCheckConsistency: (request: ComicConsistencyRequest) => ipcRenderer.invoke("comic:checkConsistency", request),
  comicReverseAsset: (imageBase64: string, mode: string, scope?: string, hint?: string, knownCharacter?: boolean) =>
    ipcRenderer.invoke("comic:reverseAsset", imageBase64, mode, scope, hint, knownCharacter),
  comicGeneratePanel: (request: ComicGeneratePanelRequest) => ipcRenderer.invoke("comic:generatePanel", request),
  comicExportProjectZip: (project: ComicProject) => ipcRenderer.invoke("comic:exportProjectZip", project),
  getAiCallLog: () => ipcRenderer.invoke("ai:getLog"),
  clearAiCallLog: () => ipcRenderer.invoke("ai:clearLog"),
  getReverseTemplateDefaults: () => ipcRenderer.invoke("settings:getReverseDefaults"),
  listAiModels: (kind: "reverse" | "convert") => ipcRenderer.invoke("nai:listModels", kind),
  testTagServer: (query: string) => ipcRenderer.invoke("nai:testTagServer", query),
  suggestTags: (model: string, prompt: string) => ipcRenderer.invoke("nai:suggestTags", model, prompt),
  searchTagServer: (query: string, limit?: number) => ipcRenderer.invoke("nai:searchTagServer", query, limit),
  danbooruStatus: () => ipcRenderer.invoke("nai:danbooruStatus") as Promise<{ downloaded: boolean; sizeBytes: number; count: number }>,
  downloadDanbooru: () => ipcRenderer.invoke("nai:downloadDanbooru") as Promise<{ ok: boolean; message: string; count?: number }>,
  danbooruBrowse: (category: number, offset: number, limit: number) =>
    ipcRenderer.invoke("nai:danbooruBrowse", category, offset, limit) as Promise<TagSuggestion[]>,
  danbooruSearch: (query: string, limit: number) =>
    ipcRenderer.invoke("nai:danbooruSearch", query, limit) as Promise<TagSuggestion[]>,
  translate: (text: string, target?: string) => ipcRenderer.invoke("nai:translate", text, target),
  loadImage: () => ipcRenderer.invoke("nai:loadImage"),
  loadImageFromPath: (filePath: string) => ipcRenderer.invoke("nai:loadImageFromPath", filePath),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
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
  pruneMissingHistoryItem: (id: string) => ipcRenderer.invoke("storage:pruneMissing", id),
  renameHistoryItem: (id: string, name: string) => ipcRenderer.invoke("storage:renameItem", id, name),
  openInExplorer: (targetPath: string) => ipcRenderer.invoke("storage:open", targetPath),
  selectOutputDir: () => ipcRenderer.invoke("storage:selectDir"),
  startImageDrag: (filePath: string) => ipcRenderer.send("image:startDrag", filePath),

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
  getLogInfo: () =>
    ipcRenderer.invoke("log:getInfo") as Promise<{ path: string; dir: string; exists: boolean; sizeBytes: number }>,
  selectLogDir: () => ipcRenderer.invoke("log:selectDir") as Promise<string | null>,
  openLogFile: () => ipcRenderer.invoke("log:openFile") as Promise<{ ok: boolean; message?: string }>,
  openLogDir: () => ipcRenderer.invoke("log:openDir") as Promise<{ ok: boolean; message?: string }>,
  readLog: () => ipcRenderer.invoke("log:read") as Promise<string>,
});
