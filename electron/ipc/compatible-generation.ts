import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { DEFAULT_PARAMS, type CompatibleGenerationRequest, type CompatibleImageSettings, type GenerateResult, type HistoryItem } from "../../src/types";
import { buildCompatibleImageRequest, imageGenerationEndpoint } from "../../src/image-provider-contract";
import { addHistory, getHistoryGroups, getSettings, setCompatibleImageSettings, setSetting } from "./store";
import { generateCompatibleImages } from "./openai-images";
import { writeUniqueImageFile } from "./image-output";
import { toLocalMediaUrl } from "./local-media-protocol";
import { beginJob } from "./job-registry";
import { proxyConfigForUrl } from "./proxy";
import { assertAgentImageProvider, type ImageProviderBinding } from './agent-image-provider';

export function saveCompatibleImageSettings(config: CompatibleImageSettings, apiKey: string, provider: "novelai" | "openai-images", expectedRevision?: string) {
  if (expectedRevision !== undefined && expectedRevision !== getSettings().imageServiceRevision) return staleImageSettings();
  try {
    if (!["novelai", "openai-images"].includes(provider)) throw Error();
    if (typeof apiKey !== "string" || /[\r\n]/.test(apiKey)) throw Error();
    // Validate even while inactive: this is an explicit config save, not a connectivity test.
    imageGenerationEndpoint(config.baseUrl);
    buildCompatibleImageRequest(config, { prompt: "configuration validation", size: config.size, n: 1, extensions: config.extensions });
    if (provider === "openai-images" && !apiKey.trim()) throw Error();
    const clean: CompatibleImageSettings = {
      baseUrl: config.baseUrl.trim(), model: config.model.trim(), size: config.size,
      responseFormat: config.responseFormat || "auto", extensions: structuredClone(config.extensions ?? {}),
    };
    setCompatibleImageSettings(clean, apiKey.trim(), provider);
    return { ok: true, revision: getSettings().imageServiceRevision, message: "图片服务配置已保存；尚未发送生成请求。" };
  } catch {
    return { ok: false, message: "配置未保存，请检查 HTTPS 地址、模型、密钥、尺寸、返回格式及扩展参数，或检查本机密钥存储是否可用。" };
  }
}

function staleImageSettings() {
  return { ok: false, code: 'stale' as const, message: '图片服务配置已变化，请重新读取后再保存。' };
}
/** Switching off also works when the compatible endpoint is malformed or its key is missing. */
export function switchCompatibleImageProvider(provider: 'novelai', expectedRevision: string) {
  if (!expectedRevision || expectedRevision !== getSettings().imageServiceRevision) return staleImageSettings();
  if (provider !== 'novelai') return { ok: false, message: '请通过保存配置启用兼容服务。' };
  try {
    setSetting('imageProvider', 'novelai');
    return { ok: true, revision: getSettings().imageServiceRevision, message: '已切回 NovelAI；兼容配置保留。' };
  } catch { return { ok: false, message: '切换未保存，请重试。' }; }
}

/** Ordinary T2I only: no native token/account calls and no fallback to NovelAI. */
export async function generateConfiguredImages(request: CompatibleGenerationRequest, options: { signal?: AbortSignal; expectedProvider?: ImageProviderBinding; size?: string; beforeSubmit?: () => void | Promise<void> } = {}): Promise<GenerateResult> {
  const items: HistoryItem[] = [];
  const job = beginJob();
  const abort = () => job.controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  let submitted = false;
  try {
    // Bind config, proxy, output directory and destination before the first await.
    const settings = structuredClone(getSettings());
    if (request.expectedImageServiceRevision !== undefined && request.expectedImageServiceRevision !== settings.imageServiceRevision) {
      return { ok: false, items, message: '图片服务配置已变化，本次未提交生图；请重新读取当前服务后发起新任务。' };
    }
    try { assertAgentImageProvider(settings, options.expectedProvider); }
    catch { return { ok: false, items, message: '图片服务配置已变化，本次未提交生图；请重新读取当前服务后发起新任务。' }; }
    if (job.controller.signal.aborted) return { ok: false, items, message: '请求已停止，未提交生图。' };
    if (!settings.outputDir?.trim()) throw Error("missing output directory");
    if (settings.imageProvider !== "openai-images" || !settings.compatibleImage) {
      return { ok: false, items, message: "请先在设置中选择并保存兼容图片服务。" };
    }
    const config = { ...settings.compatibleImage, apiKey: settings.imageApiKey ?? "" };
    const input = { prompt: request.prompt, n: request.n, size: options.size ?? config.size, extensions: config.extensions };
    const body = buildCompatibleImageRequest(config, input);
    const groupId = request.historyGroupId ?? settings.generationGroupId;
    const group = getHistoryGroups().find((entry) => entry.id === groupId);
    if (groupId && groupId !== "__ungrouped" && !group) {
      return { ok: false, items, message: "保存分组已不存在，请重新选择后生成。" };
    }
    const now = new Date();
    const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
    const folder = group?.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/g, "") || group?.id;
    const dir = path.resolve(settings.outputDir, date, ...(folder ? [folder] : []));
    const root = path.resolve(settings.outputDir);
    if (!dir.startsWith(root + path.sep)) throw Error("invalid directory");
    await fs.mkdir(dir, { recursive: true });
    await fs.access(dir, fs.constants.W_OK);
    const batch = await generateCompatibleImages(config, input, {
      signal: job.controller.signal,
      beforeSubmit: async () => {
        assertAgentImageProvider(getSettings(), options.expectedProvider);
        await options.beforeSubmit?.();
      },
      route: (url) => proxyConfigForUrl("ai", url, settings),
    });
    submitted = batch.submitted;
    // Persist accepted partial outputs, including outputs preceding a cancellation.
    for (const bytes of batch.images) {
      const metadata = await sharp(bytes).metadata();
      const id = crypto.randomUUID();
      const prefix = (request.fileNamePrefix ?? "compatible").replace(/[^\p{L}\p{N}._-]/gu, "_").slice(0, 80) || "compatible";
      const filePath = await writeUniqueImageFile(dir, `${prefix}-${date}-${id}`, "png", bytes);
      const item: HistoryItem = {
        id, filePath, fileUrl: toLocalMediaUrl(filePath, id), date, createdAt: now.toISOString(), groupId: group?.id,
        params: { ...DEFAULT_PARAMS, positivePrompt: input.prompt, negativePrompt: "", seed: -1 },
        actualSeed: -1, model: config.model, width: metadata.width!, height: metadata.height!,
        generationProvider: "openai-images", compatibleRequest: body,
      };
      // Keep the durable file visible in the result even if history persistence fails.
      items.push(item);
      addHistory([item]);
    }
    return {
      ok: batch.complete, items,
      message: batch.complete
        ? `兼容图片服务生成完成，已保存 ${items.length} 张。费用请以服务商记录为准。`
        : `${batch.cancelled ? "请求已停止。" : batch.error?.message ?? "生成未完成。"} 已保存 ${items.length} 张；没有自动重发生成请求。`,
    };
  } catch {
    return { ok: false, items, message: submitted
      ? `结果保存未全部完成，已落盘 ${items.length} 张；请检查输出目录和历史存储。没有自动重新生成。`
      : "请求未提交，请检查图片服务配置、参数与保存目录。" };
  } finally { options.signal?.removeEventListener('abort', abort); job.end(); }
}
