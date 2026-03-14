import { useState, useEffect, useRef } from "react";
import type { LabelTemplate, TemplateElement } from "../../../types/labelSystem";
import { findElementById, getElementParentBounds } from "./useLabelSelection";

export type ResizeCorner = "nw" | "ne" | "sw" | "se";

function snapToGridPx(px: number, GRID_PX: number): number {
  return Math.round(px / GRID_PX) * GRID_PX;
}

export function useLabelResize({
  template,
  updateElement,
  PX_PER_MM,
  GRID_PX,
}: {
  template: LabelTemplate;
  updateElement: (id: string, patch: Partial<TemplateElement>) => void;
  PX_PER_MM: number;
  GRID_PX: number;
}) {
  const templateRef = useRef(template);
  const updateElementRef = useRef(updateElement);
  useEffect(() => {
    templateRef.current = template;
    updateElementRef.current = updateElement;
  }, [template, updateElement]);

  const [resizeState, setResizeState] = useState<{
    id: string;
    corner: ResizeCorner;
    startClientX: number;
    startClientY: number;
    startElPx: { x_px: number; y_px: number; w_px: number; h_px: number };
  } | null>(null);

  useEffect(() => {
    if (!resizeState) return;
    const onMove = (e: MouseEvent) => {
      const t = templateRef.current;
      const el = findElementById(t.elements, resizeState.id);
      if (!el || !("width" in el)) return;
      const parentBounds = getElementParentBounds(t.elements, resizeState.id);
      const canvasW_px = t.widthMm * PX_PER_MM;
      const canvasH_px = t.heightMm * PX_PER_MM;
      const maxW_px = parentBounds ? parentBounds.widthMm * PX_PER_MM : canvasW_px;
      const maxH_px = parentBounds ? parentBounds.heightMm * PX_PER_MM : canvasH_px;
      const dxPx = e.clientX - resizeState.startClientX;
      const dyPx = e.clientY - resizeState.startClientY;
      const { x_px: sx, y_px: sy, w_px: sw, h_px: sh } = resizeState.startElPx;
      const minSize_px = Math.max(GRID_PX, 4);
      let x_px = sx;
      let y_px = sy;
      let w_px = sw;
      let h_px = sh;
      switch (resizeState.corner) {
        case "se":
          w_px = sw + dxPx;
          h_px = sh + dyPx;
          break;
        case "sw":
          x_px = sx + dxPx;
          w_px = sw - dxPx;
          h_px = sh + dyPx;
          break;
        case "ne":
          y_px = sy + dyPx;
          w_px = sw + dxPx;
          h_px = sh - dyPx;
          break;
        case "nw":
          x_px = sx + dxPx;
          y_px = sy + dyPx;
          w_px = sw - dxPx;
          h_px = sh - dyPx;
          break;
      }
      w_px = Math.max(minSize_px, snapToGridPx(w_px, GRID_PX));
      h_px = Math.max(minSize_px, snapToGridPx(h_px, GRID_PX));
      x_px = snapToGridPx(x_px, GRID_PX);
      y_px = snapToGridPx(y_px, GRID_PX);
      x_px = Math.max(0, Math.min(x_px, maxW_px - w_px));
      y_px = Math.max(0, Math.min(y_px, maxH_px - h_px));
      updateElementRef.current(resizeState.id, {
        x: x_px / PX_PER_MM,
        y: y_px / PX_PER_MM,
        width: w_px / PX_PER_MM,
        height: h_px / PX_PER_MM,
      });
    };
    const onUp = () => setResizeState(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizeState, GRID_PX, PX_PER_MM]);

  return { setResizeState };
}
