type PointerRect = Pick<DOMRect, "left" | "right" | "top" | "bottom">;

/** Only the visible intersection of the transformed canvas and clipped stage paints. */
export function isInsideInpaintSurface(
  clientX: number,
  clientY: number,
  canvas: PointerRect | undefined,
  stage: PointerRect | undefined,
): boolean {
  if (!canvas || !stage || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
  return clientX >= Math.max(canvas.left, stage.left) &&
    clientX < Math.min(canvas.right, stage.right) &&
    clientY >= Math.max(canvas.top, stage.top) &&
    clientY < Math.min(canvas.bottom, stage.bottom);
}
