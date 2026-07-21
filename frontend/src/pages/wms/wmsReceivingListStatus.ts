/** Receiving-only list status for WMS Przyjęcia (independent of putaway). */

export const WMS_RECEIVING_LIST_STATUSES = ["OPEN", "IN_PROGRESS", "DONE"] as const;
export type WmsReceivingListStatus = (typeof WMS_RECEIVING_LIST_STATUSES)[number];

function norm(raw: string | undefined | null): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/-/g, "_");
}

/**
 * Operational receiving status for the WMS list — never derive from putaway / warehouse workflow.
 * Parallel putaway must not flip the document to „Rozlokowane”.
 */
export function resolveWmsReceivingListStatus(row: {
  receiving_status?: string | null;
  status?: string | null;
}): WmsReceivingListStatus {
  const rs = norm(row.receiving_status);
  const st = norm(row.status);
  if (
    rs === "DONE" ||
    st === "ZAKONCZONE" ||
    st === "POSTED" ||
    st === "CLOSED" ||
    st === "COMPLETED"
  ) {
    return "DONE";
  }
  if (rs === "IN_PROGRESS" || rs === "COUNTING") {
    return "IN_PROGRESS";
  }
  return "OPEN";
}

export function wmsReceivingListStatusLabelPl(status: WmsReceivingListStatus): string {
  switch (status) {
    case "OPEN":
      return "Otwarte";
    case "IN_PROGRESS":
      return "W trakcie";
    case "DONE":
      return "Zakończone";
  }
}

export function wmsReceivingListStatusBadgeClass(status: WmsReceivingListStatus): string {
  switch (status) {
    case "OPEN":
      return "bg-blue-50 text-blue-800 ring-blue-200/90";
    case "IN_PROGRESS":
      return "bg-amber-50 text-amber-900 ring-amber-200/90";
    case "DONE":
      return "bg-slate-100 text-slate-700 ring-slate-200/90";
  }
}
