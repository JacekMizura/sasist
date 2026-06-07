import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Search, TrendingUp } from "lucide-react";
import { useWarehouse } from "../../context/WarehouseContext";
import { fetchProductionDashboard, listRecipeCards, type RecipeCardRead } from "../../api/productionApi";
import { ErpKpiCard } from "./components/ErpKpiCard";
import { formatProductionMoney } from "./productionUi";
import { erpProductionPaths } from "./productionPaths";
import { ProductThumb } from "./components/ProductThumb";

const DEFAULT_TENANT = 1;

export default function ProductionAnalyticsPage() {
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [recipes, setRecipes] = useState<RecipeCardRead[]>([]);
  const [efficiency, setEfficiency] = useState<number | null>(null);
  const [finishedToday, setFinishedToday] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "low_stock" | "active">("all");
  const [loading, setLoading] = useState(true);

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
      setFinishedToday(dash.finished_today);
    } catch {
      setRecipes([]);
      setEfficiency(null);
      setFinishedToday(0);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = useMemo(() => {
    let list = recipes;
    if (filter === "low_stock") list = list.filter((r) => r.has_low_stock || r.status_badge === "LOW_STOCK");
    if (filter === "active") list = list.filter((r) => r.is_active);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.product_name.toLowerCase().includes(q) ||
          r.recipe_name.toLowerCase().includes(q) ||
          (r.product_sku ?? "").toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => (b.unit_cost_net ?? 0) - (a.unit_cost_net ?? 0));
  }, [recipes, search, filter]);

  const avgCost =
    recipes.length > 0
      ? recipes.reduce((s, r) => s + (r.unit_cost_net ?? 0), 0) / recipes.filter((r) => r.unit_cost_net != null).length || 0
      : 0;

  const lowStockCount = recipes.filter((r) => r.has_low_stock).length;

  if (warehouseId == null) {
    return <p className="px-4 py-8 text-sm text-slate-500">Wybierz magazyn, aby analizować koszty produkcji.</p>;
  }

  return (
    <div className="space-y-6 px-4 pb-10 lg:px-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Analiza kosztów produkcji</h2>
        <p className="text-sm text-slate-500">Koszty receptur, marże i dostępność składników — widok zarządczy ERP.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ErpKpiCard label="Aktywne receptury" value={recipes.filter((r) => r.is_active).length} />
        <ErpKpiCard label="Śr. koszt wyrobu" value={avgCost > 0 ? formatProductionMoney(avgCost) : "—"} />
        <ErpKpiCard label="Receptury z brakami" value={lowStockCount} tone={lowStockCount > 0 ? "warning" : "default"} />
        <ErpKpiCard
          label="Efektywność / dziś"
          value={efficiency != null ? `${efficiency}%` : "—"}
          hint={finishedToday > 0 ? `${finishedToday} zakończonych dziś` : undefined}
          tone="info"
        />
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
          {(["all", "active", "low_stock"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 font-medium ${filter === f ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {f === "all" ? "Wszystkie" : f === "active" ? "Aktywne" : "Braki"}
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
              <th className="px-4 py-3">Koszt/szt.</th>
              <th className="px-4 py-3">Stan WG</th>
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
                  Brak receptur do analizy.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
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
                  <td className="px-4 py-3 tabular-nums font-medium text-slate-900">{formatProductionMoney(r.unit_cost_net)}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-600">{r.current_stock}</td>
                  <td className="px-4 py-3 tabular-nums">
                    <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                      {Math.floor(r.max_producible)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.has_low_stock ? (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                        <AlertTriangle className="h-3 w-3" aria-hidden />
                        Braki
                      </span>
                    ) : (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">OK</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={erpProductionPaths.recipe(r.composition_id)}
                      className="text-xs font-medium text-slate-800 underline hover:text-slate-600"
                    >
                      Szczegóły
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
