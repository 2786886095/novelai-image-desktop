export type InpaintRegion = { x: number; y: number; width: number; height: number };
export type InpaintPoint = { x: number; y: number };

/** Current official frontend limits for the original-pixel selection and its work crop. */
export const FOCUSED_INPAINT_SELECTION_MAX_PIXELS = 589824;
export const FOCUSED_INPAINT_WORK_MAX_PIXELS = 1048576;
const MASK_PIXEL_SIZE = 8;
const WORK_SIZE_MULTIPLE = 64;

function validateCanvas(width: number, height: number) {
  if (![width, height].every(v => Number.isSafeInteger(v) && v > 0)) throw Error('原图尺寸无效。');
}

/** Canvas intersection only: shared image editors must not inherit NovelAI's selection cap. */
export function clipInpaintRegion(region: InpaintRegion, width: number, height: number): InpaintRegion {
  validateCanvas(width, height);
  if (!region || ![region.x, region.y, region.width, region.height].every(Number.isFinite)
    || region.width < 8 || region.height < 8) throw Error('请选择至少 8 × 8 像素的重绘区域。');
  const x = Math.max(0, Math.ceil(region.x)), y = Math.max(0, Math.ceil(region.y));
  const right = Math.min(width, Math.floor(region.x + region.width));
  const bottom = Math.min(height, Math.floor(region.y + region.height));
  if (right - x < 8 || bottom - y < 8) throw Error('重绘区域超出原图。');
  return { x, y, width: right - x, height: bottom - y };
}

function cappedDimensions(width: number, height: number) {
  const area = width * height;
  if (area <= FOCUSED_INPAINT_SELECTION_MAX_PIXELS) return { width, height };
  const scale = Math.sqrt(FOCUSED_INPAINT_SELECTION_MAX_PIXELS / area);
  // This inward integer rasterization is our PNG-boundary safety rule, not another official grid snap.
  let w = Math.floor(width * scale), h = Math.floor(height * scale);
  // Programmatic tiny/very thin regions remain usable; the pointer UI separately rejects sides below 32.
  if (w < 8) { w = 8; h = Math.min(height, Math.floor(FOCUSED_INPAINT_SELECTION_MAX_PIXELS / w)); }
  if (h < 8) { h = 8; w = Math.min(width, Math.floor(FOCUSED_INPAINT_SELECTION_MAX_PIXELS / h)); }
  return { width: w, height: h };
}

/** Clamp a source-pixel ROI before displaying it. Submission must reject a different/oversized ROI. */
export function clampFocusedInpaintRegion(region: InpaintRegion, width: number, height: number): InpaintRegion {
  const clipped = clipInpaintRegion(region, width, height);
  return { x: clipped.x, y: clipped.y, ...cappedDimensions(clipped.width, clipped.height) };
}

/** Mask-grid snap and clip, then shrink the moving endpoint while preserving the drag anchor. */
export function clampFocusedInpaintDrag(anchor: InpaintPoint, end: InpaintPoint, width: number, height: number): InpaintRegion {
  validateCanvas(width, height);
  if (!anchor || !end || ![anchor.x, anchor.y, end.x, end.y].every(Number.isFinite)) throw Error('重绘区域坐标无效。');
  const snap = (value: number, bound: number) => Math.max(0, Math.min(bound, Math.round(value / MASK_PIXEL_SIZE) * MASK_PIXEL_SIZE));
  const x = snap(anchor.x, width), y = snap(anchor.y, height);
  const dx = snap(end.x, width) - x, dy = snap(end.y, height) - y;
  const rawWidth = Math.abs(dx), rawHeight = Math.abs(dy);
  // Zero/tiny drafts are allowed during a drag; the UI cancels them on pointer-up.
  const size = rawWidth < 8 || rawHeight < 8 ? { width: rawWidth, height: rawHeight } : cappedDimensions(rawWidth, rawHeight);
  return { x: dx < 0 ? x - size.width : x, y: dy < 0 ? y - size.height : y, ...size };
}

/** Preserve the original canvas and source-pixel ROI; adapt only the uploaded work crop. */
export function focusedInpaintPlan(region: InpaintRegion, width: number, height: number) {
  const clipped = clampFocusedInpaintRegion(region, width, height);
  const area = clipped.width * clipped.height;
  const scale = area < 0.8 * FOCUSED_INPAINT_WORK_MAX_PIXELS ? Math.sqrt(FOCUSED_INPAINT_WORK_MAX_PIXELS / area) : 1;
  let tw = Math.max(WORK_SIZE_MULTIPLE, Math.floor(Math.floor(clipped.width * scale) / WORK_SIZE_MULTIPLE) * WORK_SIZE_MULTIPLE);
  let th = Math.max(WORK_SIZE_MULTIPLE, Math.floor(Math.floor(clipped.height * scale) / WORK_SIZE_MULTIPLE) * WORK_SIZE_MULTIPLE);
  // Official arithmetic can floor an extreme thin side to zero. Keep a valid, <=1MP client request.
  if (tw * th > FOCUSED_INPAINT_WORK_MAX_PIXELS) {
    if (tw < th) th = Math.floor(FOCUSED_INPAINT_WORK_MAX_PIXELS / tw / WORK_SIZE_MULTIPLE) * WORK_SIZE_MULTIPLE;
    else tw = Math.floor(FOCUSED_INPAINT_WORK_MAX_PIXELS / th / WORK_SIZE_MULTIPLE) * WORK_SIZE_MULTIPLE;
  }
  return { region: clipped, size: { width: tw, height: th } };
}
