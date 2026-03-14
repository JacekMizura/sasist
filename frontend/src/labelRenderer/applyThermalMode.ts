/**
 * Transforms layout items for thermal printer mode: monochrome, high contrast.
 * - Removes image elements (no background images).
 * - Converts all fills and strokes to black.
 * - Forces text color to black.
 * - Barcode remains black on white (no change needed).
 */
import type { LayoutItem } from "../utils/labelLayoutEngine";

const BLACK = "#000000";

export function applyThermalMode(items: LayoutItem[]): LayoutItem[] {
  return items
    .filter((item) => item.type !== "image")
    .map((item) => {
      const out: LayoutItem = { ...item };
      out.textColor = BLACK;
      out.borderColor = BLACK;
      out.backgroundColor = BLACK;
      out.fill = BLACK;
      return out;
    });
}
