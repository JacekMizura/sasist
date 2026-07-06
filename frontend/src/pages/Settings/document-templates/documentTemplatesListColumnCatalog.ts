import type { FilterFieldCatalogItem } from "../../../components/filters/FilterVisibilityModal";

export const DOC_TEMPLATES_LIST_COLUMNS_LAYOUT_KEY = "document_templates_list_columns_v2";

export const DOC_TEMPLATE_LIST_COLUMN_CATALOG: readonly FilterFieldCatalogItem[] = [
  { id: "name", label: "Nazwa" },
  { id: "kind", label: "Typ" },
  { id: "status", label: "Status" },
  { id: "used_as", label: "Używany jako" },
  { id: "usage", label: "Używane w" },
  { id: "last_edited", label: "Ostatnia edycja" },
  { id: "last_published", label: "Ostatnia publikacja" },
  { id: "author", label: "Autor" },
  { id: "family", label: "Rodzina" },
  { id: "variant", label: "Wariant" },
] as const;

export const DOC_TEMPLATE_LIST_COLUMN_IDS = DOC_TEMPLATE_LIST_COLUMN_CATALOG.map((c) => c.id);

export const DOC_TEMPLATE_LIST_DEFAULT_COLUMN_ORDER: readonly string[] = [
  "name",
  "kind",
  "status",
  "used_as",
  "usage",
  "last_edited",
  "last_published",
  "author",
];

export function documentTemplateListColumnLabel(columnId: string): string {
  return DOC_TEMPLATE_LIST_COLUMN_CATALOG.find((c) => c.id === columnId)?.label ?? columnId;
}

export function migrateDocumentTemplateListColumns(columns: string[]): string[] {
  return columns
    .map((id) => {
      if (id === "source" || id === "binding") return id === "binding" ? "used_as" : null;
      return id;
    })
    .filter((id): id is string => Boolean(id));
}
