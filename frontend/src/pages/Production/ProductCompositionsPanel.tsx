import { useCallback, useEffect, useState } from "react";
import { Layers } from "lucide-react";
import {
  listCompositionsForProduct,
  listCompositionUsages,
  type CompositionUsageRead,
  type ProductCompositionRead,
} from "../../api/compositionApi";
import { CompositionVisualEditor } from "./CompositionVisualEditor";
import { ProductProductionSummary } from "./ProductProductionSummary";
import { useWarehouse } from "../../context/WarehouseContext";

type Props = {
  tenantId: number;
  productId: number;
  productName: string;
  onChanged?: () => void;
};

export function ProductCompositionsPanel({ tenantId, productId, productName, onChanged }: Props) {
  const { warehouse } = useWarehouse();
  const [bundles, setBundles] = useState<ProductCompositionRead[]>([]);
  const [usages, setUsages] = useState<CompositionUsageRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const errors: string[] = [];
    try {
      const [bRes, uRes] = await Promise.allSettled([
        listCompositionsForProduct(tenantId, productId, "bundle"),
        listCompositionUsages(tenantId, productId),
      ]);
      if (bRes.status === "fulfilled") setBundles(bRes.value);
      else errors.push("zestawy");
      if (uRes.status === "fulfilled") setUsages(uRes.value);
      else errors.push("użycia");
      if (errors.length === 2) {
        const reason = bRes.status === "rejected" && bRes.reason instanceof Error ? bRes.reason.message : null;
        setErr(reason ?? "Nie udało się wczytać kompozycji.");
      } else if (errors.length > 0) {
        setErr(`Częściowy błąd wczytywania: ${errors.join(", ")}.`);
      }
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
          <strong>Zestawy</strong> definiują skład sprzedażowy produktu.{" "}
          <strong>Produkcja</strong> jest zarządzana w module ERP — tutaj tylko podsumowanie receptury.
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

      <ProductProductionSummary tenantId={tenantId} productId={productId} warehouseId={warehouse?.id} />

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
    </div>
  );
}
