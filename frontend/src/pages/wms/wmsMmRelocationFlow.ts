import { getWmsMmRelocationDocument } from "../../api/wmsMmTransferApi";
import { getWmsPutawayPzDocument } from "../../api/wmsPutawayApi";
import type { StockDocumentRead } from "../../api/stockDocumentsApi";
import { WMS_ROUTES } from "./wmsRoutes";
import { pmDisplayLabel, pzDisplayLabel } from "./putawayFormat";

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
  opts?: { forceMm?: boolean },
): string {
  if (opts?.forceMm || isMmStockDocumentType(documentType)) {
    return pmDisplayLabel(createdAt, docId);
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

export const PZ_PUTAWAY_UI = {
  listTitle: "Rozlokowanie PZ",
  docKind: "PZ",
  flowName: "Rozlokowanie PZ",
  progressDone: "Rozlokowano",
  finalize: "Zakończ rozlokowanie PZ",
  emptyLines: "Brak pozycji z przyjętą ilością do rozlokowania PZ.",
  backToHub: "Wróć do listy PZ",
  invalidDoc: "Nieprawidłowy numer PZ.",
  loadFailed: "Nie udało się wczytać dokumentu.",
  alreadyDone: "Rozlokowanie PZ dla tego dokumentu zostało zakończone.",
  notAllowed: "Rozlokowanie PZ niedostępne dla bieżącego statusu dokumentu.",
} as const;
