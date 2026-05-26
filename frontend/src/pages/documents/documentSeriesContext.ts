import { subtypesForDocumentSeriesType, type DocumentSeriesSubtype, type DocumentSeriesType } from "../../api/documentSeriesApi";

const STORAGE_KEY = "documents.seriesListContext";
const LOCAL_STORAGE_KEY = "documents.seriesListContext";

export type DocumentSeriesListContext = {
  /** `null` = brak filtra typu — pokaż wszystkie serie po odświeżeniu, dopóki użytkownik nie wejdzie w moduł Dokumenty. */
  type: DocumentSeriesType | null;
  subtype: DocumentSeriesSubtype | null;
};

/** Derive series list filter from current documents route (not /documents/series). */
export function parseDocumentsPathForSeriesContext(pathname: string): DocumentSeriesListContext | null {
  const p = pathname.replace(/\/+$/, "") || pathname;
  if (!p.startsWith("/documents")) return null;
  if (p.startsWith("/documents/series")) return null;

  if (p.startsWith("/documents/sales")) {
    if (p.includes("/invoices")) return { type: "SALE", subtype: "INVOICE" };
    if (p.includes("/receipts")) return { type: "SALE", subtype: "RECEIPT" };
    return { type: "SALE", subtype: null };
  }

  if (p.startsWith("/documents/correcting") || p.startsWith("/documents/returns")) {
    return { type: "CORRECTION", subtype: "CORRECTION" };
  }

  if (p.startsWith("/documents/warehouse")) {
    const parts = p.split("/").filter(Boolean);
    const seg = (parts[2] ?? "").toLowerCase();
    const map: Record<string, DocumentSeriesSubtype> = {
      pz: "PZ",
      wz: "WZ",
      rw: "RW",
      pw: "PW",
    };
    const st = map[seg];
    if (st) return { type: "WAREHOUSE", subtype: st };
    return { type: "WAREHOUSE", subtype: null };
  }

  return null;
}

function parseStoredContext(json: string): DocumentSeriesListContext | null {
  const o = JSON.parse(json) as { type?: string; subtype?: string | null };
  if (o?.type === "SALE" || o?.type === "WAREHOUSE" || o?.type === "CORRECTION") {
    const type = o.type as DocumentSeriesType;
    const allowed = subtypesForDocumentSeriesType(type);
    const stRaw = (o.subtype ?? null) as DocumentSeriesSubtype | null;
    const subtype = stRaw && allowed.includes(stRaw) ? stRaw : null;
    return { type, subtype };
  }
  return null;
}

export function rememberDocumentsSeriesListContext(ctx: DocumentSeriesListContext): void {
  if (ctx.type == null) return;
  const payload = JSON.stringify(ctx);
  try {
    sessionStorage.setItem(STORAGE_KEY, payload);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, payload);
  } catch {
    /* ignore */
  }
}

/** Gdy brak zapisu — lista serii nie filtruje po typie w API, żeby po F5 widać było wszystkie serie. */
const DEFAULT_CONTEXT: DocumentSeriesListContext = { type: null, subtype: null };

export function readDocumentsSeriesListContext(): DocumentSeriesListContext {
  const tryParse = (raw: string | null): DocumentSeriesListContext | null => {
    if (!raw?.trim()) return null;
    try {
      return parseStoredContext(raw);
    } catch {
      return null;
    }
  };
  try {
    const fromSession = tryParse(sessionStorage.getItem(STORAGE_KEY));
    if (fromSession) return fromSession;
    const fromLocal = tryParse(localStorage.getItem(LOCAL_STORAGE_KEY));
    if (fromLocal) return fromLocal;
  } catch {
    /* ignore */
  }
  return DEFAULT_CONTEXT;
}
