import type { LabelTemplate, TemplateElement, GroupElement, RepeaterElement } from "../../types/labelSystem";

export interface RepeaterInfo {
  id: string;
  dataset: string;
}

function walk(elements: TemplateElement[], out: RepeaterInfo[]): void {
  for (const el of elements) {
    if (el.type === "group") {
      const group = el as GroupElement;
      walk(group.elements ?? [], out);
      continue;
    }
    if (el.type === "repeater") {
      const rep = el as RepeaterElement;
      out.push({ id: rep.id, dataset: rep.dataset });
      const nested = rep.template?.elements ?? [];
      walk(nested as TemplateElement[], out);
      continue;
    }
  }
}

/**
 * Scan template recursively and return all repeater elements with their dataset names.
 */
export function findRepeaters(template: LabelTemplate | { elements?: TemplateElement[] }): RepeaterInfo[] {
  const out: RepeaterInfo[] = [];
  const elements = "elements" in template ? template.elements : (template as LabelTemplate).elements;
  walk(elements ?? [], out);
  return out;
}
