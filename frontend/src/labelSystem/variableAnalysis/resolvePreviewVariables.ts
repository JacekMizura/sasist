import type { TemplateVariableAnalysis, VariableUsage } from "./analyzeTemplateVariables";

export interface VariablePreview {
  name: string;
  dataset?: string;
  type: "text" | "barcode";
  resolvedValue: string;
  resolved: boolean;
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

function bindingFromToken(name: string): string {
  const t = name.trim();
  return t.startsWith("{") && t.endsWith("}") ? t.slice(1, -1).trim() : t;
}

export function resolvePreviewVariables(
  analysis: TemplateVariableAnalysis,
  previewRecord: Record<string, unknown>
): VariablePreview[] {
  const out: VariablePreview[] = [];
  for (const v of analysis.rootVariables) {
    const binding = bindingFromToken(v.name);
    const value =
      v.type === "barcode"
        ? resolveBarcodeValue(previewRecord, binding)
        : resolveBinding(previewRecord, binding);
    out.push({
      name: v.name,
      type: v.type,
      resolvedValue: value,
      resolved: value !== "",
    });
  }
  for (const ds of analysis.datasets) {
    const arr = previewRecord[ds.name] as unknown[] | undefined;
    const firstItem = Array.isArray(arr) ? arr[0] : undefined;
    const record =
      typeof firstItem === "object" && firstItem !== null
        ? (firstItem as Record<string, unknown>)
        : previewRecord;
    for (const v of ds.variables) {
      const binding = bindingFromToken(v.name);
      const value =
        v.type === "barcode"
          ? resolveBarcodeValue(record, binding)
          : resolveBinding(record, binding);
      out.push({
        name: v.name,
        dataset: ds.name,
        type: v.type,
        resolvedValue: value,
        resolved: value !== "",
      });
    }
  }
  return out;
}
