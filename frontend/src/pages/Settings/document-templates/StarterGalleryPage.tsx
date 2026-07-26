import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Filter } from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import {
  createDocumentTemplateFromStarter,
  fetchStarterGallery,
  type StarterGalleryItem,
} from "@/api/documentTemplatesApi";
import { extractApiErrorMessage } from "@/api/apiErrorMessage";
import {
  FilterField,
  FilterGrid,
  FilterPanelBodyWithActions,
  ListFilterEmbeddedShell,
  filterInputClass,
  filterSelectClass,
} from "@/components/filters";
import { listSellasistFilterGridClass4, listSellasistToolbarToggleBtn } from "@/components/listPage/listSellasistTokens";
import ReadyTemplateCard from "@/pages/LabelSystem/readyTemplates/ReadyTemplateCard";
import { READY_TEMPLATES_GRID_CLASS } from "@/pages/LabelSystem/readyTemplates/readyTemplatesLayout";
import { DEFAULT_TENANT_ID, LIST_BASE } from "./constants";
import { StarterThumbnailImage } from "./components/StarterThumbnailImage";

const CATEGORY_LABELS: Record<string, string> = {
  featured: "Polecane",
  recent: "Nowe",
  popular: "Najpopularniejsze",
};

type StarterFilters = {
  search: string;
  kind: string;
  category: string;
  family: string;
  tag: string;
};

const EMPTY: StarterFilters = { search: "", kind: "", category: "", family: "", tag: "" };

export function StarterGalleryPage() {
  const navigate = useNavigate();
  const [gallery, setGallery] = useState<{
    items: StarterGalleryItem[];
    total: number;
    families: string[];
    kinds: string[];
    tags: string[];
  } | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [draft, setDraft] = useState<StarterFilters>(EMPTY);
  const [applied, setApplied] = useState<StarterFilters>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStarterGallery(DEFAULT_TENANT_ID)
      .then(setGallery)
      .catch((err) => toast.error(extractApiErrorMessage(err, "Nie udało się wczytać starterów.")))
      .finally(() => setLoading(false));
  }, []);

  const activeCount = [applied.search, applied.kind, applied.category, applied.family, applied.tag].filter(
    Boolean,
  ).length;

  const filtered = useMemo(() => {
    const items = gallery?.items ?? [];
    const q = applied.search.trim().toLowerCase();
    return items.filter((i) => {
      if (applied.family && i.family_name !== applied.family) return false;
      if (applied.kind && i.kind_name !== applied.kind) return false;
      if (applied.tag && !(i.tags || []).includes(applied.tag)) return false;
      if (applied.category && !(i.categories || []).includes(applied.category)) return false;
      if (!q) return true;
      return (
        i.name_pl.toLowerCase().includes(q) ||
        (i.description || "").toLowerCase().includes(q) ||
        (i.kind_name || "").toLowerCase().includes(q)
      );
    });
  }, [gallery, applied]);

  async function createFromStarter(item: StarterGalleryItem) {
    try {
      const created = await createDocumentTemplateFromStarter(DEFAULT_TENANT_ID, {
        kind_code: item.kind_code,
        name: item.name_pl,
        starter_code: item.code,
      });
      toast.success("Utworzono szablon.");
      window.location.href = `${LIST_BASE}/${created.id}`;
    } catch (err) {
      toast.error(extractApiErrorMessage(err, "Nie udało się utworzyć szablonu."));
    }
  }

  return (
    <div className="min-w-0 space-y-6 bg-white px-1 pb-10 pt-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setFiltersExpanded((v) => !v)}
          className={`${listSellasistToolbarToggleBtn} inline-flex items-center gap-2`}
          aria-expanded={filtersExpanded}
        >
          <Filter className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          {filtersExpanded ? "Ukryj filtry" : activeCount > 0 ? `Filtry (${activeCount})` : "Pokaż filtry"}
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${filtersExpanded ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
      </div>

      <ListFilterEmbeddedShell expanded={filtersExpanded}>
        <FilterPanelBodyWithActions
          onClear={() => {
            setDraft(EMPTY);
            setApplied(EMPTY);
          }}
          onApply={() => setApplied({ ...draft })}
          clearLabel="Wyczyść filtry"
          applyLabel="Filtruj"
          footerMobileOnly={false}
        >
          <FilterGrid columnsClassName={listSellasistFilterGridClass4}>
            <FilterField label="Szukaj">
              <input
                type="text"
                className={filterInputClass}
                placeholder="Szukaj szablonu…"
                value={draft.search}
                onChange={(e) => setDraft((p) => ({ ...p, search: e.target.value }))}
              />
            </FilterField>
            <FilterField label="Typ dokumentu">
              <select
                className={filterSelectClass}
                value={draft.kind}
                onChange={(e) => setDraft((p) => ({ ...p, kind: e.target.value }))}
              >
                <option value="">Wszystkie</option>
                {(gallery?.kinds || []).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Kategoria">
              <select
                className={filterSelectClass}
                value={draft.category}
                onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))}
              >
                <option value="">Wszystkie</option>
                {Object.entries(CATEGORY_LABELS).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Rodzina">
              <select
                className={filterSelectClass}
                value={draft.family}
                onChange={(e) => setDraft((p) => ({ ...p, family: e.target.value }))}
              >
                <option value="">Wszystkie</option>
                {(gallery?.families || []).map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Tag">
              <select
                className={filterSelectClass}
                value={draft.tag}
                onChange={(e) => setDraft((p) => ({ ...p, tag: e.target.value }))}
              >
                <option value="">Wszystkie</option>
                {(gallery?.tags || []).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </FilterField>
          </FilterGrid>
        </FilterPanelBodyWithActions>
      </ListFilterEmbeddedShell>

      {loading ? <p className="text-sm text-slate-500">Ładowanie…</p> : null}

      {!loading && filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">Nie znaleziono szablonów.</p>
      ) : null}

      {!loading && filtered.length > 0 ? (
        <div className={READY_TEMPLATES_GRID_CLASS}>
          {filtered.map((item) => {
            const tags = [
              ...(item.categories ?? []).map((c) => CATEGORY_LABELS[c] ?? c),
              ...(item.tags ?? []).slice(0, 2),
            ]
              .filter(Boolean)
              .join(" · ");
            const metaLine = [item.kind_name, tags].filter(Boolean).join(" • ");
            return (
              <ReadyTemplateCard
                key={item.id}
                name={item.name_pl}
                description={item.description || item.family_name || "Gotowy układ dokumentu"}
                metaLine={metaLine}
                thumbnail={
                  <StarterThumbnailImage
                    starterId={item.id}
                    alt={item.name_pl}
                    className="h-full w-full object-cover object-top"
                  />
                }
                isSystem={Boolean(item.is_system)}
                primaryActionLabel="Szczegóły"
                secondaryActionLabel="Użyj szablonu"
                onEdit={() => navigate(`${LIST_BASE}/starters/${item.id}`)}
                onUse={() => void createFromStarter(item)}
                onDuplicate={() => void createFromStarter(item)}
                onExport={() => navigate(`${LIST_BASE}/starters/${item.id}`)}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
