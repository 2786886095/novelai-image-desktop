import { contextBridge, ipcRenderer, webUtils } from "electron";
import { createImageSaveTracker, type ImageSaveNotice } from "../src/image-save-feedback";
import type {
  CompatibleGenerationRequest,
  CompatibleImageSettings,
  AnlasQuoteRequest,
  AppSettings,
  ArtistStyleCatalogResult,
  ArtistStyleCatalogScope,
  ArtistStylePreviewResult,
  ArtistStylePreviewPage,
  AugmentOptions,
  BatchExportFile,
  BatchRedrawRequest,
  ComicConvertRequest,
  ComicConsistencyRequest,
  ComicGeneratePanelRequest,
  TagComicExportZipRequest,
  TagComicGenerateRequest,
  TagComicReferenceImportRequest,
  DirectorTool,
  DataBackupExportRequest,
  DataBackupImportRequest,
  DataBackupImportResult,
  DataBackupInspectResult,
  DataBackupOperationResult,
  DataBackupStatus,
  GenerateExtras,
  GenerationPreviewEvent,
  TagSuggestion,
  GenerateParams,
  HistoryItem,
  I2IParams,
  NAIInpaintModel,
  SettingKey,
  TextToolHistoryItem,
  UpscaleScale,
  UpdateProgressEvent,
  StylePromptPreviewImage,
  ReferencePresetExportRequest,
  ReferencePresetLibrary,
  ReferencePresetOperationResult,
  ReferencePresetSaveRequest,
  MetadataSnapshotPayload,
  ResourceDatabaseDownloadResult,
  ResourceDatabaseId,
  ResourceDatabaseOverview,
  ResourceDatabaseProgressEvent,
} from "../src/types";
import type { AitagSearchRequest } from "../src/aitag";
import type { PromptCodexSnapshot } from "../src/prompt-codex";
import type {
  AgentEvent,
  AgentMemory,
  AgentProviderProbe,
  AgentSendRequest,
  AgentSkill,
  AgentWorkspaceData,
  TavernCardExportRequest,
  TavernImageRequest,
} from "../src/agent/types";

const imageSaves = createImageSaveTracker();

contextBridge.exposeInMainWorld("naiDesktop", {
  favoritesStatus:(src:string)=>ipcRenderer.invoke('favorites:status',src),
  favoritesList: () => ipcRenderer.invoke('favorites:list'),
  favoritesAdd: (src:string) => ipcRenderer.invoke('favorites:add',src),
  favoritesRename: (id:string,name:string) => ipcRenderer.invoke('favorites:rename',id,name),
  favoritesRemove: (id:string) => ipcRenderer.invoke('favorites:remove',id),
  favoritesChooseDirectory: () => ipcRenderer.invoke('favorites:directory'),
  onFavoritesChanged: (callback:(notice:{message:string})=>void) => {
    const listener=(_event:Electron.IpcRendererEvent,notice:{message:string})=>callback(notice);
    ipcRenderer.on('favorites:changed',listener);return ()=>ipcRenderer.removeListener('favorites:changed',listener);
  },
  onStudioAgentRequest: (callback:(request:import('../src/studio-agent-contract').StudioAgentRequest)=>void) => {
    const listener=(_event:Electron.IpcRendererEvent,request:import('../src/studio-agent-contract').StudioAgentRequest)=>callback(request);
    ipcRenderer.on('studio-agent:request',listener);
    return ()=>ipcRenderer.removeListener('studio-agent:request',listener);
  },
  replyStudioAgent: (id:string,reply:import('../src/studio-agent-contract').StudioAgentReply) => ipcRenderer.invoke('studio-agent:reply',id,reply),
  commitStudioSetting: (id:string,key:SettingKey,expected:AppSettings[SettingKey],value:AppSettings[SettingKey]) => ipcRenderer.invoke('studio-agent:commit',id,key,expected,value),
  harnessSetAutoPluginUpdates: (enabled:boolean) => ipcRenderer.invoke('harness:setAutoPluginUpdates',enabled),
  harnessCheckPluginUpdates: () => ipcRenderer.invoke('harness:checkPluginUpdates'),
  harnessSnapshot: () => ipcRenderer.invoke("harness:snapshot"),
  harnessStart: () => ipcRenderer.invoke("harness:start"),
  harnessStop: () => ipcRenderer.invoke("harness:stop"),
  harnessPlanDownload: (kind: 'component' | 'official', reinstall = false) => ipcRenderer.invoke("harness:planDownload", kind, reinstall),
  harnessUninstall: (confirmed: boolean) => ipcRenderer.invoke("harness:uninstall", confirmed),
  harnessPrepareUpdate: (kind: 'component' | 'official', token: string, disablePlugins: string[] = []) => ipcRenderer.invoke("harness:prepareUpdate", kind, token, disablePlugins),
  harnessApplyPreparedUpdate: (token: string) => ipcRenderer.invoke("harness:applyPreparedUpdate", token),
  harnessCheckUpdates: () => ipcRenderer.invoke("harness:checkUpdates"),
  harnessUpdate: () => ipcRenderer.invoke("harness:update"),
  harnessOpenBackups: () => ipcRenderer.invoke("harness:openBackups"),
  harnessRestoreBackup: () => ipcRenderer.invoke("harness:restoreBackup"),
  onImageSaveFeedback: (callback: (notices: ImageSaveNotice[]) => void) => imageSaves.subscribe(callback),
  dismissImageSaveFeedback: (id: number) => imageSaves.dismiss(id),
  platform: process.platform,
  getResourceDatabaseOverview: (): Promise<ResourceDatabaseOverview> =>
    ipcRenderer.invoke("resource-database:overview"),
  downloadResourceDatabase: (id: ResourceDatabaseId, confirmReplace = false): Promise<ResourceDatabaseDownloadResult> =>
    ipcRenderer.invoke("resource-database:download", id, confirmReplace),
  pauseResourceDatabaseDownload: (id: ResourceDatabaseId): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke("resource-database:pause", id),
  restorePreviousResourceDatabase: (id: ResourceDatabaseId, confirmed = false): Promise<ResourceDatabaseDownloadResult> =>
    ipcRenderer.invoke("resource-database:restore-previous", id, confirmed),
  openResourceDatabaseDirectory: (): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke("resource-database:open-directory"),
  clearResourceQueryCache: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("resource-database:clear-cache"),
  relatedResourceTags: (tags: string[], limit?: number): Promise<TagSuggestion[]> =>
    ipcRenderer.invoke("resource-database:related-tags", tags, limit),
  onResourceDatabaseProgress: (callback: (event: ResourceDatabaseProgressEvent) => void) => {
    const listener = (_event: unknown, payload: ResourceDatabaseProgressEvent) => callback(payload);
    ipcRenderer.on("resource-database:progress", listener);
    return () => ipcRenderer.removeListener("resource-database:progress", listener);
  },
  listPortableRecoveries: () => ipcRenderer.invoke("dataBackup:listRecoveries"),
  openPortableRecovery: (kind: "agent" | "detective", id: string): Promise<void> =>
    ipcRenderer.invoke("dataBackup:openRecovery", kind, id),
  activatePortableRecovery: (kind: "agent" | "detective", id: string): Promise<{preserved:string}> =>
    ipcRenderer.invoke("dataBackup:activateRecovery", kind, id),
  exportDataBackup: (request: DataBackupExportRequest): Promise<DataBackupOperationResult> =>
    ipcRenderer.invoke("dataBackup:export", request),
  inspectDataBackup: (): Promise<DataBackupInspectResult> =>
    ipcRenderer.invoke("dataBackup:inspect"),
  importDataBackup: (request: DataBackupImportRequest): Promise<DataBackupImportResult> =>
    ipcRenderer.invoke("dataBackup:import", request),
  getDataBackupStatus: (): Promise<DataBackupStatus> =>
    ipcRenderer.invoke("dataBackup:status"),
  runAutomaticBackup: (workspaceData?: Record<string, string>): Promise<DataBackupOperationResult> =>
    ipcRenderer.invoke("dataBackup:runAutomatic", workspaceData),
  selectBackupDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke("dataBackup:selectDirectory"),
  openBackupDirectory: (): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke("dataBackup:openDirectory"),
  getAgentWorkspace: () => ipcRenderer.invoke("agent:getWorkspace"),
  saveTavernWorkspace: (workspace: AgentWorkspaceData) => ipcRenderer.invoke("agent:saveWorkspace", workspace),
  createAgentConversation: (title?: string) => ipcRenderer.invoke("agent:createConversation", title),
  selectAgentConversation: (conversationId: string) => ipcRenderer.invoke("agent:selectConversation", conversationId),
  renameAgentConversation: (conversationId: string, title: string) => ipcRenderer.invoke("agent:renameConversation", conversationId, title),
  setAgentConversationArchived: (conversationId: string, archived: boolean) => ipcRenderer.invoke("agent:setConversationArchived", conversationId, archived),
  setStudioConversationOptions: (conversationId:string,patch:Partial<import('../src/agent/workspace-controls').StudioConversationOptions>)=>ipcRenderer.invoke('agent:setStudioOptions',conversationId,patch),
  deleteAgentConversation: (conversationId: string) => ipcRenderer.invoke("agent:deleteConversation", conversationId),
  importAgentFiles: (conversationId: string, sourcePaths?: string[]) => ipcRenderer.invoke("agent:importFiles", conversationId, sourcePaths),
  importStudioResources: (kind:'presets'|'worldbooks'|'characters') => ipcRenderer.invoke('agent:importStudioResources',kind),
  deleteAgentAttachment: (conversationId: string, attachmentId: string) => ipcRenderer.invoke("agent:deleteAttachment", conversationId, attachmentId),
  exportAgentAttachment: (conversationId: string, messageId: string, attachmentId: string) => imageSaves.run(`agent:${conversationId}:${messageId}:${attachmentId}`, "image", () => ipcRenderer.invoke("agent:exportAttachment", conversationId, messageId, attachmentId), 1),
  sendAgentMessage: (request: AgentSendRequest) => ipcRenderer.invoke("agent:send", request),
  generateTavernImage: (request: TavernImageRequest) => ipcRenderer.invoke("agent:generateImage", request),
  importTavernCards: (sourcePaths?: string[]) => ipcRenderer.invoke("agent:importCards", sourcePaths),
  exportTavernCard: (request: TavernCardExportRequest) => ipcRenderer.invoke("agent:exportCard", request),
  importTavernVisualAsset: (kind: "avatar" | "background", sourcePath?: string) => ipcRenderer.invoke("agent:importVisual", kind, sourcePath),
  abortAgentMessage: (conversationId: string) => ipcRenderer.invoke("agent:abort", conversationId),
  compactAgentConversation: (conversationId: string) => ipcRenderer.invoke("agent:compact", conversationId),
  getAgentPendingQuestions:()=>ipcRenderer.invoke("agent:pendingQuestions"),
  respondAgentQuestion:(response:import("../src/agent/types").AgentQuestionResponse)=>ipcRenderer.invoke("agent:respondQuestion",response),
  respondAgentPermission: (permissionId: string, response: "once" | "always" | "reject") => ipcRenderer.invoke("agent:respondPermission", permissionId, response),
  upsertAgentSkill: (skill: Partial<AgentSkill> & Pick<AgentSkill, "name" | "instructions">) => ipcRenderer.invoke("agent:upsertSkill", skill),
  deleteAgentSkill: (skillId: string) => ipcRenderer.invoke("agent:deleteSkill", skillId),
  upsertAgentMemory: (memory: Partial<AgentMemory> & Pick<AgentMemory, "title" | "content" | "scope">) => ipcRenderer.invoke("agent:upsertMemory", memory),
  deleteAgentMemory: (memoryId: string) => ipcRenderer.invoke("agent:deleteMemory", memoryId),
  getAgentRuntimeStatus: () => ipcRenderer.invoke("agent:runtimeStatus"),
  getAgentPendingPermissions: () => ipcRenderer.invoke("agent:pendingPermissions"),
  restartAgentRuntime: () => ipcRenderer.invoke("agent:restartRuntime"),
  discoverAgentModels: (probe: AgentProviderProbe) => ipcRenderer.invoke("agent:discoverModels", probe),
  getAgentWorkspaceLocation: () => ipcRenderer.invoke("agent:workspaceLocation"),
  openAgentWorkspaceDirectory: () => ipcRenderer.invoke("agent:openWorkspace"),
  onAgentEvent: (callback: (event: AgentEvent) => void) => {
    const listener = (_event: unknown, payload: AgentEvent) => callback(payload);
    ipcRenderer.on("agent:event", listener);
    return () => ipcRenderer.removeListener("agent:event", listener);
  },
  promptCodexCache: (): Promise<PromptCodexSnapshot | null> =>
    ipcRenderer.invoke("promptCodex:cache"),
  promptCodexBundled: (): Promise<PromptCodexSnapshot> =>
    ipcRenderer.invoke("promptCodex:bundled"),
  promptCodexUpdate: (): Promise<PromptCodexSnapshot> =>
    ipcRenderer.invoke("promptCodex:update"),
  artistLabPickTarget: (sourcePath?: string) => ipcRenderer.invoke("artistLab:pickTarget", sourcePath),
  artistDetectiveStatus: () => ipcRenderer.invoke("artistDetective:status"),
  artistDetectiveDownloadStatus: () => ipcRenderer.invoke("artistDetective:downloadStatus"),
  artistDetectiveDownloadStart: () => ipcRenderer.invoke("artistDetective:downloadStart"),
  artistDetectiveDownloadVariant: (variant: "full" | "light") => ipcRenderer.invoke("artistDetective:downloadVariant", variant),
  artistDetectiveDownloadCancel: () => ipcRenderer.invoke("artistDetective:downloadCancel"),
  artistDetectiveDownloadDirectory: () => ipcRenderer.invoke("artistDetective:downloadDirectory"),
  artistDetectiveConfigure: (kind: "python" | "assets") => ipcRenderer.invoke("artistDetective:configure", kind),
  artistDetectiveStart: (request: import("../src/artist-detective-contract").DetectiveRunRequest) => ipcRenderer.invoke("artistDetective:start", request),
  artistDetectiveStop: () => ipcRenderer.invoke("artistDetective:stop"),
  artistDetectiveOpenResults: () => ipcRenderer.invoke("artistDetective:openResults"),
  artistDetectiveVerifyRuntime: () => ipcRenderer.invoke("artistDetective:verifyRuntime"),
  artistDetectiveSelectModel: (variant:'full'|'light') => ipcRenderer.invoke("artistDetective:selectModel", variant),
  artistDetectiveClearResults: (request: {directory:string;deleteImages:boolean}) => ipcRenderer.invoke("artistDetective:clearResults", request),
  artistLabSearchArtists: (query?: string, limit?: number) =>
    ipcRenderer.invoke("artistLab:searchArtists", query, limit),
  artistLabPopularArtists: (limit?: number, force?: boolean) =>
    ipcRenderer.invoke("artistLab:popularArtists", limit, force),
  artistLabPopularArtistPool: (limit?: number, force?: boolean) =>
    ipcRenderer.invoke("artistLab:popularArtistPool", limit, force),
  artistLabAllArtists: (requestId: string) => ipcRenderer.invoke("artistLab:allArtists", requestId),
  artistLabCatalogSelect: (count: number, mode: "random"|"ranked", seed: number) => ipcRenderer.invoke("artistLab:catalogSelect",count,mode,seed),
  artistLabCatalogUpdate: (id: string) => ipcRenderer.invoke("artistLab:catalogUpdate",id),
  artistLabCatalogCancel: (id: string) => ipcRenderer.invoke("artistLab:catalogCancel",id),
  artistLabSelectedArtists: (requestId: string, count: number) => ipcRenderer.invoke("artistLab:selectedArtists", requestId, count),
  artistLabArtistTotal: (force = false) => ipcRenderer.invoke("artistLab:artistTotal", force),
  artistLabCancelArtistSync: (requestId: string) => ipcRenderer.invoke("artistLab:cancelSync", requestId),
  onArtistPoolSyncProgress: (callback: (progress: import("../src/artist-lab").ArtistPoolSyncProgress) => void) => {
    const listener = (_event: unknown, progress: import("../src/artist-lab").ArtistPoolSyncProgress) => callback(progress);
    ipcRenderer.on("artistLab:syncProgress", listener);
    return () => ipcRenderer.removeListener("artistLab:syncProgress", listener);
  },
  artistLabArtistRanking: (page?: number, pageSize?: number, query?: string, force?: boolean) =>
    ipcRenderer.invoke("artistLab:artistRanking", page, pageSize, query, force),
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
  artistLabStylePreview: (tag: string) =>
    ipcRenderer.invoke("artistLab:stylePreview", tag) as Promise<ArtistStylePreviewResult | null>,
  artistLabStylePreviewPage: (tag: string, page = 1, pageSize = 12) =>
    ipcRenderer.invoke("artistLab:stylePreviewPage", tag, page, pageSize) as Promise<ArtistStylePreviewPage>,
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
  aitagCacheImage: (url: string, retentionDays?: number, force?: boolean) =>
    ipcRenderer.invoke("aitag:cache-image", url, retentionDays, force),
  aitagCacheStats: () => ipcRenderer.invoke("aitag:cache-stats"),
  aitagClearCache: () => ipcRenderer.invoke("aitag:clear-cache"),
  onlineGallerySearch: (request: import("../src/online-gallery").OnlineGallerySearchRequest) =>
    ipcRenderer.invoke("online-gallery:search", request),
  onlineGalleryDetail: (request: import("../src/online-gallery").OnlineGalleryDetailRequest) =>
    ipcRenderer.invoke("online-gallery:detail", request),
  downloadOnlineGalleryImages: (request: import("../src/online-gallery").OnlineGalleryDownloadRequest) =>
    imageSaves.run(`gallery:${request.source}:${request.itemId}:${request.images.map(item => item.id).join(",")}`, "download", () => ipcRenderer.invoke("online-gallery:download-images", request), request.images.length),
  selectOnlineGalleryDownloadDir: () => ipcRenderer.invoke("online-gallery:select-download-dir"),
  onlineGalleryClearDataCache: () => ipcRenderer.invoke("online-gallery:clear-data-cache"),
  onlineGalleryCacheImage: (
    source: import("../src/online-gallery").OnlineGallerySourceId,
    url: string,
    retentionDays?: number,
    force?: boolean,
  ) => ipcRenderer.invoke("online-gallery:cache-image", source, url, retentionDays, force),
  hasToken: () => ipcRenderer.invoke("nai:hasToken"),
  accountCached: () => ipcRenderer.invoke("nai:accountCached"),
  storedToken: () => ipcRenderer.invoke("nai:storedToken"),
  verifyToken: (token: string) => ipcRenderer.invoke("nai:verify", token),
  clearToken: () => ipcRenderer.invoke("nai:clearToken"),
  quoteAnlas: (request: AnlasQuoteRequest) =>
    ipcRenderer.invoke("nai:quoteAnlas", request),
  generateCompatible: (request: CompatibleGenerationRequest) => ipcRenderer.invoke("images:generateCompatible", request),
  saveCompatibleImageSettings: (config: CompatibleImageSettings, apiKey: string, provider: "novelai" | "openai-images", expectedRevision: string) =>
    ipcRenderer.invoke("images:saveCompatibleSettings", config, apiKey, provider, expectedRevision),
  setCompatibleImageProvider: (provider: "novelai", expectedRevision: string) => ipcRenderer.invoke("images:setCompatibleProvider", provider, expectedRevision),
  onImageServiceChanged: (callback: (notice: { revision: string; version: number }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, notice: { revision: string; version: number }) => callback(notice);
    ipcRenderer.on("images:settingsChanged", listener);
    return () => ipcRenderer.removeListener("images:settingsChanged", listener);
  },
  generate: (
    params: GenerateParams,
    extras: GenerateExtras,
    previewRequestId?: string,
  ) => ipcRenderer.invoke("nai:generate", params, extras, previewRequestId),
  onGenerationPreview: (callback: (event: GenerationPreviewEvent) => void) => {
    const listener = (_event: unknown, payload: GenerationPreviewEvent) => callback(payload);
    ipcRenderer.on("nai:generationPreview", listener);
    return () => ipcRenderer.removeListener("nai:generationPreview", listener);
  },
  generateArtistLab: (
    params: GenerateParams,
    extras: GenerateExtras,
    mode: "target" | "random",
  ) => ipcRenderer.invoke("nai:generateArtistLab", params, extras, mode),
  artistLabPromoteFavorite: (item: HistoryItem) =>
    ipcRenderer.invoke("artistLab:promoteFavorite", item),
  artistLabListPromotedFavorites: () =>
    ipcRenderer.invoke("artistLab:listPromotedFavorites"),
  artistLabLoadFavoriteLibrary: () =>
    ipcRenderer.invoke("artistLab:loadFavoriteLibrary"),
  artistLabSaveFavoriteCollection: (collection: string, favorites: unknown[]) =>
    ipcRenderer.invoke("artistLab:saveFavoriteCollection", collection, favorites),
  artistLabDeleteTemporary: (filePath: string) =>
    ipcRenderer.invoke("artistLab:deleteTemporary", filePath),
  artistLabClearTemporary: () => ipcRenderer.invoke("artistLab:clearTemporary"),
  generateI2I: (
    params: GenerateParams,
    i2i: I2IParams,
    extras: GenerateExtras,
  ) => ipcRenderer.invoke("nai:generateI2I", params, i2i, extras),
  batchRedrawPrepare: (requests: BatchRedrawRequest[]) => ipcRenderer.invoke("nai:batchRedrawPrepare",requests),
  batchRedrawCancel: (runId: string) => ipcRenderer.invoke("nai:batchRedrawCancel",runId),
  redrawImage: (request: BatchRedrawRequest) =>
    ipcRenderer.invoke("nai:redrawImage", request),
  inpaint: (
    params: GenerateParams,
    inpaintModel: NAIInpaintModel,
    maskBase64: string,
    strength: number,
    noise: number,
    region?: import("../src/focused-inpaint").InpaintRegion,
  ) =>
    ipcRenderer.invoke(
      "nai:inpaint",
      params,
      inpaintModel,
      maskBase64,
      strength,
      noise,
      region,
    ),
  upscaleImage: (scale: UpscaleScale, model: string) =>
    ipcRenderer.invoke("nai:upscale", scale, model),
  augmentImage: (tool: DirectorTool, options: AugmentOptions) =>
    ipcRenderer.invoke("nai:augment", tool, options),
  cancel: () => ipcRenderer.invoke("nai:cancel"),
  reversePrompt: (
    imageBase64: string,
    mode: string,
    scope?: string,
    hint?: string,
    knownCharacter?: boolean,
    templateVersion?: string,
  ) =>
    ipcRenderer.invoke(
      "nai:reversePrompt",
      imageBase64,
      mode,
      scope,
      hint,
      knownCharacter,
      templateVersion,
    ),
  convertPrompt: (text: string, mode: string, knownCharacter?: boolean, templateVersion?: string, assistant?: import("../src/prompt-assistant").PromptEditRequest) =>
    ipcRenderer.invoke("nai:convertPrompt", text, mode, knownCharacter, templateVersion, assistant),
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
  tagComicCancelGeneration: (runId: string) => ipcRenderer.invoke("tagComic:cancelGeneration", runId),
  tagComicPrepareImageService: (requests: TagComicGenerateRequest[]) => ipcRenderer.invoke("tagComic:prepareImageService", requests),
  tagComicGenerateCandidate: (request: TagComicGenerateRequest) =>
    ipcRenderer.invoke("tagComic:generateCandidate", request),
  tagComicImportReference: (request: TagComicReferenceImportRequest) =>
    ipcRenderer.invoke("tagComic:importReference", request),
  tagComicDeleteReference: (projectId: string, referenceId: string) =>
    ipcRenderer.invoke("tagComic:deleteReference", projectId, referenceId),
  tagComicExportSelectedZip: (request: TagComicExportZipRequest) =>
    ipcRenderer.invoke("tagComic:exportSelectedZip", request),
  getAiCallLog: () => ipcRenderer.invoke("ai:getLog"),
  clearAiCallLog: () => ipcRenderer.invoke("ai:clearLog"),
  getReverseTemplateDefaults: () =>
    ipcRenderer.invoke("settings:getReverseDefaults"),
  listAiModels: (kind: "reverse" | "convert" | "translate") =>
    ipcRenderer.invoke("nai:listModels", kind),
  listMcpTools: () => ipcRenderer.invoke("nai:listMcpTools"),
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
      catalogDownloaded: boolean;
      bilingualDownloaded: boolean;
      bilingualCount: number;
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
  artistStyleCatalog: (
    scope: ArtistStyleCatalogScope,
    query: string,
    offset: number,
    limit: number,
  ) => ipcRenderer.invoke(
    "nai:artistStyleCatalog",
    scope,
    query,
    offset,
    limit,
  ) as Promise<ArtistStyleCatalogResult>,
  translate: (text: string, target?: string) =>
    ipcRenderer.invoke("nai:translate", text, target),
  readClipboardImageFiles: () => ipcRenderer.invoke("imageInput:readClipboard"),
  savePastedImageFiles: (images: Array<{name:string;bytes:Uint8Array}>) => ipcRenderer.invoke("imageInput:save", images),
  loadImage: () => ipcRenderer.invoke("nai:loadImage"),
  loadImageFromPath: (filePath: string) =>
    ipcRenderer.invoke("nai:loadImageFromPath", filePath),
  saveMetadataSnapshot: (payload: MetadataSnapshotPayload) =>
    ipcRenderer.invoke("metadata:saveSnapshot", payload),
  saveMetadataSnapshotFromPath: (filePath: string) =>
    ipcRenderer.invoke("metadata:saveSnapshotFromPath", filePath),
  readMetadataSnapshotFromPath: (filePath: string) =>
    ipcRenderer.invoke("metadata:readSnapshotFromPath", filePath),
  loadMetadataSnapshot: () => ipcRenderer.invoke("metadata:loadSnapshot"),
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
    imageSaves.run(`group:${groupId}`, "archive", () => ipcRenderer.invoke("storage:exportGroup", groupId)),
  exportFiles: (files: BatchExportFile[], defaultName?: string) =>
    imageSaves.run(`files:${JSON.stringify(files)}`, "archive", () => ipcRenderer.invoke("storage:exportFiles", files, defaultName), files.length),
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
  importStylePromptPresetImagePaths: (
    sourcePaths: string[],
    presetId: string,
    availableSlots: number,
  ): Promise<StylePromptPreviewImage[]> =>
    ipcRenderer.invoke(
      "stylePreset:importImagePaths",
      sourcePaths,
      presetId,
      availableSlots,
    ),
  reconcileStylePromptPresetImages: (
    presetId: string,
    knownImages: StylePromptPreviewImage[],
  ): Promise<StylePromptPreviewImage[]> =>
    ipcRenderer.invoke("stylePreset:reconcileImages", presetId, knownImages),
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
  deleteReferencePresetGroup: (
    name: string,
  ): Promise<ReferencePresetOperationResult> =>
    ipcRenderer.invoke("referencePreset:deleteGroup", name),
  moveReferencePresetToGroup: (
    presetId: string,
    group: string,
  ): Promise<ReferencePresetOperationResult> =>
    ipcRenderer.invoke("referencePreset:moveToGroup", presetId, group),
  importReferencePresets: (): Promise<ReferencePresetOperationResult> =>
    ipcRenderer.invoke("referencePreset:import"),
  exportReferencePresets: (
    request: ReferencePresetExportRequest = {},
  ): Promise<ReferencePresetOperationResult> =>
    ipcRenderer.invoke("referencePreset:export", request),
  downloadReferenceCatalogAsset: (request: { id: string; urls: string[] }) =>
    ipcRenderer.invoke("referenceCatalog:download", request),
  onReferenceCatalogDownloadProgress: (callback: (event: { id: string; loaded: number; total: number }) => void) => {
    const listener = (_event: unknown, payload: { id: string; loaded: number; total: number }) => callback(payload);
    ipcRenderer.on("referenceCatalog:downloadProgress", listener);
    return () => ipcRenderer.removeListener("referenceCatalog:downloadProgress", listener);
  },
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

contextBridge.exposeInMainWorld('naiAccounts', { list: () => ipcRenderer.invoke('naiAccounts:list'), state: () => ipcRenderer.invoke('naiAccounts:state'), select: (id?: string) => ipcRenderer.invoke('naiAccounts:select', id), login: (input: import('./ipc/nai-accounts-login').OfficialLoginInput) => ipcRenderer.invoke('naiAccounts:login', input), migrate: () => ipcRenderer.invoke('naiAccounts:migrate'), add: (input: import('../src/nai-accounts').NaiAccountInput) => ipcRenderer.invoke('naiAccounts:add', input), remove: (id: string) => ipcRenderer.invoke('naiAccounts:remove', id), reveal: (id:string) => ipcRenderer.invoke('naiAccounts:reveal',id), probe: (id: string) => ipcRenderer.invoke('naiAccounts:probe', id) });
