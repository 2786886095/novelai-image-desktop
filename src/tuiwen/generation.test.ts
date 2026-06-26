import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, type ComicReferenceAsset, type TuiwenProject, type TuiwenShot } from "../types";
import { createDefaultTuiwenProject, createTuiwenShot } from "./project";
import {
  applyTuiwenGenerationResultToShot,
  buildTuiwenQuoteGroups,
  countTuiwenGenerationReferences,
  distributeTuiwenGroupAnlas,
  getTuiwenPendingGenerationShots,
  resolveTuiwenActualAnlas,
} from "./generation";

function makeShot(id: string, index: number, status: TuiwenShot["status"], prompt: string) {
  return {
    ...createTuiwenShot(`shot ${index}`, index, 3000),
    id,
    status,
    cnPrompt: prompt,
    enPrompt: prompt,
  };
}

function makeReference(id: string, kind: ComicReferenceAsset["kind"], base64 = "png", useForGeneration = true): ComicReferenceAsset {
  return {
    id,
    name: id,
    kind,
    base64,
    previewUrl: "",
    reversePrompt: "",
    infoExtracted: 0.7,
    strength: 0.5,
    useForGeneration,
  };
}

function resolveShotParams(project: TuiwenProject, shot: TuiwenShot) {
  return shot.paramsOverride.enabled ? { ...project.globalParams, ...shot.paramsOverride.params } : project.globalParams;
}

describe("tuiwen generation queue helpers", () => {
  it("keeps failed/draft shots resumable while skipping completed shots", () => {
    const project = createDefaultTuiwenProject(DEFAULT_PARAMS);
    project.panels = [
      makeShot("done", 1, "done", "already generated"),
      makeShot("failed", 3, "failed", "retry me"),
      makeShot("draft", 2, "draft", "generate me"),
      makeShot("empty", 4, "draft", ""),
    ];

    expect(getTuiwenPendingGenerationShots(project).map((shot) => shot.id)).toEqual(["draft", "failed"]);
  });

  it("counts precise references only on V4.5 and degrades them to vibe cost on older models", () => {
    const refs = [
      makeReference("vibe", "vibe"),
      makeReference("precise", "precise"),
      makeReference("character", "character"),
      makeReference("disabled", "scene", "png", false),
      makeReference("empty", "object", ""),
    ];

    expect(countTuiwenGenerationReferences(refs, "nai-diffusion-4-5-full")).toMatchObject({
      supportsPrecise: true,
      vibeCount: 1,
      preciseCount: 2,
    });
    expect(countTuiwenGenerationReferences(refs, "nai-diffusion-3")).toMatchObject({
      supportsPrecise: false,
      vibeCount: 3,
      preciseCount: 0,
    });
  });

  it("groups quote calls by cost-affecting generation params and reference counts", () => {
    const project = createDefaultTuiwenProject(DEFAULT_PARAMS);
    project.references = [makeReference("vibe", "vibe"), makeReference("precise", "precise")];
    const a = makeShot("a", 1, "draft", "a");
    const b = makeShot("b", 2, "failed", "b");
    const c = {
      ...makeShot("c", 3, "draft", "c"),
      paramsOverride: { enabled: true, params: { steps: DEFAULT_PARAMS.steps + 2 } },
    } satisfies TuiwenShot;
    project.panels = [a, b, c];

    const groups = buildTuiwenQuoteGroups(project, project.panels, (shot) => resolveShotParams(project, shot));

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ shotIds: ["a", "b"], vibeCount: 1, preciseCount: 1 });
    expect(groups[1]).toMatchObject({ shotIds: ["c"], vibeCount: 1, preciseCount: 1 });
  });

  it("distributes one grouped official quote back to every shot", () => {
    expect(distributeTuiwenGroupAnlas(9, ["a", "b"])).toEqual({ a: 4.5, b: 4.5 });
    expect(distributeTuiwenGroupAnlas(0, ["free"])).toEqual({ free: 0 });
    expect(distributeTuiwenGroupAnlas(Number.NaN, ["unknown"])).toEqual({});
  });

  it("prefers balance-delta actual Anlas and falls back to the quote allocation when unreadable", () => {
    expect(resolveTuiwenActualAnlas(100, 92.5, 5)).toBe(7.5);
    expect(resolveTuiwenActualAnlas(100, 100, 5)).toBe(0);
    expect(resolveTuiwenActualAnlas(undefined, 92, 5)).toBe(5);
    expect(resolveTuiwenActualAnlas(90, 100, 5)).toBe(5);
  });

  it("records actualAnlas on successful shot result without erasing previous output on failure", () => {
    const shot = { ...makeShot("a", 1, "failed", "a"), outputPath: "old.png", actualAnlas: 2 };
    const success = applyTuiwenGenerationResultToShot(
      shot,
      { ok: true, message: "ok", items: [], actualSeed: 123 },
      {
        id: "history",
        filePath: "new.png",
        fileUrl: "file://new.png",
        date: "2026-06-26",
        createdAt: "2026-06-26T00:00:00.000Z",
        params: DEFAULT_PARAMS,
        actualSeed: 123,
        model: DEFAULT_PARAMS.model,
        width: DEFAULT_PARAMS.width,
        height: DEFAULT_PARAMS.height,
      },
      4.5,
    );
    expect(success).toMatchObject({ status: "done", outputPath: "new.png", historyItemId: "history", actualAnlas: 4.5 });

    const failure = applyTuiwenGenerationResultToShot(success, { ok: false, message: "bad", items: [] }, undefined, 8);
    expect(failure).toMatchObject({ status: "failed", outputPath: "new.png", actualAnlas: 4.5, error: "bad" });
  });
});
