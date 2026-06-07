import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Layers, History } from "lucide-react";
import {
  listCompositionsForProduct,
  listCompositionUsages,
  type CompositionUsageRead,
  type ProductCompositionRead,
} from "../../api/compositionApi";
import { listProductionOrdersForProduct, type ProductionOrderSummaryRead } from "../../api/productionApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { CompositionVisualEditor } from "./CompositionVisualEditor";
import { productionPaths } from "./productionPaths";
import { formatProductionMoney, PRODUCTION_STATUS_LABEL, productionStatusBadgeClass } from "./productionUi";

type Props = {
  tenantId: number;
  productId: number;
  productName: string;
  onChanged?: () => void;
};

export function ProductCompositionsPanel({ tenantId, productId, productName, onChanged }: Props) {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const [bundles, setBundles] = useState<ProductCompositionRead[]>([]);
  const [manufacturing, setManufacturing] = useState<ProductCompositionRead[]>([]);
  const [usages, setUsages] = useState<CompositionUsageRead[]>([]);
  const [history, setHistory] = useState<ProductionOrderSummaryRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [b, m, u, h] = await Promise.all([
        listCompositionsForProduct(tenantId, productId, "bundle"),
        listCompositionsForProduct(tenantId, productId, "manufacturing"),
        listCompositionUsages(tenantId, productId),
        listProductionOrdersForProduct(tenantId, productId),
      ]);
      setBundles(b);
      setManufacturing(m);
      setUsages(u);
      setHistory(h);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Nie udało się wczytać kompozycji.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, productId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleChanged = () => {
    void reload();
    onChanged?.();
  };

  const activeMfg = manufacturing.find((c) => c.is_active) ?? manufacturing[0] ?? null;

  const goToBatchProduction = () => {
    if (!activeMfg || !warehouse?.id) return;
    navigate(`${productionPaths.home}?create=1&product=${productId}&composition=${activeMfg.id}`);
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Wczytywanie kompozycji…</p>;
  }

  return (
    <div className="space-y-10">
      {err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
        <p className="text-sm text-slate-600">
          Kompozycje definiują skład produktu. <strong>Zestawy</strong> są rozliczane przy sprzedaży;{" "}
          <strong>Produkcja</strong> tworzy gotowy towar w magazynie (RW/PW).
        </p>
      </div>

      <CompositionVisualEditor
        tenantId={tenantId}
        productId={productId}
        productName={productName}
        mode="bundle"
        compositions={bundles}
        onChanged={handleChanged}
        sectionTitle="Zestawy"
        sectionHint="Sprzedażowe zestawy i kity — bez dokumentów RW/PW."
      />

      <CompositionVisualEditor
        tenantId={tenantId}
        productId={productId}
        productName={productName}
        mode="manufacturing"
        compositions={manufacturing}
        onChanged={handleChanged}
        sectionTitle="Produkcja"
        sectionHint="Kompozycje magazynowe — zużycie składników i przyjęcie wyrobu gotowego."
      />

      {activeMfg ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-semibold text-slate-900">Dodaj do partii produkcyjnej</h4>
          <p className="mt-1 text-xs text-slate-600">
            Aktywna kompozycja: {activeMfg.name} (v{activeMfg.version})
          </p>
          <button
            type="button"
            disabled={!warehouse?.id}
            onClick={goToBatchProduction}
            className="mt-3 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
          >
            Otwórz moduł Produkcja
          </button>
        </section>
      ) : null}

      {usages.length > 0 ? (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">
            <Layers className="h-5 w-5 text-slate-500" aria-hidden />
            Używany w kompozycjach
          </h3>
          <ul className="space-y-2 text-sm">
            {usages.map((u) => (
              <li key={`${u.composition_id}-${u.parent_product_id}`} className="flex justify-between gap-4 rounded-lg border border-slate-100 px-3 py-2">
                <span>
                  <span className="font-medium text-slate-900">{u.parent_product_name}</span>
                  <span className="text-slate-500">
                    {" "}
                    — {u.composition_name}{" "}
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                      {u.composition_mode === "bundle" ? "zestaw" : "produkcja"}
                    </span>
                  </span>
                </span>
                <span className="text-slate-600">× {u.quantity}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {manufacturing.length > 0 ? (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">
            <History className="h-5 w-5 text-slate-500" aria-hidden />
            Historia produkcji
          </h3>
          {history.length === 0 ? (
            <p className="text-sm text-slate-500">Brak zleceń produkcyjnych dla tego produktu.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Nr MO</th>
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
                        <Link to={`/production?order=${h.id}`} className="font-mono text-violet-700 hover:underline">
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
        </section>
      ) : null}
    </div>
  );
}
