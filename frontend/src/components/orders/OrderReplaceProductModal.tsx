import axios from "axios";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, Search } from "lucide-react";
import { formatFastApiErrorDetail } from "../../api/wmsPickingProductsApi";
import {
  getReplacementSuggestions,
  replaceOrderLineProduct,
  type ReplacementSuggestionProduct,
  type ReplacementSuggestionsResponse,
} from "../../api/replacementApi";
import { PrimaryButton } from "../../design-system/PrimaryButton";
import { AppOverlayPortal } from "../../components/overlay";

const searchInputClass =
  "h-[34px] w-full rounded-lg border border-slate-200 bg-white pl-9 pr-24 text-[13px] font-medium text-slate-900 placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-slate-300 focus-visible:ring-2 focus-visible:ring-slate-100";

const filterChipBase =
  "inline-flex h-[34px] items-center rounded-lg border px-2.5 text-[13px] font-medium transition-colors";

const filterChipActive = `${filterChipBase} border-slate-900 bg-slate-900 text-white`;
const filterChipIdle = `${filterChipBase} border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50`;

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

function reasonBadgeClass(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes("producent")) return "border-violet-200 bg-violet-50 text-violet-800";
  if (r.includes("nazwa") || r.includes("podobn")) return "border-sky-200 bg-sky-50 text-sky-800";
  if (r.includes("historia") || r.includes("zamów")) return "border-amber-200 bg-amber-50 text-amber-900";
  if (r.includes("najczęściej") || r.includes("popular")) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function ProductImage({ url, name }: { url?: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center text-slate-300" aria-hidden>
        <ImageIcon className="h-5 w-5" strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={name}
      className="h-12 w-12 shrink-0 object-contain"
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}

type MatchTile = {
  product: ReplacementSuggestionProduct;
  badge: "Najlepszy" | "Alternatywa" | "Historia";
};

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
  const listRef = useRef<HTMLDivElement>(null);

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
    return "text-emerald-800";
  };

  const bestMatches = useMemo(() => data.best_match ?? [], [data.best_match]);
  const alternativeMatches = useMemo(() => data.alternatives ?? [], [data.alternatives]);
  const otherMatches = useMemo(() => data.others ?? [], [data.others]);

  const matchTiles = useMemo((): MatchTile[] => {
    const tiles: MatchTile[] = [];
    const seen = new Set<number>();
    const push = (list: ReplacementSuggestionProduct[], badge: MatchTile["badge"], limit: number) => {
      for (const p of list) {
        if (tiles.length >= 8) return;
        if (!p?.id || seen.has(p.id)) continue;
        seen.add(p.id);
        tiles.push({ product: p, badge });
        if (tiles.filter((t) => t.badge === badge).length >= limit) break;
      }
    };
    push(bestMatches, "Najlepszy", 4);
    push(alternativeMatches, "Alternatywa", 3);
    push(data.recent ?? [], "Historia", 2);
    if (tiles.length < 6) push(otherMatches, "Alternatywa", 2);
    return tiles;
  }, [bestMatches, alternativeMatches, otherMatches, data.recent]);

  const selectAndScroll = (p: ReplacementSuggestionProduct) => {
    setSelected(p);
    window.requestAnimationFrame(() => {
      const el = listRef.current?.querySelector(`[data-replace-product-id="${p.id}"]`);
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
  };

  const tileBadgeClass = (badge: MatchTile["badge"]) => {
    if (badge === "Najlepszy") return "border-emerald-200 bg-emerald-50 text-emerald-800";
    if (badge === "Historia") return "border-amber-200 bg-amber-50 text-amber-900";
    return "border-sky-200 bg-sky-50 text-sky-800";
  };

  if (!open) return null;

  return (
    <AppOverlayPortal>
      <div
        className="fixed inset-0 z-[280] flex items-center justify-center bg-black/40 p-4"
        role="dialog"
        aria-modal="true"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <div
          className="flex h-[78vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 pb-3 pt-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-slate-900">Zamień produkt</h2>
              <p className="mt-1 truncate text-sm text-slate-600">
                Brak: {Math.round(missingQtySafe)} szt. • Aktualny produkt: {sourceProductName}
              </p>
              <p className="mt-0.5 text-[13px] text-slate-500">Wybierz zamiennik z historii i podobnych produktów.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-sm text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
            >
              Zamknij
            </button>
          </div>

          <div className="flex min-h-0 flex-1">
            <div className="flex min-h-0 flex-1 flex-col px-5 pb-2 pt-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" strokeWidth={2} />
                <input
                  className={searchInputClass}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Szukaj po nazwie, SKU lub EAN..."
                  autoComplete="off"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && results[0]) {
                      e.preventDefault();
                      setSelected(results[0]);
                    }
                  }}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-slate-400">
                  ENTER → wybierz
                </span>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {filterChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setFilters((prev) => ({ ...prev, [chip.key]: !prev[chip.key] }))}
                    className={filters[chip.key] ? filterChipActive : filterChipIdle}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {searching ? <p className="mt-2 text-xs text-slate-500">Aktualizuję sugestie…</p> : null}

              <div ref={listRef} className="mt-2 min-h-0 flex-1 overflow-y-auto">
                <div className="space-y-0.5">
                  {results.map((p) => {
                    const selectedRow = selected?.id === p.id;
                    const badges = [
                      ...(p.similarity_reasons ?? []),
                      ...(p.badge && !(p.similarity_reasons ?? []).includes(p.badge) ? [p.badge] : []),
                    ].slice(0, 3);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        data-replace-product-id={p.id}
                        onClick={() => setSelected(p)}
                        className={`grid w-full grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${
                          selectedRow
                            ? "border border-orange-300 bg-orange-50/80"
                            : "border border-transparent hover:border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <ProductImage url={p.image_url} name={p.name} />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold leading-snug text-slate-900">{p.name}</p>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500">
                            {p.sku ? `SKU ${p.sku}` : "SKU —"}
                            {p.ean ? ` • EAN ${p.ean}` : ""}
                          </p>
                          {badges.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {badges.map((reason) => (
                                <span
                                  key={`${p.id}-${reason}`}
                                  className={`inline-flex h-[22px] items-center rounded-md border px-1.5 text-[10px] font-medium leading-none ${reasonBadgeClass(reason)}`}
                                >
                                  {reason}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5 pl-2">
                          <p className={`text-right leading-none ${stockTone(p)}`}>
                            <span className="block text-base font-bold tabular-nums">{p.available_qty.toFixed(0)}</span>
                            <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide opacity-80">
                              szt.
                            </span>
                          </p>
                          <span className="inline-flex h-[34px] items-center rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700">
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
                          <PrimaryButton type="button" density="compact" onClick={() => setShowAllProducts(true)} className="mt-3">
                            Pokaż wszystkie produkty
                          </PrimaryButton>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            <aside className="flex w-[280px] shrink-0 flex-col border-l border-slate-100 bg-slate-50/40 px-3 py-3">
              <h3 className="px-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Najlepsze dopasowania
              </h3>
              <div className="mt-2 grid grid-cols-1 gap-1.5 overflow-y-auto">
                {matchTiles.map(({ product: p, badge }) => (
                  <button
                    key={`tile-${badge}-${p.id}`}
                    type="button"
                    onClick={() => selectAndScroll(p)}
                    className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-2 text-left transition-colors hover:border-slate-300 hover:bg-white"
                  >
                    <p className="truncate text-[12px] font-semibold leading-snug text-slate-900">{p.name}</p>
                    <span
                      className={`mt-1.5 inline-flex h-[22px] items-center rounded-md border px-1.5 text-[10px] font-medium leading-none ${tileBadgeClass(badge)}`}
                    >
                      {badge}
                    </span>
                  </button>
                ))}
                {matchTiles.length === 0 ? (
                  <p className="px-0.5 text-xs text-slate-500">Brak rekomendacji dla tego produktu.</p>
                ) : null}
              </div>
            </aside>
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-slate-100 px-5 py-2.5">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-slate-500">Zamieniany produkt:</p>
              <p className="truncate text-[13px] font-semibold text-slate-900">{sourceProductName}</p>
              <label className="mt-1 inline-flex items-center gap-2 text-[12px] text-slate-600">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
                />
                Zapamiętaj jako sugerowany zamiennik
              </label>
              {err ? <p className="mt-0.5 text-xs font-medium text-red-700">{err}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-[34px] items-center rounded-lg px-3 text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Anuluj
              </button>
              <PrimaryButton type="button" density="compact" disabled={saving || !selected} onClick={() => void save()}>
                {saving ? "Zapisywanie…" : "Zamień produkt"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      </div>
    </AppOverlayPortal>
  );
}
