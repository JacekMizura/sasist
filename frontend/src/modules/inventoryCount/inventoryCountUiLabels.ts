/**
 * Inwentaryzacja — polskie etykiety UI (nigdy surowe enumy z backendu).
 */

import {
  operationalBadgeDangerClass,
  operationalBadgeInfoClass,
  operationalBadgeNeutralClass,
  operationalBadgeSuccessClass,
  operationalBadgeWarningClass,
} from "@/components/operational/operationalSemanticBadges";

const DOC_STATUS: Record<string, string> = {
  draft: "Wersja robocza",
  planned: "Zaplanowana",
  in_progress: "W trakcie",
  awaiting_approval: "Do zatwierdzenia",
  approved: "Zatwierdzona",
  posted: "Zaksięgowana",
  archived: "Archiwum",
  cancelled: "Anulowana",
};

const INV_TYPE: Record<string, string> = {
  FULL: "Pełna",
  PARTIAL: "Częściowa",
  CYCLE: "Liczenie rotacyjne",
  CONTROL: "Kontrolna",
};

const COUNT_MODE: Record<string, string> = {
  blind: "Liczba ślepa",
  visible: "Liczba kontrolna",
};

const MOVEMENT_POLICY: Record<string, string> = {
  allow_operations: "Operacje dozwolone",
  block_picking: "Zablokowane zbieranie",
  block_all: "Blokada wszystkich ruchów",
  // legacy
  snapshot: "Operacje dozwolone",
  soft: "Zablokowane zbieranie",
  hard: "Blokada wszystkich ruchów",
};

const RESULT_POLICY: Record<string, string> = {
  update_stock: "Aktualizacja stanów magazynowych",
  count_only: "Tryb kontrolny (bez korekt)",
  report_only: "Tylko raport różnic",
};

const SCOPE_MODE: Record<string, string> = {
  full: "Cały magazyn",
  zones: "Strefy magazynu",
  locations: "Wybrane lokalizacje",
  products: "Wybrane produkty",
  categories: "Grupy produktów",
  carriers: "Nośniki",
  dynamic: "Filtry dynamiczne",
};

/** @deprecated use inventoryMovementPolicyLabel */
const LOCK_MODE: Record<string, string> = MOVEMENT_POLICY;

const LINE_STATUS: Record<string, string> = {
  open: "Otwarta",
  in_progress: "Liczenie",
  counted: "Policzona",
  recount: "Ponowne liczenie",
  approved: "Zatwierdzona",
  skipped: "Pominięta",
};

const DIFF_CLASS: Record<string, string> = {
  none: "Zgodne",
  auto_approve: "Zgodne",
  supervisor_review: "Do weryfikacji",
  variance: "Różnica",
  mandatory_recount: "Do weryfikacji",
};

const RECOUNT_STATE: Record<string, string> = {
  none: "",
  required: "Wymaga ponownego liczenia",
  resolved: "Zweryfikowano",
};

const REPORT_STATUS: Record<string, string> = {
  ready: "Gotowy",
  pending: "W kolejce",
  generating: "Generowanie…",
  failed: "Błąd",
};

const REPORT_DESCRIPTION: Record<string, string> = {
  counting_sheet: "Spis z natury do pracy w terenie i archiwizacji.",
  differences: "Protokół różnic między stanem oczekiwanym a policzonym.",
  missing_stock: "Braki wykryte podczas inwentaryzacji.",
  excess_stock: "Nadwyżki wykryte podczas inwentaryzacji.",
  adjustments: "Korekty magazynowe po zatwierdzeniu dokumentu.",
  user_activity: "Aktywność operatorów WMS w czasie liczenia.",
  empty_locations: "Lokalizacje bez policzonych pozycji.",
  problematic_locations: "Lokalizacje z różnicami lub ponownym liczeniem.",
  valuation: "Wycena stanów na podstawie snapshotu.",
  opening_balance: "Bilans otwarcia z migawki stanów.",
};

function safeLookup(map: Record<string, string>, key: unknown, fallback = "—"): string {
  const k = String(key ?? "").trim();
  if (!k) return fallback;
  return map[k] ?? map[k.toLowerCase()] ?? fallback;
}

export function inventoryDocumentStatusLabel(status: unknown): string {
  return safeLookup(DOC_STATUS, status, String(status ?? "—"));
}

export function inventoryTypeLabel(type: unknown): string {
  return safeLookup(INV_TYPE, type, String(type ?? "—"));
}

export function inventoryCountModeLabel(mode: unknown): string {
  return safeLookup(COUNT_MODE, mode, String(mode ?? "—"));
}

export function inventoryMovementPolicyLabel(mode: unknown): string {
  return safeLookup(MOVEMENT_POLICY, mode, String(mode ?? "—"));
}

/** @deprecated alias — movement policy replaced lock_mode jargon */
export function inventoryLockModeLabel(mode: unknown): string {
  return inventoryMovementPolicyLabel(mode);
}

export function inventoryResultPolicyLabel(policy: unknown): string {
  return safeLookup(RESULT_POLICY, policy, String(policy ?? "—"));
}

export function inventoryScopeModeLabel(mode: unknown): string {
  return safeLookup(SCOPE_MODE, mode, String(mode ?? "—"));
}

export function inventoryLineStatusLabel(status: unknown): string {
  return safeLookup(LINE_STATUS, status, String(status ?? "—"));
}

export function inventoryDifferenceClassLabel(diffClass: unknown): string {
  const k = String(diffClass ?? "").trim();
  if (!k || k === "none" || k === "auto_approve") return "";
  return safeLookup(DIFF_CLASS, k, "");
}

export function inventoryRecountStateLabel(state: unknown): string {
  const k = String(state ?? "").trim().toLowerCase();
  if (!k || k === "none") return "";
  return safeLookup(RECOUNT_STATE, k, "");
}

export function inventoryReportStatusLabel(status: unknown): string {
  return safeLookup(REPORT_STATUS, status, String(status ?? "—"));
}

export function inventoryReportDescription(kind: unknown): string {
  return safeLookup(REPORT_DESCRIPTION, kind, "Eksport danych inwentaryzacji.");
}

export { inventoryAuditEventLabel as inventoryAuditActionLabel } from "./inventoryAuditEventLabels";

export function inventoryDocumentStatusBadgeClass(status: unknown): string {
  const s = String(status ?? "").toLowerCase();
  if (s === "in_progress" || s === "planned") return operationalBadgeInfoClass;
  if (s === "awaiting_approval") return operationalBadgeWarningClass;
  if (s === "approved" || s === "posted") return operationalBadgeSuccessClass;
  if (s === "cancelled") return operationalBadgeDangerClass;
  return operationalBadgeNeutralClass;
}

export function inventoryLineStatusBadgeClass(
  status: unknown,
  diffQty: number | null | undefined,
  recountState?: unknown,
): string {
  const rs = String(recountState ?? "").toLowerCase();
  if (rs === "required") return operationalBadgeWarningClass;
  if (rs === "resolved") return operationalBadgeSuccessClass;
  const s = String(status ?? "").toLowerCase();
  if (s === "recount") return operationalBadgeWarningClass;
  if (diffQty != null && Math.abs(diffQty) > 1e-9) return operationalBadgeWarningClass;
  if (s === "counted" || s === "approved") return operationalBadgeSuccessClass;
  if (s === "in_progress") return operationalBadgeInfoClass;
  return operationalBadgeNeutralClass;
}

export function inventoryDifferenceClassBadgeClass(diffClass: unknown): string {
  const k = String(diffClass ?? "").toLowerCase();
  if (k === "supervisor_review" || k === "variance" || k === "mandatory_recount") return operationalBadgeWarningClass;
  if (k === "auto_approve") return operationalBadgeSuccessClass;
  return operationalBadgeNeutralClass;
}

export function inventoryRecountStateBadgeClass(state: unknown): string {
  const k = String(state ?? "").toLowerCase();
  if (k === "required") return operationalBadgeWarningClass;
  if (k === "resolved") return operationalBadgeSuccessClass;
  return operationalBadgeNeutralClass;
}

export function inventoryReportStatusBadgeClass(status: unknown): string {
  const s = String(status ?? "").toLowerCase();
  if (s === "ready") return operationalBadgeSuccessClass;
  if (s === "failed") return operationalBadgeDangerClass;
  if (s === "generating" || s === "pending") return operationalBadgeInfoClass;
  return operationalBadgeNeutralClass;
}

/** Etykieta wiersza pozycji — różnica vs konflikt operatorów vs zweryfikowano. */
export function inventoryLineRowStatusLabel(line: {
  status: string;
  difference_quantity?: number | null;
  counted_quantity?: number | null;
  recount_state?: string | null;
}): string {
  const recountState = String(line.recount_state ?? "").toLowerCase();
  if (recountState === "required") return "Wymaga ponownego liczenia";
  if (recountState === "resolved") return "Zweryfikowano";
  const diff = line.difference_quantity;
  const hasDiff = diff != null && Math.abs(diff) > 1e-9;
  if (hasDiff) return "Różnica";
  if (line.counted_quantity != null) return "Policzono";
  return inventoryLineStatusLabel(line.status);
}
