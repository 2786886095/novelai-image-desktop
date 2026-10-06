import { focusedInpaintPlan, type InpaintRegion } from './focused-inpaint';

export type InpaintSizeMode = 'original' | 'custom';
export type InpaintSize = { width: number; height: number };
export const DEFAULT_INPAINT_CUSTOM_SIZE: InpaintSize = { width: 1024, height: 1024 };

export function inpaintSizeText(language?: string) {
  if (language?.startsWith('zh-TW')) return { title: '重繪尺寸', original: '原圖尺寸', custom: '自訂尺寸', width: '寬', height: '高', missing: '請先載入原圖。', rule: '寬高需為 64–1600 之間的 64 整數倍；不會自動修改尺寸。', output: '輸出尺寸' };
  if (language?.startsWith('zh') || !language) return { title: '重绘尺寸', original: '原图尺寸', custom: '自定义尺寸', width: '宽', height: '高', missing: '请先加载原图。', rule: '宽高需为 64–1600 之间的 64 整数倍；不会自动修改尺寸。', output: '输出尺寸' };
  if (language?.startsWith('ja')) return { title: '再描画サイズ', original: '元画像のサイズ', custom: 'カスタムサイズ', width: '幅', height: '高さ', missing: '元画像を読み込んでください。', rule: '幅と高さは 64～1600 の範囲で 64 の倍数にしてください。自動変更はしません。', output: '出力サイズ' };
  if (language?.startsWith('ko')) return { title: '인페인트 크기', original: '원본 이미지 크기', custom: '사용자 지정 크기', width: '너비', height: '높이', missing: '원본 이미지를 불러오세요.', rule: '너비와 높이는 64–1600 사이의 64 배수여야 합니다. 자동으로 변경하지 않습니다.', output: '출력 크기' };
  return { title: 'Inpaint size', original: 'Original image size', custom: 'Custom size', width: 'Width', height: 'Height', missing: 'Load an original image first.', rule: 'Width and height must be multiples of 64 between 64 and 1600; sizes are never changed automatically.', output: 'Output size' };
}

export function validateInpaintSize(size: InpaintSize, language?: string): InpaintSize {
  if (![size.width, size.height].every(v => Number.isInteger(v) && v >= 64 && v <= 1600 && v % 64 === 0)) {
    throw new Error(`${size.width}×${size.height}: ${inpaintSizeText(language).rule}`);
  }
  return { width: size.width, height: size.height };
}

export function restoreInpaintSizeState(saved: { inpaintSizeMode?: unknown; inpaintCustomSize?: unknown } | null | undefined) {
  const raw = saved?.inpaintCustomSize as Partial<InpaintSize> | undefined;
  const dimension = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 64 && v <= 1600 ? v : 1024;
  return { inpaintSizeMode: (saved?.inpaintSizeMode === 'custom' ? 'custom' : 'original') as InpaintSizeMode,
    inpaintCustomSize: { width: dimension(raw?.width), height: dimension(raw?.height) } };
}

export function scaledInpaintRegion(region: InpaintRegion, source: InpaintSize, output: InpaintSize) {
  const clipped = focusedInpaintPlan(region, source.width, source.height).region;
  const sx = output.width / source.width, sy = output.height / source.height;
  const x = Math.floor(clipped.x * sx), y = Math.floor(clipped.y * sy);
  return { x, y, width: Math.ceil((clipped.x + clipped.width) * sx) - x,
    height: Math.ceil((clipped.y + clipped.height) * sy) - y };
}

export function inpaintSizePlan(mode: InpaintSizeMode, custom: InpaintSize, source: InpaintSize,
  region?: InpaintRegion | null, language?: string) {
  const outputSize = validateInpaintSize(mode === 'custom' ? custom : source, language);
  const requestSize = region ? focusedInpaintPlan(scaledInpaintRegion(region, source, outputSize), outputSize.width, outputSize.height).size : outputSize;
  return { outputSize, requestSize };
}
