import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchPurchasingForecast, type PurchasingForecastPayload } from "../../api/purchasingForecastApi";
import { listSuppliers, type SupplierRead } from "../../api/inboundSuppliersApi";
import { searchProductsCatalog, type ProductSearchHit } from "../../api/productsSearchApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { usePurchasingModuleContextOptional } from "../../modules/purchasing/context/PurchasingModuleContext";
import { usePurchasingTenant } from "../../modules/purchasing/hooks/usePurchasingTenant";
import {
  PurchasingAnalysisSection,
  PurchasingContentArea,
  PurchasingFilterBar,
  PurchasingFilterField,
  PurchasingKpiCard,
  PurchasingKpiGrid,
  PurchasingPageHeader,
  PurchasingPageShell,
  PurchasingTableSection,
  purchasingFilterButtonClass,
  purchasingInputClass,
  purchasingSelectClass,
} from "../../modules/purchasing/ui";

const FORECAST_TOOLTIP_PL =
  "Prognoza oparta na sprzedaży historycznej. Wzór 30 dni: sprzedaż_30d×0,6 + sprzedaż_poprz_30d×0,3 + sprzedaż_7d×0,1×4. Trend %: porównanie ostatnich 30 dni z poprzednimi 30 dniami.";

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

  useEffect(() => {
    const pid = searchParams.get("product_id");
    if (pid != null && pid !== "") {
      const n = Number(pid);
      if (Number.isFinite(n) && n >= 1) setSelectedProductId(n);
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

  const selectProduct = (id: number | null) => {
    setSelectedProductId(id);
    const next = new URLSearchParams(searchParams);
    if (id == null) next.delete("product_id");
    else next.set("product_id", String(id));
    next.set("tenant_id", String(tenantId));
    setSearchParams(next, { replace: true });
  };

  const barData = useMemo(
    () =>
      (data?.charts.top_fast_moving ?? []).map((r) => ({
        name: truncate(r.name, 22),
        qty: r.qty_30d,
        product_id: r.product_id,
      })),
    [data],
  );

  const th = "py-2 px-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";
  const td = "py-2 px-3 text-sm text-slate-800";

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
              <button type="button" onClick={() => void load()} disabled={loading} className={purchasingFilterButtonClass}>
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
          s ? (
            <>
              <PurchasingAnalysisSection
                title="Wolumen sprzedaży (szt. / mies.)"
                subtitle={`Ekstrapolacja: (suma szt. w oknie ${rangeDays} dni ÷ ${rangeDays}) × 30 = ${s.total_monthly_sales.toLocaleString("pl-PL")}. Wartość magazynu (szac. koszt): ${s.total_stock_value.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              >
                <div className="h-[300px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data?.charts.sales_trend ?? []} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tickFormatter={fmtShortDate} tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          typeof value === "number" ? value.toLocaleString("pl-PL") : value,
                          name === "qty" ? "Ilość" : "Przychód",
                        ]}
                        labelFormatter={(l: string) => `Data: ${fmtShortDate(l)}`}
                      />
                      <Line yAxisId="left" type="monotone" dataKey="qty" name="qty" stroke="#0f766e" strokeWidth={2} dot={false} />
                      <Line yAxisId="right" type="monotone" dataKey="revenue" name="revenue" stroke="#7c3aed" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </PurchasingAnalysisSection>

              <PurchasingAnalysisSection title="Top rotacja (30 dni)" subtitle="Kliknij słupek, aby wczytać produkt w inspektorze.">
                <div className="h-[320px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                      <Tooltip
                        formatter={(v: number) => [v.toLocaleString("pl-PL"), "Szt. (30 dni)"]}
                        labelFormatter={(label) => {
                          const row = barData.find((d) => d.name === label);
                          return row ? `#${row.product_id} ${label}` : String(label);
                        }}
                      />
                      <Bar
                        dataKey="qty"
                        fill="#334155"
                        radius={[0, 4, 4, 0]}
                        onClick={(state) => {
                          const row = state?.payload as { product_id?: number } | undefined;
                          if (row?.product_id) selectProduct(row.product_id);
                        }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </PurchasingAnalysisSection>
            </>
          ) : null
        }
        table={
          s ? (
            <>
              <PurchasingTableSection title="Produkty ryzyka" indicatorClass="bg-amber-500">
                <table className="w-full min-w-[520px]">
                  <thead className="border-b border-slate-200">
                    <tr>
                      <th className={th}>Produkt</th>
                      <th className={`${th} text-right`}>Stan</th>
                      <th className={`${th} text-right`}>Śr./dzień</th>
                      <th className={`${th} text-right`}>Dni zapasu</th>
                      <th className={`${th} text-right`}>Akcja</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.charts.top_risk_products ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                          Brak pozycji spełniających kryterium.
                        </td>
                      </tr>
                    ) : (
                      data!.charts.top_risk_products.map((r) => (
                        <tr key={r.product_id} className="border-b border-slate-100 hover:bg-amber-50/40">
                          <td className={td}>
                            <span className="font-medium">{r.name}</span>
                          </td>
                          <td className={`${td} text-right tabular-nums`}>{r.stock}</td>
                          <td className={`${td} text-right tabular-nums`}>{r.avg_daily_sales.toFixed(4)}</td>
                          <td className={`${td} text-right tabular-nums`}>{r.cover_days ?? "—"}</td>
                          <td className={`${td} text-right`}>
                            <button
                              type="button"
                              className="text-sm font-medium text-sky-700 hover:underline"
                              onClick={() => selectProduct(r.product_id)}
                            >
                              Inspektor
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </PurchasingTableSection>

              <PurchasingTableSection title="Martwy stock" indicatorClass="bg-violet-500">
                <table className="w-full min-w-[560px]">
                  <thead className="border-b border-slate-200">
                    <tr>
                      <th className={th}>Produkt</th>
                      <th className={`${th} text-right`}>Stan</th>
                      <th className={`${th} text-right`}>Dni bez sprzedaży</th>
                      <th className={`${th} text-right`}>Wartość</th>
                      <th className={`${th} text-right`}>Akcja</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.charts.dead_stock ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                          Brak pozycji.
                        </td>
                      </tr>
                    ) : (
                      data!.charts.dead_stock.map((r) => (
                        <tr key={r.product_id} className="border-b border-slate-100 hover:bg-violet-50/40">
                          <td className={td}>
                            <span className="font-medium">{r.name}</span>
                          </td>
                          <td className={`${td} text-right tabular-nums`}>{r.stock}</td>
                          <td className={`${td} text-right tabular-nums`}>{r.no_sales_days}</td>
                          <td className={`${td} text-right tabular-nums`}>
                            {r.stock_value.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className={`${td} text-right`}>
                            <button
                              type="button"
                              className="text-sm font-medium text-sky-700 hover:underline"
                              onClick={() => selectProduct(r.product_id)}
                            >
                              Inspektor
                            </button>
                          </td>
                        </tr>
                      ))
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
                        className={purchasingFilterButtonClass}
                        onClick={() => selectProduct(null)}
                      >
                        Wyczyść wybór
                      </button>
                    ) : null}
                  </div>

                  {data?.product_detail ? (
                    <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/80 p-5">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-lg font-semibold text-slate-900">{data.product_detail.product.name}</p>
                          <p className="text-sm text-slate-600">{data.product_detail.product.sku ?? "—"}</p>
                        </div>
                        <p className="text-sm text-slate-600">
                          Dostawca: <span className="font-medium">{data.product_detail.supplier_name ?? "—"}</span>
                          {data.product_detail.lead_time_days != null ? (
                            <span className="ml-2">· Czas realizacji: {data.product_detail.lead_time_days} d</span>
                          ) : null}
                        </p>
                      </div>
                      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div>
                          <dt className="text-xs font-medium uppercase text-slate-500">Stan</dt>
                          <dd className="text-lg font-semibold tabular-nums">{data.product_detail.stock}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase text-slate-500">Sprzedaż 7d / 30d / 90d</dt>
                          <dd className="text-lg font-semibold tabular-nums">
                            {data.product_detail.sales_7d} / {data.product_detail.sales_30d} / {data.product_detail.sales_90d}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase text-slate-500">Średnia dzienna (30d)</dt>
                          <dd className="text-lg font-semibold tabular-nums">{data.product_detail.avg_daily.toFixed(4)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase text-slate-500">Sugestia uzupełnienia</dt>
                          <dd className="text-lg font-semibold tabular-nums">{data.product_detail.suggested_qty}</dd>
                        </div>
                        <div title={FORECAST_TOOLTIP_PL}>
                          <dt className="text-xs font-medium uppercase text-slate-500">Prognoza 30 dni (szt.)</dt>
                          <dd className="text-lg font-semibold tabular-nums text-teal-800">{data.product_detail.forecast_30d}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase text-slate-500">Trend vs poprz. 30d</dt>
                          <dd className="text-lg font-semibold tabular-nums">
                            {data.product_detail.trend_percent != null ? `${data.product_detail.trend_percent} %` : "—"}
                          </dd>
                        </div>
                      </dl>
                      <p className="mt-4 text-xs leading-relaxed text-slate-600" title={FORECAST_TOOLTIP_PL}>
                        {FORECAST_TOOLTIP_PL}
                      </p>
                    </div>
                  ) : selectedProductId != null ? (
                    <p className="mt-4 text-sm text-slate-500">Brak danych szczegółowych dla tego produktu.</p>
                  ) : (
                    <p className="mt-4 text-sm text-slate-500">Wybierz produkt z listy lub z tabel, aby zobaczyć kartę.</p>
                  )}
                </div>
              </PurchasingTableSection>
            </>
          ) : null
        }
      />
    </PurchasingContentArea>
  );
}
