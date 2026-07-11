import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { atomicWriteFileSync, readWithBackupRecoverySync, rotateBackupsSync } from "./store";

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nai-store-test-"));
  file = path.join(dir, "store.json");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("atomicWriteFileSync", () => {
  it("round-trips content and leaves no stray temp file behind", () => {
    atomicWriteFileSync(file, JSON.stringify({ hello: "world" }));
    expect(fs.readFileSync(file, "utf8")).toBe(JSON.stringify({ hello: "world" }));
    const leftovers = fs.readdirSync(dir).filter((name) => name !== "store.json");
    expect(leftovers).toEqual([]);
  });

  it("a second write fully replaces the first (no partial/torn content)", () => {
    atomicWriteFileSync(file, "first");
    atomicWriteFileSync(file, "second-and-longer-content");
    expect(fs.readFileSync(file, "utf8")).toBe("second-and-longer-content");
  });
});

describe("rotateBackupsSync", () => {
  it("shifts file -> .bak -> .bak2 on successive rotations", () => {
    atomicWriteFileSync(file, "v1");
    rotateBackupsSync(file); // nothing to rotate yet (no prior .bak)
    atomicWriteFileSync(file, "v2");

    rotateBackupsSync(file); // v1 (current file) -> .bak
    atomicWriteFileSync(file, "v3");
    expect(fs.readFileSync(`${file}.bak`, "utf8")).toBe("v2");

    rotateBackupsSync(file); // v2 -> .bak2, v3 -> .bak
    atomicWriteFileSync(file, "v4");
    expect(fs.readFileSync(`${file}.bak`, "utf8")).toBe("v3");
    expect(fs.readFileSync(`${file}.bak2`, "utf8")).toBe("v2");
  });

  it("is a harmless no-op when there is nothing to rotate yet", () => {
    expect(() => rotateBackupsSync(file)).not.toThrow();
    expect(fs.existsSync(`${file}.bak`)).toBe(false);
  });
});

describe("readWithBackupRecoverySync", () => {
  const parse = (raw: string) => JSON.parse(raw) as { value: string };
  const serialize = (v: { value: string }) => JSON.stringify(v);

  it("reads the primary file directly when it is valid", () => {
    atomicWriteFileSync(file, serialize({ value: "primary" }));
    const result = readWithBackupRecoverySync(file, parse, serialize);
    expect(result?.value).toEqual({ value: "primary" });
    expect(result?.recoveredFrom).toBeNull();
  });

  it("recovers from .bak when the primary file is corrupt, and repairs the primary file", () => {
    fs.writeFileSync(file, "{not valid json", "utf8");
    fs.writeFileSync(`${file}.bak`, serialize({ value: "from-bak" }), "utf8");

    const result = readWithBackupRecoverySync(file, parse, serialize);
    expect(result?.value).toEqual({ value: "from-bak" });
    expect(result?.recoveredFrom).toBe(`${file}.bak`);
    // The primary file should now hold the recovered content, atomically.
    expect(fs.readFileSync(file, "utf8")).toBe(serialize({ value: "from-bak" }));
  });

  it("falls through to .bak2 when both the primary file and .bak are unreadable", () => {
    fs.writeFileSync(file, "{not valid json", "utf8");
    fs.writeFileSync(`${file}.bak`, "{also not valid", "utf8");
    fs.writeFileSync(`${file}.bak2`, serialize({ value: "from-bak2" }), "utf8");

    const result = readWithBackupRecoverySync(file, parse, serialize);
    expect(result?.value).toEqual({ value: "from-bak2" });
    expect(result?.recoveredFrom).toBe(`${file}.bak2`);
  });

  it("returns null when the primary file and every backup are unreadable or missing", () => {
    fs.writeFileSync(file, "{not valid json", "utf8");
    const result = readWithBackupRecoverySync(file, parse, serialize);
    expect(result).toBeNull();
  });

  it("returns null when nothing exists yet", () => {
    const result = readWithBackupRecoverySync(file, parse, serialize);
    expect(result).toBeNull();
  });
});
