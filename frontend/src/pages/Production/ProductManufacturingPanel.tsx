import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
import { Badge, StatusBadge } from "../../design-system";
import { erpProductionPaths } from "./productionPaths";
import { warehouseStockDocumentPath } from "../../utils/stockDocumentPaths";
import {
  executionStatusTone,
  formatProductionMoney,
  PRODUCTION_STATUS_LABEL,
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

/**
 * Product edit — Produkcja tab.
 * DOM hierarchy is a structural 1:1 port of `produkcja karta produktu.html`
 * (full-width body under tabs).
 */
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
    return <p className="text-sm text-gray-500">Wczytywanie danych produkcji…</p>;
  }

  return (
    /* mock body under tabs — full page width (no max-w-7xl) */
    <div className="w-full max-w-none space-y-6">
      {err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
      ) : null}

      {/* Info banner — 1:1 mock */}
      <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 shadow-sm">
        Warstwa definicji produkcji (BOM / receptura). Planowanie zleceń i harmonogram — w module{" "}
        <Link to={erpProductionPaths.home} className="mx-1 font-semibold text-gray-800 hover:underline">
          ERP Produkcja
        </Link>
        . Wykonanie — w terminalu{" "}
        <Link to="/wms/production/collecting" className="ml-1 font-semibold text-gray-800 hover:underline">
          WMS
        </Link>
        .
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* LEWA — receptura (2 cols) */}
        <div className="space-y-6 lg:col-span-2">
          <CompositionVisualEditor
            tenantId={tenantId}
            productId={productId}
            productName={productName}
            mode="manufacturing"
            compositions={recipes}
            onChanged={handleChanged}
            sectionTitle="Receptura produkcyjna"
            sectionHint="Dane receptury, składniki i podgląd BOM"
            requestNewEditor={requestNewRecipe}
            onRequestNewHandled={() => setRequestNewRecipe(false)}
            hideCompositionCards
            editCompositionId={editRecipeId}
            onEditCompositionHandled={() => setEditRecipeId(null)}
            onCostEstimateChange={setLiveCost}
          />
        </div>

        {/* PRAWA — widżety; pt-11 wyrównanie z nagłówkiem receptury */}
        <div className="space-y-6 pt-11 lg:pt-11">
          {/* Zużycie w innych produktach */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-bold text-gray-900">Zużycie w innych produktach</h3>
            {usages.length === 0 ? (
              <p className="text-sm text-gray-500">Ten produkt nie jest składnikiem innych receptur.</p>
            ) : (
              usages.map((u) => (
                <div
                  key={`${u.composition_id}-${u.parent_product_id}`}
                  className="flex items-center justify-between border-b border-gray-50 py-2 last:border-0"
                >
                  <div>
                    <div className="text-sm font-medium text-gray-800">{u.parent_product_name}</div>
                    <div className="mt-0.5 text-[10px] uppercase text-gray-500">{u.composition_name}</div>
                  </div>
                  <div className="rounded bg-gray-50 px-2 py-0.5 font-mono text-sm text-gray-600">
                    x {u.quantity}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Historia produkcji */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-bold text-gray-900">Historia produkcji produktu</h3>
            {history.length === 0 ? (
              <p className="mb-4 text-sm text-gray-500">Brak zleceń produkcyjnych dla tego produktu.</p>
            ) : (
              <table className="mb-4 w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
                    <th className="pb-2 font-semibold">Nr</th>
                    <th className="pb-2 font-semibold">Status</th>
                    <th className="pb-2 text-right font-semibold">Ilość</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {history.slice(0, 8).map((h) => {
                    const href = h.id < 0 ? erpProductionPaths.batch(-h.id) : erpProductionPaths.order(h.id);
                    return (
                      <tr key={h.id}>
                        <td className="py-2.5 font-mono text-xs text-gray-600">
                          <Link to={href} className="hover:underline">
                            {h.number}
                          </Link>
                        </td>
                        <td className="py-2.5">
                          <StatusBadge tone={executionStatusTone(h.status)} className="!text-[10px] !font-bold">
                            {PRODUCTION_STATUS_LABEL[h.status] ?? h.status}
                          </StatusBadge>
                        </td>
                        <td className="py-2.5 text-right font-mono text-gray-800">
                          {h.status === "completed" ? h.produced_quantity : h.planned_quantity}
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
                    className="rounded bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100"
                  >
                    RW {rwPw.rwNumber ?? `#${rwPw.rwId}`}
                  </Link>
                ) : null}
                {rwPw.pwId ? (
                  <Link
                    to={warehouseStockDocumentPath("PW", rwPw.pwId)}
                    className="rounded bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100"
                  >
                    PW {rwPw.pwNumber ?? `#${rwPw.pwId}`}
                  </Link>
                ) : null}
              </div>
            ) : null}

            <Link to={erpProductionPaths.history} className="text-xs text-blue-600 hover:underline">
              Pełna historia w module ERP →
            </Link>
          </div>

          {/* Szacowany koszt */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-1 text-sm font-bold text-gray-900">Szacowany koszt produkcji</h3>
            <div className="mt-3">
              {estimatedUnitCost != null ? (
                <>
                  <div className="flex items-baseline">
                    <span className="font-mono text-2xl font-bold text-gray-900">
                      {formatProductionMoney(estimatedUnitCost)}
                    </span>
                  </div>
                  <div className="mb-3 mt-0.5 text-[10px] uppercase text-gray-500">
                    netto / szt. (aktywna receptura)
                  </div>
                  {detail ? (
                    <div className="text-sm text-gray-700">
                      Można wyprodukować:{" "}
                      <span className="font-mono font-bold text-green-600">
                        {Math.floor(detail.max_producible)} szt.
                      </span>
                    </div>
                  ) : null}
                  <p className="mt-1 text-[10px] leading-tight text-gray-400">
                    Ilość możliwa do wyprodukowania na podstawie obecnych stanów magazynowych składników.
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-500">Koszt pojawi się po zdefiniowaniu składników receptury.</p>
              )}
            </div>
          </div>

          {/* Wersje receptury */}
          {recipes.length > 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-bold text-gray-900">Wersje receptury</h3>
              <div className="space-y-3">
                {recipes.map((r) => (
                  <div
                    key={r.id}
                    className={
                      r.is_active
                        ? "flex items-start justify-between rounded-lg border border-emerald-100 bg-emerald-50 p-3"
                        : "flex items-start justify-between rounded-lg border border-gray-100 bg-gray-50 p-3"
                    }
                  >
                    <div>
                      <div
                        className={`text-sm font-bold ${r.is_active ? "text-emerald-900" : "text-gray-900"}`}
                      >
                        {r.name}
                      </div>
                      <div className={`mt-0.5 text-[10px] ${r.is_active ? "text-emerald-700" : "text-gray-500"}`}>
                        v{r.version} · {r.lines.length} skł. · wydajność {r.yield_quantity} szt.
                      </div>
                      <div className="mt-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setEditRecipeId(r.id)}
                          className={`font-medium hover:underline ${r.is_active ? "text-emerald-700" : "text-gray-700"}`}
                        >
                          Edytuj
                        </button>
                        {!r.is_active ? (
                          <>
                            <span className="mx-1 text-gray-300">|</span>
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
                        <span className={`mx-1 ${r.is_active ? "text-emerald-300" : "text-gray-300"}`}>|</span>
                        <Link
                          to={erpProductionPaths.recipe(r.id)}
                          className={`font-medium hover:underline ${r.is_active ? "text-emerald-700" : "text-gray-700"}`}
                        >
                          ERP →
                        </Link>
                      </div>
                    </div>
                    {r.is_active ? (
                      <Badge tone="success" className="!rounded !px-1.5 !py-0.5 !text-[9px] !font-bold !uppercase !tracking-wider">
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
    </div>
  );
}
