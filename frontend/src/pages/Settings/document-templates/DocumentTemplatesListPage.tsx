import { useEffect, useMemo, useState } from "react";
import { ChevronDown, FileText, Filter } from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import {
  fetchDocumentTemplateCatalog,
  fetchDocumentTemplatesList,
  fetchTemplateUsage,
  type DocumentTemplateListItemDto,
} from "../../../api/documentTemplatesApi";
import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { listSellasistToolbarToggleBtn } from "../../../components/listPage/listSellasistTokens";
import { StatusBadge } from "../../../design-system";
import TemplateListRow from "../../LabelSystem/templatesList/TemplateListRow";
import { DEFAULT_TENANT_ID, LIST_BASE } from "./constants";
import {
  countActiveDocumentTemplateFilters,
  documentTemplateFiltersToggleLabel,
  EMPTY_DOC_TEMPLATE_LIST_FILTERS,
  DocumentTemplatesListFiltersPanel,
  type DocumentTemplatesListFilters,
} from "./DocumentTemplatesListFiltersPanel";
import {
  documentTemplateKindSubtitle,
  documentTemplateListStatusPresentation,
  documentTemplateStatusTone,
  documentTemplateUsedAsLabels,
  fmtDocumentTemplateLastEdited,
} from "./documentTemplatesListPresentation";
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

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-4 md:px-6 min-[1600px]:px-8">
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
        onApply={() => setApplied({ ...draft })}
        onClear={() => {
          setDraft(EMPTY_DOC_TEMPLATE_LIST_FILTERS);
          setApplied(EMPTY_DOC_TEMPLATE_LIST_FILTERS);
        }}
        families={families}
        kinds={kinds}
      />

      {loading ? (
        <p className="py-10 text-slate-500">Ładowanie…</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-4">
          <p className="text-sm text-slate-500">
            {filtered.length} {filtered.length === 1 ? "szablon" : "szablonów"}
          </p>

          {filtered.length === 0 ? (
            <p className="py-10 text-slate-500">Brak szablonów.</p>
          ) : (
            <div className="flex w-full min-w-0 flex-col gap-3">
              {filtered.map((row) => {
                const status = documentTemplateListStatusPresentation(row);
                const usedAs = documentTemplateUsedAsLabels(row);
                const usage = row.usage_summary ?? [];
                const icon = row.family?.code ? familyIconByCode[row.family.code] : null;
                const editedAt = row.last_edited_at ?? row.updated_at;
                const usedAsText =
                  usedAs.length > 0
                    ? `${usedAs.slice(0, 3).join(", ")}${usedAs.length > 3 ? ` +${usedAs.length - 3}` : ""}`
                    : "—";
                const usedInText =
                  usage.length > 0
                    ? usage
                        .slice(0, 3)
                        .map((b) => `${b.label} (${b.count})`)
                        .join(", ") + (usage.length > 3 ? ` +${usage.length - 3}` : "")
                    : "—";

                return (
                  <TemplateListRow
                    key={row.id}
                    name={row.name}
                    metaLine={
                      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span>{documentTemplateKindSubtitle(row)}</span>
                        <StatusBadge
                          tone={documentTemplateStatusTone(status.primaryStatus)}
                          density="compact"
                        >
                          {status.primaryLabel}
                        </StatusBadge>
                        {status.showNewerDraft ? (
                          <StatusBadge tone="warning" density="compact">
                            Nowszy draft
                          </StatusBadge>
                        ) : null}
                        <span>
                          Używany jako: {usedAsText} · Używane w: {usedInText} ·{" "}
                          {fmtDocumentTemplateLastEdited(editedAt)}
                        </span>
                      </span>
                    }
                    thumbnail={
                      icon ? (
                        <span className="text-2xl" aria-hidden>
                          {icon}
                        </span>
                      ) : (
                        <FileText className="h-7 w-7 text-slate-400" aria-hidden />
                      )
                    }
                    onEdit={() => navigate(`${LIST_BASE}/${row.id}`)}
                    onDuplicate={() =>
                      navigate(`${LIST_BASE}/new`, {
                        state: {
                          duplicateFromName: `${row.name} (kopia)`,
                          kindCode: row.kind?.code,
                        },
                      })
                    }
                    onDelete={
                      row.can_delete
                        ? () => toast.error("Usuwanie szablonów z listy nie jest jeszcze dostępne.")
                        : undefined
                    }
                    showDelete={Boolean(row.can_delete)}
                    showPreview
                    onPreview={() => {
                      void fetchTemplateUsage(DEFAULT_TENANT_ID, row.id).then((data) =>
                        setUsageModal({ name: row.name, badges: data.badges, items: data.items }),
                      );
                    }}
                  />
                );
              })}
            </div>
          )}
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
