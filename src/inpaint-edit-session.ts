import type { InpaintRegion } from "./focused-inpaint";
import type { InpaintSize, InpaintSizeMode } from "./inpaint-size";
import type { WorkingImage } from "./types";

/** One successful submission, in original source-pixel coordinates. Not persisted. */
export interface InpaintEditSession {
  id: string;
  source: WorkingImage;
  originalImage: WorkingImage | null;
  sourceMode: "original" | "latest";
  engine: "novelai" | "openai";
  maskBase64: string | null;
  region: InpaintRegion | null;
  sizeMode: InpaintSizeMode;
  customSize: InpaintSize;
  resultId: string;
}

/** Already decoded before state commit: the mounted canvas must hydrate, not reset. */
export interface InpaintEditRestorePayload {
  revision: number;
  sessionId: string;
  sourceFilePath: string;
  width: number;
  height: number;
  maskBase64: string | null;
  maskRgba: Uint8ClampedArray | null;
  rollback?: boolean;
}

function decodeImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => finish(new Error("图片解码超时。")), 15000);
    const finish = (error?: Error) => {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      if (error) reject(error); else resolve(image);
    };
    image.onload = () => finish();
    image.onerror = () => finish(new Error("无法解码保存的编辑图片或蒙版。"));
    image.src = url;
  });
}

function checkSize(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error("保存的编辑尺寸无效。");
  }
}

export async function validateInpaintEditSource(source: WorkingImage): Promise<void> {
  checkSize(source.width, source.height);
  const image = await decodeImage(source.fileUrl);
  if (image.naturalWidth !== source.width || image.naturalHeight !== source.height) {
    throw new Error("原图尺寸在重绘后已改变。");
  }
}

export async function decodeInpaintEditMask(
  maskBase64: string | null,
  width: number,
  height: number,
): Promise<Uint8ClampedArray | null> {
  checkSize(width, height);
  if (maskBase64 === null) return null;
  const image = await decodeImage(`data:image/png;base64,${maskBase64}`);
  if (image.naturalWidth !== width || image.naturalHeight !== height) {
    throw new Error("保存的蒙版尺寸与原图不一致。");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法在此设备上准备保存的编辑蒙版。");
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, width, height).data;
}

export function inpaintEditText(language?: string) {
  const labels: Record<string, { returnEdit: string; hint: string; restoring: string; failed: string }> = {
    "zh-CN": { returnEdit: "返回编辑", hint: "恢复本次重绘前的原图、蒙版和选区；生成结果保留在历史中", restoring: "正在恢复编辑…", failed: "恢复编辑失败" },
  };
  return labels[language ?? "zh-CN"] ?? labels["zh-CN"];
}
