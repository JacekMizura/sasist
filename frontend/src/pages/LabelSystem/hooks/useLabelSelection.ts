import { useState, useCallback, useEffect, useMemo } from "react";
import type {
  LabelTemplate,
  LabelElement,
  TemplateElement,
  GroupElement,
  RepeaterElement,
} from "../../../types/labelSystem";
import { generateId } from "../utils/id";

/** Overlay entry: element plus its display position (absolute on canvas). Nested elements use parent offset. */
export type OverlayEntry = {
  element: TemplateElement;
  displayX: number;
  displayY: number;
  /** Repeater slot index (0-based); 0 for non-repeated entries. */
  slotIndex: number;
};

/** Current canvas selection (element id + repeater slot when template child). */
export type LabelCanvasSelection = { id: string; slotIndex: number };

export function isTemplateElementDesignerHidden(el: TemplateElement): boolean {
  return (el as { visible?: boolean }).visible === false;
}

/** Minimum hit target in px so zero-width/height lines stay clickable. */
export const MIN_LABEL_OVERLAY_HIT_PX = 6;

/** Bounding box for designer overlays / hit-tests (clamps narrow dimensions for lines). */
export function getOverlayHitSizePx(el: TemplateElement, PX_PER_MM: number): { w: number; h: number } {
  const wMm = "width" in el ? (el as { width: number }).width : 0;
  const hMm = "height" in el ? (el as { height: number }).height : 0;
  let w = Math.max(0, wMm * PX_PER_MM);
  let h = Math.max(0, hMm * PX_PER_MM);
  if (w < MIN_LABEL_OVERLAY_HIT_PX) w = MIN_LABEL_OVERLAY_HIT_PX;
  if (h < MIN_LABEL_OVERLAY_HIT_PX) h = MIN_LABEL_OVERLAY_HIT_PX;
  return { w, h };
}

function templateElementZIndex(el: TemplateElement): number {
  return (el as { zIndex?: number }).zIndex ?? 0;
}

export type PickHit = { id: string; slotIndex: number; displayX: number; displayY: number };

/**
 * Topmost element at canvas-local pixel coords using template zIndex, then flatten order (later = on top for ties).
 * Alt+click skips the topmost hit (second hit if any) to reach elements below.
 */
export function pickTopElementAtCanvasPx(
  overlayEntries: OverlayEntry[],
  xPx: number,
  yPx: number,
  PX_PER_MM: number,
  options?: { altKey?: boolean }
): PickHit | null {
  type Cand = PickHit & { z: number; index: number };
  const candidates: Cand[] = [];
  overlayEntries.forEach((entry, index) => {
    const el = entry.element;
    const { w, h } = getOverlayHitSizePx(el, PX_PER_MM);
    const left = entry.displayX * PX_PER_MM;
    const top = entry.displayY * PX_PER_MM;
    if (xPx >= left && xPx <= left + w && yPx >= top && yPx <= top + h) {
      candidates.push({
        id: el.id,
        z: templateElementZIndex(el),
        index,
        slotIndex: entry.slotIndex,
        displayX: entry.displayX,
        displayY: entry.displayY,
      });
    }
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (b.z !== a.z) return b.z - a.z;
    return b.index - a.index;
  });
  const skip = options?.altKey && candidates.length > 1 ? 1 : 0;
  const chosen = candidates[skip] ?? candidates[0];
  console.log("[REPEATER CLICK]", {
    id: chosen.id,
    slotIndex: chosen.slotIndex,
    displayX: chosen.displayX,
    displayY: chosen.displayY,
    altKey: !!options?.altKey,
  });
  return {
    id: chosen.id,
    slotIndex: chosen.slotIndex,
    displayX: chosen.displayX,
    displayY: chosen.displayY,
  };
}

export function findElementById(elements: TemplateElement[], id: string): TemplateElement | null {
  for (const el of elements) {
    if (el.id === id) return el;
    if (el.type === "group") {
      const found = findElementById((el as GroupElement).elements ?? [], id);
      if (found) return found;
    }
    if (el.type === "repeater") {
      const rep = el as RepeaterElement;
      const found = findElementById(rep.template?.elements ?? [], id);
      if (found) return found;
    }
  }
  return null;
}

/** Find the repeater that contains the element with the given id (for duplicate/layer). */
export function findRepeaterContainingId(elements: TemplateElement[], id: string): RepeaterElement | null {
  for (const el of elements) {
    if (el.type === "repeater") {
      const rep = el as RepeaterElement;
      const inTemplate = (rep.template?.elements ?? []).some((c) => c.id === id);
      if (inTemplate) return rep;
      const nested = findRepeaterContainingId(rep.template?.elements ?? [], id);
      if (nested) return nested;
    }
    if (el.type === "group") {
      const found = findRepeaterContainingId((el as GroupElement).elements ?? [], id);
      if (found) return found;
    }
  }
  return null;
}

/** Parent bounds in mm for clamping nested element move/resize. null if top-level. */
export function getElementParentBounds(
  elements: TemplateElement[],
  id: string,
  parentX = 0,
  parentY = 0
): { widthMm: number; heightMm: number } | null {
  for (const el of elements) {
    if (el.id === id) return null;
    if (el.type === "group") {
      const g = el as GroupElement;
      const inGroup = (g.elements ?? []).some((c) => c.id === id);
      if (inGroup) {
        const w = "width" in g ? g.width : 999;
        const h = "height" in g ? g.height : 999;
        return { widthMm: w, heightMm: h };
      }
      const inner = getElementParentBounds(g.elements ?? [], id);
      if (inner) return inner;
    }
    if (el.type === "repeater") {
      const rep = el as RepeaterElement;
      const inRep = (rep.template?.elements ?? []).some((c) => c.id === id);
      if (inRep) {
        const w = rep.itemWidth ?? rep.width ?? 999;
        const h = rep.itemHeight ?? rep.itemWidth ?? rep.height ?? 999;
        return { widthMm: w, heightMm: h };
      }
      const inner = getElementParentBounds(rep.template?.elements ?? [], id);
      if (inner) return inner;
    }
  }
  return null;
}

function appendGroupEntries(
  group: GroupElement,
  baseX: number,
  baseY: number,
  out: OverlayEntry[],
  slotIndex: number
): void {
  if (isTemplateElementDesignerHidden(group as TemplateElement)) return;
  const gx = baseX + (group.x ?? 0);
  const gy = baseY + (group.y ?? 0);
  out.push({ element: group, displayX: gx, displayY: gy, slotIndex });
  for (const child of group.elements ?? []) {
    if (isTemplateElementDesignerHidden(child as TemplateElement)) continue;
    if (child.type === "group") {
      appendGroupEntries(child as GroupElement, gx, gy, out, slotIndex);
    } else {
      out.push({
        element: child,
        displayX: gx + ("x" in child ? child.x : 0),
        displayY: gy + ("y" in child ? child.y : 0),
        slotIndex,
      });
    }
  }
}

/**
 * Flatten template into overlay entries.
 * Repeater slot count matches `record[repeater.dataset].length` (same as SVG / layout preview).
 */
function flattenOverlayEntries(elements: TemplateElement[], record: Record<string, unknown>): OverlayEntry[] {
  const out: OverlayEntry[] = [];
  for (const el of elements) {
    if (isTemplateElementDesignerHidden(el)) continue;
    if (el.type === "group") {
      appendGroupEntries(el as GroupElement, 0, 0, out, 0);
    } else if (el.type === "repeater") {
      const rep = el as RepeaterElement;
      const rx = rep.x ?? 0;
      const ry = rep.y ?? 0;
      const itemW = rep.itemWidth ?? 20;
      const itemH = rep.itemHeight ?? rep.itemWidth ?? 20;
      const layout = (rep.layout ?? rep.direction ?? "horizontal").toString().toLowerCase();
      const useGrid = layout === "grid";
      const columns = useGrid ? Math.max(1, rep.columns ?? 1) : 1;
      const dir = layout === "vertical" ? "vertical" : "horizontal";
      const useVertical = dir === "vertical";
      const rawDataset = record[rep.dataset];
      const items = Array.isArray(rawDataset) ? rawDataset : [];
      const previewSlotCount = items.length;
      const slotXAt = (i: number) => {
        if (useGrid) return rx + (i % columns) * itemW;
        if (useVertical) return rx;
        return rx + i * itemW;
      };
      const slotYAt = (i: number) => {
        if (useGrid) return ry + Math.floor(i / columns) * itemH;
        if (useVertical) return ry + i * itemH;
        return ry;
      };
      out.push({ element: rep, displayX: rx, displayY: ry, slotIndex: 0 });
      for (const child of rep.template?.elements ?? []) {
        if (isTemplateElementDesignerHidden(child as TemplateElement)) continue;
        if (child.type === "group") {
          for (let slotIndex = 0; slotIndex < previewSlotCount; slotIndex++) {
            appendGroupEntries(child as GroupElement, slotXAt(slotIndex), slotYAt(slotIndex), out, slotIndex);
          }
        } else {
          const childX = "x" in child ? child.x : 0;
          const childY = "y" in child ? child.y : 0;
          for (let slotIndex = 0; slotIndex < previewSlotCount; slotIndex++) {
            out.push({
              element: child,
              displayX: slotXAt(slotIndex) + childX,
              displayY: slotYAt(slotIndex) + childY,
              slotIndex,
            });
          }
        }
      }
    } else {
      const x = "x" in el ? el.x : 0;
      const y = "y" in el ? el.y : 0;
      out.push({ element: el, displayX: x, displayY: y, slotIndex: 0 });
    }
  }
  return out;
}

export function useLabelSelection(
  template: LabelTemplate,
  onTemplateChange: (t: LabelTemplate) => void,
  previewRecord: Record<string, unknown>
) {
  const [selection, setSelection] = useState<LabelCanvasSelection | null>(null);
  const selectedId = selection?.id ?? null;

  const deleteElement = useCallback(
    (id: string) => {
      function removeFromElements(elements: TemplateElement[]): TemplateElement[] {
        return elements
          .filter((e) => e.id !== id)
          .map((el) => {
            if (el.type === "group") {
              const g = el as GroupElement;
              return { ...g, elements: removeFromElements(g.elements ?? []) };
            }
            if (el.type === "repeater") {
              const r = el as RepeaterElement;
              return {
                ...r,
                template: {
                  ...r.template,
                  elements: removeFromElements(r.template?.elements ?? []),
                },
              };
            }
            return el;
          });
      }
      onTemplateChange({
        ...template,
        elements: removeFromElements(template.elements),
        updatedAt: new Date().toISOString(),
      });
      if (selectedId === id) setSelection(null);
    },
    [template, onTemplateChange, selectedId]
  );

  const setSelectedId = useCallback((id: string | null) => {
    setSelection(id ? { id, slotIndex: 0 } : null);
  }, []);

  const selected = useMemo(
    () => (template.elements && selectedId ? findElementById(template.elements, selectedId) : null),
    [template.elements, selectedId]
  );

  const overlayEntries = useMemo(
    () =>
      flattenOverlayEntries(
        [...template.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)),
        previewRecord
      ),
    [template.elements, previewRecord]
  );

  const overlayElementsOrdered = useMemo(() => {
    if (!selection) return overlayEntries;
    const notSelected = overlayEntries.filter(
      (e) => !(e.element.id === selection.id && e.slotIndex === selection.slotIndex)
    );
    const selectedEntries = overlayEntries.filter(
      (e) => e.element.id === selection.id && e.slotIndex === selection.slotIndex
    );
    return selectedEntries.length ? [...notSelected, ...selectedEntries] : overlayEntries;
  }, [overlayEntries, selection]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inInput =
        document.activeElement &&
        (document.activeElement.tagName === "INPUT" ||
          document.activeElement.tagName === "TEXTAREA" ||
          (document.activeElement as HTMLElement).isContentEditable);
      if (inInput) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) {
          e.preventDefault();
          deleteElement(selectedId);
        }
      }
      if (e.key === "d" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (selectedId) {
          const repeaterParent = findRepeaterContainingId(template.elements, selectedId);
          const el = findElementById(template.elements, selectedId);
          if (el && "type" in el) {
            if (repeaterParent) {
              const dup = { ...el, id: generateId() } as LabelElement;
              const newElements = template.elements.map((top) => {
                if (top.type !== "repeater" || (top as RepeaterElement).id !== repeaterParent.id)
                  return top;
                const rep = top as RepeaterElement;
                return {
                  ...rep,
                  template: {
                    ...rep.template,
                    elements: [...(rep.template?.elements ?? []), dup],
                  },
                };
              });
              onTemplateChange({
                ...template,
                elements: newElements,
                updatedAt: new Date().toISOString(),
              });
              setSelection({ id: dup.id, slotIndex: 0 });
              return;
            }
            const dup = { ...el, id: generateId() } as TemplateElement;
            if (dup.type === "group" && "elements" in dup)
              dup.elements = (dup.elements as LabelElement[]).map((c) => ({ ...c, id: generateId() }));
            if (
              dup.type === "repeater" &&
              "template" in dup &&
              dup.template?.elements
            )
              dup.template = {
                elements: dup.template.elements.map((c) => ({ ...c, id: generateId() })),
              };
            onTemplateChange({
              ...template,
              elements: [...template.elements, dup],
              updatedAt: new Date().toISOString(),
            });
            setSelection({ id: dup.id, slotIndex: 0 });
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, deleteElement, template, onTemplateChange, setSelection]);

  return {
    selection,
    setSelection,
    selectedId,
    setSelectedId,
    selected,
    overlayEntries,
    overlayElementsOrdered,
    deleteElement,
  };
}
