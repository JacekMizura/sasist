import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import toast from "react-hot-toast";

import { fetchMaterialPortfolio, type MaterialPortfolioRow } from "@/api/productionShortageApi";
import { extractApiErrorMessage } from "@/api/apiErrorMessage";
import { useWarehouse } from "@/context/WarehouseContext";
import { PageHeader, SecondaryButton } from "@/design-system";
import { ProductThumb } from "./components/ProductThumb";
import { productionPageStackClass, productionPageTitleClass } from "./productionLayoutTokens";

const DEFAULT_TENANT = 1;

export default function MaterialAnalysisPage() {
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [rows, setRows] = useState<MaterialPortfolioRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (warehouseId == null) return;
    setLoading(true);
    try {
      setRows(await fetchMaterialPortfolio(tenantId, warehouseId));
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, "Nie udało się wczytać analizy materiałowej."));
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (warehouseId == null) {
    return <p className="px-4 py-6 text-sm text-slate-500">Wybierz magazyn.</p>;
  }

  return (
    <div className={productionPageStackClass}>
      <PageHeader
        title={<h1 className={productionPageTitleClass}>Analiza materiałowa</h1>}
        actions={
          <SecondaryButton type="button" onClick={() => void load()} className="inline-flex items-center gap-1.5">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            Odśwież
          </SecondaryButton>
        }
      >
        <div className="space-y-4">
      {loading ? (
        <p className="text-sm text-slate-500">Wczytywanie…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          Brak składników w aktywnych recepturach produkcyjnych.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Materiał</th>
                <th className="px-4 py-3 text-right">Receptury</th>
                <th className="px-4 py-3 text-right">Blokady</th>
                <th className="px-4 py-3 text-right">Stan</th>
                <th className="px-4 py-3 text-right">Rezerw.</th>
                <th className="px-4 py-3 text-right">Dostępne</th>
                <th className="px-4 py-3 text-right">Zużycie/d</th>
                <th className="px-4 py-3">Wyczerpanie</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.component_product_id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ProductThumb imageUrl={r.product_image_url} name={r.product_name} size="sm" />
                      <div>
                        <p className="font-medium text-slate-900">{r.product_name}</p>
                        {r.product_sku ? <p className="font-mono text-xs text-slate-500">{r.product_sku}</p> : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.recipe_usage_count}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-amber-800">
                    {r.blocked_productions_count || "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.on_hand_qty}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-violet-700">{r.reserved_qty}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{r.available_qty}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.forecast_daily_usage.toFixed(2)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{r.forecast_depletion_date ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
        </div>
      </PageHeader>
    </div>
  );
}
