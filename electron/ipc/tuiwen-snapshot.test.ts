import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultTuiwenProject, createTuiwenShot } from "../../src/tuiwen/project";
import { loadTuiwenProjectSnapshot, saveTuiwenProjectSnapshot, tuiwenSnapshotPath } from "./tuiwen-snapshot";

const tempDirs: string[] = [];

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tuiwen-snapshot-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("tuiwen project snapshot storage", () => {
  it("persists and reloads a large project snapshot from the userData file system", async () => {
    const root = tempDir();
    const project = createDefaultTuiwenProject();
    project.id = "persisted-project";
    project.title = "Persistent Tuiwen";
    project.rawScript = "A long source that should not live in localStorage.";
    project.references = [
      {
        id: "hero",
        name: "hero precise",
        kind: "precise",
        base64: "x".repeat(128_000),
        previewUrl: "",
        reversePrompt: "white hair, blue dress",
        infoExtracted: 0.7,
        strength: 0.5,
        useForGeneration: true,
      },
    ];
    project.panels = [createTuiwenShot("第一镜旁白", 1, 2400), createTuiwenShot("第二镜旁白", 2, 2600)];
    project.panels[0].status = "done";
    project.panels[0].outputPath = path.join(root, "shot-1.png");
    project.panels[1].status = "failed";
    project.panels[1].error = "network";

    const saved = await saveTuiwenProjectSnapshot(project, root);
    expect(saved.ok).toBe(true);
    expect(saved.path).toBe(tuiwenSnapshotPath(root));
    expect(fs.existsSync(saved.path!)).toBe(true);
    expect(path.relative(root, saved.path!)).not.toMatch(/^\.\./);

    const loaded = await loadTuiwenProjectSnapshot(root);
    expect(loaded.ok).toBe(true);
    expect(loaded.savedAt).toBe(saved.savedAt);
    expect(loaded.project?.id).toBe(project.id);
    expect(loaded.project?.references[0].base64.length).toBe(128_000);
    expect(loaded.project?.panels.map((shot) => shot.status)).toEqual(["done", "failed"]);
    expect(loaded.project?.panels[1].error).toBe("network");
  });

  it("returns a recoverable miss when no snapshot exists", async () => {
    const root = tempDir();
    const loaded = await loadTuiwenProjectSnapshot(root);
    expect(loaded.ok).toBe(false);
    expect(loaded.path).toBe(tuiwenSnapshotPath(root));
    expect(loaded.message).toContain("暂无");
  });

  it("reports corrupt snapshot JSON without deleting the file", async () => {
    const root = tempDir();
    const filePath = tuiwenSnapshotPath(root);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "{not-json", "utf8");

    const loaded = await loadTuiwenProjectSnapshot(root);
    expect(loaded.ok).toBe(false);
    expect(loaded.message).toContain("读取小说推文快照失败");
    expect(fs.readFileSync(filePath, "utf8")).toBe("{not-json");
  });
});
