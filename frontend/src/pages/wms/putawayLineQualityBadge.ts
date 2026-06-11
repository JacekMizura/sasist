import type { StockDocumentItemRead } from "../../api/stockDocumentsApi";
import { isDamagedStockDisposition } from "../../utils/receivingAcceptedBreakdown";

export type PutawayLineQualityBadge = {
  label: string;
  className: string;
};

/** Operator badge for Z-PZ / PZ line quality (A / uszkodzony / reklamacja). */
export function putawayLineQualityBadge(it: StockDocumentItemRead): PutawayLineQualityBadge | null {
  const rd = (it.return_decision_label ?? "").trim().toUpperCase();
  if (rd === "A") {
    return {
      label: "PRZYJĘTY (A)",
      className: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/80",
    };
  }
  if (rd === "B") {
    return {
      label: "USZKODZONY (B)",
      className: "bg-amber-100 text-amber-950 ring-1 ring-amber-200/80",
    };
  }
  if (rd === "C") {
    return {
      label: "REKLAMACJA (C)",
      className: "bg-orange-100 text-orange-950 ring-1 ring-orange-200/80",
    };
  }

  const disp = (it.stock_disposition ?? "SALEABLE").trim().toUpperCase() || "SALEABLE";
  if (disp === "SALEABLE") {
    return {
      label: "PRZYJĘTY (A)",
      className: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/80",
    };
  }
  if (isDamagedStockDisposition(disp)) {
    if (disp === "OUTLET_B") {
      return {
        label: "USZKODZONY (B)",
        className: "bg-amber-100 text-amber-950 ring-1 ring-amber-200/80",
      };
    }
    if (disp === "SERVICE_C") {
      return {
        label: "REKLAMACJA (C)",
        className: "bg-orange-100 text-orange-950 ring-1 ring-orange-200/80",
      };
    }
    return {
      label: "USZKODZONE",
      className: "bg-rose-100 text-rose-900 ring-1 ring-rose-200/80",
    };
  }
  return null;
}
