import axios from "axios";

export function wmApiErrorDetailMessage(err: unknown, fallback: string): string {
  if (!axios.isAxiosError(err) || err.response?.data == null || typeof err.response.data !== "object") {
    return fallback;
  }
  const detail = (err.response.data as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (Array.isArray(detail)) {
    const parts = detail
      .map((row) => {
        if (row && typeof row === "object" && "msg" in row && typeof (row as { msg: unknown }).msg === "string") {
          return ((row as { msg: string }).msg || "").trim();
        }
        return "";
      })
      .filter(Boolean);
    if (parts.length) return parts.join(" ");
  }
  return fallback;
}

export function wmFmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
