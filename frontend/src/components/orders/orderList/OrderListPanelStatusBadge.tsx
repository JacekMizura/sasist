import type { OrderUiStatusBrief } from "../../../types/orderUiStatus";
import { OrderUiStatusBadge } from "../OrderUiStatusBadge";

type Props = {
  status: OrderUiStatusBrief | null | undefined;
  /** Tighter padding for dense table rows. */
  compact?: boolean;
};

/**
 * @deprecated Prefer {@link OrderUiStatusBadge} / panel color pipeline.
 * Kept for legacy callers that map by name only (popover dialogs).
 */
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
 * Same visual language as panel sidebar / automation status badges
 * ({@link OrderUiStatusBadge} → registry colors).
 */
export function OrderListPanelStatusBadge({ status, compact }: Props) {
  return (
    <div className={`flex items-center gap-2 ${compact ? "max-w-full" : ""}`}>
      <OrderUiStatusBadge
        status={
          status
            ? {
                name: status.name,
                color: status.color,
                main_group: status.main_group,
                badge_color: status.badge_color,
                background_color: status.background_color,
                text_color: status.text_color,
                image_url: status.image_url,
                is_active: status.is_active,
              }
            : null
        }
        emptyLabel="Bez etykiety"
      />
    </div>
  );
}
