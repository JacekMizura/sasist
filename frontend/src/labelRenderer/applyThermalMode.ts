/**
 * Transforms layout items for thermal printer mode: monochrome, high contrast.
 * - Removes image elements (no background images).
 * - Forces text and barcode to black; all strokes/borders to black.
 * - Does NOT change fill for rectangles or sections (backgrounds preserved).
 */
import type { LayoutItem } from "../utils/labelLayoutEngine";

const BLACK = "#000000";

export function applyThermalMode(items: LayoutItem[]): LayoutItem[] {
  return items
    .filter((item) => item.type !== "image")
    .map((item) => {
      const out: LayoutItem = { ...item };
      out.borderColor = BLACK;
      out.textColor = BLACK;
      if (item.type !== "rect" && item.type !== "section" && item.type !== "text" && item.type !== "barcode") {
        out.fill = item.fill ?? BLACK;
        out.backgroundColor = item.backgroundColor ?? BLACK;
      }
      return out;
    });
}
