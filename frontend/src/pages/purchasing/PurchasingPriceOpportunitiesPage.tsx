/**
 * Oszczędności zakupowe — okazje cenowe wyłącznie z danych systemu (bez sztucznych kwot).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import {
  fetchPurchasingPriceOpportunities,
  type PriceOpportunityDrawer,
  type PriceOpportunityRow,
  type PriceOpportunityType,
  type PurchasingPriceOpportunitiesPayload,
} from "../../api/purchasingPriceOpportunitiesApi";
import { listSuppliers, type SupplierRead } from "../../api/inboundSuppliersApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { PurchasingContentArea, PurchasingPageHeader } from "../../modules/purchasing/ui";

type Tenant = { id: number; name: string };

const TYP_ETYK: Record<PriceOpportunityType, string> = {
  cheaper_supplier: "Tańszy dostawca",
  price_increase: "Podwyżka vs zakupy",
  threshold_discount: "Próg / dostawa",
  bulk_discount: "Partia (MOQ)",
  low_rotation_high_cost: "Niska rotacja",
};

function wierszKlucz(r: PriceOpportunityRow): string {
  return `${r.type}-${r.product_id ?? "brak"}-${r.supplier_id}`;
}

function kolorOdznaki(typ: PriceOpportunityType, severity: string): string {
  if (typ === "price_increase" || typ === "low_rotation_high_cost") {
    if (severity === "high") return "bg-rose-100 text-rose-900 ring-1 ring-rose-200";
    return "bg-amber-100 text-amber-950 ring-1 ring-amber-200";
  }
  if (typ === "threshold_discount") return "bg-amber-100 text-amber-950 ring-1 ring-amber-200";
  if (typ === "cheaper_supplier" || typ === "bulk_discount") {
    if (severity === "high") return "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200";
    return "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-100";
  }
  return "bg-slate-100 text-slate-800 ring-1 ring-slate-200";
}

function num(n: number | null | undefined, opts?: Intl.NumberFormatOptions): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("pl-PL", opts);
}

/** „Cena teraz” vs „Najlepsza” — nigdy ujemnego „rabatu”; przy cenie powyżej odniesienia: +X%. */
function formatOpportunityDiffCell(r: PriceOpportunityRow): string {
  if (r.price_diff_percent == null || Number.isNaN(r.price_diff_percent)) return "—";
  if (r.type === "threshold_discount") {
    return `${num(r.price_diff_percent, { maximumFractionDigits: 1 })}%`;
  }
  const cur = r.current_price;
  const best = r.best_price;
  if (cur == null || best == null || !Number.isFinite(Number(cur)) || !Number.isFinite(Number(best)) || cur <= 0) {
    const p = Math.abs(Number(r.price_diff_percent));
    return `${num(p, { maximumFractionDigits: 1 })}%`;
  }
  if (best < cur - 1e-9) {
    const pct = 100 * (cur - best) / cur;
    return `${num(pct, { maximumFractionDigits: 1 })}%`;
  }
  if (best > cur + 1e-9) {
    const pct = 100 * ((best - cur) / cur);
    return `Powyżej +${num(pct, { maximumFractionDigits: 1 })}%`;
  }
  return "0%";
}

function dismissStorageKey(tenantId: number): string {
  return `purchasing_price_opp_dismissed_${tenantId}`;
}

function wczytajZignorowane(tenantId: number): Set<string> {
  try {
    const raw = localStorage.getItem(dismissStorageKey(tenantId));
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

function zapiszZignorowane(tenantId: number, s: Set<string>): void {
  localStorage.setItem(dismissStorageKey(tenantId), JSON.stringify(Array.from(s)));
}

function Kpi({ title, value, hint }: { title: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-200/90">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default function PurchasingPriceOpportunitiesPage() {
  const [searchParams] = useSearchParams();
  const { selectedWarehouseId } = useWarehouse();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(1);
  const [suppliers, setSuppliers] = useState<SupplierRead[]>([]);
  const [supplierFilter, setSupplierFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [rangeDays, setRangeDays] = useState<30 | 90 | 365>(90);
  const [tylkoWysokie, setTylkoWysokie] = useState(false);
  const [tylkoAktywneSku, setTylkoAktywneSku] = useState(false);
  const [data, setData] = useState<PurchasingPriceOpportunitiesPayload | null>(null);
  const [drawer, setDrawer] = useState<PriceOpportunityDrawer | null>(null);
  const [drawerRow, setDrawerRow] = useState<PriceOpportunityRow | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [zignorowane, setZignorowane] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    void api
      .get<Tenant[]>("/tenants/")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setTenants(list);
        if (list.length > 0 && !list.some((t) => t.id === tenantId)) setTenantId(list[0].id);
      })
      .catch(() => setTenants([]));
  }, []);

  useEffect(() => {
    const tid = searchParams.get("tenant_id");
    if (tid != null && tid !== "") {
      const n = Number(tid);
      if (Number.isFinite(n) && n >= 1) setTenantId(n);
    }
  }, [searchParams]);

  useEffect(() => {
    setZignorowane(wczytajZignorowane(tenantId));
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    void listSuppliers(tenantId, { status: "active" })
      .then(setSuppliers)
      .catch(() => setSuppliers([]));
  }, [tenantId]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const payload = await fetchPurchasingPriceOpportunities({
        tenantId,
        supplierId: supplierFilter ? Number(supplierFilter) : null,
        warehouseId: selectedWarehouseId ?? null,
        type: typeFilter || null,
        rangeDays,
        activeSkuOnly: tylkoAktywneSku,
        productId: null,
      });
      setData(payload);
      setDrawer(null);
      setDrawerRow(null);
    } catch {
      setErr("Nie udało się wczytać okazji cenowych.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, supplierFilter, selectedWarehouseId, typeFilter, rangeDays, tylkoAktywneSku]);

  useEffect(() => {
    void load();
  }, [load]);

  const otworzSzuflade = async (row: PriceOpportunityRow) => {
    if (row.product_id == null) {
      setDrawerRow(row);
      setDrawer(null);
      return;
    }
    setDrawerRow(row);
    setDrawerLoading(true);
    try {
      const payload = await fetchPurchasingPriceOpportunities({
        tenantId,
        supplierId: supplierFilter ? Number(supplierFilter) : null,
        warehouseId: selectedWarehouseId ?? null,
        type: typeFilter || null,
        rangeDays,
        activeSkuOnly: tylkoAktywneSku,
        productId: row.product_id,
      });
      setDrawer(payload.drawer);
    } catch {
      setDrawer(null);
    } finally {
      setDrawerLoading(false);
    }
  };

  const wierszeWidoczne = useMemo(() => {
    const rows = data?.rows ?? [];
    return rows.filter((r) => {
      if (zignorowane.has(wierszKlucz(r))) return false;
      if (tylkoWysokie && r.severity !== "high") return false;
      return true;
    });
  }, [data, zignorowane, tylkoWysokie]);

  const kpiZListy = useMemo(() => {
    const oszcz = wierszeWidoczne.reduce((a, r) => a + (Number.isFinite(r.estimated_saving) ? r.estimated_saving : 0), 0);
    const taniej = wierszeWidoczne.filter((r) => r.type === "cheaper_supplier").length;
    const podw = wierszeWidoczne.filter((r) => r.type === "price_increase").length;
    return { liczba: wierszeWidoczne.length, oszcz, taniej, podw };
  }, [wierszeWidoczne]);

  const zignoruj = (r: PriceOpportunityRow) => {
    const next = new Set(zignorowane);
    next.add(wierszKlucz(r));
    setZignorowane(next);
    zapiszZignorowane(tenantId, next);
    if (drawerRow && wierszKlucz(drawerRow) === wierszKlucz(r)) {
      setDrawer(null);
      setDrawerRow(null);
    }
  };

  return (
    <PurchasingContentArea>
      <PurchasingPageHeader
        title="Oszczędności zakupowe"
        subtitle="Porównanie ofert, historia zakupów i progi dostaw — wyłącznie na podstawie danych z systemu."
        actions={
          <>
            <Link
              to={`/purchasing/replenishment?tenant_id=${tenantId}`}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
            >
              Generator
            </Link>
            <Link
              to={`/purchasing/orders?tenant_id=${tenantId}`}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
            >
              Zamówienia (PO)
            </Link>
          </>
        }
      />
      <div className="space-y-6">

      {data?.data_message && (data.rows?.length ?? 0) === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{data.data_message}</div>
      ) : null}
      {(data?.rows?.length ?? 0) > 0 && wierszeWidoczne.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Wszystkie okazje z listy są ukryte (filtr „tylko wysokie” lub oznaczone jako zignorowane w tej przeglądarce).
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi title="Wszystkie okazje" value={loading ? "—" : kpiZListy.liczba} hint="Widoczne w tabeli (filtry + zignorowane wyłączone)" />
        <Kpi
          title="Możliwe oszczędności / mies."
          value={num(kpiZListy.oszcz, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " PLN"}
          hint="Suma kolumny „Potencjał” dla widocznych wierszy"
        />
        <Kpi title="Tańsi dostawcy (w tabeli)" value={loading ? "—" : kpiZListy.taniej} />
        <Kpi title="Podwyżki cen (w tabeli)" value={loading ? "—" : kpiZListy.podw} />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Podmiot</span>
          <select
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={tenantId}
            onChange={(e) => setTenantId(Number(e.target.value))}
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Dostawca</span>
          <select
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
          >
            <option value="">Wszyscy</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Typ okazji</span>
          <select
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">Wszystkie</option>
            <option value="cheaper_supplier">Tańszy dostawca</option>
            <option value="price_increase">Podwyżka vs zakupy</option>
            <option value="threshold_discount">Próg / dostawa</option>
            <option value="bulk_discount">Partia (MOQ)</option>
            <option value="low_rotation_high_cost">Niska rotacja</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Okres</span>
          <select
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={rangeDays}
            onChange={(e) => setRangeDays(Number(e.target.value) as 30 | 90 | 365)}
          >
            <option value={30}>30 dni</option>
            <option value={90}>90 dni</option>
            <option value={365}>365 dni</option>
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={tylkoWysokie} onChange={(e) => setTylkoWysokie(e.target.checked)} />
          Tylko wysokie
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={tylkoAktywneSku} onChange={(e) => setTylkoAktywneSku(e.target.checked)} />
          Tylko aktywne SKU
        </label>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{err}</div> : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[960px] w-full border-collapse text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600">
            <tr>
              <th className="px-3 py-2">Typ</th>
              <th className="px-3 py-2">Produkt</th>
              <th className="px-3 py-2">Dostawca</th>
              <th className="px-3 py-2 text-right">Cena teraz</th>
              <th className="px-3 py-2 text-right">Najlepsza</th>
              <th className="px-3 py-2 text-right">Różnica</th>
              <th className="px-3 py-2 text-right">Potencjał / mies.</th>
              <th className="px-3 py-2">Rekomendacja</th>
              <th className="px-3 py-2 text-right">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                  Wczytywanie…
                </td>
              </tr>
            ) : wierszeWidoczne.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-600">
                  {data?.data_message ?? "Brak wierszy spełniających kryteria."}
                </td>
              </tr>
            ) : (
              wierszeWidoczne.map((r) => (
                <tr
                  key={wierszKlucz(r)}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/80"
                  onClick={() => void otworzSzuflade(r)}
                >
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${kolorOdznaki(r.type, r.severity)}`}>
                      {TYP_ETYK[r.type]}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">{r.product_name}</td>
                  <td className="max-w-[180px] truncate px-3 py-2 text-slate-700" title={r.supplier_name}>
                    {r.supplier_name}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(r.current_price, { maximumFractionDigits: 4 })}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(r.best_price, { maximumFractionDigits: 4 })}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-800">{formatOpportunityDiffCell(r)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-800">
                    {num(r.estimated_saving, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} PLN
                  </td>
                  <td className="max-w-[280px] px-3 py-2 text-xs text-slate-600">{r.recommendation}</td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Link
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50"
                        to={`/purchasing/replenishment?tenant_id=${tenantId}&supplier_id=${r.supplier_id}${
                          r.product_id != null ? `&search=${encodeURIComponent(r.product_name)}` : ""
                        }`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Generator
                      </Link>
                      <button
                        type="button"
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50"
                        onClick={() => zignoruj(r)}
                      >
                        Zignoruj
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
        <p className="text-xs font-semibold uppercase text-slate-500">Szybkie akcje</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            onClick={() => void load()}
          >
            Odśwież dane
          </button>
          <Link
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-white"
            to={`/purchasing/replenishment?tenant_id=${tenantId}${supplierFilter ? `&supplier_id=${supplierFilter}` : ""}`}
          >
            Otwórz generator z filtrem dostawcy
          </Link>
          <Link
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-white"
            to={`/purchasing/orders?tenant_id=${tenantId}`}
          >
            Otwórz listę PO
          </Link>
        </div>
      </div>

      {drawerRow ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="presentation" onClick={() => setDrawerRow(null)}>
          <div
            className="h-full w-full max-w-lg overflow-y-auto bg-white shadow-2xl"
            role="dialog"
            aria-label="Szczegóły okazji"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Szczegóły</p>
                <p className="text-lg font-semibold text-slate-900">{drawerRow.product_name}</p>
                <p className="text-sm text-slate-600">{TYP_ETYK[drawerRow.type]}</p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => setDrawerRow(null)}
              >
                Zamknij
              </button>
            </div>
            <div className="space-y-4 p-4 text-sm">
              {drawerRow.product_id == null ? (
                <p className="text-slate-600">Brak powiązania z pojedynczym SKU — wybierz wiersz z produktem po pełnej liście.</p>
              ) : drawerLoading ? (
                <p className="text-slate-500">Wczytywanie historii…</p>
              ) : drawer ? (
                <>
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">Wolumen (szac.)</p>
                    <p className="mt-1 text-slate-800">
                      Zakupy / mies.: <span className="font-mono">{num(drawer.monthly_purchase_units, { maximumFractionDigits: 2 })}</span> szt.
                      <br />
                      Sprzedaż / mies.: <span className="font-mono">{num(drawer.monthly_sales_units, { maximumFractionDigits: 2 })}</span> szt.
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">Historia cen (PO i dostawy)</p>
                    {drawer.price_history.length === 0 ? (
                      <p className="mt-1 text-slate-600">Brak wystarczających danych.</p>
                    ) : (
                      <ul className="mt-1 max-h-48 overflow-auto rounded border border-slate-100">
                        {drawer.price_history.map((h, i) => (
                          <li key={i} className="flex justify-between border-b border-slate-50 px-2 py-1 text-xs">
                            <span className="text-slate-600">{h.date.slice(0, 16)}</span>
                            <span className="font-mono text-slate-900">{num(h.unit_price, { maximumFractionDigits: 4 })}</span>
                            <span className="text-slate-500">{h.source === "delivery" ? "Dostawa" : "PO"}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">Porównanie dostawców (katalog)</p>
                    {drawer.supplier_offers.length === 0 ? (
                      <p className="mt-1 text-slate-600">Brak wystarczających danych.</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {drawer.supplier_offers.map((o) => (
                          <li key={o.supplier_id} className="flex justify-between rounded border border-slate-100 px-2 py-1">
                            <span>{o.supplier_name}</span>
                            <span className="font-mono">{num(o.purchase_price, { maximumFractionDigits: 4 })} PLN</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-slate-600">Brak danych do szczegółów.</p>
              )}

              <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
                <Link
                  className="rounded-lg bg-slate-900 px-3 py-2 text-center text-sm font-medium text-white hover:bg-slate-800"
                  to={`/purchasing/replenishment?tenant_id=${tenantId}&supplier_id=${drawerRow.supplier_id}${
                    drawerRow.product_id != null ? `&search=${encodeURIComponent(drawerRow.product_name)}` : ""
                  }`}
                >
                  Dodaj do zamówienia (generator)
                </Link>
                <Link
                  className="rounded-lg border border-slate-300 px-3 py-2 text-center text-sm font-medium text-slate-800 hover:bg-slate-50"
                  to={`/suppliers?tenant_id=${tenantId}&edit=${drawerRow.supplier_id}`}
                >
                  Karta dostawcy
                </Link>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                  onClick={() => zignoruj(drawerRow)}
                >
                  Oznacz jako zignorowane
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </PurchasingContentArea>
  );
}
