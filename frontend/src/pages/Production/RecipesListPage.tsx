import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Search } from "lucide-react";
import { useWarehouse } from "../../context/WarehouseContext";
import { listRecipeCards, type RecipeCardRead } from "../../api/productionApi";
import { formatProductionMoney } from "./productionUi";
import { erpProductionPaths } from "./productionPaths";
import { ProductThumb } from "./components/ProductThumb";

const DEFAULT_TENANT = 1;

function statusBadge(r: RecipeCardRead): { label: string; className: string } {
  if (!r.is_active) return { label: "Archiwum", className: "bg-slate-100 text-slate-600" };
  if (r.has_low_stock || r.status_badge === "LOW_STOCK")
    return { label: "Braki", className: "bg-amber-100 text-amber-900" };
  if (r.status_badge === "ACTIVE") return { label: "Aktywna", className: "bg-emerald-100 text-emerald-800" };
  return { label: r.status_badge, className: "bg-slate-100 text-slate-600" };
}

export default function RecipesListPage() {
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [recipes, setRecipes] = useState<RecipeCardRead[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "shortages">("all");
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

  const filtered = useMemo(() => {
    let list = recipes;
    if (filter === "active") list = list.filter((r) => r.is_active);
    if (filter === "shortages") list = list.filter((r) => r.has_low_stock);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.product_name.toLowerCase().includes(q) ||
          r.recipe_name.toLowerCase().includes(q) ||
          (r.product_sku ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [recipes, search, filter]);

  return (
    <div className="space-y-4 px-4 pb-10 lg:px-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Receptury produkcyjne</h2>
        <p className="text-sm text-slate-500">Zarządzanie wersjami, składnikami i kosztami — moduł ERP.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj produktu, receptury, SKU…"
            className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3 text-sm"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs">
          {(["all", "active", "shortages"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 font-medium ${filter === f ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {f === "all" ? "Wszystkie" : f === "active" ? "Aktywne" : "Z brakami"}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Produkt</th>
              <th className="px-4 py-3">Receptura</th>
              <th className="px-4 py-3">Wersja</th>
              <th className="px-4 py-3">Składniki</th>
              <th className="px-4 py-3">Koszt/szt.</th>
              <th className="px-4 py-3">Można wyproduk.</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Akcja</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-slate-500">
                  Wczytywanie…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-slate-500">
                  Brak receptur. Utwórz kompozycję produkcyjną w module receptur lub na karcie produktu (podsumowanie).
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const badge = statusBadge(r);
                return (
                  <tr key={r.composition_id} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <ProductThumb imageUrl={r.product_image_url} name={r.product_name} size="sm" />
                        <div>
                          <p className="font-medium text-slate-900">{r.product_name}</p>
                          {r.product_sku ? <p className="text-xs text-slate-400">{r.product_sku}</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{r.recipe_name}</td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">v{r.version}</span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{r.component_count}</td>
                    <td className="px-4 py-3 tabular-nums font-medium text-slate-900">{formatProductionMoney(r.unit_cost_net)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{Math.floor(r.max_producible)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                        {r.has_low_stock ? <AlertTriangle className="h-3 w-3" aria-hidden /> : null}
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={erpProductionPaths.recipe(r.composition_id)}
                        className="text-xs font-medium text-slate-800 underline hover:text-slate-600"
                      >
                        Otwórz
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
