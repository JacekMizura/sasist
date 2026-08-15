import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Banknote,
  ChevronDown,
  Filter,
  Package,
  TrendingUp,
} from "lucide-react";

import { useWarehouse } from "../../context/WarehouseContext";
import { fetchProductionAnalyticsSummary, listRecipeCards, type RecipeCardRead, type ProductionAnalyticsSummaryRead } from "../../api/productionApi";
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
  moduleListTableClass,
  moduleListTableScrollClass,
  moduleListTheadClass,
  moduleTableCardClass,
} from "../../components/listPage/moduleList";
import { ProductionKpiCard } from "./components/ProductionKpiCard";
import { ProductionKpiGrid } from "./components/ProductionKpiGrid";
import {
  DEFAULT_PRODUCTION_ANALYTICS_FILTERS,
  type ProductionAnalyticsFilters,
} from "../../modules/production/productionListFilters";
import { formatProductionMoney, recipeStatusBadgeClass, recipeStatusLabel } from "./productionUi";
import { erpProductionPaths } from "./productionPaths";
import { ProductThumb } from "./components/ProductThumb";
import { ProductionRowActionsMenu } from "./components/ProductionRowActionsMenu";
import {
  productionModuleListTdClass,
  productionModuleListThClass,
  productionPageStackClass,
  productionPageTitleClass,
} from "./productionLayoutTokens";
import { PageHeader, SecondaryButton } from "@/design-system";

const DEFAULT_TENANT = 1;

export default function ProductionAnalyticsPage() {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [recipes, setRecipes] = useState<RecipeCardRead[]>([]);
  const [summary, setSummary] = useState<ProductionAnalyticsSummaryRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [draftFilters, setDraftFilters] = useState<ProductionAnalyticsFilters>(DEFAULT_PRODUCTION_ANALYTICS_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ProductionAnalyticsFilters>(DEFAULT_PRODUCTION_ANALYTICS_FILTERS);

  const reload = useCallback(async () => {
    if (warehouseId == null) return;
    setLoading(true);
    try {
      const [cards, analyticsSummary] = await Promise.all([
        listRecipeCards(tenantId, warehouseId),
        fetchProductionAnalyticsSummary(tenantId, warehouseId),
      ]);
      setRecipes(cards);
      setSummary(analyticsSummary);
    } catch {
      setRecipes([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = useMemo(() => {
    let list = recipes;
    const f = appliedFilters;
    if (f.status === "active") list = list.filter((r) => r.is_active);
    if (f.status === "shortages") list = list.filter((r) => r.has_low_stock || r.status_badge === "LOW_STOCK");
    const q = f.query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.product_name.toLowerCase().includes(q) ||
          r.recipe_name.toLowerCase().includes(q) ||
          (r.product_sku ?? "").toLowerCase().includes(q),
      );
    }
    const dir = f.sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (f.sortKey === "product") return dir * a.product_name.localeCompare(b.product_name, "pl");
      if (f.sortKey === "producible") return dir * ((a.max_producible ?? 0) - (b.max_producible ?? 0));
      return dir * ((a.unit_cost_net ?? 0) - (b.unit_cost_net ?? 0));
    });
  }, [recipes, appliedFilters]);

  const kpi = summary ?? {
    avg_unit_cost: 0,
    low_stock_count: 0,
    active_count: 0,
    total_producible: 0,
    material_cost_sum: 0,
  };

  const costKpis = [
    kpi.avg_unit_cost > 0
      ? {
          key: "avg",
          title: "Średni koszt produktu",
          value: formatProductionMoney(kpi.avg_unit_cost) as string | number,
          subtitle: undefined as string | undefined,
          tone: "blue" as const,
          icon: <Banknote aria-hidden />,
        }
      : null,
    kpi.material_cost_sum > 0
      ? {
          key: "material",
          title: "Koszt materiałów (stan WG)",
          value: formatProductionMoney(kpi.material_cost_sum) as string | number,
          subtitle: "Wycena stanu × koszt receptury",
          tone: "default" as const,
          icon: <Banknote aria-hidden />,
        }
      : null,
    {
      key: "active",
      title: "Aktywne receptury",
      value: kpi.active_count as string | number,
      subtitle: undefined as string | undefined,
      tone: "indigo" as const,
      icon: <Package aria-hidden />,
    },
    kpi.low_stock_count > 0
      ? {
          key: "low",
          title: "Receptury z brakami",
          value: kpi.low_stock_count as string | number,
          subtitle: undefined as string | undefined,
          tone: "amber" as const,
          icon: <AlertTriangle aria-hidden />,
        }
      : null,
  ].filter((c): c is NonNullable<typeof c> => c != null);

  const toggleSort = (key: ProductionAnalyticsFilters["sortKey"]) => {
    setDraftFilters((prev) => ({
      ...prev,
      sortKey: key,
      sortDir: prev.sortKey === key && prev.sortDir === "desc" ? "asc" : "desc",
    }));
    setAppliedFilters((prev) => ({
      ...prev,
      sortKey: key,
      sortDir: prev.sortKey === key && prev.sortDir === "desc" ? "asc" : "desc",
    }));
  };

  if (warehouseId == null) {
    return <p className="py-8 text-sm text-slate-500">Wybierz magazyn, aby analizować koszty produkcji.</p>;
  }

  return (
    <div className={productionPageStackClass}>
      <PageHeader
        title={<h1 className={productionPageTitleClass}>Analiza kosztów</h1>}
        actions={
          <SecondaryButton
            type="button"
            onClick={() => setFiltersExpanded((v) => !v)}
            aria-expanded={filtersExpanded}
            className="inline-flex items-center gap-1.5"
          >
            <Filter className="h-4 w-4" aria-hidden />
            Filtry
            <ChevronDown
              className={`h-4 w-4 transition-transform ${filtersExpanded ? "rotate-180" : ""}`}
              aria-hidden
            />
          </SecondaryButton>
        }
      >
        <div className="space-y-4">
      {!loading && costKpis.length > 0 ? (
        <ProductionKpiGrid className="!gap-2">
          {costKpis.map((card) => (
            <ProductionKpiCard
              key={card.key}
              title={card.title}
              value={card.value}
              subtitle={card.subtitle}
              tone={card.tone}
              icon={card.icon}
            />
          ))}
        </ProductionKpiGrid>
      ) : null}

      <ListFilterEmbeddedShell expanded={filtersExpanded}>
        <div className={filterGridColsClass}>
          <label className="block min-w-0 sm:col-span-2">
            <span className={filterLabelClass}>Szukaj</span>
            <input
              type="search"
              className={filterInputClass}
              value={draftFilters.query}
              onChange={(e) => setDraftFilters({ ...draftFilters, query: e.target.value })}
            />
          </label>
          <label className="block min-w-0">
            <span className={filterLabelClass}>Status</span>
            <select
              className={filterSelectClass}
              value={draftFilters.status}
              onChange={(e) =>
                setDraftFilters({ ...draftFilters, status: e.target.value as ProductionAnalyticsFilters["status"] })
              }
            >
              <option value="">Wszystkie</option>
              <option value="active">Aktywne</option>
              <option value="shortages">Z brakami</option>
            </select>
          </label>
        </div>
        <FilterActionsBar
          applyLabel="Filtruj"
          onApply={() => setAppliedFilters({ ...draftFilters })}
          onClear={() => {
            setDraftFilters(DEFAULT_PRODUCTION_ANALYTICS_FILTERS);
            setAppliedFilters(DEFAULT_PRODUCTION_ANALYTICS_FILTERS);
          }}
        />
      </ListFilterEmbeddedShell>

      {loading ? (
        <p className="text-sm text-slate-500">Wczytywanie…</p>
      ) : filtered.length === 0 ? (
        <AppEmptyState icon={TrendingUp} title="Brak danych" description="Brak receptur do analizy kosztów." />
      ) : (
        <div className={moduleTableCardClass}>
          <div className={`${moduleListTableScrollClass} overflow-x-auto`}>
            <table className={`${moduleListTableClass} min-w-0 w-full`}>
              <thead className={moduleListTheadClass}>
                <tr>
                  <th className={`${productionModuleListThClass} min-w-[14rem]`}>
                    <button type="button" className="font-semibold hover:text-amber-700" onClick={() => toggleSort("product")}>
                      Produkt
                    </button>
                  </th>
                  <th className={`${productionModuleListThClass} min-w-[10rem]`}>Receptura</th>
                  <th className={`${productionModuleListThClass} w-[7.5rem]`}>
                    <button type="button" className="font-semibold hover:text-amber-700" onClick={() => toggleSort("cost")}>
                      Koszt / szt.
                    </button>
                  </th>
                  <th className={`${productionModuleListThClass} w-[6.5rem] text-right`}>
                    <button type="button" className="font-semibold hover:text-amber-700" onClick={() => toggleSort("producible")}>
                      Możliwe
                    </button>
                  </th>
                  <th className={`${productionModuleListThClass} w-[9.5rem]`}>Status</th>
                  <th className={`${productionModuleListThClass} w-[9rem] text-right`}>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.composition_id} className="group border-b border-slate-100 hover:bg-slate-50/70">
                    <td className={productionModuleListTdClass}>
                      <div className="flex min-w-0 items-center gap-2">
                        <ProductThumb imageUrl={r.product_image_url} name={r.product_name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{r.product_name}</p>
                          {r.product_sku ? <p className="truncate text-xs text-slate-500">{r.product_sku}</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className={`${productionModuleListTdClass} truncate text-slate-700`}>{r.recipe_name}</td>
                    <td className={`${productionModuleListTdClass} tabular-nums font-medium text-slate-900`}>
                      {formatProductionMoney(r.unit_cost_net)}
                    </td>
                    <td className={`${productionModuleListTdClass} text-right tabular-nums font-medium text-slate-800`}>
                      {Math.floor(r.max_producible)}
                    </td>
                    <td className={productionModuleListTdClass}>
                      <span className={recipeStatusBadgeClass(r)}>{recipeStatusLabel(r)}</span>
                    </td>
                    <td className={`${productionModuleListTdClass} text-right`} onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <SecondaryButton
                          type="button"
                          density="compact"
                          onClick={() => navigate(erpProductionPaths.recipe(r.composition_id))}
                        >
                          Podgląd
                        </SecondaryButton>
                        <ProductionRowActionsMenu
                          ariaLabel={`Akcje ${r.product_name}`}
                          align="end"
                          actions={[
                            {
                              id: "edit",
                              label: "Edytuj",
                              onClick: () => navigate(erpProductionPaths.recipe(r.composition_id)),
                            },
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
      </PageHeader>
    </div>
  );
}
