/** Axios/FastAPI error parsing — no axios or authApi imports (breaks init cycle). */

const RAW_DB_ERROR_MARKERS = [
  "psycopg",
  "sqlalchemy",
  "foreignkeyviolation",
  "integrityerror",
  "[sql:",
  "background on this error at:",
];

function looksLikeRawDbError(message: string): boolean {
  const lower = message.toLowerCase();
  return RAW_DB_ERROR_MARKERS.some((m) => lower.includes(m));
}

export type ApiOperationalErrorDetail = {
  message: string;
  code?: string;
  document_type?: string;
};

/** Structured operational error from FastAPI `detail` object (e.g. missing document series). */
export function extractApiOperationalErrorDetail(err: unknown): ApiOperationalErrorDetail | null {
  if (!err || typeof err !== "object" || !("response" in err)) return null;
  const data = (err as { response?: { data?: unknown } }).response?.data;
  if (!data || typeof data !== "object" || !("detail" in data)) return null;
  const detail = (data as { detail?: unknown }).detail;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  const d = detail as { message?: unknown; code?: unknown; document_type?: unknown };
  const message = typeof d.message === "string" ? d.message.trim() : "";
  if (!message) return null;
  return {
    message,
    code: typeof d.code === "string" ? d.code : undefined,
    document_type: typeof d.document_type === "string" ? d.document_type : undefined,
  };
}

/** Extract FastAPI / axios error message for toasts and console. */
export function extractApiErrorMessage(err: unknown, fallback = "Wystąpił błąd operacji."): string {
  const op = extractApiOperationalErrorDetail(err);
  if (op?.message) return op.message;
  if (err && typeof err === "object" && "response" in err) {
    const res = (err as { response?: { data?: unknown; status?: number } }).response;
    const data = res?.data;
    if (typeof data === "string" && data.trim()) {
      const msg = data.trim();
      if (looksLikeRawDbError(msg)) {
        console.error("[api] raw server error:", msg);
        return fallback;
      }
      return msg;
    }
    if (data && typeof data === "object" && "detail" in data) {
      const detail = (data as { detail?: unknown }).detail;
      if (typeof detail === "string" && detail.trim()) {
        const msg = detail.trim();
        if (looksLikeRawDbError(msg)) {
          console.error("[api] raw server error:", msg);
          return fallback;
        }
        return msg;
      }
      if (detail && typeof detail === "object" && !Array.isArray(detail)) {
        const d = detail as { message?: unknown; error?: unknown; step?: unknown };
        const rawMsg = d.message ?? d.error;
        const step = d.step;
        if (typeof rawMsg === "string" && rawMsg.trim() && rawMsg.trim() !== "[object Object]") {
          const msg = rawMsg.trim();
          return typeof step === "string" && step.trim() ? `${msg} (${step})` : msg;
        }
      }
      if (Array.isArray(detail)) {
        const parts = detail
          .map((item) => {
            if (typeof item === "string") return item;
            if (item && typeof item === "object" && "msg" in item) {
              return String((item as { msg?: unknown }).msg ?? "");
            }
            return "";
          })
          .filter(Boolean);
        if (parts.length) return parts.join("; ");
      }
    }
    if (data && typeof data === "object") {
      const top = data as { error?: unknown; message?: unknown };
      const topMsg = String(top.message ?? "").trim();
      if (topMsg && topMsg !== "[object Object]") return topMsg;
      const er = String(top.error ?? "").trim();
      if (er && er !== "[object Object]") return er;
    }
    return fallback;
  }
  if (err instanceof Error) {
    const msg = err.message.trim();
    if (msg && !/^Request failed with status code \d+/i.test(msg)) {
      return msg;
    }
  }
  return fallback;
}
