import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

const constructorOptions: unknown[] = [];

vi.mock("msedge-tts", () => {
  class MockMsEdgeTTS {
    constructor(options?: unknown) {
      constructorOptions.push(options);
    }

    async setMetadata() {
      return undefined;
    }

    async toFile(targetDir: string) {
      fs.mkdirSync(targetDir, { recursive: true });
      const audioFilePath = path.join(targetDir, "mock-edge.mp3");
      fs.writeFileSync(audioFilePath, Buffer.alloc(12_000));
      return { audioFilePath };
    }

    close() {
      return undefined;
    }
  }

  return {
    MsEdgeTTS: MockMsEdgeTTS,
    OUTPUT_FORMAT: { AUDIO_24KHZ_96KBITRATE_MONO_MP3: "audio-24khz-96kbitrate-mono-mp3" },
  };
});

const tempDirs: string[] = [];

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tuiwen-edge-tts-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  constructorOptions.length = 0;
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("Edge TTS provider wiring", () => {
  it("passes the configured proxy agent to msedge-tts without performing a real network request", async () => {
    const { synthesizeTuiwenSpeech } = await import("./tuiwen-audio");
    const agent = { kind: "proxy-agent" } as never;

    const result = await synthesizeTuiwenSpeech(
      {
        projectId: "project",
        projectTitle: "proxy",
        provider: "edge",
        voice: "zh-CN-XiaoxiaoNeural",
        ratePercent: 0,
        volumePercent: 0,
        shots: [{ shotId: "shot-1", index: 1, narration: "proxy smoke" }],
      },
      { outputRoot: tempDir(), agent },
    );

    expect(result.ok).toBe(true);
    expect(constructorOptions).toEqual([{ agent }]);
    expect(result.items[0].audio?.source).toBe("tts");
  });
});
