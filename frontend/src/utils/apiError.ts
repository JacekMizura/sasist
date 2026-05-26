/**
 * Extract a human-readable message from a fetch/axios-style API error (e.g. FastAPI `detail`).
 */
export function getApiErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "response" in err) {
    const res = (err as { response?: { status?: number; data?: unknown } }).response;
    const data = res?.data;
    if (data != null && typeof data === "object" && "detail" in data) {
      const d = (data as { detail: unknown }).detail;
      if (typeof d === "string") return d;
      if (Array.isArray(d) && d.length > 0) {
        const parts = d
          .map((item) => {
            if (item != null && typeof item === "object" && "msg" in item) {
              return String((item as { msg?: unknown }).msg ?? "").trim();
            }
            return "";
          })
          .filter(Boolean);
        if (parts.length) return parts.join(" ");
      }
      if (d != null && typeof d === "object") {
        const o = d as Record<string, unknown>;
        if (typeof o.detail === "string") return o.detail;
        if (typeof o.message === "string") return o.message;
      }
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return "";
}

/**
 * Log and surface a failed request. For HTTP 400, prefers backend `detail` in the alert.
 */
export function alertFailedRequest(context: string, err: unknown, fallbackTitle: string): void {
  console.error(`[${context}]`, err);
  const status =
    err && typeof err === "object" && "response" in err
      ? (err as { response?: { status?: number } }).response?.status
      : undefined;
  const detail = getApiErrorMessage(err);
  if (status === 400 && detail) {
    alert(detail);
    return;
  }
  alert(detail ? `${fallbackTitle}\n\n${detail}` : fallbackTitle);
}
