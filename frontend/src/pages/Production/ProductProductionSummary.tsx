import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Factory } from "lucide-react";
import { listCompositionsForProduct, type ProductCompositionRead } from "../../api/compositionApi";
import { getRecipeDetail, type RecipeDetailRead } from "../../api/productionApi";
import { erpProductionPaths } from "./productionPaths";
import { formatProductionMoney } from "./productionUi";

type Props = {
  tenantId: number;
  productId: number;
  warehouseId?: number;
};

function estimateDurationMinutes(componentCount: number): number {
  return Math.max(5, componentCount * 3);
}

export function ProductProductionSummary({ tenantId, productId, warehouseId }: Props) {
  const [composition, setComposition] = useState<ProductCompositionRead | null>(null);
  const [detail, setDetail] = useState<RecipeDetailRead | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const mfg = await listCompositionsForProduct(tenantId, productId, "manufacturing");
      const active = mfg.find((c) => c.is_active) ?? mfg[0] ?? null;
      setComposition(active);
      if (active) {
        setDetail(await getRecipeDetail(tenantId, active.id, warehouseId));
      } else {
        setDetail(null);
      }
    } catch {
      setComposition(null);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, productId, warehouseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) {
    return <p className="text-sm text-slate-500">Wczytywanie danych produkcji…</p>;
  }

  if (!composition || !detail) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-5">
        <p className="text-sm text-slate-600">Brak receptury produkcyjnej dla tego produktu.</p>
        <Link
          to={erpProductionPaths.recipes}
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-slate-800 underline hover:text-slate-600"
        >
          <Factory className="h-4 w-4" aria-hidden />
          Zarządzaj recepturami w ERP
        </Link>
      </div>
    );
  }

  const durationMin = estimateDurationMinutes(detail.components.length);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Produkcja</h3>
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
          <dt className="text-slate-500">Receptura</dt>
          <dd className="font-medium text-slate-900 text-right">
            {detail.recipe_name}
            <span className="ml-1 text-xs text-slate-400">v{detail.version}</span>
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
          <dt className="text-slate-500">Szac. koszt produkcji</dt>
          <dd className="font-semibold tabular-nums text-slate-900">{formatProductionMoney(detail.unit_cost_net)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Szac. czas produkcji</dt>
          <dd className="font-medium text-slate-900">{durationMin} min</dd>
        </div>
      </dl>
      <Link
        to={erpProductionPaths.recipe(composition.id)}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100"
      >
        Otwórz recepturę
        <ExternalLink className="h-4 w-4" aria-hidden />
      </Link>
      <p className="mt-3 text-xs text-slate-400">
        Pełne zarządzanie recepturą i zleceniami — w module{" "}
        <Link to={erpProductionPaths.home} className="underline hover:text-slate-600">
          ERP Produkcja
        </Link>
        .
      </p>
    </section>
  );
}
