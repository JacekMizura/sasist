import type { ExecutionStep } from "../../../hooks/replenishment/useReplenishmentExecution";
import type { ReplenishmentRow } from "../../../utils/replenishmentRowModel";
import {
  ReplenishmentExecutionSteps,
  replenishmentStepHint,
} from "./ReplenishmentExecutionSteps";

type Props = {
  row: ReplenishmentRow | null;
  step: ExecutionStep;
  scanBuffer: string;
  busy: boolean;
  error: string | null;
  successFlash?: boolean;
  onScanChange: (v: string) => void;
  onSubmit: () => void;
  onComplete: () => void;
  onClose: () => void;
};

export function ReplenishmentExecutionModal({
  row,
  step,
  scanBuffer,
  busy,
  error,
  successFlash,
  onScanChange,
  onSubmit,
  onComplete,
  onClose,
}: Props) {
  if (!row) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-2 sm:items-center">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">Wykonanie uzupełnienia</h2>
          <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={onClose}>
            Zamknij
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
          <div>
            <div className="font-semibold text-slate-900">{row.productName}</div>
            <div className="text-xs text-slate-500">{row.skuEan}</div>
            <div className="mt-1 flex gap-3 text-xs text-slate-600">
              <span>Ilość: <strong>{row.suggestedQty}</strong></span>
              <span>{row.sourceLocation} → {row.targetLocation}</span>
            </div>
          </div>
          <ReplenishmentExecutionSteps step={step} />
          <p className="text-sm font-medium text-sky-800">{replenishmentStepHint(step)}</p>
          <input
            autoFocus
            className={`w-full rounded-xl border px-4 py-4 text-lg outline-none focus:ring-2 ${
              successFlash
                ? "border-emerald-400 bg-emerald-50 ring-emerald-200"
                : error
                  ? "border-red-300 ring-red-100"
                  : "border-slate-300 focus:border-sky-400 focus:ring-sky-200"
            }`}
            placeholder="Skanuj lub wpisz kod…"
            value={scanBuffer}
            onChange={(e) => onScanChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
            disabled={busy}
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {successFlash ? (
            <p className="text-sm font-medium text-emerald-700">Krok zatwierdzony ✓</p>
          ) : null}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={onSubmit}
              className="flex-1 rounded-lg bg-slate-900 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {step === "complete" ? "Potwierdź wykonanie" : "Dalej"}
            </button>
            {step === "complete" ? (
              <button
                type="button"
                disabled={busy}
                onClick={onComplete}
                className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
              >
                Zakończ
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
