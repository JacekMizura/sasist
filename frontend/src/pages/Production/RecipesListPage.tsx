import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Filter } from "lucide-react";
import toast from "react-hot-toast";

import { useWarehouse } from "../../context/WarehouseContext";
import {
  activateRecipe,
  cloneRecipe,
  listRecipeCards,
  type RecipeCardRead,
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
import {
  DEFAULT_PRODUCTION_RECIPE_FILTERS,
  type ProductionRecipeListFilters,
} from "../../modules/production/productionListFilters";
import { formatProductionMoney, recipeStatusBadgeClass, recipeStatusLabel } from "./productionUi";
import { erpProductionPaths } from "./productionPaths";
import { ProductThumb } from "./components/ProductThumb";
import { ProductionRowActionsMenu } from "./components/ProductionRowActionsMenu";

const DEFAULT_TENANT = 1;

export default function RecipesListPage() {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [recipes, setRecipes] = useState<RecipeCardRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [draftFilters, setDraftFilters] = useState<ProductionRecipeListFilters>(DEFAULT_PRODUCTION_RECIPE_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ProductionRecipeListFilters>(DEFAULT_PRODUCTION_RECIPE_FILTERS);
  const [busyId, setBusyId] = useState<number | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRecipes(await listRecipeCards(tenantId, warehouseId));
    } catch {
      setRecipes([]);
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
    if (f.status === "archived") list = list.filter((r) => !r.is_active);
    if (f.status === "shortages") list = list.filter((r) => r.has_low_stock);
    const q = f.query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.product_name.toLowerCase().includes(q) ||
          r.recipe_name.toLowerCase().includes(q) ||
          (r.product_sku ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [recipes, appliedFilters]);

  const handleDuplicate = async (r: RecipeCardRead) => {
    setBusyId(r.composition_id);
    try {
      const cloned = await cloneRecipe(tenantId, r.composition_id, `${r.version}-kopia`);
      toast.success("Zduplikowano recepturę.");
      navigate(erpProductionPaths.recipe(cloned.id));
    } catch {
      toast.error("Nie udało się zduplikować receptury.");
    } finally {
      setBusyId(null);
    }
  };

  const handleArchive = async (r: RecipeCardRead) => {
    setBusyId(r.composition_id);
    try {
      await activateRecipe(tenantId, r.composition_id, false);
      toast.success("Receptura zarchiwizowana.");
      void reload();
    } catch {
      toast.error("Nie udało się zarchiwizować receptury.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Receptury produkcyjne
            {!loading ? <span className="ml-2 text-base font-normal text-slate-400">{filtered.length} wyników</span> : null}
          </h2>
          <p className="mt-1 text-sm text-slate-500">Zarządzanie wersjami, składnikami i kosztami.</p>
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
          <label className="block min-w-0 sm:col-span-2">
            <span className={filterLabelClass}>Szukaj</span>
            <input
              type="search"
              className={filterInputClass}
              placeholder="Produkt, receptura, SKU…"
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
                setDraftFilters({ ...draftFilters, status: e.target.value as ProductionRecipeListFilters["status"] })
              }
            >
              <option value="">Wszystkie</option>
              <option value="active">Aktywne</option>
              <option value="archived">Archiwum</option>
              <option value="shortages">Z brakami</option>
            </select>
          </label>
        </div>
        <FilterActionsBar
          applyLabel="Filtruj"
          onApply={() => setAppliedFilters({ ...draftFilters })}
          onClear={() => {
            setDraftFilters(DEFAULT_PRODUCTION_RECIPE_FILTERS);
            setAppliedFilters(DEFAULT_PRODUCTION_RECIPE_FILTERS);
          }}
        />
      </ListFilterEmbeddedShell>

      {loading ? (
        <p className="text-sm text-slate-500">Wczytywanie…</p>
      ) : filtered.length === 0 ? (
        <AppEmptyState title="Brak receptur" description="Utwórz recepturę na karcie produktu (zakładka Produkcja)." />
      ) : (
        <div className={moduleTableCardClass}>
          <div className={moduleListTableScrollClass}>
            <table className={moduleListTableClass} style={{ minWidth: 960 }}>
              <thead className={moduleListTheadClass}>
                <tr>
                  <th className={moduleListThClass}>Produkt</th>
                  <th className={moduleListThClass}>Receptura</th>
                  <th className={moduleListThClass}>Wersja</th>
                  <th className={moduleListThClass}>Składniki</th>
                  <th className={moduleListThClass}>Koszt/szt.</th>
                  <th className={moduleListThClass}>Można wyproduk.</th>
                  <th className={moduleListThClass}>Status</th>
                  <th className={productsListActionsThClass}>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.composition_id} className="group border-b border-slate-100 hover:bg-slate-50/70">
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
                    <td className={moduleListTdClass}>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-600">
                        v{r.version}
                      </span>
                    </td>
                    <td className={`${moduleListTdClass} tabular-nums text-slate-600`}>{r.component_count}</td>
                    <td className={`${moduleListTdClass} tabular-nums font-medium text-slate-900`}>
                      {formatProductionMoney(r.unit_cost_net)}
                    </td>
                    <td className={`${moduleListTdClass} tabular-nums text-slate-700`}>{Math.floor(r.max_producible)}</td>
                    <td className={moduleListTdClass}>
                      <span className={recipeStatusBadgeClass(r)}>{recipeStatusLabel(r)}</span>
                    </td>
                    <td className={productsListActionsCellClass} onClick={(e) => e.stopPropagation()}>
                      <div className={productsListActionsInnerClass}>
                        <ProductionRowActionsMenu
                          ariaLabel={`Akcje ${r.recipe_name}`}
                          actions={[
                            { id: "view", label: "Podgląd", onClick: () => navigate(erpProductionPaths.recipe(r.composition_id)) },
                            { id: "edit", label: "Edytuj", onClick: () => navigate(erpProductionPaths.recipe(r.composition_id)) },
                            {
                              id: "dup",
                              label: "Duplikuj",
                              onClick: () => void handleDuplicate(r),
                              disabled: busyId === r.composition_id,
                            },
                            ...(r.is_active
                              ? [
                                  {
                                    id: "arch",
                                    label: "Archiwizuj",
                                    onClick: () => void handleArchive(r),
                                    disabled: busyId === r.composition_id,
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
