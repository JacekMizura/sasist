import type { ReceivingScanLogRead, StockDocumentItemRead } from "../../../api/stockDocumentsApi";
import { formatWmsListDate } from "../../../pages/wms/wmsListFormatters";

type Props = {
  line: StockDocumentItemRead;
  onClose: () => void;
};

function fmtQty(n: number) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 4 }).format(n);
}

function logLabel(log: ReceivingScanLogRead): string {
  const pkg = (log.packaging_type || "").trim();
  if (pkg) return pkg;
  return "Skan";
}

export function ReceivingLineHistoryModal({ line, onClose }: Props) {
  const logs = [...(line.receiving_scan_logs ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const title = (line.product_name || "").trim() || `Pozycja #${line.id}`;

  return (
    <div
      className="fixed inset-0 z-[1700] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="receiving-line-history-title"
        className="flex max-h-[min(85vh,560px)] w-full max-w-md flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 id="receiving-line-history-title" className="text-lg font-black text-slate-900">
            Historia przyjęcia
          </h2>
          <p className="mt-1 line-clamp-2 text-sm font-medium text-slate-600">{title}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {logs.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Brak zapisanych skanów dla tej pozycji.</p>
          ) : (
            <ul className="space-y-2">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-slate-800">{logLabel(log)}</span>
                    <span className="shrink-0 font-mono text-xs text-slate-500">
                      {formatWmsListDate(log.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-base font-black tabular-nums text-indigo-700">
                    +{fmtQty(log.quantity_added)} szt.
                  </p>
                  {(log.cartons_added ?? 0) > 0 || (log.loose_units_added ?? 0) > 0 ? (
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {log.cartons_added ? `${log.cartons_added} kart.` : null}
                      {log.cartons_added && log.loose_units_added ? " · " : null}
                      {log.loose_units_added ? `${log.loose_units_added} luzem` : null}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl bg-slate-900 py-3 text-sm font-black uppercase text-white hover:bg-slate-800"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}
