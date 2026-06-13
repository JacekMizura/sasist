import { X } from "lucide-react";

export type SegmentPanelData = {
  shelfLabel: string;
  slotLabel: string;
  columnName: string | null;
  rowNumber: number;
  statusLabel: string;
  orderId: number | null;
  orderNumber: string | null;
  fillPercent?: number;
  readOnly?: boolean;
};

type Props = {
  segment: SegmentPanelData | null;
  onClose: () => void;
};

export default function ConsolidationRackSegmentPanel({ segment, onClose }: Props) {
  if (!segment) return null;

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Półka</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
          aria-label="Zamknij panel"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Etykieta</div>
          <div className="mt-1 font-mono text-2xl font-bold text-violet-900">{segment.slotLabel}</div>
          <div className="mt-0.5 font-mono text-sm text-slate-600">{segment.shelfLabel}</div>
        </div>

        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Kolumna</dt>
            <dd className="mt-0.5 font-semibold">{segment.columnName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Rząd</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{segment.rowNumber}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</dt>
            <dd className="mt-0.5 font-semibold">{segment.statusLabel}</dd>
          </div>
          {segment.orderId != null ? (
            <>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Zamówienie</dt>
                <dd className="mt-0.5 font-semibold">
                  {segment.orderNumber ?? `#${segment.orderId}`}
                </dd>
              </div>
              {segment.fillPercent != null ? (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Postęp odkładania</dt>
                  <dd className="mt-0.5 font-mono font-semibold tabular-nums">{segment.fillPercent.toFixed(0)}%</dd>
                </div>
              ) : null}
            </>
          ) : null}
        </dl>

        {segment.readOnly !== false ? (
          <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Przypisanie zamówienia odbywa się w procesie konsolidacji — tutaj tylko podgląd i konfiguracja układu.
          </p>
        ) : null}
      </div>
    </aside>
  );
}
