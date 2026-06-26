import { describe, expect, it } from "vitest";
import {
  createDefaultTuiwenProject,
  createTuiwenShot,
  normalizeTuiwenProject,
  shouldRestoreTuiwenSnapshot,
  splitNovelTextToNarration,
} from "./project";
import { DEFAULT_PARAMS } from "../types";

describe("tuiwen project model", () => {
  it("creates a desktop-only project with BGM/intro/outro export settings", () => {
    const project = createDefaultTuiwenProject(DEFAULT_PARAMS);
    expect(project.source.type).toBe("novel");
    expect(project.exportSettings.aspectRatio).toBe("9:16");
    expect(project.exportSettings.intro).toMatchObject({ durationMs: 1600 });
    expect(project.exportSettings.outro).toMatchObject({ durationMs: 1800 });
    expect(project.preflight.jianyingGoldenSampleReady).toBe(true);
    expect(project.preflight.jianyingMediaBundleVerified).toBe(true);
    expect(project.preflight.desktopOnlyAcknowledged).toBe(true);
  });

  it("splits pasted novel text into narration-sized draft shots", () => {
    const shots = splitNovelTextToNarration("第一句。第二句！\n\n第三段很短。");
    expect(shots).toEqual(["第一句。第二句！", "第三段很短。"]);
  });

  it("normalizes imported projects without trusting missing media fields", () => {
    const project = normalizeTuiwenProject({
      title: "导入项目",
      exportSettings: { defaultShotDurationMs: 4200 },
      panels: [{ narration: "她推开门。", status: "generating" }],
    });
    expect(project.title).toBe("导入项目");
    expect(project.panels[0]).toMatchObject({
      index: 1,
      narration: "她推开门。",
      durationMs: 4200,
      subtitle: { text: "她推开门。", enabled: true },
    });
    expect(project.preflight.jianyingGoldenSampleReady).toBe(true);
    expect(project.preflight.jianyingMediaBundleVerified).toBe(true);
  });

  it("restores a snapshot only when the current project is still empty", () => {
    const empty = createDefaultTuiwenProject(DEFAULT_PARAMS);
    const snapshot = createDefaultTuiwenProject(DEFAULT_PARAMS);
    snapshot.rawScript = "saved source";
    snapshot.panels = [createTuiwenShot("saved shot", 1, 3000)];

    expect(shouldRestoreTuiwenSnapshot(empty, snapshot)).toBe(true);

    const edited = createDefaultTuiwenProject(DEFAULT_PARAMS);
    edited.panels = [createTuiwenShot("current unsaved shot", 1, 3000)];
    expect(shouldRestoreTuiwenSnapshot(edited, snapshot)).toBe(false);
    expect(shouldRestoreTuiwenSnapshot(empty, createDefaultTuiwenProject(DEFAULT_PARAMS))).toBe(false);
  });
});
