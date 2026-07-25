import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, type TagComicProject } from "../types";
import {
  createTagComicPanel,
  createTagComicProject,
  mergeTagComicParams,
  normalizeTagComicProject,
  parseTagComicImport,
  parseTagComicSizeImport,
  tagComicSizeTemplate,
} from "./tag-comic";

describe("tag-only comic projects", () => {
  it("imports line-based prompts", () => {
    expect(parseTagComicImport("1girl, smile\n1boy, city")).toEqual([
      { title: "Panel 1", prompt: "1girl, smile" },
      { title: "Panel 2", prompt: "1boy, city" },
    ]);
  });

  it("imports titled JSON and quoted CSV", () => {
    expect(
      parseTagComicImport(
        '[{"title":"Opening","tags":"1girl, sunrise"}]',
        "panels.json",
      ),
    ).toEqual([{ title: "Opening", prompt: "1girl, sunrise" }]);
    expect(
      parseTagComicImport(
        '分镜标题,提示词\n"Panel, One","1girl, smile"',
        "panels.csv",
      ),
    ).toEqual([{ title: "Panel, One", prompt: "1girl, smile" }]);
  });

  it("rejects old project schemas", () => {
    expect(() =>
      normalizeTagComicProject({ schemaVersion: 1, panels: [] }),
    ).toThrow(/schema v2/);
    expect(() =>
      parseTagComicImport('{"schemaVersion":1,"panels":[]}', "old.json"),
    ).toThrow(/Old comic projects/);
  });

  it("clamps initial candidates and strips untrusted output paths", () => {
    const raw = {
      ...createTagComicProject(),
      initialGenerationCount: 99,
      historyGroupId: "group-1",
      panels: [
        {
          ...createTagComicPanel("1girl", 1),
          selectedCandidateId: "candidate-1",
          candidates: [
            {
              id: "candidate-1",
              historyItemId: "history-1",
              outputPath: "C:/output/1.png",
              outputUrl: "file:///C:/output/1.png",
              createdAt: "2026-07-22T00:00:00Z",
            },
          ],
        },
      ],
    } satisfies TagComicProject;
    const imported = normalizeTagComicProject(raw);
    const trusted = normalizeTagComicProject(raw, DEFAULT_PARAMS, {
      trustOutputs: true,
    });
    expect(imported.initialGenerationCount).toBe(10);
    expect(imported.historyGroupId).toBeUndefined();
    expect(imported.panels[0].candidates).toEqual([]);
    expect(trusted.panels[0].selectedCandidateId).toBe("candidate-1");
  });

  it("merges independent panel settings without storing a local negative", () => {
    const project = createTagComicProject({
      ...DEFAULT_PARAMS,
      negativePrompt: "lowres",
      steps: 28,
    });
    const panel = createTagComicPanel("1girl", 1);
    panel.paramsOverride = { enabled: true, params: { steps: 36 } };
    expect(mergeTagComicParams(project, panel)).toMatchObject({
      steps: 36,
      positivePrompt: "",
    });
    expect(project.globalNegativePrompt).toBe("lowres");
    expect(panel).not.toHaveProperty("localNegativePrompt");
  });

  it("imports one supported size per panel and applies it over global dimensions", () => {
    const sizes = parseTagComicSizeImport(
      "832×1216\n1216x832\n1024×1024",
      3,
    );
    expect(sizes).toEqual([
      { width: 832, height: 1216 },
      { width: 1216, height: 832 },
      { width: 1024, height: 1024 },
    ]);
    const project = createTagComicProject({
      ...DEFAULT_PARAMS,
      width: 1024,
      height: 1024,
    });
    project.sizeMode = "perPanel";
    const panel = createTagComicPanel("1girl", 1);
    panel.imageSize = sizes[0];
    expect(mergeTagComicParams(project, panel)).toMatchObject(sizes[0]);
    expect(tagComicSizeTemplate(2, sizes[1])).toBe(
      "1216×832\n1216×832",
    );
  });

  it("rejects size count mismatches, blank rows, and unsupported sizes", () => {
    expect(() => parseTagComicSizeImport("832×1216", 2)).toThrow(/count/);
    expect(() =>
      parseTagComicSizeImport("832×1216\n\n1024×1024", 3),
    ).toThrow(/blank/);
    expect(() =>
      parseTagComicSizeImport("800×1200", 1),
    ).toThrow(/unsupported/);
  });

  it("keeps local precise-reference resources only for trusted restores", () => {
    const project = createTagComicProject();
    project.preciseReferences.push({
      id: "reference-1",
      name: "hero.png",
      filePath: "C:/project/references/hero.png",
      fileUrl: "file:///C:/project/references/hero.png",
      type: "character",
      strength: 0.8,
      fidelity: 0.7,
      informationExtracted: 0.7,
    });
    const panel = createTagComicPanel("1girl", 1);
    panel.preciseReferences.push({
      referenceId: "reference-1",
      type: "character&style",
      strength: 0.6,
      fidelity: 0.5,
      informationExtracted: 0.5,
    });
    project.panels.push(panel);
    const trusted = normalizeTagComicProject(project, DEFAULT_PARAMS, {
      trustOutputs: true,
    });
    const imported = normalizeTagComicProject(project);
    expect(trusted.preciseReferences).toHaveLength(1);
    expect(trusted.panels[0].preciseReferences[0]).toMatchObject({
      referenceId: "reference-1",
      strength: 0.6,
    });
    expect(imported.preciseReferences).toEqual([]);
    expect(imported.panels[0].preciseReferences).toEqual([]);
  });
});
