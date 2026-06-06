import { safeDisplay, safeTrim, safeUpper } from "../../utils/safeStrings";

/** Kanban / orchestration column keys → operator-facing Polish. */
export const TASK_COLUMN_LABELS: Record<string, string> = {
  QUEUED: "Do wykonania",
  ASSIGNED: "Przypisane",
  ACTIVE: "W trakcie",
  BLOCKED: "Zablokowane",
  WAITING: "Oczekujące",
  COMPLETED: "Zakończone",
};

export const TASK_GROUP_LABELS: Record<string, string> = {
  task_type: "Typ zadania",
  zone: "Strefa",
  operator: "Operator",
  priority: "Priorytet",
  sla: "SLA",
};

const ZONE_NAMES: Record<string, string> = {
  PICKFACE: "Strefa kompletacji",
  PICKUP: "Pakowanie",
  PACKING: "Pakowanie",
  RECEIVING: "Przyjęcia",
  INBOUND: "Przyjęcia",
  BACKROOM: "Zaplecze",
  SHOWROOM: "Showroom",
  SALES: "Sprzedaż",
};

const ZONE_PRESSURE_LABELS: Record<string, string> = {
  OK: "OK",
  PRESSURE: "Wysokie obciążenie",
  LOW: "Niski stan",
  BLOCKED: "Brak operatora",
};

const OPERATOR_ACTIVITY: Record<string, string> = {
  PICKING: "Zbiera",
  PACKING: "Pakuje",
  PUTAWAY: "Rozlokowuje",
  REPLENISHMENT: "Uzupełnia",
  RELOCATION: "Przesuwa",
  RECOVERY: "Dogrywka",
  DIRECT_SALE: "Sprzedaż",
  IDLE: "Nieaktywny",
  UNKNOWN: "Nieaktywny",
};

const TASK_TYPE_LABELS: Record<string, string> = {
  REPLENISHMENT: "Uzupełnienie",
  RELOCATION: "Przesunięcie",
  PUTAWAY: "Rozlokowanie",
  PICKUP_PREP: "Przygotowanie odbioru",
  PICKUP_HANDOFF: "Wydanie odbioru",
  SHORTAGE: "Decyzja brakowa",
  MANAGER_PRIORITY: "Priorytet kierownika",
};

const TASK_STATUS_LABELS: Record<string, string> = {
  QUEUED: "Do wykonania",
  ASSIGNED: "Przypisane",
  ACTIVE: "W trakcie",
  IN_PROGRESS: "W trakcie",
  BLOCKED: "Zablokowane",
  WAITING: "Oczekujące",
  COMPLETED: "Zakończone",
  DONE: "Zakończone",
  OPEN: "Otwarte",
  CANCELLED: "Anulowane",
};

const ALERT_SEVERITY_EMOJI: Record<string, string> = {
  CRITICAL: "🔴",
  HIGH: "🔴",
  WARNING: "🟠",
  MEDIUM: "🟡",
  LOW: "🟢",
  INFO: "🔵",
};

export function zoneDisplayName(zone: unknown): string {
  const key = safeUpper(zone);
  return ZONE_NAMES[key] ?? safeDisplay(zone, "Strefa");
}

export function zonePressureLabel(level: unknown): string {
  const key = safeUpper(level);
  return ZONE_PRESSURE_LABELS[key] ?? safeDisplay(level, "OK");
}

export function operatorActivityLabel(contextType: unknown): string {
  const key = safeUpper(contextType);
  return OPERATOR_ACTIVITY[key] ?? (key ? safeDisplay(contextType) : "Nieaktywny");
}

export function taskTypeLabel(taskType: unknown): string {
  const key = safeUpper(taskType);
  return TASK_TYPE_LABELS[key] ?? safeDisplay(taskType, "Zadanie");
}

export function taskStatusLabel(status: unknown): string {
  const key = safeUpper(status);
  return TASK_STATUS_LABELS[key] ?? safeDisplay(status, "—");
}

export function alertSeverityEmoji(severity: unknown): string {
  const key = safeUpper(severity);
  return ALERT_SEVERITY_EMOJI[key] ?? "🟡";
}

export function locationDisplay(code: unknown, zone: unknown): string {
  const loc = safeTrim(code);
  const zn = zoneDisplayName(zone);
  if (loc && loc !== "—") return loc;
  return zn;
}

export function connectionStatusLabel(health: string, connected: boolean): string {
  if (health === "disabled") return "Podgląd offline";
  if (health === "live" && connected) return "Połączenie na żywo";
  if (health === "polling" && connected) return "Aktualizacja okresowa";
  return "Brak połączenia";
}
