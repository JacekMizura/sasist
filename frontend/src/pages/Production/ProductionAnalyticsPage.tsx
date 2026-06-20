import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Banknote,
  ChevronDown,
  Filter,
  Package,
  Percent,
  TrendingUp,
} from "lucide-react";

import { useWarehouse } from "../../context/WarehouseContext";
import { fetchProductionDashboard, listRecipeCards, type RecipeCardRead } from "../../api/productionApi";
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
  ModuleListRowActionsCell,
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
  DEFAULT_PRODUCTION_ANALYTICS_FILTERS,
  type ProductionAnalyticsFilters,
} from "../../modules/production/productionListFilters";
import { formatProductionMoney, recipeStatusBadgeClass, recipeStatusLabel } from "./productionUi";
import { erpProductionPaths } from "./productionPaths";
import { ProductThumb } from "./components/ProductThumb";
import { ProductionRowActionsMenu } from "./components/ProductionRowActionsMenu";

const DEFAULT_TENANT = 1;

export default function ProductionAnalyticsPage() {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [recipes, setRecipes] = useState<RecipeCardRead[]>([]);
  const [efficiency, setEfficiency] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [draftFilters, setDraftFilters] = useState<ProductionAnalyticsFilters>(DEFAULT_PRODUCTION_ANALYTICS_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ProductionAnalyticsFilters>(DEFAULT_PRODUCTION_ANALYTICS_FILTERS);

  const reload = useCallback(async () => {
    if (warehouseId == null) return;
    setLoading(true);
    try {
      const [cards, dash] = await Promise.all([
        listRecipeCards(tenantId, warehouseId),
        fetchProductionDashboard(tenantId, warehouseId),
      ]);
      setRecipes(cards);
      setEfficiency(dash.production_efficiency_percent);
    } catch {
      setRecipes([]);
      setEfficiency(null);
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

  const avgCost =
    recipes.filter((r) => r.unit_cost_net != null).length > 0
      ? recipes.reduce((s, r) => s + (r.unit_cost_net ?? 0), 0) / recipes.filter((r) => r.unit_cost_net != null).length
      : 0;
  const lowStockCount = recipes.filter((r) => r.has_low_stock).length;
  const activeCount = recipes.filter((r) => r.is_active).length;
  const totalProducible = recipes.reduce((s, r) => s + Math.floor(r.max_producible), 0);
  const materialCostSum = recipes.reduce((s, r) => s + (r.unit_cost_net ?? 0) * Math.max(0, r.current_stock), 0);

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
    <div className="space-y-6 pb-10">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Analiza kosztów produkcji</h2>
        <p className="mt-1 text-sm text-slate-500">Koszty receptur, marże i dostępność składników — widok zarządczy.</p>
      </div>

      {!loading ? (
        <PurchasingKpiGrid columns={3}>
          <PurchasingKpiCard title="Aktywne receptury" value={activeCount} tone="indigo" icon={<Package aria-hidden />} />
          <PurchasingKpiCard
            title="Średni koszt produktu"
            value={avgCost > 0 ? formatProductionMoney(avgCost) : "—"}
            tone="blue"
            icon={<Banknote aria-hidden />}
          />
          <PurchasingKpiCard
            title="Receptury z brakami"
            value={lowStockCount}
            tone={lowStockCount > 0 ? "amber" : "emerald"}
            icon={<AlertTriangle aria-hidden />}
          />
          <PurchasingKpiCard title="Możliwa produkcja" value={totalProducible} subtitle="Σ max. wyprodukowalność" tone="emerald" icon={<TrendingUp aria-hidden />} />
          <PurchasingKpiCard title="Średnia marża" value="—" subtitle="Wymaga danych cen sprzedaży" tone="purple" icon={<Percent aria-hidden />} />
          <PurchasingKpiCard
            title="Koszt materiałów"
            value={materialCostSum > 0 ? formatProductionMoney(materialCostSum) : "—"}
            subtitle="Szacunek na stanie WG"
            tone="default"
            icon={<Banknote aria-hidden />}
          />
          {efficiency != null ? (
            <PurchasingKpiCard title="Efektywność produkcji" value={`${efficiency}%`} tone="blue" icon={<Percent aria-hidden />} />
          ) : null}
        </PurchasingKpiGrid>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-sm text-slate-500">
          Wyniki: <span className="font-medium text-slate-800">{filtered.length}</span>
        </p>
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
        <AppEmptyState title="Brak danych" description="Brak receptur do analizy kosztów." />
      ) : (
        <div className={moduleTableCardClass}>
          <div className={moduleListTableScrollClass}>
            <table className={moduleListTableClass} style={{ minWidth: 980 }}>
              <thead className={moduleListTheadClass}>
                <tr>
                  <th className={`${moduleListThClass} w-[120px] text-center`}>Akcje</th>
                  <th className={moduleListThClass}>
                    <button type="button" className="font-semibold hover:text-amber-700" onClick={() => toggleSort("product")}>
                      Produkt
                    </button>
                  </th>
                  <th className={moduleListThClass}>Receptura</th>
                  <th className={moduleListThClass}>
                    <button type="button" className="font-semibold hover:text-amber-700" onClick={() => toggleSort("cost")}>
                      Koszt jednostkowy
                    </button>
                  </th>
                  <th className={moduleListThClass}>Dostępność materiałów</th>
                  <th className={moduleListThClass}>
                    <button type="button" className="font-semibold hover:text-amber-700" onClick={() => toggleSort("producible")}>
                      Możliwa produkcja
                    </button>
                  </th>
                  <th className={moduleListThClass}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.composition_id} className="group border-b border-slate-100 hover:bg-slate-50/70">
                    <ModuleListRowActionsCell ariaLabel={`Akcje ${r.product_name}`}>
                      <ProductionRowActionsMenu
                        ariaLabel={`Akcje ${r.product_name}`}
                        actions={[
                          { id: "view", label: "Podgląd", onClick: () => navigate(erpProductionPaths.recipe(r.composition_id)) },
                          { id: "edit", label: "Edytuj", onClick: () => navigate(erpProductionPaths.recipe(r.composition_id)) },
                        ]}
                      />
                    </ModuleListRowActionsCell>
                    <td className={moduleListTdClass}>
                      <div className="flex items-center gap-3">
                        <ProductThumb imageUrl={r.product_image_url} name={r.product_name} size="sm" />
                        <div>
                          <p className="font-medium text-slate-900">{r.product_name}</p>
                          {r.product_sku ? <p className="text-xs text-slate-400">{r.product_sku}</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className={`${moduleListTdClass} text-slate-700`}>{r.recipe_name}</td>
                    <td className={`${moduleListTdClass} tabular-nums font-medium text-slate-900`}>
                      {formatProductionMoney(r.unit_cost_net)}
                    </td>
                    <td className={`${moduleListTdClass} tabular-nums text-slate-600`}>{r.current_stock} szt. WG</td>
                    <td className={`${moduleListTdClass} tabular-nums font-medium text-slate-800`}>{Math.floor(r.max_producible)}</td>
                    <td className={moduleListTdClass}>
                      <span className={recipeStatusBadgeClass(r)}>{recipeStatusLabel(r)}</span>
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
