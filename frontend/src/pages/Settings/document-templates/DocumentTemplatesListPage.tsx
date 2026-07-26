import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Filter } from "lucide-react";
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
import { listSellasistToolbarToggleBtn } from "../../../components/listPage/listSellasistTokens";
import { DEFAULT_TENANT_ID, LIST_BASE } from "./constants";
import { DocumentTemplateListCard } from "./DocumentTemplateListCard";
import {
  countActiveDocumentTemplateFilters,
  documentTemplateFiltersToggleLabel,
  EMPTY_DOC_TEMPLATE_LIST_FILTERS,
  DocumentTemplatesListFiltersPanel,
  type DocumentTemplatesListFilters,
} from "./DocumentTemplatesListFiltersPanel";
import { TemplateUsageModal } from "./components/TemplateUsageModal";

export function DocumentTemplatesListPage() {
  const navigate = useNavigate();
  const [families, setFamilies] = useState<Awaited<ReturnType<typeof fetchDocumentTemplateCatalog>>>([]);
  const [items, setItems] = useState<DocumentTemplateListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [draft, setDraft] = useState<DocumentTemplatesListFilters>(EMPTY_DOC_TEMPLATE_LIST_FILTERS);
  const [applied, setApplied] = useState<DocumentTemplatesListFilters>(EMPTY_DOC_TEMPLATE_LIST_FILTERS);
  const [usageModal, setUsageModal] = useState<{
    name: string;
    badges: DocumentTemplateListItemDto["usage_summary"];
    items: Awaited<ReturnType<typeof fetchTemplateUsage>>["items"];
  } | null>(null);

  const kinds = useMemo(() => {
    if (draft.familyCode) {
      return families.find((f) => f.code === draft.familyCode)?.kinds ?? [];
    }
    return families.flatMap((f) => f.kinds);
  }, [families, draft.familyCode]);

  const familyIconByCode = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const f of families) map[f.code] = f.icon;
    return map;
  }, [families]);

  const activeFilterCount = countActiveDocumentTemplateFilters(applied);

  async function reload(next = applied) {
    setLoading(true);
    try {
      const [catalog, rows] = await Promise.all([
        fetchDocumentTemplateCatalog(),
        fetchDocumentTemplatesList(DEFAULT_TENANT_ID, {
          family_code: next.familyCode || undefined,
          kind_code: next.kindCode || undefined,
          variant_code: next.variantCode || undefined,
          status: next.status || undefined,
          source: next.source || undefined,
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
    void reload(applied);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on applied filter identity
  }, [applied.familyCode, applied.kindCode, applied.variantCode, applied.status, applied.source]);

  const filtered = useMemo(() => {
    const q = applied.search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        (row.kind?.name_pl ?? "").toLowerCase().includes(q) ||
        (row.binding_summary ?? "").toLowerCase().includes(q),
    );
  }, [items, applied.search]);

  const onApply = () => {
    setApplied({ ...draft });
  };

  const onClear = () => {
    setDraft(EMPTY_DOC_TEMPLATE_LIST_FILTERS);
    setApplied(EMPTY_DOC_TEMPLATE_LIST_FILTERS);
  };

  return (
    <div className="min-w-0 space-y-4 bg-white px-1 pb-8 pt-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setFiltersExpanded((v) => !v)}
          className={`${listSellasistToolbarToggleBtn} inline-flex items-center gap-2`}
          aria-expanded={filtersExpanded}
        >
          <Filter className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          {filtersExpanded ? "Ukryj filtry" : documentTemplateFiltersToggleLabel(activeFilterCount)}
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${filtersExpanded ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
      </div>

      <DocumentTemplatesListFiltersPanel
        expanded={filtersExpanded}
        draft={draft}
        onChangeDraft={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
        onApply={onApply}
        onClear={onClear}
        families={families}
        kinds={kinds}
      />

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-500">Wczytywanie…</p>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
          <p className="text-base font-semibold text-slate-900">Brak szablonów</p>
          <p className="mt-1.5 max-w-sm text-sm text-slate-500">
            Zmień filtry albo utwórz nowy szablon dokumentu.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            {filtered.length} {filtered.length === 1 ? "szablon" : "szablonów"}
          </p>
          <div className="flex flex-col gap-2">
            {filtered.map((row) => (
              <DocumentTemplateListCard
                key={row.id}
                row={row}
                familyIcon={row.family?.code ? familyIconByCode[row.family.code] : null}
                onOpenUsage={(r) => {
                  void fetchTemplateUsage(DEFAULT_TENANT_ID, r.id).then((data) =>
                    setUsageModal({ name: r.name, badges: data.badges, items: data.items }),
                  );
                }}
                onDuplicate={(r) => {
                  navigate(`${LIST_BASE}/new`, {
                    state: { duplicateFromName: `${r.name} (kopia)`, kindCode: r.kind?.code },
                  });
                }}
                onExport={(r) => {
                  void exportTemplateZip(DEFAULT_TENANT_ID, r.id)
                    .then((blob) => {
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `szablon-${r.id}.zip`;
                      a.click();
                      URL.revokeObjectURL(url);
                    })
                    .catch((err) => toast.error(extractApiErrorMessage(err, "Eksport nie powiódł się.")));
                }}
                onDelete={() => {
                  toast.error("Usuwanie szablonów z listy nie jest jeszcze dostępne.");
                }}
                onPublish={(r) => {
                  const versionId = r.draft_version?.id;
                  if (!versionId) return;
                  void publishDocumentTemplate(DEFAULT_TENANT_ID, r.id, versionId)
                    .then(() => {
                      toast.success("Opublikowano szablon.");
                      void reload();
                    })
                    .catch((err) => toast.error(extractApiErrorMessage(err, "Publikacja nie powiodła się.")));
                }}
              />
            ))}
          </div>
        </div>
      )}

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
