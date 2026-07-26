import { useEffect, useMemo, useState } from "react";
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
import { DEFAULT_TENANT_ID, LIST_BASE } from "./constants";
import { DocumentTemplateListCard } from "./DocumentTemplateListCard";
import {
  EMPTY_DOC_TEMPLATE_LIST_FILTERS,
  type DocumentTemplatesListFilters,
} from "./DocumentTemplatesListFiltersPanel";
import { DocumentTemplatesLightFilters } from "./DocumentTemplatesLightFilters";
import { TemplateUsageModal } from "./components/TemplateUsageModal";

export function DocumentTemplatesListPage() {
  const navigate = useNavigate();
  const [families, setFamilies] = useState<Awaited<ReturnType<typeof fetchDocumentTemplateCatalog>>>([]);
  const [items, setItems] = useState<DocumentTemplateListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<DocumentTemplatesListFilters>(EMPTY_DOC_TEMPLATE_LIST_FILTERS);
  const [usageModal, setUsageModal] = useState<{
    name: string;
    badges: DocumentTemplateListItemDto["usage_summary"];
    items: Awaited<ReturnType<typeof fetchTemplateUsage>>["items"];
  } | null>(null);

  const kinds = useMemo(() => {
    if (filters.familyCode) {
      return families.find((f) => f.code === filters.familyCode)?.kinds ?? [];
    }
    return families.flatMap((f) => f.kinds);
  }, [families, filters.familyCode]);

  const familyIconByCode = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const f of families) map[f.code] = f.icon;
    return map;
  }, [families]);

  async function reload(next = filters) {
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
    void reload(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on filter identity fields only
  }, [filters.familyCode, filters.kindCode, filters.variantCode, filters.status, filters.source]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        (row.kind?.name_pl ?? "").toLowerCase().includes(q) ||
        (row.binding_summary ?? "").toLowerCase().includes(q),
    );
  }, [items, filters.search]);

  const onFiltersChange = (next: DocumentTemplatesListFilters) => {
    setFilters(next);
  };

  return (
    <div className="min-w-0 space-y-5 bg-white px-1 pb-8 pt-2">
      <DocumentTemplatesLightFilters
        value={filters}
        onChange={onFiltersChange}
        families={families}
        kinds={kinds}
      />

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-500">Wczytywanie…</p>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
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
          <div className="flex flex-col gap-3">
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
