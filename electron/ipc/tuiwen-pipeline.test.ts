import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, type ComicReferenceAsset, type HistoryItem } from "../../src/types";
import { encodeTuiwenPcm16Wav } from "../../src/tuiwen/audio";
import {
  applyTuiwenGenerationResultToShot,
  buildTuiwenQuoteGroups,
  getTuiwenPendingGenerationShots,
} from "../../src/tuiwen/generation";
import { buildTuiwenLocalPrompt } from "../../src/tuiwen/prompt-fallback";
import { createDefaultTuiwenProject } from "../../src/tuiwen/project";
import { importTuiwenFile } from "./tuiwen-import";
import { saveTuiwenImportedAudio } from "./tuiwen-audio";
import { exportTuiwenJianYingDraft, validateTuiwenJianYingDraft } from "./tuiwen-jianying";

const createdDirs: string[] = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tuiwen-pipeline-"));
  createdDirs.push(dir);
  return dir;
}

function writeFile(dir: string, name: string, content: string | Buffer) {
  const filePath = path.join(dir, name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

function makeReference(id: string, kind: ComicReferenceAsset["kind"]): ComicReferenceAsset {
  return {
    id,
    name: id,
    kind,
    base64: "reference-image",
    previewUrl: "",
    reversePrompt: "white hair, blue dress, consistent heroine",
    infoExtracted: 0.7,
    strength: 0.5,
    useForGeneration: true,
  };
}

function makeHistoryItem(shotId: string, index: number, filePath: string): HistoryItem {
  return {
    id: `history-${shotId}`,
    filePath,
    fileUrl: filePath,
    date: "2026-06-26",
    createdAt: "2026-06-26T00:00:00.000Z",
    groupId: "tuiwen-pipeline",
    params: DEFAULT_PARAMS,
    actualSeed: 1000 + index,
    model: DEFAULT_PARAMS.model,
    width: DEFAULT_PARAMS.width,
    height: DEFAULT_PARAMS.height,
    comicProjectId: "pipeline-project",
    comicPanelNo: index,
  };
}

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("tuiwen offline pipeline skeleton", () => {
  it("imports subtitles, falls back to local prompts, carries references, records generation/audio, and exports a valid Jianying draft", async () => {
    const temp = makeTempDir();
    const sourcePath = writeFile(
      temp,
      "story.srt",
      `1
00:00:00,000 --> 00:00:02,000
Heroine opens the moonlit door.

2
00:00:02,000 --> 00:00:05,000
She walks into the corridor with a calm smile.
`,
    );

    const imported = importTuiwenFile({ filePath: sourcePath, defaultShotDurationMs: 2400 });
    expect(imported.ok).toBe(true);
    expect(imported.source).toMatchObject({ type: "subtitle", subtitleFormat: "srt" });
    expect(imported.shots?.map((shot) => shot.durationMs)).toEqual([2000, 3000]);

    const project = createDefaultTuiwenProject(DEFAULT_PARAMS);
    project.id = "pipeline-project";
    project.title = "Pipeline Golden";
    project.source = imported.source!;
    project.rawScript = imported.rawScript ?? "";
    project.globalStylePrompt = "cinematic moonlight, elegant blue and white outfit";
    project.globalCharacterSetting = "white hair heroine, blue dress, red eyes";
    project.exportSettings.intro = { text: "Intro card", durationMs: 600 };
    project.exportSettings.outro = { text: "Outro card", durationMs: 700 };
    project.references = [makeReference("hero-precise", "precise"), makeReference("night-vibe", "vibe")];
    project.panels = imported.shots!.map((shot, index) => ({
      ...shot,
      cnPrompt: `${shot.narration} full body cinematic scene`,
      keyframe: {
        preset: index === 0 ? "zoomIn" : "panLeft",
        keys: [
          { timeRatio: 0, scale: 1.05, x: 0, y: 0, alpha: 1, rotation: 0 },
          { timeRatio: 1, scale: 1.14, x: index === 0 ? 0 : 0.03, y: 0, alpha: 1, rotation: 0 },
        ],
      },
      transition: { preset: index === 0 ? "fade" : "slideLeft", durationMs: 250 },
    }));

    project.panels = project.panels.map((shot) => ({
      ...shot,
      enPrompt: buildTuiwenLocalPrompt(
        {
          mode: project.mode,
          globalStylePrompt: project.globalStylePrompt,
          globalCharacterSetting: project.globalCharacterSetting,
          referencePrompts: project.references.map((ref) => ref.reversePrompt),
        },
        { cnPrompt: shot.cnPrompt },
      ),
      status: "converted",
    }));
    expect(project.panels.every((shot) => shot.enPrompt.includes("masterpiece"))).toBe(true);

    const pending = getTuiwenPendingGenerationShots(project);
    expect(pending.map((shot) => shot.id)).toEqual(project.panels.map((shot) => shot.id));
    const quoteGroups = buildTuiwenQuoteGroups(project, pending, (shot) =>
      shot.paramsOverride.enabled ? { ...project.globalParams, ...shot.paramsOverride.params } : project.globalParams);
    expect(quoteGroups).toHaveLength(1);
    expect(quoteGroups[0]).toMatchObject({ vibeCount: 1, preciseCount: 1 });

    const wav = encodeTuiwenPcm16Wav([new Float32Array(16_000)], 16_000);
    for (const [index, shot] of project.panels.entries()) {
      const imagePath = writeFile(temp, `images/shot-${index + 1}.png`, `fake-png-${index + 1}`);
      project.panels[index] = applyTuiwenGenerationResultToShot(
        shot,
        { ok: true, message: "ok", items: [], actualSeed: 1000 + index },
        makeHistoryItem(shot.id, shot.index, imagePath),
        index === 0 ? 0 : 5,
      );

      const audio = await saveTuiwenImportedAudio(
        {
          projectId: project.id,
          projectTitle: project.title,
          shotId: shot.id,
          index: shot.index,
          durationMs: shot.durationMs,
          sourceName: `voice-${shot.index}.wav`,
          wavData: wav,
        },
        temp,
      );
      expect(audio.ok).toBe(true);
      project.panels[index].audio = audio.audio!;
      project.panels[index].durationMs = audio.audio!.durationMs;
    }
    expect(project.panels.map((shot) => shot.status)).toEqual(["done", "done"]);
    expect(project.panels.map((shot) => shot.actualAnlas)).toEqual([0, 5]);

    const bgmPath = writeFile(temp, "bgm.mp3", "fake-bgm");
    project.exportSettings.bgm = { filePath: bgmPath, volume: 0.2, loop: true, fadeMs: 500 };

    const result = exportTuiwenJianYingDraft(project, temp);
    expect(result.ok).toBe(true);
    expect(result.validation?.ok).toBe(true);
    expect(result.validation?.errorCount).toBe(0);

    const validation = validateTuiwenJianYingDraft(result.draftPath!);
    expect(validation.ok).toBe(true);
    const content = JSON.parse(fs.readFileSync(result.contentPath!, "utf8"));
    expect(content.materials.videos).toHaveLength(4);
    expect(content.materials.audios).toHaveLength(3);
    expect(content.materials.texts).toHaveLength(4);
    expect(content.tracks.filter((track: { type: string }) => track.type === "audio")).toHaveLength(2);
    expect(content.tracks.some((track: { type: string }) => track.type === "text")).toBe(true);
    expect(content.duration).toBeGreaterThan(0);
  });
});
