import type { GroupElement, RepeaterElement, TemplateElement } from "../../types/labelSystem";

export type LayerTreeRow = {
  element: TemplateElement;
  depth: number;
  /** null = root template.elements */
  parentId: string | null;
};

function walk(
  elements: TemplateElement[],
  depth: number,
  parentId: string | null,
  out: LayerTreeRow[],
): void {
  for (const el of elements) {
    out.push({ element: el, depth, parentId });
    if (el.type === "group") {
      walk((el as GroupElement).elements ?? [], depth + 1, el.id, out);
    } else if (el.type === "repeater") {
      walk((el as RepeaterElement).template?.elements ?? [], depth + 1, el.id, out);
    }
  }
}

/** Flatten element tree for layers panel (front-to-back within each sibling list). */
export function flattenElementsForLayers(elements: TemplateElement[]): LayerTreeRow[] {
  const ordered = [...elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const out: LayerTreeRow[] = [];
  walk(ordered, 0, null, out);
  return [...out].reverse();
}

export function findSiblingList(
  elements: TemplateElement[],
  parentId: string | null,
  targetId: string,
): TemplateElement[] | null {
  if (parentId === null) {
    return elements.some((e) => e.id === targetId) ? elements : null;
  }
  for (const el of elements) {
    if (el.id === parentId) {
      if (el.type === "group") return (el as GroupElement).elements ?? [];
      if (el.type === "repeater") return (el as RepeaterElement).template?.elements ?? [];
      return null;
    }
    if (el.type === "group") {
      const found = findSiblingList((el as GroupElement).elements ?? [], parentId, targetId);
      if (found) return found;
    }
    if (el.type === "repeater") {
      const found = findSiblingList((el as RepeaterElement).template?.elements ?? [], parentId, targetId);
      if (found) return found;
    }
  }
  return null;
}

function replaceSiblingList(
  elements: TemplateElement[],
  parentId: string | null,
  nextSiblings: TemplateElement[],
): TemplateElement[] {
  if (parentId === null) return nextSiblings;
  return elements.map((el) => {
    if (el.id === parentId) {
      if (el.type === "group") {
        const g = el as GroupElement;
        return { ...g, elements: nextSiblings };
      }
      if (el.type === "repeater") {
        const r = el as RepeaterElement;
        return { ...r, template: { ...r.template, elements: nextSiblings } };
      }
    }
    if (el.type === "group") {
      const g = el as GroupElement;
      return { ...g, elements: replaceSiblingList(g.elements ?? [], parentId, nextSiblings) };
    }
    if (el.type === "repeater") {
      const r = el as RepeaterElement;
      return {
        ...r,
        template: { ...r.template, elements: replaceSiblingList(r.template?.elements ?? [], parentId, nextSiblings) },
      };
    }
    return el;
  });
}

/** Reorder siblings at `parentId` (null = root). */
export function reorderLayerSiblings(
  elements: TemplateElement[],
  parentId: string | null,
  draggedId: string,
  targetId: string,
): TemplateElement[] | null {
  if (draggedId === targetId) return null;
  const siblings = parentId === null ? elements : findSiblingList(elements, parentId, draggedId);
  if (!siblings) return null;
  const from = siblings.findIndex((e) => e.id === draggedId);
  const to = siblings.findIndex((e) => e.id === targetId);
  if (from < 0 || to < 0) return null;
  const next = [...siblings];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  const withZ = next.map((el, idx) => ({ ...el, zIndex: idx }));
  return replaceSiblingList(elements, parentId, withZ);
}
