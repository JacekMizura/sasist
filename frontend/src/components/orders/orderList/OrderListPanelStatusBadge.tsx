import type { OrderUiStatusBrief } from "../../../types/orderUiStatus";

type Props = {
  status: OrderUiStatusBrief | null | undefined;
  /** Tighter padding for dense table rows. */
  compact?: boolean;
};

export const getStatusClass = (status: string) => {
  switch (status?.toLowerCase()) {
    case "nowe":
      return "border-blue-500 bg-blue-50 text-blue-700";
    case "w toku":
      return "border-yellow-500 bg-yellow-50 text-yellow-700";
    case "zakończone":
      return "border-green-500 bg-green-50 text-green-700";
    case "pilne":
      return "border-red-500 bg-red-50 text-red-700";
    default:
      return "border-slate-400 bg-slate-100 text-slate-700";
  }
};

/**
 * Same visual language as order detail header / panel sidebar (tint + border + optional icon).
 */
export function OrderListPanelStatusBadge({ status, compact }: Props) {
  const colorClass = getStatusClass(status?.name ?? "");
  if (!status?.name?.trim()) {
    return (
      <div className={`flex items-center gap-2 ${compact ? "max-w-full" : ""}`}>
        <span className="w-fit rounded-sm border-l-4 border-slate-400 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
          Bez etykiety
        </span>
      </div>
    );
  }
  const img = compact ? "h-3 w-3" : "h-3.5 w-3.5";
  return (
    <div className={`flex items-center gap-2 ${compact ? "max-w-full" : ""}`}>
      <span className={`inline-flex w-fit min-w-0 items-center gap-1 rounded-sm border-l-4 px-2 py-0.5 text-xs font-medium leading-tight ${colorClass}`}>
        {status.image_url ? (
          <img src={status.image_url} alt="" className={`shrink-0 rounded object-contain ${img}`} />
        ) : null}
        <span className="min-w-0 truncate">{status.name}</span>
      </span>
    </div>
  );
}
