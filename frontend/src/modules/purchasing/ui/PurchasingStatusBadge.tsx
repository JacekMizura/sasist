import { memo } from "react";
import { StatusBadge, type StatusTone } from "../../../design-system";
import type { PoStatus } from "../../../api/purchasingOrdersApi";
import { STATUS_LABEL } from "../../../pages/purchasing/purchasingPoCommon";

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

function poStatusTone(status: string): StatusTone {
  switch (status as PoStatus) {
    case "Draft":
      return "neutral";
    case "Sent":
      return "info";
    case "Confirmed":
      return "warning";
    case "PartiallyReceived":
      return "primary";
    case "Delivered":
      return "info";
    case "Closed":
      return "success";
    case "Cancelled":
      return "danger";
    default:
      break;
  }
  const key = status.toLowerCase();
  if (key === "zakonczone" || key === "zakończone" || key === "zamknięte" || key === "closed" || key === "received") {
    return "success";
  }
  if (key === "szkic" || key === "draft") return "neutral";
  if (key === "w drodze" || key === "in_transit" || key === "ordered" || key === "zamówione") {
    return "info";
  }
  return "neutral";
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
  /** Kept for call-site compatibility; both variants use StatusBadge SSOT. */
  variant?: "pill" | "po";
};

function PurchasingStatusBadgeInner({ status }: Props) {
  return <StatusBadge tone={poStatusTone(status)}>{displayLabel(status)}</StatusBadge>;
}

export const PurchasingStatusBadge = memo(PurchasingStatusBadgeInner);
