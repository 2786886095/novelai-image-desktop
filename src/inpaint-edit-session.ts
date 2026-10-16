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
    const timer = setTimeout(() => finish(new Error("Image decoding timed out.")), 15000);
    const finish = (error?: Error) => {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      if (error) reject(error); else resolve(image);
    };
    image.onload = () => finish();
    image.onerror = () => finish(new Error("The saved editing image or mask could not be decoded."));
    image.src = url;
  });
}

function checkSize(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error("Invalid saved editing dimensions.");
  }
}

export async function validateInpaintEditSource(source: WorkingImage): Promise<void> {
  checkSize(source.width, source.height);
  const image = await decodeImage(source.fileUrl);
  if (image.naturalWidth !== source.width || image.naturalHeight !== source.height) {
    throw new Error("The original image dimensions have changed since inpainting.");
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
    throw new Error("The saved mask dimensions do not match the original image.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The saved editing mask cannot be prepared on this device.");
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, width, height).data;
}

export function inpaintEditText(language?: string) {
  const labels: Record<string, { returnEdit: string; hint: string; restoring: string; failed: string }> = {
    "zh-CN": { returnEdit: "返回编辑", hint: "恢复本次重绘前的原图、蒙版和选区；生成结果保留在历史中", restoring: "正在恢复编辑…", failed: "恢复编辑失败" },
    "zh-TW": { returnEdit: "返回編輯", hint: "恢復本次重繪前的原圖、遮罩和選區；生成結果保留在歷史中", restoring: "正在恢復編輯…", failed: "恢復編輯失敗" },
    "en-US": { returnEdit: "Return to editing", hint: "Restore the image, mask and region from before this inpaint; keep the generated result in history", restoring: "Restoring editor…", failed: "Could not restore editing" },
    "ja-JP": { returnEdit: "編集に戻る", hint: "描き直し前の画像・マスク・選択範囲を復元。生成結果は履歴に保持", restoring: "編集を復元中…", failed: "編集を復元できませんでした" },
    "ko-KR": { returnEdit: "편집으로 돌아가기", hint: "인페인트 전 원본, 마스크, 선택 영역을 복원하고 생성 결과는 기록에 보관합니다", restoring: "편집 복원 중…", failed: "편집을 복원할 수 없습니다" },
  };
  return labels[language ?? "zh-CN"] ?? labels["en-US"];
}
