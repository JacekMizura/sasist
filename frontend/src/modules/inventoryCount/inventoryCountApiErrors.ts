import type { ApiErrorPayload } from "@/utils/apiError";
import { getApiErrorMessage } from "@/utils/apiError";
import { inventoryDocumentStatusLabel } from "./inventoryCountUiLabels";

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const CODE_MESSAGES_PL: Record<string, (details?: Record<string, unknown>) => string> = {
  invalid_status_transition: (d) => {
    const current = d?.document_status;
    const currentLabel = current ? inventoryDocumentStatusLabel(current) : "nieznany";
    return `Nie można wysłać do zatwierdzenia: dokument musi być w trakcie liczenia (obecny status: ${currentLabel}).`;
  },
  incomplete_count: (d) => {
    const counted = num(d?.counted_lines);
    const total = num(d?.total_lines);
    const uncounted = num(d?.uncounted_lines);
    const base =
      counted != null && total != null
        ? `Nie wszystkie pozycje dokumentu zostały policzone (${counted}/${total}).`
        : "Nie wszystkie pozycje dokumentu zostały policzone.";
    const extras: string[] = [];
    if (uncounted != null && uncounted > 0) extras.push(`Pozostało: ${uncounted} poz.`);
    const samples = Array.isArray(d?.uncounted_samples) ? d.uncounted_samples : [];
    if (samples.length > 0) {
      const locs = samples
        .map((s) => (s && typeof s === "object" ? String((s as { location_code?: string }).location_code ?? "") : ""))
        .filter(Boolean)
        .slice(0, 3);
      if (locs.length) extras.push(`Np. lokalizacje: ${locs.join(", ")}.`);
    }
    return extras.length ? `${base} ${extras.join(" ")}` : base;
  },
  partial_submit_not_ready: () => "Dokument nie zawiera policzonych pozycji.",
  active_counting_tasks: (d) => {
    const pending = num(d?.pending_tasks);
    return pending != null && pending > 0
      ? `Nie można wysłać do zatwierdzenia: otwarte zadania liczenia (${pending}).`
      : "Nie można wysłać do zatwierdzenia: otwarte zadania liczenia.";
  },
  pending_recounts: (d) => {
    const pending = num(d?.pending_recounts) ?? num(d?.projected_recounts);
    const created = num(d?.recounts_created);
    const base =
      pending != null && pending > 0
        ? `Nie można wysłać do zatwierdzenia: dokończ ponowne liczenia (${pending} aktywnych).`
        : "Nie można wysłać do zatwierdzenia: dokończ ponowne liczenia.";
    if (created != null && created > 0) return `${base} Utworzono ${created} nowych zadań ponownego liczenia.`;
    return base;
  },
  document_not_found: () => "Nie znaleziono dokumentu inwentaryzacji.",
  permission_denied: () => "Brak uprawnień do wysłania dokumentu do zatwierdzenia.",
  inventory_count_error: () => "Operacja inwentaryzacji nie powiodła się.",
};

/** Polish operator-facing message from structured inventory API error. */
export function formatInventoryApiError(payload: ApiErrorPayload | null, fallback = "Operacja nie powiodła się."): string {
  if (!payload) return fallback;
  if (payload.code && CODE_MESSAGES_PL[payload.code]) {
    return CODE_MESSAGES_PL[payload.code](payload.details);
  }
  if (payload.message?.trim()) return payload.message.trim();
  return fallback;
}

/** Resolve toast message from axios error — prefers structured inventory payload. */
export function formatInventoryRequestError(err: unknown, fallback = "Operacja nie powiodła się."): string {
  const payload = err && typeof err === "object" && "response" in err
    ? (() => {
        const data = (err as { response?: { data?: unknown } }).response?.data;
        if (data != null && typeof data === "object" && "detail" in data) {
          const d = (data as { detail: unknown }).detail;
          if (typeof d === "string") return { message: d } satisfies ApiErrorPayload;
          if (d != null && typeof d === "object") {
            const o = d as Record<string, unknown>;
            return {
              code: typeof o.code === "string" ? o.code : undefined,
              message: typeof o.message === "string" ? o.message : undefined,
              details: o.details != null && typeof o.details === "object" ? (o.details as Record<string, unknown>) : undefined,
            } satisfies ApiErrorPayload;
          }
        }
        return null;
      })()
    : null;
  const fromPayload = formatInventoryApiError(payload, "");
  if (fromPayload) return fromPayload;
  const generic = getApiErrorMessage(err);
  return generic.trim() || fallback;
}
