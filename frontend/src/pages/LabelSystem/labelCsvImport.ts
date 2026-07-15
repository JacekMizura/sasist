/**
 * CSV → label records for POST /labels/render-pdf.
 * No server or label_engine changes; pure client helpers.
 */
import type { LabelTemplate, TemplateElement } from "../../types/labelSystem";
import { LABEL_VARIABLE_CATEGORIES } from "../../types/labelSystem";

/** Exact header match after trim + lowercase (Polish export columns). */
export const AUTO_MAP: Record<string, string> = {
  "nazwa regału": "rack_name",
  "nazwa półki": "loc_name",
  "kod ean": "barcode_data",
};

const CSV_LABEL_MAPPING_STORAGE_KEY = "csv_label_mapping";

export type CsvLabelMappingPersisted = {
  headers: string[];
  mapping: Record<string, string>;
};

export function headersMatchPersisted(current: string[], saved: string[] | undefined): boolean {
  if (!saved || saved.length !== current.length) return false;
  for (let i = 0; i < current.length; i++) {
    if (saved[i] !== current[i]) return false;
  }
  return true;
}

export function loadPersistedCsvLabelMapping(currentHeaders: string[]): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(CSV_LABEL_MAPPING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CsvLabelMappingPersisted;
    if (!parsed?.headers || !parsed.mapping || typeof parsed.mapping !== "object") return null;
    if (!headersMatchPersisted(currentHeaders, parsed.headers)) return null;
    return { ...parsed.mapping };
  } catch {
    return null;
  }
}

export function saveCsvLabelMapping(headers: string[], mapping: Record<string, string>): void {
  try {
    const payload: CsvLabelMappingPersisted = { headers: [...headers], mapping: { ...mapping } };
    localStorage.setItem(CSV_LABEL_MAPPING_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

/** Fuzzy Polish / partial headers when no exact AUTO_MAP hit. */
function fuzzyFieldFromHeaderLower(key: string): string {
  if (key.includes("regał")) return "rack_name";
  if (key.includes("półk")) return "loc_name";
  if (key.includes("ean")) return "barcode_data";
  return "";
}

/** Known targets for mapping UI + auto-map (headers normalized to lower snake_case). */
export const CSV_AUTO_MAP: ReadonlyArray<{ pattern: RegExp; field: string }> = [
  { pattern: /^(ean|gtin|gtin13|ean13|code)$/i, field: "ean" },
  { pattern: /^(barcode|barcode_data|kod_kreskowy|kod|upc)$/i, field: "barcode_data" },
  { pattern: /^(name|nazwa|product_name|title|tytul|opis_krotki)$/i, field: "prod_name" },
  { pattern: /^(sku|symbol|indeks|product_code|kod_produktu)$/i, field: "sku" },
  { pattern: /^(price|cena|cena_brutto|cena_netto)$/i, field: "price" },
  { pattern: /^(qty|quantity|ilosc|amount)$/i, field: "quantity" },
  { pattern: /^(loc_name|location|lokalizacja|location_code)$/i, field: "loc_name" },
  { pattern: /loc_barcode|location_barcode|kod_lokal|barcode_lokal|kod_lokalizacji/i, field: "loc_barcode" },
  { pattern: /rack_name|^rack$|^rack_[a-z]|rega|shelf|polk|p_yki|sekcja_r/i, field: "rack_name" },
  { pattern: /^(cart_name|wozek)$/i, field: "cart_name" },
  { pattern: /^(order_id|order|zamowienie)$/i, field: "order_id" },
  { pattern: /^(client|customer|klient)$/i, field: "client" },
];

/** Merge pipeline fills these; CSV columns must not map to them. */
export const CSV_DERIVED_GROUP_SLOT_FIELDS = new Set([
  "floor_1",
  "floor_2",
  "floor_3",
  "barcode_1",
  "barcode_2",
  "barcode_3",
  "loc_name_1",
  "loc_name_2",
  "loc_name_3",
]);

export function isCsvDerivedGroupSlotField(field: string): boolean {
  return CSV_DERIVED_GROUP_SLOT_FIELDS.has(String(field).trim());
}

/** Strip invalid targets (e.g. persisted maps from older UI). */
export function filterDerivedGroupSlotsFromCsvMapping(mapping: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [h, f] of Object.entries(mapping)) {
    const fv = f != null ? String(f).trim() : "";
    out[h] = fv && isCsvDerivedGroupSlotField(fv) ? "" : f ?? "";
  }
  return out;
}

/**
 * Full catalog field ids (auto-map / header recognition only).
 * CSV mapping UI uses {@link resolveTemplateAvailableVariables} instead — never dump this into dropdowns.
 */
export function allSuggestedLabelFields(templateKeys: string[]): string[] {
  const fromCatalog = LABEL_VARIABLE_CATEGORIES.flatMap((c) =>
    c.items.map((i) => i.token.replace(/^\{|\}$/g, "")),
  );
  const set = new Set<string>([...fromCatalog, ...templateKeys, "price", "quantity"]);
  set.delete("");
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** @deprecated Prefer template-scoped options from csvMapping/labelCsvMappingFields. Kept for auto-map header checks. */
export function allSuggestedLabelFieldsForCsvMapping(templateKeys: string[]): string[] {
  return allSuggestedLabelFields(templateKeys).filter((f) => !isCsvDerivedGroupSlotField(f));
}

/** Warn when template uses grouped slots but print path has grouping off. */
export function validateGroupedVariablesRequireGrouping(
  templateKeys: Set<string>,
  groupingEnabled: boolean,
): string[] {
  if (groupingEnabled) return [];
  for (const k of templateKeys) {
    if (isCsvDerivedGroupSlotField(k)) {
      return ["Zmienne grupowe wymagają włączonego grupowania etykiet"];
    }
  }
  return [];
}

/** Template references merge slot fields (``floor_1``, ``barcode_1``, …). */
export function templateUsesGroupedLocationSlots(templateKeys: Set<string>): boolean {
  for (const k of templateKeys) {
    if (isCsvDerivedGroupSlotField(k)) return true;
  }
  return false;
}

/**
 * Single-location style bindings (``{floor}``, ``{barcode}``, ``{loc_name}``, …) vs numbered slots (``floor_1``, …).
 * Used with ``groupingEnabled`` to reject incompatible combinations.
 */
export function templateUsesSingleLocationStyleBindings(templateKeys: Set<string>): boolean {
  if (templateUsesGroupedLocationSlots(templateKeys)) return false;
  return (
    templateKeys.has("floor") ||
    templateKeys.has("barcode") ||
    templateKeys.has("loc_name") ||
    templateKeys.has("loc_barcode")
  );
}

/** Grouping on but template has no ``floor_1`` / ``barcode_1`` / … — only single-row fields. */
export function validateCsvGroupingTemplateMode(
  templateKeys: Set<string>,
  groupingEnabled: boolean,
): string[] {
  if (!groupingEnabled) return [];
  if (templateUsesGroupedLocationSlots(templateKeys)) return [];
  if (templateUsesSingleLocationStyleBindings(templateKeys)) {
    return ["Ten szablon nie obsługuje grupowania etykiet"];
  }
  return [];
}

export function csvGroupingPdfBlockedByTemplate(
  templateKeys: Set<string>,
  groupingEnabled: boolean,
): boolean {
  return validateCsvGroupingTemplateMode(templateKeys, groupingEnabled).length > 0;
}

export function normalizeHeaderKey(header: string): string {
  return header
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
}

export function guessFieldForHeader(header: string): string {
  const n = normalizeHeaderKey(header);
  if (!n) return "";
  for (const { pattern, field } of CSV_AUTO_MAP) {
    if (pattern.test(n)) return field;
  }
  if (n === "ean" || n.endsWith("_ean")) return "ean";
  return "";
}

/**
 * Priority: exact Polish AUTO_MAP (trim + lowercase) → fuzzy substring → regex `guessFieldForHeader`.
 */
export function inferCsvFieldForHeader(header: string): string {
  const key = header.trim().toLowerCase();
  const exact = AUTO_MAP[key];
  if (exact) return exact;
  const fuzzy = fuzzyFieldFromHeaderLower(key);
  if (fuzzy) return fuzzy;
  return guessFieldForHeader(header);
}

/** Trim and strip a single pair of surrounding double quotes; unescape doubled quotes inside. */
export function normalizeCsvCell(raw: string): string {
  let v = raw.trim();
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    v = v.slice(1, -1).replace(/""/g, '"').trim();
  }
  return v.trim();
}

/** Count occurrences of `ch` outside quoted `"..."` segments (`""` = escaped quote inside field). */
export function countCharOutsideQuotes(line: string, ch: string): number {
  let n = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        i++;
        continue;
      }
      if (c === '"') inQuotes = false;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ch) n++;
  }
  return n;
}

/** True if `ch` appears at least once outside of quoted segments (handles `;` inside `"..."`). */
export function rowContainsDelimiterOutsideQuotes(line: string, ch: string): boolean {
  return countCharOutsideQuotes(line, ch) > 0;
}

/** First non-empty logical row (quote-aware; stops at unquoted newline). */
export function extractFirstDataRow(text: string): string {
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let i = 0;
  while (i < s.length && s[i] === "\n") i++;
  if (i >= s.length) return "";
  let inQuotes = false;
  const start = i;
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"' && s[i + 1] === '"') {
        i += 2;
        continue;
      }
      if (c === '"') inQuotes = false;
      else i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === "\n") return s.slice(start, i);
    i++;
  }
  return s.slice(start);
}

export const CSV_DELIMITERS = [",", ";", "\t"] as const;
export type CsvDelimiter = (typeof CSV_DELIMITERS)[number];

/** Per-delimiter counts on the header line (quoted segments ignored). */
export function delimiterScores(firstRow: string): Record<CsvDelimiter, number> {
  return {
    ",": countCharOutsideQuotes(firstRow, ","),
    ";": countCharOutsideQuotes(firstRow, ";"),
    "\t": countCharOutsideQuotes(firstRow, "\t"),
  };
}

/**
 * Candidates ordered by count (highest first). Ties: comma → semicolon → tab.
 * When all counts are 0, order is still `,`, `;`, `\t` (comma first as default).
 */
export function orderedDelimiterCandidates(scores: Record<CsvDelimiter, number>): CsvDelimiter[] {
  return [...CSV_DELIMITERS].sort((a, b) => {
    const diff = scores[b] - scores[a];
    if (diff !== 0) return diff;
    return CSV_DELIMITERS.indexOf(a) - CSV_DELIMITERS.indexOf(b);
  });
}

/**
 * Best single delimiter from header line (highest count; ties → `,` then `;` then tab).
 * If all counts are 0, returns `,`.
 */
export function detectCsvDelimiter(text: string): CsvDelimiter {
  const firstRow = extractFirstDataRow(text);
  const scores = delimiterScores(firstRow);
  const [best] = orderedDelimiterCandidates(scores);
  if (scores[best] === 0) return ",";
  return best;
}

/** Parse full CSV/TSV-like text into a raw matrix (no cell normalization yet). */
function parseDelimitedMatrix(text: string, delim: CsvDelimiter): string[][] {
  const matrix: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    matrix.push(row);
    row = [];
  };
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === delim) {
      pushField();
      i++;
      continue;
    }
    if (c === "\n") {
      pushField();
      pushRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  pushField();
  const hasContent = row.some((cell) => String(cell).trim() !== "");
  if (row.length > 1 || (row.length === 1 && row[0] !== "") || hasContent) {
    pushRow();
  }
  return matrix;
}

/**
 * Parse CSV text into header row + object rows (string values only).
 * Delimiter auto-detected: `,`, `;`, or tab (highest count on header outside quotes; retry if single column but header has delimiters).
 */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const firstRow = extractFirstDataRow(text);
  const scores = delimiterScores(firstRow);
  const candidates = orderedDelimiterCandidates(scores);
  const headerHasDelimiter = scores[","] + scores[";"] + scores["\t"] > 0;

  let matrixRaw: string[][] | null = null;
  for (const delim of candidates) {
    const m = parseDelimitedMatrix(text, delim);
    if (m.length === 0) {
      continue;
    }
    const ncol = m[0].length;
    if (ncol > 1 || !headerHasDelimiter) {
      matrixRaw = m;
      break;
    }
  }

  if (!matrixRaw || matrixRaw.length === 0) {
    return { headers: [], rows: [] };
  }
  const matrix = matrixRaw.map((line) => line.map((cell) => normalizeCsvCell(cell)));
  const headers = matrix[0].map((h) => normalizeCsvCell(h));
  const seen: Record<string, number> = {};
  const uniqueHeaders = headers.map((h) => {
    const base = h || "column";
    const n = (seen[base] ?? 0) + 1;
    seen[base] = n;
    return n === 1 ? base : `${base}_${n}`;
  });
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r];
    const obj: Record<string, string> = {};
    for (let c = 0; c < uniqueHeaders.length; c++) {
      const val = line[c] != null ? normalizeCsvCell(String(line[c])) : "";
      obj[uniqueHeaders[c]] = val;
    }
    rows.push(obj);
  }
  return { headers: uniqueHeaders, rows };
}

/** One input file after `parseCsv`. */
export type ParsedCsvFile = {
  filename: string;
  headers: string[];
  rows: Record<string, string>[];
};

/** Row counts per uploaded file (after merge). */
export type CsvFileRowStats = {
  filename: string;
  rowCount: number;
};

/**
 * Merge several parsed CSVs into one dataset: union of column names (first-seen order),
 * each row keyed by the full header list; missing cells become "".
 */
export function mergeParsedCsvSources(files: ParsedCsvFile[]): {
  headers: string[];
  rows: Record<string, string>[];
  perFile: CsvFileRowStats[];
  warnings: string[];
} {
  if (!files.length) {
    return { headers: [], rows: [], perFile: [], warnings: [] };
  }
  const warnings: string[] = [];
  const headerOrder: string[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    for (const h of f.headers) {
      if (!seen.has(h)) {
        seen.add(h);
        headerOrder.push(h);
      }
    }
  }
  const perFile: CsvFileRowStats[] = [];
  const rows: Record<string, string>[] = [];
  for (const f of files) {
    const present = new Set(f.headers);
    const missing = headerOrder.filter((h) => !present.has(h));
    if (missing.length > 0 && f.rows.length > 0) {
      warnings.push(
        `Plik „${f.filename}” nie zawiera kolumn: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""} (wstawiono puste wartości).`,
      );
    }
    for (const r of f.rows) {
      const out: Record<string, string> = {};
      for (const h of headerOrder) {
        out[h] = r[h] ?? "";
      }
      rows.push(out);
    }
    perFile.push({ filename: f.filename, rowCount: f.rows.length });
  }
  return { headers: headerOrder, rows, perFile, warnings };
}

/** Keys like `{loc_name}` must not appear in POST /labels/render-pdf payloads. */
const BRACED_BINDING_KEY = /^\{[^}]+\}$/;

export function stripBracedBindingKeysFromRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (BRACED_BINDING_KEY.test(k)) continue;
    if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        item !== null && typeof item === "object" && !Array.isArray(item)
          ? stripBracedBindingKeysFromRecord(item as Record<string, unknown>)
          : item,
      );
    } else if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      out[k] = stripBracedBindingKeysFromRecord(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function sanitizeRecordsForRenderPdf(records: Record<string, unknown>[]): Record<string, unknown>[] {
  return records.map((r) => stripBracedBindingKeysFromRecord(r));
}

/**
 * Drop duplicate label records that share the same rack_name + floor + row (trimmed, case-insensitive).
 * Rows with all three empty are never deduplicated against each other.
 */
export function dedupeLabelRecordsByRackFloorRow(records: Record<string, unknown>[]): Record<string, unknown>[] {
  const val = (r: Record<string, unknown>, k: string) => {
    const v = r[k];
    return v == null ? "" : String(v).trim().toLowerCase();
  };
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const r of records) {
    const rack = val(r, "rack_name");
    const floor = val(r, "floor");
    const row = val(r, "row");
    if (!rack && !floor && !row) {
      out.push(r);
      continue;
    }
    const key = `${rack}\u0000${floor}\u0000${row}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** Initial column → field map from headers (AUTO_MAP + fuzzy + regex guess). */
export function buildAutoColumnMapping(headers: string[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const h of headers) {
    const g = inferCsvFieldForHeader(h);
    if (g) m[h] = g;
    else {
      const n = normalizeHeaderKey(h);
      if (n && allSuggestedLabelFieldsForCsvMapping([]).includes(n)) m[h] = n;
    }
  }
  return filterDerivedGroupSlotsFromCsvMapping(m);
}

/**
 * Merge persisted mapping when CSV headers match; fill gaps via `inferCsvFieldForHeader`.
 * Saves result to localStorage. Call after each CSV load (and optionally after manual auto-map).
 */
export function buildColumnMappingWithPersistence(
  headers: string[],
  options?: { forceAuto?: boolean },
): Record<string, string> {
  const saved = options?.forceAuto ? null : loadPersistedCsvLabelMapping(headers);
  const m: Record<string, string> = {};
  for (const h of headers) {
    if (saved != null && Object.prototype.hasOwnProperty.call(saved, h)) {
      const v = saved[h];
      m[h] = v != null && String(v).trim() !== "" ? String(v).trim() : "";
      continue;
    }
    const g = inferCsvFieldForHeader(h);
    if (g) m[h] = g;
    else {
      const n = normalizeHeaderKey(h);
      if (n && allSuggestedLabelFieldsForCsvMapping([]).includes(n)) m[h] = n;
    }
  }
  const cleaned = filterDerivedGroupSlotsFromCsvMapping(m);
  saveCsvLabelMapping(headers, cleaned);
  console.log("[CSV AUTO MAP]", cleaned);
  return cleaned;
}

function normalizeBindingToken(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  if (s.startsWith("{") && s.endsWith("}")) return s.slice(1, -1).trim();
  return s;
}

function collectStaticTextPlaceholders(text: string): string[] {
  const m = text.trim().match(/^{?([a-zA-Z0-9_]+)}}?$/);
  if (m) return [m[1]];
  return [];
}

/**
 * Data keys referenced by template (flat elements only).
 * Does not descend into repeater.template (MVP: repeater filled separately).
 */
export function extractTemplateDataBindingKeys(template: LabelTemplate | null): {
  keys: Set<string>;
  hasRepeater: boolean;
} {
  const keys = new Set<string>();
  let hasRepeater = false;

  const visit = (elements: TemplateElement[] | undefined) => {
    if (!elements?.length) return;
    for (const el of elements) {
      const t = (el as { type?: string }).type;
      if (t === "repeater") {
        hasRepeater = true;
        continue;
      }
      if (t === "group" && "elements" in el && Array.isArray((el as { elements: TemplateElement[] }).elements)) {
        visit((el as { elements: TemplateElement[] }).elements);
        continue;
      }
      if (t === "barcode") {
        const b = (el as { dataBinding?: string; binding?: string }).dataBinding ?? (el as { binding?: string }).binding;
        const k = normalizeBindingToken(String(b || "barcode_data"));
        if (k) keys.add(k);
      }
      if (t === "dynamicText" || t === "text") {
        const b = (el as { binding?: string; dataBinding?: string }).binding ?? (el as { dataBinding?: string }).dataBinding;
        const k = normalizeBindingToken(String(b || ""));
        if (k) keys.add(k);
      }
      if (t === "staticText") {
        const tx = (el as { text?: string }).text ?? "";
        for (const ph of collectStaticTextPlaceholders(tx)) keys.add(ph);
      }
      if (t === "rect" || t === "rectangle") {
        const b = (el as { binding?: string; dataBinding?: string }).binding ?? (el as { dataBinding?: string }).dataBinding;
        const k = normalizeBindingToken(String(b || ""));
        if (k) keys.add(k);
      }
    }
  };

  visit(template?.elements);
  return { keys, hasRepeater };
}

/**
 * Resolve UI mapping for a row key when direct lookup fails (trim/BOM drift, normalized header match).
 */
function resolveMappedFieldForRow(header: string, headerToField: Record<string, string>): string {
  const tryKeys = [header, header.trim(), header.replace(/^\uFEFF/, "").trim()].filter(
    (k, i, a) => a.indexOf(k) === i,
  );
  for (const k of tryKeys) {
    const f = headerToField[k];
    if (f != null && String(f).trim() !== "") return String(f).trim();
  }
  const cellNorm = (s: string) => normalizeCsvCell(s);
  const nh = cellNorm(header);
  const nKey = normalizeHeaderKey(header);
  for (const [mapHeader, field] of Object.entries(headerToField)) {
    const fv = field != null ? String(field).trim() : "";
    if (!fv) continue;
    if (cellNorm(mapHeader) === nh || normalizeHeaderKey(mapHeader) === nKey) return fv;
  }
  return "";
}

/** Apply optional aliases: ean → barcode_data when barcode empty; name → prod_name already via map. */
export function enrichLabelRecordAliases(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (BRACED_BINDING_KEY.test(k)) continue;
    out[k] = typeof v === "string" ? v.trim() : v;
  }
  const get = (k: string) => (out[k] != null ? String(out[k]).trim() : "");
  if (!get("barcode_data")) {
    const fromEan = get("ean");
    const fromSku = get("sku");
    const v = fromEan || fromSku;
    if (v) {
      out.barcode_data = v;
    }
  }
  return out;
}

/** Build render-pdf records from CSV rows + header→field mapping. */
export function buildLabelRecordsFromCsvRows(
  rows: Record<string, string>[],
  headerToField: Record<string, string>,
): Record<string, unknown>[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [header, rawVal] of Object.entries(r)) {
      if (header === "__proto__" || header === "constructor") continue;
      const key = resolveMappedFieldForRow(header, headerToField);
      if (!key) continue;
      const s = rawVal == null || rawVal === undefined ? "" : String(rawVal).trim();
      out[key] = s;
    }
    const record = enrichLabelRecordAliases(out);
    if (record.loc_name) {
      record.level = record.loc_name;
    }
    return record;
  });
}

/** Which label fields receive at least one mapped CSV column. */
export function mappedTargetFields(headerToField: Record<string, string>): Set<string> {
  const s = new Set<string>();
  for (const v of Object.values(headerToField)) {
    const k = (v ?? "").trim();
    if (k) s.add(k);
  }
  return s;
}

/** Default media box (mm) when stored JSON looks like an office sheet (e.g. 210×297). */
const CSV_LABEL_PDF_FALLBACK_WIDTH_MM = 100;
const CSV_LABEL_PDF_FALLBACK_HEIGHT_MM = 60;

function readTemplateDimensionsMmFromObject(obj: Record<string, unknown>): {
  w: number;
  h: number;
  inner: Record<string, unknown> | null;
} {
  const inner =
    obj.template && typeof obj.template === "object" && !Array.isArray(obj.template)
      ? (obj.template as Record<string, unknown>)
      : null;
  const from = (o: Record<string, unknown> | null): { w: number; h: number } => {
    if (!o) return { w: NaN, h: NaN };
    const w = Number(o.widthMm ?? o.width_mm);
    const h = Number(o.heightMm ?? o.height_mm);
    return {
      w: Number.isFinite(w) && w > 0 ? w : NaN,
      h: Number.isFinite(h) && h > 0 ? h : NaN,
    };
  };
  const root = from(obj);
  const inn = from(inner);
  const w = Number.isFinite(root.w) ? root.w : inn.w;
  const h = Number.isFinite(root.h) ? root.h : inn.h;
  return { w, h, inner };
}

function writeTemplateDimensionsMmToObject(
  obj: Record<string, unknown>,
  inner: Record<string, unknown> | null,
  w: number,
  h: number,
): void {
  const apply = (o: Record<string, unknown>) => {
    o.widthMm = w;
    o.heightMm = h;
    if ("width_mm" in o) o.width_mm = w;
    if ("height_mm" in o) o.height_mm = h;
  };
  apply(obj);
  if (inner) apply(inner);
}

export type SanitizeTemplateJsonDimensionsForCsvResult = {
  /** JSON string to send as `template_json` (may be rewritten). */
  templateJson: string;
  warnings: string[];
  /** True when dimensions were replaced (A4-like sheet). */
  replacedA4Like: boolean;
};

/**
 * CSV → `POST /labels/render-pdf`: warn if any side &gt; 200 mm; if page looks like A4 in mm, replace with 100×60 mm.
 */
export function sanitizeTemplateJsonDimensionsForCsvExport(templateJson: string): SanitizeTemplateJsonDimensionsForCsvResult {
  const warnings: string[] = [];
  let replacedA4Like = false;
  const trimmed = (templateJson ?? "").trim();
  if (!trimmed) {
    return { templateJson: templateJson ?? "", warnings, replacedA4Like };
  }
  try {
    let raw: unknown = JSON.parse(trimmed);
    while (typeof raw === "string" && String(raw).trim()) {
      raw = JSON.parse(String(raw).trim());
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { templateJson: trimmed, warnings, replacedA4Like };
    }
    const obj = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
    const { w, h, inner } = readTemplateDimensionsMmFromObject(obj);
    if (!Number.isFinite(w) || !Number.isFinite(h)) {
      return { templateJson: trimmed, warnings, replacedA4Like };
    }
    if (w > 200 || h > 200) {
      warnings.push(
        `Wykryto bardzo duże wymiary szablonu (${w}×${h} mm), podobne do arkusza A4. Przed drukiem warto je zmniejszyć w projektancie.`,
      );
    }
    const looksLikeA4Sheet =
      (w >= 199 && h >= 280) ||
      (h >= 199 && w >= 280) ||
      (Math.abs(w - 210) < 5 && Math.abs(h - 297) < 5) ||
      (Math.abs(h - 210) < 5 && Math.abs(w - 297) < 5);
    if (looksLikeA4Sheet) {
      writeTemplateDimensionsMmToObject(obj, inner, CSV_LABEL_PDF_FALLBACK_WIDTH_MM, CSV_LABEL_PDF_FALLBACK_HEIGHT_MM);
      replacedA4Like = true;
      warnings.push(
        `Wymiary strony zostały tymczasowo zmienione na ${CSV_LABEL_PDF_FALLBACK_WIDTH_MM}×${CSV_LABEL_PDF_FALLBACK_HEIGHT_MM} mm (było ${w}×${h} mm). Zapisz szablon w projektancie z prawidłowym rozmiarem etykiety.`,
      );
      return { templateJson: JSON.stringify(obj), warnings, replacedA4Like };
    }
    return { templateJson: trimmed, warnings, replacedA4Like };
  } catch {
    return { templateJson: trimmed, warnings, replacedA4Like };
  }
}

const CSV_TEMPLATE_FIELD_UI_PL: Record<string, string> = {
  row: "Rząd",
  rack_name: "Regał",
  floor: "Piętro",
  floor_1: "Piętro 1",
  floor_2: "Piętro 2",
  floor_3: "Piętro 3",
  loc_name: "Nazwa lokacji",
  loc_name_1: "Nazwa lokacji 1",
  loc_name_2: "Nazwa lokacji 2",
  loc_name_3: "Nazwa lokacji 3",
  loc_barcode: "Kod lokacji",
  barcode: "Kod kreskowy",
  barcode_1: "Kod kreskowy 1",
  barcode_2: "Kod kreskowy 2",
  barcode_3: "Kod kreskowy 3",
  barcode_data: "Kod kreskowy",
  location_barcode: "Kod lokacji",
  location_name: "Nazwa lokacji",
  location_code: "Kod lokacji",
  bin: "Skrzynka",
  zone: "Strefa",
  prod_name: "Nazwa produktu",
  sku: "SKU",
  ean: "EAN",
  price: "Cena",
  quantity: "Ilość",
  cart_id: "ID wózka",
  cart_name: "Nazwa wózka",
  cart_barcode: "Kod wózka",
  basket_id: "ID koszyka",
  basket_code: "Kod koszyka",
  order_id: "ID zamówienia",
  client: "Klient",
  priority: "Priorytet",
  batch_number: "Numer partii",
  serial_number: "Numer seryjny",
  expiration_date: "Data ważności",
  manufacturer: "Producent",
  country_of_origin: "Kraj pochodzenia",
  unit: "Jednostka",
  weight: "Waga",
  length: "Długość",
  width: "Szerokość",
  height: "Wysokość",
  image: "Zdjęcie produktu (URL)",
  product_barcode: "Kod produktu",
  sale_price: "Cena sprzedaży",
  purchase_price: "Cena zakupu",
  vat_rate: "Stawka VAT",
  has_ce: "Oznaczenie CE",
  regulations: "Regulacje / symbole",
  cart_capacity: "Pojemność wózka",
  cart_weight: "Waga wózka",
  cart_sections: "Liczba sekcji wózka",
  basket_barcode: "Kod kreskowy koszyka",
  basket_level: "Poziom koszyka",
  basket_position: "Pozycja koszyka",
  storage_type: "Typ składowania",
  volume_capacity: "Pojemność objętościowa",
  aisle_letter: "Litera alei",
  rack_index: "Indeks regału",
  dataset_index: "Indeks wiersza (dataset)",
  repeater_slot: "Slot powtórzenia",
};

let mergedCsvFieldUiPlCache: Record<string, string> | null = null;

function getMergedCsvFieldUiPl(): Record<string, string> {
  if (!mergedCsvFieldUiPlCache) {
    const out: Record<string, string> = { ...CSV_TEMPLATE_FIELD_UI_PL };
    for (const cat of LABEL_VARIABLE_CATEGORIES) {
      for (const it of cat.items) {
        const bare = it.token.replace(/^\{|\}$/g, "").trim();
        if (bare) out[bare] = it.label;
      }
    }
    mergedCsvFieldUiPlCache = out;
  }
  return mergedCsvFieldUiPlCache;
}

/** Polish label for CSV mapping dropdowns and validation messages (value stays canonical field id). */
export function polishLabelCsvFieldForUi(field: string): string {
  const map = getMergedCsvFieldUiPl();
  const raw = (field ?? "").trim();
  const bare = raw.replace(/^\{|\}$/g, "").trim();
  return map[bare] ?? map[raw] ?? (bare ? `Pole: ${bare}` : "—");
}

export function validateCsvAgainstTemplate(
  templateKeys: Set<string>,
  hasRepeater: boolean,
  headerToField: Record<string, string>,
): string[] {
  const warnings: string[] = [];
  if (hasRepeater) {
    warnings.push(
      "Szablon zawiera repeater — import CSV wysyła jeden płaski rekord na wiersz; obszar repeatera może być pusty. Użyj szablonu bez repeatera lub innego trybu druku.",
    );
  }
  const covered = mappedTargetFields(headerToField);
  for (const k of templateKeys) {
    if (isCsvDerivedGroupSlotField(k)) continue;
    if (!covered.has(k)) {
      warnings.push(
        `Szablon używa pola „${polishLabelCsvFieldForUi(k)}”, ale żadna kolumna CSV nie jest zmapowana na to pole — fragment może być pusty.`,
      );
    }
  }
  return warnings;
}
