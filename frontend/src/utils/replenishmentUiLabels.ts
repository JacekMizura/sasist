/**
 * Polish display labels for WMS replenishment / Centrum operacyjne.
 * Internal API enums stay English; UI must never render them raw.
 */

export const REPLENISHMENT_CLASSIFICATION_LABEL_PL: Record<string, string> = {
  ACTIONABLE: "Do uzupełnienia",
  NO_SOURCE_STOCK: "Brak stocku źródłowego",
  IN_PROGRESS: "W trakcie uzupełniania",
};

export const REPLENISHMENT_PRIORITY_BAND_LABEL_PL: Record<string, string> = {
  HIGH: "Wysoki",
  MEDIUM: "Średni",
  LOW: "Niski",
};

export const OPS_ALERT_LEVEL_LABEL_PL: Record<string, string> = {
  critical: "Krytyczne",
  warning: "Ostrzeżenie",
  info: "Informacyjne",
};

export const OPS_SEVERITY_LABEL_PL: Record<string, string> = {
  blocked: "Zablokowane",
  critical: "Krytyczne",
  warning: "Ostrzeżenie",
};

export const OPS_RESOLUTION_STATUS_LABEL_PL: Record<string, string> = {
  open: "Otwarte",
  resolved: "Rozwiązane",
  dismissed: "Odrzucone",
  in_progress: "W trakcie",
};

export function replenishmentClassificationLabel(code: string | null | undefined): string {
  const k = String(code || "")
    .trim()
    .toUpperCase();
  if (!k) return "Zdarzenie uzupełnienia";
  return REPLENISHMENT_CLASSIFICATION_LABEL_PL[k] ?? "Zdarzenie uzupełnienia";
}

export function replenishmentPriorityBandLabel(code: string | null | undefined): string {
  const k = String(code || "")
    .trim()
    .toUpperCase();
  if (!k) return "Priorytet";
  return REPLENISHMENT_PRIORITY_BAND_LABEL_PL[k] ?? "Priorytet";
}

export function opsAlertLevelLabel(code: string | null | undefined): string {
  const k = String(code || "")
    .trim()
    .toLowerCase();
  if (!k) return "Alert";
  return OPS_ALERT_LEVEL_LABEL_PL[k] ?? "Alert";
}

export function opsSeverityLabel(code: string | null | undefined): string {
  const k = String(code || "")
    .trim()
    .toLowerCase();
  if (!k) return "Status";
  return OPS_SEVERITY_LABEL_PL[k] ?? "Status";
}

export function opsResolutionStatusLabel(code: string | null | undefined): string {
  const k = String(code || "")
    .trim()
    .toLowerCase();
  if (!k) return "Status";
  return OPS_RESOLUTION_STATUS_LABEL_PL[k] ?? "Status";
}

/** True when a string looks like a leaked technical enum (not Polish UI copy). */
export function looksLikeTechnicalReplenishmentEnum(value: string | null | undefined): boolean {
  const s = String(value || "").trim();
  if (!s) return false;
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(s)) return false;
  return /^(ACTIONABLE|NO_SOURCE_STOCK|IN_PROGRESS|HIGH|MEDIUM|LOW|CRITICAL|WARNING|BLOCKED|INFO)$/i.test(s);
}
