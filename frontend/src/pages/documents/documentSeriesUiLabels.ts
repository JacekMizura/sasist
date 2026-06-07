import type {
  DocumentSeriesDto,
  DocumentSeriesSubtype,
  DocumentSeriesType,
  DeleteMode,
  VatCalcLineMode,
  VatSource,
} from "../../api/documentSeriesApi";

export function documentSeriesTypeLabelPl(t: DocumentSeriesType): string {
  switch (t) {
    case "SALE":
      return "Sprzedaż";
    case "WAREHOUSE":
      return "Magazyn";
    case "CORRECTION":
      return "Korekta";
    default:
      return "";
  }
}

export function documentSeriesSubtypeLabelPl(s: DocumentSeriesSubtype): string {
  switch (s) {
    case "INVOICE":
      return "Faktura";
    case "RECEIPT":
      return "Paragon";
    case "CORRECTION":
      return "Korekta";
    case "WZ":
      return "WZ";
    case "PZ":
      return "PZ";
    case "MM":
      return "MM — przesunięcie";
    case "RW":
      return "RW";
    case "PW":
      return "PW";
    case "RESERVATION":
      return "Rezerwacja";
    default:
      return "";
  }
}

export function vatSourceLabelPl(v: VatSource | null | undefined): string {
  switch (v) {
    case "FROM_ORDER":
      return "Z zamówienia";
    case "FROM_LINES":
      return "Z linii dokumentu";
    case "MANUAL":
      return "Ręcznie";
    case "FIXED":
      return "Stała stawka";
    default:
      return "—";
  }
}

export function deleteModeLabelPl(m: DeleteMode): string {
  switch (m) {
    case "ASK":
      return "Pytaj przed usunięciem";
    case "ALWAYS_DELETE":
      return "Zawsze usuwaj";
    default:
      return "";
  }
}

export function vatCalcLineModeLabelPl(v: VatCalcLineMode): string {
  switch (v) {
    case "DEFAULT":
      return "Domyślnie wg ustawień systemu";
    case "FROM_ORDER":
      return "Z zamówienia";
    case "FROM_LINES":
      return "Z linii dokumentu";
    case "EXCLUDE":
      return "Wyłącz z podstawy opodatkowania";
    case "MANUAL":
      return "Ręcznie lub stała stawka z serii";
    default:
      return "";
  }
}

export const VAT_CALC_OPTIONS_PL: { value: VatCalcLineMode; label: string }[] = [
  { value: "DEFAULT", label: vatCalcLineModeLabelPl("DEFAULT") },
  { value: "FROM_ORDER", label: vatCalcLineModeLabelPl("FROM_ORDER") },
  { value: "FROM_LINES", label: vatCalcLineModeLabelPl("FROM_LINES") },
  { value: "EXCLUDE", label: vatCalcLineModeLabelPl("EXCLUDE") },
  { value: "MANUAL", label: vatCalcLineModeLabelPl("MANUAL") },
];

export type NumberingPresetUi = "continuous" | "monthly" | "yearly";

export function numberingPresetFromDraft(d: {
  numbering_format: string;
  reset_each_period: boolean;
}): NumberingPresetUi {
  if (!d.reset_each_period) return "continuous";
  const fmt = (d.numbering_format || "").toUpperCase();
  if (fmt.includes("{MONTH}") || fmt.includes("{MM}")) return "monthly";
  if (fmt.includes("{YEAR}") || fmt.includes("{YYYY}")) return "yearly";
  return "yearly";
}

export function applyNumberingPreset(p: NumberingPresetUi): {
  numbering_format: string;
  reset_each_period: boolean;
} {
  if (p === "continuous") return { numbering_format: "{PREFIX}{NUMBER}", reset_each_period: false };
  if (p === "monthly") return { numbering_format: "{PREFIX}{YEAR}{MONTH}{NUMBER}", reset_each_period: true };
  return { numbering_format: "{PREFIX}{YEAR}{NUMBER}", reset_each_period: true };
}

export function numberingPresetLabelPl(p: NumberingPresetUi): string {
  switch (p) {
    case "continuous":
      return "Ciągła";
    case "monthly":
      return "Miesięczna";
    case "yearly":
      return "Roczna";
    default:
      return "";
  }
}

/** Przykładowy numer dla podglądu — wyłącznie ilustracja. */
export function documentSeriesNumberingPreview(
  prefix: string,
  preset: NumberingPresetUi,
  numbering_start: number,
  padding_length = 6,
): string {
  const p = (prefix || "FS").trim() || "FS";
  const n = Math.max(1, numbering_start || 1);
  const pad = Math.min(12, Math.max(1, padding_length || 6));
  const num = String(n).padStart(pad, "0");
  if (preset === "continuous") return `${p}/${num}`;
  if (preset === "monthly") return `${p}/2024/04/${num}`;
  return `${p}/2024/${num}`;
}

export function numberingSummaryForListRow(
  row: Pick<DocumentSeriesDto, "prefix" | "numbering_format" | "reset_each_period" | "numbering_start">,
): string {
  const preset = numberingPresetFromDraft(row);
  const label = numberingPresetLabelPl(preset);
  const prev = documentSeriesNumberingPreview(row.prefix || "", preset, row.numbering_start);
  return `${label} · ${prev}`;
}

export const DOCUMENT_SERIES_PRINT_TEMPLATE_PRESETS: readonly { id: number; label: string }[] = [
  { id: 1, label: "Faktura VAT — szablon domyślny" },
  { id: 2, label: "Paragon — szablon domyślny" },
  { id: 3, label: "WZ — szablon domyślny" },
  { id: 4, label: "Korekta — szablon domyślny" },
] as const;

export function printTemplateSummaryPl(row: Pick<DocumentSeriesDto, "print_template_id" | "print_template">): string {
  const id = row.print_template_id;
  if (id != null) {
    const hit = DOCUMENT_SERIES_PRINT_TEMPLATE_PRESETS.find((p) => p.id === id);
    if (hit) return hit.label;
  }
  const t = (row.print_template || "").trim();
  if (t) return "Szablon własny";
  return "—";
}

export function vatColumnSummaryPl(
  row: Pick<DocumentSeriesDto, "vat_source" | "vat_rate_percent">,
): string {
  const pct = row.vat_rate_percent;
  const src = row.vat_source ? vatSourceLabelPl(row.vat_source) : null;
  if (src && pct != null) return `${src} · ${pct}%`;
  if (pct != null) return `${pct}%`;
  return src ?? "—";
}
