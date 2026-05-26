import axios from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { formatFastApiErrorDetail } from "../../api/wmsPickingProductsApi";
import {
  getReplacementSuggestions,
  replaceOrderLineProduct,
  type ReplacementSuggestionProduct,
  type ReplacementSuggestionsResponse,
} from "../../api/replacementApi";

const inp =
  "h-10 w-full rounded-lg bg-slate-100/80 px-10 text-sm text-slate-900 outline-none transition focus:bg-white focus-visible:ring-2 focus-visible:ring-slate-300";

function safeMissingQty(raw: number | null | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function mergeUniqueProducts(
  lists: Array<ReplacementSuggestionProduct[] | undefined>,
): ReplacementSuggestionProduct[] {
  const out: ReplacementSuggestionProduct[] = [];
  const seen = new Set<number>();
  for (const list of lists) {
    for (const p of list ?? []) {
      if (!p?.id || seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}

type Props = {
  open: boolean;
  onClose: () => void;
  orderId: number;
  tenantId: number;
  orderItemId: number;
  sourceProductId: number;
  sourceProductName: string;
  missingQuantity: number;
  warehouseId?: number | null;
  onReplaced: () => void;
};

/** Zamiana produktu: nowa linia TO_PICK na brakującą ilość; stara linia REPLACED z historią pobrań. */
export default function OrderReplaceProductModal({
  open,
  onClose,
  orderId,
  tenantId,
  orderItemId,
  sourceProductId,
  sourceProductName,
  missingQuantity,
  warehouseId,
  onReplaced,
}: Props) {
  const [q, setQ] = useState("");
  const [data, setData] = useState<ReplacementSuggestionsResponse>({
    recent: [],
    popular: [],
    similar: [],
    search_results: [],
    best_match: [],
    alternatives: [],
    others: [],
  });
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ReplacementSuggestionProduct | null>(null);
  const [remember, setRemember] = useState(false);
  const [filters, setFilters] = useState({
    same_manufacturer: false,
    same_size: false,
    same_category: false,
    available_only: true,
    show_similar: true,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showAllProducts, setShowAllProducts] = useState(false);

  const missingQtySafe = useMemo(() => safeMissingQty(missingQuantity), [missingQuantity]);
  const searchActive = q.trim().length > 0;

  const reset = useCallback(() => {
    setQ("");
    setData({ recent: [], popular: [], similar: [], search_results: [], best_match: [], alternatives: [], others: [] });
    setSelected(null);
    setRemember(false);
    setErr(null);
    setSearching(false);
    setShowAllProducts(false);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    reset();
  }, [open, orderItemId, sourceProductId, reset]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      setSearching(true);
      void getReplacementSuggestions(sourceProductId, {
        tenant_id: tenantId,
        warehouse_id: warehouseId ?? undefined,
        q: q.trim() || undefined,
        same_manufacturer: filters.same_manufacturer,
        same_size: filters.same_size,
        same_category: filters.same_category,
        available_only: filters.available_only,
        show_similar: filters.show_similar,
        show_all_products: showAllProducts || searchActive,
        debug: true,
        limit: 40,
      })
        .then(setData)
        .catch(() =>
          setData({ recent: [], popular: [], similar: [], search_results: [], best_match: [], alternatives: [], others: [] }),
        )
        .finally(() => setSearching(false));
    }, 300);
    return () => window.clearTimeout(id);
  }, [open, q, tenantId, sourceProductId, warehouseId, filters, showAllProducts, searchActive]);

  const save = async () => {
    if (!selected) {
      setErr("Wybierz produkt z listy.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await replaceOrderLineProduct(orderId, orderItemId, {
        new_product_id: selected.id,
        remember_substitution: remember,
      });
      onReplaced();
      onClose();
    } catch (e: unknown) {
      let msg = "Nie udało się zamienić produktu.";
      if (axios.isAxiosError(e)) {
        const st = e.response?.status;
        const data = e.response?.data;
        if (data != null) {
          msg = formatFastApiErrorDetail(data);
        } else if (st === 404) {
          msg = "Nie znaleziono zamówienia lub linii — odśwież widok i spróbuj ponownie.";
        }
      }
      setErr(msg);
    } finally {
      setSaving(false);
    }
  };

  const results = useMemo(() => {
    const fromSearch = data.search_results ?? [];
    if (fromSearch.length > 0) return fromSearch;
    if (!searchActive) {
      return mergeUniqueProducts([data.similar, data.recent, data.popular]);
    }
    return mergeUniqueProducts([
      data.search_results,
      data.best_match,
      data.alternatives,
      data.others,
      data.similar,
      data.recent,
      data.popular,
    ]);
  }, [data, searchActive]);
  const filterChips: Array<{ key: keyof typeof filters; label: string }> = [
    { key: "same_manufacturer", label: "Producent" },
    { key: "same_size", label: "Rozmiar" },
    { key: "same_category", label: "Kategoria" },
    { key: "available_only", label: "Dostępne" },
    { key: "show_similar", label: "Podobne" },
  ];

  const stockTone = (p: ReplacementSuggestionProduct): string => {
    if (p.available_qty <= 0) return "text-red-700";
    if (p.available_qty < Math.max(1, missingQtySafe)) return "text-amber-700";
    return "text-emerald-700";
  };

  const bestMatches = useMemo(() => data.best_match ?? [], [data.best_match]);
  const alternativeMatches = useMemo(() => data.alternatives ?? [], [data.alternatives]);
  const otherMatches = useMemo(() => data.others ?? [], [data.others]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="flex h-[78vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900">Zamień produkt</h2>
            <p className="mt-1 truncate text-sm text-slate-600">
              Brak: {Math.round(missingQtySafe)} szt. • Aktualny produkt: {sourceProductName}
            </p>
            <p className="mt-1 text-sm text-slate-500">Wybierz zamiennik z historii i podobnych produktów.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100">
            Zamknij
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 flex-1 flex-col px-5 pb-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                className={inp}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Szukaj po nazwie, SKU, EAN..."
                autoComplete="off"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && results[0]) {
                    e.preventDefault();
                    setSelected(results[0]);
                  }
                }}
              />
              <span className="pointer-events-none absolute right-3 top-3 text-[10px] font-medium text-slate-500">ENTER → wybierz</span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {filterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, [chip.key]: !prev[chip.key] }))}
                  className={`h-8 rounded-full px-3 text-xs font-medium transition ${
                    filters[chip.key] ? "bg-slate-900 text-white" : "bg-white text-slate-700 shadow-sm ring-1 ring-slate-200"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {searching ? <p className="mt-2 text-xs text-slate-500">Aktualizuję sugestie...</p> : null}

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
              <div className="divide-y divide-slate-100">
                {results.map((p) => {
                  const selectedRow = selected?.id === p.id;
                  const topBadges = (p.similarity_reasons ?? []).filter((r) =>
                    ["Ten sam producent", "Podobna nazwa"].includes(r),
                  ).slice(0, 2);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelected(p)}
                      className={`grid w-full grid-cols-[80px_minmax(0,1fr)_132px] items-center gap-4 px-2 py-3 text-left transition ${
                        selectedRow ? "bg-orange-50 ring-2 ring-inset ring-orange-400" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="h-16 w-16 overflow-hidden rounded-lg border border-slate-200 bg-white p-1">
                        {p.image_url ? <img src={p.image_url} alt={p.name} className="h-full w-full object-contain" /> : null}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{p.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {(p.sku ? `SKU ${p.sku}` : "SKU —")}
                          {p.ean ? ` • EAN ${p.ean}` : ""}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {topBadges.map((reason) => (
                            <span key={`${p.id}-${reason}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                              {reason}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <p className={`text-sm font-bold ${stockTone(p)}`}>{p.available_qty.toFixed(0)} szt.</p>
                        <span className="inline-flex h-8 items-center rounded-md bg-slate-100 px-3 text-xs font-medium text-slate-700">
                          Wybierz
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {!searching && results.length === 0 ? (
                <div className="pt-8 text-center text-sm text-slate-500">
                  {searchActive ? (
                    <p>
                      Brak wyników dla: <span className="font-semibold text-slate-800">{q.trim()}</span>
                    </p>
                  ) : (
                    <>
                      <p>Brak dobrych zamienników w tej kategorii.</p>
                      {!showAllProducts ? (
                        <button
                          type="button"
                          onClick={() => setShowAllProducts(true)}
                          className="mt-3 inline-flex h-8 items-center rounded-md bg-slate-900 px-3 text-xs font-medium text-white"
                        >
                          Pokaż wszystkie produkty
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <aside className="w-[320px] border-l border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">Najlepsze dopasowania</h3>
            <div className="mt-2.5 space-y-1.5">
              {bestMatches.slice(0, 4).map((p) => (
                <button
                  key={`best-${p.id}`}
                  type="button"
                  onClick={() => setSelected(p)}
                  className="w-full rounded-lg bg-slate-50 px-2.5 py-1.5 text-left hover:bg-slate-100"
                >
                  <p className="truncate text-xs font-semibold text-slate-900">{p.name}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {(p.similarity_reasons ?? []).slice(0, 1).join("") || p.badge || "Najczęściej wybierany"}
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold text-emerald-700">{p.available_qty.toFixed(0)} szt.</p>
                </button>
              ))}
              <p className="pt-1.5 text-[11px] font-semibold text-slate-700">Alternatywy</p>
              {alternativeMatches.slice(0, 3).map((p) => (
                <button key={`alt-${p.id}`} type="button" onClick={() => setSelected(p)} className="w-full rounded-lg bg-slate-50 px-2.5 py-1.5 text-left hover:bg-slate-100">
                  <p className="truncate text-xs text-slate-900">{p.name}</p>
                  <p className="text-[11px] text-slate-500">{(p.similarity_reasons ?? []).slice(0, 1).join("") || "Podobny produkt"}</p>
                </button>
              ))}
              <p className="pt-1.5 text-[11px] font-semibold text-slate-700">Pozostałe podobne</p>
              {otherMatches.slice(0, 2).map((p) => (
                <button key={`oth-${p.id}`} type="button" onClick={() => setSelected(p)} className="w-full rounded-lg bg-slate-50 px-2.5 py-1.5 text-left hover:bg-slate-100">
                  <p className="truncate text-xs text-slate-900">{p.name}</p>
                </button>
              ))}
              {bestMatches.length === 0 && alternativeMatches.length === 0 && otherMatches.length === 0 ? (
                <p className="text-xs text-slate-500">Brak rekomendacji dla tego produktu.</p>
              ) : null}
            </div>
          </aside>
        </div>

        <div className="flex h-16 items-center justify-between border-t border-slate-200 bg-white px-5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              {sourceProductName} <span className="text-slate-400">→</span> {selected?.name ?? "Wybierz zamiennik"}
            </p>
            <label className="mt-0.5 inline-flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
              />
              Zapamiętaj jako sugerowany zamiennik
            </label>
            {err ? <p className="mt-0.5 text-xs font-medium text-red-700">{err}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="h-9 rounded-md px-3 text-sm font-medium text-slate-700 hover:bg-slate-100">
              Anuluj
            </button>
            <button
              type="button"
              disabled={saving || !selected}
              onClick={() => void save()}
              className="h-9 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Zapisywanie..." : "Zamień produkt"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
