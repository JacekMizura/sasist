/**
 * Renders an icon layout item to an SVG fragment.
 * Icons are simple symbolic shapes that scale to element width/height.
 */
import type { LayoutItem } from "../utils/labelLayoutEngine";

export function renderIcon(item: LayoutItem): string {
  if (item.type !== "icon") return "";

  const w = item.width_mm;
  const h = item.height_mm;
  const cx = w / 2;
  const cy = h / 2;
  const color = item.textColor ?? "#000000";
  const strokeWidth = item.strokeWidth ?? 0.5;
  const icon = (item.icon ?? "").toString();

  const fill = color;
  const stroke = color;

  switch (icon) {
    case "arrow_up":
      return `<polygon points="${cx},0 ${w},${h} 0,${h}" fill="${escapeAttr(fill)}"/>`;
    case "arrow_down":
      return `<polygon points="0,0 ${w},0 ${cx},${h}" fill="${escapeAttr(fill)}"/>`;
    case "arrow_left":
      return `<polygon points="0,${cy} ${w},0 ${w},${h}" fill="${escapeAttr(fill)}"/>`;
    case "arrow_right":
      return `<polygon points="0,0 ${w},${cy} 0,${h}" fill="${escapeAttr(fill)}"/>`;
    case "hazard": {
      const p = `0,${h} ${cx},0 ${w},${h}`;
      const exTop = cy * 0.5;
      const exBottom = cy * 1.2;
      const exX = cx;
      const dotY = h * 0.8;
      const dotR = Math.min(w, h) * 0.03;
      return [
        `<polygon points="${p}" fill="none" stroke="${escapeAttr(stroke)}" stroke-width="${strokeWidth}"/>`,
        `<line x1="${exX}" y1="${exTop}" x2="${exX}" y2="${exBottom}" stroke="${escapeAttr(
          stroke
        )}" stroke-width="${strokeWidth * 1.5}"/>`,
        `<circle cx="${exX}" cy="${dotY}" r="${dotR}" fill="${escapeAttr(stroke)}"/>`,
      ].join("");
    }
    case "lock": {
      const bodyW = w * 0.6;
      const bodyH = h * 0.45;
      const bodyX = cx - bodyW / 2;
      const bodyY = h * 0.45;
      const shackleW = bodyW * 0.8;
      const shackleH = h * 0.35;
      const shackleX = cx - shackleW / 2;
      const shackleY = bodyY - shackleH + strokeWidth;

      const keyholeY = bodyY + bodyH * 0.45;
      const keyholeR = Math.min(w, h) * 0.04;

      const shackle = `<rect x="${shackleX}" y="${shackleY}" width="${shackleW}" height="${shackleH}" rx="${
        shackleW / 2
      }" ry="${shackleW / 2}" fill="none" stroke="${escapeAttr(stroke)}" stroke-width="${strokeWidth}"/>`;
      const body = `<rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="${bodyW * 0.1}" ry="${
        bodyW * 0.1
      }" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="${strokeWidth}"/>`;
      const keyhole = [
        `<circle cx="${cx}" cy="${keyholeY}" r="${keyholeR}" fill="${escapeAttr("#ffffff")}"/>`,
        `<rect x="${cx - keyholeR / 2}" y="${keyholeY}" width="${keyholeR}" height="${
          keyholeR * 1.8
        }" fill="${escapeAttr("#ffffff")}"/>`,
      ].join("");

      return shackle + body + keyhole;
    }
    case "heavy_load": {
      const baseH = h * 0.25;
      const baseY = h - baseH;
      const base = `<rect x="0" y="${baseY}" width="${w}" height="${baseH}" fill="${escapeAttr(
        fill
      )}" stroke="${escapeAttr(stroke)}" stroke-width="${strokeWidth}"/>`;
      const boxW = w * 0.6;
      const boxH = h * 0.4;
      const boxX = cx - boxW / 2;
      const boxY = baseY - boxH;
      const box = `<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" fill="none" stroke="${escapeAttr(
        stroke
      )}" stroke-width="${strokeWidth}"/>`;
      const diag = `<line x1="${boxX}" y1="${boxY + boxH}" x2="${boxX + boxW}" y2="${boxY}" stroke="${escapeAttr(
        stroke
      )}" stroke-width="${strokeWidth}"/>`;
      return base + box + diag;
    }
    default:
      return "";
  }
}

function escapeAttr(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

