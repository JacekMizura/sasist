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
import { Checkbox, GhostButton, Input, PrimaryButton } from "../../design-system";
import { formatProductionMoney, PRODUCTION_NUMBER_INPUT } from "./productionUi";

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
  sectionHint?: string;
  /** Parent can request opening the new-recipe editor (e.g. product empty state CTA). */
  requestNewEditor?: boolean;
  onRequestNewHandled?: () => void;
  /** Hide inline recipe version cards — parent renders them in a sidebar. */
  hideCompositionCards?: boolean;
  /** Open editor for an existing composition (e.g. sidebar „Edytuj”). */
  editCompositionId?: number | null;
  onEditCompositionHandled?: () => void;
  /** Live cost estimate while editing (for external info panel). */
  onCostEstimateChange?: (estimate: CompositionCostEstimateRead | null) => void;
};

function modeCopy(mode: CompositionMode) {
  if (mode === "manufacturing") {
    return {
      empty: "Brak receptury produkcyjnej.",
      newTitle: "Nowa receptura produkcyjna",
      editTitle: "Edycja receptury produkcyjnej",
      activeLabel: "Aktywna receptura",
      addLabel: "Utwórz recepturę",
      defaultName: "Receptura produkcyjna",
      outputBorder: "border-purple-200 bg-purple-50 text-purple-800",
      link: "text-blue-600 hover:text-blue-800",
    };
  }
  return {
    empty: "Brak zestawu.",
    newTitle: "Nowy zestaw",
    editTitle: "Edycja zestawu",
    activeLabel: "Aktywny zestaw",
    addLabel: "Dodaj zestaw",
    defaultName: "Zestaw",
    outputBorder: "border-violet-200 bg-violet-50 text-violet-900",
    link: "text-violet-600 hover:underline",
  };
}

export function CompositionVisualEditor({
  tenantId,
  productId,
  productName,
  mode,
  compositions,
  onChanged,
  sectionTitle,
  sectionHint,
  requestNewEditor,
  onRequestNewHandled,
  hideCompositionCards = false,
  editCompositionId,
  onEditCompositionHandled,
  onCostEstimateChange,
}: Props) {
  const copy = modeCopy(mode);
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

  const fieldLabelClass = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-600";

  const openNew = () => {
    setEditingId(null);
    setName(copy.defaultName);
    setVersion("1");
    setYieldQty(1);
    setNotes("");
    setIsActive(compositions.length === 0);
    setRows([emptyRow()]);
    setCostEstimate(null);
    setEditorOpen(true);
    setErr(null);
  };

  useEffect(() => {
    if (!requestNewEditor) return;
    openNew();
    onRequestNewHandled?.();
  }, [requestNewEditor]);

  useEffect(() => {
    if (editCompositionId == null) return;
    const comp = compositions.find((c) => c.id === editCompositionId);
    if (comp) openEdit(comp);
    onEditCompositionHandled?.();
  }, [editCompositionId, compositions]);

  useEffect(() => {
    onCostEstimateChange?.(costEstimate);
  }, [costEstimate, onCostEstimateChange]);

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
    <section className="space-y-6">
      {/* Nagłówek sekcji — mock */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{sectionTitle}</h2>
          {sectionHint?.trim() ? (
            <p className="mt-0.5 text-xs text-gray-500">{sectionHint}</p>
          ) : null}
        </div>
        <PrimaryButton
          type="button"
          density="compact"
          onClick={openNew}
        >
          <Plus className="mr-2 h-4 w-4" strokeWidth={2.5} aria-hidden />
          {copy.addLabel}
        </PrimaryButton>
      </div>

      {err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      ) : null}

      {compositions.length === 0 && !editorOpen ? (
        <p className="text-sm text-gray-500">{copy.empty}</p>
      ) : hideCompositionCards ? (
        !editorOpen ? (
          <p className="rounded-lg border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
            Wybierz wersję receptury w panelu po prawej lub utwórz nową.
          </p>
        ) : null
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {compositions.map((comp) => (
            <div
              key={comp.id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-gray-300"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-900">{comp.name}</p>
                  <p className="text-xs text-gray-500">
                    v{comp.version} · wydajność {comp.yield_quantity} · {comp.lines.length} skł.
                  </p>
                </div>
                {comp.is_active ? (
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Aktywna</span>
                ) : (
                  <button type="button" onClick={() => void handleActivate(comp.id)} className={`text-xs ${copy.link}`}>
                    Aktywuj
                  </button>
                )}
              </div>
              <button type="button" onClick={() => openEdit(comp)} className={`mt-3 text-sm ${copy.link}`}>
                Edytuj
              </button>
            </div>
          ))}
        </div>
      )}

      {editorOpen ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4">
            <h3 className="text-base font-bold text-gray-900">
              {editingId == null ? copy.newTitle : copy.editTitle}
            </h3>
          </div>

          <div className="space-y-6 p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="md:col-span-2">
                <label className={fieldLabelClass}>Nazwa</label>
                <Input
                  density="comfortable"
                  focusTone="brand"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className={fieldLabelClass}>Wersja</label>
                <Input
                  density="comfortable"
                  focusTone="brand"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="bg-gray-50"
                />
              </div>
              <div>
                <label className={fieldLabelClass}>Wydajność (szt.)</label>
                <Input
                  type="number"
                  min={0.001}
                  step="any"
                  density="comfortable"
                  focusTone="brand"
                  className={PRODUCTION_NUMBER_INPUT}
                  value={yieldQty}
                  onChange={(e) => setYieldQty(Number(e.target.value) || 1)}
                />
              </div>
            </div>

            <label className="mt-2 flex cursor-pointer items-center">
              <Checkbox
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm font-medium text-gray-800">{copy.activeLabel}</span>
            </label>

            {/* Składniki — grid rows jak mock, bez DataTable */}
            <div className="pt-2">
              <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">Składniki</h4>

              <div className="mb-2 grid grid-cols-12 gap-4 px-2 text-xs font-medium uppercase tracking-wider text-gray-500">
                <div className="col-span-7">Produkt</div>
                <div className="col-span-2 text-right">Ilość</div>
                <div className="col-span-1">Jednostka</div>
                {mode === "manufacturing" ? <div className="col-span-1 text-right">Odpad %</div> : <div className="col-span-1" />}
                <div className="col-span-1 text-center" />
              </div>

              {rows.map((row, idx) => (
                <div
                  key={row.rowKey}
                  className="mb-3 grid grid-cols-12 items-center gap-4 rounded-lg border border-gray-200 bg-white p-2 shadow-sm"
                >
                  <div className="relative col-span-7">
                    <Input
                      density="compact"
                      focusTone="brand"
                      className="!border-none !bg-transparent !shadow-none focus:!ring-0"
                      value={row.searchText}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRows((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, searchText: v, listOpen: true } : r)),
                        );
                        void searchProducts(v);
                      }}
                      onFocus={() =>
                        setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, listOpen: true } : r)))
                      }
                      placeholder="SKU / nazwa…"
                      aria-label="Produkt"
                    />
                    {row.listOpen && searchResults.length > 0 ? (
                      <ul className="absolute left-0 right-0 z-20 mt-0.5 max-h-40 overflow-auto rounded-lg border border-gray-200 bg-white text-sm shadow-lg">
                        {searchResults.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              className="block w-full px-3 py-1.5 text-left hover:bg-gray-50"
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
                  <div className="col-span-2">
                    <Input
                      type="number"
                      min={0.001}
                      step="any"
                      density="compact"
                      focusTone="brand"
                      className={`text-right ${PRODUCTION_NUMBER_INPUT}`}
                      value={row.quantity}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, quantity: Number(e.target.value) || 0 } : r)),
                        )
                      }
                      aria-label="Ilość"
                    />
                  </div>
                  <div className="col-span-1 pl-2 text-sm text-gray-600">szt.</div>
                  {mode === "manufacturing" ? (
                    <div className="col-span-1">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        density="compact"
                        focusTone="brand"
                        className={`text-right ${PRODUCTION_NUMBER_INPUT}`}
                        value={row.wastePercent}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, wastePercent: Number(e.target.value) || 0 } : r,
                            ),
                          )
                        }
                        aria-label="Odpad procent"
                      />
                    </div>
                  ) : (
                    <div className="col-span-1" />
                  )}
                  <div className="col-span-1 text-center">
                    <button
                      type="button"
                      title="Usuń składnik"
                      onClick={() =>
                        setRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : [emptyRow()]))
                      }
                      className="text-gray-400 transition-colors hover:text-red-500"
                    >
                      <Trash2 className="mx-auto h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setRows((prev) => [...prev, emptyRow()])}
                className="mt-2 flex items-center px-1 text-sm font-medium text-blue-600 transition-colors hover:text-blue-800"
              >
                <Plus className="mr-1.5 h-3 w-3" strokeWidth={2.5} aria-hidden /> Dodaj składnik
              </button>
            </div>

            <div className="mt-4 flex flex-col items-center border-t border-gray-100 pt-6">
              {previewLines.map((ln) => (
                <div
                  key={ln.id}
                  className="w-full max-w-sm rounded-lg border border-gray-200 bg-gray-50 p-3 text-center shadow-sm"
                >
                  <div className="text-sm font-medium text-gray-800">{ln.name}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {ln.qty} {ln.unit}
                  </div>
                </div>
              ))}
              {previewLines.length === 0 ? (
                <p className="text-sm text-gray-500">Dodaj składniki…</p>
              ) : null}

              <div className="relative h-6 w-px bg-gray-300">
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 transform text-[10px] text-gray-400">
                  <ArrowDown className="h-3 w-3" aria-hidden />
                </div>
              </div>

              <div
                className={`mt-1 w-full max-w-sm rounded-lg border p-3 text-center shadow-sm ${copy.outputBorder}`}
              >
                <div className="text-sm font-bold">{productName}</div>
              </div>
            </div>

            {!hideCompositionCards && mode === "manufacturing" && costEstimate ? (
              <p className="text-sm text-gray-600">
                Szacowany koszt: <strong>{formatProductionMoney(costEstimate.unit_cost_net)}</strong> / szt.
              </p>
            ) : null}
          </div>

          <div className="flex justify-end space-x-3 border-t border-gray-100 bg-gray-50/50 px-6 py-4">
            <GhostButton
              type="button"
              density="compact"
              onClick={() => setEditorOpen(false)}
              className="!px-4 !py-2 !text-sm !font-medium !text-gray-600 hover:!bg-transparent hover:!text-gray-800"
            >
              Anuluj
            </GhostButton>
            <PrimaryButton
              type="button"
              density="compact"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? "Zapisywanie…" : "Zapisz"}
            </PrimaryButton>
          </div>
        </div>
      ) : null}
    </section>
  );
}
