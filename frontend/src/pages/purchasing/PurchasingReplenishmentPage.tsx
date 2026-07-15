import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, Download, List, PackageSearch, Save, ShoppingCart } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppEmptyState } from "../../components/app-shell";
import { listSuppliers, type SupplierRead } from "../../api/inboundSuppliersApi";
import {
  downloadReplenishmentCsv,
  fetchPurchasingReplenishment,
  type ReplenishmentListPayload,
  type ReplenishmentRow,
} from "../../api/purchasingReplenishmentApi";
import { fetchPurchasingForecast, type PurchasingForecastPayload } from "../../api/purchasingForecastApi";
import {
  fetchPurchasingAlerts,
  fetchPurchasingAlertsSummary,
  postPurchasingAlertsRunScan,
  type PurchasingAlertEvent,
  type PurchasingAlertSummary,
} from "../../api/purchasingAlertsApi";
import { useActiveWarehouseContext, ACTIVE_WAREHOUSE_REQUIRED_MESSAGE } from "../../hooks/useActiveWarehouseContext";
import { ActiveWarehouseRequiredBanner } from "../../components/layout/ActiveWarehouseRequiredBanner";
import { createPurchaseOrdersFromGenerator } from "../../api/purchasingOrdersApi";
import { pageContainerWidthAlignClass } from "../../components/layout/PageContainer";
import { DataTablePageSizeSelect } from "../../components/table/DataTablePageSizeSelect";
import { usePurchasingTenant } from "../../modules/purchasing/hooks/usePurchasingTenant";
import { PlanAlertStrip, type PlanAlertQuickFilter } from "./plan/PlanAlertStrip";
import { PlanCategoryStrip, type PlanCategoryQuickFilter } from "./plan/PlanCategoryStrip";
import { PlanProductDetailPanel } from "./plan/PlanProductDetailPanel";
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
  purchasingBtnGhost,
  purchasingBtnSecondary,
  purchasingInputClass,
  purchasingSelectClass,
  purchasingTableTdClass,
} from "../../modules/purchasing/ui";

const PO_TOAST_KEY = "purchasing_po_toast";
const PURCHASE_GENERATOR_PAGE_SIZE_KEY = "purchase_generator.pageSize";

/** Odmiana po polsku: „zamówienie / zamówienia / zamówień … zakupowe”. */
function formatCreatedPurchaseOrdersPhrase(n: number): string {
  if (n <= 0) return "Nie utworzono zamówień zakupowych.";
  if (n === 1) return "Utworzono 1 zamówienie zakupowe.";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `Utworzono ${n} zamówienia zakupowe.`;
  return `Utworzono ${n} zamówień zakupowych.`;
}

/** „produkt / produkty / produktów” dla liczby pominiętych pozycji. */
function formatProductsWithoutSupplierPhrase(k: number): string {
  if (k <= 0) return "";
  if (k === 1) return "Pominięto 1 produkt bez przypisanego dostawcy.";
  const mod10 = k % 10;
  const mod100 = k % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `Pominięto ${k} produkty bez przypisanego dostawcy.`;
  return `Pominięto ${k} produktów bez przypisanego dostawcy.`;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

function numFmt(n: number | null | undefined, opts?: Intl.NumberFormatOptions): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("pl-PL", opts);
}

/** Zgodnie z backendem `is_piece_like_unit` — wyświetlanie ilości bez ułamków „sztukowych”. */
function isPieceLikeUnit(unit: string | null | undefined): boolean {
  if (unit == null || !String(unit).trim()) return true;
  const u = String(unit).trim().toLowerCase();
  if (["szt", "pcs", "pc", "op", "kpl", "ea", "eac", "piece", "pieces", "unit", "item"].includes(u)) return true;
  if (u.includes("szt") && u.length <= 8) return true;
  return false;
}

function isWeightLikeUnit(unit: string | null | undefined): boolean {
  const u = (unit || "").trim().toLowerCase();
  return ["kg", "g", "m", "l", "lm", "mb", "m2", "m3", "dm3", "cm", "mm"].includes(u);
}

/** Wyświetlanie ilości: szt. → ceil, kg/m/l → 2 miejsca, inaczej do 3 miejsc. */
function formatQtyDisplay(unit: string | null | undefined, v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  if (isPieceLikeUnit(unit)) {
    const n = Math.ceil(v - 1e-9);
    return n.toLocaleString("pl-PL", { maximumFractionDigits: 0 });
  }
  if (isWeightLikeUnit(unit)) {
    return v.toLocaleString("pl-PL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  return v.toLocaleString("pl-PL", { maximumFractionDigits: 3 });
}

/** Stan / w drodze / sprzedaż: bez ceil (unika fałszywego „1” przy 0,00x), −0 → 0; szt. jak w asortymencie (round). */
function formatPipelineQty(unit: string | null | undefined, v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  const x = Math.abs(v) < 1e-9 ? 0 : v;
  if (isPieceLikeUnit(unit)) {
    const n = Math.round(x);
    return n.toLocaleString("pl-PL", { maximumFractionDigits: 0 });
  }
  if (isWeightLikeUnit(unit)) {
    return x.toLocaleString("pl-PL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  return x.toLocaleString("pl-PL", { maximumFractionDigits: 3 });
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex gap-3 p-3">
          {Array.from({ length: cols }).map((__, j) => (
            <div key={j} className="h-9 flex-1 animate-pulse rounded-md bg-slate-100" />
          ))}
        </div>
      ))}
    </div>
  );
}

export type PurchasingReplenishmentPageProps = {
  variant?: "plan" | "standalone";
};

export default function PurchasingReplenishmentPage({ variant = "standalone" }: PurchasingReplenishmentPageProps = {}) {
  const isPlan = variant === "plan";
  const navigate = useNavigate();
  const { tenantId, refreshSignal } = usePurchasingTenant();
  const { warehouseId, hasActiveWarehouse } = useActiveWarehouseContext();
  const [searchParams] = useSearchParams();
  const [suppliers, setSuppliers] = useState<SupplierRead[]>([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 400);
  const [supplierId, setSupplierId] = useState<string>("");
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [positiveMarginOnly, setPositiveMarginOnly] = useState(false);
  const [stockZeroOnly, setStockZeroOnly] = useState(false);
  const [belowMinStockOnly, setBelowMinStockOnly] = useState(false);
  const [hasBuyPriceOnly, setHasBuyPriceOnly] = useState(false);
  const [marginMinStr, setMarginMinStr] = useState("");
  const [showLossProducts, setShowLossProducts] = useState(false);
  const [lowMarginLtStr, setLowMarginLtStr] = useState("");
  const [topSalesLimitStr, setTopSalesLimitStr] = useState("");
  const [sortBy, setSortBy] = useState("suggested_qty");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    const raw = localStorage.getItem(PURCHASE_GENERATOR_PAGE_SIZE_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 25;
  });
  const [data, setData] = useState<ReplenishmentListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [creatingPo, setCreatingPo] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  /** Modal: część zaznaczonych wierszy na stronie nie ma dostawcy. */
  const [supplierBlockModalOpen, setSupplierBlockModalOpen] = useState(false);
  const [inspectorProductId, setInspectorProductId] = useState<number | null>(null);
  const [inspectorData, setInspectorData] = useState<PurchasingForecastPayload | null>(null);
  const [inspectorLoading, setInspectorLoading] = useState(false);

  const [categoryQuickFilter, setCategoryQuickFilter] = useState<PlanCategoryQuickFilter>("");
  const [alertSummary, setAlertSummary] = useState<PurchasingAlertSummary | null>(null);
  const [alertQuickFilter, setAlertQuickFilter] = useState<PlanAlertQuickFilter>("");
  const [alertsByProduct, setAlertsByProduct] = useState<Map<number, PurchasingAlertEvent[]>>(() => new Map());
  const [scanBusy, setScanBusy] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

  useEffect(() => {
    const sid = searchParams.get("supplier_id");
    if (sid != null && sid !== "") {
      const n = Number(sid);
      if (Number.isFinite(n) && n >= 1) setSupplierId(String(n));
    }
    const sq = searchParams.get("search");
    if (sq != null && sq.trim() !== "") setSearch(sq.trim());
  }, [searchParams]);

  useEffect(() => {
    if (!tenantId) return;
    void listSuppliers(tenantId, { status: "active" })
      .then(setSuppliers)
      .catch(() => setSuppliers([]));
  }, [tenantId]);

  const loadPlanMeta = useCallback(async () => {
    if (!isPlan || !tenantId) return;
    try {
      const [sum, alerts] = await Promise.all([
        fetchPurchasingAlertsSummary(tenantId),
        fetchPurchasingAlerts({ tenantId, status: "open", limit: 500 }),
      ]);
      setAlertSummary(sum);
      const m = new Map<number, PurchasingAlertEvent[]>();
      for (const a of alerts) {
        if (a.product_id == null) continue;
        const arr = m.get(a.product_id) ?? [];
        arr.push(a);
        m.set(a.product_id, arr);
      }
      setAlertsByProduct(m);
    } catch {
      setAlertSummary(null);
      setAlertsByProduct(new Map());
    }
  }, [isPlan, tenantId]);

  useEffect(() => {
    void loadPlanMeta();
  }, [loadPlanMeta, refreshSignal]);

  const handleCategoryQuickFilter = (f: PlanCategoryQuickFilter) => {
    if (categoryQuickFilter === "low_stock" && f !== "low_stock") setLowStockOnly(false);
    if (f === "low_stock") setLowStockOnly(true);
    setCategoryQuickFilter(f);
    setPage(1);
  };

  const handleAlertQuickFilter = (f: PlanAlertQuickFilter) => {
    setAlertQuickFilter(f);
    if (f === "critical") setCriticalOnly(true);
    else if (f !== "with_alerts") setCriticalOnly(false);
  };

  useEffect(() => {
    localStorage.setItem(PURCHASE_GENERATOR_PAGE_SIZE_KEY, String(pageSize));
  }, [pageSize]);

  const marginMinParsed =
    marginMinStr.trim() === "" || Number.isNaN(Number(marginMinStr.replace(",", ".")))
      ? null
      : Number(marginMinStr.replace(",", "."));
  const topSalesRaw =
    topSalesLimitStr.trim() === "" || Number.isNaN(Number(topSalesLimitStr))
      ? null
      : Math.floor(Number(topSalesLimitStr));
  const topSalesParsed = topSalesRaw != null && topSalesRaw >= 1 ? topSalesRaw : null;
  const lowMarginLtParsed =
    lowMarginLtStr.trim() === "" || Number.isNaN(Number(lowMarginLtStr.replace(",", ".")))
      ? null
      : Number(lowMarginLtStr.replace(",", "."));

  const queryBase = useMemo(
    () => ({
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      search: debouncedSearch || undefined,
      supplier_id: supplierId ? Number(supplierId) : null,
      critical_only: criticalOnly,
      low_stock_only: lowStockOnly,
      positive_margin_only: positiveMarginOnly,
      stock_zero_only: stockZeroOnly,
      below_min_stock_only: belowMinStockOnly,
      has_buy_price_only: hasBuyPriceOnly,
      margin_min: marginMinParsed,
      show_loss_products: showLossProducts,
      low_margin_lt: lowMarginLtParsed,
      top_sales_limit: topSalesParsed,
      sort_by: sortBy,
      sort_dir: sortDir,
    }),
    [
      tenantId,
      warehouseId,
      debouncedSearch,
      supplierId,
      criticalOnly,
      lowStockOnly,
      positiveMarginOnly,
      stockZeroOnly,
      belowMinStockOnly,
      hasBuyPriceOnly,
      marginMinParsed,
      showLossProducts,
      lowMarginLtParsed,
      topSalesParsed,
      sortBy,
      sortDir,
    ],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const payload = await fetchPurchasingReplenishment({
        ...queryBase,
        page,
        page_size: pageSize,
      });
      setData(payload);
      setSelected(new Set());
    } catch {
      setErr("Nie udało się wczytać generatora uzupełnień.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [queryBase, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  const runAlertScan = async () => {
    setScanBusy(true);
    try {
      await postPurchasingAlertsRunScan(tenantId, warehouseId ?? null);
      await loadPlanMeta();
      await load();
    } catch {
      setErr("Skan alertów nie powiódł się.");
    } finally {
      setScanBusy(false);
    }
  };

  useLayoutEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    warehouseId,
    supplierId,
    criticalOnly,
    lowStockOnly,
    positiveMarginOnly,
    stockZeroOnly,
    belowMinStockOnly,
    hasBuyPriceOnly,
    marginMinStr,
    showLossProducts,
    lowMarginLtStr,
    topSalesLimitStr,
    categoryQuickFilter,
    tenantId,
  ]);

  useEffect(() => {
    if (isPlan || inspectorProductId == null) {
      if (!isPlan) setInspectorData(null);
      return;
    }
    let cancelled = false;
    setInspectorLoading(true);
    void fetchPurchasingForecast({
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      product_id: inspectorProductId,
      range_days: 30,
    })
      .then((d) => {
        if (!cancelled) setInspectorData(d);
      })
      .catch(() => {
        if (!cancelled) setInspectorData(null);
      })
      .finally(() => {
        if (!cancelled) setInspectorLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inspectorProductId, tenantId, warehouseId, isPlan]);

  const categoryCounts = useMemo(() => {
    const counts = {
      rising_demand: 0,
      low_stock: data?.summary?.low_stock_count ?? 0,
      dead_stock: 0,
      low_cover_days: 0,
      high_capital_locked: 0,
    };
    for (const list of alertsByProduct.values()) {
      for (const a of list) {
        if (a.rule_type === "rising_demand") counts.rising_demand += 1;
        else if (a.rule_type === "dead_stock") counts.dead_stock += 1;
        else if (a.rule_type === "low_cover_days") counts.low_cover_days += 1;
        else if (a.rule_type === "high_capital_locked") counts.high_capital_locked += 1;
      }
    }
    return counts;
  }, [alertsByProduct, data?.summary?.low_stock_count]);

  const rows = data?.rows ?? [];
  const displayRows = useMemo(() => {
    let out = rows;
    if (categoryQuickFilter && categoryQuickFilter !== "low_stock") {
      out = out.filter((r) =>
        (alertsByProduct.get(r.product_id) ?? []).some((a) => a.rule_type === categoryQuickFilter),
      );
    }
    if (alertQuickFilter === "with_alerts") {
      out = out.filter((r) => alertsByProduct.has(r.product_id));
    }
    return out;
  }, [rows, categoryQuickFilter, alertQuickFilter, alertsByProduct]);

  const selectedRow = useMemo(
    () => (selectedProductId != null ? displayRows.find((r) => r.product_id === selectedProductId) ?? rows.find((r) => r.product_id === selectedProductId) ?? null : null),
    [selectedProductId, displayRows, rows],
  );

  const handleRowActivate = (productId: number) => {
    if (isPlan) {
      setSelectedProductId((prev) => (prev === productId ? null : productId));
      return;
    }
    setInspectorProductId(productId);
  };

  const inspectorRow = useMemo(
    () => (inspectorProductId != null ? rows.find((r) => r.product_id === inspectorProductId) : undefined),
    [rows, inspectorProductId],
  );
  const summary = data?.summary;
  const totalPages = summary ? Math.max(1, Math.ceil(summary.total_rows / pageSize)) : 1;

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePage = () => {
    const ids = displayRows.map((r) => r.product_id);
    const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const rowTone = (r: ReplenishmentRow, index: number) => {
    const zebra = index % 2 === 0 ? "" : "bg-slate-50/50";
    const cov = r.stock_cover_days;
    const highSales = r.sales_30d >= 10 || r.avg_daily_sales >= 0.34;
    if (r.current_stock <= 0 && highSales) return `${zebra} bg-rose-50/90 hover:bg-rose-100/80`;
    if (cov != null && cov < 7) return `${zebra} bg-amber-50/85 hover:bg-amber-100/70`;
    if (cov != null && cov > 90) return `${zebra} bg-slate-200/45 hover:bg-slate-200/65`;
    return `${zebra} hover:bg-emerald-50/30`;
  };

  const showGoodSuggestionBadge = (r: ReplenishmentRow) => {
    const cov = r.stock_cover_days;
    const highSales = r.sales_30d >= 10 || r.avg_daily_sales >= 0.34;
    if (r.suggested_qty < 1) return false;
    if (r.current_stock <= 0 && highSales) return false;
    if (cov != null && cov < 7) return false;
    if (cov != null && cov > 90) return false;
    return true;
  };

  const td = purchasingTableTdClass;

  return (
    <PurchasingContentArea className="pb-20">
      {!hasActiveWarehouse ? (
        <ActiveWarehouseRequiredBanner hint="Propozycje zakupów i tworzenie PO dotyczą aktywnego magazynu z paska u góry." />
      ) : null}
      <PurchasingPageShell
        header={
          <PurchasingPageHeader
            title={isPlan ? "Plan zakupów" : "Generator propozycji zakupów"}
            subtitle={
              isPlan
                ? "Tabela rekomendacji po lewej — po kliknięciu produktu panel szczegółów po prawej."
                : "Sugestie uzupełnień na podstawie stanów, sprzedaży i otwartych dostaw."
            }
            actions={
              <>
                <button type="button" disabled={loading} onClick={() => void load()} className={purchasingBtnSecondary}>
                  {isPlan ? "Odśwież plan" : "Generuj ponownie"}
                </button>
                <button
                  type="button"
                  disabled={exporting || loading}
                  onClick={async () => {
                    setExporting(true);
                    try {
                      await downloadReplenishmentCsv({ ...queryBase });
                    } catch {
                      setErr("Eksport CSV nie powiódł się.");
                    } finally {
                      setExporting(false);
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 ${purchasingBtnSecondary}`}
                >
                  <Download className="h-4 w-4" aria-hidden />
                  {exporting ? "Eksport…" : "Eksport CSV"}
                </button>
                <button
                  type="button"
                  disabled
                  title="Funkcja w przygotowaniu (Etap 4 — zamówienia zakupowe)."
                  className={`inline-flex items-center gap-1.5 ${purchasingBtnGhost} opacity-60`}
                >
                  <Save className="h-4 w-4" aria-hidden />
                  Zapisz szkic
                </button>
              </>
            }
          />
        }
        status={err ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</p> : null}
        kpis={
          summary && !loading ? (
            <div className="space-y-3">
              <PurchasingKpiGrid columns={4}>
                <PurchasingKpiCard title="Wiersze" value={summary.total_rows} tone="default" icon={<List aria-hidden />} />
                <PurchasingKpiCard title="Sugestie ≥ 1" value={summary.suggested_count} tone="blue" icon={<ShoppingCart aria-hidden />} />
                <PurchasingKpiCard title="Krytyczne" value={summary.critical_count} tone="red" icon={<AlertTriangle aria-hidden />} />
                <PurchasingKpiCard
                  title="Wartość sugerowana"
                  value={numFmt(summary.total_suggested_value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  tone="emerald"
                  icon={<Banknote aria-hidden />}
                />
              </PurchasingKpiGrid>
              {isPlan ? (
                <PlanCategoryStrip
                  counts={categoryCounts}
                  active={categoryQuickFilter}
                  onSelect={handleCategoryQuickFilter}
                />
              ) : null}
            </div>
          ) : null
        }
        filters={
          <>
            {isPlan ? (
              <PlanAlertStrip
                summary={alertSummary}
                quickFilter={alertQuickFilter}
                onQuickFilter={handleAlertQuickFilter}
                onRunScan={() => void runAlertScan()}
                scanBusy={scanBusy}
              />
            ) : null}
            <PurchasingFilterBar
            footer={
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-700">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={criticalOnly}
                    onChange={(e) => {
                      setCriticalOnly(e.target.checked);
                      setPage(1);
                    }}
                  />
                  Tylko krytyczne
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={lowStockOnly}
                    onChange={(e) => {
                      setLowStockOnly(e.target.checked);
                      setPage(1);
                    }}
                  />
                  Niski stan
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={positiveMarginOnly}
                    onChange={(e) => {
                      setPositiveMarginOnly(e.target.checked);
                      setPage(1);
                    }}
                  />
                  Dodatnia marża
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={stockZeroOnly}
                    onChange={(e) => {
                      setStockZeroOnly(e.target.checked);
                      setPage(1);
                    }}
                  />
                  Tylko brak stanu
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={belowMinStockOnly}
                    onChange={(e) => {
                      setBelowMinStockOnly(e.target.checked);
                      setPage(1);
                    }}
                  />
                  Poniżej min. stanu
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={hasBuyPriceOnly}
                    onChange={(e) => {
                      setHasBuyPriceOnly(e.target.checked);
                      setPage(1);
                    }}
                  />
                  Z ceną zakupu
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showLossProducts}
                    onChange={(e) => {
                      setShowLossProducts(e.target.checked);
                      setPage(1);
                    }}
                  />
                  Tylko strata
                </label>
              </div>
            }
          >
            <PurchasingFilterField label="Szukaj" className="min-w-[200px] flex-[2]">
              <input
                className={purchasingInputClass}
                placeholder="Nazwa, SKU, symbol, EAN…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </PurchasingFilterField>
            <PurchasingFilterField label="Dostawca" className="min-w-[160px] flex-1">
              <select
                className={purchasingSelectClass}
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Wszyscy</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                  </option>
                ))}
              </select>
            </PurchasingFilterField>
            <PurchasingFilterField label="Kategoria" className="min-w-[140px] flex-1">
              <select
                disabled
                className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 shadow-sm"
                title="Brak powiązania kategorii w modelu produktu — wkrótce."
              >
                <option value="">Wszystkie</option>
              </select>
            </PurchasingFilterField>
            <PurchasingFilterField label="Top rotacja (N)" className="min-w-[100px]">
              <input
                type="number"
                min={1}
                className={purchasingInputClass}
                placeholder="—"
                value={topSalesLimitStr}
                onChange={(e) => {
                  setTopSalesLimitStr(e.target.value);
                  setPage(1);
                }}
              />
            </PurchasingFilterField>
            <PurchasingFilterField label="Marża min. %" className="min-w-[90px]">
              <input
                type="text"
                inputMode="decimal"
                className={purchasingInputClass}
                placeholder="—"
                value={marginMinStr}
                onChange={(e) => {
                  setMarginMinStr(e.target.value);
                  setPage(1);
                }}
              />
            </PurchasingFilterField>
            <PurchasingFilterField label="Niska marża < %" className="min-w-[90px]">
              <input
                type="text"
                inputMode="decimal"
                className={purchasingInputClass}
                placeholder="—"
                value={lowMarginLtStr}
                onChange={(e) => {
                  setLowMarginLtStr(e.target.value);
                  setPage(1);
                }}
              />
            </PurchasingFilterField>
            <PurchasingFilterField label="Sortowanie">
              <select
                className={purchasingSelectClass}
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(1);
                }}
              >
                <option value="suggested_qty">Sugestia</option>
                <option value="estimated_order_value">Wartość</option>
                <option value="product_name">Produkt</option>
                <option value="current_stock">Stan</option>
                <option value="avg_daily_sales">Śr. / dzień</option>
                <option value="margin_percent">Marża %</option>
              </select>
            </PurchasingFilterField>
            <PurchasingFilterField label="Kierunek">
              <select
                className={purchasingSelectClass}
                value={sortDir}
                onChange={(e) => {
                  setSortDir(e.target.value as "asc" | "desc");
                  setPage(1);
                }}
              >
                <option value="desc">Malejąco</option>
                <option value="asc">Rosnąco</option>
              </select>
            </PurchasingFilterField>
          </PurchasingFilterBar>
          </>
        }
        table={
          loading ? (
            <TableSkeleton cols={6} />
          ) : !data || data.summary.total_rows === 0 ? (
            <PurchasingTableSection title="Produkty do zakupu" indicatorClass="bg-blue-500">
              <AppEmptyState
                icon={PackageSearch}
                title="Brak pozycji do wyświetlenia"
                description="Zmień filtry lub sprawdź, czy w wybranym podmiocie są produkty ze stanem, sprzedażą lub otwartymi dostawami."
                density="inline"
              />
            </PurchasingTableSection>
          ) : (
            <div className={isPlan ? "flex min-h-[480px] items-stretch" : undefined}>
              <div className={isPlan ? "min-w-0 flex-1" : undefined}>
            <PurchasingTableSection
              title="Produkty do zakupu"
              indicatorClass="bg-blue-500"
              toolbar={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {isPlan && (categoryQuickFilter || alertQuickFilter === "with_alerts") ? (
                    <span className="text-xs text-slate-500">
                      Widoczne po filtrach: <strong>{displayRows.length}</strong>
                    </span>
                  ) : null}
                  <DataTablePageSizeSelect
                    value={pageSize}
                    onChange={(next) => {
                      setPageSize(next);
                      setPage(1);
                    }}
                  />
                </div>
              }
            >
              {displayRows.length === 0 ? (
                <AppEmptyState
                  icon={PackageSearch}
                  title="Brak wierszy na tej stronie"
                  description="Aktywne filtry kategorii lub alertów nie pasują do produktów na bieżącej stronie."
                  density="inline"
                />
              ) : (
              <table className="w-full min-w-[1100px] border-collapse text-sm">
                <PurchasingTableHeader sticky className="bg-white">
                  <tr>
                    <th className={`${td} w-10 text-center font-semibold uppercase tracking-wide text-slate-500`}>
                      <input
                        type="checkbox"
                        aria-label="Zaznacz stronę"
                        checked={displayRows.length > 0 && displayRows.every((r) => selected.has(r.product_id))}
                        onChange={togglePage}
                      />
                    </th>
                    <th className={`${td} text-left font-semibold uppercase tracking-wide text-slate-500`}>Produkt</th>
                    <th className={`${td} text-right font-semibold uppercase tracking-wide text-slate-500`}>Stan</th>
                    <th className={`${td} text-right font-semibold uppercase tracking-wide text-slate-500`}>W drodze</th>
                    <th className={`${td} text-right font-semibold uppercase tracking-wide text-slate-500`}>Sprzedaż 30d</th>
                    <th className={`${td} text-right font-semibold uppercase tracking-wide text-slate-500`}>Śr/dzień</th>
                    <th className={`${td} text-right font-semibold uppercase tracking-wide text-slate-500`}>Dni zapasu</th>
                    <th className={`${td} text-right font-semibold uppercase tracking-wide text-slate-500`}>Sugestia</th>
                    <th className={`${td} w-28 text-center font-semibold uppercase tracking-wide text-slate-500`}>Sygnał</th>
                    <th className={`${td} text-left font-semibold uppercase tracking-wide text-slate-500`}>Dostawca</th>
                    <th className={`${td} text-right font-semibold uppercase tracking-wide text-slate-500`}>Zakup</th>
                    <th className={`${td} text-right font-semibold uppercase tracking-wide text-slate-500`}>Marża</th>
                    <th className={`${td} text-right font-semibold uppercase tracking-wide text-slate-500`}>Wartość</th>
                  </tr>
                </PurchasingTableHeader>
                <tbody>
              {displayRows.map((r, idx) => (
                <tr
                  key={r.product_id}
                  className={`border-b border-slate-100 ${rowTone(r, idx)} ${
                    isPlan && selectedProductId === r.product_id ? "bg-orange-50/80 ring-1 ring-inset ring-orange-300" : ""
                  } ${isPlan ? "cursor-pointer" : ""}`}
                  onClick={() => handleRowActivate(r.product_id)}
                >
                  <td className="px-2 py-2 text-center align-middle">
                    <input
                      type="checkbox"
                      checked={selected.has(r.product_id)}
                      onChange={() => toggleOne(r.product_id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="px-2 py-2 align-middle">
                    <PurchasingProductCell
                      name={r.product_name}
                      sku={r.sku}
                      ean={r.ean}
                      imageUrl={r.image_url}
                      stock={r.current_stock}
                      incomingQty={r.incoming_qty}
                      unit={r.product_unit}
                    />
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-800">
                    {formatPipelineQty(r.product_unit, r.current_stock)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-800">
                    {formatPipelineQty(r.product_unit, r.incoming_qty)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-800">
                    {formatPipelineQty(r.product_unit, r.sales_30d)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-800">
                    {formatPipelineQty(r.product_unit, r.avg_daily_sales)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-800">{r.stock_cover_days ?? "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-medium text-slate-900">
                    {formatQtyDisplay(r.product_unit, r.suggested_qty)}
                  </td>
                  <td className="px-2 py-2 text-center align-middle">
                    {showGoodSuggestionBadge(r) ? (
                      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
                        OK
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="max-w-[140px] truncate px-2 py-2 text-slate-700" title={r.supplier_name ?? undefined}>
                    {r.supplier_name ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-800">{numFmt(r.buy_price, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-800">
                    {r.margin_percent != null ? (
                      <span className="inline-flex flex-col items-end gap-0.5 leading-tight">
                        <span>{numFmt(r.margin_percent, { maximumFractionDigits: 2 })}%</span>
                        {r.margin_value != null ? (
                          <span className="text-xs font-normal text-slate-500">
                            {numFmt(r.margin_value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-medium text-slate-900">
                    {numFmt(r.estimated_order_value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
                </tbody>
              </table>
              )}
            </PurchasingTableSection>
              </div>
              {isPlan && selectedRow ? (
                <PlanProductDetailPanel
                  row={selectedRow}
                  alerts={alertsByProduct.get(selectedRow.product_id) ?? []}
                  tenantId={tenantId}
                  warehouseId={warehouseId}
                  onClose={() => setSelectedProductId(null)}
                  formatQty={formatQtyDisplay}
                />
              ) : null}
            </div>
          )
        }
        footer={
          !loading && data && data.summary.total_rows > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
              <span>
                Strona {page} / {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  className={purchasingBtnSecondary}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Poprzednia
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  className={purchasingBtnSecondary}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Następna
                </button>
              </div>
            </div>
          ) : null
        }
      />

      {selected.size > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 py-3 shadow-[0_-4px_20px_rgba(15,23,42,0.08)] backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <div className={`flex flex-wrap items-center justify-between gap-3 ${pageContainerWidthAlignClass}`}>
            <p className="text-sm font-medium text-slate-800">
              Zaznaczono: <span className="tabular-nums">{selected.size}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={creatingPo || !hasActiveWarehouse}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                onClick={async () => {
                  setErr(null);
                  if (!hasActiveWarehouse || warehouseId == null) {
                    setErr(ACTIVE_WAREHOUSE_REQUIRED_MESSAGE);
                    return;
                  }
                  // Walidacja po stronie UI: wiersze widoczne na bieżącej stronie (zaznaczenie jest czyszczone przy zmianie strony).
                  const selectedRows = rows.filter((r) => selected.has(r.product_id));
                  const bezDostawcy = selectedRows.filter((r) => r.supplier_id == null);
                  if (bezDostawcy.length > 0) {
                    setSupplierBlockModalOpen(true);
                    return;
                  }
                  setCreatingPo(true);
                  try {
                    const res = await createPurchaseOrdersFromGenerator({
                      tenant_id: tenantId,
                      warehouse_id: warehouseId,
                      product_ids: Array.from(selected),
                    });
                    const n = res.created_orders.length;
                    const w = res.created_orders.reduce((a, c) => a + c.warnings.length, 0);
                    const skippedNs = res.skipped_no_supplier_count ?? 0;
                    let msg = formatCreatedPurchaseOrdersPhrase(n);
                    if (w > 0) msg += ` (${w} ostrzeżeń MOQ / wysyłka)`;
                    const skipPart = formatProductsWithoutSupplierPhrase(skippedNs);
                    if (skipPart) msg += ` ${skipPart}`;
                    sessionStorage.setItem(PO_TOAST_KEY, msg.trim());
                    navigate(`/purchasing/orders?tenant_id=${tenantId}`);
                  } catch {
                    setErr("Nie udało się utworzyć zamówień zakupowych.");
                  } finally {
                    setCreatingPo(false);
                  }
                }}
              >
                {creatingPo ? "Tworzenie…" : "Utwórz zamówienie do dostawcy"}
              </button>
              <button
                type="button"
                disabled={exporting}
                className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                onClick={async () => {
                  setExporting(true);
                  try {
                    await downloadReplenishmentCsv({
                      ...queryBase,
                      product_ids: Array.from(selected),
                    });
                  } catch {
                    setErr("Eksport zaznaczonych nie powiódł się.");
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                Export zaznaczone
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!isPlan ? (
      <PurchasingProductInspectorDrawer
        open={inspectorProductId != null}
        loading={inspectorLoading}
        detail={inspectorData?.product_detail ?? null}
        tenantId={tenantId}
        onClose={() => setInspectorProductId(null)}
        formatQty={formatPipelineQty}
        incomingQty={inspectorRow?.incoming_qty}
      />
      ) : null}

      {supplierBlockModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={() => setSupplierBlockModalOpen(false)}
        >
          <div
            className="max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900">Nie można utworzyć zamówienia</h2>
            <p className="mt-2 text-sm text-slate-600">
              Część produktów nie ma dostawcy. Uzupełnij domyślnego dostawcę lub powiązanie w katalogu dostawcy, potem
              spróbuj ponownie.
            </p>
            <button
              type="button"
              className="mt-6 w-full rounded-lg border border-slate-200 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              onClick={() => setSupplierBlockModalOpen(false)}
            >
              Zamknij
            </button>
          </div>
        </div>
      ) : null}
    </PurchasingContentArea>
  );
}
