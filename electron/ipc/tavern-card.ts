import { dialog, nativeImage } from "electron";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import type {
  AgentWorkspaceData,
  TavernCardExportRequest,
  TavernCardImportResult,
  TavernCharacter,
} from "../../src/agent/types";
import {
  normalizeTavernCharacter,
  normalizeTavernLorebook,
  tavernCharacterToV2,
  tavernCharacterToV3,
  tavernId,
  tavernNow,
  uniqueTavernName,
} from "../../src/tavern/compat";
import { readAgentWorkspace, saveTavernWorkspace } from "./agent-store";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const FALLBACK_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
  "base64",
);

function utf8Base64(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function decodeUtf8Base64(value: string) {
  return JSON.parse(Buffer.from(value.trim(), "base64").toString("utf8")) as unknown;
}

function pngChunks(input: Buffer) {
  if (input.length < 12 || !input.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("不是有效的 PNG 文件。");
  const chunks: Array<{ type: string; data: Buffer; raw: Buffer }> = [];
  let offset = 8;
  while (offset + 12 <= input.length) {
    const length = input.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > input.length) throw new Error("PNG 数据不完整。");
    const type = input.subarray(offset + 4, offset + 8).toString("ascii");
    chunks.push({ type, data: input.subarray(offset + 8, offset + 8 + length), raw: input.subarray(offset, end) });
    offset = end;
    if (type === "IEND") break;
  }
  return chunks;
}

function readPngCard(input: Buffer) {
  let v2: unknown;
  for (const chunk of pngChunks(input)) {
    if (chunk.type !== "tEXt") continue;
    const separator = chunk.data.indexOf(0);
    if (separator < 0) continue;
    const keyword = chunk.data.subarray(0, separator).toString("latin1");
    if (keyword !== "ccv3" && keyword !== "chara") continue;
    const decoded = decodeUtf8Base64(chunk.data.subarray(separator + 1).toString("latin1"));
    if (keyword === "ccv3") return decoded;
    v2 = decoded;
  }
  if (v2) return v2;
  throw new Error("PNG 中没有找到 SillyTavern 角色卡数据。");
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(input: Buffer) {
  let crc = 0xffffffff;
  for (const byte of input) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return output;
}

function writePngCard(input: Buffer, character: TavernCharacter) {
  const chunks = pngChunks(input);
  const kept = chunks.filter((chunk) => {
    if (chunk.type !== "tEXt") return chunk.type !== "IEND";
    const separator = chunk.data.indexOf(0);
    const keyword = separator >= 0 ? chunk.data.subarray(0, separator).toString("latin1") : "";
    return keyword !== "ccv3" && keyword !== "chara";
  }).map((chunk) => chunk.raw);
  const ccv3 = makePngChunk("tEXt", Buffer.from(`ccv3\0${utf8Base64(tavernCharacterToV3(character))}`, "latin1"));
  const chara = makePngChunk("tEXt", Buffer.from(`chara\0${utf8Base64(tavernCharacterToV2(character))}`, "latin1"));
  return Buffer.concat([PNG_SIGNATURE, ...kept, chara, ccv3, makePngChunk("IEND", Buffer.alloc(0))]);
}

function avatarPng(character: TavernCharacter) {
  if (!character.avatarDataUrl) return FALLBACK_PNG;
  try {
    const image = nativeImage.createFromDataURL(character.avatarDataUrl);
    if (!image.isEmpty()) return image.toPNG();
  } catch {
    // Fall through to a valid neutral PNG so the card remains portable.
  }
  return FALLBACK_PNG;
}

function dataUrl(buffer: Buffer, mime = "image/png") {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function charxCard(input: Buffer) {
  const zip = await JSZip.loadAsync(input);
  const cardEntry = zip.file("card.json");
  if (!cardEntry) throw new Error("CHARX 缺少根目录 card.json。");
  const raw = JSON.parse(await cardEntry.async("string")) as Record<string, unknown>;
  const data = raw.data && typeof raw.data === "object" ? raw.data as Record<string, unknown> : {};
  const assets = Array.isArray(data.assets) ? data.assets : [];
  let avatarPath = "";
  for (const item of assets) {
    if (!item || typeof item !== "object") continue;
    const asset = item as Record<string, unknown>;
    if (asset.type !== "icon") continue;
    avatarPath = String(asset.uri ?? "").replace(/^embeded:\/\//, "").replace(/^embedded:\/\//, "");
    if (avatarPath) break;
  }
  if (!avatarPath) avatarPath = Object.keys(zip.files).find((name) => /^assets\/icon\/.*\.(?:png|jpe?g|webp)$/i.test(name)) ?? "";
  const avatar = avatarPath ? zip.file(avatarPath) : null;
  const bytes = avatar ? await avatar.async("nodebuffer") : undefined;
  const mime = /\.jpe?g$/i.test(avatarPath) ? "image/jpeg" : /\.webp$/i.test(avatarPath) ? "image/webp" : "image/png";
  return normalizeTavernCharacter(raw, bytes ? dataUrl(bytes, mime) : undefined);
}

function isLorebookJson(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  if (raw.spec === "chara_card_v2" || raw.spec === "chara_card_v3") return false;
  return Array.isArray(raw.entries)
    || (raw.entries && typeof raw.entries === "object")
    || (raw.world_info && typeof raw.world_info === "object");
}

function addCharacter(workspace: AgentWorkspaceData, input: TavernCharacter) {
  const character = { ...input };
  character.name = uniqueTavernName(workspace.characters.map((item) => item.name), character.name);
  if (workspace.characters.some((item) => item.id === character.id)) character.id = tavernId("character");
  character.updatedAt = tavernNow();
  workspace.characters.push(character);
  workspace.selectedCharacterId = character.id;
  return character;
}

async function importOne(workspace: AgentWorkspaceData, filePath: string) {
  const extension = path.extname(filePath).toLocaleLowerCase();
  const input = fs.readFileSync(filePath);
  if (extension === ".png") {
    addCharacter(workspace, normalizeTavernCharacter(readPngCard(input), dataUrl(input)));
    return "character" as const;
  }
  if (extension === ".charx") {
    addCharacter(workspace, await charxCard(input));
    return "character" as const;
  }
  if (extension === ".json") {
    const raw = JSON.parse(input.toString("utf8")) as unknown;
    if (isLorebookJson(raw)) {
      const source = raw && typeof raw === "object" && !Array.isArray(raw) && "world_info" in raw
        ? (raw as Record<string, unknown>).world_info
        : raw;
      const lorebook = normalizeTavernLorebook(source, path.basename(filePath, extension));
      lorebook.name = uniqueTavernName(workspace.lorebooks.map((item) => item.name), lorebook.name);
      if (workspace.lorebooks.some((item) => item.id === lorebook.id)) lorebook.id = tavernId("lorebook");
      workspace.lorebooks.push(lorebook);
      return "lorebook" as const;
    }
    addCharacter(workspace, normalizeTavernCharacter(raw));
    return "character" as const;
  }
  throw new Error("仅支持 PNG、JSON 与 CHARX。");
}

export async function importTavernCards(sourcePaths?: string[]): Promise<TavernCardImportResult> {
  let paths = sourcePaths?.filter((item) => typeof item === "string" && item.trim()) ?? [];
  if (!paths.length) {
    const result = await dialog.showOpenDialog({
      title: "导入角色卡或世界书",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "SillyTavern 角色卡与世界书", extensions: ["png", "json", "charx"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    });
    if (result.canceled) return { ok: true, cancelled: true, message: "已取消。", workspace: readAgentWorkspace(), imported: 0, skipped: 0 };
    paths = result.filePaths;
  }
  const workspace = readAgentWorkspace();
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const filePath of paths) {
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > 192 * 1024 * 1024) throw new Error("文件为空或超过 192 MB。");
      await importOne(workspace, filePath);
      imported += 1;
    } catch (error) {
      skipped += 1;
      errors.push(`${path.basename(filePath)}：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const saved = imported ? saveTavernWorkspace(workspace).workspace : workspace;
  return {
    ok: imported > 0,
    message: imported
      ? `已合并导入 ${imported} 项${skipped ? `，跳过 ${skipped} 项` : ""}。${errors.length ? `\n${errors.slice(0, 4).join("\n")}` : ""}`
      : `没有可导入的内容。${errors.length ? `\n${errors.slice(0, 4).join("\n")}` : ""}`,
    workspace: saved,
    imported,
    skipped,
  };
}

async function charxBuffer(character: TavernCharacter) {
  const zip = new JSZip();
  const card = tavernCharacterToV3(character);
  const data = card.data && typeof card.data === "object" ? card.data as Record<string, unknown> : {};
  const assets = Array.isArray(data.assets) ? [...data.assets] : [];
  assets.push({ type: "icon", uri: "embeded://assets/icon/images/avatar.png", name: "avatar", ext: "png" });
  data.assets = assets;
  zip.file("card.json", JSON.stringify(card, null, 2));
  zip.file("assets/icon/images/avatar.png", avatarPng(character));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
}

function safeName(value: string) {
  return value.replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "_").trim().slice(0, 120) || "character";
}

export async function exportTavernCard(request: TavernCardExportRequest) {
  const character = readAgentWorkspace().characters.find((item) => item.id === request.characterId);
  if (!character) return { ok: false, message: "角色不存在。" };
  const extension = request.format;
  const result = await dialog.showSaveDialog({
    title: "导出 SillyTavern 角色卡",
    defaultPath: `${safeName(character.name)}.${extension}`,
    filters: [{ name: extension.toLocaleUpperCase(), extensions: [extension] }],
  });
  if (result.canceled || !result.filePath) return { ok: true, cancelled: true, message: "已取消。" };
  try {
    if (request.format === "json") {
      fs.writeFileSync(result.filePath, JSON.stringify(tavernCharacterToV3(character), null, 2), "utf8");
    } else if (request.format === "png") {
      fs.writeFileSync(result.filePath, writePngCard(avatarPng(character), character));
    } else {
      fs.writeFileSync(result.filePath, await charxBuffer(character));
    }
    return { ok: true, message: `已导出：${result.filePath}`, filePath: result.filePath };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export async function importTavernVisualAsset(kind: "avatar" | "background") {
  const result = await dialog.showOpenDialog({
    title: kind === "avatar" ? "选择角色头像" : "选择对话背景",
    properties: ["openFile"],
    filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }],
  });
  if (result.canceled || !result.filePaths[0]) return { ok: true, cancelled: true };
  try {
    const filePath = result.filePaths[0];
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error("图片不存在或超过 32 MB。");
    let image = nativeImage.createFromPath(filePath);
    if (image.isEmpty()) throw new Error("无法读取该图片格式。");
    const size = image.getSize();
    const limit = kind === "avatar" ? 1024 : 2560;
    if (Math.max(size.width, size.height) > limit) {
      image = size.width >= size.height
        ? image.resize({ width: limit, quality: "best" })
        : image.resize({ height: limit, quality: "best" });
    }
    return { ok: true, dataUrl: dataUrl(image.toPNG()), fileName: path.basename(filePath) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
