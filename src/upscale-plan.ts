/** Each fixed 2x request stays within the official 3 MP input envelope (checked 2026-09-21). */
export function planUpscale(width: number, height: number, scale: 2 | 4 | "max") {
  if (![width, height].every(v => Number.isFinite(v) && v > 0)) throw new Error("Invalid image dimensions");
  if (scale !== 2 && scale !== 4 && scale !== "max") throw new Error("Invalid upscale mode");
  const maxInputPixels = 3145728;
  const maxSide = 4096;
  let factor: number;
  if (scale === "max") {
    factor = Math.min(4, maxSide / width, maxSide / height, Math.sqrt(4 * maxInputPixels / (width * height)));
  } else {
    factor = Math.min(1, Math.sqrt(maxInputPixels / (width * height))) * scale;
  }
  const passes = scale === 4 || (scale === "max" && factor > 2) ? 2 : 1;
  const divisor = 2 ** passes;
  const inputWidth = Math.max(1, Math.floor(width * factor / divisor));
  const inputHeight = Math.max(1, Math.floor(height * factor / divisor));
  const outputWidth = inputWidth * divisor, outputHeight = inputHeight * divisor;
  const lastInputPixels = inputWidth * inputHeight * 4 ** (passes - 1);
  return {
    inputWidth, inputHeight, width: outputWidth, height: outputHeight, passes,
    resized: inputWidth !== width || inputHeight !== height,
    exceedsLimit: outputWidth > maxSide || outputHeight > maxSide || lastInputPixels > maxInputPixels,
  };
}
