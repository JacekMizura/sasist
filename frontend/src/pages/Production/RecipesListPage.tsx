import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, ChevronDown, Filter, Plus } from "lucide-react";
import toast from "react-hot-toast";

import { useWarehouse } from "../../context/WarehouseContext";
import {
  activateComposition,
  cloneComposition,
} from "../../api/compositionApi";
import {
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
  moduleListTableClass,
  moduleListTableScrollClass,
  moduleListTheadClass,
  moduleTableCardClass,
} from "../../components/listPage/moduleList";
import {
  DEFAULT_PRODUCTION_RECIPE_FILTERS,
  type ProductionRecipeListFilters,
} from "../../modules/production/productionListFilters";
import { formatProductionMoney, recipeStatusBadgeClass, recipeStatusLabel } from "./productionUi";
import { erpProductionPaths } from "./productionPaths";
import { ProductThumb } from "./components/ProductThumb";
import { ProductionRowIconActions } from "./components/ProductionRowIconActions";
import { RecipeIngredientsDrawer } from "./components/RecipeIngredientsDrawer";
import {
  productionModuleListTdClass,
  productionModuleListThClass,
  productionPageStackClass,
  productionPageTitleClass,
} from "./productionLayoutTokens";
import { PageHeader, SecondaryButton, primaryButtonClassName } from "@/design-system";

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
  const [ingredientsDrawerRecipe, setIngredientsDrawerRecipe] = useState<RecipeCardRead | null>(null);

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
      const cloned = await cloneComposition(tenantId, r.composition_id, `${r.version}-kopia`);
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
      await activateComposition(tenantId, r.composition_id, false);
      toast.success("Receptura zarchiwizowana.");
      void reload();
    } catch {
      toast.error("Nie udało się zarchiwizować receptury.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className={productionPageStackClass}>
      <PageHeader
        title={
          <h1 className={productionPageTitleClass}>
            Receptury
            {!loading ? (
              <span className="ml-2 text-base font-normal text-slate-500">
                {filtered.length} {filtered.length === 1 ? "wynik" : filtered.length < 5 ? "wyniki" : "wyników"}
              </span>
            ) : null}
          </h1>
        }
        actions={
          <>
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
            <Link to="/products/list" className={primaryButtonClassName()}>
              <span className="inline-flex items-center gap-1.5">
                <Plus className="h-4 w-4" aria-hidden />
                Dodaj recepturę
              </span>
            </Link>
          </>
        }
      >
        <div className="space-y-4">
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
            <p className="text-sm text-slate-500">Wczytywanie receptur…</p>
          ) : filtered.length === 0 ? (
            <AppEmptyState
              icon={BookOpen}
              title="Brak receptur"
              description="Utwórz recepturę na karcie produktu (zakładka Produkcja) lub użyj przycisku „Dodaj recepturę”."
            />
          ) : (
            <div className={moduleTableCardClass}>
              <div className={`${moduleListTableScrollClass} overflow-x-auto`}>
                <table className={`${moduleListTableClass} min-w-0 w-full table-fixed lg:table-auto`}>
                  <thead className={moduleListTheadClass}>
                    <tr>
                      <th className={productionModuleListThClass}>Produkt</th>
                      <th className={`${productionModuleListThClass} w-[10rem]`}>Receptura</th>
                      <th className={`${productionModuleListThClass} w-[4.5rem]`}>Wersja</th>
                      <th className={`${productionModuleListThClass} w-[5rem] text-right`}>Składniki</th>
                      <th className={`${productionModuleListThClass} w-[6.5rem] text-right`}>Koszt/szt.</th>
                      <th className={`${productionModuleListThClass} w-[6rem] text-right`}>Możliwe</th>
                      <th className={`${productionModuleListThClass} w-[7rem]`}>Status</th>
                      <th className={`${productionModuleListThClass} w-[9rem] text-right`}>Akcje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.composition_id} className="group border-b border-slate-100 hover:bg-slate-50/70">
                        <td className={productionModuleListTdClass}>
                          <div className="flex min-w-0 items-center gap-2.5">
                            <ProductThumb imageUrl={r.product_image_url} name={r.product_name} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-900">{r.product_name}</p>
                              {r.product_sku ? (
                                <p className="truncate font-mono text-xs text-slate-500">{r.product_sku}</p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className={`${productionModuleListTdClass} truncate text-slate-700`}>{r.recipe_name}</td>
                        <td className={productionModuleListTdClass}>
                          <span className="font-mono text-xs text-slate-600">v{r.version}</span>
                        </td>
                        <td className={`${productionModuleListTdClass} text-right`}>
                          <button
                            type="button"
                            className="font-semibold tabular-nums text-blue-600 hover:underline"
                            title="Pokaż składniki receptury"
                            onClick={() => setIngredientsDrawerRecipe(r)}
                          >
                            {r.component_count}
                          </button>
                        </td>
                        <td className={`${productionModuleListTdClass} text-right tabular-nums font-medium text-slate-900`}>
                          {formatProductionMoney(r.unit_cost_net)}
                        </td>
                        <td className={`${productionModuleListTdClass} text-right tabular-nums text-slate-700`}>
                          {Math.floor(r.max_producible)}
                        </td>
                        <td className={productionModuleListTdClass}>
                          <span className={recipeStatusBadgeClass(r)}>{recipeStatusLabel(r)}</span>
                        </td>
                        <td className={`${productionModuleListTdClass} text-right`} onClick={(e) => e.stopPropagation()}>
                          <ProductionRowIconActions
                            actions={[
                              {
                                id: "view",
                                label: "Podgląd",
                                icon: "view",
                                onClick: () => navigate(erpProductionPaths.recipe(r.composition_id)),
                              },
                              {
                                id: "edit",
                                label: "Edycja",
                                icon: "edit",
                                onClick: () => navigate(erpProductionPaths.recipe(r.composition_id)),
                              },
                              {
                                id: "dup",
                                label: "Duplikuj",
                                icon: "duplicate",
                                onClick: () => void handleDuplicate(r),
                                disabled: busyId === r.composition_id,
                              },
                              ...(r.is_active
                                ? [
                                    {
                                      id: "arch",
                                      label: "Archiwizuj",
                                      icon: "archive" as const,
                                      onClick: () => void handleArchive(r),
                                      disabled: busyId === r.composition_id,
                                      danger: true,
                                    },
                                  ]
                                : []),
                            ]}
                          />
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

      <RecipeIngredientsDrawer
        open={ingredientsDrawerRecipe != null}
        recipe={ingredientsDrawerRecipe}
        tenantId={tenantId}
        warehouseId={warehouseId}
        onClose={() => setIngredientsDrawerRecipe(null)}
      />
    </div>
  );
}
