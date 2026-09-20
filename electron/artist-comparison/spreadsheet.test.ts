import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PARAMS } from "../../src/types";
import {
  createProject,
  createRun,
  parseEntries,
  type ComparisonProject,
} from "../../src/artist-comparison/model";
import { exportSpreadsheetToFile } from "./spreadsheet";

function temporaryDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "comparison-spreadsheet-"));
}

async function writeFixtureImage(filePath: string, width = 832, height = 1216, colour = "#6548a8"): Promise<void> {
  await sharp({
    create: { width, height, channels: 3, background: colour },
  }).png().toFile(filePath);
}

interface Fixture {
  project: ComparisonProject;
  source: string;
  secondSource: string;
  missingSource: string;
}

async function fixture(directory: string): Promise<Fixture> {
  const source = path.join(directory, "source.png");
  const secondSource = path.join(directory, "source-wide.png");
  const missingSource = path.join(directory, "missing.png");
  await writeFixtureImage(source);
  await writeFixtureImage(secondSource, 1216, 832, "#a84865");

  const project = createProject();
  project.tags = [
    { id: "oil", label: "油画" },
    { id: "special", label: "画风特色鲜明" },
  ];
  project.entries = parseEntries("artist:alpha\nartist:beta\nartist:gamma, artist:delta");
  project.entries[0].ratingId = project.ratings[1].id;
  project.entries[0].inPool = true;
  project.entries[0].tagIds = ["oil", "special"];
  project.entries[0].note = '=HYPERLINK("should stay text")\u000b';
  project.entries[2].coverJobId = null;

  const firstRun = createRun(
    project,
    { ...DEFAULT_PARAMS, seed: 42, seedMode: "random", width: 832, height: 1216 },
    "first common positive",
    "first common negative",
    [42],
  );
  firstRun.jobs[0].status = "done";
  firstRun.jobs[0].image = { id: "alpha-image", filePath: source, fileUrl: "local:alpha" };
  firstRun.jobs[1].status = "done";
  firstRun.jobs[1].image = { id: "beta-missing", filePath: missingSource, fileUrl: "local:missing" };
  firstRun.jobs[2].status = "done";
  firstRun.jobs[2].image = { id: "recipe-image", filePath: secondSource, fileUrl: "local:recipe" };
  project.entries[0].coverJobId = firstRun.jobs[0].id;

  const secondRun = createRun(
    project,
    { ...DEFAULT_PARAMS, seed: 84, seedMode: "fixed", width: 640, height: 640, steps: 30, cfgScale: 7 },
    "second common positive",
    "second common negative",
    [84],
  );
  secondRun.jobs[0].status = "pending";
  secondRun.jobs[1].status = "pending";
  secondRun.jobs[2].status = "done";
  secondRun.jobs[2].image = { id: "recipe-image-new", filePath: secondSource, fileUrl: "local:recipe-new" };
  project.runs.push(firstRun, secondRun);
  return { project, source, secondSource, missingSource };
}

describe("comparison spreadsheet export", () => {
  it("writes filterable sheets, safe inline text, and proportional JPEG previews without changing originals", async () => {
    const directory = temporaryDirectory();
    try {
      const { project, source, secondSource } = await fixture(directory);
      const beforeSource = fs.readFileSync(source);
      const beforeSecondSource = fs.readFileSync(secondSource);
      const destination = path.join(directory, "report.xlsx");
      const report = await exportSpreadsheetToFile(project, destination, (job) => job.image!.filePath);

      expect(report.images).toBe(2);
      expect(report.missingImages).toBe(1);
      expect(report.bytes).toBe(fs.statSync(destination).size);
      expect(fs.readFileSync(source)).toEqual(beforeSource);
      expect(fs.readFileSync(secondSource)).toEqual(beforeSecondSource);

      const zip = await JSZip.loadAsync(fs.readFileSync(destination));
      const workbook = await zip.file("xl/workbook.xml")!.async("string");
      expect(workbook).toContain('name="画师"');
      expect(workbook).toContain('name="画师组合"');
      expect(workbook).toContain('name="生成条件"');
      expect(workbook).toContain('name="说明"');

      const artistSheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
      const recipeSheet = await zip.file("xl/worksheets/sheet2.xml")!.async("string");
      expect(artistSheet).toContain('state="frozen"');
      expect(artistSheet).toMatch(/<autoFilter ref="A1:[A-Z]+3"\/>/);
      expect(artistSheet).toContain("artist:alpha");
      expect(artistSheet).toContain("first common positive");
      expect(artistSheet).toContain("<v>42</v>");
      expect(recipeSheet).toContain("artist:gamma, artist:delta");
      expect(recipeSheet).toContain("second common positive");
      expect(recipeSheet).toContain("<v>84</v>");
      expect(artistSheet).toContain("&quot;should stay text&quot;");
      expect(artistSheet).not.toContain("<f>");
      expect(artistSheet).not.toContain("\u000b");
      expect(artistSheet).toContain("预览图无法读取");
      expect(artistSheet).toContain("油画");
      expect(artistSheet).toContain("画风特色鲜明");

      const drawing = await zip.file("xl/drawings/drawing1.xml")!.async("string");
      expect(drawing).toContain("twoCellAnchor");
      expect(await zip.file("xl/drawings/drawing2.xml")!.async("string")).toContain("twoCellAnchor");
      const contentTypes = await zip.file("[Content_Types].xml")!.async("string");
      expect(contentTypes).toContain("drawing1.xml");
      expect(contentTypes).toContain("drawing2.xml");

      const media = Object.keys(zip.files).filter((name) => name.startsWith("xl/media/") && name.endsWith(".jpg"));
      expect(media).toHaveLength(2);
      for (const name of media) {
        const bytes = await zip.file(name)!.async("nodebuffer");
        const metadata = await sharp(bytes).metadata();
        expect(Math.max(metadata.width!, metadata.height!)).toBeLessThanOrEqual(480);
        const ratio = metadata.width! / metadata.height!;
        expect(Math.min(ratio, 1 / ratio)).toBeCloseTo(Math.min(832 / 1216, 1216 / 832), 2);
      }
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps every run's generation conditions and actual job seeds in a separate sheet", async () => {
    const directory = temporaryDirectory();
    try {
      const { project } = await fixture(directory);
      const destination = path.join(directory, "conditions.xlsx");
      await exportSpreadsheetToFile(project, destination, (job) => job.image!.filePath);
      const zip = await JSZip.loadAsync(fs.readFileSync(destination));
      const conditions = await zip.file("xl/worksheets/sheet3.xml")!.async("string");
      expect(conditions).toContain(project.runs[0].id);
      expect(conditions).toContain(project.runs[1].id);
      expect(conditions).toContain("first common positive");
      expect(conditions).toContain("second common negative");
      expect(conditions).toContain("42");
      expect(conditions).toContain("84");
      expect(conditions).toMatch(/负面词预设|ucPreset/);
      expect(conditions).toMatch(/质量标签启用|qualityToggle/);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("retains rows when a preview source is missing", async () => {
    const directory = temporaryDirectory();
    try {
      const { project, missingSource } = await fixture(directory);
      const destination = path.join(directory, "missing.xlsx");
      const report = await exportSpreadsheetToFile(project, destination, () => missingSource);
      expect(report.images).toBe(0);
      expect(report.missingImages).toBe(3);
      const zip = await JSZip.loadAsync(fs.readFileSync(destination));
      const artistSheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
      const recipeSheet = await zip.file("xl/worksheets/sheet2.xml")!.async("string");
      expect(artistSheet).toContain("artist:alpha");
      expect(artistSheet).toContain("artist:beta");
      expect(recipeSheet).toContain("artist:gamma, artist:delta");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("does not replace an existing target when the final rename cannot succeed", async () => {
    const directory = temporaryDirectory();
    try {
      const { project, source } = await fixture(directory);
      const blockedTarget = path.join(directory, "existing.xlsx");
      const original = Buffer.from("previous workbook");
      fs.writeFileSync(blockedTarget, original);
      const renameSpy = vi.spyOn(fs.promises, "rename").mockRejectedValueOnce(new Error("simulated final rename failure"));
      try {
        await expect(exportSpreadsheetToFile(project, blockedTarget, () => source)).rejects.toThrow("simulated final rename failure");
      } finally {
        renameSpy.mockRestore();
      }
      expect(fs.readFileSync(blockedTarget)).toEqual(original);
      expect(fs.readdirSync(directory).filter((name) => name.includes(".tmp"))).toHaveLength(0);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
