import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  AgentAttachment,
  AgentEvent,
  AgentToolBridgeRequest,
  AgentToolBridgeResponse,
} from "../../src/agent/types";
import type {
  AugmentOptions,
  DirectorTool,
  GenerateExtras,
  GenerateParams,
  HistoryItem,
  NAIInpaintModel,
  ReferencePreset,
  UpscaleScale,
} from "../../src/types";
import { inspectImageMetadata, parseImageMeta } from "../../src/png-meta";
import {
  applyAgentPromptLocks,
  buildAgentGenerationInput,
  defaultAgentInpaintModel,
} from "../../src/agent/generation-input";
import {
  DEFAULT_AUGMENT_OPTIONS,
  DEFAULT_I2I_PARAMS,
  DEFAULT_PARAMS,
  maxNAICharacterPrompts,
  supportsNAIPreciseReference,
  supportsNAIVibeTransfer,
} from "../../src/types";
import {
  augmentImg,
  convertPromptText,
  generateImage,
  inpaintImage,
  loadImageFromPath,
  redrawImage,
  reversePromptImage,
  upscaleImg,
} from "./nai";
import { artistStyleCatalog, searchDanbooru, searchDanbooruConcepts } from "./danbooru-tags";
import { searchOnlineGallery } from "./online-gallery";
import { listReferencePresets } from "./reference-presets";
import { getHistory, getHistoryGroups, getSettings, setSetting } from "./store";
import {
  conversationForRuntimeSession,
  deleteAgentMemory,
  readAgentWorkspace,
  upsertAgentMemory,
} from "./agent-store";

export const AGENT_READ_TOOLS = [
  "langbai_get_generation_state",
  "langbai_search_tags",
  "langbai_search_artist_styles",
  "langbai_search_online_gallery",
  "langbai_list_prompt_presets",
  "langbai_list_reference_presets",
  "langbai_read_image_metadata",
  "langbai_list_history",
  "langbai_memory_list",
] as const;

export const AGENT_MUTATING_TOOLS = [
  "langbai_generate_image",
  "langbai_redraw_image",
  "langbai_inpaint_image",
  "langbai_upscale_image",
  "langbai_director",
  "langbai_reverse_prompt",
  "langbai_convert_prompt",
  "langbai_save_prompt_preset",
  "langbai_apply_prompt",
  "langbai_memory_upsert",
  "langbai_memory_delete",
] as const;

export const AGENT_TOOL_NAMES = [...AGENT_READ_TOOLS, ...AGENT_MUTATING_TOOLS] as const;

type Emit = (event: AgentEvent) => void;

let workbenchChain: Promise<unknown> = Promise.resolve();
const MAX_CACHED_TOOL_ATTACHMENTS = 512;
const cachedToolAttachments = new Map<string, AgentAttachment>();

function serializedWorkbench<T>(operation: () => Promise<T>): Promise<T> {
  const next = workbenchChain.then(operation, operation);
  workbenchChain = next.then(() => undefined, () => undefined);
  return next;
}

function finite(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function text(value: unknown, max = 100_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function bool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function json(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function imageAttachment(item: HistoryItem): AgentAttachment {
  let size = 0;
  try { size = fs.statSync(item.filePath).size; } catch { /* best effort */ }
  return {
    id: item.id,
    name: path.basename(item.filePath),
    mime: "image/png",
    size,
    kind: "image",
    filePath: item.filePath,
    fileUrl: item.fileUrl,
    width: item.width,
    height: item.height,
    createdAt: item.createdAt,
  };
}

function imageMime(filePath: string) {
  switch (path.extname(filePath).toLocaleLowerCase()) {
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    default: return "image/png";
  }
}

function referenceAttachment(preset: ReferencePreset): AgentAttachment {
  let size = 0;
  try { size = fs.statSync(preset.filePath).size; } catch { /* best effort */ }
  return {
    id: `reference-preset:${preset.id}`,
    name: path.basename(preset.filePath),
    mime: imageMime(preset.filePath),
    size,
    kind: "image",
    filePath: preset.filePath,
    fileUrl: preset.fileUrl,
    width: preset.width || undefined,
    height: preset.height || undefined,
    createdAt: preset.createdAt,
  };
}

function rememberToolAttachments(items: AgentAttachment[]) {
  for (const item of items) {
    cachedToolAttachments.delete(item.id);
    cachedToolAttachments.set(item.id, item);
  }
  while (cachedToolAttachments.size > MAX_CACHED_TOOL_ATTACHMENTS) {
    const oldest = cachedToolAttachments.keys().next().value as string | undefined;
    if (!oldest) break;
    cachedToolAttachments.delete(oldest);
  }
}

function response(
  ok: boolean,
  title: string,
  value: unknown,
  generatedImages?: AgentAttachment[],
): AgentToolBridgeResponse {
  return {
    ok,
    title,
    output: typeof value === "string" ? value : json(value),
    data: value,
    ...(generatedImages?.length ? { generatedImages } : {}),
  };
}

function currentParams(overrides: Record<string, unknown> = {}): GenerateParams {
  const settings = getSettings();
  const saved = settings.lastGenerationState?.params ?? DEFAULT_PARAMS;
  return buildAgentGenerationInput(overrides, { params: saved }).params;
}

function defaultExtras(): GenerateExtras {
  const settings = getSettings();
  return {
    vibeImages: [],
    charCaptions: [],
    preciseReferences: [],
    historyGroupId: settings.generationGroupId || undefined,
    modelMode: settings.modelMode,
  };
}

function generationInput(request: AgentToolBridgeRequest, args: Record<string, unknown>) {
  const settings = getSettings();
  const result = buildAgentGenerationInput(
    args,
    {
      params: settings.lastGenerationState?.params ?? DEFAULT_PARAMS,
      extras: defaultExtras(),
      modelMode: settings.modelMode,
      historyGroupId: settings.generationGroupId || undefined,
    },
    (attachmentId) => {
      const attachment = attachmentForRequest(request, attachmentId);
      if (attachment.kind !== "image" && !attachment.mime.startsWith("image/")) {
        throw new Error(`attachmentId=${attachmentId} 不是图片附件。`);
      }
      return readBase64(attachment.filePath);
    },
  );
  result.params = applyAgentPromptLocks(result.params, {
    ...(settings.lockStylePrompt ? { stylePrompt: settings.savedStylePrompt } : {}),
    ...(settings.lockNegativePrompt ? { negativePrompt: settings.savedNegativePrompt } : {}),
  });
  return result;
}

function readBase64(filePath: string) {
  const resolved = path.resolve(filePath);
  const stat = fs.statSync(resolved);
  if (!stat.isFile() || stat.size > 48 * 1024 * 1024) throw new Error("附件不存在或超过 48 MB。" );
  return fs.readFileSync(resolved).toString("base64");
}

function attachmentForRequest(request: AgentToolBridgeRequest, value: unknown): AgentAttachment {
  const attachmentId = text(value, 200);
  if (!attachmentId) throw new Error("缺少 attachmentId。请先使用当前对话附件或历史记录中的附件 ID。");
  const conversation = request.sessionId ? conversationForRuntimeSession(request.sessionId) : undefined;
  const candidates: AgentAttachment[] = [];
  if (conversation) {
    candidates.push(...conversation.draftAttachments);
    for (const message of conversation.messages) {
      candidates.push(...message.attachments);
      for (const execution of message.tools) candidates.push(...(execution.generatedImages ?? []));
    }
  }
  const local = candidates.find((item) => item.id === attachmentId);
  const cached = cachedToolAttachments.get(attachmentId);
  const history = getHistory().find((item) => item.id === attachmentId);
  const attachment = local ?? cached ?? (history ? imageAttachment(history) : undefined);
  if (!attachment || !attachment.filePath || !fs.existsSync(attachment.filePath)) {
    throw new Error(`找不到 attachmentId=${attachmentId} 对应的本机文件。`);
  }
  return attachment;
}

function savePromptPreset(nameValue: unknown, promptValue: unknown) {
  const prompt = text(promptValue);
  if (!prompt) throw new Error("正面提示词不能为空。");
  const settings = getSettings();
  const base = text(nameValue, 100) || prompt.replace(/[\r\n,，]+/g, " ").trim().slice(0, 24) || "提示词";
  const occupied = new Set((settings.positivePromptPresets ?? []).map((item) => item.name.toLocaleLowerCase()));
  let name = base;
  let index = 1;
  while (occupied.has(name.toLocaleLowerCase())) name = `${base} (${index++})`;
  const preset = {
    id: crypto.randomUUID(),
    name,
    prompt,
    createdAt: new Date().toISOString(),
    previewImages: [],
  };
  setSetting("positivePromptPresets", [...(settings.positivePromptPresets ?? []), preset]);
  return preset;
}

export async function executeAgentTool(
  request: AgentToolBridgeRequest,
  emit: Emit,
): Promise<AgentToolBridgeResponse> {
  const args = record(request.args);
  try {
    switch (request.tool) {
      case "langbai_get_generation_state": {
        const settings = getSettings();
        const params = settings.lastGenerationState?.params ?? DEFAULT_PARAMS;
        return response(true, "当前生图状态", {
          params,
          modelMode: settings.modelMode,
          generationGroupId: settings.generationGroupId,
          lockedStylePrompt: settings.lockStylePrompt ? settings.savedStylePrompt : "",
          lockedNegativePrompt: settings.lockNegativePrompt ? settings.savedNegativePrompt : "",
          streamPreviewEnabled: settings.streamPreviewEnabled,
          referenceCapabilities: {
            maxCharacterPrompts: maxNAICharacterPrompts(params.model),
            vibeTransfer: supportsNAIVibeTransfer(params.model),
            preciseReference: supportsNAIPreciseReference(params.model),
            attachmentIdsRequiredForAgentReferences: true,
          },
        });
      }
      case "langbai_search_tags": {
        const query = text(args.query, 300);
        const limit = Math.trunc(finite(args.limit, 20, 1, 100));
        const [exact, concepts] = await Promise.all([
          searchDanbooru(query, limit),
          searchDanbooruConcepts(query, limit),
        ]);
        const byTag = new Map([...exact, ...concepts].map((item) => [item.tag, item]));
        return response(true, `Tag 检索：${query}`, [...byTag.values()].slice(0, limit));
      }
      case "langbai_search_artist_styles": {
        const query = text(args.query, 300);
        const scope = ["all", "quality", "render3d", "medium", "lighting", "color", "texture", "stylization", "style", "copyright"]
          .includes(String(args.scope)) ? args.scope as Parameters<typeof artistStyleCatalog>[0] : "all";
        const result = await artistStyleCatalog(scope, query, 0, Math.trunc(finite(args.limit, 40, 1, 120)));
        return response(true, `画风库检索：${query || "全部"}`, result);
      }
      case "langbai_search_online_gallery": {
        const result = await searchOnlineGallery({
          source: ["danbooru", "safebooru", "gelbooru", "quicktag"].includes(String(args.source)) ? args.source : "danbooru",
          query: text(args.query, 300),
          page: Math.trunc(finite(args.page, 1, 1, 1000)),
          safeOnly: args.safeOnly !== false,
        });
        return response(true, "在线画廊检索", result);
      }
      case "langbai_list_prompt_presets": {
        const settings = getSettings();
        const query = text(args.query, 300).toLocaleLowerCase();
        const kind = ["all", "positive", "style"].includes(String(args.kind)) ? String(args.kind) : "all";
        const limit = Math.trunc(finite(args.limit, 20, 1, 50));
        const positive = (kind === "all" || kind === "positive")
          ? (settings.positivePromptPresets ?? []).map((preset) => ({
              id: preset.id,
              kind: "positive" as const,
              name: preset.name,
              prompt: text(preset.prompt, 20_000),
              promptTruncated: preset.prompt.length > 20_000,
              previewImageCount: preset.previewImages?.length ?? 0,
              createdAt: preset.createdAt,
            }))
          : [];
        const styles = (kind === "all" || kind === "style")
          ? (settings.stylePromptPresets ?? []).map((preset) => ({
              id: preset.id,
              kind: "style" as const,
              name: preset.name,
              group: preset.group,
              prompt: text(preset.prompt, 20_000),
              promptTruncated: preset.prompt.length > 20_000,
              previewImageCount: preset.previewImages?.length ?? 0,
              createdAt: preset.createdAt,
            }))
          : [];
        const matches = [...positive, ...styles].filter((preset) => !query || [
          preset.name,
          "group" in preset ? preset.group : "",
          preset.prompt,
        ].join(" ").toLocaleLowerCase().includes(query));
        return response(true, "提示词预设", {
          total: matches.length,
          items: matches.slice(0, limit),
        });
      }
      case "langbai_list_reference_presets": {
        const library = await listReferencePresets();
        const settings = getSettings();
        const query = text(args.query, 300).toLocaleLowerCase();
        const group = text(args.group, 160);
        const kind = ["all", "vibe", "precise"].includes(String(args.kind)) ? String(args.kind) : "all";
        const limit = Math.trunc(finite(args.limit, 24, 1, 100));
        const matches = library.presets.filter((preset) => {
          if (kind !== "all" && preset.kind !== kind) return false;
          if (group && preset.group !== group) return false;
          if (!query) return true;
          return [
            preset.name,
            preset.group,
            preset.sourceId,
            preset.sourceGameId,
            preset.sourceCategory,
            ...Object.values(preset.sourceNames ?? {}),
            ...Object.values(preset.sourceGameNames ?? {}),
          ].join(" ").toLocaleLowerCase().includes(query);
        });
        const selected = matches.slice(0, limit);
        const images = selected.map(referenceAttachment);
        rememberToolAttachments(images);
        return response(true, "参考图预设", {
          total: matches.length,
          groups: library.groups,
          items: selected.map((preset, index) => ({
            attachmentId: images[index].id,
            presetId: preset.id,
            name: preset.sourceNames?.[settings.language] ?? preset.name,
            originalName: preset.name,
            group: preset.group,
            kind: preset.kind,
            width: preset.width,
            height: preset.height,
            ...(preset.kind === "vibe" ? {
              vibeReference: {
                infoExtracted: preset.infoExtracted,
                strength: preset.strength,
              },
            } : {
              preciseReference: {
                type: preset.preciseType,
                strength: preset.strength,
                fidelity: preset.fidelity,
              },
            }),
            sourceGame: preset.sourceGameNames?.[settings.language] ?? preset.sourceGameId,
            sourceCategory: preset.sourceCategory,
          })),
        }, images);
      }
      case "langbai_read_image_metadata": {
        const attachment = attachmentForRequest(request, args.attachmentId);
        const buffer = fs.readFileSync(attachment.filePath);
        if (buffer.length > 48 * 1024 * 1024) throw new Error("图片超过 48 MB，无法读取内嵌参数。");
        const report = inspectImageMetadata(parseImageMeta(Uint8Array.from(buffer).buffer));
        return response(true, "图片内嵌参数", {
          attachmentId: attachment.id,
          found: report.kind !== "unknown" || Object.keys(report.imported).length > 0 || report.characterCaptions.length > 0,
          kind: report.kind,
          software: report.software,
          parameters: report.imported,
          characterPrompts: report.characterCaptions,
          fields: report.entries.slice(0, 100).map((entry) => ({
            key: entry.key,
            value: text(entry.value, 4_000),
            group: entry.group,
          })),
          fieldsTruncated: report.entries.length > 100,
          warnings: report.warnings,
        });
      }
      case "langbai_generate_image": {
        const { params, extras } = generationInput(request, args);
        const count = Math.trunc(finite(args.count, 1, 1, 8));
        const items: HistoryItem[] = [];
        let lastMessage = "";
        for (let index = 0; index < count; index += 1) {
          const result = await generateImage({ ...params, seedMode: params.seedMode }, extras);
          lastMessage = result.message;
          if (!result.ok) return response(false, "生图失败", result);
          items.push(...result.items);
        }
        const images = items.map(imageAttachment);
        return response(true, "图片生成完成", { message: lastMessage, count: images.length, items }, images);
      }
      case "langbai_redraw_image": {
        const sourcePath = attachmentForRequest(request, args.attachmentId).filePath;
        const { params, extras } = generationInput(request, args);
        const result = await redrawImage({
          imageBase64: readBase64(sourcePath),
          params,
          strength: finite(args.strength, DEFAULT_I2I_PARAMS.strength, 0, 1),
          noise: finite(args.noise, DEFAULT_I2I_PARAMS.noise, 0, 1),
          extras,
          groupName: text(args.groupName, 80) || "Agent 重绘",
          fileNamePrefix: text(args.fileNamePrefix, 80) || "agent-redraw",
        });
        const images = result.items.map(imageAttachment);
        return response(result.ok, result.ok ? "图生图完成" : "图生图失败", result, images);
      }
      case "langbai_inpaint_image": {
        const sourcePath = attachmentForRequest(request, args.attachmentId).filePath;
        const maskPath = attachmentForRequest(request, args.maskAttachmentId).filePath;
        const params = generationInput(request, args).params;
        const result = await serializedWorkbench(async () => {
          const loaded = await loadImageFromPath(sourcePath);
          if (!loaded.ok) throw new Error(loaded.message || "无法加载原图。");
          return inpaintImage(
            params,
            (text(args.inpaintModel) || defaultAgentInpaintModel(params.model)) as NAIInpaintModel,
            readBase64(maskPath),
            finite(args.strength, 1, 0, 1),
            finite(args.noise, 0, 0, 1),
          );
        });
        const images = result.items.map(imageAttachment);
        return response(result.ok, result.ok ? "局部重绘完成" : "局部重绘失败", result, images);
      }
      case "langbai_upscale_image": {
        const sourcePath = attachmentForRequest(request, args.attachmentId).filePath;
        const scale = Number(args.scale) === 2 ? 2 : 4 as UpscaleScale;
        const model = generationInput(request, args).params.model;
        const result = await serializedWorkbench(async () => {
          const loaded = await loadImageFromPath(sourcePath);
          if (!loaded.ok) throw new Error(loaded.message || "无法加载图片。");
          return upscaleImg(scale, model);
        });
        const images = result.item ? [imageAttachment(result.item)] : [];
        return response(result.ok, result.ok ? "超分完成" : "超分失败", result, images);
      }
      case "langbai_director": {
        const sourcePath = attachmentForRequest(request, args.attachmentId).filePath;
        const allowed = new Set<DirectorTool>(["bg-removal", "lineart", "sketch", "colorize", "emotion", "declutter"]);
        const tool = allowed.has(args.tool as DirectorTool) ? args.tool as DirectorTool : "bg-removal";
        const options: AugmentOptions = {
          ...DEFAULT_AUGMENT_OPTIONS,
          defry: finite(args.defry, 0, 0, 5),
          colorizePrompt: text(args.colorizePrompt, 2_000),
          emotion: ["neutral", "happy", "sad", "angry", "surprised", "scared", "disgusted", "amazed"]
            .includes(String(args.emotion)) ? args.emotion as AugmentOptions["emotion"] : "happy",
          emotionLevel: finite(args.emotionLevel, 0, 0, 1),
        };
        const result = await serializedWorkbench(async () => {
          const loaded = await loadImageFromPath(sourcePath);
          if (!loaded.ok) throw new Error(loaded.message || "无法加载图片。");
          return augmentImg(tool, options);
        });
        const images = result.items.map(imageAttachment);
        return response(result.ok, result.ok ? "导演工具完成" : "导演工具失败", result, images);
      }
      case "langbai_reverse_prompt": {
        const result = await reversePromptImage(
          readBase64(attachmentForRequest(request, args.attachmentId).filePath),
          ["tags", "natural", "mixed"].includes(String(args.mode)) ? args.mode as "tags" | "natural" | "mixed" : "tags",
          ["full", "character", "object", "scene"].includes(String(args.scope)) ? String(args.scope) : "full",
          text(args.hint, 1_000),
          bool(args.knownCharacter),
          args.templateVersion === "v4.5" ? "v4.5" : "v5",
        );
        return response(result.ok, result.ok ? "图片反推完成" : "图片反推失败", result);
      }
      case "langbai_convert_prompt": {
        const result = await convertPromptText(
          text(args.text),
          ["tags", "natural", "mixed"].includes(String(args.mode)) ? args.mode as "tags" | "natural" | "mixed" : "tags",
          bool(args.knownCharacter),
          args.templateVersion === "v4.5" ? "v4.5" : "v5",
        );
        return response(result.ok, result.ok ? "提示词转换完成" : "提示词转换失败", result);
      }
        case "langbai_list_history": {
          const groups = getHistoryGroups();
          const items = getHistory(text(args.date, 20) || undefined, text(args.groupId, 100) || undefined)
            .slice(0, Math.trunc(finite(args.limit, 24, 1, 100)));
          return response(true, "生成历史", {
          groups,
          items: items.map((item) => ({
            attachmentId: item.id,
            name: path.basename(item.filePath),
            date: item.date,
            createdAt: item.createdAt,
            seed: item.actualSeed,
            model: item.model,
            width: item.width,
            height: item.height,
            positivePrompt: item.params.positivePrompt,
            stylePrompt: item.params.stylePrompt,
            negativePrompt: item.params.negativePrompt,
            feature: item.feature,
              groupId: item.groupId,
            })),
          }, items.map(imageAttachment));
        }
      case "langbai_save_prompt_preset": {
        const preset = savePromptPreset(args.name, args.prompt);
        return response(true, "提示词预设已保存", preset);
      }
      case "langbai_apply_prompt": {
        const positivePrompt = text(args.positivePrompt);
        if (!positivePrompt) throw new Error("正面提示词不能为空。");
        const negativePrompt = typeof args.negativePrompt === "string" ? args.negativePrompt : undefined;
        const stylePrompt = typeof args.stylePrompt === "string" ? args.stylePrompt : undefined;
        const settings = getSettings();
        const previous = settings.lastGenerationState;
        setSetting("lastGenerationState", {
          params: currentParams({ positivePrompt, negativePrompt, stylePrompt }),
          batchCount: previous?.batchCount ?? 1,
          i2iParams: previous?.i2iParams ?? DEFAULT_I2I_PARAMS,
          inpaintModel: previous?.inpaintModel ?? "nai-diffusion-5-full-inpainting",
          inpaintStrength: previous?.inpaintStrength ?? 1,
          inpaintNoise: previous?.inpaintNoise ?? 0,
          inpaintPositivePrompt: previous?.inpaintPositivePrompt ?? "",
          brushSize: previous?.brushSize ?? 4,
          brushOpacity: previous?.brushOpacity ?? 0.55,
          brushColor: previous?.brushColor ?? "#ffffff",
          brushShape: previous?.brushShape ?? "round",
          brushSizeUnit: "grid8",
          upscaleScale: previous?.upscaleScale ?? 4,
          directorTool: previous?.directorTool ?? "bg-removal",
          augmentOptions: previous?.augmentOptions ?? DEFAULT_AUGMENT_OPTIONS,
        });
        emit({ kind: "apply-prompt", positivePrompt, ...(negativePrompt !== undefined ? { negativePrompt } : {}), ...(stylePrompt !== undefined ? { stylePrompt } : {}) });
        return response(true, "已应用到主生图界面", { positivePrompt, negativePrompt, stylePrompt });
      }
      case "langbai_memory_list": {
        const workspace = readAgentWorkspace();
        return response(true, "Agent 记忆", workspace.memories.filter((item) => item.scope === "global" || item.conversationId === args.conversationId));
      }
      case "langbai_memory_upsert": {
        const result = upsertAgentMemory({
          id: text(args.id, 100) || undefined,
          title: text(args.title, 100) || "记忆",
          content: text(args.content, 20_000),
          scope: args.scope === "conversation" ? "conversation" : "global",
          conversationId: text(args.conversationId, 100) || undefined,
        });
        return response(result.ok, "记忆已保存", result.workspace.memories);
      }
      case "langbai_memory_delete": {
        const result = deleteAgentMemory(text(args.id, 100));
        return response(result.ok, "记忆已删除", result.workspace.memories);
      }
      default:
        return response(false, "未知工具", `不允许的 Agent 工具：${request.tool}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return response(false, `${request.tool} 执行失败`, message);
  }
}
