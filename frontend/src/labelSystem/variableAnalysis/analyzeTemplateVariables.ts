import type {
  LabelTemplate,
  TemplateElement,
  LabelElement,
  GroupElement,
  RepeaterElement,
  DynamicTextElement,
  BarcodeElement,
} from "../../types/labelSystem";

export interface VariableUsage {
  name: string;
  type: "text" | "barcode";
  elementId: string;
  dataset?: string;
}

export interface DatasetUsage {
  name: string;
  variables: VariableUsage[];
}

export interface TemplateVariableAnalysis {
  rootVariables: VariableUsage[];
  datasets: DatasetUsage[];
}

function toToken(name: string): string {
  const t = name.trim();
  return t.startsWith("{") && t.endsWith("}") ? t : `{${t}}`;
}

function walk(
  elements: TemplateElement[],
  dataset: string | undefined,
  rootVars: VariableUsage[],
  datasetMap: Map<string, VariableUsage[]>
): void {
  for (const el of elements) {
    if (el.type === "group") {
      const group = el as GroupElement;
      walk(group.elements ?? [], dataset, rootVars, datasetMap);
      continue;
    }
    if (el.type === "repeater") {
      const rep = el as RepeaterElement;
      const nested = rep.template?.elements ?? [];
      walk(nested, rep.dataset, rootVars, datasetMap);
      continue;
    }
    const labelEl = el as LabelElement;
    if (labelEl.type === "dynamicText") {
      const binding = (labelEl as DynamicTextElement).binding;
      if (binding) {
        const name = toToken(binding);
        const usage: VariableUsage = { name, type: "text", elementId: labelEl.id, dataset };
        if (dataset) {
          const list = datasetMap.get(dataset) ?? [];
          list.push(usage);
          datasetMap.set(dataset, list);
        } else {
          rootVars.push(usage);
        }
      }
      continue;
    }
    if (labelEl.type === "barcode") {
      const dataBinding = (labelEl as BarcodeElement).dataBinding;
      if (dataBinding) {
        const name = toToken(dataBinding);
        const usage: VariableUsage = { name, type: "barcode", elementId: labelEl.id, dataset };
        if (dataset) {
          const list = datasetMap.get(dataset) ?? [];
          list.push(usage);
          datasetMap.set(dataset, list);
        } else {
          rootVars.push(usage);
        }
      }
    }
  }
}

export function analyzeTemplateVariables(template: LabelTemplate): TemplateVariableAnalysis {
  const rootVariables: VariableUsage[] = [];
  const datasetMap = new Map<string, VariableUsage[]>();
  walk(template.elements ?? [], undefined, rootVariables, datasetMap);
  const datasets: DatasetUsage[] = Array.from(datasetMap.entries()).map(([name, variables]) => ({
    name,
    variables,
  }));
  return { rootVariables, datasets };
}
