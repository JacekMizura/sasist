import { AlertTriangle, CheckCircle2, ListOrdered, XCircle } from "lucide-react";

import { resolveDamageMediaUrl } from "../../utils/resolveDamageMediaUrl";

export type RmzLineSidebarStatus = "pending" | "accepted" | "damaged" | "rejected" | "mixed";

export type RmzLineSidebarItem = {
  lineId: string;
  productName: string;
  imageUrl: string | null;
  qty: number;
  status: RmzLineSidebarStatus;
};

type Props = {
  items: RmzLineSidebarItem[];
  selectedLineId: string | null;
  resolvedCount: number;
  totalCount: number;
  hideResolved: boolean;
  onToggleHideResolved: (value: boolean) => void;
  onSelect: (lineId: string) => void;
  disabled?: boolean;
};

function statusStyles(status: RmzLineSidebarStatus, selected: boolean) {
  if (selected) return "border-blue-500 bg-white shadow-md z-10";
  switch (status) {
    case "accepted":
      return "border-emerald-200 bg-emerald-50/80 hover:border-emerald-300";
    case "damaged":
      return "border-amber-200 bg-amber-50/80 hover:border-amber-300";
    case "rejected":
      return "border-rose-200 bg-rose-50/80 hover:border-rose-300";
    case "mixed":
      return "border-slate-200 bg-slate-50 hover:border-slate-300";
    default:
      return "border-slate-100 bg-white hover:border-slate-300";
  }
}

function StatusIcon({ status }: { status: RmzLineSidebarStatus }) {
  if (status === "accepted") return <CheckCircle2 size={16} className="text-emerald-600" />;
  if (status === "damaged") return <AlertTriangle size={16} className="text-amber-600" />;
  if (status === "rejected") return <XCircle size={16} className="text-rose-600" />;
  if (status === "mixed") return <span className="text-xs font-bold text-slate-500">⧉</span>;
  return <div className="h-4 w-4 rounded-full border-2 border-dotted border-slate-300" />;
}

export function RmzProcessLineSidebar({
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
          Obsługa pozycji
        </div>
        <span className="rounded bg-slate-100 px-2 py-1 text-xs font-bold tabular-nums text-slate-600">
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
          <p className="py-6 text-center text-xs text-slate-500">Brak pozycji do obsługi.</p>
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
                    {item.qty} {item.qty === 1 ? "szt." : "szt."} do zwrotu
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
