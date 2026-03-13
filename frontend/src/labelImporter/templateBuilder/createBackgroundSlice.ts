export function createSlice(
  sourceCanvas: HTMLCanvasElement,
  startX: number,
  endX: number,
  heightPx: number
): string {
  const widthPx = Math.max(0, endX - startX);
  const w = widthPx || 1;
  const h = heightPx || 1;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Cannot get 2D context");
  }

  ctx.drawImage(sourceCanvas, startX, 0, widthPx, heightPx, 0, 0, w, h);
  return canvas.toDataURL("image/png");
}

