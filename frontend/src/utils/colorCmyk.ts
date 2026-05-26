/**
 * CMYK (0–1 components) matching `label_engine.to_print_color(..., print_mode=True)`:
 * RGB in 0–1, K = 1 - max(R,G,B); if K=1 then black; else CMY from standard formula.
 */
export type Cmyk01 = { c: number; m: number; y: number; k: number };

/** Parse #rgb / #rrggbb → #rrggbb lowercase, or null if invalid. */
export function parseHex6OrNull(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  let h = raw.trim();
  if (!h.startsWith("#")) h = `#${h}`;
  if (h.length === 4 && /^#[0-9a-f]{3}$/i.test(h)) {
    h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  }
  if (/^#[0-9a-f]{6}$/i.test(h)) return h.toLowerCase();
  return null;
}

export function hexToCmyk01(hex: string): Cmyk01 {
  const normalized = parseHex6OrNull(hex);
  if (!normalized) return { c: 0, m: 0, y: 0, k: 1 };
  const digits = normalized.slice(1);
  const r = parseInt(digits.slice(0, 2), 16) / 255;
  const g = parseInt(digits.slice(2, 4), 16) / 255;
  const b = parseInt(digits.slice(4, 6), 16) / 255;
  const k = 1 - Math.max(r, g, b);
  if (k === 1) return { c: 0, m: 0, y: 0, k: 1 };
  const inv = 1 - k;
  return {
    c: (1 - r - k) / inv,
    m: (1 - g - k) / inv,
    y: (1 - b - k) / inv,
    k,
  };
}

/** Human-readable CMYK as 0–100 percentages (one decimal), same order as print. */
export function formatCmykPercent(c: Cmyk01): string {
  const pct = (x: number) => Math.round(x * 1000) / 10;
  return `${pct(c.c)}, ${pct(c.m)}, ${pct(c.y)}, ${pct(c.k)}`;
}
