// Inpaint-panel / history integration for OpenAI Images edits.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { DEFAULT_PARAMS, type AppSettings, type GenerateResult, type HistoryItem, type OpenAIInpaintRequest } from "../../src/types";
import { normalizeOpenAIImageEditSettings } from "../../src/openai-image-edit";
import { focusedInpaintPlan, type InpaintRegion } from "../../src/focused-inpaint";
import { rgba, runOpenAIImageEdit } from "./openai-image-edit";
import { addHistory, getHistoryGroups, getSettings } from "./store";
import { writeUniqueImageFile } from "./image-output";
import { toLocalMediaUrl } from "./local-media-protocol";
import { beginJob } from "./job-registry";
import { proxyConfigForUrl } from "./proxy";
import { readWorkbenchImage } from "./nai";

export function openAIImageEditConfig(settings: AppSettings) {
  const edit = normalizeOpenAIImageEditSettings(settings.openaiImageEdit);
  const apiKey = settings.openaiImageEditApiKey?.trim() ?? "";
  return { edit, apiKey, configured: Boolean(apiKey && edit.baseUrl && edit.model) };
}

/** Save results like the compatible provider does: outputDir/date[/group], marked as an OpenAI result. */
export async function saveOpenAIEditResults(images: Buffer[], meta: { prompt: string; model: string; request: Record<string, unknown>; settings: AppSettings; groupId?: string; prefix?: string }) {
  const settings = meta.settings;
  if (!settings.outputDir?.trim()) throw Error("missing output directory");
  const groupId = meta.groupId ?? settings.generationGroupId;
  const group = getHistoryGroups().find((entry) => entry.id === groupId);
  const now = new Date();
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  const folder = group?.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/g, "") || group?.id;
  const root = path.resolve(settings.outputDir);
  const dir = path.resolve(root, date, ...(folder ? [folder] : []));
  if (dir !== root && !dir.startsWith(root + path.sep)) throw Error("invalid directory");
  await fs.mkdir(dir, { recursive: true });
  const items: HistoryItem[] = [];
  for (const bytes of images) {
    const metadata = await sharp(bytes).metadata();
    const id = crypto.randomUUID();
    const prefix = (meta.prefix ?? "openai-edit").replace(/[^\p{L}\p{N}._-]/gu, "_").slice(0, 80) || "openai-edit";
    const filePath = await writeUniqueImageFile(dir, `${prefix}-${date}-${id}`, "png", bytes);
    const item: HistoryItem = {
      id, filePath, fileUrl: toLocalMediaUrl(filePath, id), date, createdAt: now.toISOString(), groupId: group?.id,
      params: { ...DEFAULT_PARAMS, positivePrompt: meta.prompt, negativePrompt: "", seed: -1, width: metadata.width!, height: metadata.height! },
      actualSeed: -1, model: meta.model, width: metadata.width!, height: metadata.height!,
      generationProvider: "openai-images", compatibleRequest: meta.request,
    };
    items.push(item);
    addHistory([item]);
  }
  return items;
}

function cropRegion(region: InpaintRegion, width: number, height: number) {
  return focusedInpaintPlan(region, width, height).region;
}

/** Inpaint panel entry point: current workbench image + editor mask. */
export async function openAIInpaintWorkbench(request: OpenAIInpaintRequest): Promise<GenerateResult> {
  const job = beginJob();
  let submitted = false;
  try {
    const settings = structuredClone(getSettings());
    const { edit, apiKey, configured } = openAIImageEditConfig(settings);
    if (!configured) return { ok: false, items: [], message: "请先在 设置 → API 配置 → OpenAI 图像编辑 中填写接口地址、模型和密钥。" };
    if (!request.prompt?.trim()) return { ok: false, items: [], message: "请输入重绘指令。" };
    if (!request.maskBase64) return { ok: false, items: [], message: "请先绘制需要重绘的蒙版区域。" };
    const { buffer } = await readWorkbenchImage();
    const full = await rgba(buffer);
    const maskBuffer = Buffer.from(request.maskBase64.replace(/^data:[^,]+,/, ""), "base64");
    let source = await sharp(full.data, { raw: { width: full.width, height: full.height, channels: 4 } }).png().toBuffer();
    let mask = maskBuffer;
    let region: InpaintRegion | null = null;
    if (request.region) {
      region = cropRegion(request.region, full.width, full.height);
      const maskImage = await rgba(maskBuffer);
      const fullMask = maskImage.width === full.width && maskImage.height === full.height
        ? maskBuffer
        : await sharp(maskImage.data, { raw: { width: maskImage.width, height: maskImage.height, channels: 4 } }).resize(full.width, full.height, { fit: "fill", kernel: "nearest" }).png().toBuffer();
      const box = { left: region.x, top: region.y, width: region.width, height: region.height };
      source = await sharp(source).extract(box).png().toBuffer();
      mask = await sharp(fullMask).extract(box).png().toBuffer();
    }
    const output = await runOpenAIImageEdit({
      source, mask, prompt: request.prompt, settings: { ...edit, ...(request.settingsOverride ?? {}) }, apiKey,
      pasteBack: request.pasteBack ?? true,
    }, {
      signal: job.controller.signal,
      route: (url) => proxyConfigForUrl("ai", url, settings),
    });
    submitted = output.batch.submitted;
    let images = output.images;
    if (region) {
      const base = await sharp(full.data, { raw: { width: full.width, height: full.height, channels: 4 } }).png().toBuffer();
      images = await Promise.all(images.map((patch) => sharp(base).composite([{ input: patch, left: region!.x, top: region!.y }]).png().toBuffer()));
    }
    const items = await saveOpenAIEditResults(images, { prompt: request.prompt, model: String(output.request.model), request: output.request, settings });
    if (!output.batch.complete) {
      return { ok: false, items, message: `${output.batch.cancelled ? "请求已停止。" : output.batch.error?.message ?? "图像编辑未完成。"} 已保存 ${items.length} 张；没有自动重新提交。` };
    }
    return { ok: true, items, message: `OpenAI 图像编辑完成，已保存 ${items.length} 张。费用以服务商记录为准。` };
  } catch (error) {
    const message = error instanceof Error && /[\u4e00-\u9fff]/.test(error.message) ? error.message : "";
    return { ok: false, items: [], message: submitted ? "结果保存未完成，请检查输出目录和历史存储；没有自动重新提交。" : message || "请求未提交，请检查 OpenAI 图像编辑配置、蒙版与图片。" };
  } finally {
    job.end();
  }
}
