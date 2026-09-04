import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, type TagComicProject } from "../types";
import {
  createTagComicPanel,
  createTagComicProject,
  buildTagComicGenerateRequest,
  buildTagComicRegenerationTasks,
  mergeTagComicParams,
  normalizeTagComicProject,
  formatTagComicPanelRange,
  parseTagComicImport,
  parseTagComicPanelRange,
  parseTagComicSizeImport,
  resolveTagComicPanelReferences,
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
      stylePrompt: "",
    });
    expect(project.globalNegativePrompt).toBe("lowres");
    expect(panel).not.toHaveProperty("localNegativePrompt");
  });

  it("snapshots the current parameters for each confirmed generation", () => {
    const project = createTagComicProject({
      ...DEFAULT_PARAMS,
      steps: 28,
      cfgScale: 6,
    });
    project.globalStylePrompt = "illustration";
    project.globalNegativePrompt = "lowres";
    const panel = createTagComicPanel("1girl, standing", 1);
    project.panels.push(panel);

    const first = buildTagComicGenerateRequest(project, panel);
    project.globalParams.steps = 36;
    project.globalStylePrompt = "painting";

    expect(first.params.steps).toBe(28);
    expect(first.params.stylePrompt).toBe("");
    expect(first.globalStylePrompt).toBe("illustration");
    expect(buildTagComicGenerateRequest(project, panel).params.steps).toBe(36);
    expect(buildTagComicGenerateRequest(project, panel).globalStylePrompt).toBe(
      "painting",
    );
  });

  it("rebuilds every requested candidate when regenerating all panels", () => {
    const first = createTagComicPanel("first", 1);
    const second = createTagComicPanel("second", 2);
    first.candidates.push({
      id: "old",
      historyItemId: "old-history",
      outputPath: "C:/old.png",
      outputUrl: "file:///C:/old.png",
      createdAt: "2026-09-03T00:00:00Z",
    });
    expect(buildTagComicRegenerationTasks([first, second], 3)).toEqual([
      { panelId: first.id, ordinal: 0 },
      { panelId: first.id, ordinal: 1 },
      { panelId: first.id, ordinal: 2 },
      { panelId: second.id, ordinal: 0 },
      { panelId: second.id, ordinal: 1 },
      { panelId: second.id, ordinal: 2 },
    ]);
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
      scope: "all",
      scopePanelIds: [],
    });
    const panel = createTagComicPanel("1girl", 1);
    panel.preciseReferences.push({
      referenceId: "reference-1",
      enabled: true,
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

  it("parses compact reference ranges and keeps scope attached to panel ids", () => {
    const panels = [1, 2, 3, 4, 5].map((index) =>
      createTagComicPanel(`panel ${index}`, index),
    );
    expect(parseTagComicPanelRange("1-3, 5", panels.length)).toEqual([
      1, 2, 3, 5,
    ]);
    const ids = [panels[0].id, panels[1].id, panels[4].id];
    expect(formatTagComicPanelRange(ids, panels)).toBe("1-2, 5");
    const reordered = [panels[1], panels[2], panels[3], panels[4], panels[0]].map(
      (panel, index) => ({ ...panel, index: index + 1 }),
    );
    expect(formatTagComicPanelRange(ids, reordered)).toBe("1, 4-5");
    expect(() => parseTagComicPanelRange("1-9", panels.length)).toThrow(
      /outOfRange/,
    );
  });

  it("resolves all/include/exclude scopes with manual overrides first", () => {
    const project = createTagComicProject();
    const first = createTagComicPanel("first", 1);
    const second = createTagComicPanel("second", 2);
    project.panels = [first, second];
    project.preciseReferences = [
      {
        id: "ref",
        name: "ref.png",
        filePath: "C:/ref.png",
        fileUrl: "file:///C:/ref.png",
        type: "character",
        strength: 1,
        fidelity: 1,
        informationExtracted: 1,
        scope: "exclude",
        scopePanelIds: [second.id],
      },
    ];
    expect(resolveTagComicPanelReferences(project, first)).toHaveLength(1);
    expect(resolveTagComicPanelReferences(project, second)).toHaveLength(0);
    second.preciseReferences.push({
      referenceId: "ref",
      enabled: true,
      type: "style",
      strength: 0.5,
      fidelity: 0.6,
      informationExtracted: 0.6,
    });
    expect(resolveTagComicPanelReferences(project, second)[0]).toMatchObject({
      type: "style",
      strength: 0.5,
    });
    first.preciseReferences.push({
      referenceId: "ref",
      enabled: false,
      type: "character",
      strength: 1,
      fidelity: 1,
      informationExtracted: 1,
    });
    expect(resolveTagComicPanelReferences(project, first)).toHaveLength(0);
  });
});
