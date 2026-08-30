export function buildBinaryInpaintMask(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
) {
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) {
    throw new RangeError("Invalid inpaint mask dimensions or RGBA buffer.");
  }
  const binary = new Uint8ClampedArray(width * height * 4);
  let any = false;

  for (let index = 0; index < binary.length; index += 4) {
    const selected =
      rgba[index + 3] > 0 && rgba[index] + rgba[index + 1] + rgba[index + 2] > 32;
    const value = selected ? 255 : 0;
    binary[index] = value;
    binary[index + 1] = value;
    binary[index + 2] = value;
    // NovelAI's editor thresholds the downscaled mask alpha. Encode the binary
    // selection in alpha as well as RGB so the transport path can match it.
    binary[index + 3] = value;
    any ||= selected;
  }

  return { rgba: binary, any };
}

/**
 * Build an unmistakable on-canvas visualization of the exact binary mask.
 * The transport mask stays lossless black/white; this helper only adds alpha
 * for the preview so users can see both the selected and preserved regions.
 */
export function buildInpaintMaskPreview(
  binaryRgba: Uint8ClampedArray,
  width: number,
  height: number,
  color = "#ffffff",
) {
  if (
    width <= 0 ||
    height <= 0 ||
    binaryRgba.length < width * height * 4
  ) {
    throw new RangeError("Invalid inpaint mask dimensions or RGBA buffer.");
  }
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  const packed = Number.parseInt(match?.[1] ?? "ffffff", 16);
  const red = (packed >> 16) & 255;
  const green = (packed >> 8) & 255;
  const blue = packed & 255;
  const preview = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < preview.length; index += 4) {
    const selected = binaryRgba[index + 3] > 0;
    preview[index] = selected ? red : 0;
    preview[index + 1] = selected ? green : 0;
    preview[index + 2] = selected ? blue : 0;
    // The preview is laid over the source image. Preserved pixels must stay
    // transparent so previewing the exact mask never hides the original.
    // Opacity is controlled once by the canvas CSS layer. Keeping pixel alpha
    // at 255 makes the UI's 100% setting genuinely opaque instead of silently
    // multiplying it by an additional 230/255 factor.
    preview[index + 3] = selected ? 255 : 0;
  }
  return preview;
}
