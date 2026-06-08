/**
 * Inwentaryzacja — polskie etykiety UI (nigdy surowe enumy z backendu).
 */

import {
  operationalBadgeDangerClass,
  operationalBadgeInfoClass,
  operationalBadgeNeutralClass,
  operationalBadgeSuccessClass,
  operationalBadgeWarningClass,
} from "../../../components/operational/operationalSemanticBadges";

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
  visible: "Liczba z widocznym stanem",
};

const LOCK_MODE: Record<string, string> = {
  snapshot: "Migawka stanów",
  soft: "Miękka blokada",
  hard: "Twarda blokada",
};

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
  mandatory_recount: "Wymaga ponownego liczenia",
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

const AUDIT_ACTION: Record<string, string> = {
  document_created: "Utworzono dokument",
  document_started: "Uruchomiono liczenie",
  document_submitted: "Wysłano do zatwierdzenia",
  document_approved: "Zatwierdzono",
  document_rejected: "Odrzucono",
  document_posted: "Zaksięgowano korekty",
  scan_recorded: "Zapisano skan",
  line_updated: "Zaktualizowano pozycję",
  recount_requested: "Zlecono ponowne liczenie",
  export_generated: "Wygenerowano eksport",
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

export function inventoryLockModeLabel(mode: unknown): string {
  return safeLookup(LOCK_MODE, mode, String(mode ?? "—"));
}

export function inventoryLineStatusLabel(status: unknown): string {
  return safeLookup(LINE_STATUS, status, String(status ?? "—"));
}

export function inventoryDifferenceClassLabel(diffClass: unknown): string {
  const k = String(diffClass ?? "").trim();
  if (!k || k === "none") return "";
  return safeLookup(DIFF_CLASS, k, k);
}

export function inventoryReportStatusLabel(status: unknown): string {
  return safeLookup(REPORT_STATUS, status, String(status ?? "—"));
}

export function inventoryReportDescription(kind: unknown): string {
  return safeLookup(REPORT_DESCRIPTION, kind, "Eksport danych inwentaryzacji.");
}

export function inventoryAuditActionLabel(action: unknown): string {
  const raw = String(action ?? "").trim();
  if (!raw) return "—";
  const key = raw.toLowerCase().replace(/\s+/g, "_");
  return AUDIT_ACTION[key] ?? raw.replace(/_/g, " ");
}

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
): string {
  const s = String(status ?? "").toLowerCase();
  if (s === "recount") return operationalBadgeWarningClass;
  if (diffQty != null && Math.abs(diffQty) > 1e-9) return operationalBadgeDangerClass;
  if (s === "counted" || s === "approved") return operationalBadgeSuccessClass;
  if (s === "in_progress") return operationalBadgeInfoClass;
  return operationalBadgeNeutralClass;
}

export function inventoryDifferenceClassBadgeClass(diffClass: unknown): string {
  const k = String(diffClass ?? "").toLowerCase();
  if (k === "mandatory_recount") return operationalBadgeWarningClass;
  if (k === "supervisor_review") return operationalBadgeDangerClass;
  if (k === "auto_approve") return operationalBadgeSuccessClass;
  return operationalBadgeNeutralClass;
}

export function inventoryReportStatusBadgeClass(status: unknown): string {
  const s = String(status ?? "").toLowerCase();
  if (s === "ready") return operationalBadgeSuccessClass;
  if (s === "failed") return operationalBadgeDangerClass;
  if (s === "generating" || s === "pending") return operationalBadgeInfoClass;
  return operationalBadgeNeutralClass;
}

/** Etykieta wiersza pozycji — bez angielskich skrótów OK/RECOUNT. */
export function inventoryLineRowStatusLabel(
  line: { status: string; difference_quantity?: number | null; counted_quantity?: number | null },
): string {
  const diff = line.difference_quantity;
  const hasDiff = diff != null && Math.abs(diff) > 1e-9;
  if (line.status === "recount") return "Ponowne liczenie";
  if (hasDiff) return "Różnica";
  if (line.counted_quantity != null) return "Policzono";
  return inventoryLineStatusLabel(line.status);
}
