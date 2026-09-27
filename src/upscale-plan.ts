/** Each fixed 2x request stays within the official 3 MP input envelope (checked 2026-09-21). */
export function planUpscale(width: number, height: number, scale: 2 | 4 | "max") {
  if (![width, height].every(v => Number.isSafeInteger(v) && v > 0)) throw new Error("Invalid image dimensions");
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
  let inputWidth = Math.max(1, Math.floor(width * factor / divisor));
  let inputHeight = Math.max(1, Math.floor(height * factor / divisor));
  // A tested MAX response rounded 700px to 688px. Pre-align MAX where
  // practical, without changing ordinary 2x input or distorting thin images.
  // Other endpoints may still return different dimensions: save their result.
  if (scale === "max") {
    const gridWidth = Math.floor(inputWidth / 16) * 16;
    const gridHeight = Math.floor(inputHeight / 16) * 16;
    if (gridWidth > 0 && gridHeight > 0 &&
        Math.abs((gridWidth / gridHeight) / (width / height) - 1) <= .03) {
      inputWidth = gridWidth;
      inputHeight = gridHeight;
    }
  }
  const outputWidth = inputWidth * divisor, outputHeight = inputHeight * divisor;
  const lastInputPixels = inputWidth * inputHeight * 4 ** (passes - 1);
  return {
    inputWidth, inputHeight, width: outputWidth, height: outputHeight, passes,
    resized: inputWidth !== width || inputHeight !== height,
    exceedsLimit: outputWidth > maxSide || outputHeight > maxSide || lastInputPixels > maxInputPixels,
  };
}
