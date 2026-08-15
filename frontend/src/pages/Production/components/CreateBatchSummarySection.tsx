import { AlertTriangle } from "lucide-react";

import type { ProductionBatchPreviewRead } from "../../../api/productionApi";
import { Card, Checkbox, StatusBadge, typography } from "@/design-system";
import { formatProductionMoney, formatProductionQuantity, stockTone, STOCK_TONE_CLASS } from "../productionUi";

type Props = {
  linesEmpty: boolean;
  previewBusy: boolean;
  preview: ProductionBatchPreviewRead | null;
  reserveMaterials: boolean;
  onReserveMaterialsChange: (checked: boolean) => void;
};

export function CreateBatchSummarySection({
  linesEmpty,
  previewBusy,
  preview,
  reserveMaterials,
  onReserveMaterialsChange,
}: Props) {
  return (
    <section className="space-y-3">
      <h3 className={typography.section}>Podsumowanie</h3>
      <Card variant="section" density="comfortable" className="space-y-3">
        {linesEmpty ? (
          <p className="text-sm text-slate-500">Dodaj produkty, aby zobaczyć podsumowanie materiałów i kosztów.</p>
        ) : previewBusy && !preview ? (
          <p className="text-sm text-slate-500">Obliczanie planu materiałowego…</p>
        ) : preview ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryStat label="Produkty" value={preview.products_count} />
              <SummaryStat label="Łączna liczba sztuk" value={preview.total_planned_units} />
              <SummaryStat label="Szacowany koszt" value={formatProductionMoney(preview.estimated_cost_net)} />
              <SummaryStat label="Wymagane materiały" value={preview.aggregated_components.length} />
            </div>

            {preview.has_shortages ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                <p className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                  Braki materiałów ({preview.shortages.length})
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  Partię można utworzyć, ale start produkcji będzie zablokowany do uzupełnienia stanów.
                </p>
              </div>
            ) : (
              <StatusBadge tone="success" density="comfortable">
                Materiały wystarczające
              </StatusBadge>
            )}

            {preview.aggregated_components.length > 0 ? (
              <div className="space-y-1.5">
                <p className={typography.caption}>Zagregowane materiały</p>
                <ul className="max-h-40 space-y-1.5 overflow-y-auto">
                  {preview.aggregated_components.map((c) => {
                    const tone = stockTone(c.required, c.available);
                    return (
                      <li
                        key={c.component_product_id}
                        className={`rounded-md border px-3 py-2 text-xs ${STOCK_TONE_CLASS[tone]}`}
                      >
                        <p className="font-semibold text-slate-800">{c.product_name}</p>
                        <p className="text-slate-600">
                          Wymagane: <strong>{formatProductionQuantity(c.required)}</strong> · Dostępne:{" "}
                          {formatProductionQuantity(c.available)}
                          {c.missing > 0 ? (
                            <span className="font-bold text-red-700">
                              {" "}
                              · Brak: {formatProductionQuantity(c.missing)}
                            </span>
                          ) : null}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-slate-500">Obliczanie planu materiałowego…</p>
        )}

        <label className="flex cursor-pointer items-center gap-2 border-t border-slate-100 pt-3 text-sm text-slate-800">
          <Checkbox checked={reserveMaterials} onChange={(e) => onReserveMaterialsChange(e.target.checked)} />
          Rezerwuj materiały przy utworzeniu partii
        </label>
      </Card>
    </section>
  );
}

function SummaryStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className={typography.kpiLabel}>{label}</p>
      <p className={`mt-1 ${typography.metric}`}>{value}</p>
    </div>
  );
}
