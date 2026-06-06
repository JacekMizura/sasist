import type { ExecutionStep } from "../../../hooks/replenishment/useReplenishmentExecution";
import type { ReplenishmentRow } from "../../../utils/replenishmentRowModel";

const STEP_LABEL: Record<ExecutionStep, string> = {
  scan_source: "Skanuj źródło",
  scan_product: "Skanuj produkt",
  scan_target: "Skanuj cel",
  complete: "Zakończ",
};

type Props = {
  row: ReplenishmentRow | null;
  step: ExecutionStep;
  scanBuffer: string;
  busy: boolean;
  error: string | null;
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
  onScanChange,
  onSubmit,
  onComplete,
  onClose,
}: Props) {
  if (!row) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-2 sm:items-center">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          <h2 className="text-sm font-semibold">Wykonanie uzupełnienia</h2>
          <button type="button" className="text-xs text-slate-500" onClick={onClose}>
            Zamknij
          </button>
        </div>
        <div className="space-y-2 px-3 py-3 text-sm">
          <div className="font-medium">{row.productName}</div>
          <div className="grid grid-cols-2 gap-1 text-xs text-slate-600">
            <span>Ilość: {row.suggestedQty}</span>
            <span>{row.sourceZone} → {row.targetZone}</span>
            <span>Źródło: {row.sourceLocation}</span>
            <span>Cel: {row.targetLocation}</span>
          </div>
          <div className="rounded bg-slate-50 px-2 py-1 text-xs">
            Krok: <strong>{STEP_LABEL[step]}</strong> · skaner {busy ? "zajęty" : "gotowy"}
          </div>
          <input
            autoFocus
            className="w-full rounded border border-slate-300 px-2 py-2 text-sm"
            placeholder="Skan / Enter"
            value={scanBuffer}
            onChange={(e) => onScanChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
            disabled={busy}
          />
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onSubmit}
              className="flex-1 rounded bg-slate-800 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              Dalej
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onComplete}
              className="rounded border border-slate-300 px-3 py-2 text-xs"
            >
              Zakończ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
