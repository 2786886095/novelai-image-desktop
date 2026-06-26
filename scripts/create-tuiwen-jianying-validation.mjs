import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const require = createRequire(import.meta.url);
const {
  detectJianYingDraftRoot,
  exportTuiwenJianYingDraft,
} = require(path.join(root, "dist-electron", "electron", "ipc", "tuiwen-jianying.js"));

function writeToneWav(filePath, seconds = 2, frequency = 440, sampleRate = 24_000) {
  const frameCount = Math.round(seconds * sampleRate);
  const dataBytes = frameCount * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const envelope = Math.min(1, frame / 800, (frameCount - frame) / 800);
    const sample = Math.sin((frame / sampleRate) * Math.PI * 2 * frequency) * 0.12 * envelope;
    buffer.writeInt16LE(Math.round(sample * 0x7fff), 44 + frame * 2);
  }
  fs.writeFileSync(filePath, buffer);
}

function shot(index, imagePath, audioPath, preset, transition) {
  const durationMs = 2_000;
  return {
    id: `gold-shot-${index}`,
    index,
    narration: `金标准验证第 ${index} 镜。`,
    cnPrompt: `验证画面 ${index}`,
    contextSummary: `验证画面 ${index}`,
    enPrompt: "masterpiece, best quality, anime illustration",
    localNegativePrompt: "",
    negativeMode: "append",
    paramsOverride: { enabled: false, params: {} },
    status: "done",
    outputPath: imagePath,
    durationMs,
    audio: {
      filePath: audioPath,
      fileUrl: audioPath,
      durationMs,
      source: "import",
    },
    subtitle: {
      text: `金标准验证第 ${index} 镜`,
      enabled: true,
      style: { fontSize: 44, color: "#ffffff", strokeColor: "#111827", position: "bottom" },
    },
    keyframe: {
      preset,
      keys: [
        { timeRatio: 0, scale: 1.04, x: -0.02, y: 0, alpha: 1, rotation: 0 },
        { timeRatio: 1, scale: 1.14, x: 0.02, y: -0.01, alpha: 1, rotation: 0 },
      ],
    },
    transition: { preset: transition, durationMs: 350 },
  };
}

const outDir = path.resolve(process.argv[2] || detectJianYingDraftRoot() || "");
if (!outDir || !fs.existsSync(outDir)) {
  throw new Error(`剪映草稿目录不存在：${outDir || "(未检测到)"}`);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "langbai-tuiwen-golden-"));
const imagePath = path.join(root, "build", "icon.png");
const voicePath = path.join(tempDir, "voice.wav");
const bgmPath = path.join(tempDir, "bgm.wav");
writeToneWav(voicePath, 2, 523.25);
writeToneWav(bgmPath, 8, 261.63);

const project = {
  id: "tuiwen-jianying-golden-sample",
  title: "Langbai 小说推文 3镜金标准验证",
  rawScript: "剪映 10.9 导入验证",
  mode: "tags",
  desiredPanelCount: 3,
  globalPrompt: "",
  globalCharacterSetting: "",
  continuityBible: "",
  globalStylePrompt: "",
  globalNegativePrompt: "",
  adultBranch: false,
  inheritPreviousFrame: false,
  references: [],
  panels: [
    shot(1, imagePath, voicePath, "zoomIn", "fade"),
    shot(2, imagePath, voicePath, "panLeft", "slideLeft"),
    shot(3, imagePath, voicePath, "zoomOut", "wipe"),
  ],
  globalParams: {
    model: "nai-diffusion-4-5-full",
    width: 832,
    height: 1216,
    steps: 28,
  },
  source: { type: "subtitle", fileName: "golden.srt", subtitleFormat: "srt" },
  exportSettings: {
    aspectRatio: "9:16",
    width: 1080,
    height: 1920,
    fps: 30,
    defaultShotDurationMs: 2_000,
    subtitleDefault: { fontSize: 44, color: "#ffffff", strokeColor: "#111827", position: "bottom" },
    bgm: { filePath: bgmPath, volume: 0.18, loop: false, fadeMs: 500 },
    intro: { text: "Langbai 金标准片头", durationMs: 1_000 },
    outro: { text: "Langbai 金标准片尾", durationMs: 1_000 },
    jianyingDraftDir: outDir,
  },
  preflight: {
    preciseReferenceVerified: false,
    jianyingGoldenSampleReady: false,
    jianyingMediaBundleVerified: true,
    desktopOnlyAcknowledged: true,
  },
};

try {
  const result = exportTuiwenJianYingDraft(project, outDir);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
