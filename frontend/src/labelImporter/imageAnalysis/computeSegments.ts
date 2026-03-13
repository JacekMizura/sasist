export type Segment = {
  startX: number;
  endX: number;
};

export function computeSegments(widthPx: number, separators: number[], minWidthPx = 10): Segment[] {
  const sorted = [...separators].sort((a, b) => a - b);
  const positions = [0, ...sorted, widthPx];
  const segments: Segment[] = [];

  for (let i = 0; i < positions.length - 1; i += 1) {
    const startX = positions[i];
    const endX = positions[i + 1];
    if (endX - startX >= minWidthPx) {
      segments.push({ startX, endX });
    }
  }

  if (segments.length === 0) {
    segments.push({ startX: 0, endX: widthPx });
  }

  return segments;
}

