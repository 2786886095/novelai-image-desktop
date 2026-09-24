import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { DEFAULT_PARAMS } from "../../src/types";
import {
  createProject,
  createRun,
  exploreEntries,
  parseEntries,
  type ComparisonProject,
} from "../../src/artist-comparison/model";
import {
  csvReport,
  exportArchive,
  exportArchiveToFile,
  importArchive,
  readProjects,
  writeProjects,
} from "./files";

const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
  "base64",
);

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "comparison-"));
}

function fixture(): ComparisonProject {
  const project = createProject();
  project.entries = parseEntries("artist:test");
  project.entries[0].note = '=HYPERLINK("bad")';
  project.runs.push(createRun(project, DEFAULT_PARAMS, "portrait", "", [42]));
  project.runs[0].jobs[0].status = "done";
  project.runs[0].jobs[0].image = {
    id: "image",
    filePath: "/private/source.png",
    fileUrl: "file:///private/source.png",
  };
  return project;
}

function explorationFixture(): ComparisonProject {
  const project = createProject();
  const ratingId = project.ratings[0].id;
  const sources = parseEntries("artist:alpha\nartist:beta").map((entry) => ({
    ...entry,
    ratingId,
    inPool: true,
  }));
  const [recipe] = exploreEntries(
    sources,
    [{ ratingId, count: 1, minWeight: 1, maxWeight: 1 }],
    1,
    7,
  );
  project.entries = [...sources, recipe];
  project.runs.push(createRun(project, DEFAULT_PARAMS, "portrait", "", [42]));
  project.runs[0].jobs[0].status = "done";
  project.runs[0].jobs[0].image = {
    id: "image",
    filePath: "/private/source.png",
    fileUrl: "file:///private/source.png",
  };
  return project;
}

async function archiveFor(project: ComparisonProject) {
  return exportArchive(project, () => image);
}

function namespaceIds(project: ComparisonProject) {
  return {
    project: [project.id],
    ratings: project.ratings.map((rating) => rating.id),
    entries: project.entries.map((entry) => entry.id),
    runs: project.runs.map((run) => run.id),
    runRatings: project.runs.flatMap((run) => run.ratings.map((rating) => rating.id)),
    runEntries: project.runs.flatMap((run) => run.entries.map((entry) => entry.id)),
    jobs: project.runs.flatMap((run) => run.jobs.map((job) => job.id)),
  };
}

describe("comparison files", () => {
  it("round trips a 500-artist library with covers, ratings and notes through a streamed ZIP", async () => {
    const directory = temporaryDirectory();
    try {
      const source = path.join(directory, "sample.png");
      fs.writeFileSync(source, image);
      const project = createProject();
      project.entries = parseEntries(Array.from({ length: 500 }, (_, i) => `artist:sample_${i}`).join("\n"));
      project.entries.forEach((entry, i) => {
        entry.ratingId = project.ratings[i % project.ratings.length].id;
        entry.note = `备注 ${i}，适合油画`;
      });
      const run = createRun(project, DEFAULT_PARAMS, "portrait", "", [42]);
      project.runs.push(run);
      run.jobs.forEach((job, i) => {
        job.status = "done";
        job.image = { id: job.id, filePath: source, fileUrl: "local:test" };
        project.entries[i].coverJobId = job.id;
      });
      project.entries[0].coverJobId = null;
      const destination = path.join(directory, "library.zip");
      await exportArchiveToFile(project, destination, () => source);
      const zip = await JSZip.loadAsync(fs.readFileSync(destination));
      const manifestText = await zip.file("manifest.json")!.async("string");
      expect(manifestText).not.toContain(directory);
      expect(Object.keys(zip.files).filter(name => name.endsWith(".png"))).toHaveLength(1);
      const imported = await importArchive(fs.readFileSync(destination), path.join(directory, "restored"), file => `local:${file}`);
      expect(imported.entries).toHaveLength(500);
      expect(imported.entries[0].coverJobId).toBeNull();
      imported.entries.forEach((entry, i) => {
        expect(entry.name).toBe(project.entries[i].name);
        expect(entry.prompt).toBe(project.entries[i].prompt);
        expect(entry.note).toBe(project.entries[i].note);
        expect(imported.ratings.find(level => level.id === entry.ratingId)?.label).toBe(project.ratings[i % project.ratings.length].label);
        const job = imported.runs[0].jobs[i];
        if (i > 0) expect(entry.coverJobId).toBe(job.id);
        expect(job.entryId).toBe(entry.id);
        expect(fs.readFileSync(job.image!.filePath)).toEqual(image);
      });
      const csv = await zip.file("ratings.csv")!.async("string");
      expect(csv).toContain('"library"');
      expect(csv).toContain('"备注 499，适合油画"');
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it("leaves an existing backup unchanged if a streamed export source is missing", async () => {
    const directory = temporaryDirectory();
    try {
      const destination = path.join(directory, "keep.zip");
      fs.writeFileSync(destination, "original backup");
      await expect(exportArchiveToFile(fixture(), destination, () => path.join(directory, "missing.png"))).rejects.toThrow();
      expect(fs.readFileSync(destination, "utf8")).toBe("original backup");
      expect(fs.readdirSync(directory)).toEqual(["keep.zip"]);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it("includes current entries even when only older entries have runs", () => {
    const project = fixture();
    project.entries.push(...parseEntries("artist:new_draft_artist"));
    const csv = csvReport(project);
    expect(csv).toContain('"library"');
    expect(csv).toContain('"artist:new_draft_artist"');
    expect(csv).toContain(project.runs[0].id);
  });

  it("round trips project and images with relative manifest paths", async () => {
    const directory = temporaryDirectory();
    try {
      const project = fixture();
      project.intervalSeconds = 45;
      const archive = await archiveFor(project);
      const zip = await JSZip.loadAsync(archive);
      const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));

      expect(JSON.stringify(manifest)).not.toContain("/private/");
      const imported = await importArchive(archive, directory, (file) => `media:${file}`);
      const job = imported.runs[0].jobs[0];
      expect(fs.readFileSync(job.image!.filePath)).toEqual(image);
      expect(imported.entries[0].note).toBe(project.entries[0].note);
      expect(imported.id).not.toBe(project.id);
      expect(imported.intervalSeconds).toBe(45);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("round trips exploration origin and snapshot references", async () => {
    const directory = temporaryDirectory();
    try {
      const project = explorationFixture();
      const archive = await archiveFor(project);
      const imported = await importArchive(archive, directory, (file) => `media:${file}`);
      const recipe = imported.entries.find((entry) => entry.kind === "recipe");
      const sourceIds = new Set(
        imported.entries
          .filter((entry) => entry.kind === "single")
          .map((entry) => entry.id),
      );

      expect(recipe).toBeDefined();
      expect(recipe!.inPool).toBe(false);
      expect(recipe!.origin?.entryIds).toHaveLength(1);
      expect(recipe!.origin!.entryIds.every((id) => sourceIds.has(id))).toBe(true);

      const runRecipe = imported.runs[0].entries.find((entry) => entry.id === recipe!.id);
      expect(runRecipe?.kind).toBe("recipe");
      expect(runRecipe?.origin).toEqual(recipe!.origin);
      expect(imported.runs[0].jobs.every((job) =>
        imported.runs[0].entries.some((entry) => entry.id === job.entryId),
      )).toBe(true);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("round trips shared tags, remaps tag references, and reports tag names in CSV", async () => {
    const directory = temporaryDirectory();
    try {
      const project = fixture();
      project.tags = [
        { id: "favorite", label: "Favorite" },
        { id: "batch", label: "Batch, 2026" },
      ];
      project.entries[0].tagIds = ["favorite", "batch"];
      project.runs[0].entries[0].tagIds = ["favorite", "batch"];

      const backup = path.join(directory, "projects.json");
      writeProjects(backup, [project]);
      const restored = readProjects(backup)[0];
      expect(restored.tags).toEqual(project.tags);
      expect(restored.entries[0].tagIds).toEqual(["favorite", "batch"]);
      expect(restored.runs[0].entries[0].tagIds).toEqual(["favorite", "batch"]);

      const csv = csvReport(project);
      expect(csv).toContain('"tags"');
      expect(csv).toContain('"Favorite, Batch, 2026"');

      const archive = await archiveFor(project);
      const imported = await importArchive(archive, directory, (file) => `media:${file}`);
      expect(imported.tags).toEqual([
        { id: expect.any(String), label: "Favorite" },
        { id: expect.any(String), label: "Batch, 2026" },
      ]);
      expect(imported.tags?.map((tag) => tag.id)).not.toEqual(project.tags.map((tag) => tag.id));
      const importedTagIds = imported.entries[0].tagIds ?? [];
      expect(importedTagIds).toHaveLength(2);
      expect(importedTagIds.every((id) => imported.tags?.some((tag) => tag.id === id))).toBe(true);
      expect(imported.entries[0].tagIds).toEqual(imported.runs[0].entries[0].tagIds);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rekeys imported IDs and keeps repeated imports disjoint", async () => {
    const firstDirectory = temporaryDirectory();
    const secondDirectory = temporaryDirectory();
    try {
      const project = fixture();
      const originalIds = namespaceIds(project);
      const archive = await archiveFor(project);
      const first = await importArchive(archive, firstDirectory, (file) => `media:${file}`);
      const second = await importArchive(archive, secondDirectory, (file) => `media:${file}`);
      const firstIds = namespaceIds(first);
      const secondIds = namespaceIds(second);

      for (const key of Object.keys(originalIds) as Array<keyof typeof originalIds>) {
        expect(firstIds[key].every((id) => !originalIds[key].includes(id))).toBe(true);
        expect(secondIds[key].every((id) => !originalIds[key].includes(id))).toBe(true);
        expect(new Set([...firstIds[key], ...secondIds[key]]).size).toBe(
          firstIds[key].length + secondIds[key].length,
        );
      }
    } finally {
      fs.rmSync(firstDirectory, { recursive: true, force: true });
      fs.rmSync(secondDirectory, { recursive: true, force: true });
    }
  });

  it("rekeys colliding rating and entry IDs independently", async () => {
    const directory = temporaryDirectory();
    try {
      const project = createProject();
      project.ratings[0].id = "shared";
      project.entries = parseEntries("artist:test");
      project.entries[0].id = "shared";
      project.runs.push(createRun(project, DEFAULT_PARAMS, "portrait", "", [42]));
      const archive = await archiveFor(project);
      const imported = await importArchive(archive, directory, (file) => `media:${file}`);

      expect(imported.ratings[0].id).not.toBe(imported.entries[0].id);
      expect(imported.runs[0].ratings[0].id).not.toBe(imported.runs[0].entries[0].id);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects modified assets before writing any files", async () => {
    const directory = temporaryDirectory();
    try {
      const zip = await JSZip.loadAsync(await archiveFor(fixture()));
      const imageName = Object.keys(zip.files).find((name) => name.endsWith(".png"))!;
      zip.file(imageName, Buffer.from("not an image"));
      const modified = await zip.generateAsync({ type: "nodebuffer" });

      await expect(importArchive(modified, directory, (file) => file)).rejects.toThrow();
      expect(fs.readdirSync(directory)).toEqual([]);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects manifest traversal instead of reading arbitrary local files", async () => {
    const directory = temporaryDirectory();
    try {
      const zip = await JSZip.loadAsync(await archiveFor(fixture()));
      const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
      manifest.project.runs[0].jobs[0].image.filePath = "../../outside.png";
      zip.file("manifest.json", JSON.stringify(manifest));

      await expect(
        importArchive(await zip.generateAsync({ type: "nodebuffer" }), directory, (file) => file),
      ).rejects.toThrow();
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("preserves quotes and protects spreadsheet formula-like notes", () => {
    const csv = csvReport(fixture());

    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('""bad""');
  });

  it("does not write metadata replay into the durable comparison backup", () => {
    const directory = temporaryDirectory();
    try {
      const project = createProject();
      project.entries = parseEntries("artist:test");
      project.runs.push(createRun(
        project,
        {
          ...DEFAULT_PARAMS,
          metadataReplay: {
            model: "nai-diffusion-5-full",
            parameters: { source_comment: "should not persist" },
          },
        },
        "portrait",
        "",
        [42],
      ));
      const file = path.join(directory, "projects.json");
      writeProjects(file, [project]);
      expect(readProjects(file)[0].runs[0].params).not.toHaveProperty("metadataReplay");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("migrates a legacy monolithic file and keeps an explicit migration backup", () => {
    const directory = temporaryDirectory();
    try {
      const file = path.join(directory, "projects.json");
      const project = fixture();
      const legacy = JSON.stringify({ version: 1, projects: [project] });
      fs.writeFileSync(file, legacy);

      expect(readProjects(file)[0].name).toBe(project.name);
      writeProjects(file, [project]);

      const index = JSON.parse(fs.readFileSync(file, "utf8"));
      expect(index.storage).toBe("sharded");
      expect(index.projects[0].runs).toHaveLength(1);
      expect(readProjects(file)[0].runs[0].jobs[0].image?.filePath).toBe("/private/source.png");
      expect(fs.readFileSync(`${file}.legacy.bak`, "utf8")).toBe(legacy);
      expect(readProjects(`${file}.legacy.bak`)[0].name).toBe(project.name);
      expect(fs.readdirSync(path.join(`${file}.parts`, "projects"))).toHaveLength(1);
      expect(fs.readdirSync(path.join(`${file}.parts`, "runs"))).toHaveLength(1);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("leaves the current index and shards readable when a new shard cannot be written", () => {
    const directory = temporaryDirectory();
    const file = path.join(directory, "projects.json");
    const parts = `${file}.parts`;
    const projectsDirectory = path.join(parts, "projects");
    const blockedDirectory = path.join(parts, "projects.blocked");
    try {
      const project = fixture();
      writeProjects(file, [project]);
      fs.renameSync(projectsDirectory, blockedDirectory);
      fs.writeFileSync(projectsDirectory, "blocked");

      project.name = "should not replace current";
      expect(() => writeProjects(file, [project])).toThrow();
      fs.unlinkSync(projectsDirectory);
      fs.renameSync(blockedDirectory, projectsDirectory);
      expect(readProjects(file)[0].name).toBe("画师比较");
      expect(readProjects(`${file}.bak`)[0].name).toBe("画师比较");
    } finally {
      if (fs.existsSync(projectsDirectory) && fs.statSync(projectsDirectory).isFile()) fs.unlinkSync(projectsDirectory);
      if (fs.existsSync(blockedDirectory)) fs.renameSync(blockedDirectory, projectsDirectory);
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps a previous valid backup on atomic writes", () => {
    const directory = temporaryDirectory();
    try {
      const file = path.join(directory, "projects.json");
      const project = fixture();
      writeProjects(file, [project]);
      project.name = "new";
      writeProjects(file, [project]);

      expect(readProjects(file)[0].name).toBe("new");
      expect(readProjects(`${file}.bak`)[0].name).toBe("画师比较");
      expect(fs.existsSync(`${file}.bak`)).toBe(true);
      fs.writeFileSync(file, "{");
      expect(() => readProjects(file)).toThrow();
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
