/**
 * Document series options for automation effect `generate_document`.
 * SSOT list: listDocumentSeries(tenant, warehouse) — only subtypes with a real backend handler.
 */

import type { DocumentSeriesDto, DocumentSeriesSubtype, DocumentSeriesType } from "../api/documentSeriesApi";
import {
  documentSeriesSubtypeLabelPl,
  documentSeriesTypeLabelPl,
} from "../pages/documents/documentSeriesUiLabels";

/** Must match backend GENERATE_DOCUMENT_SUPPORTED. */
export const GENERATE_DOCUMENT_SUPPORTED: ReadonlyArray<{ type: DocumentSeriesType; subtype: string }> = [
  { type: "SALE", subtype: "INVOICE" },
  { type: "SALE", subtype: "RECEIPT" },
  { type: "WAREHOUSE", subtype: "WZ" },
  { type: "WAREHOUSE", subtype: "RESERVATION" },
];

/** @deprecated Prefer GENERATE_DOCUMENT_SUPPORTED (type+subtype). */
export const GENERATE_DOCUMENT_SUPPORTED_SUBTYPES = GENERATE_DOCUMENT_SUPPORTED.map((x) => x.subtype);

export function isGenerateDocumentSupportedSeries(
  type: string | null | undefined,
  subtype: string | null | undefined,
): boolean {
  const t = String(type || "").trim().toUpperCase();
  const s = String(subtype || "").trim().toUpperCase();
  return GENERATE_DOCUMENT_SUPPORTED.some((x) => x.type === t && x.subtype === s);
}

/** @deprecated use isGenerateDocumentSupportedSeries */
export function isGenerateDocumentSupportedSubtype(subtype: string | null | undefined): boolean {
  const s = String(subtype || "").trim().toUpperCase();
  return GENERATE_DOCUMENT_SUPPORTED.some((x) => x.subtype === s);
}

export function filterSeriesForGenerateDocument(
  series: DocumentSeriesDto[],
  opts?: { warehouseId?: number | null },
): DocumentSeriesDto[] {
  const wid =
    opts?.warehouseId != null && Number.isFinite(Number(opts.warehouseId)) && Number(opts.warehouseId) > 0
      ? Number(opts.warehouseId)
      : null;
  return (Array.isArray(series) ? series : [])
    .filter((s) => {
      if (!s || !s.is_active) return false;
      if (!isGenerateDocumentSupportedSeries(s.type, s.subtype)) return false;
      if (wid != null && Number(s.warehouse_id) !== wid) return false;
      return Boolean(String(s.id || "").trim());
    })
    .slice()
    .sort((a, b) => {
      const typeCmp = String(a.type).localeCompare(String(b.type));
      if (typeCmp !== 0) return typeCmp;
      const sub = String(a.subtype).localeCompare(String(b.subtype));
      if (sub !== 0) return sub;
      return String(a.name || "").localeCompare(String(b.name || ""), "pl");
    });
}

export type GenerateDocumentSeriesOption = {
  seriesId: string;
  primaryLabel: string;
  subtypeLabel: string;
  optionLabel: string;
  type: DocumentSeriesType;
  subtype: string;
  warehouseId: number;
};

function subtypeMiddleLabel(subtype: string): string {
  switch (String(subtype || "").toUpperCase()) {
    case "INVOICE":
      return "Faktura";
    case "RECEIPT":
      return "Paragon";
    case "WZ":
      return "Wydanie zewnętrzne";
    case "RESERVATION":
      return "Rezerwacja";
    default:
      return documentSeriesSubtypeLabelPl(subtype as DocumentSeriesSubtype) || subtype;
  }
}

function seriesCodeLabel(series: DocumentSeriesDto, subtype: string): string {
  const prefix = String(series.prefix || "").trim();
  if (prefix) return prefix;
  const code = String(series.code || "").trim();
  if (code) return code;
  switch (subtype) {
    case "INVOICE":
      return "FV";
    case "RECEIPT":
      return "PA";
    case "WZ":
      return "WZ";
    case "RESERVATION":
      return "RZ";
    default:
      return subtype;
  }
}

export function formatGenerateDocumentSeriesOption(
  series: DocumentSeriesDto,
  opts?: {
    warehouseNameById?: Record<number, string>;
    showWarehouse?: boolean;
  },
): GenerateDocumentSeriesOption | null {
  const sid = String(series.id || "").trim();
  if (!sid) return null;
  if (!isGenerateDocumentSupportedSeries(series.type, series.subtype)) return null;
  const type = String(series.type).toUpperCase() as DocumentSeriesType;
  const subtype = String(series.subtype).toUpperCase();
  const subtypeLabel = subtypeMiddleLabel(subtype);
  const typeLabel = documentSeriesTypeLabelPl(type) || type;
  const code = seriesCodeLabel(series, subtype);
  const name = String(series.name || "").trim();
  const primaryLabel = name || code;
  const middle = name && name.toUpperCase() !== code.toUpperCase() ? name : subtypeLabel;
  // e.g. "FV — Faktura Polska · Sprzedaż"
  const parts = [`${code} — ${middle} · ${typeLabel}`];
  if (opts?.showWarehouse) {
    const whName =
      opts.warehouseNameById?.[Number(series.warehouse_id)] ||
      `Magazyn #${Number(series.warehouse_id)}`;
    parts.push(whName);
  }
  return {
    seriesId: sid,
    primaryLabel,
    subtypeLabel,
    optionLabel: parts.join(" · "),
    type,
    subtype,
    warehouseId: Number(series.warehouse_id),
  };
}

export function buildGenerateDocumentSeriesOptions(
  series: DocumentSeriesDto[],
  opts?: {
    warehouseId?: number | null;
    warehouseNameById?: Record<number, string>;
    showWarehouse?: boolean;
  },
): GenerateDocumentSeriesOption[] {
  return filterSeriesForGenerateDocument(series, { warehouseId: opts?.warehouseId })
    .map((s) =>
      formatGenerateDocumentSeriesOption(s, {
        warehouseNameById: opts?.warehouseNameById,
        showWarehouse: opts?.showWarehouse,
      }),
    )
    .filter((o): o is GenerateDocumentSeriesOption => o != null);
}

export function generateDocumentSubtypeHelp(
  type: string | null | undefined,
  subtype?: string | null | undefined,
): string | null {
  // Backward compatible: single-arg subtype-only calls.
  let t = String(type || "").trim().toUpperCase();
  let s = String(subtype || "").trim().toUpperCase();
  if (!s && (t === "WZ" || t === "RESERVATION" || t === "INVOICE" || t === "RECEIPT" || t === "PZ")) {
    s = t;
    t = "";
  }
  if (t === "SALE" && (s === "INVOICE" || s === "RECEIPT")) {
    return "Utworzy dokument sprzedaży (FV/PA) z wybranej serii. Domyślne wartości biorą się z ustawień serii.";
  }
  if (s === "INVOICE" || s === "RECEIPT") {
    return "Utworzy dokument sprzedaży (FV/PA) z wybranej serii. Domyślne wartości biorą się z ustawień serii.";
  }
  if (s === "WZ") {
    return "Utworzy dokument WZ dla zrealizowanego wydania magazynowego. Dokument nie powoduje ponownego rozchodu towaru.";
  }
  if (s === "RESERVATION") {
    return "Zarezerwuje produkty z zamówienia i utworzy dokument RZ. Stan fizyczny magazynu pozostanie bez zmian.";
  }
  return null;
}

export type GenerateDocumentCapabilities = {
  paymentTerm: boolean;
  saleDate: boolean;
  description: boolean;
  autoPrint: boolean;
};

/** Override / print options depend on selected series type (not one global set). */
export function generateDocumentCapabilities(
  type: string | null | undefined,
  subtype?: string | null | undefined,
): GenerateDocumentCapabilities {
  let t = String(type || "").trim().toUpperCase();
  let s = String(subtype || "").trim().toUpperCase();
  if (!s && (t === "WZ" || t === "RESERVATION" || t === "INVOICE" || t === "RECEIPT")) {
    s = t;
    t = s === "INVOICE" || s === "RECEIPT" ? "SALE" : "WAREHOUSE";
  }
  if (t === "SALE" || s === "INVOICE" || s === "RECEIPT") {
    return { paymentTerm: true, saleDate: true, description: true, autoPrint: true };
  }
  // WZ / RZ: stock documents — print via print queue; no sale payment/date/description fields.
  if (s === "WZ" || s === "RESERVATION" || t === "WAREHOUSE") {
    return { paymentTerm: false, saleDate: false, description: false, autoPrint: true };
  }
  return { paymentTerm: false, saleDate: false, description: false, autoPrint: false };
}

export function resolveGenerateDocumentSeriesId(
  payload: Record<string, unknown> | null | undefined,
): string {
  const raw = payload?.series_id ?? payload?.doc_series ?? payload?.document_series_id ?? "";
  return String(raw || "").trim();
}

export function payloadBool(payload: Record<string, unknown>, key: string): boolean {
  return Boolean(payload?.[key]);
}
