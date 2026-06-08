import type { ApiErrorPayload } from "@/utils/apiError";
import { inventoryDocumentStatusLabel } from "./inventoryCountUiLabels";

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const CODE_MESSAGES_PL: Record<string, (details?: Record<string, unknown>) => string> = {
  invalid_status_transition: (d) => {
    const current = d?.document_status;
    const allowed = Array.isArray(d?.allowed_statuses) ? d.allowed_statuses.join(", ") : "in_progress";
    const currentLabel = current ? inventoryDocumentStatusLabel(current) : "nieznany";
    return `Nie można wysłać dokumentu w statusie „${currentLabel}”. Wymagany status: ${allowed}.`;
  },
  incomplete_count: (d) => {
    const counted = num(d?.counted_lines);
    const total = num(d?.total_lines);
    const uncounted = num(d?.uncounted_lines);
    const base =
      counted != null && total != null
        ? `Nie wszystkie pozycje zostały policzone (${counted}/${total}).`
        : "Nie wszystkie pozycje zostały policzone.";
    const pendingTasks = num(d?.pending_tasks);
    const extras: string[] = [];
    if (uncounted != null && uncounted > 0) extras.push(`Pozostało: ${uncounted} poz.`);
    if (pendingTasks != null && pendingTasks > 0) extras.push(`Aktywne zadania WMS: ${pendingTasks}.`);
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
  pending_recounts: (d) => {
    const pending = num(d?.pending_recounts);
    const created = num(d?.recounts_created);
    const parts = [
      pending != null
        ? `Dokończ ponowne liczenia przed wysłaniem (${pending} aktywnych).`
        : "Dokończ ponowne liczenia przed wysłaniem.",
    ];
    if (created != null && created > 0) parts.push(`Utworzono ${created} nowych zadań ponownego liczenia.`);
    return parts.join(" ");
  },
  document_not_found: () => "Nie znaleziono dokumentu inwentaryzacji.",
  permission_denied: () => "Brak uprawnień do tej operacji.",
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
