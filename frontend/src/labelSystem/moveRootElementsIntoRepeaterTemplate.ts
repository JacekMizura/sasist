import type {
  GroupElement,
  LabelElement,
  LabelTemplate,
  RepeaterElement,
  TemplateElement,
} from "../types/labelSystem";

export type MoveRootIntoRepeaterResult = {
  template: LabelTemplate;
  /** How many root elements were moved into `repeater.template.elements` (excluding the repeater itself). */
  movedCount: number;
};

export class MoveRootIntoRepeaterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoveRootIntoRepeaterError";
  }
}

function shiftElementByRepeaterOrigin(el: TemplateElement, rx: number, ry: number): TemplateElement {
  if (el.type === "group") {
    const g = el as GroupElement;
    return { ...g, x: g.x - rx, y: g.y - ry };
  }
  if (el.type === "repeater") {
    const r = el as RepeaterElement;
    return { ...r, x: r.x - rx, y: r.y - ry };
  }
  const le = el as LabelElement;
  if (!("x" in le && "y" in le)) return el;
  return { ...le, x: le.x - rx, y: le.y - ry };
}

/**
 * Moves every root `template.elements` item except the single repeater into
 * `repeater.template.elements`, subtracting the repeater's `x`/`y` from each
 * moved element's position (group: only the group's origin; children stay relative).
 *
 * Root becomes `[repeater]` only. Does not touch layout/render code.
 *
 * @throws MoveRootIntoRepeaterError if root does not have exactly one repeater,
 * or if the result would have an empty `repeater.template.elements`.
 */
export function moveRootElementsIntoRepeaterTemplate(template: LabelTemplate): MoveRootIntoRepeaterResult {
  const root = [...(template.elements ?? [])];
  const repeaterIndices: number[] = [];
  for (let i = 0; i < root.length; i++) {
    if (root[i].type === "repeater") repeaterIndices.push(i);
  }
  if (repeaterIndices.length === 0) {
    throw new MoveRootIntoRepeaterError("Root has no repeater element.");
  }
  if (repeaterIndices.length > 1) {
    throw new MoveRootIntoRepeaterError(
      `Expected exactly one root repeater, found ${repeaterIndices.length}.`
    );
  }

  const repIndex = repeaterIndices[0];
  const repeater = root[repIndex] as RepeaterElement;
  const rx = repeater.x ?? 0;
  const ry = repeater.y ?? 0;

  const others: TemplateElement[] = root.filter((_, i) => i !== repIndex);
  if (others.length === 0) {
    throw new MoveRootIntoRepeaterError("Nothing to move: root only contains the repeater.");
  }

  const existingInSlot = [...(repeater.template?.elements ?? [])];
  const moved = others.map((el) => shiftElementByRepeaterOrigin(structuredClone(el), rx, ry));
  const nextRepeater: RepeaterElement = {
    ...repeater,
    template: {
      ...repeater.template,
      elements: [...existingInSlot, ...moved] as RepeaterElement["template"]["elements"],
    },
  };

  const nextElements: TemplateElement[] = [nextRepeater];
  if (nextRepeater.template.elements.length === 0) {
    throw new MoveRootIntoRepeaterError("repeater.template.elements would be empty.");
  }

  return {
    template: {
      ...template,
      elements: nextElements,
      updatedAt: new Date().toISOString(),
    },
    movedCount: others.length,
  };
}
