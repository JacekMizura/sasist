import {
  docAllowsWmsPutaway,
  putawayCardsEnabled as computePutawayCardsEnabled,
} from "./putawayDocumentGates";

export type PutawayDocumentRefreshLog = {
  document_id: number;
  status: string;
  relocation_status: string;
  can_putaway: boolean;
  source: string;
  endpoint: string;
  /** Extra fields for diagnosing gate mismatches. */
  document_type?: string;
  receiving_status?: string;
  can_putaway_status_only?: boolean;
};

function isPutawayDocDebugEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return localStorage.getItem("wms.putaway.debug") === "1";
  } catch {
    return false;
  }
}

/** Debug: log every document snapshot refresh (poll / event / patch). */
export function logPutawayDocumentRefresh(
  doc: {
    id: number;
    status?: string | null;
    relocation_status?: string | null;
    document_type?: string | null;
    receiving_status?: string | null;
  },
  source: string,
  endpoint: string,
): PutawayDocumentRefreshLog {
  const payload: PutawayDocumentRefreshLog = {
    document_id: doc.id,
    status: String(doc.status ?? ""),
    relocation_status: String(doc.relocation_status ?? "OPEN"),
    can_putaway: computePutawayCardsEnabled(doc.document_type, doc.status, doc.relocation_status),
    source,
    endpoint,
    document_type: String(doc.document_type ?? ""),
    receiving_status: String(doc.receiving_status ?? ""),
    can_putaway_status_only: docAllowsWmsPutaway(doc.document_type, doc.status),
  };
  if (isPutawayDocDebugEnabled()) {
    console.info("[WMS_PUTAWAY_DOC_REFRESH]", payload);
  }
  return payload;
}

export function putawayDocumentGateError(
  doc: {
    status?: string | null;
    relocation_status?: string | null;
    document_type?: string | null;
  },
  ui: { alreadyDone: string; notAllowed: string },
): string | null {
  const relDone = String(doc.relocation_status ?? "").toUpperCase() === "DONE";
  if (relDone) return ui.alreadyDone;
  if (!computePutawayCardsEnabled(doc.document_type, doc.status, doc.relocation_status)) {
    return ui.notAllowed;
  }
  return null;
}
