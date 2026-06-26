import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Agent } from "http";
import { pathToFileURL } from "url";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import type {
  TuiwenAudio,
  TuiwenSaveImportedAudioRequest,
  TuiwenSaveImportedAudioResult,
  TuiwenTtsItemResult,
  TuiwenTtsProviderId,
  TuiwenTtsProviderInfo,
  TuiwenTtsRequest,
  TuiwenTtsResult,
  TuiwenTtsVoice,
} from "../../src/types";
import { analyzeTuiwenNarrationPacing, estimateTuiwenNarrationDurationMs } from "../../src/tuiwen/audio";

export const TUIWEN_TTS_VOICES: TuiwenTtsVoice[] = [
  { id: "zh-CN-XiaoxiaoNeural", label: "晓晓 · 自然女声", locale: "zh-CN", gender: "female" },
  { id: "zh-CN-XiaoyiNeural", label: "晓伊 · 活泼女声", locale: "zh-CN", gender: "female" },
  { id: "zh-CN-YunxiNeural", label: "云希 · 青年男声", locale: "zh-CN", gender: "male" },
  { id: "zh-CN-YunjianNeural", label: "云健 · 沉稳男声", locale: "zh-CN", gender: "male" },
  { id: "zh-CN-YunyangNeural", label: "云扬 · 新闻男声", locale: "zh-CN", gender: "male" },
];

const TUIWEN_TTS_PROVIDERS: TuiwenTtsProviderInfo[] = [
  {
    id: "edge",
    label: "Edge 在线朗读（免密钥）",
    available: true,
    requiresApiKey: false,
    description: "使用非官方 Edge Read Aloud 端点；可能限流或变更，失败时请重试或导入配音。",
  },
  {
    id: "cloud",
    label: "商业云 TTS（预留）",
    available: false,
    requiresApiKey: true,
    description: "Provider 插槽已预留，后续可接入有 SLA 的商业语音服务。",
  },
];

interface ProviderShot {
  shotId: string;
  index: number;
  narration: string;
}

interface ProviderOptions {
  voice: string;
  ratePercent: number;
  volumePercent: number;
}

export interface TuiwenTtsProvider {
  id: TuiwenTtsProviderId;
  synthesize(shot: ProviderShot, options: ProviderOptions, targetDir: string): Promise<TuiwenAudio>;
}

export interface TuiwenTtsContext {
  outputRoot: string;
  agent?: Agent;
}

const MAX_IMPORTED_AUDIO_CHUNK_BYTES = 32 * 1024 * 1024;

function safeName(input: string, fallback: string) {
  const cleaned = input
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 72);
  return cleaned || fallback;
}

function escapeXml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function relativePercent(value: number) {
  const normalized = Math.round(value);
  return `${normalized >= 0 ? "+" : ""}${normalized}%`;
}

function assertVoice(value: string) {
  if (!/^[A-Za-z0-9-]{3,80}$/.test(value)) throw new Error("TTS 音色名称不合法。");
  return value;
}

function importedAudioBuffer(data: ArrayBuffer) {
  const buffer = Buffer.from(data);
  if (buffer.length < 44 || buffer.length > MAX_IMPORTED_AUDIO_CHUNK_BYTES) {
    throw new Error(`音频切片大小无效（需小于 ${MAX_IMPORTED_AUDIO_CHUNK_BYTES / 1024 / 1024}MB）。`);
  }
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("音频切片不是有效的 WAV 文件。");
  }
  return buffer;
}

export async function saveTuiwenImportedAudio(
  request: TuiwenSaveImportedAudioRequest,
  outputRoot: string,
): Promise<TuiwenSaveImportedAudioResult> {
  try {
    const durationMs = Math.round(Number(request.durationMs));
    const index = Math.round(Number(request.index));
    if (!request.projectId?.trim() || !request.shotId?.trim()) throw new Error("项目或分镜 ID 为空。");
    if (!Number.isFinite(index) || index < 1) throw new Error("分镜序号无效。");
    if (!Number.isFinite(durationMs) || durationMs < 1 || durationMs > 60 * 60 * 1000) {
      throw new Error("音频切片时长无效。");
    }
    const buffer = importedAudioBuffer(request.wavData);
    const projectDir = path.join(
      path.resolve(outputRoot),
      "Tuiwen Audio",
      `${safeName(request.projectTitle, "novel-tuiwen")}-${safeName(request.projectId, "project").slice(0, 16)}`,
      "imported",
    );
    await fs.promises.mkdir(projectDir, { recursive: true });
    const baseName = `shot-${String(index).padStart(3, "0")}-${safeName(request.shotId, "shot").slice(0, 24)}`;
    const filePath = path.join(projectDir, `${baseName}.wav`);
    const tempPath = path.join(projectDir, `.${baseName}-${randomUUID()}.tmp`);
    await fs.promises.writeFile(tempPath, buffer);
    await fs.promises.rm(filePath, { force: true });
    await fs.promises.rename(tempPath, filePath);
    return {
      ok: true,
      message: `已保存 #${index} 音频切片（${request.sourceName || "长音频"}）。`,
      audio: {
        filePath,
        fileUrl: pathToFileURL(filePath).toString(),
        durationMs,
        source: "import",
      },
    };
  } catch (error) {
    return {
      ok: false,
      message: `保存音频切片失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function parseTuiwenTtsMetadataDurationMs(filePath: string | null | undefined) {
  if (!filePath || !fs.existsSync(filePath)) return 0;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
      Metadata?: Array<{ Data?: { Offset?: number; Duration?: number } }>;
    };
    const ticks = (parsed.Metadata ?? []).reduce((max, item) => {
      const offset = Number(item.Data?.Offset ?? 0);
      const duration = Number(item.Data?.Duration ?? 0);
      return Math.max(max, offset + duration);
    }, 0);
    return ticks > 0 ? Math.max(500, Math.round(ticks / 10_000)) : 0;
  } catch {
    return 0;
  }
}

export function estimateTuiwenMp3DurationMs(filePath: string, bitrateKbps = 96) {
  try {
    const bytes = fs.statSync(filePath).size;
    if (bytes <= 0 || bitrateKbps <= 0) return 0;
    return Math.max(500, Math.round((bytes * 8) / bitrateKbps));
  } catch {
    return 0;
  }
}

class EdgeTtsProvider implements TuiwenTtsProvider {
  readonly id = "edge" as const;

  constructor(private readonly agent?: Agent) {}

  async synthesize(shot: ProviderShot, options: ProviderOptions, targetDir: string): Promise<TuiwenAudio> {
    const narration = shot.narration.trim();
    if (!narration) throw new Error("旁白为空。");
    if (narration.length > 1_500) throw new Error("单镜旁白超过 1500 字，请先拆分镜头。");

    fs.mkdirSync(targetDir, { recursive: true });
    const tempDir = path.join(targetDir, `.edge-${safeName(shot.shotId, "shot")}-${randomUUID()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const client = new MsEdgeTTS(this.agent ? { agent: this.agent } : undefined);
    let timeout: NodeJS.Timeout | undefined;

    try {
      // Do not enable sentence/word metadata here. msedge-tts 2.0.6 contains an
      // uncaught unlinkSync path when Edge returns audio without metadata, which
      // can terminate the Electron main process. The selected MP3 format is CBR,
      // so file size gives a safe duration estimate without touching that path.
      await client.setMetadata(assertVoice(options.voice), OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      const synthesis = client.toFile(tempDir, escapeXml(narration), {
        rate: relativePercent(Math.max(-50, Math.min(100, options.ratePercent))),
        volume: relativePercent(Math.max(-100, Math.min(100, options.volumePercent))),
      });
      const generated = await Promise.race([
        synthesis,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error("Edge TTS 请求超时（60 秒）。")), 60_000);
        }),
      ]);
      const extension = path.extname(generated.audioFilePath) || ".mp3";
      const finalPath = path.join(
        targetDir,
        `shot-${String(shot.index).padStart(3, "0")}-${safeName(shot.shotId, "shot").slice(0, 24)}${extension}`,
      );
      fs.rmSync(finalPath, { force: true });
      fs.renameSync(generated.audioFilePath, finalPath);
      const durationMs =
        estimateTuiwenMp3DurationMs(finalPath)
        || estimateTuiwenNarrationDurationMs(narration, options.ratePercent);
      return {
        filePath: finalPath,
        fileUrl: pathToFileURL(finalPath).toString(),
        durationMs,
        source: "tts",
        ttsVoice: options.voice,
      };
    } finally {
      if (timeout) clearTimeout(timeout);
      client.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

export function getTuiwenTtsCatalog() {
  return {
    providers: TUIWEN_TTS_PROVIDERS.map((provider) => ({ ...provider })),
    voices: TUIWEN_TTS_VOICES.map((voice) => ({ ...voice })),
  };
}

export async function synthesizeTuiwenSpeech(
  request: TuiwenTtsRequest,
  context: TuiwenTtsContext,
  providerOverride?: TuiwenTtsProvider,
): Promise<TuiwenTtsResult> {
  const shots = Array.isArray(request.shots) ? request.shots : [];
  if (!shots.length) {
    return { ok: false, provider: request.provider, message: "没有可合成的旁白镜头。", items: [] };
  }

  if (request.provider !== "edge" && !providerOverride) {
    return {
      ok: false,
      provider: request.provider,
      message: "该云 TTS Provider 尚未配置，请使用 Edge TTS 或导入配音。",
      items: shots.map((shot) => ({ shotId: shot.shotId, index: shot.index, ok: false, error: "Provider 不可用。" })),
    };
  }

  const projectDir = path.join(
    path.resolve(context.outputRoot),
    "Tuiwen Audio",
    `${safeName(request.projectTitle, "novel-tuiwen")}-${safeName(request.projectId, "project").slice(0, 16)}`,
  );
  fs.mkdirSync(projectDir, { recursive: true });
  const provider = providerOverride ?? new EdgeTtsProvider(context.agent);
  const items: TuiwenTtsItemResult[] = [];
  const warnings: string[] = [];

  for (const shot of shots) {
    const pacing = analyzeTuiwenNarrationPacing(shot.narration, request.ratePercent);
    const warning = pacing.tooLong
      ? `#${shot.index} 预计朗读 ${(pacing.estimatedDurationMs / 1000).toFixed(1)} 秒，建议拆成 ${pacing.suggestedShotCount} 镜。`
      : undefined;
    if (warning) warnings.push(warning);
    try {
      const audio = await provider.synthesize(shot, {
        voice: request.voice,
        ratePercent: request.ratePercent,
        volumePercent: request.volumePercent,
      }, projectDir);
      items.push({ shotId: shot.shotId, index: shot.index, ok: true, audio, warning });
    } catch (error) {
      items.push({
        shotId: shot.shotId,
        index: shot.index,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        warning,
      });
    }
  }

  const succeeded = items.filter((item) => item.ok).length;
  const failed = items.length - succeeded;
  return {
    ok: failed === 0,
    provider: request.provider,
    message:
      failed === 0
        ? `已完成 ${succeeded} 镜配音。`
        : `配音完成 ${succeeded}/${items.length} 镜；${failed} 镜失败，可单镜重试或导入音频。`,
    items,
    warnings,
  };
}
