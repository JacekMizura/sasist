import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Factory, Plus, Trash2 } from "lucide-react";
import api from "../../api/axios";
import {
  activateRecipe,
  createProductionOrder,
  createRecipe,
  listRecipeUsages,
  listRecipesForProduct,
  updateRecipe,
  type ProductionRecipeLineWrite,
  type ProductionRecipeRead,
  type RecipeUsageRead,
} from "../../api/productionApi";
import { useWarehouse } from "../../context/WarehouseContext";

type CatalogProduct = {
  id: number;
  name?: string | null;
  symbol?: string | null;
  sku?: string | null;
  stock_quantity?: number;
  purchase_price?: number | null;
};

type ComponentRow = {
  rowKey: string;
  productId: number | null;
  quantity: number;
  wastePercent: number;
  searchText: string;
  listOpen: boolean;
};

function newRowKey(): string {
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyRow(): ComponentRow {
  return { rowKey: newRowKey(), productId: null, quantity: 1, wastePercent: 0, searchText: "", listOpen: false };
}

function parseProductsResponse(data: unknown): CatalogProduct[] {
  if (Array.isArray(data)) return data as CatalogProduct[];
  if (data && typeof data === "object" && "items" in data && Array.isArray((data as { items: unknown }).items)) {
    return (data as { items: CatalogProduct[] }).items;
  }
  return [];
}

function rowsToLines(rows: ComponentRow[]): ProductionRecipeLineWrite[] {
  const out: ProductionRecipeLineWrite[] = [];
  rows.forEach((r, idx) => {
    if (r.productId == null || r.quantity <= 0) return;
    out.push({
      component_product_id: r.productId,
      quantity: r.quantity,
      waste_percent: r.wastePercent,
      sort_order: idx,
    });
  });
  return out;
}

function formatMoney(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return `${Number(v).toFixed(2)} zł`;
}

type Props = {
  tenantId: number;
  productId: number;
  productName: string;
  onRecipesChanged?: () => void;
};

export function ProductProductionPanel({ tenantId, productId, productName, onRecipesChanged }: Props) {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const [recipes, setRecipes] = useState<ProductionRecipeRead[]>([]);
  const [orderQty, setOrderQty] = useState(1);
  const [orderBusy, setOrderBusy] = useState(false);
  const [usages, setUsages] = useState<RecipeUsageRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRecipeId, setEditingRecipeId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [recipeName, setRecipeName] = useState("");
  const [version, setVersion] = useState("1");
  const [yieldQty, setYieldQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [rows, setRows] = useState<ComponentRow[]>(() => [emptyRow()]);
  const [productCache, setProductCache] = useState<Record<number, CatalogProduct>>({});
  const [searchResults, setSearchResults] = useState<CatalogProduct[]>([]);

  const inputClass =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-violet-500 focus:border-violet-400";
  const labelClass = "block text-sm font-medium text-slate-700 mb-1";

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [r, u] = await Promise.all([
        listRecipesForProduct(tenantId, productId),
        listRecipeUsages(tenantId, productId),
      ]);
      setRecipes(r);
      setUsages(u);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Nie udało się wczytać danych produkcji.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, productId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openNewRecipe = () => {
    setEditingRecipeId(null);
    setRecipeName(`Receptura — ${productName}`);
    setVersion("1");
    setYieldQty(1);
    setNotes("");
    setIsActive(true);
    setRows([emptyRow()]);
    setEditorOpen(true);
  };

  const openEditRecipe = (rec: ProductionRecipeRead) => {
    setEditingRecipeId(rec.id);
    setRecipeName(rec.name);
    setVersion(rec.version);
    setYieldQty(rec.yield_quantity);
    setNotes(rec.notes ?? "");
    setIsActive(rec.is_active);
    setRows(
      rec.lines.length
        ? rec.lines.map((ln) => ({
            rowKey: newRowKey(),
            productId: ln.component_product_id,
            quantity: ln.quantity,
            wastePercent: ln.waste_percent,
            searchText: ln.product_name ?? "",
            listOpen: false,
          }))
        : [emptyRow()],
    );
    setEditorOpen(true);
  };

  const searchProducts = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setSearchResults([]);
        return;
      }
      try {
        const { data } = await api.get<unknown>("/products/", {
          params: { tenant_id: tenantId, search: q.trim(), limit: 20 },
        });
        setSearchResults(parseProductsResponse(data).filter((p) => p.id !== productId));
      } catch {
        setSearchResults([]);
      }
    },
    [tenantId, productId],
  );

  const estimatedCost = useMemo(() => {
    let total = 0;
    for (const r of rows) {
      if (r.productId == null) continue;
      const p = productCache[r.productId];
      const unit = p?.purchase_price != null ? Number(p.purchase_price) : 0;
      const waste = 1 + (r.wastePercent || 0) / 100;
      total += unit * r.quantity * waste;
    }
    return yieldQty > 0 ? total / yieldQty : total;
  }, [rows, productCache, yieldQty]);

  const prefetchProduct = useCallback(
    async (id: number) => {
      if (productCache[id]) return;
      try {
        const { data } = await api.get<CatalogProduct>(`/products/${id}/`, {
          params: { tenant_id: tenantId },
        });
        setProductCache((prev) => ({ ...prev, [id]: data }));
      } catch {
        /* ignore */
      }
    },
    [tenantId, productCache],
  );

  useEffect(() => {
    rows.forEach((r) => {
      if (r.productId != null) void prefetchProduct(r.productId);
    });
  }, [rows, prefetchProduct]);

  const handleSave = async () => {
    const lines = rowsToLines(rows);
    if (!recipeName.trim() || lines.length === 0) {
      setErr("Podaj nazwę receptury i co najmniej jeden składnik.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      if (editingRecipeId == null) {
        await createRecipe(tenantId, {
          product_id: productId,
          name: recipeName.trim(),
          version: version.trim() || "1",
          yield_quantity: yieldQty,
          notes: notes.trim() || null,
          is_active: isActive,
          lines,
        });
      } else {
        await updateRecipe(tenantId, editingRecipeId, {
          name: recipeName.trim(),
          version: version.trim(),
          yield_quantity: yieldQty,
          notes: notes.trim() || null,
          is_active: isActive,
          lines,
        });
      }
      setEditorOpen(false);
      await reload();
      onRecipesChanged?.();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? String((e as { response?: { data?: { detail?: { message?: string } } } }).response?.data?.detail?.message ?? "")
          : "";
      setErr(msg || (e instanceof Error ? e.message : "Zapis receptury nie powiódł się."));
    } finally {
      setSaving(false);
    }
  };

  const activeRecipe = recipes.find((r) => r.is_active) ?? recipes[0] ?? null;

  const handleCreateOrder = async () => {
    if (!activeRecipe || !warehouse?.id) {
      setErr("Wybierz aktywną recepturę i magazyn WMS.");
      return;
    }
    setOrderBusy(true);
    setErr(null);
    try {
      const order = await createProductionOrder(tenantId, {
        recipe_id: activeRecipe.id,
        warehouse_id: warehouse.id,
        planned_quantity: orderQty,
        status: "planned",
      });
      navigate(`/production?order=${order.id}`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Nie udało się utworzyć zlecenia.");
    } finally {
      setOrderBusy(false);
    }
  };

  const handleActivate = async (recipeId: number) => {
    try {
      await activateRecipe(tenantId, recipeId, true);
      await reload();
      onRecipesChanged?.();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Aktywacja nie powiodła się.");
    }
  };

  if (loading && !editorOpen) {
    return <p className="text-sm text-slate-500">Wczytywanie…</p>;
  }

  return (
    <div className="space-y-8">
      {err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
      ) : null}

      <section>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-lg font-bold text-slate-900 border-b border-slate-200 pb-2 flex-1">
            Receptury produkcji
          </h3>
          <button
            type="button"
            onClick={openNewRecipe}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Dodaj recepturę
          </button>
        </div>

        {recipes.length === 0 && !editorOpen ? (
          <p className="text-sm text-slate-500">
            Brak receptur. Kliknij „Dodaj recepturę”, aby zdefiniować składniki i wydajność.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Nazwa</th>
                  <th className="px-3 py-2">Wersja</th>
                  <th className="px-3 py-2">Wydajność</th>
                  <th className="px-3 py-2">Składniki</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {recipes.map((rec) => (
                  <tr key={rec.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="px-3 py-2 font-medium text-slate-900">{rec.name}</td>
                    <td className="px-3 py-2">{rec.version}</td>
                    <td className="px-3 py-2">{rec.yield_quantity}</td>
                    <td className="px-3 py-2">{rec.lines.length}</td>
                    <td className="px-3 py-2">
                      {rec.is_active ? (
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          Aktywna
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleActivate(rec.id)}
                          className="text-xs text-violet-600 hover:underline"
                        >
                          Aktywuj
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => openEditRecipe(rec)}
                        className="text-violet-600 hover:underline"
                      >
                        Edytuj
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {activeRecipe ? (
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Nowe zlecenie produkcyjne</h4>
          <p className="mt-1 text-xs text-slate-600">
            Receptura: {activeRecipe.name} (v{activeRecipe.version})
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="w-32">
              <label className={labelClass}>Ilość</label>
              <input
                type="number"
                min={0.001}
                step="any"
                className={inputClass}
                value={orderQty}
                onChange={(e) => setOrderQty(Number(e.target.value) || 1)}
              />
            </div>
            <button
              type="button"
              disabled={orderBusy || !warehouse?.id}
              onClick={() => void handleCreateOrder()}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
            >
              {orderBusy ? "Tworzenie…" : "Utwórz zlecenie"}
            </button>
          </div>
        </section>
      ) : null}

      {usages.length > 0 ? (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">
            <Factory className="h-5 w-5 text-slate-500" aria-hidden />
            Używany w produkcji
          </h3>
          <ul className="space-y-2 text-sm">
            {usages.map((u) => (
              <li key={`${u.recipe_id}-${u.finished_product_id}`} className="flex justify-between gap-4 rounded-lg border border-slate-100 px-3 py-2">
                <span>
                  <span className="font-medium text-slate-900">{u.finished_product_name}</span>
                  <span className="text-slate-500"> — {u.recipe_name}</span>
                </span>
                <span className="text-slate-600">× {u.quantity}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {editorOpen ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-4 space-y-4">
          <h4 className="font-semibold text-slate-900">
            {editingRecipeId == null ? "Nowa receptura" : "Edycja receptury"}
          </h4>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <label className={labelClass}>Nazwa</label>
              <input className={inputClass} value={recipeName} onChange={(e) => setRecipeName(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Wersja</label>
              <input className={inputClass} value={version} onChange={(e) => setVersion(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Wydajność (szt.)</label>
              <input
                type="number"
                min={0.001}
                step="any"
                className={inputClass}
                value={yieldQty}
                onChange={(e) => setYieldQty(Number(e.target.value) || 1)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Aktywna receptura
          </label>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Składniki</p>
            {rows.map((row, idx) => (
              <div key={row.rowKey} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
                <div className="relative min-w-[200px] flex-1">
                  <label className={labelClass}>Produkt</label>
                  <input
                    className={inputClass}
                    value={row.searchText}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, searchText: v, listOpen: true } : r)));
                      void searchProducts(v);
                    }}
                    onFocus={() => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, listOpen: true } : r)))}
                    placeholder="Szukaj SKU / nazwy…"
                  />
                  {row.listOpen && searchResults.length > 0 ? (
                    <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg text-sm">
                      {searchResults.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                            onClick={() => {
                              setProductCache((prev) => ({ ...prev, [p.id]: p }));
                              setRows((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? {
                                        ...r,
                                        productId: p.id,
                                        searchText: (p.name ?? `Produkt #${p.id}`).trim(),
                                        listOpen: false,
                                      }
                                    : r,
                                ),
                              );
                            }}
                          >
                            {(p.name ?? `#${p.id}`).trim()} · {p.sku || p.symbol || "—"} · stan{" "}
                            {p.stock_quantity ?? 0}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="w-24">
                  <label className={labelClass}>Ilość</label>
                  <input
                    type="number"
                    min={0.001}
                    step="any"
                    className={inputClass}
                    value={row.quantity}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, quantity: Number(e.target.value) || 0 } : r)),
                      )
                    }
                  />
                </div>
                <div className="w-20">
                  <label className={labelClass}>Odpad %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className={inputClass}
                    value={row.wastePercent}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, wastePercent: Number(e.target.value) || 0 } : r)),
                      )
                    }
                  />
                </div>
                <button
                  type="button"
                  title="Usuń linię"
                  onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : [emptyRow()]))}
                  className="mb-0.5 rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setRows((prev) => [...prev, emptyRow()])}
              className="text-sm text-violet-600 hover:underline"
            >
              + Dodaj składnik
            </button>
          </div>

          <p className="text-sm text-slate-600">
            Szacowany koszt jednostkowy: <strong>{formatMoney(estimatedCost)}</strong>
          </p>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Anuluj
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {saving ? "Zapisywanie…" : "Zapisz recepturę"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
