import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  fetchPurchasingForecast,
  type ProductForecastDetail,
  type PurchasingForecastPayload,
} from "../../api/purchasingForecastApi";
import { listSuppliers, type SupplierRead } from "../../api/inboundSuppliersApi";
import { searchProductsCatalog, type ProductSearchHit } from "../../api/productsSearchApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { usePurchasingModuleContextOptional } from "../../modules/purchasing/context/PurchasingModuleContext";
import { usePurchasingTenant } from "../../modules/purchasing/hooks/usePurchasingTenant";
import {
  PurchasingContentArea,
  PurchasingFilterBar,
  PurchasingFilterField,
  PurchasingKpiCard,
  PurchasingKpiGrid,
  PurchasingPageHeader,
  PurchasingPageShell,
  PurchasingProductCell,
  PurchasingProductInspectorDrawer,
  PurchasingTableHeader,
  PurchasingTableSection,
  purchasingBtnSecondary,
  purchasingInputClass,
  purchasingSelectClass,
  purchasingTableTdClass,
} from "../../modules/purchasing/ui";
import PurchasingForecastCharts from "./PurchasingForecastCharts";
import type { PurchasingForecastBarRow } from "./PurchasingForecastBarTooltip";

function fmtShortDate(iso: string): string {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" });
  } catch {
    return iso;
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function PurchasingForecastPage() {
  const { selectedWarehouseId } = useWarehouse();
  const moduleCtx = usePurchasingModuleContextOptional();
  const { tenantId, refreshSignal } = usePurchasingTenant();
  const [searchParams, setSearchParams] = useSearchParams();
  const [suppliers, setSuppliers] = useState<SupplierRead[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [rangeDays, setRangeDays] = useState<30 | 90 | 365>(90);
  const [data, setData] = useState<PurchasingForecastPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const debouncedProductSearch = useDebounced(productSearch, 350);
  const [searchHits, setSearchHits] = useState<ProductSearchHit[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [metaCache, setMetaCache] = useState<Map<number, Partial<ProductForecastDetail["product"]> & { stock?: number; avg_daily?: number }>>(
    new Map(),
  );
  const prefetchingRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const pid = searchParams.get("product_id");
    if (pid != null && pid !== "") {
      const n = Number(pid);
      if (Number.isFinite(n) && n >= 1) {
        setSelectedProductId(n);
        setDrawerOpen(true);
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (!tenantId || debouncedProductSearch.trim().length < 2) {
      setSearchHits([]);
      return;
    }
    void searchProductsCatalog(tenantId, debouncedProductSearch, 20).then(setSearchHits).catch(() => setSearchHits([]));
  }, [tenantId, debouncedProductSearch]);

  useEffect(() => {
    if (!tenantId) return;
    void listSuppliers(tenantId, { status: "all" })
      .then(setSuppliers)
      .catch(() => setSuppliers([]));
  }, [tenantId]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const payload = await fetchPurchasingForecast({
        tenant_id: tenantId,
        warehouse_id: selectedWarehouseId,
        supplier_id: supplierId ? Number(supplierId) : null,
        product_id: selectedProductId,
        range_days: rangeDays,
      });
      setData(payload);
      if (payload.product_detail?.product.id) {
        const pid = payload.product_detail.product.id;
        setMetaCache((prev) => {
          const next = new Map(prev);
          next.set(pid, {
            ...payload.product_detail!.product,
            stock: payload.product_detail!.stock,
            avg_daily: payload.product_detail!.avg_daily,
          });
          return next;
        });
      }
    } catch {
      setErr("Nie udało się wczytać prognozy zakupowej.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, selectedWarehouseId, supplierId, selectedProductId, rangeDays]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  const prefetchProductMeta = useCallback(
    async (productId: number) => {
      if (prefetchingRef.current.has(productId)) return;
      prefetchingRef.current.add(productId);
      try {
        const payload = await fetchPurchasingForecast({
          tenant_id: tenantId,
          warehouse_id: selectedWarehouseId,
          product_id: productId,
          range_days: 30,
        });
        if (payload.product_detail) {
          const d = payload.product_detail;
          setMetaCache((prev) => {
            if (prev.has(productId)) return prev;
            const next = new Map(prev);
            next.set(productId, {
              ...d.product,
              stock: d.stock,
              avg_daily: d.avg_daily,
            });
            return next;
          });
        }
      } catch {
        /* ignore prefetch errors */
      } finally {
        prefetchingRef.current.delete(productId);
      }
    },
    [tenantId, selectedWarehouseId],
  );

  useEffect(() => {
    if (!data?.charts.top_fast_moving?.length) return;
    for (const r of data.charts.top_fast_moving) {
      void prefetchProductMeta(r.product_id);
    }
  }, [data?.charts.top_fast_moving, prefetchProductMeta]);

  const selectProduct = (id: number | null) => {
    setSelectedProductId(id);
    setDrawerOpen(id != null);
    if (id != null) void prefetchProductMeta(id);
    const next = new URLSearchParams(searchParams);
    if (id == null) next.delete("product_id");
    else next.set("product_id", String(id));
    next.set("tenant_id", String(tenantId));
    setSearchParams(next, { replace: true });
  };

  const barData = useMemo((): PurchasingForecastBarRow[] => {
    const riskById = new Map((data?.charts.top_risk_products ?? []).map((r) => [r.product_id, r]));
    return (data?.charts.top_fast_moving ?? []).map((r) => {
      const risk = riskById.get(r.product_id);
      const cached = metaCache.get(r.product_id);
      return {
        name: truncate(r.name, 22),
        fullName: r.name,
        qty: r.qty_30d,
        product_id: r.product_id,
        stock: cached?.stock ?? risk?.stock ?? null,
        avg_daily: cached?.avg_daily ?? risk?.avg_daily_sales ?? r.qty_30d / 30,
        sku: cached?.sku ?? null,
        image_url: cached?.image_url ?? null,
        incoming_qty: null,
      };
    });
  }, [data, metaCache]);

  const s = data?.summary;

  return (
    <PurchasingContentArea>
      <PurchasingPageShell
        header={
          <PurchasingPageHeader
            title="Prognoza / analiza zakupowa"
            subtitle="Trend sprzedaży, ryzyka zapasowe i inspektor produktu na podstawie historii obrotu."
          />
        }
        status={
          <>
            {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div> : null}
            {loading && !data ? <p className="text-sm text-slate-500">Ładowanie…</p> : null}
          </>
        }
        filters={
          <PurchasingFilterBar
            actions={
              <button type="button" onClick={() => void load()} disabled={loading} className={purchasingBtnSecondary}>
                Odśwież
              </button>
            }
          >
            {!moduleCtx ? (
              <PurchasingFilterField label="Podmiot">
                <select className={purchasingSelectClass} value={tenantId} disabled>
                  <option value={tenantId}>#{tenantId}</option>
                </select>
              </PurchasingFilterField>
            ) : null}
            <PurchasingFilterField label="Dostawca (opcjonalnie)" className="min-w-[160px]">
              <select className={purchasingSelectClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Wszyscy</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                  </option>
                ))}
              </select>
            </PurchasingFilterField>
            <PurchasingFilterField label="Zakres wykresu">
              <select
                className={purchasingSelectClass}
                value={rangeDays}
                onChange={(e) => setRangeDays(Number(e.target.value) as 30 | 90 | 365)}
              >
                <option value={30}>30 dni</option>
                <option value={90}>90 dni</option>
                <option value={365}>365 dni</option>
              </select>
            </PurchasingFilterField>
          </PurchasingFilterBar>
        }
        kpis={
          s ? (
            <PurchasingKpiGrid columns={4}>
              <PurchasingKpiCard title="Analizowane produkty" value={s.products_analyzed} tone="blue" />
              <PurchasingKpiCard
                title="Średni zapas (dni)"
                value={s.avg_stock_cover_days != null ? s.avg_stock_cover_days : "—"}
                subtitle="Średnia z pokryć przy sprzedaży > 0"
                tone="default"
              />
              <PurchasingKpiCard
                title="Produkty ryzyka"
                value={s.risk_products_count}
                subtitle="Pokrycie < 7 dni"
                tone="amber"
              />
              <PurchasingKpiCard
                title="Martwy stock"
                value={s.dead_stock_count}
                subtitle="Stan > 0, brak sprzedaży 60+ dni"
                tone="purple"
              />
            </PurchasingKpiGrid>
          ) : null
        }
        analysis={
          s && data ? (
            <PurchasingForecastCharts
              data={data}
              rangeDays={rangeDays}
              barData={barData}
              fmtShortDate={fmtShortDate}
              onSelectProduct={selectProduct}
              onHoverProduct={(id) => void prefetchProductMeta(id)}
            />
          ) : null
        }
        table={
          s ? (
            <>
              <PurchasingTableSection title="Produkty ryzyka" indicatorClass="bg-amber-500">
                <table className="w-full min-w-[520px]">
                  <PurchasingTableHeader
                    headers={["Produkt", "Stan", "Śr./dzień", "Dni zapasu", "Akcja"]}
                    align={["left", "right", "right", "right", "right"]}
                  />
                  <tbody>
                    {(data?.charts.top_risk_products ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                          Brak pozycji spełniających kryterium.
                        </td>
                      </tr>
                    ) : (
                      data!.charts.top_risk_products.map((r) => {
                        const cached = metaCache.get(r.product_id);
                        return (
                        <tr key={r.product_id} className="border-b border-slate-100 hover:bg-amber-50/40">
                          <td className={purchasingTableTdClass}>
                            <PurchasingProductCell
                              name={r.name}
                              sku={cached?.sku}
                              imageUrl={cached?.image_url}
                              stock={r.stock}
                            />
                          </td>
                          <td className={`${purchasingTableTdClass} text-right tabular-nums`}>{r.stock}</td>
                          <td className={`${purchasingTableTdClass} text-right tabular-nums`}>{r.avg_daily_sales.toFixed(4)}</td>
                          <td className={`${purchasingTableTdClass} text-right tabular-nums`}>{r.cover_days ?? "—"}</td>
                          <td className={`${purchasingTableTdClass} text-right`}>
                            <button
                              type="button"
                              className="text-sm font-medium text-sky-700 hover:underline"
                              onClick={() => selectProduct(r.product_id)}
                            >
                              Inspektor
                            </button>
                          </td>
                        </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </PurchasingTableSection>

              <PurchasingTableSection title="Martwy stock" indicatorClass="bg-violet-500">
                <table className="w-full min-w-[560px]">
                  <PurchasingTableHeader
                    headers={["Produkt", "Stan", "Dni bez sprzedaży", "Wartość", "Akcja"]}
                    align={["left", "right", "right", "right", "right"]}
                  />
                  <tbody>
                    {(data?.charts.dead_stock ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                          Brak pozycji.
                        </td>
                      </tr>
                    ) : (
                      data!.charts.dead_stock.map((r) => {
                        const cached = metaCache.get(r.product_id);
                        return (
                        <tr key={r.product_id} className="border-b border-slate-100 hover:bg-violet-50/40">
                          <td className={purchasingTableTdClass}>
                            <PurchasingProductCell
                              name={r.name}
                              sku={cached?.sku}
                              imageUrl={cached?.image_url}
                              stock={r.stock}
                            />
                          </td>
                          <td className={`${purchasingTableTdClass} text-right tabular-nums`}>{r.stock}</td>
                          <td className={`${purchasingTableTdClass} text-right tabular-nums`}>{r.no_sales_days}</td>
                          <td className={`${purchasingTableTdClass} text-right tabular-nums`}>
                            {r.stock_value.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className={`${purchasingTableTdClass} text-right`}>
                            <button
                              type="button"
                              className="text-sm font-medium text-sky-700 hover:underline"
                              onClick={() => selectProduct(r.product_id)}
                            >
                              Inspektor
                            </button>
                          </td>
                        </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </PurchasingTableSection>

              <PurchasingTableSection title="Inspektor produktu" indicatorClass="bg-teal-500">
                <div className="px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <div className="relative flex-1">
                      <input
                        className={purchasingInputClass}
                        placeholder="Szukaj produktu (min. 2 znaki)…"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                      />
                      {searchHits.length > 0 ? (
                        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
                          {searchHits.map((h) => (
                            <li key={h.id}>
                              <button
                                type="button"
                                className="flex w-full flex-col px-3 py-2 text-left hover:bg-slate-50"
                                onClick={() => {
                                  selectProduct(h.id);
                                  setProductSearch("");
                                  setSearchHits([]);
                                }}
                              >
                                <span className="font-medium text-slate-900">{h.name ?? `#${h.id}`}</span>
                                <span className="text-xs text-slate-500">{[h.symbol, h.ean].filter(Boolean).join(" · ")}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    {selectedProductId != null ? (
                      <button
                        type="button"
                        className={purchasingBtnSecondary}
                        onClick={() => selectProduct(null)}
                      >
                        Wyczyść wybór
                      </button>
                    ) : null}
                  </div>

                  {selectedProductId != null ? (
                    <p className="mt-4 text-sm text-slate-600">
                      Wybrany produkt — szczegóły w panelu po prawej stronie ekranu.
                    </p>
                  ) : (
                    <p className="mt-4 text-sm text-slate-500">
                      Wybierz produkt z wykresu, tabel lub wyszukiwarki, aby otworzyć inspektor.
                    </p>
                  )}
                </div>
              </PurchasingTableSection>
            </>
          ) : null
        }
      />

      <PurchasingProductInspectorDrawer
        open={drawerOpen && selectedProductId != null}
        loading={loading && selectedProductId != null && !data?.product_detail}
        detail={data?.product_detail ?? null}
        onClose={() => {
          setDrawerOpen(false);
          selectProduct(null);
        }}
      />
    </PurchasingContentArea>
  );
}
