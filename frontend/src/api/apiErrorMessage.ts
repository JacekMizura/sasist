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

function messageFromDetailObject(detail: object): string | null {
  const d = detail as { message?: unknown; error?: unknown; step?: unknown };
  const rawMsg = d.message ?? d.error;
  if (typeof rawMsg !== "string" || !rawMsg.trim() || rawMsg.trim() === "[object Object]") {
    return null;
  }
  const msg = rawMsg.trim();
  const step = d.step;
  return typeof step === "string" && step.trim() ? `${msg} (${step})` : msg;
}

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

/** CART_CAPACITY_EXCEEDED → „Wózek może pomieścić maksymalnie X zamówień.” */
export function extractCartCapacityExceededMessage(err: unknown): string | null {
  if (!err || typeof err !== "object" || !("response" in err)) return null;
  const data = (err as { response?: { data?: unknown } }).response?.data;
  if (!data || typeof data !== "object" || !("detail" in data)) return null;
  const detail = (data as { detail?: unknown }).detail;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  const d = detail as { code?: unknown; max_orders?: unknown };
  if (d.code !== "CART_CAPACITY_EXCEEDED") return null;
  const maxOrders = typeof d.max_orders === "number" ? d.max_orders : Number(d.max_orders);
  if (!Number.isFinite(maxOrders) || maxOrders < 0) {
    return "Wózek może pomieścić maksymalnie 0 zamówień.";
  }
  return `Wózek może pomieścić maksymalnie ${Math.trunc(maxOrders)} zamówień.`;
}

/** Extract FastAPI / axios error message for toasts and console. */
export function extractApiErrorMessage(err: unknown, fallback = "Wystąpił błąd operacji."): string {
  const withRequestId = (msg: string, detailObj: unknown): string => {
    if (!detailObj || typeof detailObj !== "object") return msg;
    const rid = (detailObj as { request_id?: unknown }).request_id;
    if (typeof rid === "string" && rid.trim()) {
      return `${msg} (ref: ${rid.trim()})`;
    }
    return msg;
  };

  const sanitize = (msg: string): string => {
    if (looksLikeRawDbError(msg)) {
      console.error("[api] raw server error:", msg);
      return fallback;
    }
    return msg;
  };

  const op = extractApiOperationalErrorDetail(err);
  if (op?.message) {
    const data = (err as { response?: { data?: unknown } }).response?.data;
    const detail =
      data && typeof data === "object" && "detail" in data
        ? (data as { detail: unknown }).detail
        : data;
    return withRequestId(sanitize(op.message), detail);
  }

  if (err && typeof err === "object" && "response" in err) {
    const res = (err as { response?: { data?: unknown; status?: number } }).response;
    const data = res?.data;
    if (typeof data === "string" && data.trim()) {
      return sanitize(data.trim());
    }
    if (data && typeof data === "object") {
      const top = data as { message?: unknown; error?: unknown; detail?: unknown; request_id?: unknown };
      const topMsg = messageFromDetailObject(top);
      if (topMsg) return withRequestId(sanitize(topMsg), top);

      if ("detail" in data) {
        const detail = top.detail;
        if (typeof detail === "string" && detail.trim()) {
          return withRequestId(sanitize(detail.trim()), top);
        }
        if (typeof detail === "number" || typeof detail === "boolean") {
          return String(detail);
        }
        if (detail && typeof detail === "object" && !Array.isArray(detail)) {
          const nested = messageFromDetailObject(detail);
          if (nested) return withRequestId(sanitize(nested), detail);
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
          if (parts.length) return sanitize(parts.join("; "));
        }
      }
    }
    return fallback;
  }

  if (err instanceof Error) {
    const msg = err.message.trim();
    if (msg && !/^Request failed with status code \d+/i.test(msg)) {
      return sanitize(msg);
    }
  }
  return fallback;
}
