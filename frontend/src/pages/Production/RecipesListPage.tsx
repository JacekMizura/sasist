import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, ChevronDown, Filter, Plus } from "lucide-react";
import toast from "react-hot-toast";

import { useWarehouse } from "../../context/WarehouseContext";
import {
  activateRecipe,
  cloneRecipe,
  listRecipeCards,
  type RecipeCardRead,
} from "../../api/productionApi";
import { AppEmptyState } from "../../components/app-shell";
import { filterToolbarBtnApply } from "../../components/filters/filterUiTokens";
import {
  FilterActionsBar,
  ListFilterEmbeddedShell,
  filterGridColsClass,
  filterInputClass,
  filterLabelClass,
  filterSelectClass,
} from "../../components/filters";
import { listSellasistToolbarToggleBtn } from "../../components/listPage/listSellasistTokens";
import {
  PurchasingTableHeader,
  PurchasingTableSection,
  purchasingTableTdClass,
} from "../../modules/purchasing/ui";
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
  productionListActionsCellClass,
} from "./productionRowActionTokens";

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
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {!loading ? (
            <>
              <span className="font-semibold tabular-nums text-slate-900">{filtered.length}</span>{" "}
              {filtered.length === 1 ? "wynik" : filtered.length < 5 ? "wyniki" : "wyników"}
            </>
          ) : (
            "Wczytywanie…"
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltersExpanded((v) => !v)}
            className={`${listSellasistToolbarToggleBtn} inline-flex !h-10 items-center gap-2`}
            aria-expanded={filtersExpanded}
          >
            <Filter className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            Filtry
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform ${filtersExpanded ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          <Link to="/products/list" className={filterToolbarBtnApply}>
            <Plus className="mr-1.5 inline h-4 w-4" strokeWidth={2} aria-hidden />
            Dodaj recepturę
          </Link>
        </div>
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
        <p className="text-sm text-slate-500">Wczytywanie receptur…</p>
      ) : filtered.length === 0 ? (
        <AppEmptyState
          icon={BookOpen}
          title="Brak receptur"
          description="Utwórz recepturę na karcie produktu (zakładka Produkcja) lub użyj przycisku „Dodaj recepturę”."
        />
      ) : (
        <PurchasingTableSection title="Receptury produkcyjne">
          <table className="w-full min-w-[960px] text-sm">
            <PurchasingTableHeader
              headers={[
                "Produkt",
                "Receptura",
                "Wersja",
                "Składniki",
                "Koszt/szt.",
                "Możliwa produkcja",
                "Status",
                "Akcje",
              ]}
              align={["left", "left", "left", "left", "right", "right", "left", "center"]}
            />
            <tbody>
              {filtered.map((r) => (
                <tr key={r.composition_id} className="group border-t border-slate-100 transition-colors hover:bg-slate-50/80">
                  <td className={purchasingTableTdClass}>
                    <div className="flex items-center gap-3">
                      <ProductThumb imageUrl={r.product_image_url} name={r.product_name} size="sm" />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{r.product_name}</p>
                        {r.product_sku ? <p className="text-xs text-slate-500">{r.product_sku}</p> : null}
                      </div>
                    </div>
                  </td>
                  <td className={`${purchasingTableTdClass} text-slate-700`}>{r.recipe_name}</td>
                  <td className={purchasingTableTdClass}>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-600">
                      v{r.version}
                    </span>
                  </td>
                  <td className={purchasingTableTdClass}>
                    <button
                      type="button"
                      className="font-semibold tabular-nums text-blue-600 hover:text-blue-700 hover:underline"
                      title="Pokaż składniki receptury"
                      onClick={() => setIngredientsDrawerRecipe(r)}
                    >
                      {r.component_count}
                    </button>
                  </td>
                  <td className={`${purchasingTableTdClass} text-right tabular-nums font-medium text-slate-900`}>
                    {formatProductionMoney(r.unit_cost_net)}
                  </td>
                  <td className={`${purchasingTableTdClass} text-right tabular-nums text-slate-700`}>
                    {Math.floor(r.max_producible)}
                  </td>
                  <td className={purchasingTableTdClass}>
                    <span className={recipeStatusBadgeClass(r)}>{recipeStatusLabel(r)}</span>
                  </td>
                  <td className={productionListActionsCellClass} onClick={(e) => e.stopPropagation()}>
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
        </PurchasingTableSection>
      )}

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
