export function buildLatentMaskCells(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  cellSize = 64,
) {
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const cells = new Uint8Array(cols * rows);
  let any = false;

  for (let y = 0; y < height; y += 1) {
    const rowBase = y * width;
    const cellRow = Math.floor(y / cellSize) * cols;
    for (let x = 0; x < width; x += 1) {
      const index = (rowBase + x) * 4;
      if (rgba[index] + rgba[index + 1] + rgba[index + 2] > 32) {
        cells[cellRow + Math.floor(x / cellSize)] = 1;
        any = true;
      }
    }
  }

  return { cells, cols, rows, any };
}
