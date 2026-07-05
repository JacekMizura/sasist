import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";

import {
  createDocumentTemplateFromStarter,
  fetchStarterGallery,
  fetchStarterGalleryDetail,
  type StarterGalleryDetailDto,
  type StarterGalleryItem,
} from "../../../api/documentTemplatesApi";
import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { DEFAULT_TENANT_ID, LIST_BASE } from "./constants";
import { StarterThumbnailImage } from "./components/StarterThumbnailImage";

const CATEGORY_LABELS: Record<string, string> = {
  featured: "Polecane",
  recent: "Ostatnio dodane",
  popular: "Najczęściej używane",
};

function fmtDt(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pl-PL");
  } catch {
    return iso;
  }
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
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [preview, setPreview] = useState<StarterGalleryDetailDto | null>(null);

  useEffect(() => {
    fetchStarterGallery(DEFAULT_TENANT_ID)
      .then(setGallery)
      .catch((err) => toast.error(extractApiErrorMessage(err, "Nie udało się wczytać starterów.")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (previewId == null) {
      setPreview(null);
      return;
    }
    fetchStarterGalleryDetail(DEFAULT_TENANT_ID, previewId)
      .then(setPreview)
      .catch((err) => toast.error(extractApiErrorMessage(err, "Nie udało się wczytać podglądu.")));
  }, [previewId]);

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
        kind_code: item.kind_code ?? "",
        name: `${item.name_pl} — własny`,
        starter_code: item.code,
      });
      toast.success("Utworzono szablon ze startera.");
      window.location.href = `${LIST_BASE}/${created.id}`;
    } catch (err) {
      toast.error(extractApiErrorMessage(err, "Nie udało się utworzyć szablonu."));
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to={LIST_BASE} className="text-sm text-slate-500 hover:text-slate-800">
            ← Szablony dokumentów
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">Biblioteka dokumentów</h1>
          <p className="text-sm text-slate-500">
            Gotowe szablony do szybkiego startu · {gallery?.total ?? 0} starterów
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2 lg:grid-cols-5">
        <input
          type="search"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm lg:col-span-2"
          placeholder="Szukaj starterów…"
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
      </div>

      {loading ? <p className="text-slate-500">Wczytywanie…</p> : null}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((item) => (
          <article
            key={item.id}
            className="flex cursor-pointer flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-400"
            onClick={() => setPreviewId(item.id)}
          >
            <div className="aspect-[210/297] overflow-hidden border-b border-slate-100 bg-slate-50">
              <StarterThumbnailImage
                starterId={item.id}
                alt={item.name_pl}
                className="h-full w-full object-cover object-top"
              />
            </div>
            <div className="flex flex-1 flex-col p-4">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">{item.family_name}</div>
              <h2 className="mt-1 font-semibold text-slate-900">{item.name_pl}</h2>
              <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.description || item.kind_name}</p>
              <dl className="mt-3 grid grid-cols-2 gap-1 text-[10px] text-slate-500">
                <div>Typ: {item.kind_name ?? "—"}</div>
                <div>Data: {fmtDt(item.updated_at)}</div>
                <div>Autor: {item.author_label ?? (item.is_system ? "System" : "Własny")}</div>
                <div>Użycia: {item.usage_count ?? 0}</div>
              </dl>
              <button
                type="button"
                className="mt-4 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  void createFromStarter(item);
                }}
              >
                Utwórz szablon
              </button>
            </div>
          </article>
        ))}
      </div>

      {previewId != null && preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPreviewId(null)}>
          <div
            className="grid max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl lg:grid-cols-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="overflow-auto border-r border-slate-100 bg-slate-50 p-4">
              <iframe
                title="Podgląd dokumentu"
                className="mx-auto h-[70vh] w-full max-w-md rounded border border-slate-200 bg-white"
                srcDoc={preview.preview_html}
              />
            </div>
            <div className="overflow-auto p-6">
              <h2 className="text-lg font-semibold text-slate-900">{preview.name_pl}</h2>
              <p className="mt-2 text-sm text-slate-600">{preview.description}</p>
              <dl className="mt-4 space-y-2 text-sm text-slate-600">
                <div><dt className="font-medium text-slate-800">Rodzina</dt><dd>{preview.family_name}</dd></div>
                <div><dt className="font-medium text-slate-800">Typ</dt><dd>{preview.kind_name}</dd></div>
                <div><dt className="font-medium text-slate-800">Autor</dt><dd>{preview.author_label}</dd></div>
                {preview.base_template ? (
                  <div><dt className="font-medium text-slate-800">Szablon bazowy</dt><dd>{preview.base_template.template_name} v{preview.base_template.version_number}</dd></div>
                ) : null}
              </dl>
              {preview.partials_used?.length ? (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-slate-800">Partiale</h3>
                  <ul className="mt-1 list-inside list-disc text-sm text-slate-600">
                    {preview.partials_used.map((p) => (
                      <li key={p.partial_code}>{p.partial_code}: {p.template_name}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <button
                type="button"
                className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                onClick={() => {
                  const item = gallery?.items.find((i) => i.id === previewId);
                  if (item) void createFromStarter(item);
                }}
              >
                Utwórz na podstawie startera
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
