import { useState, useCallback, useRef, useEffect } from "react";
import { log } from "../../../utils/logger";
import type { LabelTemplate, TemplateElement } from "../../../types/labelSystem";
import {
  findElementById,
  getElementParentBounds,
  type LabelCanvasSelection,
} from "./useLabelSelection";

const DRAG_DEBUG = false;

function snapToGridPx(px: number, GRID_PX: number): number {
  return Math.round(px / GRID_PX) * GRID_PX;
}

export function useLabelDrag({
  template,
  setLabelSelection,
  updateElement,
  PX_PER_MM,
  GRID_PX,
  isElementLocked,
}: {
  template: LabelTemplate;
  setLabelSelection: (sel: LabelCanvasSelection | null) => void;
  updateElement: (id: string, patch: Partial<TemplateElement>) => void;
  PX_PER_MM: number;
  GRID_PX: number;
  isElementLocked?: (id: string) => boolean;
}) {
  const [dragState, setDragState] = useState<{
    id: string;
    startClientX: number;
    startClientY: number;
    elX_px: number;
    elY_px: number;
  } | null>(null);

  const templateRef = useRef(template);
  const updateElementRef = useRef(updateElement);
  useEffect(() => {
    templateRef.current = template;
    updateElementRef.current = updateElement;
  });

  const handleElementMouseDown = useCallback(
    (e: React.MouseEvent, id: string, slotIndex = 0) => {
      e.stopPropagation();
      if (DRAG_DEBUG) log("[LabelDesigner] element mousedown", { id, clientX: e.clientX, clientY: e.clientY });
      setLabelSelection({ id, slotIndex });
      setDragState(null);
      if (isElementLocked?.(id)) return;
      const el = findElementById(template.elements, id);
      if (!el || !("x" in el)) return;
      const elX_px = el.x * PX_PER_MM;
      const elY_px = el.y * PX_PER_MM;
      setDragState({
        id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        elX_px,
        elY_px,
      });
    },
    [template.elements, setLabelSelection, PX_PER_MM, isElementLocked],
  );

  useEffect(() => {
    if (!dragState) return;
    const state = dragState;
    const onMove = (e: MouseEvent) => {
      if (DRAG_DEBUG) log("[LabelDesigner] drag mousemove", { id: state.id, clientX: e.clientX, clientY: e.clientY });
      const t = templateRef.current;
      const el = findElementById(t.elements, state.id);
      if (!el || !("width" in el) || !("height" in el)) return;
      const parentBounds = getElementParentBounds(t.elements, state.id);
      const canvasW_px = t.widthMm * PX_PER_MM;
      const canvasH_px = t.heightMm * PX_PER_MM;
      const maxW_px = parentBounds ? parentBounds.widthMm * PX_PER_MM : canvasW_px;
      const maxH_px = parentBounds ? parentBounds.heightMm * PX_PER_MM : canvasH_px;
      const elW_px = el.width * PX_PER_MM;
      const elH_px = el.height * PX_PER_MM;
      const dxPx = e.clientX - state.startClientX;
      const dyPx = e.clientY - state.startClientY;
      let newX_px = snapToGridPx(state.elX_px + dxPx, GRID_PX);
      let newY_px = snapToGridPx(state.elY_px + dyPx, GRID_PX);
      newX_px = Math.max(0, Math.min(newX_px, maxW_px - elW_px));
      newY_px = Math.max(0, Math.min(newY_px, maxH_px - elH_px));
      updateElementRef.current(state.id, {
        x: newX_px / PX_PER_MM,
        y: newY_px / PX_PER_MM,
      });
    };
    const onUp = () => {
      if (DRAG_DEBUG) log("[LabelDesigner] drag mouseup", { id: state.id });
      setDragState(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragState, GRID_PX, PX_PER_MM]);

  return { dragState, handleElementMouseDown };
}
