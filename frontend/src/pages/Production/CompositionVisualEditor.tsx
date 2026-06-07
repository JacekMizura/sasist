import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, Plus, Trash2 } from "lucide-react";
import api from "../../api/axios";
import {
  activateComposition,
  createComposition,
  fetchCompositionCostEstimate,
  updateComposition,
  type CompositionLineWrite,
  type CompositionMode,
  type CompositionCostEstimateRead,
  type ProductCompositionRead,
} from "../../api/compositionApi";
import { formatProductionMoney } from "./productionUi";

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

function rowsToLines(rows: ComponentRow[]): CompositionLineWrite[] {
  const out: CompositionLineWrite[] = [];
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

type Props = {
  tenantId: number;
  productId: number;
  productName: string;
  mode: CompositionMode;
  compositions: ProductCompositionRead[];
  onChanged: () => void;
  sectionTitle: string;
  sectionHint: string;
};

export function CompositionVisualEditor({
  tenantId,
  productId,
  productName,
  mode,
  compositions,
  onChanged,
  sectionTitle,
  sectionHint,
}: Props) {
  const [err, setErr] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [version, setVersion] = useState("1");
  const [yieldQty, setYieldQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [rows, setRows] = useState<ComponentRow[]>(() => [emptyRow()]);
  const [productCache, setProductCache] = useState<Record<number, CatalogProduct>>({});
  const [searchResults, setSearchResults] = useState<CatalogProduct[]>([]);
  const [costEstimate, setCostEstimate] = useState<CompositionCostEstimateRead | null>(null);

  const inputClass =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-violet-500 focus:border-violet-400";
  const labelClass = "block text-sm font-medium text-slate-700 mb-1";

  const openNew = () => {
    setEditingId(null);
    setName(mode === "bundle" ? "Zestaw" : "Produkcja");
    setVersion("1");
    setYieldQty(1);
    setNotes("");
    setIsActive(compositions.length === 0);
    setRows([emptyRow()]);
    setCostEstimate(null);
    setEditorOpen(true);
    setErr(null);
  };

  const openEdit = (comp: ProductCompositionRead) => {
    setEditingId(comp.id);
    setName(comp.name);
    setVersion(comp.version);
    setYieldQty(comp.yield_quantity);
    setNotes(comp.notes ?? "");
    setIsActive(comp.is_active);
    setRows(
      comp.lines.length > 0
        ? comp.lines.map((ln) => ({
            rowKey: newRowKey(),
            productId: ln.component_product_id,
            quantity: ln.quantity,
            wastePercent: ln.waste_percent,
            searchText: (ln.product_name ?? `Produkt #${ln.component_product_id}`).trim(),
            listOpen: false,
          }))
        : [emptyRow()],
    );
    setEditorOpen(true);
    setErr(null);
  };

  const searchProducts = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setSearchResults([]);
        return;
      }
      try {
        const { data } = await api.get("/products/", {
          params: { tenant_id: tenantId, search: q.trim(), limit: 12 },
        });
        setSearchResults(parseProductsResponse(data));
      } catch {
        setSearchResults([]);
      }
    },
    [tenantId],
  );

  useEffect(() => {
    if (editingId == null || !editorOpen) {
      setCostEstimate(null);
      return;
    }
    void fetchCompositionCostEstimate(tenantId, editingId)
      .then(setCostEstimate)
      .catch(() => setCostEstimate(null));
  }, [tenantId, editingId, editorOpen]);

  const previewLines = useMemo(() => {
    return rows
      .filter((r) => r.productId != null && r.quantity > 0)
      .map((r) => {
        const p = productCache[r.productId!];
        return {
          id: r.productId!,
          name: p?.name ?? (r.searchText || `Produkt #${r.productId}`),
          qty: r.quantity,
          unit: "szt.",
        };
      });
  }, [rows, productCache]);

  const handleSave = async () => {
    const lines = rowsToLines(rows);
    if (!name.trim() || lines.length === 0) {
      setErr("Podaj nazwę i co najmniej jeden składnik.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      if (editingId == null) {
        await createComposition(tenantId, {
          product_id: productId,
          composition_mode: mode,
          name: name.trim(),
          version: version.trim() || "1",
          yield_quantity: yieldQty,
          notes: notes.trim() || null,
          is_active: isActive,
          lines,
        });
      } else {
        await updateComposition(tenantId, editingId, {
          name: name.trim(),
          version: version.trim(),
          yield_quantity: yieldQty,
          notes: notes.trim() || null,
          is_active: isActive,
          lines,
        });
      }
      setEditorOpen(false);
      onChanged();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? String((e as { response?: { data?: { detail?: { message?: string } } } }).response?.data?.detail?.message ?? "")
          : "";
      setErr(msg || (e instanceof Error ? e.message : "Zapis nie powiódł się."));
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (id: number) => {
    try {
      await activateComposition(tenantId, id, true);
      onChanged();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Aktywacja nie powiodła się.");
    }
  };

  const prefetchProduct = useCallback(
    async (id: number) => {
      if (productCache[id]) return;
      try {
        const { data } = await api.get<CatalogProduct>(`/products/${id}/`, { params: { tenant_id: tenantId } });
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
    compositions.forEach((c) =>
      c.lines.forEach((ln) => {
        if (ln.component_product_id) void prefetchProduct(ln.component_product_id);
      }),
    );
  }, [rows, compositions, prefetchProduct]);

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-base font-bold text-slate-900">{sectionTitle}</h4>
          <p className="mt-1 text-xs text-slate-500">{sectionHint}</p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Dodaj
        </button>
      </div>

      {err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      ) : null}

      {compositions.length === 0 && !editorOpen ? (
        <p className="text-sm text-slate-500">Brak kompozycji w tym trybie.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {compositions.map((comp) => (
            <div
              key={comp.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-violet-200 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{comp.name}</p>
                  <p className="text-xs text-slate-500">
                    v{comp.version} · wydajność {comp.yield_quantity} · {comp.lines.length} skł.
                  </p>
                </div>
                {comp.is_active ? (
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Aktywna</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleActivate(comp.id)}
                    className="text-xs text-violet-600 hover:underline"
                  >
                    Aktywuj
                  </button>
                )}
              </div>
              <div className="mt-3 flex flex-col items-center gap-1 py-2">
                {comp.lines.slice(0, 4).map((ln) => (
                  <div
                    key={ln.id}
                    className="w-full max-w-xs rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-center text-sm"
                  >
                    <span className="font-medium text-slate-800">{ln.product_name ?? `#${ln.component_product_id}`}</span>
                    <span className="block text-xs text-slate-500">{ln.quantity} szt.</span>
                  </div>
                ))}
                {comp.lines.length > 4 ? (
                  <p className="text-xs text-slate-400">+{comp.lines.length - 4} więcej</p>
                ) : null}
                <ArrowDown className="h-4 w-4 text-slate-300" aria-hidden />
                <div className="w-full max-w-xs rounded-lg border-2 border-violet-200 bg-violet-50 px-3 py-2 text-center text-sm font-semibold text-violet-900">
                  {productName}
                </div>
              </div>
              <button
                type="button"
                onClick={() => openEdit(comp)}
                className="mt-3 text-sm text-violet-600 hover:underline"
              >
                Edytuj
              </button>
            </div>
          ))}
        </div>
      )}

      {editorOpen ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-4 space-y-4">
          <h5 className="font-semibold text-slate-900">{editingId == null ? "Nowa kompozycja" : "Edycja kompozycji"}</h5>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <label className={labelClass}>Nazwa</label>
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
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
            Aktywna kompozycja
          </label>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Składniki</p>
              {rows.map((row, idx) => (
                <div key={row.rowKey} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="relative min-w-[160px] flex-1">
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
                              {(p.name ?? `#${p.id}`).trim()} · {p.sku || p.symbol || "—"}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div className="w-20">
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
                  {mode === "manufacturing" ? (
                    <div className="w-16">
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
                  ) : null}
                  <button
                    type="button"
                    title="Usuń"
                    onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : [emptyRow()]))}
                    className="mb-0.5 rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setRows((prev) => [...prev, emptyRow()])} className="text-sm text-violet-600 hover:underline">
                + Dodaj składnik
              </button>
            </div>

            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Podgląd</p>
              {previewLines.map((ln) => (
                <div key={ln.id} className="w-full max-w-xs rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-center shadow-sm">
                  <p className="font-medium text-slate-800">{ln.name}</p>
                  <p className="text-sm text-slate-600">
                    {ln.qty} {ln.unit}
                  </p>
                </div>
              ))}
              {previewLines.length === 0 ? <p className="text-sm text-slate-400">Dodaj składniki…</p> : null}
              <ArrowDown className="h-5 w-5 text-violet-400" aria-hidden />
              <div className="w-full max-w-xs rounded-lg border-2 border-violet-300 bg-violet-50 px-4 py-3 text-center font-semibold text-violet-900 shadow-sm">
                {productName}
              </div>
            </div>
          </div>

          {mode === "manufacturing" && costEstimate ? (
            <p className="text-sm text-slate-600">
              Szacowany koszt: <strong>{formatProductionMoney(costEstimate.unit_cost_net)}</strong> / szt.
            </p>
          ) : null}

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
              {saving ? "Zapisywanie…" : "Zapisz"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
