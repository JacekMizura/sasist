/**
 * Czytelny komunikat z odpowiedzi API (FastAPI zwykle zwraca `{ detail: ... }`).
 * Zapobiega wyświetlaniu „[object Object]” przy błędach axios.
 */
export function formatApiError(e: unknown): string {
  if (e && typeof e === "object" && "response" in e) {
    const data = (e as { response?: { data?: unknown } }).response?.data;
    if (typeof data === "string" && data.trim()) return data;
    if (data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      const detail = d.detail;
      if (typeof detail === "string" && detail.trim()) return detail;
      if (Array.isArray(detail)) {
        const parts = detail.map((item) => {
          if (item && typeof item === "object" && "msg" in item) {
            const msg = (item as { msg?: unknown }).msg;
            if (typeof msg === "string") return msg;
          }
          try {
            return JSON.stringify(item);
          } catch {
            return String(item);
          }
        });
        const joined = parts.filter(Boolean).join(" ");
        if (joined.trim()) return joined;
      }
      if (typeof d.message === "string" && d.message.trim()) return d.message;
      try {
        return JSON.stringify(data);
      } catch {
        /* fall through */
      }
    }
  }
  if (e instanceof Error && e.message) return e.message;
  return String(e);
}
