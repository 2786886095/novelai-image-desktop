import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { TuiwenTtsProvider } from "./tuiwen-audio";
import {
  estimateTuiwenMp3DurationMs,
  parseTuiwenTtsMetadataDurationMs,
  saveTuiwenImportedAudio,
  synthesizeTuiwenSpeech,
} from "./tuiwen-audio";
import { encodeTuiwenPcm16Wav } from "../../src/tuiwen/audio";

const tempDirs: string[] = [];

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tuiwen-audio-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("tuiwen TTS", () => {
  it("parses Edge boundary ticks into milliseconds", () => {
    const dir = tempDir();
    const metadata = path.join(dir, "metadata.json");
    fs.writeFileSync(metadata, JSON.stringify({
      Metadata: [
        { Data: { Offset: 1_000_000, Duration: 8_000_000 } },
        { Data: { Offset: 10_000_000, Duration: 25_000_000 } },
      ],
    }));
    expect(parseTuiwenTtsMetadataDurationMs(metadata)).toBe(3500);
  });

  it("estimates constant-bitrate mp3 duration from file size", () => {
    const dir = tempDir();
    const audio = path.join(dir, "audio.mp3");
    fs.writeFileSync(audio, Buffer.alloc(12_000));
    expect(estimateTuiwenMp3DurationMs(audio, 96)).toBe(1000);
  });

  it("keeps successful shots when another shot fails", async () => {
    const provider: TuiwenTtsProvider = {
      id: "edge",
      async synthesize(shot, options, targetDir) {
        if (shot.index === 2) throw new Error("rate limited");
        const filePath = path.join(targetDir, `${shot.index}.mp3`);
        fs.mkdirSync(targetDir, { recursive: true });
        fs.writeFileSync(filePath, "audio");
        return {
          filePath,
          fileUrl: filePath,
          durationMs: 1800,
          source: "tts",
          ttsVoice: options.voice,
        };
      },
    };
    const result = await synthesizeTuiwenSpeech({
      projectId: "project",
      projectTitle: "测试",
      provider: "edge",
      voice: "zh-CN-XiaoxiaoNeural",
      ratePercent: 0,
      volumePercent: 0,
      shots: [
        { shotId: "a", index: 1, narration: "第一句。" },
        { shotId: "b", index: 2, narration: "第二句。" },
      ],
    }, { outputRoot: tempDir() }, provider);

    expect(result.ok).toBe(false);
    expect(result.items.map((item) => item.ok)).toEqual([true, false]);
    expect(result.message).toContain("1/2");
  });

  it("safely persists a decoded long-audio WAV slice inside the output directory", async () => {
    const outputRoot = tempDir();
    const wavData = encodeTuiwenPcm16Wav([new Float32Array(8_000)], 8_000);
    const result = await saveTuiwenImportedAudio({
      projectId: "project-1",
      projectTitle: "长配音测试",
      shotId: "shot-1",
      index: 1,
      durationMs: 1000,
      sourceName: "narration.mp3",
      wavData,
    }, outputRoot);

    expect(result.ok).toBe(true);
    expect(result.audio?.source).toBe("import");
    expect(result.audio?.durationMs).toBe(1000);
    expect(result.audio?.filePath.startsWith(path.resolve(outputRoot))).toBe(true);
    expect(fs.existsSync(result.audio!.filePath)).toBe(true);
    expect(fs.readFileSync(result.audio!.filePath).toString("ascii", 0, 4)).toBe("RIFF");
  });

  it("rejects non-WAV imported chunks", async () => {
    const result = await saveTuiwenImportedAudio({
      projectId: "project-1",
      projectTitle: "测试",
      shotId: "shot-1",
      index: 1,
      durationMs: 1000,
      sourceName: "bad.bin",
      wavData: new Uint8Array(64).buffer,
    }, tempDir());

    expect(result.ok).toBe(false);
    expect(result.message).toContain("不是有效的 WAV");
  });
});
