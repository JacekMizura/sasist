import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Download, Save } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { listSuppliers, type SupplierRead } from "../../api/inboundSuppliersApi";
import {
  downloadReplenishmentCsv,
  fetchPurchasingReplenishment,
  type ReplenishmentListPayload,
  type ReplenishmentRow,
} from "../../api/purchasingReplenishmentApi";
import { fetchPurchasingForecast, type PurchasingForecastPayload } from "../../api/purchasingForecastApi";
import { useActiveWarehouseContext, ACTIVE_WAREHOUSE_REQUIRED_MESSAGE } from "../../hooks/useActiveWarehouseContext";
import { ActiveWarehouseRequiredBanner } from "../../components/layout/ActiveWarehouseRequiredBanner";
import { createPurchaseOrdersFromGenerator } from "../../api/purchasingOrdersApi";
import { pageContainerWidthAlignClass } from "../../components/layout/PageContainer";
import { DataTablePageSizeSelect } from "../../components/table/DataTablePageSizeSelect";
import { usePurchasingTenant } from "../../modules/purchasing/hooks/usePurchasingTenant";
import { PurchasingContentArea, PurchasingPageHeader } from "../../modules/purchasing/ui";

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

export default function PurchasingReplenishmentPage() {
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
  const [segmentAbc, setSegmentAbc] = useState<"" | "A" | "B" | "C">("");
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
      segment_abc: segmentAbc || null,
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
      segmentAbc,
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
    segmentAbc,
    tenantId,
  ]);

  useEffect(() => {
    if (inspectorProductId == null) {
      setInspectorData(null);
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
  }, [inspectorProductId, tenantId, warehouseId]);

  const rows = data?.rows ?? [];
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
    const ids = rows.map((r) => r.product_id);
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

  const th =
    "sticky top-0 z-10 border-b border-slate-200 bg-white py-3 px-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-sm";

  return (
    <PurchasingContentArea className="pb-28">
      {!hasActiveWarehouse ? (
        <ActiveWarehouseRequiredBanner hint="Propozycje zakupów i tworzenie PO dotyczą aktywnego magazynu z paska u góry." />
      ) : null}
      <PurchasingPageHeader
        title="Generator propozycji zakupów"
        actions={
          <>
            <button
              type="button"
              disabled={loading}
              onClick={() => void load()}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              Generuj ponownie
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
              className="flex items-center rounded-lg border border-slate-800 bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              <Download className="mr-2 h-4 w-4" />
              {exporting ? "Eksport…" : "Eksport CSV"}
            </button>
            <button
              type="button"
              disabled
              title="Funkcja w przygotowaniu (Etap 4 — zamówienia zakupowe)."
              className="flex items-center rounded-lg bg-blue-50 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-100"
            >
              <Save className="mr-2 h-4 w-4" />
              Zapisz szkic
            </button>
          </>
        }
      />

      {summary && !loading ? (
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
            Wiersze: <strong>{summary.total_rows}</strong>
          </span>
          <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-blue-700">
            Sugestie ≥ 1: <strong>{summary.suggested_count}</strong>
          </span>
          <span className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-red-700">
            Krytyczne: <strong>{summary.critical_count}</strong>
          </span>
          <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-emerald-700">
            Wartość sugerowana:{" "}
            <strong>{numFmt(summary.total_suggested_value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          </span>
        </div>
      ) : null}
      <div className="flex flex-col flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end">
        <div className="flex min-w-[200px] flex-[2] flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Szukaj</label>
          <input
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
            placeholder="Nazwa, SKU, symbol, EAN…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex min-w-[160px] flex-1 flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Dostawca</label>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
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
        </div>
        <div className="flex min-w-[140px] flex-1 flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Kategoria</label>
          <select disabled className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 shadow-sm" title="Brak powiązania kategorii w modelu produktu — wkrótce.">
            <option value="">Wszystkie</option>
          </select>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
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
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
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
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
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
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
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
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
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
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
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
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
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
        <div className="flex min-w-[100px] flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Top rotacja (N)</label>
          <input
            type="number"
            min={1}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-800 shadow-sm"
            placeholder="—"
            value={topSalesLimitStr}
            onChange={(e) => {
              setTopSalesLimitStr(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex min-w-[90px] flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Marża min. %</label>
          <input
            type="text"
            inputMode="decimal"
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-800 shadow-sm"
            placeholder="—"
            value={marginMinStr}
            onChange={(e) => {
              setMarginMinStr(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex min-w-[90px] flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Niska marża &lt; %</label>
          <input
            type="text"
            inputMode="decimal"
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-800 shadow-sm"
            placeholder="—"
            value={lowMarginLtStr}
            onChange={(e) => {
              setLowMarginLtStr(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex min-w-[100px] flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Klasa ABC</label>
          <select
            className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-800 shadow-sm"
            value={segmentAbc}
            onChange={(e) => {
              setSegmentAbc(e.target.value as "" | "A" | "B" | "C");
              setPage(1);
            }}
          >
            <option value="">Wszystkie</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
        </div>
        <div className="flex gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Sortowanie</label>
            <select
              className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-800 shadow-sm"
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
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Kierunek</label>
            <select
              className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-800 shadow-sm"
              value={sortDir}
              onChange={(e) => {
                setSortDir(e.target.value as "asc" | "desc");
                setPage(1);
              }}
            >
              <option value="desc">Malejąco</option>
              <option value="asc">Rosnąco</option>
            </select>
          </div>
        </div>
      </div>

      {err ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</p>
      ) : null}

      {loading ? (
        <TableSkeleton cols={6} />
      ) : !data || data.summary.total_rows === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <p className="text-base font-medium text-slate-800">Brak pozycji do wyświetlenia</p>
          <p className="mt-2 max-w-md text-sm text-slate-600">
            Zmień filtry lub sprawdź, czy w wybranym podmiocie są produkty ze stanem, sprzedażą lub otwartymi dostawami.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end">
            <DataTablePageSizeSelect
              value={pageSize}
              onChange={(next) => {
                setPageSize(next);
                setPage(1);
              }}
            />
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead>
              <tr>
                <th className={`${th} w-10 text-center`}>
                  <input
                    type="checkbox"
                    aria-label="Zaznacz stronę"
                    checked={rows.length > 0 && rows.every((r) => selected.has(r.product_id))}
                    onChange={togglePage}
                  />
                </th>
                <th className={th}>Produkt</th>
                <th className={`${th} text-right`}>Stan</th>
                <th className={`${th} text-right`}>W drodze</th>
                <th className={`${th} text-right`}>Sprzedaż 30d</th>
                <th className={`${th} text-right`}>Śr/dzień</th>
                <th className={`${th} text-right`}>Dni zapasu</th>
                <th className={`${th} text-right`}>Sugestia</th>
                <th className={`${th} w-28 text-center`}>Sygnał</th>
                <th className={th}>Dostawca</th>
                <th className={`${th} text-right`}>Zakup</th>
                <th className={`${th} text-right`}>Marża</th>
                <th className={`${th} text-right`}>Wartość</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr
                  key={r.product_id}
                  className={`border-b border-slate-100 ${rowTone(r, idx)}`}
                  onClick={() => setInspectorProductId(r.product_id)}
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
                    <div className="flex items-center gap-2">
                      {r.image_url ? (
                        <img src={r.image_url} alt="" className="h-9 w-9 shrink-0 rounded-md border border-slate-200 object-cover" />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-[10px] text-slate-400">
                          —
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-900">{r.product_name}</div>
                        <div className="truncate text-xs text-slate-500">
                          {[r.sku, r.ean].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>
                    </div>
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
          </div>
        </div>
      )}

      {!loading && data && data.summary.total_rows > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <span>
            Strona {page} / {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Poprzednia
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40"
              onClick={() => setPage((p) => p + 1)}
            >
              Następna
            </button>
          </div>
        </div>
      ) : null}

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

      {inspectorProductId != null ? (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-black/30"
          role="presentation"
          onClick={() => setInspectorProductId(null)}
        >
          <aside
            className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Inspektor produktu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Inspektor produktu</h2>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
                onClick={() => setInspectorProductId(null)}
              >
                Zamknij
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm text-slate-700">
              {inspectorLoading ? (
                <p className="text-slate-500">Wczytywanie…</p>
              ) : inspectorData?.product_detail ? (
                (() => {
                  const d = inspectorData.product_detail;
                  const pr = d.product;
                  const u = d.unit ?? null;
                  return (
                    <div className="space-y-4">
                      <div className="flex gap-3">
                        {pr.image_url ? (
                          <img
                            src={pr.image_url}
                            alt=""
                            className="h-20 w-20 shrink-0 rounded-lg border border-slate-200 object-cover"
                          />
                        ) : (
                          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-xs text-slate-400">
                            —
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{pr.name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            SKU: {pr.sku ?? "—"}
                            <br />
                            EAN: {pr.ean ?? "—"}
                          </p>
                        </div>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                        <dt className="text-slate-500">Stan</dt>
                        <dd className="text-right font-medium tabular-nums">{formatPipelineQty(u, d.stock)}</dd>
                        <dt className="text-slate-500">Sprzedaż 7 dni</dt>
                        <dd className="text-right tabular-nums">{formatPipelineQty(u, d.sales_7d)}</dd>
                        <dt className="text-slate-500">Sprzedaż 30 dni</dt>
                        <dd className="text-right tabular-nums">{formatPipelineQty(u, d.sales_30d)}</dd>
                        <dt className="text-slate-500">Sprzedaż 90 dni</dt>
                        <dd className="text-right tabular-nums">{formatPipelineQty(u, d.sales_90d)}</dd>
                        <dt className="text-slate-500">Czas realizacji</dt>
                        <dd className="text-right">{d.lead_time_days != null ? `${d.lead_time_days} d` : "—"}</dd>
                        <dt className="text-slate-500">Dostawca</dt>
                        <dd className="text-right truncate">{d.supplier_name ?? "—"}</dd>
                        <dt className="text-slate-500">Ostatnia dostawa</dt>
                        <dd className="text-right text-xs">
                          {d.last_delivery_at
                            ? new Date(d.last_delivery_at).toLocaleString("pl-PL")
                            : "—"}
                        </dd>
                        <dt className="text-slate-500">Ostatnia cena zakupu</dt>
                        <dd className="text-right tabular-nums">
                          {d.last_purchase_price != null
                            ? numFmt(d.last_purchase_price, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                            : "—"}
                        </dd>
                        <dt className="text-slate-500">Zakup EUR</dt>
                        <dd className="text-right tabular-nums">
                          {d.purchase_unit_net_eur != null
                            ? numFmt(d.purchase_unit_net_eur, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                            : "—"}
                        </dd>
                        <dt className="text-slate-500">Zakup PLN netto</dt>
                        <dd className="text-right tabular-nums">
                          {d.purchase_unit_net_pln != null
                            ? numFmt(d.purchase_unit_net_pln, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                            : "—"}
                        </dd>
                        <dt className="text-slate-500">Sprzedaż PLN brutto (23%)</dt>
                        <dd className="text-right tabular-nums">
                          {d.sale_pln_gross != null
                            ? numFmt(d.sale_pln_gross, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : "—"}
                        </dd>
                        <dt className="text-slate-500">Marża %</dt>
                        <dd className="text-right tabular-nums">
                          {d.margin_percent != null
                            ? `${numFmt(d.margin_percent, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`
                            : "—"}
                        </dd>
                        <dt className="text-slate-500">Rekomendowana ilość</dt>
                        <dd className="text-right font-semibold tabular-nums text-emerald-800">
                          {formatQtyDisplay(u, d.suggested_qty)}
                        </dd>
                      </dl>
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Lokalizacje ze stanem dodatnim
                        </p>
                        {d.locations && d.locations.length > 0 ? (
                          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs">
                            {d.locations.map((loc, i) => (
                              <li key={`${loc.warehouse_name}-${loc.location_name}-${i}`} className="flex justify-between gap-2">
                                <span className="truncate text-slate-700">
                                  {loc.warehouse_name} · {loc.location_name}
                                </span>
                                <span className="shrink-0 tabular-nums font-medium">{formatPipelineQty(u, loc.qty)}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-slate-500">Brak pozycji magazynowych z dodatnim stanem.</p>
                        )}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <p className="text-slate-500">Brak szczegółów produktu (prognoza niedostępna).</p>
              )}
            </div>
          </aside>
        </div>
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
