import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  copyStylePromptPreviewImages,
  reconcileStylePromptPreviewImages,
  stylePromptPreviewDirectory,
} from "./style-preset-images";

const temporary: string[] = [];

afterEach(() => {
  for (const directory of temporary.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("style prompt preview images", () => {
  it("copies selected images into the persistent preset directory and respects slots", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "style-preview-"));
    temporary.push(root);
    const sourceA = path.join(root, "a.png");
    const sourceB = path.join(root, "b.jpg");
    fs.writeFileSync(sourceA, "png");
    fs.writeFileSync(sourceB, "jpg");

    const copied = copyStylePromptPreviewImages(
      [sourceA, sourceB],
      "style/unsafe",
      1,
      root,
    );

    expect(copied).toHaveLength(1);
    expect(fs.existsSync(copied[0].filePath)).toBe(true);
    expect(path.dirname(copied[0].filePath)).toBe(
      stylePromptPreviewDirectory("style/unsafe", root),
    );
    expect(copied[0].fileUrl).toMatch(/^nai-local:\/\/file\//);
  });

  it("ignores unsupported files and never exceeds three images", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "style-preview-"));
    temporary.push(root);
    const sources = ["a.png", "b.jpg", "c.webp", "d.jpeg", "bad.txt"].map(
      (name) => {
        const file = path.join(root, name);
        fs.writeFileSync(file, name);
        return file;
      },
    );
    expect(copyStylePromptPreviewImages(sources, "style", 99, root)).toHaveLength(3);
  });

  it("recovers orphaned preview files when settings metadata was lost", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "style-preview-"));
    temporary.push(root);
    const directory = stylePromptPreviewDirectory("lost-metadata", root);
    fs.mkdirSync(directory, { recursive: true });
    const imageId = "1dbd285d-6e08-4458-905c-f4cad4fa9ae1";
    fs.writeFileSync(path.join(directory, `${imageId}.png`), "png");

    const restored = reconcileStylePromptPreviewImages("lost-metadata", [], root);

    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe(imageId);
    expect(fs.existsSync(path.join(directory, "manifest.json"))).toBe(true);
  });

  it("preserves original names in the independent manifest", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "style-preview-"));
    temporary.push(root);
    const source = path.join(root, "my-style-reference.png");
    fs.writeFileSync(source, "png");
    const copied = copyStylePromptPreviewImages([source], "style", 3, root);

    const restored = reconcileStylePromptPreviewImages("style", [], root);

    expect(restored[0].id).toBe(copied[0].id);
    expect(restored[0].name).toBe("my-style-reference.png");
  });
});
