import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fileExistsWithDirectoryCache, findMovedHistoryFile, type PersistedData } from "./store";
import type { AppSettings, HistoryGroup, HistoryItem } from "../../src/types";

let outputDir: string;

beforeEach(() => {
  outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "nai-history-test-"));
});

afterEach(() => {
  fs.rmSync(outputDir, { recursive: true, force: true });
});

function dataWith(overrides: Partial<PersistedData> = {}): PersistedData {
  return {
    settings: { outputDir } as unknown as AppSettings,
    history: [],
    historyGroups: [],
    convertHistory: [],
    reverseHistory: [],
    ...overrides,
  };
}

function item(overrides: Partial<HistoryItem> = {}): HistoryItem {
  return {
    id: "item-1",
    filePath: path.join(outputDir, "2026-01-01", "old-group", "12345-image.png"),
    fileUrl: "",
    date: "2026-01-01",
    createdAt: "2026-01-01T00:00:00.000Z",
    params: {} as HistoryItem["params"],
    actualSeed: 1,
    model: "test",
    width: 512,
    height: 512,
    ...overrides,
  };
}

describe("findMovedHistoryFile (P1-09/P1-10)", () => {
  it("finds a file that moved to a different group folder under the same basename", () => {
    const newDir = path.join(outputDir, "2026-01-02", "new-group");
    fs.mkdirSync(newDir, { recursive: true });
    fs.writeFileSync(path.join(newDir, "12345-image.png"), "content");

    const result = findMovedHistoryFile(item(), dataWith(), new Map());
    expect(result.inconclusive).toBe(false);
    expect(result.path).toBe(path.join(newDir, "12345-image.png"));
  });

  it("reports a genuinely-missing file as conclusive (not inconclusive) when the output dir is fully scanned", () => {
    // Output dir exists and is scannable, but no file with this basename anywhere in it.
    fs.mkdirSync(path.join(outputDir, "2026-01-01"), { recursive: true });

    const result = findMovedHistoryFile(item(), dataWith(), new Map());
    expect(result.path).toBeNull();
    expect(result.inconclusive).toBe(false);
  });

  it("does not confirm a file missing when the output directory itself is unreachable", () => {
    const missingRoot = path.join(outputDir, "does-not-exist-at-all");
    const result = findMovedHistoryFile(
      item(),
      dataWith({ settings: { outputDir: missingRoot } as unknown as AppSettings }),
      new Map(),
    );
    expect(result.path).toBeNull();
    expect(result.inconclusive).toBe(true);
  });

  it("prefers the candidate belonging to the record's existing group when two groups share a basename", () => {
    const groupA = path.join(outputDir, "2026-01-01", "group-a");
    const groupB = path.join(outputDir, "2026-01-01", "group-b");
    fs.mkdirSync(groupA, { recursive: true });
    fs.mkdirSync(groupB, { recursive: true });
    fs.writeFileSync(path.join(groupA, "12345-image.png"), "a");
    fs.writeFileSync(path.join(groupB, "12345-image.png"), "b");

    const groups: HistoryGroup[] = [
      { id: "group-a-id", name: "group-a", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "group-b-id", name: "group-b", createdAt: "2026-01-01T00:00:00.000Z" },
    ];

    const result = findMovedHistoryFile(
      item({ groupId: "group-b-id" }),
      dataWith({ historyGroups: groups }),
      new Map(),
    );
    expect(result.path).toBe(path.join(groupB, "12345-image.png"));
  });
});

describe("fileExistsWithDirectoryCache", () => {
  it("reads a shared history directory once for any number of image rows", () => {
    const groupDir = path.join(outputDir, "2026-01-01", "group-a");
    fs.mkdirSync(groupDir, { recursive: true });
    const files = Array.from({ length: 40 }, (_, index) => path.join(groupDir, `${index}.png`));
    for (const file of files) fs.writeFileSync(file, "image");
    const readdir = vi.spyOn(fs, "readdirSync");
    const cache = new Map<string, Set<string> | null>();

    expect(files.every((file) => fileExistsWithDirectoryCache(file, cache))).toBe(true);
    expect(fileExistsWithDirectoryCache(path.join(groupDir, "missing.png"), cache)).toBe(false);
    expect(readdir).toHaveBeenCalledTimes(1);

    readdir.mockRestore();
  });
});
