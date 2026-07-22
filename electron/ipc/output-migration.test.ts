import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { PersistedData } from "./store";
import { migrateLegacyInstalledOutput } from "./store";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture(oldRoot: string): PersistedData {
  const filePath = path.join(oldRoot, "2026-07-22", "sample.png");
  return {
    settings: { outputDir: oldRoot } as PersistedData["settings"],
    history: [{ id: "one", filePath, fileUrl: "file:///old", date: "2026-07-22" } as PersistedData["history"][number]],
    historyGroups: [],
    convertHistory: [],
    reverseHistory: [],
  };
}

describe("legacy installed output migration", () => {
  it("copies generated files to Pictures and rewrites persisted history paths", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nai-output-migration-"));
    roots.push(root);
    const oldRoot = path.join(root, "installed", "outputs");
    const newRoot = path.join(root, "Pictures", "Langbai NovelAI Studio");
    const source = path.join(oldRoot, "2026-07-22", "sample.png");
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, "image");

    const result = migrateLegacyInstalledOutput(fixture(oldRoot), oldRoot, newRoot);

    const destination = path.join(newRoot, "2026-07-22", "sample.png");
    expect(result).toMatchObject({ changed: true, copied: true });
    expect(fs.readFileSync(destination, "utf8")).toBe("image");
    expect(fs.existsSync(source)).toBe(true);
    expect(result.data.settings.outputDir).toBe(newRoot);
    expect(result.data.history[0].filePath).toBe(destination);
  });

  it("does not touch a user-selected output directory", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nai-output-migration-"));
    roots.push(root);
    const oldRoot = path.join(root, "installed", "outputs");
    const customRoot = path.join(root, "custom");
    const result = migrateLegacyInstalledOutput(fixture(customRoot), oldRoot, path.join(root, "Pictures"));
    expect(result.changed).toBe(false);
    expect(result.data.settings.outputDir).toBe(customRoot);
  });

  it("recovers the installer backup after the old app directory was replaced", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nai-output-migration-"));
    roots.push(root);
    const oldRoot = path.join(root, "installed", "outputs");
    const backupRoot = path.join(root, "Pictures", "Langbai NovelAI Studio Update Backup");
    const newRoot = path.join(root, "Pictures", "Langbai NovelAI Studio");
    const backupFile = path.join(backupRoot, "2026-07-22", "sample.png");
    fs.mkdirSync(path.dirname(backupFile), { recursive: true });
    fs.writeFileSync(backupFile, "rescued image");

    const result = migrateLegacyInstalledOutput(fixture(oldRoot), oldRoot, newRoot, backupRoot);
    const destination = path.join(newRoot, "2026-07-22", "sample.png");

    expect(result).toMatchObject({ changed: true, copied: true });
    expect(fs.readFileSync(destination, "utf8")).toBe("rescued image");
    expect(fs.existsSync(backupFile)).toBe(true);
    expect(result.data.history[0].filePath).toBe(destination);
  });
});
