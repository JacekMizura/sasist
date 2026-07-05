import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";

import { createDocumentTemplateFromStarter, fetchStarterGallery, type StarterGalleryItem } from "../../../api/documentTemplatesApi";
import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { DEFAULT_TENANT_ID, LIST_BASE } from "./constants";

function fmtDt(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pl-PL");
  } catch {
    return iso;
  }
}

export function StarterGalleryPage() {
  const [items, setItems] = useState<StarterGalleryItem[]>([]);
  const [familyFilter, setFamilyFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStarterGallery()
      .then(setItems)
      .catch((err) => toast.error(extractApiErrorMessage(err, "Nie udało się wczytać starterów.")))
      .finally(() => setLoading(false));
  }, []);

  const families = useMemo(
    () => [...new Set(items.map((i) => i.family_name).filter(Boolean))] as string[],
    [items],
  );

  const filtered = useMemo(
    () => items.filter((i) => !familyFilter || i.family_name === familyFilter),
    [items, familyFilter],
  );

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
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to={LIST_BASE} className="text-sm text-slate-500 hover:text-slate-800">
            ← Szablony dokumentów
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">Biblioteka starterów</h1>
          <p className="text-sm text-slate-500">Gotowe punkty wyjścia dla każdego typu dokumentu.</p>
        </div>
        <select
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value={familyFilter}
          onChange={(e) => setFamilyFilter(e.target.value)}
        >
          <option value="">Wszystkie rodziny</option>
          {families.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      {loading ? <p className="text-slate-500">Wczytywanie…</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item) => (
          <article
            key={item.id}
            className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="h-28 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-slate-100 p-3">
              <pre className="line-clamp-5 overflow-hidden font-mono text-[9px] text-slate-500">{item.preview_html}</pre>
            </div>
            <div className="flex flex-1 flex-col p-4">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">{item.family_name}</div>
              <h2 className="mt-1 font-semibold text-slate-900">{item.name_pl}</h2>
              <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.description || item.kind_name}</p>
              <dl className="mt-3 grid grid-cols-2 gap-1 text-[10px] text-slate-500">
                <div>Typ: {item.kind_name ?? "—"}</div>
                <div>Data: {fmtDt(item.updated_at)}</div>
                <div>Autor: {item.is_system ? "System" : "Własny"}</div>
                <div>Wersja: {item.code}</div>
              </dl>
              <button
                type="button"
                className="mt-4 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white"
                onClick={() => void createFromStarter(item)}
              >
                Utwórz szablon
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
