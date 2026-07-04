import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import { extractApiErrorMessage } from "../../api/apiErrorMessage";
import { useWarehouse } from "../../context/WarehouseContext";
import {
  createProductionBatch,
  getRecipeDetail,
  validateProductionBatchCreateBody,
  type RecipeDetailRead,
} from "../../api/productionApi";
import { formatProductionMoney, stockTone, STOCK_TONE_CLASS, PRODUCTION_NUMBER_INPUT } from "./productionUi";
import { erpProductionPaths } from "./productionPaths";
import { ProductThumb } from "./components/ProductThumb";

const DEFAULT_TENANT = 1;

export default function RecipeDetailPage() {
  const { compositionId } = useParams();
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [recipe, setRecipe] = useState<RecipeDetailRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [qty, setQty] = useState(10);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!compositionId) return;
    setLoading(true);
    setNotFound(false);
    try {
      setRecipe(await getRecipeDetail(tenantId, Number(compositionId), warehouseId));
    } catch (err) {
      setRecipe(null);
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setNotFound(true);
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId, compositionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const createBatch = async () => {
    if (!recipe) return;
    const validation = validateProductionBatchCreateBody(warehouseId, [
      {
        product_id: recipe.product_id,
        composition_id: recipe.composition_id,
        planned_quantity: qty,
      },
    ]);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }
    if (!recipe.is_active) {
      toast.error("Recipe (composition) is inactive");
      return;
    }
    console.log("CREATE_BATCH_PAYLOAD", { tenant_id: tenantId, ...validation.body });
    setBusy(true);
    try {
      const batch = await createProductionBatch(tenantId, validation.body);
      toast.success("Partia produkcyjna utworzona.");
      navigate(erpProductionPaths.batch(batch.id));
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, "Nie udało się utworzyć partii produkcyjnej."));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="px-4 py-6 text-sm text-slate-500">Wczytywanie receptury…</p>;
  }

  if (notFound || !recipe) {
    return (
      <div className="px-4 py-10 lg:px-6 max-w-lg">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <h2 className="text-lg font-semibold text-slate-900">Receptura nie istnieje lub została usunięta</h2>
          <p className="mt-2 text-sm text-slate-600">
            Rekord mógł zostać usunięty lub nie jest już dostępny w tym magazynie.
          </p>
          <Link
            to={erpProductionPaths.recipes}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Wróć do listy receptur
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 lg:px-6 space-y-8 max-w-5xl">
      <Link to={erpProductionPaths.recipes} className="inline-flex items-center gap-2 text-sm text-slate-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Receptury
      </Link>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap gap-6">
          <ProductThumb imageUrl={recipe.product_image_url} name={recipe.product_name} size="lg" />
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-2xl font-bold text-slate-900">{recipe.product_name}</h1>
            <p className="text-sm text-slate-500">
              {recipe.recipe_name} · v{recipe.version} · wydajność {recipe.yield_quantity}
              {!recipe.is_active ? (
                <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Archiwum</span>
              ) : null}
            </p>
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <span>
                Koszt/szt.: <strong>{formatProductionMoney(recipe.unit_cost_net)}</strong>
              </span>
              <span>
                Marża (hint): <strong>{formatProductionMoney(recipe.margin_hint)}</strong>
              </span>
              <span>
                Stan: <strong>{recipe.current_stock}</strong>
              </span>
              <span>
                Można wyprodukować: <strong className="text-slate-800">{Math.floor(recipe.max_producible)}</strong>
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div>
                <label className="text-xs text-slate-500">Ilość w batchu</label>
                <input
                  type="number"
                  min={1}
                  className={`mt-1 block w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm ${PRODUCTION_NUMBER_INPUT}`}
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value) || 1)}
                />
              </div>
              <button
                type="button"
                disabled={busy || !warehouseId}
                onClick={() => void createBatch()}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Utwórz batch
              </button>
            </div>
          </div>
        </div>
      </div>

      <section>
        <h2 className="text-lg font-bold text-slate-900 mb-4">Składniki</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {recipe.components.map((c) => {
            const tone = stockTone(c.required_per_unit, c.available);
            return (
              <div key={c.component_product_id} className={`rounded-xl border p-4 ${STOCK_TONE_CLASS[tone]}`}>
                <div className="flex gap-3">
                  <ProductThumb imageUrl={c.product_image_url} name={c.product_name} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{c.product_name}</p>
                    <p className="text-xs text-slate-500">{c.product_sku}</p>
                    <p className="mt-2 text-sm">
                      Wymagane: <strong>{c.required_per_unit}</strong> · Dostępne: <strong>{c.available}</strong>
                      {c.shortage > 0 ? <span className="text-red-700"> · Brakuje {c.shortage}</span> : null}
                    </p>
                    {c.suggested_locations.length > 0 ? (
                      <p className="mt-1 text-xs text-slate-500">Lokacje: {c.suggested_locations.join(", ")}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-600">Koszt: {formatProductionMoney(c.line_cost_net)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <p>
          Szacowany koszt całkowity: <strong>{formatProductionMoney(recipe.total_cost_net)}</strong>
        </p>
        {recipe.has_shortages ? (
          <ul className="mt-2 text-amber-800 list-disc list-inside">
            {recipe.shortage_summary.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-emerald-700">Wystarczający stan składników w magazynie.</p>
        )}
      </div>
    </div>
  );
}
