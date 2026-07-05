import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, ClipboardList, Filter, Plus } from "lucide-react";
import toast from "react-hot-toast";

import { useWarehouse } from "../../context/WarehouseContext";
import {
  buildProductionOrdersListViewAdapter,
  listViewActionsFromHook,
  useListViewState,
} from "../../preferences/listView";
import {
  listProductionBatches,
  listProductionOrders,
  releaseBatchToWms,
  releaseOrderToWms,
  type ProductionBatchRead,
  type ProductionOrderRead,
} from "../../api/productionApi";
import { AppEmptyState } from "../../components/app-shell";
import { filterToolbarBtnApply } from "../../components/filters/filterUiTokens";
import {
  productsListActionsCellClass,
  productsListActionsInnerClass,
  productsListActionsThClass,
} from "../../components/products/productList/productsListTableTokens";
import {
  moduleListTableClass,
  moduleListTableScrollClass,
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
import {
  productionModuleListTdClass,
  productionModuleListThClass,
  productionPageDescClass,
  productionPageStackClass,
  productionPageTitleClass,
} from "./productionLayoutTokens";

const DEFAULT_TENANT = 1;

export default function ProductionOrdersPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const listViewAdapter = useMemo(() => buildProductionOrdersListViewAdapter(tenantId), [tenantId]);
  const listView = useListViewState(listViewAdapter);
  const listViewActions = useMemo(() => listViewActionsFromHook(listView), [listView]);
  const {
    isHydrated,
    draftFilters,
    setDraftFilters,
    appliedFilters,
    applyFilters,
    clearFilters,
    filtersExpanded,
    toggleFiltersPanel,
    setExtension,
    setAppliedFilters,
  } = listView;
  const [batches, setBatches] = useState<ProductionBatchRead[]>([]);
  const [orders, setOrders] = useState<ProductionOrderRead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (warehouseId != null) setExtension("warehouseId", warehouseId);
  }, [setExtension, warehouseId]);

  useEffect(() => {
    if (!isHydrated) return;
    if (searchParams.get("shortages") === "1") {
      const next = { ...DEFAULT_PRODUCTION_ORDERS_FILTERS, shortagesOnly: true };
      setDraftFilters(next);
      setAppliedFilters(next);
    }
  }, [isHydrated, searchParams, setAppliedFilters, setDraftFilters]);

  const reload = useCallback(async () => {
    if (warehouseId == null || !isHydrated) return;
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
  }, [isHydrated, tenantId, warehouseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rows = useMemo(() => {
    const all = [...batches.map(productionBatchToRow), ...orders.map(productionOrderToRow)];
    return filterProductionOrderRows(all, appliedFilters);
  }, [batches, orders, appliedFilters]);

  const releaseToWms = async (row: (typeof rows)[number]) => {
    if (row.hasShortages) {
      toast.error("Nie można wydać do WMS — braki materiałów.");
      return;
    }
    if (row.isReleasedToWms) {
      toast.success(`${row.kind === "batch" ? "Partia" : "Zlecenie"} ${row.number} jest już w kolejce WMS.`);
      window.open(wmsProductionPaths.collecting(), "_blank", "noopener,noreferrer");
      return;
    }
    if (warehouseId == null) return;
    try {
      if (row.kind === "batch") {
        await releaseBatchToWms(tenantId, row.id, warehouseId);
        toast.success(`Partia ${row.number} wydana do terminalu WMS.`);
      } else {
        await releaseOrderToWms(tenantId, row.id, warehouseId);
        toast.success(`Zlecenie ${row.number} wydane do terminalu WMS.`);
      }
      await reload();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? String((e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail ?? "Wydanie nie powiodło się.")
          : e instanceof Error
            ? e.message
            : "Wydanie do WMS nie powiodło się.";
      toast.error(typeof msg === "string" ? msg : "Wydanie do WMS nie powiodło się.");
    }
  };

  if (warehouseId == null) {
    return <p className="py-8 text-sm text-slate-500">Wybierz magazyn, aby zarządzać zleceniami.</p>;
  }

  return (
    <div className={productionPageStackClass}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className={productionPageTitleClass}>
            Zlecenia produkcyjne
            {!loading ? <span className="ml-2 text-base font-normal text-slate-400">{rows.length} wyników</span> : null}
          </h2>
          <p className={productionPageDescClass}>
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
          onClick={toggleFiltersPanel}
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
        onApply={applyFilters}
        onClear={clearFilters}
        listView={listViewActions}
      />

      {loading ? (
        <p className="text-sm text-slate-500">Wczytywanie…</p>
      ) : rows.length === 0 ? (
        <AppEmptyState
          icon={ClipboardList}
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
                  <th className={productionModuleListThClass}>Zlecenie</th>
                  <th className={productionModuleListThClass}>Produkt</th>
                  <th className={`${productionModuleListThClass} text-right`}>Ilość</th>
                  <th className={productionModuleListThClass}>Status</th>
                  <th className={productionModuleListThClass}>Data plan.</th>
                  <th className={productionModuleListThClass}>Operator</th>
                  <th className={productionModuleListThClass}>Priorytet</th>
                  <th className={productsListActionsThClass}>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.kind}-${r.id}`} className="group border-b border-slate-100 hover:bg-slate-50/70">
                    <td className={productionModuleListTdClass}>
                      <span className="font-mono font-medium text-slate-900">{r.number}</span>
                      <span className="ml-2 text-[10px] uppercase text-slate-400">{r.kind === "batch" ? "partia" : "MO"}</span>
                    </td>
                    <td className={`${productionModuleListTdClass} max-w-[220px] truncate`}>{r.product}</td>
                    <td className={`${productionModuleListTdClass} text-right tabular-nums`}>{r.qty}</td>
                    <td className={productionModuleListTdClass}>
                      <span className={r.kind === "batch" ? batchStatusBadgeClass(r.status as never) : productionStatusBadgeClass(r.status as never)}>
                        {r.kind === "batch"
                          ? BATCH_STATUS_LABEL[r.status as keyof typeof BATCH_STATUS_LABEL]
                          : PRODUCTION_STATUS_LABEL[r.status as keyof typeof PRODUCTION_STATUS_LABEL]}
                      </span>
                    </td>
                    <td className={`${productionModuleListTdClass} text-slate-600`}>{r.date}</td>
                    <td className={`${productionModuleListTdClass} text-slate-600`}>{r.operator}</td>
                    <td className={productionModuleListTdClass}>
                      <span className={productionPriorityBadgeClass(r.priority, r.hasShortages, r.numericPriority)}>
                        {productionPriorityLabel(r.priority, r.hasShortages, r.numericPriority)}
                      </span>
                    </td>
                    <td className={productsListActionsCellClass} onClick={(e) => e.stopPropagation()}>
                      <div className={productsListActionsInnerClass}>
                        <ProductionRowActionsMenu
                          ariaLabel={`Akcje ${r.number}`}
                          actions={[
                            {
                              id: "open",
                              label: "Otwórz",
                              onClick: () =>
                                navigate(
                                  r.kind === "batch" ? erpProductionPaths.batch(r.id) : erpProductionPaths.order(r.id),
                                ),
                            },
                            {
                              id: "edit",
                              label: "Edytuj",
                              onClick: () =>
                                navigate(
                                  r.kind === "batch" ? erpProductionPaths.batch(r.id) : erpProductionPaths.order(r.id),
                                ),
                            },
                            ...(r.kind === "batch" && (r.status === "planned" || r.status === "draft")
                              ? [
                                  {
                                    id: "wms",
                                    label: r.isReleasedToWms ? "Otwórz WMS" : "Wydaj do WMS",
                                    onClick: () => void releaseToWms(r),
                                    disabled: r.hasShortages,
                                  },
                                ]
                              : []),
                            ...(r.kind === "order" && (r.status === "planned" || r.status === "draft")
                              ? [
                                  {
                                    id: "wms",
                                    label: r.isReleasedToWms ? "Otwórz WMS" : "Wydaj do WMS",
                                    onClick: () => void releaseToWms(r),
                                    disabled: r.hasShortages,
                                  },
                                ]
                              : []),
                          ]}
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
