import { useEffect, useMemo, useState } from "react";
import { ChevronDown, TableProperties } from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import {
  exportTemplateZip,
  fetchDocumentTemplateCatalog,
  fetchDocumentTemplatesList,
  fetchTemplateUsage,
  publishDocumentTemplate,
  type DocumentTemplateListItemDto,
} from "../../../api/documentTemplatesApi";
import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { FilterVisibilityModal, useListColumnLayout } from "../../../components/filters";
import { moduleTableCardClass } from "../../../components/listPage/moduleList";
import {
  listSellasistToolbarSquareBtn,
  listSellasistToolbarToggleBtn,
} from "../../../components/listPage/listSellasistTokens";
import { DEFAULT_TENANT_ID, LIST_BASE } from "./constants";
import { DocumentTemplatesListFiltersPanel, EMPTY_DOC_TEMPLATE_LIST_FILTERS } from "./DocumentTemplatesListFiltersPanel";
import { DocumentTemplatesListTable } from "./DocumentTemplatesListTable";
import { TemplateUsageModal } from "./components/TemplateUsageModal";
import {
  DOC_TEMPLATE_LIST_COLUMN_CATALOG,
  DOC_TEMPLATE_LIST_COLUMN_IDS,
  DOC_TEMPLATE_LIST_DEFAULT_COLUMN_ORDER,
  DOC_TEMPLATES_LIST_COLUMNS_LAYOUT_KEY,
  migrateDocumentTemplateListColumns,
} from "./documentTemplatesListColumnCatalog";
import { documentTemplateAuthorName } from "./documentTemplatesListPresentation";

export function DocumentTemplatesListPage() {
  const navigate = useNavigate();
  const [families, setFamilies] = useState<Awaited<ReturnType<typeof fetchDocumentTemplateCatalog>>>([]);
  const [items, setItems] = useState<DocumentTemplateListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState(EMPTY_DOC_TEMPLATE_LIST_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_DOC_TEMPLATE_LIST_FILTERS);
  const [usageModal, setUsageModal] = useState<{
    name: string;
    badges: DocumentTemplateListItemDto["usage_summary"];
    items: Awaited<ReturnType<typeof fetchTemplateUsage>>["items"];
  } | null>(null);

  const { columnOrder, persistColumnOrder } = useListColumnLayout(
    DOC_TEMPLATES_LIST_COLUMNS_LAYOUT_KEY,
    DOC_TEMPLATE_LIST_COLUMN_IDS,
    DOC_TEMPLATE_LIST_DEFAULT_COLUMN_ORDER,
    undefined,
    migrateDocumentTemplateListColumns,
  );

  const kinds = useMemo(() => {
    if (appliedFilters.familyCode) {
      return families.find((f) => f.code === appliedFilters.familyCode)?.kinds ?? [];
    }
    return families.flatMap((f) => f.kinds);
  }, [families, appliedFilters.familyCode]);

  const effectiveColumnOrder = useMemo(() => {
    const hasAnyAuthor = items.some((row) => documentTemplateAuthorName(row.author_name));
    if (hasAnyAuthor) return columnOrder;
    return columnOrder.filter((id) => id !== "author");
  }, [columnOrder, items]);

  async function reload(filters = appliedFilters) {
    setLoading(true);
    try {
      const [catalog, rows] = await Promise.all([
        fetchDocumentTemplateCatalog(),
        fetchDocumentTemplatesList(DEFAULT_TENANT_ID, {
          family_code: filters.familyCode || undefined,
          kind_code: filters.kindCode || undefined,
          variant_code: filters.variantCode || undefined,
          status: filters.status || undefined,
          source: filters.source || undefined,
          template_role: "DOCUMENT",
        }),
      ]);
      setFamilies(catalog);
      setItems(rows);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, "Nie udało się wczytać listy."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [appliedFilters]);

  const filtered = useMemo(() => {
    const q = appliedFilters.search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        (row.kind?.name_pl ?? "").toLowerCase().includes(q) ||
        (row.binding_summary ?? "").toLowerCase().includes(q),
    );
  }, [items, appliedFilters.search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setFiltersExpanded((v) => !v)}
          className={listSellasistToolbarToggleBtn}
          aria-expanded={filtersExpanded}
        >
          {filtersExpanded ? "Ukryj filtry" : "Pokaż filtry"}
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${filtersExpanded ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        <button
          type="button"
          onClick={() => setColumnPickerOpen(true)}
          className={listSellasistToolbarSquareBtn}
          title="Kolumny tabeli"
          aria-label="Kolumny tabeli"
        >
          <TableProperties className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        </button>
      </div>

      <DocumentTemplatesListFiltersPanel
        expanded={filtersExpanded}
        draft={draftFilters}
        onChangeDraft={(patch) => setDraftFilters((d) => ({ ...d, ...patch }))}
        onApply={() => setAppliedFilters({ ...draftFilters })}
        onClear={() => {
          setDraftFilters(EMPTY_DOC_TEMPLATE_LIST_FILTERS);
          setAppliedFilters(EMPTY_DOC_TEMPLATE_LIST_FILTERS);
        }}
        families={families}
        kinds={kinds}
      />

      <div className={`${moduleTableCardClass} min-w-0`}>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <DocumentTemplatesListTable
            rows={filtered}
            columnOrder={effectiveColumnOrder}
            loading={loading}
            onOpenUsage={(row) => {
              void fetchTemplateUsage(DEFAULT_TENANT_ID, row.id).then((data) =>
                setUsageModal({ name: row.name, badges: data.badges, items: data.items }),
              );
            }}
            onDuplicate={(row) => {
              navigate(`${LIST_BASE}/new`, {
                state: { duplicateFromName: `${row.name} (kopia)`, kindCode: row.kind?.code },
              });
            }}
            onExport={(row) => {
              void exportTemplateZip(DEFAULT_TENANT_ID, row.id)
                .then((blob) => {
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `szablon-${row.id}.zip`;
                  a.click();
                  URL.revokeObjectURL(url);
                })
                .catch((err) => toast.error(extractApiErrorMessage(err, "Eksport nie powiódł się.")));
            }}
            onDelete={() => {
              toast.error("Usuwanie szablonów z listy nie jest jeszcze dostępne.");
            }}
            onPublish={(row) => {
              const versionId = row.draft_version?.id;
              if (!versionId) return;
              void publishDocumentTemplate(DEFAULT_TENANT_ID, row.id, versionId)
                .then(() => {
                  toast.success("Opublikowano szablon.");
                  void reload();
                })
                .catch((err) => toast.error(extractApiErrorMessage(err, "Publikacja nie powiodła się.")));
            }}
          />
        </div>
      </div>

      <FilterVisibilityModal
        open={columnPickerOpen}
        onClose={() => setColumnPickerOpen(false)}
        title="Kolumny tabeli"
        selectedOrder={columnOrder}
        onSave={persistColumnOrder}
        catalog={DOC_TEMPLATE_LIST_COLUMN_CATALOG}
        selectedColumnLabel="Widoczne kolumny"
        availableColumnLabel="Ukryte kolumny"
        defaultVisibleOrder={DOC_TEMPLATE_LIST_DEFAULT_COLUMN_ORDER}
      />

      {usageModal ? (
        <TemplateUsageModal
          templateName={usageModal.name}
          badges={usageModal.badges ?? []}
          items={usageModal.items}
          onClose={() => setUsageModal(null)}
        />
      ) : null}
    </div>
  );
}
