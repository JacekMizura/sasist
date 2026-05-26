import type {
  LabelElement,
  RepeaterElement,
  DynamicTextElement,
  BarcodeElement,
  TemplateElement,
} from "../../types/labelSystem";
import type { ValidationIssue } from "./validationTypes";

export type ValidationScope = { type: "root" } | { type: "dataset"; dataset: string };

function getEffectiveRecord(
  scope: ValidationScope,
  previewRecord: Record<string, unknown>
): Record<string, unknown> {
  if (scope.type === "root") return previewRecord;
  const arr = previewRecord[scope.dataset];
  if (!Array.isArray(arr) || arr.length === 0) return {};
  const first = arr[0];
  return typeof first === "object" && first !== null ? (first as Record<string, unknown>) : {};
}

function resolveBinding(record: Record<string, unknown>, binding: string): string {
  if (!binding || typeof binding !== "string") return "";
  const key = binding.trim();
  if (!key) return "";
  let val = record[key];
  if (val != null) return String(val);
  const bare = key.startsWith("{") && key.endsWith("}") ? key.slice(1, -1).trim() : key;
  val = record[bare] ?? record[`{${bare}}`];
  return val != null ? String(val) : "";
}

function resolveBarcodeValue(record: Record<string, unknown>, dataBinding: string): string {
  let v = resolveBinding(record, dataBinding);
  if (v) return v;
  for (const k of [
    "barcode_data",
    "loc_barcode",
    "location_barcode",
    "cart_barcode",
    "basket_barcode",
    "product_barcode",
    "order_barcode",
    "location_code",
  ]) {
    v = record[k] != null ? String(record[k]) : "";
    if (v) return v;
  }
  return "";
}

export function checkMissingVariable(
  element: LabelElement,
  scope: ValidationScope,
  previewRecord: Record<string, unknown>,
  ctx: { elementId: string; path?: string }
): ValidationIssue | null {
  if (element.type !== "dynamicText") return null;
  const el = element as DynamicTextElement;
  const binding = typeof el.binding === "string" ? el.binding.trim() : "";
  if (!binding) return null;
  const key = binding.startsWith("{") && binding.endsWith("}") ? binding.slice(1, -1).trim() : binding;
  const record = getEffectiveRecord(scope, previewRecord);
  const val = record[key] ?? record[binding] ?? record[`{${key}}`];
  if (val != null && String(val).length > 0) return null;
  return {
    code: "MISSING_VARIABLE",
    severity: "warning",
    message: `Binding "${key || binding}" not found in preview data`,
    elementId: ctx.elementId,
    path: ctx.path,
  };
}

export function checkMissingDataset(
  datasetName: string,
  previewRecord: Record<string, unknown>,
  ctx: { elementId: string; path?: string }
): ValidationIssue | null {
  if (!datasetName || typeof datasetName !== "string") return null;
  const arr = previewRecord[datasetName];
  if (Array.isArray(arr) && arr.length > 0) return null;
  return {
    code: "MISSING_DATASET",
    severity: "error",
    message: `Dataset "${datasetName}" missing or empty in preview`,
    elementId: ctx.elementId,
    path: ctx.path,
  };
}

export function checkInvalidRepeater(
  rep: RepeaterElement,
  ctx: { elementId: string; path?: string }
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!rep.dataset || String(rep.dataset).trim() === "") {
    issues.push({
      code: "INVALID_REPEATER",
      severity: "error",
      message: "Repeater has no dataset",
      elementId: ctx.elementId,
      path: ctx.path,
      details: { field: "dataset" },
    });
  }
  if (rep.itemWidth == null || Number(rep.itemWidth) <= 0) {
    issues.push({
      code: "INVALID_REPEATER",
      severity: "error",
      message: "Repeater itemWidth must be greater than 0",
      elementId: ctx.elementId,
      path: ctx.path,
      details: { field: "itemWidth" },
    });
  }
  if (rep.itemHeight != null && Number(rep.itemHeight) <= 0) {
    issues.push({
      code: "INVALID_REPEATER",
      severity: "error",
      message: "Repeater itemHeight must be greater than 0 when set",
      elementId: ctx.elementId,
      path: ctx.path,
      details: { field: "itemHeight" },
    });
  }
  if (!rep.template || typeof rep.template !== "object") {
    issues.push({
      code: "INVALID_REPEATER",
      severity: "error",
      message: "Repeater template is missing",
      elementId: ctx.elementId,
      path: ctx.path,
    });
  } else if (!Array.isArray(rep.template.elements) || rep.template.elements.length === 0) {
    issues.push({
      code: "INVALID_REPEATER",
      severity: "error",
      message: "Repeater template has no elements",
      elementId: ctx.elementId,
      path: ctx.path,
    });
  }
  return issues;
}

/**
 * Warn when several sibling repeaters bind the same dataset without filters — each would render the full list.
 */
export function checkSiblingRepeaterDatasetConflicts(
  elements: TemplateElement[],
  pathPrefix: string,
  warnings: ValidationIssue[]
): void {
  const repeaters = elements.filter((e): e is RepeaterElement => e.type === "repeater");
  const byDataset = new Map<string, RepeaterElement[]>();
  for (const r of repeaters) {
    const key = (r.dataset ?? "").trim();
    if (!key) continue;
    const list = byDataset.get(key) ?? [];
    list.push(r);
    byDataset.set(key, list);
  }
  for (const [dataset, list] of byDataset) {
    if (list.length < 2) continue;
    const noFilter = list.filter((r) => !(typeof r.filter === "string" && r.filter.trim()));
    if (noFilter.length < 2) continue;
    warnings.push({
      code: "REPEATER_DUPLICATE_DATASET",
      severity: "warning",
      message: `Powtarzacz: dataset "${dataset}" jest używany przez ${list.length} elementy bez rozróżniających filtrów — każdy narysuje całą listę (duplikacja). Zostaw jeden powtarzacz (np. kolory przez visibleIf / {repeater_slot}) albo ustaw filtr (np. {dataset_index} == 0).`,
      elementId: list[0]?.id,
      path: pathPrefix || undefined,
      details: { dataset, repeaterIds: list.map((r) => r.id) },
    });
  }
}

export function checkBarcodeEmpty(
  element: LabelElement,
  scope: ValidationScope,
  previewRecord: Record<string, unknown>,
  ctx: { elementId: string; path?: string }
): ValidationIssue | null {
  if (element.type !== "barcode") return null;
  const el = element as BarcodeElement;
  const binding = typeof el.dataBinding === "string" ? el.dataBinding.trim() : "";
  const record = getEffectiveRecord(scope, previewRecord);
  const value = resolveBarcodeValue(record, binding);
  if (value && value.length > 0) return null;
  return {
    code: "BARCODE_EMPTY",
    severity: "warning",
    message: "Barcode will render SAMPLE",
    elementId: ctx.elementId,
    path: ctx.path,
  };
}
