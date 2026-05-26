import axios from "axios";

/** Krótki komunikat z odpowiedzi API (FastAPI `detail` lub status). */
export function formatApiErrorMessage(e: unknown, fallback = "Operacja nie powiodła się."): string {
  if (axios.isAxiosError(e)) {
    const status = e.response?.status;
    if (status === 401) return "Brak autoryzacji — zaloguj się ponownie.";
    if (status === 403) return "Brak uprawnień do tej operacji.";
    const raw = e.response?.data as { detail?: unknown } | undefined;
    const d = raw?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d.length > 0 && typeof d[0] === "object" && d[0] !== null && "msg" in d[0]) {
      return String((d[0] as { msg?: string }).msg ?? fallback);
    }
  }
  return fallback;
}
