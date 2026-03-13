import type { LoadedImageCanvas } from "../utils/loadImageToCanvas";

export function scanColumnBrightness(
  ctx: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number
): number[] {
  const result: number[] = new Array(widthPx);
  const imageData = ctx.getImageData(0, 0, widthPx, heightPx);
  const data = imageData.data;

  for (let x = 0; x < widthPx; x += 1) {
    let sum = 0;
    for (let y = 0; y < heightPx; y += 1) {
      const idx = (y * widthPx + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      sum += (r + g + b) / 3;
    }
    result[x] = sum / heightPx;
  }

  return result;
}

