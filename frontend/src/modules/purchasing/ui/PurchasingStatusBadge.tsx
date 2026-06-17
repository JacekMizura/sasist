import { memo } from "react";
import { STATUS_LABEL, statusBadgeClass } from "../../../pages/purchasing/purchasingPoCommon";

const DELIVERY_STATUS_PL: Record<string, string> = {
  draft: "Szkic",
  ordered: "Zamówione",
  in_transit: "W drodze",
  received: "Dostarczone",
  cancelled: "Anulowane",
  zakonczone: "Zakończone",
  zakończone: "Zakończone",
  zamknięte: "Zamknięte",
  closed: "Zamknięte",
};

function deliveryStatusStyles(status: string): string {
  const key = status.toLowerCase();
  if (key === "zakonczone" || key === "zakończone" || key === "zamknięte" || key === "closed" || key === "received") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (key === "szkic" || key === "draft") return "border-purple-200 bg-purple-50 text-purple-700";
  if (key === "w drodze" || key === "in_transit" || key === "ordered" || key === "zamówione") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function displayLabel(status: string): string {
  const key = status.toLowerCase();
  if (STATUS_LABEL[status as keyof typeof STATUS_LABEL]) {
    return STATUS_LABEL[status as keyof typeof STATUS_LABEL];
  }
  if (DELIVERY_STATUS_PL[key]) return DELIVERY_STATUS_PL[key];
  if (key === "zakonczone") return "Zakończone";
  return status;
}

type Props = {
  status: string;
  /** Use PO-specific badge classes from purchasingPoCommon */
  variant?: "pill" | "po";
};

function PurchasingStatusBadgeInner({ status, variant = "pill" }: Props) {
  if (variant === "po") {
    return (
      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(status)}`}>
        {displayLabel(status)}
      </span>
    );
  }
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${deliveryStatusStyles(status)}`}>
      {displayLabel(status)}
    </span>
  );
}

export const PurchasingStatusBadge = memo(PurchasingStatusBadgeInner);
