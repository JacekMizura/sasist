import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ExternalLink, Factory, Plus } from "lucide-react";
import {
  listCompositionsForProduct,
  listCompositionUsages,
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
import {
  formatProductionMoney,
  PRODUCTION_STATUS_LABEL,
  productionStatusBadgeClass,
  stockTone,
  STOCK_TONE_CLASS,
} from "./productionUi";
import { ProductThumb } from "./components/ProductThumb";
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

  const activeRecipe = useMemo(
    () => recipes.find((c) => c.is_active) ?? recipes[0] ?? null,
    [recipes],
  );

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
      if (latestCompleted) {
        try {
          const full = await getProductionOrder(tenantId, latestCompleted.id);
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
    void reload();
    onChanged?.();
  };

  const latestProduction = history[0] ?? null;

  if (loading) {
    return <p className="text-sm text-slate-500">Wczytywanie danych produkcji…</p>;
  }

  return (
    <div className="space-y-10">
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

      {!activeRecipe || !detail ? (
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
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Receptura produkcyjna (BOM)</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">Szac. koszt / szt.</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{formatProductionMoney(detail.unit_cost_net)}</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">Składniki</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{detail.components.length}</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">Można wyprodukować</p>
              <p className="mt-1 text-lg font-semibold text-emerald-800">{Math.floor(detail.max_producible)} szt.</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">Ostatnia produkcja</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {latestProduction ? (
                  <>
                    {latestProduction.number}
                    <span className={`ml-2 ${productionStatusBadgeClass(latestProduction.status)}`}>
                      {PRODUCTION_STATUS_LABEL[latestProduction.status]}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-600">
            <span>
              <strong>{detail.recipe_name}</strong> · v{detail.version} · wydajność {detail.yield_quantity} szt.
            </span>
            {detail.has_shortages ? (
              <span className="inline-flex items-center gap-1 text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                Braki składników
              </span>
            ) : null}
          </div>
          <Link
            to={erpProductionPaths.recipe(activeRecipe.id)}
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-slate-800 underline hover:text-slate-600"
          >
            Otwórz recepturę w ERP
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </section>
      )}

      <CompositionVisualEditor
        tenantId={tenantId}
        productId={productId}
        productName={productName}
        mode="manufacturing"
        compositions={recipes}
        onChanged={handleChanged}
        sectionTitle="Receptury produkcyjne"
        sectionHint="BOM — składniki, wydajność i wersje. Zużycie materiałów i dokumenty RW/PW przy realizacji zlecenia."
        requestNewEditor={requestNewRecipe}
        onRequestNewHandled={() => setRequestNewRecipe(false)}
      />

      {detail ? (
        <>
          <section>
            <h3 className="mb-4 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Składniki (BOM)</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {detail.components.map((c) => {
                const tone = stockTone(c.required_per_unit, c.available);
                return (
                  <div key={c.component_product_id} className={`rounded-lg border p-4 ${STOCK_TONE_CLASS[tone]}`}>
                    <div className="flex gap-3">
                      <ProductThumb imageUrl={c.product_image_url} name={c.product_name} size="sm" />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-medium text-slate-900">{c.product_name}</p>
                        <p className="text-xs text-slate-500">
                          Wymagane: {c.required_per_unit} · Dostępne: {c.available}
                          {c.shortage > 0 ? ` · Brakuje ${c.shortage}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">Koszt: {formatProductionMoney(c.line_cost_net)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            <h3 className="mb-2 font-semibold text-slate-900">Podgląd dokumentów magazynowych (RW / PW)</h3>
            <p className="text-slate-600">
              Po zakończeniu produkcji system generuje <strong>RW</strong> (zużycie składników) i <strong>PW</strong> (przyjęcie wyrobu gotowego).
            </p>
            {rwPw?.rwId || rwPw?.pwId ? (
              <div className="mt-3 flex flex-wrap gap-3">
                {rwPw.rwId ? (
                  <Link
                    to={`/documents/warehouse?doc=${rwPw.rwId}`}
                    className="rounded bg-white px-3 py-1.5 text-xs font-medium text-slate-800 ring-1 ring-slate-200 hover:bg-slate-100"
                  >
                    RW {rwPw.rwNumber ?? `#${rwPw.rwId}`}
                  </Link>
                ) : null}
                {rwPw.pwId ? (
                  <Link
                    to={`/documents/warehouse?doc=${rwPw.pwId}`}
                    className="rounded bg-white px-3 py-1.5 text-xs font-medium text-slate-800 ring-1 ring-slate-200 hover:bg-slate-100"
                  >
                    PW {rwPw.pwNumber ?? `#${rwPw.pwId}`}
                  </Link>
                ) : null}
                <span className="text-xs text-slate-500">— z ostatniego zakończonego zlecenia</span>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Brak zakończonych zleceń z wygenerowanymi dokumentami.</p>
            )}
          </section>
        </>
      ) : null}

      {usages.length > 0 ? (
        <section>
          <h3 className="mb-3 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Zużycie materiałów</h3>
          <p className="mb-3 text-sm text-slate-500">Ten produkt jest składnikiem w następujących recepturach produkcyjnych:</p>
          <ul className="space-y-2 text-sm">
            {usages.map((u) => (
              <li key={`${u.composition_id}-${u.parent_product_id}`} className="flex justify-between gap-4 rounded-lg border border-slate-100 px-3 py-2">
                <span>
                  <span className="font-medium text-slate-900">{u.parent_product_name}</span>
                  <span className="text-slate-500"> — {u.composition_name}</span>
                </span>
                <span className="text-slate-600">× {u.quantity}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h3 className="mb-3 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Historia produkcji produktu</h3>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">Brak zleceń produkcyjnych dla tego produktu.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Nr zlecenia</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Ilość</th>
                  <th className="px-3 py-2">Koszt jdn.</th>
                  <th className="px-3 py-2">Data</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="px-3 py-2">
                      <Link to={erpProductionPaths.orders} className="font-mono text-slate-800 hover:underline">
                        {h.number}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span className={productionStatusBadgeClass(h.status)}>{PRODUCTION_STATUS_LABEL[h.status]}</span>
                    </td>
                    <td className="px-3 py-2">{h.status === "completed" ? h.produced_quantity : h.planned_quantity}</td>
                    <td className="px-3 py-2">{formatProductionMoney(h.calculated_unit_cost)}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{(h.completed_at || h.created_at || "").slice(0, 10) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Link
          to={erpProductionPaths.history}
          className="mt-3 inline-block text-xs font-medium text-slate-600 underline hover:text-slate-800"
        >
          Pełna historia w module ERP →
        </Link>
      </section>
    </div>
  );
}
