/**
 * Document series options for automation effect `generate_document`.
 * SSOT list: listDocumentSeries(tenant, warehouse) — filter to subtypes the backend can execute.
 */

import type { DocumentSeriesDto, DocumentSeriesSubtype } from "../api/documentSeriesApi";
import { documentSeriesSubtypeLabelPl } from "../pages/documents/documentSeriesUiLabels";

/** Must match backend create_document_from_series supported WAREHOUSE subtypes. */
export const GENERATE_DOCUMENT_SUPPORTED_SUBTYPES = ["WZ", "RESERVATION"] as const;

export type GenerateDocumentSupportedSubtype =
  (typeof GENERATE_DOCUMENT_SUPPORTED_SUBTYPES)[number];

export function isGenerateDocumentSupportedSubtype(
  subtype: string | null | undefined,
): subtype is GenerateDocumentSupportedSubtype {
  const s = String(subtype || "").trim().toUpperCase();
  return (GENERATE_DOCUMENT_SUPPORTED_SUBTYPES as readonly string[]).includes(s);
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
      if (String(s.type || "").toUpperCase() !== "WAREHOUSE") return false;
      if (!isGenerateDocumentSupportedSubtype(s.subtype)) return false;
      if (wid != null && Number(s.warehouse_id) !== wid) return false;
      return Boolean(String(s.id || "").trim());
    })
    .slice()
    .sort((a, b) => {
      const sub = String(a.subtype).localeCompare(String(b.subtype));
      if (sub !== 0) return sub;
      return String(a.name || "").localeCompare(String(b.name || ""), "pl");
    });
}

export type GenerateDocumentSeriesOption = {
  seriesId: string;
  /** Primary label (custom series name). */
  primaryLabel: string;
  /** Subtype description, e.g. „WZ — Wydanie zewnętrzne”. */
  subtypeLabel: string;
  /** Full option text for <select>. */
  optionLabel: string;
  subtype: GenerateDocumentSupportedSubtype;
  warehouseId: number;
};

export function formatGenerateDocumentSeriesOption(
  series: DocumentSeriesDto,
  opts?: {
    warehouseNameById?: Record<number, string>;
    /** When true, append warehouse name (ambiguous / multi-warehouse UI). */
    showWarehouse?: boolean;
  },
): GenerateDocumentSeriesOption | null {
  const sid = String(series.id || "").trim();
  if (!sid) return null;
  if (!isGenerateDocumentSupportedSubtype(series.subtype)) return null;
  const subtype = String(series.subtype).toUpperCase() as GenerateDocumentSupportedSubtype;
  const subtypeLabel =
    documentSeriesSubtypeLabelPl(subtype as DocumentSeriesSubtype) || subtype;
  const primaryLabel = String(series.name || "").trim() || subtypeLabel;
  const parts = [primaryLabel];
  if (primaryLabel !== subtypeLabel) {
    parts.push(subtypeLabel);
  }
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
  subtype: string | null | undefined,
): string | null {
  const s = String(subtype || "").trim().toUpperCase();
  if (s === "WZ") {
    return "Utworzy dokument WZ dla zrealizowanego wydania magazynowego. Dokument nie powoduje ponownego rozchodu towaru.";
  }
  if (s === "RESERVATION") {
    return "Utworzy dokument RZ dla istniejącej rezerwacji zamówienia. Dokument nie tworzy rezerwacji ani ruchu magazynowego.";
  }
  return null;
}

/** Resolve payload series_id against loaded options (edit/readback). */
export function resolveGenerateDocumentSeriesId(
  payload: Record<string, unknown> | null | undefined,
): string {
  const raw = payload?.series_id ?? payload?.doc_series ?? payload?.document_series_id ?? "";
  return String(raw || "").trim();
}
