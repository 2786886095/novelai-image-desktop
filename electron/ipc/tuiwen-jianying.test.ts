import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  detectJianYingDraftRoot,
  exportTuiwenJianYingDraft,
  validateTuiwenJianYingDraft,
} from "./tuiwen-jianying";
import { createDefaultTuiwenProject, createTuiwenShot } from "../../src/tuiwen/project";

const createdDirs: string[] = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tuiwen-jianying-"));
  createdDirs.push(dir);
  return dir;
}

function writeFakeFile(dir: string, name: string, content = "fake") {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

function isPathInside(rootPath: string, candidatePath: string) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("exportTuiwenJianYingDraft", () => {
  it("writes draft json files and copies media into the draft folder", () => {
    const temp = makeTempDir();
    const imagePath = writeFakeFile(temp, "shot.png", "png");
    const audioPath = writeFakeFile(temp, "voice.mp3", "voice");
    const bgmPath = writeFakeFile(temp, "bgm.mp3", "bgm");
    const project = createDefaultTuiwenProject();
    project.title = "测试草稿";
    project.exportSettings.intro = { text: "片头", durationMs: 1000 };
    project.exportSettings.outro = { text: "片尾", durationMs: 1000 };
    project.exportSettings.bgm = { filePath: bgmPath, volume: 0.2, loop: true, fadeMs: 800 };
    project.panels = [createTuiwenShot("第一句旁白。", 1, 2300)];
    project.panels[0].outputPath = imagePath;
    project.panels[0].audio = { filePath: audioPath, fileUrl: audioPath, durationMs: 2300, source: "import" };

    const result = exportTuiwenJianYingDraft(project, temp);

    expect(result.ok).toBe(true);
    expect(result.validation?.ok).toBe(true);
    expect(result.validation?.errorCount).toBe(0);
    expect(result.validation?.checks.every((check) => check.status !== "error")).toBe(true);
    expect(result.draftPath).toBeTruthy();
    expect(fs.existsSync(result.contentPath!)).toBe(true);
    expect(fs.existsSync(result.metaPath!)).toBe(true);
    expect(fs.existsSync(path.join(result.draftPath!, "draft_virtual_store.json"))).toBe(true);
    expect(fs.readdirSync(path.join(result.draftPath!, "materials", "images")).length).toBeGreaterThanOrEqual(3);
    expect(fs.readdirSync(path.join(result.draftPath!, "materials", "audio")).length).toBe(2);

    const content = JSON.parse(fs.readFileSync(result.contentPath!, "utf8"));
    const meta = JSON.parse(fs.readFileSync(result.metaPath!, "utf8"));
    expect(content.version).toBe(400000);
    expect(content.new_version).toBe("164.0.0");
    expect(content.platform.app_version).toBe("10.9.0");
    expect(content.canvas_config.ratio).toBe("9:16");
    expect(content.materials.videos.length).toBe(3);
    expect(content.materials.audios.length).toBe(2);
    expect(content.materials.texts.map((item: { content: string }) => JSON.parse(item.content).text)).toEqual(["片头", "第一句旁白。", "片尾"]);
    expect(content.tracks.some((track: { type: string }) => track.type === "video")).toBe(true);
    expect(content.tracks.filter((track: { type: string }) => track.type === "audio")).toHaveLength(2);
    expect(content.materials.speeds.length).toBeGreaterThan(0);
    expect(meta.draft_fold_path).toBe(result.draftPath!.replace(/\\/g, "/"));
    expect(meta.tm_duration).toBe(content.duration);
    expect(fs.existsSync(path.join(result.draftPath!, meta.draft_cover))).toBe(true);

    const draftRoot = result.draftPath!.replace(/\\/g, "/");
    const copiedMaterialPaths = [
      ...content.materials.videos.map((item: { path: string }) => item.path),
      ...content.materials.audios.map((item: { path: string }) => item.path),
    ];
    expect(copiedMaterialPaths.every((materialPath) => materialPath.startsWith(draftRoot))).toBe(true);
    const serialized = JSON.stringify(content);
    expect(serialized).not.toContain(imagePath.replace(/\\/g, "/"));
    expect(serialized).not.toContain(audioPath.replace(/\\/g, "/"));
    expect(serialized).not.toContain(bgmPath.replace(/\\/g, "/"));
  });

  it("keeps malicious project and media names inside the selected draft root", () => {
    const temp = makeTempDir();
    const outRoot = path.join(temp, "draft-root");
    const sourceDir = path.join(temp, "source-media");
    fs.mkdirSync(outRoot, { recursive: true });
    fs.mkdirSync(sourceDir, { recursive: true });
    const imagePath = writeFakeFile(sourceDir, "..escape-image.png", "png");
    const audioPath = writeFakeFile(sourceDir, "..escape-voice.mp3", "voice");
    const project = createDefaultTuiwenProject();
    project.title = "..\\outside:/bad*draft?";
    project.exportSettings.intro = { text: "", durationMs: 0 };
    project.exportSettings.outro = { text: "", durationMs: 0 };
    project.panels = [createTuiwenShot("安全边界检查。", 1, 1800)];
    project.panels[0].outputPath = imagePath;
    project.panels[0].audio = { filePath: audioPath, fileUrl: audioPath, durationMs: 1800, source: "import" };

    const result = exportTuiwenJianYingDraft(project, outRoot);

    expect(result.ok).toBe(true);
    expect(result.validation?.ok).toBe(true);
    expect(isPathInside(outRoot, result.draftPath!)).toBe(true);
    expect(path.basename(result.draftPath!)).not.toBe("..");

    const content = JSON.parse(fs.readFileSync(result.contentPath!, "utf8"));
    const meta = JSON.parse(fs.readFileSync(result.metaPath!, "utf8"));
    const materialPaths = [
      ...content.materials.videos.map((item: { path: string }) => item.path),
      ...content.materials.audios.map((item: { path: string }) => item.path),
      path.join(result.draftPath!, meta.draft_cover),
    ].filter(Boolean);
    expect(materialPaths.every((materialPath) => isPathInside(result.draftPath!, materialPath))).toBe(true);
    expect(isPathInside(outRoot, meta.draft_fold_path)).toBe(true);
    expect(meta.draft_root_path).toBe(outRoot.replace(/\\/g, "/"));

    const serialized = JSON.stringify(content);
    expect(serialized).not.toContain(imagePath.replace(/\\/g, "/"));
    expect(serialized).not.toContain(audioPath.replace(/\\/g, "/"));
  });

  it("exports shot keyframes and transitions into Jianying segment structures", () => {
    const temp = makeTempDir();
    const imagePath = writeFakeFile(temp, "shot.png", "png");
    const project = createDefaultTuiwenProject();
    project.exportSettings.intro = { text: "", durationMs: 0 };
    project.exportSettings.outro = { text: "", durationMs: 0 };
    project.panels = [createTuiwenShot("运镜检查。", 1, 2000)];
    project.panels[0].outputPath = imagePath;
    project.panels[0].keyframe = {
      preset: "custom",
      keys: [
        { timeRatio: 0, scale: 1, x: 0, y: 0, alpha: 1, rotation: 0 },
        { timeRatio: 1, scale: 1.2, x: 0.05, y: -0.02, alpha: 0.9, rotation: 15 },
      ],
    };
    project.panels[0].transition = { preset: "slideLeft", durationMs: 400 };

    const result = exportTuiwenJianYingDraft(project, temp);

    expect(result.ok).toBe(true);
    const content = JSON.parse(fs.readFileSync(result.contentPath!, "utf8"));
    const segment = content.tracks.find((track: { type: string }) => track.type === "video").segments[0];
    expect(segment.common_keyframes).toHaveLength(6);
    for (const group of segment.common_keyframes) {
      expect(group.keyframe_list).toHaveLength(2);
      expect(group.keyframe_list.map((key: { time_offset: number }) => key.time_offset)).toEqual([0, 2_000_000]);
    }
    const byType = Object.fromEntries(segment.common_keyframes.map((group: { property_type: string }) => [group.property_type, group]));
    expect(byType.KFTypeScaleX.keyframe_list[1].values[0]).toBeGreaterThan(byType.KFTypeScaleX.keyframe_list[0].values[0]);
    expect(byType.KFTypePositionX.keyframe_list[1].values).toEqual([0.05]);
    expect(byType.KFTypePositionY.keyframe_list[1].values).toEqual([-0.02]);
    expect(byType.KFTypeAlpha.keyframe_list[1].values).toEqual([0.9]);
    expect(byType.KFTypeRotation.keyframe_list[1].values).toEqual([15]);

    expect(content.materials.transitions).toHaveLength(1);
    expect(content.materials.transitions[0]).toMatchObject({
      name: "左移",
      duration: 400_000,
      type: "transition",
    });
    expect(segment.extra_material_refs).toContain(content.materials.transitions[0].id);
  });

  it("uses placeholders and warnings when shot images are missing", () => {
    const temp = makeTempDir();
    const project = createDefaultTuiwenProject();
    project.exportSettings.intro = { text: "", durationMs: 0 };
    project.exportSettings.outro = { text: "", durationMs: 0 };
    project.panels = [createTuiwenShot("缺图镜头。", 1, 1500)];
    project.panels[0].outputPath = path.join(temp, "missing.png");

    const result = exportTuiwenJianYingDraft(project, temp);

    expect(result.ok).toBe(true);
    expect(result.warnings?.[0]).toContain("素材不存在");
    expect(fs.readdirSync(path.join(result.draftPath!, "materials", "images")).length).toBe(1);
    const content = JSON.parse(fs.readFileSync(result.contentPath!, "utf8"));
    expect(content.materials.videos[0].material_name).toContain("missing-shot");
    expect(content.tracks[0].segments[0].extra_material_refs.length).toBeGreaterThan(0);
  });

  it("fails validation when a bundled material is deleted after export", () => {
    const temp = makeTempDir();
    const imagePath = writeFakeFile(temp, "shot.png", "png");
    const project = createDefaultTuiwenProject();
    project.panels = [createTuiwenShot("完整性检查。", 1, 1800)];
    project.panels[0].outputPath = imagePath;

    const result = exportTuiwenJianYingDraft(project, temp);
    const content = JSON.parse(fs.readFileSync(result.contentPath!, "utf8"));
    fs.rmSync(content.materials.videos[0].path);

    const validation = validateTuiwenJianYingDraft(result.draftPath!);

    expect(validation.ok).toBe(false);
    expect(validation.errorCount).toBeGreaterThan(0);
    expect(validation.checks.find((check) => check.id === "media-bundled")?.status).toBe("error");
  });

  it("fails validation when meta no longer matches the draft timeline", () => {
    const temp = makeTempDir();
    const imagePath = writeFakeFile(temp, "shot.png", "png");
    const project = createDefaultTuiwenProject();
    project.panels = [createTuiwenShot("Meta 检查。", 1, 1800)];
    project.panels[0].outputPath = imagePath;

    const result = exportTuiwenJianYingDraft(project, temp);
    const meta = JSON.parse(fs.readFileSync(result.metaPath!, "utf8"));
    meta.tm_duration += 1;
    fs.writeFileSync(result.metaPath!, JSON.stringify(meta), "utf8");

    const validation = validateTuiwenJianYingDraft(result.draftPath!);

    expect(validation.ok).toBe(false);
    expect(validation.checks.find((check) => check.id === "meta-consistency")?.status).toBe("error");
  });

  it("detects the Jianying draft root under LOCALAPPDATA", () => {
    const temp = makeTempDir();
    const expected = path.join(temp, "JianyingPro", "User Data", "Projects", "com.lveditor.draft");
    fs.mkdirSync(expected, { recursive: true });
    expect(detectJianYingDraftRoot(temp)).toBe(expected);
  });

  it("prefers Jianying's configured custom draft root", () => {
    const temp = makeTempDir();
    const custom = path.join(temp, "Custom Drafts");
    const configDir = path.join(temp, "JianyingPro", "User Data", "Config");
    fs.mkdirSync(custom, { recursive: true });
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "globalSetting"),
      `[General]\ncurrentCustomDraftPath=${custom.replace(/\\/g, "\\\\")}\n`,
    );
    expect(detectJianYingDraftRoot(temp)).toBe(custom);
  });
});
