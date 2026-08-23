import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createReferencePresetGroup,
  deleteReferencePresetGroup,
  deleteReferencePreset,
  listReferencePresets,
  moveReferencePresetToGroup,
  readReferencePreset,
  saveReferencePreset,
} from "./reference-presets";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reference-presets-"));
  roots.push(root);
  return root;
}

describe("reference preset persistence", () => {
  it("does not create online game groups before a successful download", async () => {
    const library = await listReferencePresets(temporaryRoot());
    expect(library.groups).toEqual([]);
    expect(library.presets).toHaveLength(0);
  });

  it("prunes legacy empty game groups but preserves occupied and custom groups", async () => {
    const root = temporaryRoot();
    const presetRoot = path.join(root, "reference-presets");
    const imagePath = path.join(presetRoot, "occupied.png");
    fs.mkdirSync(presetRoot, { recursive: true });
    fs.writeFileSync(imagePath, "image");
    fs.writeFileSync(path.join(presetRoot, "library.json"), JSON.stringify({
      version: 1,
      groups: ["原神", "鸣潮", "自定义"],
      presets: [{ id: "occupied", name: "占用", group: "鸣潮", kind: "precise", filePath: imagePath }],
    }));

    const library = await listReferencePresets(root);
    expect(library.groups).toEqual(["鸣潮", "自定义"]);
  });

  it("reuses an existing group instead of creating duplicates", async () => {
    const root = temporaryRoot();
    await createReferencePresetGroup("原神", root);
    await createReferencePresetGroup("原神 · 游戏内角色图", root);
    await saveReferencePreset({
      name: "安柏",
      group: "原神 · 游戏内角色图",
      kind: "precise",
      base64: Buffer.from("image").toString("base64"),
    }, root);
    expect((await listReferencePresets(root)).groups).toContain("原神");
    expect((await listReferencePresets(root)).groups.filter((group) => group === "原神 · 游戏内角色图")).toHaveLength(1);
  });

  it("defaults new vibe preset parameters to one", async () => {
    const root = temporaryRoot();
    const saved = await saveReferencePreset(
      {
        name: "默认氛围",
        kind: "vibe",
        base64: Buffer.from("image").toString("base64"),
        extension: "png",
      },
      root,
    );

    expect(saved.preset).toMatchObject({ infoExtracted: 1, strength: 1 });
  });

  it("saves, reads, groups and deletes a local preset", async () => {
    const root = temporaryRoot();
    const image = Buffer.from("local-image-bytes");
    const saved = await saveReferencePreset(
      {
        name: "角色参考",
        group: "常用",
        kind: "precise",
        base64: image.toString("base64"),
        extension: "jpg",
        preciseType: "character&style",
        strength: 0.8,
        fidelity: 0.9,
        informationExtracted: 0.75,
        width: 832,
        height: 1216,
        sourceId: "genshin/amber/default",
        sourceNames: { "zh-CN": "安柏", "ja-JP": "アンバー", "en-US": "Amber" },
        sourceGameNames: { "zh-CN": "原神", "en-US": "Genshin Impact" },
        sourceGameId: "原神",
        sourceCategory: "游戏内角色图",
      },
      root,
    );

    expect(saved.ok).toBe(true);
    expect(saved.preset).toMatchObject({
      name: "角色参考",
      group: "常用",
      kind: "precise",
      width: 832,
      height: 1216,
      sourceId: "genshin/amber/default",
      sourceNames: { "zh-CN": "安柏", "ja-JP": "アンバー", "en-US": "Amber" },
      sourceGameId: "原神",
      sourceCategory: "游戏内角色图",
    });
    expect(saved.preset?.fileUrl).toMatch(/^file:/);

    const read = await readReferencePreset(saved.preset!.id, root);
    expect(Buffer.from(read.base64!, "base64")).toEqual(image);

    const grouped = await createReferencePresetGroup("备用", root);
    expect(grouped.library?.groups).toEqual(expect.arrayContaining(["常用", "备用"]));

    const moved = await moveReferencePresetToGroup(saved.preset!.id, "备用", root);
    expect(moved.preset?.group).toBe("备用");
    expect((await listReferencePresets(root)).presets[0]?.group).toBe("备用");

    const removedGroup = await deleteReferencePresetGroup("备用", root);
    expect(removedGroup.ok).toBe(true);
    expect(removedGroup.library?.groups).not.toContain("备用");
    expect(removedGroup.library?.presets[0]?.group).toBe("");
    expect(fs.existsSync(saved.preset!.filePath)).toBe(true);

    const deleted = await deleteReferencePreset(saved.preset!.id, root);
    expect(deleted.ok).toBe(true);
    expect((await listReferencePresets(root)).presets).toHaveLength(0);
    expect(fs.existsSync(saved.preset!.filePath)).toBe(false);
  });

  it("drops records when their local image was removed", async () => {
    const root = temporaryRoot();
    const saved = await saveReferencePreset(
      {
        name: "氛围",
        kind: "vibe",
        base64: Buffer.from("image").toString("base64"),
        extension: "png",
        infoExtracted: 0.7,
        strength: 0.6,
      },
      root,
    );
    fs.rmSync(saved.preset!.filePath);
    expect((await listReferencePresets(root)).presets).toHaveLength(0);
  });

  it("recovers detached local images when the library index was overwritten", async () => {
    const root = temporaryRoot();
    const presetRoot = path.join(root, "reference-presets");
    fs.mkdirSync(presetRoot, { recursive: true });
    fs.writeFileSync(path.join(presetRoot, "detached.png"), "image");
    fs.writeFileSync(
      path.join(presetRoot, "library.json"),
      JSON.stringify({ version: 2, groups: [], presets: [] }),
    );

    const library = await listReferencePresets(root);

    expect(library.presets).toHaveLength(1);
    expect(library.presets[0]).toMatchObject({ id: "detached", kind: "precise" });
  });

  it("restores preset names and parameters from sidecars", async () => {
    const root = temporaryRoot();
    const saved = await saveReferencePreset(
      {
        name: "保留名称",
        group: "常用",
        kind: "vibe",
        base64: Buffer.from("image").toString("base64"),
        extension: "webp",
        infoExtracted: 0.65,
        strength: 0.8,
      },
      root,
    );
    fs.writeFileSync(
      path.join(root, "reference-presets", "library.json"),
      JSON.stringify({ version: 2, groups: [], presets: [] }),
    );

    const library = await listReferencePresets(root);

    expect(library.presets[0]).toMatchObject({
      id: saved.preset!.id,
      name: "保留名称",
      group: "常用",
      kind: "vibe",
      infoExtracted: 0.65,
      strength: 0.8,
    });
  });
});
