import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Factory, Plus } from "lucide-react";

import { listCompositionsForProduct, type ProductCompositionRead } from "../../../api/compositionApi";
import {
  createProductionOrder,
  listProductionOrdersForProduct,
  type ProductionOrderSummaryRead,
} from "../../../api/productionApi";
import { ProductLikeSection, productLikeFieldLabelClass, productLikeInputClass } from "../../../components/catalog";
import { useActiveWarehouseContext, ACTIVE_WAREHOUSE_REQUIRED_MESSAGE } from "../../../hooks/useActiveWarehouseContext";
import {
  formatProductionMoney,
  PRODUCTION_STATUS_LABEL,
  productionStatusBadgeClass,
} from "../../Production/productionUi";
import { erpProductionPaths } from "../../Production/productionPaths";
import type { BundleComponentRow, ProductSummary } from "../bundleEditTypes";
import { BundleProductionRecipeTable } from "./BundleProductionRecipeTable";

type Props = {
  tenantId: number;
  bundleName: string;
  /** Wewnętrzny — nie wyświetlany użytkownikowi (B1). */
  warehouseProductId: number | null;
  warehouseReady: boolean;
  rows: BundleComponentRow[];
  productCache: Record<number, ProductSummary>;
};

/**
 * Zakładka Produkcja zestawu (STOCK_PRODUCTION) — receptura ze składników + zlecenia.
 */
export function BundleProductionPanel({
  tenantId,
  bundleName,
  warehouseProductId,
  warehouseReady,
  rows,
  productCache,
}: Props) {
  const navigate = useNavigate();
  const { warehouseId, hasActiveWarehouse } = useActiveWarehouseContext();
  const fieldLabel = productLikeFieldLabelClass;
  const inputClass = productLikeInputClass;

  const [recipes, setRecipes] = useState<ProductCompositionRead[]>([]);
  const [history, setHistory] = useState<ProductionOrderSummaryRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [orderQty, setOrderQty] = useState(1);
  const [orderBusy, setOrderBusy] = useState(false);

  const activeRecipe = useMemo(
    () => recipes.find((c) => c.is_active) ?? recipes[0] ?? null,
    [recipes],
  );

  const reload = useCallback(async () => {
    if (!warehouseReady || warehouseProductId == null || warehouseProductId <= 0) {
      setRecipes([]);
      setHistory([]);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const [mfg, hRes] = await Promise.all([
        listCompositionsForProduct(tenantId, warehouseProductId, "manufacturing"),
        listProductionOrdersForProduct(tenantId, warehouseProductId),
      ]);
      setRecipes(mfg);
      setHistory(hRes);
    } catch (e) {
      setRecipes([]);
      setHistory([]);
      setErr(e instanceof Error ? e.message : "Nie udało się wczytać danych produkcji.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseProductId, warehouseReady]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreateOrder = async () => {
    if (!activeRecipe || !hasActiveWarehouse || warehouseId == null) {
      setErr(
        !hasActiveWarehouse || warehouseId == null
          ? ACTIVE_WAREHOUSE_REQUIRED_MESSAGE
          : "Brak aktywnej receptury. Zapisz zestaw ponownie lub uzupełnij składniki.",
      );
      return;
    }
    setOrderBusy(true);
    setErr(null);
    try {
      const order = await createProductionOrder(tenantId, {
        recipe_id: activeRecipe.id,
        warehouse_id: warehouseId,
        planned_quantity: orderQty,
        status: "planned",
      });
      await reload();
      navigate(erpProductionPaths.order(order.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Nie udało się utworzyć zlecenia produkcyjnego.");
    } finally {
      setOrderBusy(false);
    }
  };

  const displayName = bundleName.trim() || "zestaw";

  return (
    <div className="w-full max-w-5xl space-y-10">
      {err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
      ) : null}

      <ProductLikeSection title="Receptura produkcyjna">
        <p className="mb-4 text-sm text-slate-600">
          Skład zestawu z zakładki Produkty — podstawa konfekcjonowania gotowego SKU. Edycja składników: zakładka{" "}
          <strong>Produkty</strong>.
        </p>
        <BundleProductionRecipeTable rows={rows} productCache={productCache} />
      </ProductLikeSection>

      <ProductLikeSection title="Produkcja">
        {!warehouseReady ? (
          <p className="text-sm text-slate-600">
            Zapisz zestaw w trybie produkcji magazynowej, aby tworzyć zlecenia dla „{displayName}”.
          </p>
        ) : loading ? (
          <p className="text-sm text-slate-500">Wczytywanie receptury…</p>
        ) : !activeRecipe ? (
          <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 text-center">
            <Factory className="mx-auto h-9 w-9 text-slate-400" aria-hidden />
            <p className="mt-3 text-sm text-slate-600">
              Brak aktywnej receptury produkcyjnej dla „{displayName}”. Zapisz zestaw ponownie po uzupełnieniu
              składników.
            </p>
            <Link
              to={erpProductionPaths.recipes}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Otwórz receptury ERP
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Zlecenie produkcyjne dla „{displayName}”. Receptura:{" "}
              <strong>{activeRecipe.name}</strong> (v{activeRecipe.version}).
            </p>
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-36">
                <label className={fieldLabel}>Planowana ilość</label>
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
                disabled={orderBusy || !hasActiveWarehouse}
                onClick={() => void handleCreateOrder()}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden />
                {orderBusy ? "Tworzenie…" : "Utwórz zlecenie produkcyjne"}
              </button>
            </div>
            {!hasActiveWarehouse ? (
              <p className="text-xs text-amber-700">{ACTIVE_WAREHOUSE_REQUIRED_MESSAGE}</p>
            ) : null}
          </div>
        )}
      </ProductLikeSection>

      <ProductLikeSection title="Historia produkcji">
        {!warehouseReady ? (
          <p className="text-sm text-slate-500">Historia zleceń pojawi się po zapisaniu zestawu STOCK.</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-slate-500">Brak zleceń produkcyjnych dla „{displayName}”.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Numer</th>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Ilość</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Koszt jdn.</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="px-3 py-2">
                      <Link
                        to={erpProductionPaths.order(h.id)}
                        className="font-mono text-slate-800 hover:underline"
                      >
                        {h.number}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {(h.completed_at || h.created_at || "").slice(0, 10) || "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {h.status === "completed" ? h.produced_quantity : h.planned_quantity}
                    </td>
                    <td className="px-3 py-2">
                      <span className={productionStatusBadgeClass(h.status)}>
                        {PRODUCTION_STATUS_LABEL[h.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatProductionMoney(h.calculated_unit_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {warehouseReady ? (
          <Link
            to={erpProductionPaths.history}
            className="mt-3 inline-block text-xs font-medium text-slate-600 underline hover:text-slate-800"
          >
            Pełna historia w module ERP →
          </Link>
        ) : null}
      </ProductLikeSection>
    </div>
  );
}
