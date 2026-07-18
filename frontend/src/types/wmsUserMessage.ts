/** WMS operator message — backend SSOT shape (Polish). */

export type WmsMessageSeverity = "SUCCESS" | "WARNING" | "ERROR";

export type WmsUserMessage = {
  code: string;
  severity: WmsMessageSeverity;
  title: string;
  message: string;
  details?: string | null;
  suggested_action?: string | null;
  context?: Record<string, unknown>;
};

function isSeverity(v: unknown): v is WmsMessageSeverity {
  return v === "SUCCESS" || v === "WARNING" || v === "ERROR";
}

/** Parse FastAPI detail / axios error into WmsUserMessage when backend sent the catalog shape. */
export function extractWmsUserMessage(err: unknown): WmsUserMessage | null {
  if (!err || typeof err !== "object" || !("response" in err)) return null;
  const data = (err as { response?: { data?: unknown } }).response?.data;
  if (!data || typeof data !== "object") return null;
  const detail = (data as { detail?: unknown }).detail;
  const src = detail && typeof detail === "object" && !Array.isArray(detail) ? detail : data;
  if (!src || typeof src !== "object" || Array.isArray(src)) return null;
  const d = src as Record<string, unknown>;
  if (typeof d.code !== "string" || typeof d.title !== "string" || typeof d.message !== "string") {
    return null;
  }
  if (!isSeverity(d.severity)) return null;
  return {
    code: d.code,
    severity: d.severity,
    title: d.title,
    message: d.message,
    details: typeof d.details === "string" ? d.details : d.details == null ? null : String(d.details),
    suggested_action:
      typeof d.suggested_action === "string"
        ? d.suggested_action
        : d.suggested_action == null
          ? null
          : String(d.suggested_action),
    context: d.context && typeof d.context === "object" && !Array.isArray(d.context)
      ? (d.context as Record<string, unknown>)
      : undefined,
  };
}

/** Fallback when backend did not send WmsUserMessage — never expose HTTP codes. */
export function fallbackWmsUserMessage(rawMessage?: string | null): WmsUserMessage {
  const msg = (rawMessage || "").trim();
  const looksTechnical =
    !msg ||
    /^\d{3}$/.test(msg) ||
    /internal server error/i.test(msg) ||
    /capacity exceeded/i.test(msg) ||
    /cart already claimed/i.test(msg) ||
    /invalid state/i.test(msg);
  return {
    code: "WMS_GENERIC_ERROR",
    severity: "ERROR",
    title: "Operacja nie powiodła się",
    message: looksTechnical
      ? "Nie udało się wykonać operacji magazynowej."
      : msg,
    details: null,
    suggested_action: "Spróbuj ponownie. Jeśli problem się powtórzy, zgłoś to przełożonemu.",
  };
}
