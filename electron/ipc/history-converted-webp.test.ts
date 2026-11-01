import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HistoryItem } from "../../src/types";

const fixture = vi.hoisted(() => ({ root: "" }));
vi.mock("electron", () => ({
  app: { isPackaged: false, getPath: (key: string) => path.join(fixture.root, key === "exe" ? "install/app.exe" : key) },
  // Deterministic fixture-only encryption, never a real OS keychain or token.
  safeStorage: { isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from("fixture-encrypted:" + value),
    decryptString: (value: Buffer) => value.toString("utf8").slice("fixture-encrypted:".length),
  }, protocol: {},
}));

let store: typeof import("./store");
let output: string;
let directory: string;
let png: Buffer;
let webp: Buffer;
const hash = (value: Buffer) => crypto.createHash("sha256").update(value).digest("hex");

beforeEach(async () => {
  vi.resetModules();
  fixture.root = fs.mkdtempSync(path.join(os.tmpdir(), "nai-webp-reconcile-"));
  output = path.join(fixture.root, "output");
  directory = path.join(output, "2026-10-31", "physical-folder");
  fs.mkdirSync(directory, { recursive: true });
  png = await sharp({ create: { width: 13, height: 9, channels: 4, background: { r: 43, g: 91, b: 152, alpha: 0.7 } } }).png().toBuffer();
  webp = await sharp(png).webp({ lossless: true, exact: true }).toBuffer();
  store = await import("./store");
  store.setSetting("outputDir", output);
  const current = store.readStore();
  store.writeStore({ ...current, historyGroups: [{ id: "chosen-group", name: "Chosen assignment", createdAt: "2026-10-30T00:00:00.000Z" }] });
});

afterEach(() => {
  vi.restoreAllMocks();
  const owned = path.resolve(fixture.root);
  if (!owned.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(owned).startsWith("nai-webp-reconcile-")) throw new Error("Unsafe fixture cleanup path");
  fs.rmSync(owned, { recursive: true, force: true });
});

function item(stem = "original", overrides: Partial<HistoryItem> = {}): HistoryItem {
  return {
    id: "fixture-" + stem, filePath: path.join(directory, stem + ".png"), fileUrl: "fixture://old-" + stem,
    date: "2026-10-31", createdAt: "2026-10-31T11:12:13.000Z", width: 13, height: 9,
    groupId: "chosen-group", actualSeed: 1234, model: "nai-diffusion-4-5-full",
    params: { positivePrompt: "original prompt", negativePrompt: "original negative", privateFixtureOnly: "unchanged-parameter" } as unknown as HistoryItem["params"],
    generatedAt: "2026-10-31T11:12:13.000Z", generatedAtSource: "local-completion", generatedImageSha256: hash(png),
    ...overrides,
  };
}

function seedHistory(value: HistoryItem) {
  fs.writeFileSync(value.filePath, png);
  store.addHistory([value]);
}

function replaceWithWebp(value: HistoryItem, extension = ".webp") {
  const converted = path.join(path.dirname(value.filePath), path.basename(value.filePath, path.extname(value.filePath)) + extension);
  fs.writeFileSync(converted, webp);
  fs.unlinkSync(value.filePath);
  return converted;
}

function expectIdentityPreserved(actual: HistoryItem, original: HistoryItem) {
  expect({ ...actual, filePath: original.filePath, fileUrl: original.fileUrl }).toEqual(original);
}

describe("issue #79 converted WebP history recovery", () => {
  it("force-refresh retains the same row/date/group/params after a real same-folder PNG-to-WebP replacement", async () => {
    const original = item(); seedHistory(original);
    const converted = replaceWithWebp(original); const before = hash(fs.readFileSync(converted));
    const rows = store.getHistory(undefined, undefined, true);
    expect(rows).toHaveLength(1); expectIdentityPreserved(rows[0], original);
    expect(rows[0].filePath).toBe(converted);
    expect(rows[0].fileUrl).toMatch(/^nai-local:/);
    expect(rows[0].fileUrl).toContain(encodeURIComponent("original.webp"));
    expect(store.getHistoryDates()).toContain("2026-10-31");
    expect(store.getHistory("2026-10-31", "chosen-group", true)).toHaveLength(1);
    expect(hash(fs.readFileSync(converted))).toBe(before);
    expect((await sharp(fs.readFileSync(converted)).metadata()).format).toBe("webp");
  });

  it("legacy lazy prune relinks a converted image instead of deleting its indexed identity", () => {
    const original = item(); seedHistory(original); const converted = replaceWithWebp(original);
    expect(store.pruneMissingHistoryItem(original.id)).toBe(false);
    const saved = store.readStore().history.find(row => row.id === original.id)!;
    expect(saved?.filePath).toBe(converted); expectIdentityPreserved(saved, original);
  });

  it("detailed recovery distinguishes relinked, present and removed for renderer URL updates", () => {
    const original = item(); seedHistory(original); const converted = replaceWithWebp(original);
    const recover = (store as any).recoverMissingHistoryItem;
    expect(typeof recover).toBe("function"); if (typeof recover !== "function") return;
    const linked = recover(original.id);
    expect(linked.status).toBe("relinked"); expect(linked.item.filePath).toBe(converted);
    expectIdentityPreserved(linked.item, original);
    expect(recover(original.id).status).toBe("present");
    fs.unlinkSync(converted);
    expect(recover(original.id).status).toBe("removed");
    expect(store.pruneMissingHistoryItem("already-absent")).toBe(false);
  });

  it("does not switch away from a still-present PNG merely because a sibling WebP exists", () => {
    const original = item(); seedHistory(original);
    fs.writeFileSync(path.join(directory, "original.webp"), webp);
    const pngHash = hash(fs.readFileSync(original.filePath));
    const rows = store.getHistory(undefined, undefined, true);
    expect(rows[0].filePath).toBe(original.filePath);
    expect(hash(fs.readFileSync(original.filePath))).toBe(pngHash);
  });

  it("does not capture an unrelated same-stem WebP in another group directory", () => {
    const original = item(); seedHistory(original); fs.unlinkSync(original.filePath);
    const other = path.join(output, "2026-10-31", "other-group"); fs.mkdirSync(other, { recursive: true });
    fs.writeFileSync(path.join(other, "original.webp"), webp);
    expect(store.getHistory(undefined, undefined, true)).toHaveLength(0);
  });

  it("keeps the existing complete-basename moved-PNG recovery working", () => {
    const original = item(); seedHistory(original);
    const other = path.join(output, "2026-10-31", "moved"); fs.mkdirSync(other, { recursive: true });
    const moved = path.join(other, "original.png"); fs.renameSync(original.filePath, moved);
    expect(store.getHistory(undefined, undefined, true)[0].filePath).toBe(moved);
  });

  for (const kind of ["valid", "invalid", "ambiguous", "unreadable"] as const) {
    it(`prefers a ${kind} original-folder WebP decision over an unrelated other-group same-basename PNG`, async () => {
      const original = item(); seedHistory(original); const converted = replaceWithWebp(original);
      const other = path.join(output, "2026-10-31", "unrelated-group"); fs.mkdirSync(other, { recursive: true });
      fs.writeFileSync(path.join(other, "original.png"), await sharp({ create: { width: 13, height: 9, channels: 3, background: "red" } }).png().toBuffer());
      if (kind === "invalid") fs.writeFileSync(converted, Buffer.from("not a WebP"));
      if (kind === "ambiguous") {
        const readdir = fs.readdirSync.bind(fs);
        vi.spyOn(fs, "readdirSync").mockImplementation(((target: any, options: any) => {
          const values = readdir(target, options);
          if (path.resolve(String(target)) !== path.resolve(directory)) return values;
          return options?.withFileTypes ? [...values, { name: "original.WEBP", isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false }]
            : [...values, "original.WEBP"];
        }) as any);
      }
      if (kind === "unreadable") {
        const open = fs.openSync.bind(fs);
        vi.spyOn(fs, "openSync").mockImplementation(((target: any, ...args: any[]) => {
          if (path.resolve(String(target)) === path.resolve(converted)) throw Object.assign(new Error("fixture EACCES"), { code: "EACCES" });
          return (open as any)(target, ...args);
        }) as any);
      }
      const recovered = store.getHistory(undefined, undefined, true);
      expect(recovered).toHaveLength(1);
      expect(recovered[0].filePath).toBe(kind === "valid" ? converted : original.filePath);
      expectIdentityPreserved(recovered[0], original);
    });
  }

  it("builds one directory stem index instead of re-filtering every entry for each cached lookup", async () => {
    for (let index = 0; index < 30; index++) fs.writeFileSync(path.join(directory, `image-${index}.webp`), webp);
    let nameReads = 0;
    const readdir = fs.readdirSync.bind(fs);
    vi.spyOn(fs, "readdirSync").mockImplementation(((target: any, options: any) => {
      const values = readdir(target, options);
      if (!options?.withFileTypes || path.resolve(String(target)) !== path.resolve(directory)) return values;
      return values.map(entry => new Proxy(entry, { get(value, key) {
        if (key === "name") nameReads++;
        const field = Reflect.get(value, key, value);
        return typeof field === "function" ? field.bind(value) : field;
      } }));
    }) as any);
    const { findConvertedWebpCounterpart } = await import("./history-converted-webp");
    const cache = new Map();
    const lookup = (index: number) => findConvertedWebpCounterpart(item(`image-${index}`), cache);
    expect(lookup(0).status).toBe("match"); const afterFirst = nameReads;
    expect(lookup(29).status).toBe("match");
    expect(nameReads - afterFirst).toBeLessThanOrEqual(4);
  });

  for (const kind of ["invalid", "wrong-size", "ambiguous", "unreadable", "linked"] as const) {
    it(`preserves the index rather than guessing or deleting an ${kind} conversion candidate`, async () => {
      const original = item(); seedHistory(original); const converted = replaceWithWebp(original);
      if (kind === "invalid") fs.writeFileSync(converted, Buffer.from("not a WebP"));
      if (kind === "wrong-size") fs.writeFileSync(converted, await sharp({ create: { width: 11, height: 9, channels: 3, background: "red" } }).webp().toBuffer());
      if (kind === "ambiguous") {
        const readdir = fs.readdirSync.bind(fs);
        vi.spyOn(fs, "readdirSync").mockImplementation(((target: any, options: any) => {
          const values = readdir(target, options);
          if (path.resolve(String(target)) !== path.resolve(directory)) return values;
          if (options?.withFileTypes) return [...values, { name: "original.WEBP", isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false }];
          return [...values, "original.WEBP"];
        }) as any);
      }
      if (kind === "unreadable") {
        const open = fs.openSync.bind(fs);
        vi.spyOn(fs, "openSync").mockImplementation(((target: any, ...args: any[]) => {
          if (path.resolve(String(target)) === path.resolve(converted)) throw Object.assign(new Error("fixture EACCES"), { code: "EACCES" });
          return (open as any)(target, ...args);
        }) as any);
      }
      if (kind === "linked") {
        const lstat = fs.lstatSync.bind(fs);
        vi.spyOn(fs, "lstatSync").mockImplementation(((target: any, ...args: any[]) => {
          const value = (lstat as any)(target, ...args);
          return path.resolve(String(target)) === path.resolve(converted) ? { ...value, isFile: () => false, isSymbolicLink: () => true } : value;
        }) as any);
      }
      const rows = store.getHistory(undefined, undefined, true);
      expect(rows).toHaveLength(1); expect(rows[0].filePath).toBe(original.filePath);
      const recover = (store as any).recoverMissingHistoryItem;
      if (typeof recover === "function") expect(recover(original.id).status).toBe("unavailable");
      expect(fs.existsSync(converted)).toBe(true);
    });
  }

  it("recognizes an uppercase WebP extension without changing the original stem", () => {
    const original = item(); seedHistory(original); const converted = replaceWithWebp(original, ".WEBP");
    expect(store.getHistory(undefined, undefined, true)[0]?.filePath).toBe(converted);
  });

  it("does not accept forged RIFF dimensions without an actual image payload", () => {
    const original = item(); seedHistory(original); const converted = replaceWithWebp(original);
    const bad = Buffer.alloc(30); bad.write("RIFF"); bad.writeUInt32LE(22, 4); bad.write("WEBPVP8X", 8); bad.writeUInt32LE(10, 16); bad.writeUIntLE(12, 24, 3); bad.writeUIntLE(8, 27, 3);
    fs.writeFileSync(converted, bad);
    expect(store.getHistory(undefined, undefined, true)).toHaveLength(1);
    expect(store.readStore().history[0].filePath).toBe(original.filePath);
  });
});

describe("explicit converted-WebP recovery from retained own-store history backups", () => {
  function backupPath(suffix: string) { return path.join(fixture.root, "userData", "novelai-image-desktop.json") + suffix; }
  function requireRestore() { const restore = (store as any).restoreConvertedWebpHistory; expect(typeof restore).toBe("function"); return typeof restore === "function" ? restore : undefined; }

  it("restores a pruned row with its original identity without rolling current settings, account or other collections backward", () => {
    const original = item(); seedHistory(original); const converted = replaceWithWebp(original);
    const previous = store.readStore();
    const current = { ...previous, token: "fixture-current-token", account: { balance: 17 } as any, history: [], convertHistory: [{ id: "current-text", result: "keep" }] as any,
      settings: { ...previous.settings, imageNameTemplate: "current-only-template" } };
    store.writeStore(current);
    fs.writeFileSync(backupPath(".bak"), JSON.stringify({ ...previous, token: "fixture-old-token", settings: { outputDir: "do-not-use-old-settings" }, history: [original] }));
    fs.writeFileSync(backupPath(".bak2"), JSON.stringify({ history: [original] }));
    const before = store.readStore(); const imageHash = hash(fs.readFileSync(converted));
    const restore = requireRestore(); if (!restore) return;
    const result = restore();
    expect(result.restored).toBe(1); expect(result.items).toHaveLength(1);
    expect(result.items[0].filePath).toBe(converted); expectIdentityPreserved(result.items[0], original);
    const after = store.readStore();
    expect(after.settings).toEqual(before.settings); expect(after.token).toBe(before.token); expect(after.account).toEqual(before.account);
    expect(after.convertHistory).toEqual(before.convertHistory); expect(after.reverseHistory).toEqual(before.reverseHistory); expect(after.historyGroups).toEqual(before.historyGroups);
    expect(hash(fs.readFileSync(converted))).toBe(imageHash);
    expect(restore().restored).toBe(0);
  });

  it("collects both backup history arrays before its one persistence write rotates either backup", () => {
    const a = item("first"); const b = item("second");
    for (const value of [a, b]) { fs.writeFileSync(value.filePath, png); replaceWithWebp(value); }
    fs.writeFileSync(backupPath(".bak"), JSON.stringify({ history: [a] }));
    fs.writeFileSync(backupPath(".bak2"), JSON.stringify({ history: [b] }));
    const restore = requireRestore(); if (!restore) return;
    const result = restore(); expect(result.restored).toBe(2);
    expect(new Set(store.readStore().history.map(x => x.id))).toEqual(new Set([a.id, b.id]));
  });

  it("keeps a current record with the same ID and a current record already pointing to the converted path authoritative", () => {
    const original = item(); fs.writeFileSync(original.filePath, png); const converted = replaceWithWebp(original);
    const current = item("newer", { id: original.id, filePath: converted, params: { positivePrompt: "current wins" } as any });
    store.addHistory([current]);
    fs.writeFileSync(backupPath(".bak"), JSON.stringify({ history: [original, { ...original, id: "another-old-id" }] }));
    fs.writeFileSync(backupPath(".bak2"), JSON.stringify({ history: [] }));
    const restore = requireRestore(); if (!restore) return;
    expect(restore().restored).toBe(0); expect(store.readStore().history).toEqual([current]);
  });

  it("has no implicit backup merge during an ordinary history refresh", () => {
    const original = item(); fs.writeFileSync(original.filePath, png); replaceWithWebp(original);
    fs.writeFileSync(backupPath(".bak"), JSON.stringify({ history: [original] }));
    expect(store.getHistory(undefined, undefined, true)).toHaveLength(0);
  });

  it("rejects a history backup that changes during its bounded read", () => {
    const original = item(); fs.writeFileSync(original.filePath, png); replaceWithWebp(original);
    const target = backupPath(".bak");
    fs.writeFileSync(target, JSON.stringify({ history: [original] }));
    fs.writeFileSync(backupPath(".bak2"), JSON.stringify({ history: [] }));
    let backupFd: number | undefined;
    const open = fs.openSync.bind(fs), read = fs.readSync.bind(fs);
    vi.spyOn(fs, "openSync").mockImplementation(((file: any, ...args: any[]) => {
      const fd = (open as any)(file, ...args);
      if (path.resolve(String(file)) === path.resolve(target)) backupFd = fd;
      return fd;
    }) as any);
    vi.spyOn(fs, "readSync").mockImplementation(((fd: number, ...args: any[]) => {
      const size = (read as any)(fd, ...args);
      if (fd === backupFd) { backupFd = undefined; fs.appendFileSync(target, " "); }
      return size;
    }) as any);
    const restore = requireRestore(); if (!restore) return;
    expect(restore()).toMatchObject({ restored: 0, backupErrors: 1, backupsRead: 1, items: [] });
    expect(store.readStore().history).toEqual([]);
  });

  it("reports unavailable backup data and no-backup absence rather than inventing old IDs or generation metadata", () => {
    for (const suffix of [".bak", ".bak2"]) if (fs.existsSync(backupPath(suffix))) fs.unlinkSync(backupPath(suffix));
    const restore = requireRestore(); if (!restore) return;
    expect(restore()).toMatchObject({ restored: 0, backupsRead: 0, backupErrors: 0, items: [] });
    fs.writeFileSync(backupPath(".bak"), "{broken-json");
    expect(restore()).toMatchObject({ restored: 0, backupsRead: 0, backupErrors: 1, items: [] });
    expect(store.readStore().history).toEqual([]);
  });
});

describe("JPEG history conversion compatibility", () => {
  for (const extension of [".jpg", ".jpeg"]) {
    async function prepareJpeg() {
      const jpeg = await sharp(png).flatten({ background: "white" }).jpeg().toBuffer();
      const original = item("jpeg-original", { filePath: path.join(directory, "jpeg-original" + extension), generatedImageSha256: hash(jpeg) });
      fs.writeFileSync(original.filePath, jpeg); store.addHistory([original]);
      const converted = path.join(directory, "jpeg-original.webp");
      fs.writeFileSync(converted, await sharp(jpeg).webp({ lossless: true }).toBuffer());
      fs.unlinkSync(original.filePath);
      return { original, converted };
    }

    it(`auto-relinks an actual missing ${extension} JPEG to its unique same-folder WebP`, async () => {
      const { original, converted } = await prepareJpeg();
      const before = hash(fs.readFileSync(converted));
      const rows = store.getHistory(undefined, undefined, true);
      expect(rows).toHaveLength(1); expect(rows[0].filePath).toBe(converted);
      expectIdentityPreserved(rows[0], original);
      expect(hash(fs.readFileSync(converted))).toBe(before);
      expect((await sharp(fs.readFileSync(converted)).metadata()).format).toBe("webp");
    });

    it(`explicitly restores an actual pruned ${extension} JPEG identity from a retained history backup`, async () => {
      const { original, converted } = await prepareJpeg();
      store.writeStore({ ...store.readStore(), history: [] });
      const backup = path.join(fixture.root, "userData", "novelai-image-desktop.json");
      fs.writeFileSync(backup + ".bak", JSON.stringify({ history: [original] }));
      fs.writeFileSync(backup + ".bak2", JSON.stringify({ history: [] }));
      const restore = (store as any).restoreConvertedWebpHistory;
      expect(typeof restore).toBe("function"); if (typeof restore !== "function") return;
      const result = restore();
      expect(result.restored).toBe(1); expect(result.items[0].filePath).toBe(converted);
      expectIdentityPreserved(result.items[0], original);
    });
  }
});
