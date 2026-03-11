/**
 * Renders a barcode layout item to an SVG fragment.
 * Uses element.width and element.height (no hardcoded values). displayValue: false, margin: 0.
 * Requires DOM (JsBarcode). SVG is temporarily appended so getBBox() works; then serialized.
 */
import type { LayoutItem } from "../utils/labelLayoutEngine";

const PX_PER_MM = 10;
const MIN_BARCODE_HEIGHT_PX = 20;

/**
 * Generate barcode SVG for the given value and dimensions.
 * JsBarcode needs an SVG in the DOM for correct dimensions; we append off-screen then remove.
 */
export async function renderBarcode(item: LayoutItem): Promise<string> {
  if (item.type !== "barcode") return "";
  const widthMm = item.width_mm;
  const heightMm = item.height_mm;
  const value = (item.barcodeValue ?? "SAMPLE").trim();
  const format = (item.barcodeFormat ?? "Code128").toLowerCase();

  if (format === "qr" || format === "datamatrix") {
    const QRCode = (await import("qrcode")).default;
    const dataUrl = await QRCode.toDataURL(value || "SAMPLE", { width: 200, margin: 0 });
    return `<image href="${dataUrl}" x="0" y="0" width="${widthMm}" height="${heightMm}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  if (typeof document === "undefined") return "";

  const JsBarcode = (await import("jsbarcode")).default;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", String(Math.max(1, Math.round(widthMm * PX_PER_MM))));
  svg.setAttribute("height", String(Math.max(MIN_BARCODE_HEIGHT_PX, Math.round(heightMm * PX_PER_MM))));
  svg.style.position = "fixed";
  svg.style.left = "-9999px";
  svg.style.top = "0";
  document.body.appendChild(svg);

  try {
    JsBarcode(svg, value || "SAMPLE", {
      format: "CODE128",
      height: Math.max(MIN_BARCODE_HEIGHT_PX, heightMm * PX_PER_MM),
      margin: 0,
      displayValue: false,
    });
  } catch {
    document.body.removeChild(svg);
    return "";
  }

  let bbox: { x: number; y: number; width: number; height: number };
  if (typeof svg.getBBox === "function") {
    const b = svg.getBBox();
    bbox = { x: b.x, y: b.y, width: b.width, height: b.height };
  } else {
    const rect = svg.getBoundingClientRect();
    bbox = { x: 0, y: 0, width: rect.width, height: rect.height };
  }
  document.body.removeChild(svg);

  const wPx = bbox.width;
  const hPx = bbox.height;
  if (wPx <= 0 || hPx <= 0) return "";

  const scaleX = widthMm / wPx;
  const scaleY = heightMm / hPx;
  const inner = svg.innerHTML;
  if (!inner.trim()) return "";

  // Scale barcode so it exactly fills element width and height; translate so content is not offset.
  const tx = -bbox.x * scaleX;
  const ty = -bbox.y * scaleY;
  return `<g transform="translate(${tx}, ${ty}) scale(${scaleX}, ${scaleY})">${inner}</g>`;
}
