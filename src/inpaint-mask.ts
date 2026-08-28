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
) {
  if (
    width <= 0 ||
    height <= 0 ||
    binaryRgba.length < width * height * 4
  ) {
    throw new RangeError("Invalid inpaint mask dimensions or RGBA buffer.");
  }
  const preview = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < preview.length; index += 4) {
    const selected = binaryRgba[index + 3] > 0;
    const value = selected ? 255 : 0;
    preview[index] = value;
    preview[index + 1] = value;
    preview[index + 2] = value;
    preview[index + 3] = selected ? 230 : 165;
  }
  return preview;
}
