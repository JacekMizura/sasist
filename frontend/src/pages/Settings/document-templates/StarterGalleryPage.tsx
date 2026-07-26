import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  createDocumentTemplateFromStarter,
  fetchStarterGallery,
  type StarterGalleryItem,
} from "@/api/documentTemplatesApi";
import { extractApiErrorMessage } from "@/api/apiErrorMessage";
import { DEFAULT_TENANT_ID, LIST_BASE } from "./constants";
import { DocumentStarterCard } from "./DocumentStarterCard";

const CATEGORY_LABELS: Record<string, string> = {
  featured: "Polecane",
  recent: "Nowe",
  popular: "Najpopularniejsze",
};

const fieldClass =
  "w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-300/40";

const labelClass = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400";

/** Same breakpoints as Label Ready templates — dense at 1366→1920. */
const GRID_CLASS =
  "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 min-[1400px]:grid-cols-5 min-[1600px]:grid-cols-6";

export function StarterGalleryPage() {
  const [gallery, setGallery] = useState<{
    items: StarterGalleryItem[];
    total: number;
    families: string[];
    kinds: string[];
    tags: string[];
  } | null>(null);
  const [search, setSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStarterGallery(DEFAULT_TENANT_ID)
      .then(setGallery)
      .catch((err) => toast.error(extractApiErrorMessage(err, "Nie udało się wczytać starterów.")))
      .finally(() => setLoading(false));
  }, []);

  const advancedActive = Boolean(familyFilter || tagFilter || categoryFilter);

  useEffect(() => {
    if (advancedActive) setMoreOpen(true);
  }, [advancedActive]);

  const filtered = useMemo(() => {
    const items = gallery?.items ?? [];
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (familyFilter && i.family_name !== familyFilter) return false;
      if (kindFilter && i.kind_name !== kindFilter) return false;
      if (tagFilter && !(i.tags || []).includes(tagFilter)) return false;
      if (categoryFilter && !(i.categories || []).includes(categoryFilter)) return false;
      if (!q) return true;
      return (
        i.name_pl.toLowerCase().includes(q) ||
        (i.description || "").toLowerCase().includes(q) ||
        (i.kind_name || "").toLowerCase().includes(q)
      );
    });
  }, [gallery, search, familyFilter, kindFilter, tagFilter, categoryFilter]);

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
    <div className="min-w-0 space-y-5 bg-white px-1 pb-10 pt-2">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:max-w-3xl">
          <label className="block min-w-0">
            <span className={labelClass}>Szukaj</span>
            <input
              type="search"
              className={fieldClass}
              placeholder="Szukaj szablonu…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="block min-w-0">
            <span className={labelClass}>Typ dokumentu</span>
            <select className={fieldClass} value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
              <option value="">Wszystkie</option>
              {(gallery?.kinds || []).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-slate-600 transition hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2"
            aria-expanded={moreOpen}
          >
            Więcej filtrów
            <ChevronDown
              className={`h-4 w-4 transition-transform ${moreOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          {moreOpen ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block min-w-0">
                <span className={labelClass}>Kategoria</span>
                <select
                  className={fieldClass}
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="">Wszystkie</option>
                  {Object.entries(CATEGORY_LABELS).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block min-w-0">
                <span className={labelClass}>Rodzina</span>
                <select
                  className={fieldClass}
                  value={familyFilter}
                  onChange={(e) => setFamilyFilter(e.target.value)}
                >
                  <option value="">Wszystkie</option>
                  {(gallery?.families || []).map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block min-w-0">
                <span className={labelClass}>Tag</span>
                <select className={fieldClass} value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
                  <option value="">Wszystkie</option>
                  {(gallery?.tags || []).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
        </div>
      </div>

      {loading ? <p className="py-10 text-center text-sm text-slate-500">Wczytywanie…</p> : null}

      {!loading && filtered.length === 0 ? (
        <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 px-6 py-12 text-center shadow-sm">
          <p className="text-base font-semibold text-slate-900">Nie znaleziono szablonów</p>
          <p className="mt-1.5 max-w-sm text-sm text-slate-500">Zmień filtry albo utwórz własny szablon.</p>
        </div>
      ) : null}

      {!loading && filtered.length > 0 ? (
        <div className={GRID_CLASS}>
          {filtered.map((item) => (
            <DocumentStarterCard key={item.id} item={item} onUse={(i) => void createFromStarter(i)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
