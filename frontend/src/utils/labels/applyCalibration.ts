import type { PrinterProfile } from "../../types/printerProfiles";

/**
 * Applies printer calibration to an SVG string by wrapping its content in a
 * transform group. Used only during export/printing; preview and editing must not use this.
 * If no profile or profile has no effect (0,0,1), returns the original SVG unchanged.
 *
 * Calibration should be applied either in frontend export OR backend rendering, not both.
 */
export function applyCalibration(svg: string, profile?: PrinterProfile | null): string {
  if (!profile) return svg;
  const ox = profile.offset_x_mm ?? 0;
  const oy = profile.offset_y_mm ?? 0;
  const s = profile.scale ?? 1;
  if (ox === 0 && oy === 0 && s === 1) return svg;

  const open = svg.indexOf("<svg");
  if (open === -1) return svg;
  const closeBracket = svg.indexOf(">", open);
  if (closeBracket === -1) return svg;
  const innerStart = closeBracket + 1;
  const endTag = svg.lastIndexOf("</svg>");
  if (endTag === -1 || endTag <= innerStart) return svg;

  const head = svg.slice(0, innerStart);
  const inner = svg.slice(innerStart, endTag);
  const tail = svg.slice(endTag);

  const transform = `translate(${ox} ${oy}) scale(${s})`;
  const wrapped = `${head}<g transform="${transform}">${inner}</g>${tail}`;
  return wrapped;
}
