/**
 * Unified warehouse documents list — labels, badges, status, actions.
 * Type configs live in warehouseDocumentConfigs.ts.
 */

export {
  normalizeWarehouseDocType,
  WAREHOUSE_DOC_TYPES as WAREHOUSE_DOCUMENT_TYPES,
  type WarehouseDocType as WarehouseDocumentType,
} from "./warehouseDocumentConfigs";

export type DocumentTypeFilterTab = import("./warehouseDocumentConfigs").WarehouseDocType;

export function warehouseDocTypeBadgeLabel(t: import("./warehouseDocumentConfigs").WarehouseDocType): string {
  return t === "MM" ? "PM" : t;
}

export function normalizeReceivingStatusKey(status: string | undefined): string {
  return (status || "pending").toLowerCase().trim().replace(/-/g, "_");
}

export function progressLabelForType(t: import("./warehouseDocumentConfigs").WarehouseDocType): string {
  switch (t) {
    case "PZ":
    case "PW":
      return "Przyjęto";
    case "WZ":
      return "Wydano";
    case "MM":
      return "Przesunięto";
    case "RW":
    case "ZW":
      return "Wydano wewn.";
    case "ZD":
      return "Przyjęcie plan.";
    default:
      return "Postęp";
  }
}

export function actionLabelForType(t: import("./warehouseDocumentConfigs").WarehouseDocType): string {
  switch (t) {
    case "PZ":
    case "PW":
      return "Przyjmij";
    case "WZ":
      return "Wydaj";
    case "MM":
      return "Przenieś";
    case "RW":
    case "ZW":
      return "Zaksięguj";
    case "ZD":
      return "Przyjmij";
    default:
      return "Otwórz";
  }
}

export function typeBadgeClass(t: import("./warehouseDocumentConfigs").WarehouseDocType): string {
  switch (t) {
    case "PZ":
      return "bg-sky-100 text-sky-900 ring-sky-200/90";
    case "PW":
      return "bg-emerald-100 text-emerald-900 ring-emerald-200/90";
    case "WZ":
      return "bg-violet-100 text-violet-900 ring-violet-200/90";
    case "MM":
      return "bg-cyan-100 text-cyan-900 ring-cyan-200/90";
    case "RW":
      return "bg-orange-100 text-orange-900 ring-orange-200/90";
    case "ZD":
      return "bg-blue-100 text-blue-900 ring-blue-200/90";
    case "ZW":
      return "bg-amber-100 text-amber-900 ring-amber-200/90";
    default:
      return "bg-slate-100 text-slate-800 ring-slate-200/90";
  }
}

export type BusinessDocStatus = "NOWE" | "W TRAKCIE" | "GOTOWE" | "ZAKOŃCZONE" | "ANULOWANE" | "ZREALIZOWANA";

export function businessDocStatus(r: {
  status: string;
  document_type?: string;
  total_received?: number;
  receiving_status?: string;
  putaway_status?: string;
  relocation_status?: string;
  is_fully_received?: boolean;
  is_fully_putaway?: boolean;
}): BusinessDocStatus {
  const docType = String(r.document_type ?? "")
    .trim()
    .toUpperCase();
  const st = (r.status || "").toLowerCase();
  if (st === "cancelled" || st === "canceled" || st === "anulowane" || st === "anulowany") return "ANULOWANE";
  if (docType === "WZ") {
    if (st === "done" || st === "completed" || st === "posted" || st === "zakonczone") return "ZREALIZOWANA";
    if (st === "draft") return "NOWE";
    return "W TRAKCIE";
  }
  if (st === "posted" || st === "zakonczone" || st === "completed") return "ZAKOŃCZONE";
  const fullRec = r.is_fully_received === true;
  const fullPut = r.is_fully_putaway === true;
  const ps = (r.putaway_status || "").trim().toUpperCase();
  const rls = (r.relocation_status || "").trim().toUpperCase();
  const rsKey = normalizeReceivingStatusKey(r.receiving_status);
  if (fullRec && (fullPut || ps === "DONE" || rls === "DONE")) {
    return "GOTOWE";
  }
  if (rsKey === "done" || rsKey === "received" || rsKey === "completed") {
    return "GOTOWE";
  }
  const rec = r.total_received ?? 0;
  if (rsKey === "in_progress" || rec > 0) return "W TRAKCIE";
  return "NOWE";
}

/** Temporary debug helper for receiving / putaway completion blockers. */
export function logReceivingStatusDebug(
  label: string,
  payload: {
    receivedQty: number;
    pendingPutaway: number;
    looseQty?: number;
    linkedDeliveryId?: number | null;
    canFinalize?: boolean;
    receivingStatus?: string;
    putawayStatus?: string;
    relocationStatus?: string;
    documentStatus?: string;
    isFullyReceived?: boolean;
    isFullyPutaway?: boolean;
  },
): void {
  if (typeof console !== "undefined" && console.log) {
    console.log(`[RECEIVING STATUS] ${label}`, payload);
  }
}

export function receivedProgressClass(received: number, ordered: number): string {
  if (received <= 0) return "text-slate-400";
  if (ordered <= 0) return "text-amber-600 font-semibold tabular-nums";
  if (received + 1e-9 >= ordered) return "text-emerald-600 font-semibold tabular-nums";
  return "text-amber-600 font-semibold tabular-nums";
}

export function businessStatusBadgeClass(status: BusinessDocStatus): string {
  switch (status) {
    case "ZREALIZOWANA":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200/90";
    case "ZAKOŃCZONE":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200/90";
    case "GOTOWE":
      return "bg-teal-50 text-teal-900 ring-teal-200/90";
    case "W TRAKCIE":
      return "bg-amber-50 text-amber-900 ring-amber-200/90";
    case "ANULOWANE":
      return "bg-rose-50 text-rose-900 ring-rose-200/90";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200/90";
  }
}
