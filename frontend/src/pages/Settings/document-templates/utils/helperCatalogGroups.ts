import type { EditorCatalogItem } from "../../../../api/documentTemplatesApi";

export type HelperGroupId = "dates" | "text" | "money" | "barcode" | "qr" | "format" | "layout" | "other";

const GROUP_LABELS: Record<HelperGroupId, string> = {
  dates: "Daty",
  text: "Tekst",
  money: "Waluty",
  barcode: "Barcode",
  qr: "QR",
  format: "Formatowanie",
  layout: "Układ dokumentu",
  other: "Inne",
};

const GROUP_ORDER: HelperGroupId[] = ["dates", "money", "text", "barcode", "qr", "format", "layout", "other"];

function classifyHelper(name: string): HelperGroupId {
  const n = name.toLowerCase();
  if (n === "date" || n === "datetime") return "dates";
  if (n === "money" || n === "quantity" || n === "percent") return "money";
  if (n === "barcode") return "barcode";
  if (n === "qr") return "qr";
  if (["phone", "url", "asset", "image", "yes_no", "company_logo", "plural"].includes(n)) return "text";
  if (["page_break", "section", "table", "signature", "stamp"].includes(n)) return "layout";
  if (n === "default" || n.includes("format")) return "format";
  return "other";
}

export function groupHelpers(items: EditorCatalogItem[]): { id: HelperGroupId; label: string; items: EditorCatalogItem[] }[] {
  const buckets = new Map<HelperGroupId, EditorCatalogItem[]>();
  for (const item of items) {
    const id = classifyHelper(item.name);
    const list = buckets.get(id) ?? [];
    list.push(item);
    buckets.set(id, list);
  }
  return GROUP_ORDER.filter((id) => (buckets.get(id)?.length ?? 0) > 0).map((id) => ({
    id,
    label: GROUP_LABELS[id],
    items: buckets.get(id)!,
  }));
}
