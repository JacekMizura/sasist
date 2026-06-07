import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useWarehouse } from "../../context/WarehouseContext";
import { listRecipeCards, type RecipeCardRead } from "../../api/productionApi";
import { formatProductionMoney } from "./productionUi";
import { ProductThumb } from "./components/ProductThumb";

const DEFAULT_TENANT = 1;

function badgeClass(badge: string): string {
  if (badge === "ACTIVE") return "bg-emerald-100 text-emerald-800";
  if (badge === "LOW_STOCK") return "bg-amber-100 text-amber-900";
  return "bg-slate-100 text-slate-600";
}

export default function RecipesListPage() {
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [recipes, setRecipes] = useState<RecipeCardRead[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="px-4 py-6 lg:px-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Receptury produkcyjne</h1>
          <p className="text-sm text-slate-500">Produkty z kompozycją produkcyjną — bez typów produktu, tylko relacje.</p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Wczytywanie…</p>
      ) : recipes.length === 0 ? (
        <p className="text-sm text-slate-500">Brak receptur. Dodaj kompozycję „Produkcja” na karcie produktu (Kompozycje).</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {recipes.map((r) => (
            <Link
              key={r.composition_id}
              to={`/production/recipes/${r.composition_id}`}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-violet-300 hover:shadow-md"
            >
              <div className="flex gap-4">
                <ProductThumb imageUrl={r.product_image_url} name={r.product_name} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 truncate">{r.product_name}</p>
                  <p className="text-xs text-slate-500">{r.recipe_name} · v{r.version}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${badgeClass(r.status_badge)}`}>{r.status_badge}</span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{r.component_count} skł.</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-slate-50 py-2">
                  <p className="text-slate-400">Koszt/szt.</p>
                  <p className="font-semibold text-slate-800">{formatProductionMoney(r.unit_cost_net)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 py-2">
                  <p className="text-slate-400">Można wyproduk.</p>
                  <p className="font-semibold text-violet-700">{Math.floor(r.max_producible)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 py-2">
                  <p className="text-slate-400">Stan WG</p>
                  <p className="font-semibold text-slate-800">{r.current_stock}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
