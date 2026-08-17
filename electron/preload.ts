import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  AnlasQuoteRequest,
  AppSettings,
  AugmentOptions,
  BatchExportFile,
  BatchRedrawRequest,
  ComicAnalyzeRequest,
  ComicConvertRequest,
  ComicConsistencyRequest,
  ComicGeneratePanelRequest,
  TagComicExportZipRequest,
  TagComicGenerateRequest,
  TagComicReferenceImportRequest,
  DirectorTool,
  GenerateExtras,
  TagSuggestion,
  GenerateParams,
  HistoryItem,
  I2IParams,
  NAIInpaintModel,
  SettingKey,
  TextToolHistoryItem,
  UpscaleScale,
  TuiwenExportJianYingRequest,
  TuiwenImportFileRequest,
  TuiwenProject,
  TuiwenSaveImportedAudioRequest,
  TuiwenTtsRequest,
  UpdateProgressEvent,
  StylePromptPreviewImage,
  ReferencePresetExportRequest,
  ReferencePresetLibrary,
  ReferencePresetOperationResult,
  ReferencePresetSaveRequest,
} from "../src/types";
import type { AitagSearchRequest } from "../src/aitag";
import type { PromptCodexSnapshot } from "../src/prompt-codex";

contextBridge.exposeInMainWorld("naiDesktop", {
  platform: process.platform,
  promptCodexCache: (): Promise<PromptCodexSnapshot | null> =>
    ipcRenderer.invoke("promptCodex:cache"),
  promptCodexUpdate: (): Promise<PromptCodexSnapshot> =>
    ipcRenderer.invoke("promptCodex:update"),
  artistLabPickTarget: () => ipcRenderer.invoke("artistLab:pickTarget"),
  artistLabSearchArtists: (query?: string, limit?: number) =>
    ipcRenderer.invoke("artistLab:searchArtists", query, limit),
  artistLabPopularArtists: (limit?: number, force?: boolean) =>
    ipcRenderer.invoke("artistLab:popularArtists", limit, force),
  artistLabScoreImages: (
    mode: "high" | "light",
    targetPath: string,
    candidatePath: string,
  ) =>
    ipcRenderer.invoke(
      "artistLab:scoreImages",
      mode,
      targetPath,
      candidatePath,
    ),
  artistLabModelStatus: (mode: "high" | "light") =>
    ipcRenderer.invoke("artistLab:modelStatus", mode),
  artistLabDiscoverSimilar: (
    mode: "high" | "light",
    targetPath: string,
    offset?: number,
    scanCount?: number,
    shortlist?: number,
    force?: boolean,
  ) => ipcRenderer.invoke("artistLab:discoverSimilar", mode, targetPath, offset, scanCount, shortlist, force),
  artistLabClearModels: () => ipcRenderer.invoke("artistLab:clearModels"),
  aitagConfig: () => ipcRenderer.invoke("aitag:config"),
  aitagSearch: (request: AitagSearchRequest) =>
    ipcRenderer.invoke("aitag:search", request),
  aitagSearchFresh: (request: AitagSearchRequest) =>
    ipcRenderer.invoke("aitag:search-fresh", request),
  aitagSnapshot: () => ipcRenderer.invoke("aitag:snapshot"),
  aitagWork: (id: number) => ipcRenderer.invoke("aitag:work", id),
  aitagPrewarm: (retentionDays?: number) =>
    ipcRenderer.invoke("aitag:prewarm", retentionDays),
  aitagClearDataCache: () => ipcRenderer.invoke("aitag:clear-data-cache"),
  aitagCacheImage: (url: string, retentionDays?: number) =>
    ipcRenderer.invoke("aitag:cache-image", url, retentionDays),
  aitagCacheStats: () => ipcRenderer.invoke("aitag:cache-stats"),
  aitagClearCache: () => ipcRenderer.invoke("aitag:clear-cache"),
  hasToken: () => ipcRenderer.invoke("nai:hasToken"),
  accountCached: () => ipcRenderer.invoke("nai:accountCached"),
  verifyToken: (token: string) => ipcRenderer.invoke("nai:verify", token),
  clearToken: () => ipcRenderer.invoke("nai:clearToken"),
  quoteAnlas: (request: AnlasQuoteRequest) =>
    ipcRenderer.invoke("nai:quoteAnlas", request),
  generate: (params: GenerateParams, extras: GenerateExtras) =>
    ipcRenderer.invoke("nai:generate", params, extras),
  generateArtistLab: (
    params: GenerateParams,
    extras: GenerateExtras,
    mode: "target" | "random",
  ) => ipcRenderer.invoke("nai:generateArtistLab", params, extras, mode),
  artistLabPromoteFavorite: (item: HistoryItem) =>
    ipcRenderer.invoke("artistLab:promoteFavorite", item),
  artistLabDeleteTemporary: (filePath: string) =>
    ipcRenderer.invoke("artistLab:deleteTemporary", filePath),
  artistLabClearTemporary: () => ipcRenderer.invoke("artistLab:clearTemporary"),
  generateI2I: (
    params: GenerateParams,
    i2i: I2IParams,
    extras: GenerateExtras,
  ) => ipcRenderer.invoke("nai:generateI2I", params, i2i, extras),
  redrawImage: (request: BatchRedrawRequest) =>
    ipcRenderer.invoke("nai:redrawImage", request),
  inpaint: (
    params: GenerateParams,
    inpaintModel: NAIInpaintModel,
    maskBase64: string,
    strength: number,
    noise: number,
  ) =>
    ipcRenderer.invoke(
      "nai:inpaint",
      params,
      inpaintModel,
      maskBase64,
      strength,
      noise,
    ),
  upscaleImage: (scale: UpscaleScale) =>
    ipcRenderer.invoke("nai:upscale", scale),
  augmentImage: (tool: DirectorTool, options: AugmentOptions) =>
    ipcRenderer.invoke("nai:augment", tool, options),
  cancel: () => ipcRenderer.invoke("nai:cancel"),
  reversePrompt: (
    imageBase64: string,
    mode: string,
    scope?: string,
    hint?: string,
    knownCharacter?: boolean,
  ) =>
    ipcRenderer.invoke(
      "nai:reversePrompt",
      imageBase64,
      mode,
      scope,
      hint,
      knownCharacter,
    ),
  convertPrompt: (text: string, mode: string, knownCharacter?: boolean) =>
    ipcRenderer.invoke("nai:convertPrompt", text, mode, knownCharacter),
  comicAnalyzeScript: (request: ComicAnalyzeRequest) =>
    ipcRenderer.invoke("comic:analyzeScript", request),
  comicConvertPanels: (request: ComicConvertRequest) =>
    ipcRenderer.invoke("comic:convertPanels", request),
  comicCheckConsistency: (request: ComicConsistencyRequest) =>
    ipcRenderer.invoke("comic:checkConsistency", request),
  comicReverseAsset: (
    imageBase64: string,
    mode: string,
    scope?: string,
    hint?: string,
    knownCharacter?: boolean,
  ) =>
    ipcRenderer.invoke(
      "comic:reverseAsset",
      imageBase64,
      mode,
      scope,
      hint,
      knownCharacter,
    ),
  comicGeneratePanel: (request: ComicGeneratePanelRequest) =>
    ipcRenderer.invoke("comic:generatePanel", request),
  tagComicGenerateCandidate: (request: TagComicGenerateRequest) =>
    ipcRenderer.invoke("tagComic:generateCandidate", request),
  tagComicImportReference: (request: TagComicReferenceImportRequest) =>
    ipcRenderer.invoke("tagComic:importReference", request),
  tagComicDeleteReference: (projectId: string, referenceId: string) =>
    ipcRenderer.invoke("tagComic:deleteReference", projectId, referenceId),
  tagComicExportSelectedZip: (request: TagComicExportZipRequest) =>
    ipcRenderer.invoke("tagComic:exportSelectedZip", request),
  tuiwenImportFile: (request: TuiwenImportFileRequest) =>
    ipcRenderer.invoke("tuiwen:importFile", request),
  tuiwenTtsProviders: () => ipcRenderer.invoke("tuiwen:ttsProviders"),
  tuiwenTts: (request: TuiwenTtsRequest) =>
    ipcRenderer.invoke("tuiwen:tts", request),
  tuiwenSaveImportedAudio: (request: TuiwenSaveImportedAudioRequest) =>
    ipcRenderer.invoke("tuiwen:saveImportedAudio", request),
  tuiwenExportJianYing: (request: TuiwenExportJianYingRequest) =>
    ipcRenderer.invoke("tuiwen:exportJianYing", request),
  tuiwenSaveProjectSnapshot: (project: TuiwenProject) =>
    ipcRenderer.invoke("tuiwen:saveProjectSnapshot", project),
  tuiwenLoadProjectSnapshot: () =>
    ipcRenderer.invoke("tuiwen:loadProjectSnapshot"),
  getAiCallLog: () => ipcRenderer.invoke("ai:getLog"),
  clearAiCallLog: () => ipcRenderer.invoke("ai:clearLog"),
  getReverseTemplateDefaults: () =>
    ipcRenderer.invoke("settings:getReverseDefaults"),
  listAiModels: (kind: "reverse" | "convert") =>
    ipcRenderer.invoke("nai:listModels", kind),
  testTagServer: (query: string) =>
    ipcRenderer.invoke("nai:testTagServer", query),
  suggestTags: (model: string, prompt: string) =>
    ipcRenderer.invoke("nai:suggestTags", model, prompt),
  searchTagServer: (query: string, limit?: number) =>
    ipcRenderer.invoke("nai:searchTagServer", query, limit),
  danbooruStatus: () =>
    ipcRenderer.invoke("nai:danbooruStatus") as Promise<{
      downloaded: boolean;
      sizeBytes: number;
      count: number;
    }>,
  downloadDanbooru: () =>
    ipcRenderer.invoke("nai:downloadDanbooru") as Promise<{
      ok: boolean;
      message: string;
      count?: number;
    }>,
  danbooruBrowse: (category: number, offset: number, limit: number) =>
    ipcRenderer.invoke(
      "nai:danbooruBrowse",
      category,
      offset,
      limit,
    ) as Promise<TagSuggestion[]>,
  danbooruSearch: (query: string, limit: number) =>
    ipcRenderer.invoke("nai:danbooruSearch", query, limit) as Promise<
      TagSuggestion[]
    >,
  translate: (text: string, target?: string) =>
    ipcRenderer.invoke("nai:translate", text, target),
  loadImage: () => ipcRenderer.invoke("nai:loadImage"),
  loadImageFromPath: (filePath: string) =>
    ipcRenderer.invoke("nai:loadImageFromPath", filePath),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  clearWorkbenchImage: () => ipcRenderer.invoke("nai:clearWorkbenchImage"),

  getHistory: (date?: string, groupId?: string) =>
    ipcRenderer.invoke("storage:getHistory", date, groupId),
  getHistoryDates: () => ipcRenderer.invoke("storage:getHistoryDates"),
  getHistoryGroups: () => ipcRenderer.invoke("storage:getHistoryGroups"),
  createHistoryGroup: (name: string) =>
    ipcRenderer.invoke("storage:createGroup", name),
  renameHistoryGroup: (id: string, name: string) =>
    ipcRenderer.invoke("storage:renameGroup", id, name),
  deleteHistoryGroup: (id: string) =>
    ipcRenderer.invoke("storage:deleteGroup", id),
  exportHistoryGroup: (groupId: string) =>
    ipcRenderer.invoke("storage:exportGroup", groupId),
  exportFiles: (files: BatchExportFile[], defaultName?: string) =>
    ipcRenderer.invoke("storage:exportFiles", files, defaultName),
  setHistoryGroup: (id: string, groupId?: string) =>
    ipcRenderer.invoke("storage:setHistoryGroup", id, groupId),
  deleteHistory: (id: string) => ipcRenderer.invoke("storage:delete", id),
  pruneMissingHistoryItem: (id: string) =>
    ipcRenderer.invoke("storage:pruneMissing", id),
  renameHistoryItem: (id: string, name: string) =>
    ipcRenderer.invoke("storage:renameItem", id, name),
  openInExplorer: (targetPath: string) =>
    ipcRenderer.invoke("storage:open", targetPath),
  getConvertHistory: () => ipcRenderer.invoke("texttool:getConvertHistory"),
  addConvertHistoryItem: (item: TextToolHistoryItem) =>
    ipcRenderer.invoke("texttool:addConvertHistoryItem", item),
  deleteConvertHistoryItem: (id: string) =>
    ipcRenderer.invoke("texttool:deleteConvertHistoryItem", id),
  clearConvertHistory: () => ipcRenderer.invoke("texttool:clearConvertHistory"),
  getReverseHistory: () => ipcRenderer.invoke("texttool:getReverseHistory"),
  addReverseHistoryItem: (item: TextToolHistoryItem) =>
    ipcRenderer.invoke("texttool:addReverseHistoryItem", item),
  deleteReverseHistoryItem: (id: string) =>
    ipcRenderer.invoke("texttool:deleteReverseHistoryItem", id),
  clearReverseHistory: () => ipcRenderer.invoke("texttool:clearReverseHistory"),
  pruneMissingReverseHistoryItem: (id: string) =>
    ipcRenderer.invoke("texttool:pruneMissingReverseHistoryItem", id),
  selectOutputDir: () => ipcRenderer.invoke("storage:selectDir"),
  startImageDrag: (filePath: string) =>
    ipcRenderer.send("image:startDrag", filePath),

  getSetting: <K extends SettingKey>(key: K) =>
    ipcRenderer.invoke("settings:get", key),
  setSetting: <K extends SettingKey>(key: K, value: AppSettings[K]) =>
    ipcRenderer.invoke("settings:set", key, value),
  getSettings: () => ipcRenderer.invoke("settings:getAll"),
  importStylePromptPresetImages: (
    presetId: string,
    availableSlots: number,
    dialogTitle?: string,
  ): Promise<StylePromptPreviewImage[]> =>
    ipcRenderer.invoke(
      "stylePreset:importImages",
      presetId,
      availableSlots,
      dialogTitle,
    ),
  deleteStylePromptPresetImage: (presetId: string, imageId: string) =>
    ipcRenderer.invoke("stylePreset:deleteImage", presetId, imageId),
  deleteStylePromptPresetImages: (presetId: string) =>
    ipcRenderer.invoke("stylePreset:deleteImages", presetId),
  listReferencePresets: (): Promise<ReferencePresetLibrary> =>
    ipcRenderer.invoke("referencePreset:list"),
  saveReferencePreset: (
    request: ReferencePresetSaveRequest,
  ): Promise<ReferencePresetOperationResult> =>
    ipcRenderer.invoke("referencePreset:save", request),
  readReferencePreset: (
    presetId: string,
  ): Promise<ReferencePresetOperationResult> =>
    ipcRenderer.invoke("referencePreset:read", presetId),
  deleteReferencePreset: (
    presetId: string,
  ): Promise<ReferencePresetOperationResult> =>
    ipcRenderer.invoke("referencePreset:delete", presetId),
  createReferencePresetGroup: (
    name: string,
  ): Promise<ReferencePresetOperationResult> =>
    ipcRenderer.invoke("referencePreset:createGroup", name),
  importReferencePresets: (): Promise<ReferencePresetOperationResult> =>
    ipcRenderer.invoke("referencePreset:import"),
  exportReferencePresets: (
    request: ReferencePresetExportRequest = {},
  ): Promise<ReferencePresetOperationResult> =>
    ipcRenderer.invoke("referencePreset:export", request),
  isFirstRun: () => ipcRenderer.invoke("settings:isFirstRun"),
  completeSetup: () => ipcRenderer.invoke("settings:completeSetup"),

  checkUpdate: () => ipcRenderer.invoke("app:checkUpdate"),
  isPortable: () => ipcRenderer.invoke("app:isPortable"),
  downloadUpdate: () => ipcRenderer.invoke("app:downloadUpdate"),
  installUpdate: () => ipcRenderer.invoke("app:installUpdate"),
  onUpdateEvent: (callback: (event: UpdateProgressEvent) => void) => {
    const listener = (_event: unknown, payload: UpdateProgressEvent) =>
      callback(payload);
    ipcRenderer.on("app:updateEvent", listener);
    return () => ipcRenderer.removeListener("app:updateEvent", listener);
  },
  minimize: () => ipcRenderer.invoke("window:minimize"),
  maximize: () => ipcRenderer.invoke("window:maximize"),
  close: () => ipcRenderer.invoke("window:close"),
  openExternal: (url: string) => ipcRenderer.invoke("window:openExternal", url),
  getLogInfo: () =>
    ipcRenderer.invoke("log:getInfo") as Promise<{
      path: string;
      dir: string;
      exists: boolean;
      sizeBytes: number;
    }>,
  selectLogDir: () =>
    ipcRenderer.invoke("log:selectDir") as Promise<string | null>,
  openLogFile: () =>
    ipcRenderer.invoke("log:openFile") as Promise<{
      ok: boolean;
      message?: string;
    }>,
  openLogDir: () =>
    ipcRenderer.invoke("log:openDir") as Promise<{
      ok: boolean;
      message?: string;
    }>,
  readLog: () => ipcRenderer.invoke("log:read") as Promise<string>,
});
