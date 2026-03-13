const DEFAULT_DPI = 300;

export function pxToMm(px: number, dpi?: number): number {
  const d = dpi && dpi > 0 ? dpi : DEFAULT_DPI;
  return (px * 25.4) / d;
}

