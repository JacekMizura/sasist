/**
 * Order-detail "Dokumenty i pliki" table types + helpers.
 * Extracted from OrderDetailPage.tsx — no logic changes.
 */

export type OrderDocTableKindTone = "fa" | "pa" | "rz" | "lp" | "wz" | "na";

export type OrderDocTableRow = {
  id: string;
  name: string;
  type: string;
  status: "approved" | "pending";
  date: string;
  fileUrl?: string;
  mimeType?: string;
  typeLabel?: { abbr: string; name: string; tone: OrderDocTableKindTone };
  saleDocumentId?: string;
  stockDocumentId?: number;
  printKind?: string | null;
};

export const ORDER_DOCS_SECTION_TYPES = new Set([
  "PARAGON",
  "PROFORMA",
  "FAKTURA",
  "RACHUNEK",
  "KOREKTA",
  "DOKUMENT_SPRZEDAZY",
]);

export function orderDocRowIsPdfOrImage(row: OrderDocTableRow): boolean {
  const mt = (row.mimeType ?? "").toLowerCase();
  if (mt.includes("pdf") || mt.startsWith("image/")) return true;
  const n = row.name.toLowerCase();
  const path = (row.fileUrl ?? "").split(/[?#]/)[0]?.toLowerCase() ?? "";
  if (path.endsWith(".pdf") || /\.(png|jpe?g|gif|webp|svg)$/i.test(path)) return true;
  if (n.endsWith(".pdf") || /\.(png|jpe|jpeg|jpg|gif|webp|svg)$/i.test(n)) return true;
  return false;
}

export function orderDocKindToneClass(tone: OrderDocTableKindTone): string {
  switch (tone) {
    case "fa":
      return "bg-emerald-600";
    case "pa":
      return "bg-amber-500";
    case "rz":
      return "bg-slate-500";
    case "lp":
      return "bg-blue-600";
    case "wz":
      return "bg-slate-900";
    default:
      return "bg-slate-400";
  }
}

export function guessMimeFromFilename(name: string): string | undefined {
  const n = (name || "").toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".webp")) return "image/webp";
  return undefined;
}

export function orderDocumentTypeToLabel(code: string): NonNullable<OrderDocTableRow["typeLabel"]> {
  const c = (code || "").toUpperCase();
  switch (c) {
    case "PARAGON":
      return { abbr: "Pa", name: "Paragon", tone: "pa" };
    case "PROFORMA":
      return { abbr: "Pr", name: "Proforma", tone: "rz" };
    case "FAKTURA":
      return { abbr: "Fa", name: "Faktura", tone: "fa" };
    case "RACHUNEK":
      return { abbr: "Ra", name: "Rachunek", tone: "rz" };
    case "KOREKTA":
      return { abbr: "Ko", name: "Korekta", tone: "na" };
    case "DOKUMENT_SPRZEDAZY":
      return { abbr: "DS", name: "Dokument sprzedaży", tone: "fa" };
    case "ZALACZNIK":
      return { abbr: "Zł", name: "Załącznik", tone: "na" };
    case "LIST_PRZEWOZOWY":
      return { abbr: "LP", name: "List przewozowy", tone: "lp" };
    default:
      return { abbr: "—", name: c || "—", tone: "na" };
  }
}
