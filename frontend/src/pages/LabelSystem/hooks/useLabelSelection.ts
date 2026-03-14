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
export type OverlayEntry = { element: TemplateElement; displayX: number; displayY: number };

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

function appendGroupEntries(group: GroupElement, baseX: number, baseY: number, out: OverlayEntry[]): void {
  const gx = baseX + (group.x ?? 0);
  const gy = baseY + (group.y ?? 0);
  out.push({ element: group, displayX: gx, displayY: gy });
  for (const child of group.elements ?? []) {
    if (child.type === "group") {
      appendGroupEntries(child as GroupElement, gx, gy, out);
    } else {
      out.push({
        element: child,
        displayX: gx + ("x" in child ? child.x : 0),
        displayY: gy + ("y" in child ? child.y : 0),
      });
    }
  }
}

/** Flatten template into overlay entries. Repeater children get one entry per visible slot (same element id). */
function flattenOverlayEntries(
  elements: TemplateElement[],
  labelWidthMm: number,
  labelHeightMm: number
): OverlayEntry[] {
  const out: OverlayEntry[] = [];
  for (const el of elements) {
    if (el.type === "group") {
      appendGroupEntries(el as GroupElement, 0, 0, out);
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
      let previewSlotCount: number;
      let slotXAt: (i: number) => number;
      let slotYAt: (i: number) => number;
      if (useGrid) {
        const numRows = Math.max(1, Math.floor((labelHeightMm - ry) / itemH));
        previewSlotCount = columns * numRows;
        slotXAt = (i) => rx + (i % columns) * itemW;
        slotYAt = (i) => ry + Math.floor(i / columns) * itemH;
      } else if (useVertical) {
        previewSlotCount = Math.max(1, Math.floor((labelHeightMm - ry) / itemH));
        slotXAt = () => rx;
        slotYAt = (i) => ry + i * itemH;
      } else {
        previewSlotCount = Math.max(1, Math.floor((labelWidthMm - rx) / itemW));
        slotXAt = (i) => rx + i * itemW;
        slotYAt = () => ry;
      }
      out.push({ element: rep, displayX: rx, displayY: ry });
      for (const child of rep.template?.elements ?? []) {
        if (child.type === "group") {
          for (let slotIndex = 0; slotIndex < previewSlotCount; slotIndex++) {
            appendGroupEntries(child as GroupElement, slotXAt(slotIndex), slotYAt(slotIndex), out);
          }
        } else {
          const childX = "x" in child ? child.x : 0;
          const childY = "y" in child ? child.y : 0;
          for (let slotIndex = 0; slotIndex < previewSlotCount; slotIndex++) {
            out.push({
              element: child,
              displayX: slotXAt(slotIndex) + childX,
              displayY: slotYAt(slotIndex) + childY,
            });
          }
        }
      }
    } else {
      const x = "x" in el ? el.x : 0;
      const y = "y" in el ? el.y : 0;
      out.push({ element: el, displayX: x, displayY: y });
    }
  }
  return out;
}

export function useLabelSelection(
  template: LabelTemplate,
  onTemplateChange: (t: LabelTemplate) => void
) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      if (selectedId === id) setSelectedId(null);
    },
    [template, onTemplateChange, selectedId]
  );

  const selected = useMemo(
    () => (template.elements && selectedId ? findElementById(template.elements, selectedId) : null),
    [template.elements, selectedId]
  );

  const overlayEntries = useMemo(
    () =>
      flattenOverlayEntries(
        [...template.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)),
        template.widthMm,
        template.heightMm
      ),
    [template.elements, template.widthMm, template.heightMm]
  );

  const overlayElementsOrdered = useMemo(() => {
    if (!selectedId) return overlayEntries;
    const notSelected = overlayEntries.filter((e) => e.element.id !== selectedId);
    const selectedEntries = overlayEntries.filter((e) => e.element.id === selectedId);
    return selectedEntries.length ? [...notSelected, ...selectedEntries] : overlayEntries;
  }, [overlayEntries, selectedId]);

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
              setSelectedId(dup.id);
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
            setSelectedId(dup.id);
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, deleteElement, template, onTemplateChange]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-element-id]") || target.closest("[data-draggable-wrapper]")) return;
    setSelectedId(null);
  }, []);

  return {
    selectedId,
    setSelectedId,
    selected,
    overlayElementsOrdered,
    handleCanvasMouseDown,
    deleteElement,
  };
}
