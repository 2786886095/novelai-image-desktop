import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HistoryItem } from "../../src/types";

const fixture = vi.hoisted(() => ({ root: "" }));
vi.mock("electron", () => ({
  app: { getPath: (key: string) => path.join(fixture.root, key === "exe" ? "install/app.exe" : key) },
  safeStorage: { isEncryptionAvailable: () => false },
}));

type Store = typeof import("./store");
let store: Store;
let output: string;
const date = "2026-09-24";
const bytes = Buffer.from("history image fixture; do not modify");

async function restart() {
  // Reload the production module, discarding both the store cache and scan timer.
  vi.resetModules();
  store = await import("./store");
}

function seed(folder = "", groupId?: string) {
  const filePath = path.join(output, date, folder, "image.png");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, bytes);
  const data = store.readStore();
  data.settings.outputDir = output;
  data.historyGroups = [
    { id: "a", name: "A", createdAt: date },
    { id: "test", name: "test", createdAt: date },
  ];
  data.history = [{ id: "image", date, createdAt: date, filePath, groupId } as HistoryItem];
  store.writeStore(data);
  return filePath;
}

beforeEach(async () => {
  fixture.root = fs.mkdtempSync(path.join(os.tmpdir(), "nai-group-persistence-"));
  output = path.join(fixture.root, "output");
  await restart();
});

afterEach(() => {
  vi.restoreAllMocks();
  const root = path.resolve(fixture.root);
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("nai-group-persistence-")) {
    throw new Error("Unexpected test cleanup path");
  }
  fs.rmSync(root, { recursive: true, force: true });
});

describe("history grouping persistence using the production disk store", () => {
  it.each([
    ["ungrouped to test", "", undefined, "test", "test"],
    ["group A to test", "A", "a", "test", "test"],
    ["group A to ungrouped", "A", "a", "__ungrouped", undefined],
  ])("keeps %s after restart and periodic scans", async (_, folder, original, assigned, expected) => {
    const file = seed(folder, original);
    store.setHistoryGroup("image", assigned);
    await restart();
    expect(store.getHistory(date)[0].groupId).toBe(expected);
    expect(store.getHistory(date, expected ?? "__ungrouped")).toHaveLength(1);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 11_000);
    store.getHistoryDates();
    store.getHistoryGroups();
    expect(store.getHistory()[0].groupId).toBe(expected);
    expect(JSON.parse(fs.readFileSync(path.join(fixture.root, "userData/novelai-image-desktop.json"), "utf8")).history[0].groupId).toBe(expected);
    expect(fs.readFileSync(file)).toEqual(bytes);
  });

  it("does not resurrect a renamed group from its old folder", async () => {
    seed("A", "a");
    store.renameHistoryGroup("a", "Renamed");
    await restart();
    expect(store.getHistory()[0].groupId).toBe("a");
    expect(store.getHistoryGroups().map((g) => g.name)).toEqual(["Renamed", "test"]);
  });

  it("does not resurrect a deleted group, and keeps its images", async () => {
    const file = seed("A", "a");
    store.deleteHistoryGroup("a");
    await restart();
    expect(store.getHistory(date, "__ungrouped")).toHaveLength(1);
    expect(store.getHistoryGroups().map((g) => g.id)).toEqual(["test"]);
    expect(fs.readFileSync(file)).toEqual(bytes);
  });

  it.each([false, true])("still repairs an actually moved image (thumbnail recovery: %s)", async (thumbnailRecovery) => {
    const file = seed();
    const moved = path.join(output, date, "test", "image.png");
    fs.mkdirSync(path.dirname(moved), { recursive: true });
    fs.renameSync(file, moved);
    await restart();
    if (thumbnailRecovery) expect(store.pruneMissingHistoryItem("image")).toBe(false);
    expect(store.getHistory(date, "test")[0]).toMatchObject({ filePath: moved, groupId: "test" });
    expect(fs.readFileSync(moved)).toEqual(bytes);
  });

  it("keeps a manually assigned group when the output drive is offline", async () => {
    seed();
    store.setHistoryGroup("image", "test");
    const data = store.readStore();
    data.settings.outputDir = path.join(fixture.root, "disconnected-drive");
    store.writeStore(data);
    await restart();
    expect(store.getHistory(date, "test")).toHaveLength(1);
  });
});
