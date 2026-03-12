/**
 * Renderer abstraction for label output (SVG, PDF, ZPL).
 * Layout engine produces LayoutItem[]; each renderer turns them into a string.
 */
import type { LayoutItem } from "../utils/labelLayoutEngine";

export type LabelRendererOptions = {
  widthMm: number;
  heightMm: number;
};

export interface LabelRenderer {
  render(items: LayoutItem[], options: LabelRendererOptions): Promise<string> | string;
}
