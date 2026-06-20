import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Clock, Filter, Package, TrendingUp } from "lucide-react";

import { useWarehouse } from "../../context/WarehouseContext";
import {
  listProductionBatches,
  listProductionOrders,
  type ProductionBatchRead,
  type ProductionOrderRead,
} from "../../api/productionApi";
import { AppEmptyState } from "../../components/app-shell";
import {
  FilterActionsBar,
  ListFilterEmbeddedShell,
  filterGridColsClass,
  filterInputClass,
  filterLabelClass,
  filterSelectClass,
} from "../../components/filters";
import {
  productsListActionsCellClass,
  productsListActionsInnerClass,
  productsListActionsThClass,
} from "../../components/products/productList/productsListTableTokens";
import {
  moduleListTableClass,
  moduleListTableScrollClass,
  moduleListTdClass,
  moduleListThClass,
  moduleListTheadClass,
  moduleTableCardClass,
} from "../../components/listPage/moduleList";
import { listSellasistToolbarToggleBtn } from "../../components/listPage/listSellasistTokens";
import { PurchasingKpiCard, PurchasingKpiGrid } from "../../modules/purchasing/ui";
import {
  DEFAULT_PRODUCTION_HISTORY_FILTERS,
  type ProductionHistoryFilters,
} from "../../modules/production/productionListFilters";
import {
  BATCH_STATUS_LABEL,
  PRODUCTION_STATUS_LABEL,
  batchStatusBadgeClass,
  formatProductionMoney,
  productionStatusBadgeClass,
} from "./productionUi";
import { erpProductionPaths } from "./productionPaths";
import { ProductionRowActionsMenu } from "./components/ProductionRowActionsMenu";

const DEFAULT_TENANT = 1;

type HistoryRow = {
  key: string;
  number: string;
  kind: "batch" | "order";
  product: string;
  qty: number;
  status: string;
  completedAt: string;
  operator: string;
  unitCost: string;
  linkTo: string;
};

function toBatchRow(b: ProductionBatchRead): HistoryRow {
  const label = b.lines?.map((l) => l.product_name).filter(Boolean).join(", ") || `${b.products_count ?? b.lines.length} prod.`;
  return {
    key: `batch-${b.id}`,
    number: b.number,
    kind: "batch",
    product: label,
    qty: b.total_completed_units ?? b.total_planned_units ?? 0,
    status: b.status,
    completedAt: (b.completed_at ?? b.production_completed_at ?? b.created_at ?? "").slice(0, 10) || "—",
    operator: b.operator_name ?? "—",
    unitCost: "—",
    linkTo: erpProductionPaths.batch(b.id),
  };
}

function toOrderRow(o: ProductionOrderRead): HistoryRow {
  return {
    key: `order-${o.id}`,
    number: o.number,
    kind: "order",
    product: o.product_name ?? `Produkt #${o.product_id}`,
    qty: o.produced_quantity || o.planned_quantity,
    status: o.status,
    completedAt: (o.completed_at ?? o.created_at ?? "").slice(0, 10) || "—",
    operator: o.operator_name ?? "—",
    unitCost: formatProductionMoney(o.calculated_unit_cost),
    linkTo: erpProductionPaths.orders,
  };
}

export default function ProductionHistoryPage() {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [draftFilters, setDraftFilters] = useState<ProductionHistoryFilters>(DEFAULT_PRODUCTION_HISTORY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ProductionHistoryFilters>(DEFAULT_PRODUCTION_HISTORY_FILTERS);

  const reload = useCallback(async () => {
    if (warehouseId == null) return;
    setLoading(true);
    try {
      const [batches, orders] = await Promise.all([
        listProductionBatches(tenantId, { warehouse_id: warehouseId, status: "completed" }),
        listProductionOrders(tenantId, { warehouse_id: warehouseId, status: "completed" }),
      ]);
      const merged = [...batches.map(toBatchRow), ...orders.map(toOrderRow)].sort((a, b) =>
        b.completedAt.localeCompare(a.completedAt),
      );
      setRows(merged);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = useMemo(() => {
    const f = appliedFilters;
    return rows.filter((r) => {
      if (f.status && r.status !== f.status) return false;
      if (f.operator.trim() && !r.operator.toLowerCase().includes(f.operator.trim().toLowerCase())) return false;
      if (f.product.trim() && !r.product.toLowerCase().includes(f.product.trim().toLowerCase())) return false;
      if (f.dateFrom && r.completedAt !== "—" && r.completedAt < f.dateFrom) return false;
      if (f.dateTo && r.completedAt !== "—" && r.completedAt > f.dateTo) return false;
      const q = f.query.trim().toLowerCase();
      if (q) {
        const hay = [r.number, r.product, r.operator].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, appliedFilters]);

  const kpis = useMemo(() => {
    const completedBatches = filtered.filter((r) => r.kind === "batch").length;
    const units = filtered.reduce((s, r) => s + r.qty, 0);
    const costs = filtered.map((r) => parseFloat(r.unitCost.replace(/[^\d.,]/g, "").replace(",", "."))).filter((n) => Number.isFinite(n) && n > 0);
    const avgCost = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null;
    return { completedBatches, units, avgCost };
  }, [filtered]);

  if (warehouseId == null) {
    return <p className="py-8 text-sm text-slate-500">Wybierz magazyn, aby wyświetlić historię produkcji.</p>;
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Historia produkcji
            {!loading ? <span className="ml-2 text-base font-normal text-slate-400">{filtered.length} wyników</span> : null}
          </h2>
          <p className="mt-1 text-sm text-slate-500">Zakończone partie masowe i zlecenia produkcyjne (MO).</p>
        </div>
        <button
          type="button"
          onClick={() => setFiltersExpanded((v) => !v)}
          className={`${listSellasistToolbarToggleBtn} inline-flex !h-10 items-center gap-2`}
          aria-expanded={filtersExpanded}
        >
          <Filter className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          Filtry
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${filtersExpanded ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </div>

      <ListFilterEmbeddedShell expanded={filtersExpanded}>
        <div className={filterGridColsClass}>
          <label className="block min-w-0">
            <span className={filterLabelClass}>Szukaj</span>
            <input
              type="search"
              className={filterInputClass}
              value={draftFilters.query}
              onChange={(e) => setDraftFilters({ ...draftFilters, query: e.target.value })}
            />
          </label>
          <label className="block min-w-0">
            <span className={filterLabelClass}>Operator</span>
            <input
              type="text"
              className={filterInputClass}
              value={draftFilters.operator}
              onChange={(e) => setDraftFilters({ ...draftFilters, operator: e.target.value })}
            />
          </label>
          <label className="block min-w-0">
            <span className={filterLabelClass}>Produkt</span>
            <input
              type="text"
              className={filterInputClass}
              value={draftFilters.product}
              onChange={(e) => setDraftFilters({ ...draftFilters, product: e.target.value })}
            />
          </label>
          <label className="block min-w-0">
            <span className={filterLabelClass}>Status</span>
            <select
              className={filterSelectClass}
              value={draftFilters.status}
              onChange={(e) => setDraftFilters({ ...draftFilters, status: e.target.value })}
            >
              <option value="">Wszystkie</option>
              <option value="completed">Ukończone</option>
            </select>
          </label>
          <label className="block min-w-0">
            <span className={filterLabelClass}>Od</span>
            <input
              type="date"
              className={filterInputClass}
              value={draftFilters.dateFrom}
              onChange={(e) => setDraftFilters({ ...draftFilters, dateFrom: e.target.value })}
            />
          </label>
          <label className="block min-w-0">
            <span className={filterLabelClass}>Do</span>
            <input
              type="date"
              className={filterInputClass}
              value={draftFilters.dateTo}
              onChange={(e) => setDraftFilters({ ...draftFilters, dateTo: e.target.value })}
            />
          </label>
        </div>
        <FilterActionsBar
          applyLabel="Filtruj"
          onApply={() => setAppliedFilters({ ...draftFilters })}
          onClear={() => {
            setDraftFilters(DEFAULT_PRODUCTION_HISTORY_FILTERS);
            setAppliedFilters(DEFAULT_PRODUCTION_HISTORY_FILTERS);
          }}
        />
      </ListFilterEmbeddedShell>

      {!loading ? (
        <PurchasingKpiGrid columns={4}>
          <PurchasingKpiCard title="Ukończone partie" value={kpis.completedBatches} tone="emerald" icon={<Package aria-hidden />} />
          <PurchasingKpiCard title="Wyprodukowane sztuki" value={kpis.units} tone="blue" icon={<TrendingUp aria-hidden />} />
          <PurchasingKpiCard
            title="Średni koszt"
            value={kpis.avgCost != null ? formatProductionMoney(kpis.avgCost) : "—"}
            tone="indigo"
            icon={<TrendingUp aria-hidden />}
          />
          <PurchasingKpiCard title="Średni czas realizacji" value="—" subtitle="Brak danych czasowych w API" tone="default" icon={<Clock aria-hidden />} />
        </PurchasingKpiGrid>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Wczytywanie…</p>
      ) : filtered.length === 0 ? (
        <AppEmptyState title="Brak historii" description="Zakończone zlecenia pojawią się tutaj po zamknięciu produkcji." />
      ) : (
        <div className={moduleTableCardClass}>
          <div className={moduleListTableScrollClass}>
            <table className={moduleListTableClass} style={{ minWidth: 900 }}>
              <thead className={moduleListTheadClass}>
                <tr>
                  <th className={moduleListThClass}>Dokument</th>
                  <th className={moduleListThClass}>Produkt</th>
                  <th className={`${moduleListThClass} text-right`}>Ilość</th>
                  <th className={moduleListThClass}>Status</th>
                  <th className={moduleListThClass}>Data zakończenia</th>
                  <th className={moduleListThClass}>Operator</th>
                  <th className={moduleListThClass}>Koszt jdn.</th>
                  <th className={productsListActionsThClass}>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.key} className="group border-b border-slate-100 hover:bg-slate-50/70">
                    <td className={`${moduleListTdClass} font-mono font-medium text-slate-900`}>
                      {r.number}
                      <span className="ml-2 text-[10px] uppercase text-slate-400">{r.kind === "batch" ? "partia" : "MO"}</span>
                    </td>
                    <td className={`${moduleListTdClass} max-w-[220px] truncate text-slate-700`}>{r.product}</td>
                    <td className={`${moduleListTdClass} text-right tabular-nums`}>{r.qty}</td>
                    <td className={moduleListTdClass}>
                      <span className={r.kind === "batch" ? batchStatusBadgeClass(r.status as never) : productionStatusBadgeClass(r.status as never)}>
                        {r.kind === "batch"
                          ? BATCH_STATUS_LABEL[r.status as keyof typeof BATCH_STATUS_LABEL]
                          : PRODUCTION_STATUS_LABEL[r.status as keyof typeof PRODUCTION_STATUS_LABEL]}
                      </span>
                    </td>
                    <td className={`${moduleListTdClass} text-slate-600`}>{r.completedAt}</td>
                    <td className={`${moduleListTdClass} text-slate-600`}>{r.operator}</td>
                    <td className={`${moduleListTdClass} tabular-nums text-slate-700`}>{r.unitCost}</td>
                    <td className={productsListActionsCellClass} onClick={(e) => e.stopPropagation()}>
                      <div className={productsListActionsInnerClass}>
                        <ProductionRowActionsMenu
                          ariaLabel={`Akcje ${r.number}`}
                          actions={[{ id: "open", label: "Otwórz", onClick: () => navigate(r.linkTo) }]}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
