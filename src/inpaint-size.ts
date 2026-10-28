import { clipInpaintRegion, focusedInpaintPlan, type InpaintRegion } from './focused-inpaint';

export type InpaintSizeMode = 'original' | 'custom';
export type InpaintSize = { width: number; height: number };
export const DEFAULT_INPAINT_CUSTOM_SIZE: InpaintSize = { width: 1024, height: 1024 };

export function inpaintSizeText(_language?: string) {
  return { title: '重绘尺寸', original: '原图尺寸', custom: '自定义尺寸', width: '宽', height: '高', missing: '请先加载原图。', rule: '宽高需为 64–1600 之间的 64 整数倍；不会自动修改尺寸。', output: '输出尺寸' };
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
  const clipped = clipInpaintRegion(region, source.width, source.height);
  const sx = output.width / source.width, sy = output.height / source.height;
  const x = Math.floor(clipped.x * sx), y = Math.floor(clipped.y * sy);
  return { x, y, width: Math.ceil((clipped.x + clipped.width) * sx) - x,
    height: Math.ceil((clipped.y + clipped.height) * sy) - y };
}

export function inpaintSizePlan(mode: InpaintSizeMode, custom: InpaintSize, source: InpaintSize,
  region?: InpaintRegion | null, language?: string) {
  if (region) {
    const focused = focusedInpaintPlan(region, source.width, source.height);
    return { outputSize: { width: source.width, height: source.height }, requestSize: focused.size, region: focused.region };
  }
  const outputSize = validateInpaintSize(mode === 'custom' ? custom : source, language);
  return { outputSize, requestSize: outputSize };
}
