import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Factory, Plus } from "lucide-react";
import {
  activateComposition,
  listCompositionsForProduct,
  listCompositionUsages,
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
import { erpProductionPaths } from "./productionPaths";
import { warehouseStockDocumentPath } from "../../utils/stockDocumentPaths";
import {
  formatProductionMoney,
  PRODUCTION_STATUS_LABEL,
  productionStatusBadgeClass,
} from "./productionUi";
import { useWarehouse } from "../../context/WarehouseContext";

type Props = {
  tenantId: number;
  productId: number;
  productName: string;
  onChanged?: () => void;
};

type RwPwPreview = {
  rwNumber?: string | null;
  rwId?: number | null;
  pwNumber?: string | null;
  pwId?: number | null;
};

function InfoPanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 border-b border-slate-200 pb-2 text-sm font-bold text-slate-900">{title}</h3>
      {children}
    </section>
  );
}

export function ProductManufacturingPanel({ tenantId, productId, productName, onChanged }: Props) {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id;
  const [recipes, setRecipes] = useState<ProductCompositionRead[]>([]);
  const [detail, setDetail] = useState<RecipeDetailRead | null>(null);
  const [history, setHistory] = useState<ProductionOrderSummaryRead[]>([]);
  const [usages, setUsages] = useState<CompositionUsageRead[]>([]);
  const [rwPw, setRwPw] = useState<RwPwPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [requestNewRecipe, setRequestNewRecipe] = useState(false);
  const [editRecipeId, setEditRecipeId] = useState<number | null>(null);
  const [liveCost, setLiveCost] = useState<CompositionCostEstimateRead | null>(null);
  const [activatingId, setActivatingId] = useState<number | null>(null);
  const [autoOpenedRecipe, setAutoOpenedRecipe] = useState(false);

  const activeRecipe = useMemo(
    () => recipes.find((c) => c.is_active) ?? recipes[0] ?? null,
    [recipes],
  );

  const estimatedUnitCost = liveCost?.unit_cost_net ?? detail?.unit_cost_net ?? null;

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

  useEffect(() => {
    if (autoOpenedRecipe || loading || recipes.length === 0) return;
    const initial = recipes.find((c) => c.is_active) ?? recipes[0];
    if (initial) setEditRecipeId(initial.id);
    setAutoOpenedRecipe(true);
  }, [autoOpenedRecipe, loading, recipes]);

  const handleChanged = () => {
    setLiveCost(null);
    void reload();
    onChanged?.();
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

  if (loading) {
    return <p className="text-sm text-slate-500">Wczytywanie danych produkcji…</p>;
  }

  return (
    <div className="space-y-4">
      {err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <p className="text-sm text-slate-600">
          Warstwa definicji produkcji (BOM / receptura). Planowanie zleceń i harmonogram — w module{" "}
          <Link to={erpProductionPaths.home} className="font-semibold text-slate-800 underline hover:text-slate-600">
            ERP Produkcja
          </Link>
          . Wykonanie — w{" "}
          <Link to="/wms/production/collecting" className="font-semibold text-slate-800 underline hover:text-slate-600">
            terminalu WMS
          </Link>
          .
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        <div className="min-w-0 space-y-4">
          {!activeRecipe && recipes.length === 0 ? (
            <section className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
              <Factory className="mx-auto h-10 w-10 text-slate-400" aria-hidden />
              <h3 className="mt-4 text-lg font-semibold text-slate-900">Ten produkt nie posiada receptury produkcyjnej</h3>
              <p className="mt-2 text-sm text-slate-500">
                Zdefiniuj BOM (składniki, wydajność, koszt), aby móc planować i wykonywać produkcję z dokumentami RW/PW.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setRequestNewRecipe(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-900"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Utwórz recepturę
                </button>
                <Link
                  to={erpProductionPaths.orders}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  Otwórz moduł Produkcja ERP
                  <ExternalLink className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            </section>
          ) : (
            <CompositionVisualEditor
              tenantId={tenantId}
              productId={productId}
              productName={productName}
              mode="manufacturing"
              compositions={recipes}
              onChanged={handleChanged}
              sectionTitle="Receptura produkcyjna"
              sectionHint="Dane receptury, składniki i podgląd BOM."
              requestNewEditor={requestNewRecipe}
              onRequestNewHandled={() => setRequestNewRecipe(false)}
              hideCompositionCards
              editCompositionId={editRecipeId}
              onEditCompositionHandled={() => setEditRecipeId(null)}
              onCostEstimateChange={setLiveCost}
            />
          )}
        </div>

        <aside className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:self-start">
          <InfoPanelSection title="Zużycie materiałów">
            {usages.length === 0 ? (
              <p className="text-sm text-slate-500">Ten produkt nie jest składnikiem innych receptur.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {usages.map((u) => (
                  <li
                    key={`${u.composition_id}-${u.parent_product_id}`}
                    className="flex justify-between gap-3 rounded-lg border border-slate-100 px-2.5 py-2"
                  >
                    <span className="min-w-0">
                      <span className="font-medium text-slate-900">{u.parent_product_name}</span>
                      <span className="block truncate text-xs text-slate-500">{u.composition_name}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-600">× {u.quantity}</span>
                  </li>
                ))}
              </ul>
            )}
          </InfoPanelSection>

          <InfoPanelSection title="Historia produkcji produktu">
            {history.length === 0 ? (
              <p className="text-sm text-slate-500">Brak zleceń produkcyjnych dla tego produktu.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-2 py-1.5">Nr</th>
                      <th className="px-2 py-1.5">Status</th>
                      <th className="px-2 py-1.5 text-right">Ilość</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.slice(0, 8).map((h) => {
                      const href = h.id < 0 ? erpProductionPaths.batch(-h.id) : erpProductionPaths.order(h.id);
                      return (
                      <tr key={h.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                        <td className="px-2 py-1.5">
                          <Link to={href} className="font-mono text-xs text-slate-800 hover:underline">
                            {h.number}
                          </Link>
                        </td>
                        <td className="px-2 py-1.5">
                          <span className={productionStatusBadgeClass(h.status)}>{PRODUCTION_STATUS_LABEL[h.status]}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {h.status === "completed" ? h.produced_quantity : h.planned_quantity}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {rwPw?.rwId || rwPw?.pwId ? (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
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
              className="mt-3 inline-block text-xs font-medium text-slate-600 underline hover:text-slate-800"
            >
              Pełna historia w module ERP →
            </Link>
          </InfoPanelSection>

          <InfoPanelSection title="Szacowany koszt produkcji">
            {estimatedUnitCost != null ? (
              <>
                <p className="text-2xl font-semibold tabular-nums text-slate-900">{formatProductionMoney(estimatedUnitCost)}</p>
                <p className="mt-1 text-xs text-slate-500">netto / szt. (aktywna receptura)</p>
                {detail ? (
                  <p className="mt-3 text-sm text-slate-600">
                    Można wyprodukować:{" "}
                    <strong className="text-emerald-800">{Math.floor(detail.max_producible)} szt.</strong>
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-slate-500">Koszt pojawi się po zdefiniowaniu składników receptury.</p>
            )}
          </InfoPanelSection>

          {recipes.length > 0 ? (
            <InfoPanelSection title="Wersje receptury">
              <ul className="space-y-2">
                {recipes.map((r) => (
                  <li
                    key={r.id}
                    className={`rounded-lg border px-3 py-2.5 text-sm ${
                      r.is_active ? "border-emerald-200 bg-emerald-50/60" : "border-slate-100 bg-slate-50/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{r.name}</p>
                        <p className="text-xs text-slate-500">
                          v{r.version} · {r.lines.length} skł. · wydajność {r.yield_quantity} szt.
                        </p>
                      </div>
                      {r.is_active ? (
                        <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">
                          Aktywna
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setEditRecipeId(r.id)}
                        className="text-xs font-medium text-slate-700 underline hover:text-slate-900"
                      >
                        Edytuj
                      </button>
                      {!r.is_active ? (
                        <button
                          type="button"
                          disabled={activatingId === r.id}
                          onClick={() => void handleActivate(r.id)}
                          className="text-xs font-medium text-violet-700 underline hover:text-violet-900 disabled:opacity-50"
                        >
                          {activatingId === r.id ? "Aktywowanie…" : "Aktywuj"}
                        </button>
                      ) : null}
                      <Link
                        to={erpProductionPaths.recipe(r.id)}
                        className="text-xs font-medium text-slate-500 underline hover:text-slate-700"
                      >
                        ERP →
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </InfoPanelSection>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
