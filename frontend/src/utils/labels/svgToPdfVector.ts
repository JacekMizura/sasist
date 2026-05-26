/**
 * Vector PDF: draw SVG onto a jsPDF document as vector graphics (no rasterization).
 * Uses svg2pdf.js. Importing this file registers the plugin on jsPDF.
 */
import type { jsPDF } from "jspdf";
import "svg2pdf.js";

/**
 * Parses an SVG string into a DOM SVGElement (in a temporary container).
 * Caller must not hold references; the element may be detached after the call.
 */
function parseSvgToElement(svgString: string): SVGElement | null {
  if (typeof document === "undefined") return null;
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString.trim(), "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) return null;
  return svg;
}

/**
 * Draws an SVG string onto the current page of a jsPDF document as vector graphics.
 * Position and size use the jsPDF document unit (same as `new jsPDF({ unit })`).
 *
 * @param pdf - jsPDF instance (`unit` typically `"mm"` or `"pt"`)
 * @param svgString - Full SVG document string
 * @param x - X of top-left corner in document units
 * @param y - Y of top-left corner in document units
 * @param width - Draw width in document units
 * @param height - Draw height in document units
 */
export async function drawSvgVector(
  pdf: jsPDF,
  svgString: string,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<void> {
  const svgElement = parseSvgToElement(svgString);
  if (!svgElement) throw new Error("Invalid SVG: no root svg element");

  const api = pdf as unknown as { svg: (el: Element, opts: { x: number; y: number; width: number; height: number }) => Promise<jsPDF> };
  if (typeof api.svg !== "function") throw new Error("svg2pdf.js not loaded: jsPDF.svg is not a function");

  await api.svg(svgElement, {
    x,
    y,
    width,
    height,
  });
}
