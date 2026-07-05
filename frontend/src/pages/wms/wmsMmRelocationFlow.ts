import { getWmsMmRelocationDocument } from "../../api/wmsMmTransferApi";
import { getWmsPutawayPzDocument } from "../../api/wmsPutawayApi";
import type { StockDocumentRead } from "../../api/stockDocumentsApi";
import { WMS_ROUTES } from "./wmsRoutes";
import { pmDisplayLabel, pzDisplayLabel } from "./putawayFormat";
import { isReturnReceiptDocumentType } from "./putawayDocumentGates";
import { displayWarehouseDocumentNumber } from "../../utils/warehouseDocumentNumberDisplay";

/** True when URL is the dedicated PM/MM transfer completion flow (not PZ putaway). */
export function isWmsMmRelocationPath(pathname: string): boolean {
  return pathname.includes("/mm/relocation");
}

export function isMmStockDocumentType(documentType: string | undefined | null): boolean {
  return String(documentType ?? "").trim().toUpperCase() === "MM";
}

export function wmsRelocationDocLabel(
  documentType: string | undefined | null,
  createdAt: string | undefined,
  docId: number,
  opts?: { forceMm?: boolean; documentNumber?: string | null },
): string {
  if (opts?.forceMm || isMmStockDocumentType(documentType)) {
    return pmDisplayLabel(createdAt, docId);
  }
  const dt = String(documentType ?? "").trim().toUpperCase();
  if (dt === "PW") {
    const stored = (opts?.documentNumber ?? "").trim();
    if (stored) return displayWarehouseDocumentNumber(stored);
    return `PW-${docId}`;
  }
  const stored = (opts?.documentNumber ?? "").trim();
  if (stored) return displayWarehouseDocumentNumber(stored);
  if (isReturnReceiptDocumentType(documentType)) {
    const y = createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear();
    return `Z-PZ-${y}-${String(docId).padStart(4, "0")}`;
  }
  return pzDisplayLabel(createdAt, docId);
}

export function wmsRelocationHubRoute(documentType: string | undefined | null, docId: number): string {
  if (isMmStockDocumentType(documentType)) {
    return WMS_ROUTES.mmRelocation(docId);
  }
  return WMS_ROUTES.putawayPz(docId);
}

export function wmsRelocationItemRoute(
  documentType: string | undefined | null,
  docId: number,
  itemId: number,
): string {
  if (isMmStockDocumentType(documentType)) {
    return WMS_ROUTES.mmRelocationItem(docId, itemId);
  }
  return WMS_ROUTES.putawayItem(docId, itemId);
}

export function wmsRelocationItemExecuteRoute(
  documentType: string | undefined | null,
  docId: number,
  itemId: number,
): string {
  if (isMmStockDocumentType(documentType)) {
    return WMS_ROUTES.mmRelocationItemExecute(docId, itemId);
  }
  return WMS_ROUTES.putawayItemExecute(docId, itemId);
}

export const MM_RELOCATION_UI = {
  listTitle: "Przesunięcia magazynowe",
  docKind: "PM",
  flowName: "Przesunięcie magazynowe",
  progressDone: "Przeniesiono",
  finalize: "Zakończ przesunięcie",
  emptyLines: "Brak pozycji do przesunięcia.",
  backToHub: "Wróć do przesunięć",
  invalidDoc: "Nieprawidłowy dokument przesunięcia.",
  loadFailed: "Nie udało się wczytać dokumentu przesunięcia.",
  alreadyDone: "Przesunięcie dla tego dokumentu zostało zakończone.",
  notAllowed: "Przesunięcie niedostępne dla bieżącego statusu dokumentu.",
} as const;

export async function fetchWmsRelocationHubDocument(
  tenantId: number,
  documentId: number,
  opts: { mmFlow: boolean },
): Promise<StockDocumentRead> {
  if (opts.mmFlow) {
    return getWmsMmRelocationDocument(tenantId, documentId);
  }
  return getWmsPutawayPzDocument(tenantId, documentId);
}

export const PUTAWAY_FLOW_UI = {
  listTitle: "Rozlokowanie",
  docKind: "Dokument",
  flowName: "Rozlokowanie",
  progressDone: "Rozlokowano",
  finalize: "Zakończ rozlokowanie",
  emptyLines: "Brak pozycji do rozlokowania.",
  backToHub: "Wróć do listy",
  invalidDoc: "Nieprawidłowy identyfikator dokumentu.",
  loadFailed: "Nie udało się wczytać dokumentu.",
  alreadyDone: "Rozlokowanie dla tego dokumentu zostało zakończone.",
  notAllowed: "Rozlokowanie niedostępne dla bieżącego statusu dokumentu.",
} as const;

/** @deprecated Use PUTAWAY_FLOW_UI — kept for imports during migration */
export const PZ_PUTAWAY_UI = PUTAWAY_FLOW_UI;
