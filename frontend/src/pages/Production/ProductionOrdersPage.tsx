import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, Filter, Plus } from "lucide-react";
import toast from "react-hot-toast";

import { useWarehouse } from "../../context/WarehouseContext";
import {
  listProductionBatches,
  listProductionOrders,
  type ProductionBatchRead,
  type ProductionOrderRead,
} from "../../api/productionApi";
import { AppEmptyState } from "../../components/app-shell";
import { filterToolbarBtnApply } from "../../components/filters/filterUiTokens";
import {
  ModuleListRowActionsCell,
  moduleListTableClass,
  moduleListTableScrollClass,
  moduleListTdClass,
  moduleListThClass,
  moduleListTheadClass,
  moduleTableCardClass,
} from "../../components/listPage/moduleList";
import { listSellasistToolbarToggleBtn } from "../../components/listPage/listSellasistTokens";
import {
  DEFAULT_PRODUCTION_ORDERS_FILTERS,
  countActiveProductionOrdersFilters,
  filterProductionOrderRows,
  productionBatchToRow,
  productionOrderToRow,
  productionOrdersFilterLabel,
  type ProductionOrdersListFilters,
} from "../../modules/production/productionListFilters";
import {
  BATCH_STATUS_LABEL,
  PRODUCTION_STATUS_LABEL,
  batchStatusBadgeClass,
  productionPriorityBadgeClass,
  productionPriorityLabel,
  productionStatusBadgeClass,
} from "./productionUi";
import { erpProductionPaths, wmsProductionPaths } from "./productionPaths";
import { ProductionOrdersFiltersPanel } from "./components/ProductionOrdersFiltersPanel";
import { ProductionRowActionsMenu } from "./components/ProductionRowActionsMenu";

const DEFAULT_TENANT = 1;

export default function ProductionOrdersPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [batches, setBatches] = useState<ProductionBatchRead[]>([]);
  const [orders, setOrders] = useState<ProductionOrderRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [draftFilters, setDraftFilters] = useState<ProductionOrdersListFilters>(DEFAULT_PRODUCTION_ORDERS_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ProductionOrdersListFilters>(DEFAULT_PRODUCTION_ORDERS_FILTERS);

  useEffect(() => {
    if (searchParams.get("shortages") === "1") {
      const next = { ...DEFAULT_PRODUCTION_ORDERS_FILTERS, shortagesOnly: true };
      setDraftFilters(next);
      setAppliedFilters(next);
    }
  }, [searchParams]);

  const reload = useCallback(async () => {
    if (warehouseId == null) return;
    setLoading(true);
    try {
      const [b, o] = await Promise.all([
        listProductionBatches(tenantId, { warehouse_id: warehouseId }),
        listProductionOrders(tenantId, { warehouse_id: warehouseId }),
      ]);
      setBatches(b.filter((x) => x.status !== "completed" && x.status !== "cancelled"));
      setOrders(o.filter((x) => x.status !== "completed" && x.status !== "cancelled"));
    } catch {
      setBatches([]);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rows = useMemo(() => {
    const all = [...batches.map(productionBatchToRow), ...orders.map(productionOrderToRow)];
    return filterProductionOrderRows(all, appliedFilters);
  }, [batches, orders, appliedFilters]);

  const releaseToWms = (row: (typeof rows)[number]) => {
    if (row.hasShortages) {
      toast.error("Nie można wydać do WMS — braki materiałów.");
      return;
    }
    toast.success(`Zlecenie ${row.number} dostępne w terminalu WMS → Zbieranie.`);
    window.open(wmsProductionPaths.collecting(), "_blank", "noopener,noreferrer");
  };

  if (warehouseId == null) {
    return <p className="py-8 text-sm text-slate-500">Wybierz magazyn, aby zarządzać zleceniami.</p>;
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Zlecenia produkcyjne
            {!loading ? <span className="ml-2 text-base font-normal text-slate-400">{rows.length} wyników</span> : null}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Wybrany filtr:{" "}
            <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-0.5 text-sm font-medium text-slate-800">
              {productionOrdersFilterLabel(appliedFilters)}
            </span>
          </p>
        </div>
        <Link to={erpProductionPaths.planning} className={filterToolbarBtnApply}>
          <Plus className="mr-1.5 inline h-4 w-4" strokeWidth={2} aria-hidden />
          Utwórz zlecenie
        </Link>
      </div>

      <div className="flex justify-end">
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

      <ProductionOrdersFiltersPanel
        expanded={filtersExpanded}
        draft={draftFilters}
        onChange={setDraftFilters}
        onApply={() => setAppliedFilters({ ...draftFilters })}
        onClear={() => {
          setDraftFilters(DEFAULT_PRODUCTION_ORDERS_FILTERS);
          setAppliedFilters(DEFAULT_PRODUCTION_ORDERS_FILTERS);
        }}
      />

      {loading ? (
        <p className="text-sm text-slate-500">Wczytywanie…</p>
      ) : rows.length === 0 ? (
        <AppEmptyState
          title="Brak zleceń"
          description="Utwórz zlecenie lub partię w planowaniu produkcji."
          action={
            <Link to={erpProductionPaths.planning} className="text-sm font-semibold text-amber-700 hover:underline">
              Przejdź do planowania
            </Link>
          }
        />
      ) : (
        <div className={moduleTableCardClass}>
          <div className={moduleListTableScrollClass}>
            <table className={moduleListTableClass} style={{ minWidth: 960 }}>
              <thead className={moduleListTheadClass}>
                <tr>
                  <th className={`${moduleListThClass} w-[120px] text-center`}>Akcje</th>
                  <th className={moduleListThClass}>Zlecenie</th>
                  <th className={moduleListThClass}>Produkt</th>
                  <th className={`${moduleListThClass} text-right`}>Ilość</th>
                  <th className={moduleListThClass}>Status</th>
                  <th className={moduleListThClass}>Data plan.</th>
                  <th className={moduleListThClass}>Operator</th>
                  <th className={moduleListThClass}>Priorytet</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.kind}-${r.id}`} className="group border-b border-slate-100 hover:bg-slate-50/70">
                    <ModuleListRowActionsCell ariaLabel={`Akcje ${r.number}`}>
                      <ProductionRowActionsMenu
                        ariaLabel={`Akcje ${r.number}`}
                        actions={[
                          {
                            id: "open",
                            label: "Otwórz",
                            onClick: () =>
                              navigate(r.kind === "batch" ? erpProductionPaths.batch(r.id) : erpProductionPaths.orders),
                          },
                          {
                            id: "edit",
                            label: "Edytuj",
                            onClick: () => navigate(r.kind === "batch" ? erpProductionPaths.batch(r.id) : erpProductionPaths.orders),
                          },
                          ...(r.kind === "batch" && (r.status === "planned" || r.status === "draft")
                            ? [
                                {
                                  id: "wms",
                                  label: "Wydaj do WMS",
                                  onClick: () => releaseToWms(r),
                                  disabled: r.hasShortages,
                                },
                              ]
                            : []),
                        ]}
                      />
                    </ModuleListRowActionsCell>
                    <td className={moduleListTdClass}>
                      <span className="font-mono font-medium text-slate-900">{r.number}</span>
                      <span className="ml-2 text-[10px] uppercase text-slate-400">{r.kind === "batch" ? "partia" : "MO"}</span>
                    </td>
                    <td className={`${moduleListTdClass} max-w-[220px] truncate`}>{r.product}</td>
                    <td className={`${moduleListTdClass} text-right tabular-nums`}>{r.qty}</td>
                    <td className={moduleListTdClass}>
                      <span className={r.kind === "batch" ? batchStatusBadgeClass(r.status as never) : productionStatusBadgeClass(r.status as never)}>
                        {r.kind === "batch"
                          ? BATCH_STATUS_LABEL[r.status as keyof typeof BATCH_STATUS_LABEL]
                          : PRODUCTION_STATUS_LABEL[r.status as keyof typeof PRODUCTION_STATUS_LABEL]}
                      </span>
                    </td>
                    <td className={`${moduleListTdClass} text-slate-600`}>{r.date}</td>
                    <td className={`${moduleListTdClass} text-slate-600`}>{r.operator}</td>
                    <td className={moduleListTdClass}>
                      <span className={productionPriorityBadgeClass(r.priority, r.hasShortages, r.numericPriority)}>
                        {productionPriorityLabel(r.priority, r.hasShortages, r.numericPriority)}
                      </span>
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
