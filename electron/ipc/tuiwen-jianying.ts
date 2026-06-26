import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";
import type {
  TuiwenDraftValidationCheck,
  TuiwenDraftValidationResult,
  TuiwenExportJianYingResult,
  TuiwenProject,
  TuiwenShot,
} from "../../src/types";
import { buildTuiwenAspectPlan } from "../../src/tuiwen/aspect";
import { wrapTuiwenSubtitle } from "../../src/tuiwen/audio";

type JsonObject = Record<string, unknown>;
type TrackType = "video" | "audio" | "text";

interface CopiedMedia {
  id: string;
  originalPath: string;
  draftPath: string;
  materialName: string;
}

interface DraftTrack {
  id: string;
  type: TrackType;
  flag: number;
  attribute: number;
  name: string;
  is_default_name: boolean;
  segments: JsonObject[];
}

interface DraftValidationExpectations {
  videoCount?: number;
  audioCount?: number;
  textCount?: number;
  durationUs?: number;
}

const JIANYING_TARGET = {
  label: "剪映 10.9.0.14196 / draft 400000 / 164.0.0",
  version: 400000,
  newVersion: "164.0.0",
  appVersion: "10.9.0",
} as const;

const TRANSITIONS: Partial<Record<NonNullable<TuiwenShot["transition"]>["preset"], {
  name: string;
  resourceId: string;
  effectId: string;
  overlap: boolean;
}>> = {
  fade: { name: "叠化", resourceId: "6724845717472416269", effectId: "322577", overlap: true },
  slideLeft: { name: "左移", resourceId: "6726711499676455435", effectId: "2917286", overlap: true },
  slideRight: { name: "右移", resourceId: "6726711296063967748", effectId: "2917287", overlap: true },
  zoom: { name: "推近", resourceId: "6724226861666144779", effectId: "359359", overlap: false },
  wipe: { name: "向右擦除", resourceId: "6724849898857959950", effectId: "2917284", overlap: true },
};

function safeName(input: string, fallback = "novel-tuiwen") {
  const cleaned = input
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return cleaned || fallback;
}

function msToUs(ms: number) {
  return Math.max(0, Math.round(ms * 1000));
}

function normalizePath(filePath: string) {
  return path.resolve(filePath).replace(/\\/g, "/");
}

function toFsPath(input: string | undefined) {
  if (!input) return "";
  if (input.startsWith("file://")) return fileURLToPath(input);
  return input;
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath: string, data: unknown) {
  const text = JSON.stringify(data);
  fs.writeFileSync(filePath, text, "utf8");
  return Buffer.byteLength(text, "utf8");
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecordArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readJsonObject(filePath: string) {
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!isRecord(parsed)) throw new Error("JSON 顶层不是对象");
  return parsed;
}

function isPathInside(rootPath: string, candidatePath: string) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function validationCheck(
  checks: TuiwenDraftValidationCheck[],
  id: string,
  label: string,
  passed: boolean,
  passDetail: string,
  failDetail: string,
  failureStatus: "warning" | "error" = "error",
) {
  checks.push({
    id,
    label,
    status: passed ? "pass" : failureStatus,
    detail: passed ? passDetail : failDetail,
  });
}

function copyMedia(sourcePath: string, mediaDir: string, prefix: string, warnings: string[]): CopiedMedia | null {
  const fsPath = toFsPath(sourcePath);
  if (!fsPath || !fs.existsSync(fsPath)) {
    warnings.push(`素材不存在，已使用占位或跳过：${sourcePath || "(空路径)"}`);
    return null;
  }
  const ext = path.extname(fsPath) || ".bin";
  const materialName = `${prefix}-${randomUUID()}${ext}`;
  const draftPath = path.join(mediaDir, materialName);
  fs.copyFileSync(fsPath, draftPath);
  return { id: randomUUID(), originalPath: fsPath, draftPath, materialName };
}

function writePlaceholder(mediaDir: string, prefix: string, width: number, height: number): CopiedMedia {
  const materialName = `${prefix}-${randomUUID()}.png`;
  const draftPath = path.join(mediaDir, materialName);
  const png = new PNG({ width, height });
  for (let offset = 0; offset < png.data.length; offset += 4) {
    png.data[offset] = 17;
    png.data[offset + 1] = 24;
    png.data[offset + 2] = 39;
    png.data[offset + 3] = 255;
  }
  fs.writeFileSync(draftPath, PNG.sync.write(png));
  return { id: randomUUID(), originalPath: "", draftPath, materialName };
}

function emptyMaterials() {
  const keys = [
    "flowers", "videos", "tail_leaders", "audios", "images", "texts", "effects", "stickers", "canvases",
    "transitions", "audio_effects", "audio_fades", "beats", "material_animations", "placeholders",
    "placeholder_infos", "speeds", "common_mask", "chromas", "text_templates", "realtime_denoises",
    "video_trackings", "hsl", "drafts", "color_curves", "primary_color_wheels", "log_color_wheels",
    "video_effects", "audio_balances", "handwrites", "manual_deformations", "plugin_effects",
    "sound_channel_mappings", "green_screens", "shapes", "material_colors", "digital_humans", "smart_crops",
    "ai_translates", "audio_track_indexes", "loudnesses", "vocal_beautifys", "vocal_separations",
    "smart_relights", "time_marks", "multi_language_refs",
  ];
  return Object.fromEntries(keys.map((key) => [key, []])) as Record<string, JsonObject[]>;
}

function makeTrack(type: TrackType, name: string): DraftTrack {
  return {
    id: randomUUID(),
    type,
    flag: 0,
    attribute: 0,
    name,
    is_default_name: false,
    segments: [],
  };
}

function makeSpeed(materials: Record<string, JsonObject[]>, speed = 1) {
  const id = randomUUID();
  materials.speeds.push({ id, type: "speed", mode: 0, speed, curve_speed: null });
  return id;
}

function segmentDefaults(materialId: string, startUs: number, durationUs: number, renderIndex: number) {
  return {
    id: randomUUID(),
    desc: "",
    state: 0,
    speed: 1,
    is_loop: false,
    is_tone_modify: false,
    reverse: false,
    intensifies_audio: false,
    cartoon: false,
    volume: 1,
    last_nonzero_volume: 1,
    material_id: materialId,
    render_index: renderIndex,
    enable_lut: true,
    enable_adjust: true,
    enable_hsl: true,
    visible: true,
    group_id: "",
    enable_color_curves: true,
    track_render_index: renderIndex,
    enable_color_wheels: true,
    track_attribute: 0,
    is_placeholder: false,
    template_id: "",
    enable_smart_color_adjust: false,
    template_scene: "default",
    enable_color_match_adjust: false,
    enable_color_correct_adjust: false,
    enable_adjust_mask: true,
    raw_segment_id: "",
    enable_video_mask: true,
    offset: 0,
    target_timerange: { start: startUs, duration: durationUs },
    render_timerange: { start: 0, duration: 0 },
    responsive_layout: {
      enable: false,
      target_follow: "",
      size_layout: 0,
      horizontal_pos_layout: 0,
      vertical_pos_layout: 0,
    },
    lyric_keyframes: null,
    keyframe_refs: [],
    common_keyframes: [],
  };
}

function keyframePoint(timeOffset: number, value: number) {
  return {
    id: randomUUID(),
    curveType: "Line",
    string_value: "",
    graphID: "",
    time_offset: timeOffset,
    left_control: { x: 0, y: 0 },
    right_control: { x: 0, y: 0 },
    graph: { id: "", resource_id: "", resource_name: "", graph_points: [] },
    values: [value],
  };
}

function buildKeyframes(shot: TuiwenShot, durationUs: number, coverScale: number) {
  const keys = shot.keyframe?.keys ?? [];
  if (keys.length <= 1) return [];
  const makeList = (propertyType: string, pick: (key: (typeof keys)[number]) => number) => ({
    id: randomUUID(),
    material_id: "",
    property_type: propertyType,
    keyframe_list: keys.map((key) =>
      keyframePoint(Math.min(durationUs, Math.max(0, Math.round(durationUs * key.timeRatio))), pick(key))),
  });
  return [
    makeList("KFTypeScaleX", (key) => coverScale * key.scale),
    makeList("KFTypeScaleY", (key) => coverScale * key.scale),
    makeList("KFTypePositionX", (key) => key.x),
    makeList("KFTypePositionY", (key) => key.y),
    makeList("KFTypeAlpha", (key) => key.alpha),
    makeList("KFTypeRotation", (key) => key.rotation),
  ];
}

function videoMaterial(media: CopiedMedia, width: number, height: number): JsonObject {
  return {
    id: media.id,
    material_id: media.id,
    local_material_id: "",
    material_name: media.materialName,
    path: normalizePath(media.draftPath),
    media_path: "",
    type: "photo",
    duration: 10_800_000_000,
    width,
    height,
    category_id: "",
    category_name: "local",
    check_flag: 63487,
    crop_ratio: "free",
    crop_scale: 1,
    crop: {
      upper_left_x: 0, upper_left_y: 0, upper_right_x: 1, upper_right_y: 0,
      lower_left_x: 0, lower_left_y: 1, lower_right_x: 1, lower_right_y: 1,
    },
    audio_fade: null,
    has_audio: false,
    reverse_path: "",
    intensifies_path: "",
    reverse_intensifies_path: "",
    intensifies_audio_path: "",
    cartoon_path: "",
    material_url: "",
    source: 0,
    source_platform: 0,
  };
}

function addTransition(
  materials: Record<string, JsonObject[]>,
  segment: JsonObject,
  transition: TuiwenShot["transition"],
  maxDurationUs: number,
) {
  if (!transition || transition.preset === "none") return;
  const spec = TRANSITIONS[transition.preset];
  if (!spec) return;
  const id = randomUUID();
  const duration = Math.min(msToUs(transition.durationMs), Math.max(0, Math.floor(maxDurationUs / 2)));
  if (duration <= 0) return;
  materials.transitions.push({
    category_id: "",
    category_name: "",
    duration,
    effect_id: spec.effectId,
    id,
    is_overlap: spec.overlap,
    name: spec.name,
    platform: "all",
    resource_id: spec.resourceId,
    type: "transition",
  });
  (segment.extra_material_refs as string[]).push(id);
}

function makeVideoSegment(
  materials: Record<string, JsonObject[]>,
  materialId: string,
  startUs: number,
  durationUs: number,
  coverScale: number,
  shot?: TuiwenShot,
) {
  const speedId = makeSpeed(materials);
  const segment: JsonObject = {
    ...segmentDefaults(materialId, startUs, durationUs, 0),
    volume: 0,
    source_timerange: { start: 0, duration: durationUs },
    clip: {
      rotation: 0,
      alpha: 1,
      scale: { x: coverScale, y: coverScale },
      transform: { x: 0, y: 0 },
      flip: { vertical: false, horizontal: false },
    },
    uniform_scale: { on: false, value: 1 },
    hdr_settings: { mode: 1, intensity: 1, nits: 1000 },
    caption_info: null,
    extra_material_refs: [speedId],
    common_keyframes: shot ? buildKeyframes(shot, durationUs, coverScale) : [],
  };
  if (shot) addTransition(materials, segment, shot.transition, durationUs);
  return segment;
}

function parseHexColor(value: string | undefined, fallback: [number, number, number]) {
  const match = /^#?([0-9a-f]{6})$/i.exec(value ?? "");
  if (!match) return fallback;
  return [
    Number.parseInt(match[1].slice(0, 2), 16) / 255,
    Number.parseInt(match[1].slice(2, 4), 16) / 255,
    Number.parseInt(match[1].slice(4, 6), 16) / 255,
  ] as [number, number, number];
}

function makeTextMaterial(
  id: string,
  text: string,
  fontSize: number,
  color: string | undefined,
  strokeColor: string | undefined,
  subtitle: boolean,
) {
  const size = Math.max(4, Math.min(18, fontSize / 6));
  const content = {
    text,
    styles: [{
      fill: {
        alpha: 1,
        content: { render_type: "solid", solid: { alpha: 1, color: parseHexColor(color, [1, 1, 1]) } },
      },
      font: { id: "", path: "" },
      strokes: [{
        width: 0.06,
        alpha: 1,
        content: { render_type: "solid", solid: { alpha: 1, color: parseHexColor(strokeColor, [0, 0, 0]) } },
      }],
      range: [0, text.length],
      size,
    }],
  };
  return {
    id,
    name: "",
    type: subtitle ? "subtitle" : "text",
    content: JSON.stringify(content),
    base_content: "",
    global_alpha: 1,
    alignment: 1,
    letter_spacing: 0,
    line_spacing: 0.2,
    line_feed: 1,
    line_max_width: subtitle ? 0.82 : 0.75,
    force_apply_line_max_width: false,
    check_flag: 15,
    text,
    font_size: size,
    text_color: color ?? "#ffffff",
    border_color: strokeColor ?? "#000000",
    border_width: 0.06,
    background_style: 0,
    typesetting: 0,
  };
}

function makeTextSegment(materialId: string, startUs: number, durationUs: number, position: "bottom" | "top" | "center") {
  const transformY = position === "bottom" ? -0.72 : position === "top" ? 0.72 : 0;
  return {
    ...segmentDefaults(materialId, startUs, durationUs, 15_000),
    source_timerange: null,
    clip: {
      rotation: 0,
      alpha: 1,
      scale: { x: 1, y: 1 },
      transform: { x: 0, y: transformY },
      flip: { vertical: false, horizontal: false },
    },
    uniform_scale: { on: true, value: 1 },
    hdr_settings: null,
    caption_info: null,
    extra_material_refs: [],
  };
}

function audioMaterial(media: CopiedMedia, durationUs: number, name: string): JsonObject {
  return {
    app_id: 0,
    category_id: "",
    category_name: "local",
    check_flag: 3,
    copyright_limit_type: "none",
    duration: durationUs,
    effect_id: "",
    formula_id: "",
    id: media.id,
    local_material_id: media.id,
    music_id: media.id,
    name,
    path: normalizePath(media.draftPath),
    source_platform: 0,
    type: "extract_music",
    wave_points: [],
  };
}

function makeAudioSegment(
  materials: Record<string, JsonObject[]>,
  materialId: string,
  startUs: number,
  durationUs: number,
  volume: number,
  fadeMs = 0,
) {
  const speedId = makeSpeed(materials);
  const extraRefs = [speedId];
  if (fadeMs > 0) {
    const fadeId = randomUUID();
    const fadeUs = Math.min(msToUs(fadeMs), Math.floor(durationUs / 2));
    materials.audio_fades.push({
      id: fadeId,
      fade_in_duration: fadeUs,
      fade_out_duration: fadeUs,
      fade_type: 0,
      type: "audio_fade",
    });
    extraRefs.push(fadeId);
  }
  return {
    ...segmentDefaults(materialId, startUs, durationUs, 0),
    volume,
    source_timerange: { start: 0, duration: durationUs },
    clip: null,
    uniform_scale: null,
    hdr_settings: null,
    caption_info: null,
    extra_material_refs: extraRefs,
  };
}

function draftConfig() {
  return {
    video_mute: false,
    record_audio_last_index: 1,
    extract_audio_last_index: 1,
    original_sound_last_index: 1,
    subtitle_recognition_id: "",
    lyrics_recognition_id: "",
    subtitle_sync: true,
    lyrics_sync: true,
    sticker_max_index: 1,
    adjust_max_index: 1,
    material_save_mode: 0,
    maintrack_adsorb: true,
    combination_max_index: 1,
    multi_language_mode: "none",
    multi_language_main: "none",
    multi_language_current: "none",
    export_range: null,
    zoom_info_params: null,
    subtitle_keywords_config: null,
    subtitle_taskinfo: [],
    lyrics_taskinfo: [],
    attachment_info: [],
    system_font_list: [],
    multi_language_list: [],
  };
}

export function detectJianYingDraftRoot(localAppData = process.env.LOCALAPPDATA ?? "") {
  if (!localAppData) return null;
  const globalSetting = path.join(localAppData, "JianyingPro", "User Data", "Config", "globalSetting");
  try {
    const text = fs.readFileSync(globalSetting, "utf8");
    const customValue = /^currentCustomDraftPath=(.+)$/m.exec(text)?.[1]?.trim();
    if (customValue) {
      const customPath = customValue.replace(/\\\\/g, "\\");
      if (fs.existsSync(customPath)) return customPath;
    }
  } catch {
    // Missing or unreadable config: fall back to the standard locations.
  }
  const candidates = [
    path.join(localAppData, "JianyingPro", "User Data", "Projects", "com.lveditor.draft"),
    path.join(localAppData, "CapCut", "User Data", "Projects", "com.lveditor.draft"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function validateTuiwenJianYingDraft(
  draftPath: string,
  expectations: DraftValidationExpectations = {},
): TuiwenDraftValidationResult {
  const checks: TuiwenDraftValidationCheck[] = [];
  const contentPath = path.join(draftPath, "draft_content.json");
  const metaPath = path.join(draftPath, "draft_meta_info.json");
  const virtualStorePath = path.join(draftPath, "draft_virtual_store.json");
  const requiredFiles = [contentPath, metaPath, virtualStorePath];
  const requiredFilesPresent = requiredFiles.every((filePath) =>
    fs.existsSync(filePath) && fs.statSync(filePath).isFile());
  validationCheck(
    checks,
    "required-files",
    "草稿三件套",
    requiredFilesPresent,
    "draft_content.json、draft_meta_info.json、draft_virtual_store.json 均存在。",
    "草稿三件套不完整。",
  );

  let content: JsonObject | null = null;
  let meta: JsonObject | null = null;
  let virtualStore: JsonObject | null = null;
  try {
    content = readJsonObject(contentPath);
    meta = readJsonObject(metaPath);
    virtualStore = readJsonObject(virtualStorePath);
    validationCheck(checks, "json-readable", "JSON 可读性", true, "三份草稿文件均为有效明文 JSON。", "");
  } catch (error) {
    validationCheck(
      checks,
      "json-readable",
      "JSON 可读性",
      false,
      "",
      `无法解析草稿 JSON：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (content && meta && virtualStore) {
    const targetVersionOk = content.version === JIANYING_TARGET.version
      && content.new_version === JIANYING_TARGET.newVersion
      && isRecord(content.platform)
      && content.platform.app_version === JIANYING_TARGET.appVersion;
    validationCheck(
      checks,
      "target-version",
      "目标版本锁定",
      targetVersionOk,
      JIANYING_TARGET.label,
      `版本不匹配：version=${String(content.version)}，new_version=${String(content.new_version)}，app=${String(isRecord(content.platform) ? content.platform.app_version : "")}`,
    );

    const durationUs = typeof content.duration === "number" ? content.duration : 0;
    validationCheck(
      checks,
      "duration",
      "总时长",
      durationUs > 0 && (expectations.durationUs === undefined || durationUs === expectations.durationUs),
      `时间线总时长 ${durationUs} 微秒，与导出计划一致。`,
      `时间线时长异常：实际 ${durationUs}，期望 ${expectations.durationUs ?? "> 0"}。`,
    );

    const materials = isRecord(content.materials) ? content.materials : {};
    const videos = asRecordArray(materials.videos);
    const audios = asRecordArray(materials.audios);
    const texts = asRecordArray(materials.texts);
    const materialCountsOk = videos.length > 0
      && (expectations.videoCount === undefined || videos.length === expectations.videoCount)
      && (expectations.audioCount === undefined || audios.length === expectations.audioCount)
      && (expectations.textCount === undefined || texts.length === expectations.textCount);
    validationCheck(
      checks,
      "material-counts",
      "素材数量",
      materialCountsOk,
      `图片 ${videos.length}、音频 ${audios.length}、文字 ${texts.length}。`,
      `素材数量异常：图片 ${videos.length}/${expectations.videoCount ?? "至少 1"}，音频 ${audios.length}/${expectations.audioCount ?? "任意"}，文字 ${texts.length}/${expectations.textCount ?? "任意"}。`,
    );

    const pathMaterials = [...videos, ...audios];
    const invalidMaterialPaths = pathMaterials.filter((material) => {
      const materialPath = typeof material.path === "string" ? material.path : "";
      return !materialPath || !isPathInside(draftPath, materialPath) || !fs.existsSync(materialPath);
    });
    validationCheck(
      checks,
      "media-bundled",
      "素材复制与内聚",
      invalidMaterialPaths.length === 0,
      `${pathMaterials.length} 个图像/音频素材均位于草稿目录内且文件存在。`,
      `${invalidMaterialPaths.length} 个素材路径越界、为空或文件不存在。`,
    );

    const allMaterialIds = new Set<string>();
    for (const collection of Object.values(materials)) {
      for (const material of asRecordArray(collection)) {
        if (typeof material.id === "string" && material.id) allMaterialIds.add(material.id);
      }
    }
    const tracks = asRecordArray(content.tracks);
    const segments = tracks.flatMap((track) => asRecordArray(track.segments));
    const danglingSegments = segments.filter((segment) =>
      typeof segment.material_id !== "string" || !allMaterialIds.has(segment.material_id));
    const danglingExtraRefs = segments.flatMap((segment) =>
      Array.isArray(segment.extra_material_refs)
        ? segment.extra_material_refs.filter((id) => typeof id !== "string" || !allMaterialIds.has(id))
        : []);
    validationCheck(
      checks,
      "material-references",
      "轨道素材引用",
      danglingSegments.length === 0 && danglingExtraRefs.length === 0,
      `${segments.length} 个轨道片段的素材与附加素材引用均可解析。`,
      `发现 ${danglingSegments.length} 个无效主素材引用、${danglingExtraRefs.length} 个无效附加素材引用。`,
    );

    const invalidRanges = segments.filter((segment) => {
      if (!isRecord(segment.target_timerange)) return true;
      const start = segment.target_timerange.start;
      const duration = segment.target_timerange.duration;
      return typeof start !== "number"
        || typeof duration !== "number"
        || start < 0
        || duration <= 0
        || start + duration > durationUs;
    });
    const videoTracks = tracks.filter((track) => track.type === "video");
    const videoSegments = videoTracks.flatMap((track) => asRecordArray(track.segments));
    const videoEndUs = videoSegments.reduce((max, segment) => {
      if (!isRecord(segment.target_timerange)) return max;
      const start = typeof segment.target_timerange.start === "number" ? segment.target_timerange.start : 0;
      const duration = typeof segment.target_timerange.duration === "number" ? segment.target_timerange.duration : 0;
      return Math.max(max, start + duration);
    }, 0);
    validationCheck(
      checks,
      "timeline-ranges",
      "时间轴范围",
      invalidRanges.length === 0 && videoSegments.length > 0 && videoEndUs === durationUs,
      `${segments.length} 个片段均在总时长内，主视频完整覆盖至 ${videoEndUs} 微秒。`,
      `发现 ${invalidRanges.length} 个越界/空时长片段，主视频末端 ${videoEndUs}，总时长 ${durationUs}。`,
    );

    const invalidKeyframes = videoSegments.flatMap((segment) => {
      const segmentDuration = isRecord(segment.target_timerange) && typeof segment.target_timerange.duration === "number"
        ? segment.target_timerange.duration
        : 0;
      return asRecordArray(segment.common_keyframes).flatMap((group) =>
        asRecordArray(group.keyframe_list).filter((keyframe) =>
          typeof keyframe.time_offset !== "number"
          || keyframe.time_offset < 0
          || keyframe.time_offset > segmentDuration
          || !Array.isArray(keyframe.values)
          || keyframe.values.some((value) => typeof value !== "number" || !Number.isFinite(value))));
    });
    validationCheck(
      checks,
      "keyframes",
      "关键帧数值",
      invalidKeyframes.length === 0,
      "关键帧偏移与数值均有效。",
      `发现 ${invalidKeyframes.length} 个越界或非数值关键帧。`,
    );

    const normalizedDraftPath = normalizePath(draftPath);
    const metaConsistent = meta.draft_fold_path === normalizedDraftPath
      && meta.draft_root_path === normalizePath(path.dirname(draftPath))
      && meta.draft_name === content.name
      && meta.tm_duration === durationUs
      && typeof meta.draft_id === "string"
      && meta.draft_id.length > 0;
    validationCheck(
      checks,
      "meta-consistency",
      "Meta 自洽",
      metaConsistent,
      "草稿名称、目录、根目录、ID 与时长均自洽。",
      "draft_meta_info.json 与草稿目录或主时间线不一致。",
    );

    const coverPath = typeof meta.draft_cover === "string" && meta.draft_cover
      ? path.join(draftPath, meta.draft_cover)
      : "";
    validationCheck(
      checks,
      "cover",
      "草稿封面",
      Boolean(coverPath) && fs.existsSync(coverPath),
      `草稿封面已生成：${path.basename(coverPath)}`,
      "草稿封面字段为空或封面文件不存在。",
      "warning",
    );

    const virtualEntries = Array.isArray(virtualStore.draft_virtual_store)
      ? virtualStore.draft_virtual_store
      : [];
    validationCheck(
      checks,
      "virtual-store",
      "虚拟素材仓",
      virtualEntries.length > 0,
      `draft_virtual_store.json 含 ${virtualEntries.length} 个仓位。`,
      "draft_virtual_store.json 缺少 draft_virtual_store 数组。",
    );
  }

  const errorCount = checks.filter((check) => check.status === "error").length;
  const warningCount = checks.filter((check) => check.status === "warning").length;
  return {
    ok: errorCount === 0,
    targetVersion: JIANYING_TARGET.label,
    checkedAt: Date.now(),
    errorCount,
    warningCount,
    checks,
  };
}

export function exportTuiwenJianYingDraft(project: TuiwenProject, outDir: string): TuiwenExportJianYingResult {
  const warnings: string[] = [];
  if (!project.panels.length) return { ok: false, message: "没有可导出的小说推文分镜。", warnings };
  if (!outDir || !fs.existsSync(outDir)) {
    return { ok: false, message: `剪映草稿根目录不存在：${outDir || "(空路径)"}`, warnings };
  }

  const contentId = randomUUID();
  const draftId = randomUUID().toUpperCase();
  const draftName = safeName(project.title, "小说推文草稿");
  const folderName = `${draftName}-${Date.now()}`;
  const draftPath = path.join(outDir, folderName);
  const imageDir = path.join(draftPath, "materials", "images");
  const audioDir = path.join(draftPath, "materials", "audio");
  ensureDir(imageDir);
  ensureDir(audioDir);

  const materials = emptyMaterials();
  const videoTrack = makeTrack("video", "Main Video");
  const subtitleTrack = makeTrack("text", "Subtitle");
  const voiceTrack = makeTrack("audio", "Voice");
  const bgmTrack = makeTrack("audio", "BGM");
  const aspectPlan = buildTuiwenAspectPlan(project.exportSettings, project.globalParams);
  const copiedImages: CopiedMedia[] = [];

  const addImage = (media: CopiedMedia, startUs: number, durationUs: number, shot?: TuiwenShot) => {
    copiedImages.push(media);
    materials.videos.push(videoMaterial(media, project.globalParams.width, project.globalParams.height));
    videoTrack.segments.push(makeVideoSegment(
      materials,
      media.id,
      startUs,
      durationUs,
      aspectPlan.cover.scaleToCover,
      shot,
    ));
  };

  const addText = (
    text: string,
    startUs: number,
    durationUs: number,
    position: "bottom" | "top" | "center",
    subtitle: boolean,
  ) => {
    const id = randomUUID();
    const style = subtitle ? project.exportSettings.subtitleDefault : {
      fontSize: 64,
      color: "#ffffff",
      strokeColor: "#111827",
      position: "center" as const,
    };
    materials.texts.push(makeTextMaterial(
      id,
      text,
      style?.fontSize ?? (subtitle ? 44 : 64),
      style?.color,
      style?.strokeColor,
      subtitle,
    ));
    subtitleTrack.segments.push(makeTextSegment(id, startUs, durationUs, position));
  };

  let cursorUs = 0;
  const intro = project.exportSettings.intro;
  if (intro?.text.trim() && intro.durationMs > 0) {
    const durationUs = msToUs(intro.durationMs);
    addImage(writePlaceholder(imageDir, "intro", project.globalParams.width, project.globalParams.height), cursorUs, durationUs);
    addText(intro.text.trim(), cursorUs, durationUs, "center", false);
    cursorUs += durationUs;
  }

  for (const shot of [...project.panels].sort((a, b) => a.index - b.index)) {
    const durationUs = msToUs(shot.durationMs || project.exportSettings.defaultShotDurationMs);
    const media = copyMedia(
      shot.outputPath || shot.outputUrl || "",
      imageDir,
      `shot-${String(shot.index).padStart(3, "0")}`,
      warnings,
    ) ?? writePlaceholder(imageDir, `missing-shot-${String(shot.index).padStart(3, "0")}`, project.globalParams.width, project.globalParams.height);
    addImage(media, cursorUs, durationUs, shot);

    if (shot.audio?.filePath || shot.audio?.fileUrl) {
      const audio = copyMedia(
        shot.audio.filePath || shot.audio.fileUrl,
        audioDir,
        `voice-${String(shot.index).padStart(3, "0")}`,
        warnings,
      );
      if (audio) {
        const audioDurationUs = msToUs(shot.audio.durationMs || shot.durationMs);
        materials.audios.push(audioMaterial(audio, audioDurationUs, `Voice ${shot.index}`));
        voiceTrack.segments.push(makeAudioSegment(materials, audio.id, cursorUs, Math.min(durationUs, audioDurationUs), 1));
      }
    }

    if (shot.subtitle.enabled && shot.subtitle.text.trim()) {
      const text = wrapTuiwenSubtitle(shot.subtitle.text);
      addText(
        text,
        cursorUs,
        durationUs,
        shot.subtitle.style?.position ?? project.exportSettings.subtitleDefault?.position ?? "bottom",
        true,
      );
    }
    cursorUs += durationUs;
  }

  const outro = project.exportSettings.outro;
  if (outro?.text.trim() && outro.durationMs > 0) {
    const durationUs = msToUs(outro.durationMs);
    addImage(writePlaceholder(imageDir, "outro", project.globalParams.width, project.globalParams.height), cursorUs, durationUs);
    addText(outro.text.trim(), cursorUs, durationUs, "center", false);
    cursorUs += durationUs;
  }

  if (project.exportSettings.bgm?.filePath) {
    const bgm = copyMedia(project.exportSettings.bgm.filePath, audioDir, "bgm", warnings);
    if (bgm) {
      materials.audios.push(audioMaterial(bgm, cursorUs, "Background Music"));
      bgmTrack.segments.push(makeAudioSegment(
        materials,
        bgm.id,
        0,
        cursorUs,
        project.exportSettings.bgm.volume,
        project.exportSettings.bgm.fadeMs,
      ));
      if (project.exportSettings.bgm.loop) {
        warnings.push("BGM 已铺满时间线；若原音频短于成片，请在剪映中确认循环衔接。");
      }
    }
  }

  const nowUs = Date.now() * 1000;
  const platform = {
    os: "windows",
    os_version: "",
    app_version: "10.9.0",
    app_source: "lv",
    device_id: "",
    hard_disk_id: "",
    mac_address: "",
    app_id: 3704,
  };
  const tracks = [videoTrack, subtitleTrack, voiceTrack, bgmTrack].filter((track) => track.segments.length > 0);
  const content = {
    id: contentId,
    version: 400000,
    new_version: JIANYING_TARGET.newVersion,
    name: draftName,
    fps: project.exportSettings.fps,
    is_drop_frame_timecode: false,
    color_space: -1,
    render_index_track_mode_on: true,
    free_render_index_mode_on: false,
    static_cover_image_path: "",
    source: "default",
    path: "",
    duration: cursorUs,
    create_time: nowUs,
    update_time: nowUs,
    config: draftConfig(),
    canvas_config: {
      dom_width: 0,
      dom_height: 0,
      ratio: project.exportSettings.aspectRatio,
      width: project.exportSettings.width,
      height: project.exportSettings.height,
      background: null,
    },
    group_container: null,
    materials,
    keyframes: {
      videos: [], audios: [], texts: [], stickers: [], filters: [], adjusts: [], handwrites: [], effects: [],
    },
    platform,
    last_modified_platform: platform,
    mutable_config: null,
    cover: null,
    retouch_cover: null,
    extra_info: {
      text_to_video: {
        version: "",
        type: 0,
        template_id: "",
        video_generator_type: 0,
        picture_set_id: "",
        recommend_info: { title: "", link: "", custom_title: "", event_id: 0, section_segment_relationship: [] },
        text: [],
        video: [],
        bgm: [],
        mismatch_audio_ids: [],
      },
      track_info: null,
      subtitle_fragment_info_list: [],
    },
    time_marks: null,
    tracks,
    keyframe_graph_list: [],
    relationships: [],
    lyrics_effects: [],
  };

  const contentPath = path.join(draftPath, "draft_content.json");
  const metaPath = path.join(draftPath, "draft_meta_info.json");
  const contentBytes = writeJson(contentPath, content);
  let coverName = "";
  if (copiedImages[0]) {
    coverName = `draft_cover${path.extname(copiedImages[0].draftPath) || ".png"}`;
    fs.copyFileSync(copiedImages[0].draftPath, path.join(draftPath, coverName));
  }
  const copiedBytes = [...fs.readdirSync(imageDir).map((name) => path.join(imageDir, name)),
    ...fs.readdirSync(audioDir).map((name) => path.join(audioDir, name))]
    .reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);
  const meta = {
    cloud_draft_cover: false,
    cloud_draft_sync: false,
    cloud_package_completed_time: "",
    draft_cloud_capcut_purchase_info: "",
    draft_cloud_last_action_download: false,
    draft_cloud_package_type: "",
    draft_cloud_purchase_info: "",
    draft_cloud_template_id: "",
    draft_cloud_tutorial_info: "",
    draft_cloud_videocut_purchase_info: "",
    draft_cover: coverName,
    draft_deeplink_url: "",
    draft_enterprise_info: {
      draft_enterprise_extra: "",
      draft_enterprise_id: "",
      draft_enterprise_name: "",
      enterprise_material: [],
    },
    draft_fold_path: normalizePath(draftPath),
    draft_id: draftId,
    draft_is_ae_produce: false,
    draft_is_ai_packaging_used: false,
    draft_is_ai_shorts: false,
    draft_is_ai_translate: false,
    draft_is_article_video_draft: false,
    draft_is_cloud_temp_draft: false,
    draft_is_from_deeplink: "false",
    draft_is_invisible: false,
    draft_is_web_article_video: false,
    draft_materials: [],
    draft_materials_copied_info: [],
    draft_name: draftName,
    draft_need_rename_folder: false,
    draft_new_version: "",
    draft_removable_storage_device: "",
    draft_root_path: normalizePath(outDir),
    draft_segment_extra_info: [],
    draft_timeline_materials_size_: contentBytes + copiedBytes,
    draft_type: "",
    draft_web_article_video_enter_from: "",
    tm_draft_cloud_completed: "",
    tm_draft_cloud_entry_id: 0,
    tm_draft_cloud_modified: nowUs,
    tm_draft_cloud_parent_entry_id: -1,
    tm_draft_cloud_space_id: 0,
    tm_draft_cloud_user_id: 0,
    tm_draft_create: nowUs,
    tm_draft_modified: nowUs,
    tm_draft_removed: 0,
    tm_duration: cursorUs,
  };
  writeJson(metaPath, meta);
  writeJson(path.join(draftPath, "draft_virtual_store.json"), {
    draft_materials: [],
    draft_virtual_store: [{ type: 0, value: [] }, { type: 1, value: [] }, { type: 2, value: [] }],
  });

  const expectedTextCount = project.panels.filter((shot) => shot.subtitle.enabled && shot.subtitle.text.trim()).length
    + (intro?.text.trim() && intro.durationMs > 0 ? 1 : 0)
    + (outro?.text.trim() && outro.durationMs > 0 ? 1 : 0);
  const expectedAudioCount = project.panels.filter((shot) => {
    const sourcePath = toFsPath(shot.audio?.filePath || shot.audio?.fileUrl);
    return Boolean(sourcePath && fs.existsSync(sourcePath));
  }).length + (() => {
    const sourcePath = toFsPath(project.exportSettings.bgm?.filePath);
    return sourcePath && fs.existsSync(sourcePath) ? 1 : 0;
  })();
  const validation = validateTuiwenJianYingDraft(draftPath, {
    videoCount: project.panels.length
      + (intro?.text.trim() && intro.durationMs > 0 ? 1 : 0)
      + (outro?.text.trim() && outro.durationMs > 0 ? 1 : 0),
    audioCount: expectedAudioCount,
    textCount: expectedTextCount,
    durationUs: cursorUs,
  });
  const validationWarnings = validation.checks
    .filter((check) => check.status === "warning")
    .map((check) => `${check.label}：${check.detail}`);

  return {
    ok: validation.ok,
    message: validation.ok
      ? `已写入剪映草稿并通过 ${validation.checks.length - validation.warningCount} 项导入前自检：${draftPath}`
      : `草稿已写入，但导入前自检发现 ${validation.errorCount} 项错误：${draftPath}`,
    draftPath,
    contentPath,
    metaPath,
    mediaCount: materials.videos.length + materials.audios.length,
    warnings: [...warnings, ...validationWarnings],
    validation,
  };
}
