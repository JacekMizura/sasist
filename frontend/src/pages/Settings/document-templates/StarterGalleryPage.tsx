import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  createDocumentTemplateFromStarter,
  fetchStarterGallery,
  type StarterGalleryItem,
} from "@/api/documentTemplatesApi";
import { extractApiErrorMessage } from "@/api/apiErrorMessage";
import { DEFAULT_TENANT_ID, LIST_BASE } from "./constants";
import { StarterThumbnailImage } from "./components/StarterThumbnailImage";

const CATEGORY_LABELS: Record<string, string> = {
  featured: "Polecane",
  recent: "Nowe",
  popular: "Najpopularniejsze",
};

const BADGE_STYLES: Record<string, string> = {
  featured: "bg-violet-100 text-violet-800",
  recent: "bg-sky-100 text-sky-800",
  popular: "bg-amber-100 text-amber-900",
  system: "bg-slate-100 text-slate-700",
};

function starterBadges(item: StarterGalleryItem): string[] {
  const out: string[] = [];
  if (item.is_system) out.push("system");
  for (const c of item.categories ?? []) {
    if (c in CATEGORY_LABELS) out.push(c);
  }
  return out;
}

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStarterGallery(DEFAULT_TENANT_ID)
      .then(setGallery)
      .catch((err) => toast.error(extractApiErrorMessage(err, "Nie udało się wczytać starterów.")))
      .finally(() => setLoading(false));
  }, []);

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
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Marketplace szablonów</h1>
        <p className="mt-1 text-sm text-slate-500">Gotowe układy dokumentów ERP — bez kodu Twig na kartach.</p>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-5">
        <input
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2"
          placeholder="Szukaj szablonu…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={familyFilter} onChange={(e) => setFamilyFilter(e.target.value)}>
          <option value="">Wszystkie rodziny</option>
          {(gallery?.families || []).map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
          <option value="">Wszystkie typy</option>
          {(gallery?.kinds || []).map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
        <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">Wszystkie kategorie</option>
          {Object.entries(CATEGORY_LABELS).map(([code, label]) => (
            <option key={code} value={code}>{label}</option>
          ))}
        </select>
        <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-5 lg:col-span-1" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
          <option value="">Wszystkie tagi</option>
          {(gallery?.tags || []).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {loading ? <p className="text-slate-500">Wczytywanie…</p> : null}

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((item) => (
          <article key={item.id} className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-400 hover:shadow-md">
            <Link to={`${LIST_BASE}/starters/${item.id}`} className="block">
              <div className="relative aspect-[210/297] overflow-hidden bg-gradient-to-b from-slate-50 to-white">
                <StarterThumbnailImage starterId={item.id} alt={item.name_pl} className="h-full w-full object-cover object-top transition group-hover:scale-[1.02]" />
                <div className="absolute left-3 top-3 flex flex-wrap gap-1">
                  {starterBadges(item).map((b) => (
                    <span key={b} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${BADGE_STYLES[b] ?? "bg-slate-100 text-slate-700"}`}>
                      {b === "system" ? "System" : CATEGORY_LABELS[b] ?? b}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
            <div className="flex flex-1 flex-col p-5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{item.kind_name}</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">{item.name_pl}</h2>
              <p className="mt-2 line-clamp-2 text-sm text-slate-500">{item.description || item.family_name}</p>
              <div className="mt-auto flex gap-2 pt-5">
                <Link
                  to={`${LIST_BASE}/starters/${item.id}`}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Szczegóły
                </Link>
                <button
                  type="button"
                  className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  onClick={() => void createFromStarter(item)}
                >
                  Użyj szablonu
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
