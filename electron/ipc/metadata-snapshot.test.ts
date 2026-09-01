import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadMetadataSnapshotFile,
  readMetadataSnapshotFromPath,
  saveMetadataSnapshotFile,
  saveMetadataSnapshotFromPath,
} from "./metadata-snapshot";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nai-metadata-snapshot-"));
  roots.push(root);
  return root;
}

describe("metadata snapshot persistence", () => {
  it("survives a new load call from the stable userData directory", async () => {
    const root = tempRoot();
    const bytes = Buffer.from("persistent metadata image");
    expect((await saveMetadataSnapshotFile(root, {
      name: "source.png",
      type: "image/png",
      lastModified: 123,
      base64: bytes.toString("base64"),
    })).ok).toBe(true);

    const loaded = await loadMetadataSnapshotFile(root);
    expect(loaded.ok).toBe(true);
    expect(loaded.snapshot?.name).toBe("source.png");
    expect(Buffer.from(loaded.snapshot!.base64, "base64")).toEqual(bytes);
  });

  it("copies a history image instead of depending on its original path", async () => {
    const root = tempRoot();
    const source = path.join(root, "history.webp");
    fs.writeFileSync(source, "history image bytes");
    expect((await saveMetadataSnapshotFromPath(root, source)).ok).toBe(true);
    fs.rmSync(source);

    const loaded = await loadMetadataSnapshotFile(root);
    expect(loaded.snapshot?.name).toBe("history.webp");
    expect(loaded.snapshot?.type).toBe("image/webp");
    expect(Buffer.from(loaded.snapshot!.base64, "base64").toString()).toBe("history image bytes");
  });

  it("returns the exact history snapshot in the same atomic read operation", async () => {
    const root = tempRoot();
    const source = path.join(root, "selected.png");
    const bytes = Buffer.from("selected history image");
    fs.writeFileSync(source, bytes);

    const result = await readMetadataSnapshotFromPath(root, source);
    expect(result.ok).toBe(true);
    expect(result.snapshot?.name).toBe("selected.png");
    expect(result.snapshot?.type).toBe("image/png");
    expect(Buffer.from(result.snapshot!.base64, "base64")).toEqual(bytes);
  });
});
