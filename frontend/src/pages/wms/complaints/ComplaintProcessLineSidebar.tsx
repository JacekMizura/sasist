import { AlertTriangle, CheckCircle2, ListOrdered, RotateCcw, Wrench, XCircle } from "lucide-react";

import { resolveDamageMediaUrl } from "../../../utils/resolveDamageMediaUrl";
import type { ComplaintLineSidebarItem, ComplaintLineSidebarStatus } from "./complaintWmsLineStatus";

type Props = {
  items: ComplaintLineSidebarItem[];
  selectedLineId: number | null;
  resolvedCount: number;
  totalCount: number;
  hideResolved: boolean;
  onToggleHideResolved: (value: boolean) => void;
  onSelect: (lineId: number) => void;
  disabled?: boolean;
};

function statusStyles(status: ComplaintLineSidebarStatus, selected: boolean) {
  if (selected) return "border-blue-500 bg-white shadow-md z-10";
  switch (status) {
    case "accepted":
    case "verification":
      return "border-emerald-200 bg-white hover:border-emerald-400";
    case "repair":
      return "border-amber-200 bg-white hover:border-amber-400";
    case "exchange":
      return "border-blue-200 bg-white hover:border-blue-400";
    case "reject":
      return "border-rose-200 bg-white hover:border-rose-400";
    case "refund":
      return "border-indigo-200 bg-white hover:border-indigo-400";
    default:
      return "border-slate-100 bg-white hover:border-slate-300";
  }
}

function StatusIcon({ status }: { status: ComplaintLineSidebarStatus }) {
  if (status === "accepted" || status === "verification") {
    return <CheckCircle2 size={16} className="text-emerald-600" />;
  }
  if (status === "repair") return <Wrench size={16} className="text-amber-600" />;
  if (status === "exchange") return <RotateCcw size={16} className="text-blue-600" />;
  if (status === "reject") return <XCircle size={16} className="text-rose-600" />;
  if (status === "refund") return <AlertTriangle size={16} className="text-indigo-600" />;
  return <div className="h-4 w-4 rounded-full border-2 border-dotted border-slate-300" />;
}

export function ComplaintProcessLineSidebar({
  items,
  selectedLineId,
  resolvedCount,
  totalCount,
  hideResolved,
  onToggleHideResolved,
  onSelect,
  disabled = false,
}: Props) {
  return (
    <aside className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 p-4">
        <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-900">
          <ListOrdered size={16} aria-hidden />
          Reklamowane pozycje
        </div>
        <span className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-bold tabular-nums text-slate-600">
          {resolvedCount} / {totalCount} rozstrzyg.
        </span>
      </div>
      <div className="border-b border-slate-100 px-3 py-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={hideResolved}
            disabled={disabled}
            onChange={(e) => onToggleHideResolved(e.target.checked)}
          />
          Ukryj rozstrzygnięte
        </label>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {items.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">Brak pozycji reklamacji.</p>
        ) : (
          items.map((item) => {
            const selected = selectedLineId === item.lineId;
            const img = item.imageUrl ? resolveDamageMediaUrl(item.imageUrl) : "";
            return (
              <button
                key={item.lineId}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(item.lineId)}
                className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${statusStyles(item.status, selected)} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-0.5">
                  {img ? (
                    <img src={img} alt="" className="h-full w-full rounded object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">—</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">{item.productName}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {item.qty} szt. · {item.statusLabel}
                  </p>
                </div>
                <div
                  className={`shrink-0 rounded-full p-1.5 ${item.status !== "pending" ? "border border-slate-200 bg-white" : ""}`}
                >
                  <StatusIcon status={item.status} />
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
