import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  migrateLegacyUserDataStore,
  STORE_FILE_NAME,
} from "./user-data-migration";

let root: string;
let appData: string;
let stableDir: string;

function writeStore(dir: string, value: unknown) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, STORE_FILE_NAME), JSON.stringify(value), "utf8");
}

function readStore(dir: string) {
  return JSON.parse(fs.readFileSync(path.join(dir, STORE_FILE_NAME), "utf8")) as Record<string, unknown>;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "nai-user-data-migration-"));
  appData = path.join(root, "AppData");
  stableDir = path.join(appData, "stable");
  fs.mkdirSync(appData, { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("migrateLegacyUserDataStore", () => {
  it("copies the newest token-bearing legacy store when the target is missing", () => {
    const oldDir = path.join(appData, "Old");
    writeStore(oldDir, { token: "legacy-token", history: [{ id: "legacy" }] });

    expect(migrateLegacyUserDataStore({ appData, stableDir, legacyDirs: ["Old"] }))
      .toBe("legacy-store-copied");
    expect(readStore(stableDir)).toEqual({
      token: "legacy-token",
      history: [{ id: "legacy" }],
    });
  });

  it("never overwrites a stable store that already has a token", () => {
    writeStore(stableDir, { token: "stable-token", history: [{ id: "stable" }] });
    writeStore(path.join(appData, "Old"), { token: "legacy-token", history: [] });

    expect(migrateLegacyUserDataStore({ appData, stableDir, legacyDirs: ["Old"] }))
      .toBe("target-already-has-token");
    expect(readStore(stableDir)).toEqual({
      token: "stable-token",
      history: [{ id: "stable" }],
    });
  });

  it("merges only missing credentials into a valid token-less stable store", () => {
    writeStore(stableDir, {
      settings: { language: "zh-CN", custom: "keep" },
      history: [{ id: "stable" }],
      historyGroups: [{ id: "group" }],
    });
    writeStore(path.join(appData, "Old"), {
      token: "legacy-token",
      account: { tierName: "Opus" },
      settings: { language: "en-US" },
      history: [{ id: "legacy" }],
    });

    expect(migrateLegacyUserDataStore({ appData, stableDir, legacyDirs: ["Old"] }))
      .toBe("legacy-token-merged");
    expect(readStore(stableDir)).toEqual({
      token: "legacy-token",
      account: { tierName: "Opus" },
      settings: { language: "zh-CN", custom: "keep" },
      history: [{ id: "stable" }],
      historyGroups: [{ id: "group" }],
    });
    expect(JSON.parse(fs.readFileSync(
      path.join(stableDir, `${STORE_FILE_NAME}.pre-legacy-token-merge.bak`),
      "utf8",
    ))).toEqual({
      settings: { language: "zh-CN", custom: "keep" },
      history: [{ id: "stable" }],
      historyGroups: [{ id: "group" }],
    });
  });

  it("preserves an unreadable target instead of replacing it", () => {
    fs.mkdirSync(stableDir, { recursive: true });
    const target = path.join(stableDir, STORE_FILE_NAME);
    fs.writeFileSync(target, "{broken", "utf8");
    writeStore(path.join(appData, "Old"), { token: "legacy-token" });

    expect(migrateLegacyUserDataStore({ appData, stableDir, legacyDirs: ["Old"] }))
      .toBe("target-invalid-preserved");
    expect(fs.readFileSync(target, "utf8")).toBe("{broken");
  });

  it("creates a fresh backup instead of reusing a stale migration backup", () => {
    writeStore(stableDir, { history: [{ id: "current" }] });
    const staleBackup = path.join(stableDir, `${STORE_FILE_NAME}.pre-legacy-token-merge.bak`);
    fs.writeFileSync(staleBackup, JSON.stringify({ history: [{ id: "stale" }] }), "utf8");
    writeStore(path.join(appData, "Old"), { token: "legacy-token" });

    expect(migrateLegacyUserDataStore({ appData, stableDir, legacyDirs: ["Old"] }))
      .toBe("legacy-token-merged");
    expect(JSON.parse(fs.readFileSync(`${staleBackup}.1`, "utf8"))).toEqual({
      history: [{ id: "current" }],
    });
  });

  it("ignores legacy stores that do not contain a token", () => {
    writeStore(stableDir, { history: [{ id: "stable" }] });
    writeStore(path.join(appData, "Old"), { history: [{ id: "legacy" }] });

    expect(migrateLegacyUserDataStore({ appData, stableDir, legacyDirs: ["Old"] }))
      .toBe("target-preserved-no-legacy-token");
    expect(readStore(stableDir)).toEqual({ history: [{ id: "stable" }] });
  });
});
