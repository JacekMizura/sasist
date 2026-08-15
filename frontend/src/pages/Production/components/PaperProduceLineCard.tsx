import { useState } from "react";
import type { FinishedGoodsIdentityBody } from "@/api/productionApi";
import { PrimaryButton, ProgressBar, toneTextClass } from "@/design-system";
import { formatProductionQuantity, productionProgressTone } from "../productionUi";
import { ProductThumb } from "./ProductThumb";

type Props = {
  productName: string;
  productImageUrl?: string | null;
  plannedQuantity: number;
  completedQuantity: number;
  busy: boolean;
  traceabilityEnabled: boolean;
  /** True when every line of the job is complete — show finish CTA. */
  canFinishJob: boolean;
  onProduce: (qty: number, identity: FinishedGoodsIdentityBody) => void;
  onFinish: () => void;
};

function fmtQty(n: number): string {
  return formatProductionQuantity(n);
}

/** Production-stage line card — increment produce, then finish → PW. */
export function PaperProduceLineCard({
  productName,
  productImageUrl,
  plannedQuantity,
  completedQuantity,
  busy,
  traceabilityEnabled,
  canFinishJob,
  onProduce,
  onFinish,
}: Props) {
  const remaining = Math.max(0, plannedQuantity - completedQuantity);
  const lineDone = remaining <= 1e-6;
  const pct =
    plannedQuantity > 0 ? Math.round(Math.min(100, (completedQuantity / plannedQuantity) * 100)) : 0;
  const tone = productionProgressTone(pct, lineDone ? "completed" : "in_progress");
  const showPlusFive = plannedQuantity > 5 && remaining > 1;
  const [fgBatchNumber, setFgBatchNumber] = useState("");
  const [fgExpiryDate, setFgExpiryDate] = useState("");
  const [fgSerials, setFgSerials] = useState("");
  const identity = (): FinishedGoodsIdentityBody => ({
    fg_batch_number: fgBatchNumber.trim() || null,
    fg_expiry_date: fgExpiryDate || null,
    fg_serial_numbers: fgSerials.split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean),
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <ProductThumb imageUrl={productImageUrl} name={productName} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-slate-900">{productName}</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">Pobrano</p>
          <p className="text-2xl font-bold tabular-nums text-slate-900">
            {fmtQty(completedQuantity)}
            <span className="text-lg font-semibold text-slate-400"> z {fmtQty(plannedQuantity)} szt.</span>
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium text-slate-600">Postęp produkcji</span>
          <span className={`tabular-nums font-bold ${toneTextClass[tone]}`}>{pct}%</span>
        </div>
        <ProgressBar value={pct} tone={tone} size="lg" />
      </div>

      <div className="mt-5 space-y-2">
        {traceabilityEnabled && !lineDone ? (
          <details className="mb-4 rounded-xl border border-teal-200 bg-teal-50/40 p-3">
            <summary className="cursor-pointer text-sm font-bold text-teal-900">Identyfikowalność wyrobu</summary>
            <div className="mt-3 grid gap-3">
              <label className="text-xs font-semibold text-slate-600">
                Numer partii (LOT)
                <input value={fgBatchNumber} onChange={(e) => setFgBatchNumber(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Data ważności
                <input type="date" value={fgExpiryDate} onChange={(e) => setFgExpiryDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Numery seryjne (SN)
                <textarea value={fgSerials} onChange={(e) => setFgSerials(e.target.value)} rows={3} placeholder="Jeden numer w wierszu" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
              </label>
            </div>
          </details>
        ) : null}
        {lineDone && canFinishJob ? (
          <PrimaryButton
            type="button"
            density="comfortable"
            disabled={busy}
            onClick={onFinish}
            className="w-full py-3.5 text-base"
          >
            Zakończ produkcję
          </PrimaryButton>
        ) : lineDone ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-900">
            Produkt gotowy — dokończ pozostałe pozycje.
          </p>
        ) : (
          <div className={`grid gap-2 ${showPlusFive ? "grid-cols-2" : "grid-cols-1"}`}>
            <PrimaryButton
              type="button"
              density="comfortable"
              disabled={busy || remaining <= 0}
              onClick={() => onProduce(1, identity())}
              className="w-full py-3.5 text-base"
            >
              Produkuj +1
            </PrimaryButton>
            {showPlusFive ? (
              <PrimaryButton
                type="button"
                density="comfortable"
                disabled={busy || remaining <= 0}
              onClick={() => onProduce(Math.min(5, remaining), identity())}
                className="w-full py-3.5 text-base"
              >
                Produkuj +5
              </PrimaryButton>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
