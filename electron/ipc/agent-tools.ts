// Tool executor behind the local MCP server (mcp-server.ts).
import {retainedPrompts} from "../../src/retained-prompts.js";
import { agentImageProviderState, assertAgentImageProvider, assertAgentImageTool, bindAgentImageProvider, compatibleAgentInput, PAID_IMAGE_TOOLS } from './agent-image-provider';
import fs from "node:fs";
import path from "node:path";
import type {
  AgentAttachment,
  AgentToolBridgeRequest,
  AgentToolBridgeResponse,
} from "../../src/agent/types";
import type {
  AugmentOptions,
  DirectorTool,
  GenerateExtras,
  HistoryItem,
  UpscaleScale,
} from "../../src/types";
import { inspectImageMetadata } from "../../src/png-meta";
import { readNativeImageMetadata } from "../image-metadata";
import {
  applyAgentPromptLocks,
  buildAgentGenerationInput,
  buildAgentInpaintInput,
  resolveAgentPromptLocks,
  type AgentGenerationInput,
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
  generateImage,
  inpaintImage,
  loadImageFromPath,
  redrawImage,
  upscaleImg,
} from "./nai";
import { searchDanbooru, searchDanbooruConcepts } from "./danbooru-tags";
import { getHistory, getHistoryGroups, getSettings } from "./store";
import { MCP_ATTACHMENT_PREFIX, mcpAttachment } from "./mcp-attachments";

let workbenchChain: Promise<unknown> = Promise.resolve();

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

/** Exported for the MCP server so quotes use exactly the executed input. */
export function agentGenerationInput(request: AgentToolBridgeRequest, args: Record<string, unknown>) {
  return generationInput(request, args);
}

/** The MCP quote and the executor share the operation-specific input. */
export function agentInpaintInput(request: AgentToolBridgeRequest, args: Record<string, unknown>) {
  return buildRequestInput(request, args, buildAgentInpaintInput);
}

function generationInput(request: AgentToolBridgeRequest, args: Record<string, unknown>) {
  return buildRequestInput(request, args, buildAgentGenerationInput);
}

function buildRequestInput<T extends AgentGenerationInput>(
  request: AgentToolBridgeRequest,
  args: Record<string, unknown>,
  build: (...args: Parameters<typeof buildAgentGenerationInput>) => T,
): T {
  const settings = getSettings();
  const result = build(
    args,
    {
      params: settings.lastGenerationState?.params ?? DEFAULT_PARAMS,
      extras: defaultExtras(),
      modelMode: settings.modelMode,
      historyGroupId: settings.generationGroupId || undefined,
    },
    (attachmentId) => {
      const attachment = attachmentForRequest(attachmentId);
      if (attachment.kind !== "image" && !attachment.mime.startsWith("image/")) {
        throw new Error(`attachmentId=${attachmentId} 不是图片附件。`);
      }
      return readBase64(attachment.filePath);
    },
  );
  result.params = applyAgentPromptLocks(result.params, resolveAgentPromptLocks(retainedPrompts(settings), request.promptLocks));
  return result;
}

function readBase64(filePath: string) {
  const resolved = path.resolve(filePath);
  const stat = fs.statSync(resolved);
  if (!stat.isFile() || stat.size > 48 * 1024 * 1024) throw new Error("附件不存在或超过 48 MB。" );
  return fs.readFileSync(resolved).toString("base64");
}

function attachmentForRequest(value: unknown): AgentAttachment {
  const attachmentId = text(value, 200);
  if (!attachmentId) throw new Error("缺少 attachmentId。请先使用历史记录或已导入图片的附件 ID。");
  const history = getHistory().find((item) => item.id === attachmentId);
  // Images imported through the local MCP server.
  const mcp = attachmentId.startsWith(MCP_ATTACHMENT_PREFIX) ? mcpAttachment(attachmentId) : undefined;
  const attachment = (history ? imageAttachment(history) : undefined) ?? mcp;
  if (!attachment || attachment.unavailable || !attachment.filePath || !fs.existsSync(attachment.filePath)) {
    throw new Error(`找不到 attachmentId=${attachmentId} 对应的本机文件。`);
  }
  return attachment;
}

export async function executeAgentTool(
  request: AgentToolBridgeRequest,
): Promise<AgentToolBridgeResponse> {
  const args = record(request.args);
  try {
    if (PAID_IMAGE_TOOLS.has(request.tool)) {
      request = { ...request, imageProviderBinding: request.imageProviderBinding ?? bindAgentImageProvider(getSettings()) };
      assertAgentImageProvider(getSettings(), request.imageProviderBinding);
      assertAgentImageTool(request.tool, getSettings());
    }
    switch (request.tool) {
      case "langbai_get_generation_state": {
        const settings = getSettings();
        const params = settings.lastGenerationState?.params ?? DEFAULT_PARAMS;
        return response(true, "当前生图状态", {
          params,
          modelMode: settings.modelMode,
          generationGroupId: settings.generationGroupId,
          lockedStylePrompt: retainedPrompts(settings).stylePrompt,
          lockedNegativePrompt: retainedPrompts(settings).negativePrompt,
          streamPreviewEnabled: settings.streamPreviewEnabled,
          referenceCapabilities: {
            maxCharacterPrompts: maxNAICharacterPrompts(params.model),
            vibeTransfer: supportsNAIVibeTransfer(params.model),
            preciseReference: supportsNAIPreciseReference(params.model),
            attachmentIdsRequiredForAgentReferences: true,
          },
          ...agentImageProviderState(settings),
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
      case "langbai_read_image_metadata": {
        const attachment = attachmentForRequest(args.attachmentId);
        const buffer = fs.readFileSync(attachment.filePath);
        if (buffer.length > 48 * 1024 * 1024) throw new Error("图片超过 48 MB，无法读取内嵌参数。");
        const report = inspectImageMetadata(await readNativeImageMetadata(buffer));
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
        if (getSettings().imageProvider === 'openai-images') {
          const input = compatibleAgentInput(args, getSettings());
          const { generateConfiguredImages } = await import('./compatible-generation.js');
          // The host-only binding is rechecked after module loading and before
          // the backend captures settings. No native fallback on any failure.
          const result = await generateConfiguredImages(input, { signal: request.signal, expectedProvider: request.imageProviderBinding });
          return response(result.ok, result.ok ? '图片生成完成' : '生图未全部完成', { ...result, imageProvider: 'openai-images', retryable: false }, result.items.map(imageAttachment));
        }
        const { params, extras } = generationInput(request, args);
        const count = Math.trunc(finite(args.count, 1, 1, 8));
        const items: HistoryItem[] = [];
        let lastMessage = "";
        for (let index = 0; index < count; index += 1) {
          try {
            request.signal?.throwIfAborted();
            const result = await generateImage({ ...params, seedMode: params.seedMode }, extras);
            lastMessage = result.message;
            items.push(...result.items);
            if (!result.ok) return response(false, "生图失败", { ...result, items }, items.map(imageAttachment));
            if (!result.items.length) return response(false, "生图失败", {
              message: "未收到图片，请重试生成。", items,
            }, items.map(imageAttachment));
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return response(false, "生图失败", { message, items }, items.map(imageAttachment));
          }
        }
        const images = items.map(imageAttachment);
        return response(true, "图片生成完成", { message: lastMessage, count: images.length, items }, images);
      }
      case "langbai_redraw_image": {
        const sourcePath = attachmentForRequest(args.attachmentId).filePath;
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
        const sourcePath = attachmentForRequest(args.attachmentId).filePath;
        const maskPath = attachmentForRequest(args.maskAttachmentId).filePath;
        const { params, extras, inpaintModel } = agentInpaintInput(request, args);
        const result = await serializedWorkbench(async () => {
          const loaded = await loadImageFromPath(sourcePath);
          if (!loaded.ok) throw new Error(loaded.message || "无法加载原图。");
          return inpaintImage(
            params,
            inpaintModel,
            readBase64(maskPath),
            finite(args.strength, 1, 0, 1),
            finite(args.noise, 0, 0, 1),
            undefined,
            extras,
          );
        });
        const images = result.items.map(imageAttachment);
        return response(result.ok, result.ok ? "局部重绘完成" : "局部重绘失败", result, images);
      }
      case "langbai_upscale_image": {
        const sourcePath = attachmentForRequest(args.attachmentId).filePath;
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
        const sourcePath = attachmentForRequest(args.attachmentId).filePath;
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
      default:
        return response(false, "未知工具", `不允许的 Agent 工具：${request.tool}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return response(false, `${request.tool} 执行失败`, message);
  }
}
