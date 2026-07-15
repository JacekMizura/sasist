/**
 * CSV column → label field options for print queue mapping.
 * Prefer template.available_variables; fall back to bindings, then type catalog.
 */
import {
  LABEL_VARIABLE_CATEGORIES,
  TEMPLATE_TYPE_CATEGORIES,
  type LabelTemplate,
  type TemplateType,
  type VariableCategoryId,
} from "../../../types/labelSystem";
import { isCsvDerivedGroupSlotField, polishLabelCsvFieldForUi } from "../labelCsvImport";

/** UI groups for the CSV mapping combobox (user-facing order). */
export type CsvMappingUiGroupId =
  | "location"
  | "product"
  | "document"
  | "cart"
  | "trolley"
  | "system";

export type CsvMappingUiGroup = {
  id: CsvMappingUiGroupId;
  label: string;
  categoryIds: VariableCategoryId[];
};

export const CSV_MAPPING_UI_GROUPS: CsvMappingUiGroup[] = [
  { id: "location", label: "Lokalizacja", categoryIds: ["warehouse", "fleet"] },
  {
    id: "product",
    label: "Produkt",
    categoryIds: [
      "product_basic",
      "product_pricing",
      "product_logistics",
      "product_batch",
      "product_origin",
      "product_regulations",
      "product_media",
    ],
  },
  { id: "document", label: "Dokument", categoryIds: ["documents", "orders"] },
  { id: "cart", label: "Koszyk", categoryIds: ["basket"] },
  { id: "trolley", label: "Wózek", categoryIds: ["cart"] },
  { id: "system", label: "System", categoryIds: [] },
];

/** Coarse template kind for filtering / default-expanded group. */
export type CsvTemplateKind = CsvMappingUiGroupId | "other";

export type CsvMappingFieldOption = {
  field: string;
  label: string;
  groupId: CsvMappingUiGroupId;
  /** Field referenced by the selected template (required for a complete map). */
  fromTemplate: boolean;
};

export type CsvMappingFieldGroup = {
  group: CsvMappingUiGroup;
  options: CsvMappingFieldOption[];
};

export type CsvMappingStatus = "required" | "optional" | "missing";

const LOCATION_SUBTYPES = new Set([
  "location",
  "pallet",
  "rack",
  "shelf",
  "rack_segment",
  "zone",
  "carton",
  "parcel",
  "other",
]);

/** Bare field id from catalog token / binding. */
export function bareCsvFieldId(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/^\{\{\s*/, "")
    .replace(/\s*\}\}$/, "")
    .replace(/^\{/, "")
    .replace(/\}$/, "")
    .trim();
}

export function resolveCsvTemplateKind(templateType: string | null | undefined): CsvTemplateKind {
  const v = (templateType ?? "location").trim().toLowerCase();
  if (v === "product") return "product";
  if (v === "basket") return "cart";
  if (v === "cart") return "trolley";
  if (v === "order" || v === "document" || v.startsWith("document_")) return "document";
  if (LOCATION_SUBTYPES.has(v)) return "location";
  return "other";
}

/** Map UI kind → TemplateType used by TEMPLATE_TYPE_CATEGORIES. */
function kindToTemplateType(kind: CsvTemplateKind): TemplateType {
  if (kind === "product") return "product";
  if (kind === "cart") return "basket";
  if (kind === "trolley") return "cart";
  if (kind === "document") return "document_invoice";
  return "location";
}

function catalogFieldToGroupId(field: string): CsvMappingUiGroupId {
  const bare = bareCsvFieldId(field);
  for (const group of CSV_MAPPING_UI_GROUPS) {
    if (group.id === "system") continue;
    for (const catId of group.categoryIds) {
      const cat = LABEL_VARIABLE_CATEGORIES.find((c) => c.id === catId);
      if (!cat) continue;
      for (const item of cat.items) {
        if (bareCsvFieldId(item.token) === bare || item.id === bare) return group.id;
      }
    }
  }
  if (bare === "price" || bare === "quantity" || bare === "ean" || bare === "sku") return "product";
  return "system";
}

function fieldsForCategories(categoryIds: VariableCategoryId[]): string[] {
  const out: string[] = [];
  for (const catId of categoryIds) {
    const cat = LABEL_VARIABLE_CATEGORIES.find((c) => c.id === catId);
    if (!cat) continue;
    for (const item of cat.items) {
      const bare = bareCsvFieldId(item.token) || item.id;
      if (bare && !isCsvDerivedGroupSlotField(bare)) out.push(bare);
    }
  }
  return out;
}

/** Type-catalog fallback when template does not declare available_variables / bindings. */
export function fallbackFieldsForTemplateKind(kind: CsvTemplateKind): string[] {
  const tt = kindToTemplateType(kind);
  const cats = TEMPLATE_TYPE_CATEGORIES[tt] ?? TEMPLATE_TYPE_CATEGORIES.location;
  const fields = fieldsForCategories(cats);
  if (kind === "product") {
    for (const extra of ["price", "quantity", "ean", "sku"]) {
      if (!fields.includes(extra)) fields.push(extra);
    }
  }
  return fields;
}

/**
 * Fields the selected template actually uses (for the checklist).
 * Priority: available_variables → variables → binding keys. No type-catalog padding.
 */
export function resolveTemplateUsedVariables(args: {
  template: LabelTemplate | null;
  apiAvailableVariables?: string[] | null;
  bindingKeys: Iterable<string>;
}): string[] {
  const fromApi = normalizeVarList(args.apiAvailableVariables);
  if (fromApi.length > 0) return fromApi;

  const tpl = args.template as (LabelTemplate & { available_variables?: string[] }) | null;
  const fromTpl = normalizeVarList(tpl?.available_variables ?? tpl?.variables);
  if (fromTpl.length > 0) return fromTpl;

  return normalizeVarList([...args.bindingKeys]);
}

/**
 * Dropdown options for CSV mapping — only fields used by the selected template.
 * No type-catalog fallback (avoids cluttering location CSV with invoice/cart fields).
 */
export function resolveTemplateAvailableVariables(args: {
  template: LabelTemplate | null;
  apiAvailableVariables?: string[] | null;
  bindingKeys: Iterable<string>;
  templateType?: string | null;
}): string[] {
  return resolveTemplateUsedVariables(args);
}

function normalizeVarList(raw: string[] | null | undefined): string[] {
  if (!raw?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    const bare = bareCsvFieldId(v);
    if (!bare || isCsvDerivedGroupSlotField(bare) || seen.has(bare)) continue;
    seen.add(bare);
    out.push(bare);
  }
  return out;
}

/** location / product / document → only that domain (used for type fallback). */
function filterFieldsToStrictKind(fields: string[], kind: CsvTemplateKind): string[] {
  if (kind !== "location" && kind !== "product" && kind !== "document") return fields;
  return fields.filter((f) => catalogFieldToGroupId(f) === kind);
}

/**
 * Group dropdown options from resolved available variables.
 * Only those fields — never the full system catalog.
 */
export function buildCsvMappingFieldGroups(args: {
  availableVariables: string[];
  templateType?: string | null;
}): CsvMappingFieldGroup[] {
  const availableSet = new Set(args.availableVariables);
  const allowed = args.availableVariables.filter((f) => f && !isCsvDerivedGroupSlotField(f));

  const byGroup = new Map<CsvMappingUiGroupId, CsvMappingFieldOption[]>();
  for (const group of CSV_MAPPING_UI_GROUPS) byGroup.set(group.id, []);

  for (const field of allowed) {
    const groupId = catalogFieldToGroupId(field);
    const bucket = byGroup.get(groupId) ?? byGroup.get("system")!;
    bucket.push({
      field,
      label: polishLabelCsvFieldForUi(field),
      groupId,
      fromTemplate: availableSet.has(field),
    });
  }

  return CSV_MAPPING_UI_GROUPS.map((group) => ({
    group,
    options: (byGroup.get(group.id) ?? []).sort((a, b) => a.label.localeCompare(b.label, "pl")),
  })).filter((g) => g.options.length > 0);
}

export function defaultExpandedCsvGroupId(templateType: string | null | undefined): CsvMappingUiGroupId {
  const kind = resolveCsvTemplateKind(templateType);
  if (kind === "other") return "location";
  return kind;
}

export function csvColumnMappingStatus(
  mappedField: string,
  availableVariables: ReadonlySet<string>,
): CsvMappingStatus {
  const bare = bareCsvFieldId(mappedField);
  if (!bare) return "missing";
  if (availableVariables.has(bare)) return "required";
  return "optional";
}

export function csvTemplateFieldMappingStatus(
  field: string,
  mappedTargets: ReadonlySet<string>,
): CsvMappingStatus {
  const bare = bareCsvFieldId(field);
  if (mappedTargets.has(bare)) return "required";
  return "missing";
}

export function csvMappingStatusLabel(status: CsvMappingStatus): string {
  if (status === "required") return "Wymagane";
  if (status === "optional") return "Opcjonalne";
  return "Nie znaleziono";
}
