import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  activateComposition,
  listCompositionsForProduct,
  listCompositionUsages,
  updateComposition,
  type CompositionCostEstimateRead,
  type CompositionUsageRead,
  type ProductCompositionRead,
} from "../../api/compositionApi";
import {
  getProductionOrder,
  getRecipeDetail,
  listProductionOrdersForProduct,
  type ProductionOrderSummaryRead,
  type RecipeDetailRead,
} from "../../api/productionApi";
import { CompositionVisualEditor } from "./CompositionVisualEditor";
import { Badge, PrimaryButton, StatusBadge } from "../../design-system";
import { erpProductionPaths } from "./productionPaths";
import { warehouseStockDocumentPath } from "../../utils/stockDocumentPaths";
import {
  executionStatusTone,
  formatProductionMoney,
  formatProductionQuantity,
  PRODUCTION_STATUS_LABEL,
} from "./productionUi";
import { useWarehouse } from "../../context/WarehouseContext";
import { ProductThumb } from "./components/ProductThumb";

type Props = {
  tenantId: number;
  productId: number;
  productName: string;
  productImageUrl?: string | null;
  onChanged?: () => void;
};

type RwPwPreview = {
  rwNumber?: string | null;
  rwId?: number | null;
  pwNumber?: string | null;
  pwId?: number | null;
};

function formatRecipeUpdatedAt(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHistoryDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Product card — Produkcja / Receptura.
 * Default: presentation view (hero + composition table + flow + sidebar).
 * Edit/create: CompositionVisualEditor.
 */
export function ProductManufacturingPanel({
  tenantId,
  productId,
  productName,
  productImageUrl,
  onChanged,
}: Props) {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id;
  const [recipes, setRecipes] = useState<ProductCompositionRead[]>([]);
  const [detail, setDetail] = useState<RecipeDetailRead | null>(null);
  const [history, setHistory] = useState<ProductionOrderSummaryRead[]>([]);
  const [usages, setUsages] = useState<CompositionUsageRead[]>([]);
  const [rwPw, setRwPw] = useState<RwPwPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<"closed" | "new" | "edit">("closed");
  const [editRecipeId, setEditRecipeId] = useState<number | null>(null);
  const [liveCost, setLiveCost] = useState<CompositionCostEstimateRead | null>(null);
  const [activatingId, setActivatingId] = useState<number | null>(null);
  const [removingLineKey, setRemovingLineKey] = useState<string | null>(null);

  const estimatedUnitCost = liveCost?.unit_cost_net ?? detail?.unit_cost_net ?? null;
  const activeRecipe = useMemo(
    () => recipes.find((c) => c.is_active) ?? recipes[0] ?? null,
    [recipes],
  );

  const wasteByComponent = useMemo(() => {
    const map = new Map<number, number>();
    for (const ln of activeRecipe?.lines ?? []) {
      map.set(intId(ln.component_product_id), Number(ln.waste_percent || 0));
    }
    return map;
  }, [activeRecipe]);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [mfg, hRes, uRes] = await Promise.all([
        listCompositionsForProduct(tenantId, productId, "manufacturing"),
        listProductionOrdersForProduct(tenantId, productId),
        listCompositionUsages(tenantId, productId),
      ]);
      setRecipes(mfg);
      setHistory(hRes);
      setUsages(uRes.filter((u) => u.composition_mode === "manufacturing"));

      const active = mfg.find((c) => c.is_active) ?? mfg[0] ?? null;
      if (active) {
        setDetail(await getRecipeDetail(tenantId, active.id, warehouseId));
      } else {
        setDetail(null);
      }

      const latestCompleted = hRes.find((h) => h.status === "completed" && h.id > 0);
      if (latestCompleted && warehouseId != null) {
        try {
          const full = await getProductionOrder(tenantId, latestCompleted.id, warehouseId);
          setRwPw({
            rwId: full.rw_stock_document_id,
            rwNumber: full.rw_document_number,
            pwId: full.pw_stock_document_id,
            pwNumber: full.pw_document_number,
          });
        } catch {
          setRwPw(null);
        }
      } else {
        setRwPw(null);
      }
    } catch (e) {
      setRecipes([]);
      setDetail(null);
      setHistory([]);
      setUsages([]);
      setRwPw(null);
      setErr(e instanceof Error ? e.message : "Nie udało się wczytać danych produkcji.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, productId, warehouseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleChanged = () => {
    setLiveCost(null);
    setEditorMode("closed");
    setEditRecipeId(null);
    void reload();
    onChanged?.();
  };

  const openCreate = () => {
    setEditRecipeId(null);
    setEditorMode("new");
  };

  const openEdit = (compositionId: number) => {
    setEditRecipeId(compositionId);
    setEditorMode("edit");
  };

  const handleActivate = async (compositionId: number) => {
    setActivatingId(compositionId);
    try {
      await activateComposition(tenantId, compositionId, true);
      handleChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Aktywacja receptury nie powiodła się.");
    } finally {
      setActivatingId(null);
    }
  };

  const handleRemoveComponent = async (componentProductId: number) => {
    if (!activeRecipe) return;
    if (!confirm("Usunąć ten składnik z receptury?")) return;
    const key = String(componentProductId);
    setRemovingLineKey(key);
    try {
      const nextLines = (activeRecipe.lines || [])
        .filter((ln) => intId(ln.component_product_id) !== componentProductId)
        .map((ln, idx) => ({
          component_product_id: intId(ln.component_product_id),
          quantity: Number(ln.quantity),
          waste_percent: Number(ln.waste_percent || 0),
          sort_order: idx,
          notes: ln.notes ?? null,
        }));
      await updateComposition(tenantId, activeRecipe.id, {
        name: activeRecipe.name,
        version: activeRecipe.version,
        yield_quantity: activeRecipe.yield_quantity,
        notes: activeRecipe.notes ?? null,
        is_active: activeRecipe.is_active,
        lines: nextLines,
      });
      handleChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Nie udało się usunąć składnika.");
    } finally {
      setRemovingLineKey(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Wczytywanie danych produkcji…</p>;
  }

  const heroImage = (detail?.product_image_url || productImageUrl || "").trim() || null;
  const heroName = detail?.product_name || productName;
  const componentCount = detail?.components?.length ?? activeRecipe?.lines?.length ?? 0;
  const yieldQty = detail?.yield_quantity ?? activeRecipe?.yield_quantity ?? 1;
  const maxProducible = detail?.max_producible ?? 0;
  const editing = editorMode !== "closed";

  return (
    <div className="w-full max-w-none bg-white">
      {err ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
      ) : null}

      {editing ? (
        <CompositionVisualEditor
          tenantId={tenantId}
          productId={productId}
          productName={productName}
          mode="manufacturing"
          compositions={recipes}
          onChanged={handleChanged}
          sectionTitle="Receptura"
          sectionHint=""
          requestNewEditor={editorMode === "new"}
          onRequestNewHandled={() => undefined}
          hideCompositionCards
          hideSectionChrome
          editCompositionId={editorMode === "edit" ? editRecipeId : null}
          onEditCompositionHandled={() => undefined}
          onCostEstimateChange={setLiveCost}
          onCancelEdit={() => {
            setEditorMode("closed");
            setEditRecipeId(null);
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.38fr)]">
          {/* LEFT ~70% */}
          <div className="min-w-0 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-900">Receptura</h2>
              <PrimaryButton type="button" density="compact" onClick={openCreate} className="shrink-0">
                <Plus className="mr-1.5 h-4 w-4" strokeWidth={2.5} aria-hidden />
                Utwórz recepturę
              </PrimaryButton>
            </div>

            {!activeRecipe || !detail ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
                <p className="text-sm text-slate-600">Ten produkt nie posiada receptury produkcyjnej.</p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                  <PrimaryButton type="button" density="compact" onClick={openCreate}>
                    <Plus className="mr-1.5 h-4 w-4" strokeWidth={2.5} aria-hidden />
                    Utwórz recepturę
                  </PrimaryButton>
                  <Link
                    to={erpProductionPaths.home}
                    className="text-sm font-semibold text-slate-700 underline hover:text-slate-900"
                  >
                    Otwórz moduł Produkcja
                  </Link>
                </div>
              </div>
            ) : (
              <>
                {/* Hero recipe card */}
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center">
                    <ProductThumb imageUrl={heroImage} name={heroName} size="lg" className="rounded-lg" />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-lg font-bold text-slate-900">{heroName}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                          Receptura produkcyjna
                        </span>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                          v{detail.version || activeRecipe.version || "1"}
                        </span>
                        {detail.is_active || activeRecipe.is_active ? (
                          <Badge
                            tone="success"
                            className="!rounded !px-1.5 !py-0.5 !text-[9px] !font-bold !uppercase !tracking-wider"
                          >
                            Aktywna
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openEdit(activeRecipe.id)}
                      className="shrink-0 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:underline"
                    >
                      Edytuj
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-5">
                    <StatCell label="Wydajność" value={`${formatProductionQuantity(yieldQty)} szt.`} />
                    <StatCell
                      label="Ilość składników"
                      value={`${componentCount} ${componentCount === 1 ? "pozycja" : "pozycje"}`}
                    />
                    <StatCell
                      label="Możliwa produkcja"
                      value={`${formatProductionQuantity(maxProducible)} szt.`}
                      hint="Z dostępnych materiałów"
                      valueClass={maxProducible > 0 ? "text-emerald-700" : "text-slate-900"}
                    />
                    <StatCell
                      label="Koszt / szt. (netto)"
                      value={
                        estimatedUnitCost != null ? `${formatProductionMoney(estimatedUnitCost)}` : "—"
                      }
                    />
                    <StatCell
                      label="Ostatnia aktualizacja"
                      value={formatRecipeUpdatedAt(activeRecipe.updated_at || activeRecipe.created_at)}
                      hint={undefined}
                    />
                  </div>
                </div>

                {/* Composition table */}
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-5 py-3">
                    <h3 className="text-sm font-bold text-slate-900">Skład receptury</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          <th className="px-5 py-2.5 font-semibold">Produkt / składnik</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Ilość</th>
                          <th className="px-3 py-2.5 font-semibold">Jednostka</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Dostępne</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Koszt / szt.</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Odpad %</th>
                          <th className="px-5 py-2.5 text-right font-semibold">Akcje</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {(detail.components || []).map((c) => {
                          const waste = wasteByComponent.get(c.component_product_id) ?? 0;
                          const enough = c.shortage <= 1e-6;
                          const busy = removingLineKey === String(c.component_product_id);
                          return (
                            <tr key={c.component_product_id} className="hover:bg-slate-50/60">
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-3">
                                  <ProductThumb
                                    imageUrl={c.product_image_url}
                                    name={c.product_name}
                                    size="sm"
                                    className="rounded"
                                  />
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-slate-900">{c.product_name}</p>
                                    {c.product_sku ? (
                                      <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                                        {c.product_sku}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-800">
                                {formatProductionQuantity(c.required_per_unit)}
                              </td>
                              <td className="px-3 py-3 text-slate-600">szt.</td>
                              <td className="px-3 py-3 text-right">
                                <div className="font-mono tabular-nums text-slate-800">
                                  {formatProductionQuantity(c.available)}
                                </div>
                                <div
                                  className={`mt-0.5 text-[11px] font-semibold ${
                                    enough ? "text-emerald-600" : "text-red-600"
                                  }`}
                                >
                                  {enough
                                    ? "Wystarczająco"
                                    : `Brakuje ${formatProductionQuantity(c.shortage)}`}
                                </div>
                              </td>
                              <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-800">
                                {c.unit_cost_net != null ? formatProductionMoney(c.unit_cost_net) : "—"}
                              </td>
                              <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-700">
                                {formatProductionQuantity(waste)}
                              </td>
                              <td className="px-5 py-3">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    title="Edytuj recepturę"
                                    onClick={() => openEdit(activeRecipe.id)}
                                    className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                  >
                                    <Pencil className="h-4 w-4" aria-hidden />
                                  </button>
                                  <button
                                    type="button"
                                    title="Usuń składnik"
                                    disabled={busy}
                                    onClick={() => void handleRemoveComponent(c.component_product_id)}
                                    className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                  >
                                    <Trash2 className="h-4 w-4" aria-hidden />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="border-t border-slate-100 px-5 py-3">
                    <button
                      type="button"
                      onClick={() => openEdit(activeRecipe.id)}
                      className="inline-flex items-center text-sm font-semibold text-sky-700 hover:text-sky-900 hover:underline"
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                      Dodaj składnik
                    </button>
                  </div>
                </div>

                {/* Production flow — inputs → process → output */}
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-5 py-3">
                    <h3 className="text-sm font-bold text-slate-900">Przepływ produkcji</h3>
                  </div>
                  <div className="flex flex-col items-center gap-2 px-5 py-6">
                    {(detail.components || []).map((c) => (
                      <div
                        key={`flow-in-${c.component_product_id}`}
                        className="w-full max-w-md rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-center shadow-sm"
                      >
                        <p className="text-sm font-medium text-slate-800">{c.product_name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {formatProductionQuantity(c.required_per_unit)} szt.
                        </p>
                      </div>
                    ))}
                    {(detail.components || []).length === 0 ? (
                      <p className="text-sm text-slate-500">Brak składników.</p>
                    ) : null}

                    <div className="flex flex-col items-center text-slate-300" aria-hidden>
                      <div className="h-4 w-px bg-slate-300" />
                      <span className="text-xs">↓</span>
                    </div>

                    <div className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-center shadow-sm">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Produkcja</p>
                      <p className="mt-0.5 text-sm font-semibold text-slate-800">
                        {activeRecipe.name || "Receptura produkcyjna"}
                      </p>
                    </div>

                    <div className="flex flex-col items-center text-slate-300" aria-hidden>
                      <div className="h-4 w-px bg-slate-300" />
                      <span className="text-xs">↓</span>
                    </div>

                    <div className="w-full max-w-md rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-center shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600">
                        Produkt końcowy
                      </p>
                      <p className="mt-1 text-sm font-bold text-violet-900">{heroName}</p>
                      <p className="mt-0.5 text-xs text-violet-700">
                        {formatProductionQuantity(yieldQty)} szt.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* RIGHT ~30% */}
          <div className="min-w-0 space-y-5">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-bold text-slate-900">Zużycie w innych produktach</h3>
              {usages.length === 0 ? (
                <p className="text-sm text-slate-500">Ten produkt nie jest składnikiem innych receptur.</p>
              ) : (
                usages.map((u) => (
                  <div
                    key={`${u.composition_id}-${u.parent_product_id}`}
                    className="flex items-center justify-between border-b border-slate-50 py-2 last:border-0"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="truncate text-sm font-medium text-slate-800">{u.parent_product_name}</div>
                      <div className="mt-0.5 text-[10px] uppercase text-slate-500">{u.composition_name}</div>
                    </div>
                    <div className="shrink-0 rounded bg-slate-50 px-2 py-0.5 font-mono text-sm text-slate-600">
                      ×{formatProductionQuantity(u.quantity)}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-bold text-slate-900">Historia produkcji produktu</h3>
              {history.length === 0 ? (
                <p className="mb-4 text-sm text-slate-500">Brak zleceń produkcyjnych dla tego produktu.</p>
              ) : (
                <table className="mb-4 w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400">
                      <th className="pb-2 font-semibold">Nr</th>
                      <th className="pb-2 font-semibold">Status</th>
                      <th className="pb-2 text-right font-semibold">Ilość</th>
                      <th className="pb-2 text-right font-semibold">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {history.slice(0, 8).map((h) => {
                      const href =
                        h.id < 0 ? erpProductionPaths.batch(-h.id) : erpProductionPaths.order(h.id);
                      return (
                        <tr key={h.id}>
                          <td className="py-2.5 font-mono text-xs text-slate-600">
                            <Link to={href} className="hover:underline">
                              {h.number}
                            </Link>
                          </td>
                          <td className="py-2.5">
                            <StatusBadge
                              tone={executionStatusTone(h.status)}
                              className="!text-[10px] !font-bold"
                            >
                              {PRODUCTION_STATUS_LABEL[h.status] ?? h.status}
                            </StatusBadge>
                          </td>
                          <td className="py-2.5 text-right font-mono text-slate-800">
                            {formatProductionQuantity(
                              h.status === "completed" ? h.produced_quantity : h.planned_quantity,
                            )}
                          </td>
                          <td className="py-2.5 text-right text-xs text-slate-500">
                            {formatHistoryDate(h.completed_at || h.created_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {rwPw?.rwId || rwPw?.pwId ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  {rwPw.rwId ? (
                    <Link
                      to={warehouseStockDocumentPath("RW", rwPw.rwId)}
                      className="rounded bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                    >
                      RW {rwPw.rwNumber ?? `#${rwPw.rwId}`}
                    </Link>
                  ) : null}
                  {rwPw.pwId ? (
                    <Link
                      to={warehouseStockDocumentPath("PW", rwPw.pwId)}
                      className="rounded bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                    >
                      PW {rwPw.pwNumber ?? `#${rwPw.pwId}`}
                    </Link>
                  ) : null}
                </div>
              ) : null}

              <Link
                to={erpProductionPaths.history}
                className="text-xs font-semibold text-sky-700 hover:underline"
              >
                Zobacz pełną historię
              </Link>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-1 text-sm font-bold text-slate-900">Szacowany koszt produkcji</h3>
              <div className="mt-3">
                {estimatedUnitCost != null ? (
                  <>
                    <div className="font-mono text-2xl font-bold text-slate-900">
                      {formatProductionMoney(estimatedUnitCost)}
                    </div>
                    <div className="mb-1 mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                      Netto / szt. (aktywna receptura)
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">
                    Koszt pojawi się po zdefiniowaniu składników receptury.
                  </p>
                )}
              </div>
            </div>

            {recipes.length > 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-4 text-sm font-bold text-slate-900">Wersje receptury</h3>
                <div className="space-y-3">
                  {recipes.map((r) => (
                    <div
                      key={r.id}
                      className={
                        r.is_active
                          ? "flex items-start justify-between rounded-lg border border-emerald-100 bg-emerald-50 p-3"
                          : "flex items-start justify-between rounded-lg border border-slate-100 bg-slate-50 p-3"
                      }
                    >
                      <div>
                        <div
                          className={`text-sm font-bold ${r.is_active ? "text-emerald-900" : "text-slate-900"}`}
                        >
                          {r.name}
                        </div>
                        <div
                          className={`mt-0.5 text-[10px] ${r.is_active ? "text-emerald-700" : "text-slate-500"}`}
                        >
                          v{r.version} · wydajność {formatProductionQuantity(r.yield_quantity)} szt.
                        </div>
                        <div className="mt-2 text-xs">
                          <button
                            type="button"
                            onClick={() => openEdit(r.id)}
                            className={`font-medium hover:underline ${
                              r.is_active ? "text-emerald-700" : "text-slate-700"
                            }`}
                          >
                            Edytuj
                          </button>
                          {!r.is_active ? (
                            <>
                              <span className="mx-1 text-slate-300">|</span>
                              <button
                                type="button"
                                disabled={activatingId === r.id}
                                onClick={() => void handleActivate(r.id)}
                                className="font-medium text-violet-700 hover:underline disabled:opacity-50"
                              >
                                {activatingId === r.id ? "Aktywowanie…" : "Aktywuj"}
                              </button>
                            </>
                          ) : null}
                          <span className={`mx-1 ${r.is_active ? "text-emerald-300" : "text-slate-300"}`}>
                            |
                          </span>
                          <Link
                            to={erpProductionPaths.recipe(r.id)}
                            className={`font-medium hover:underline ${
                              r.is_active ? "text-emerald-700" : "text-slate-700"
                            }`}
                          >
                            Otwórz
                          </Link>
                        </div>
                      </div>
                      {r.is_active ? (
                        <Badge
                          tone="success"
                          className="!rounded !px-1.5 !py-0.5 !text-[9px] !font-bold !uppercase !tracking-wider"
                        >
                          Aktywna
                        </Badge>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function intId(v: number | string): number {
  return Number(v);
}

function StatCell({
  label,
  value,
  hint,
  valueClass = "text-slate-900",
}: {
  label: string;
  value: string;
  hint?: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 font-mono text-base font-bold tabular-nums ${valueClass}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-slate-400">{hint}</p> : null}
    </div>
  );
}
