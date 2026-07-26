import type {
  DamageDecision,
  DamageEntryStatus,
  DamageReportStatus,
  DamageType,
} from "../../../types/damageReport";
import type { StatusTone } from "../../../design-system";

/** Display-only Polish labels for damage UI. API enums unchanged. */

export const DAMAGE_DECISION_OPTIONS: { value: DamageDecision; label: string }[] = [
  { value: "REPAIR", label: "Naprawa" },
  { value: "DISPOSE", label: "Utylizacja" },
  { value: "RETURN_TO_SUPPLIER", label: "Zwrot do dostawcy" },
  { value: "SELLABLE", label: "Przeklasyfikowanie" },
];

export const DAMAGE_TYPE_OPTIONS: { value: DamageType; label: string }[] = [
  { value: "mechanical", label: "Mechaniczna" },
  { value: "missing_parts", label: "Brakujące części" },
  { value: "flood", label: "Zalanie" },
  { value: "other", label: "Inne" },
];

export function labelDamageEntryStatus(status: string): string {
  switch (status) {
    case "NEW":
      return "Nowe";
    case "REVIEWED":
      return "Zweryfikowane";
    case "INCLUDED_IN_REPORT":
      return "W raporcie";
    default:
      return status;
  }
}

export function toneDamageEntryStatus(status: string): StatusTone {
  switch (status) {
    case "NEW":
      return "warning";
    case "REVIEWED":
      return "info";
    case "INCLUDED_IN_REPORT":
      return "success";
    default:
      return "neutral";
  }
}

export function labelDamageReportStatus(status: DamageReportStatus | string): string {
  switch (status) {
    case "draft":
      return "W trakcie";
    case "confirmed":
      return "Zamknięte";
    default:
      return String(status);
  }
}

export function toneDamageReportStatus(status: DamageReportStatus | string): StatusTone {
  return status === "confirmed" ? "success" : "warning";
}

export function labelDamageDecision(decision: string | null | undefined): string {
  if (!decision) return "—";
  const hit = DAMAGE_DECISION_OPTIONS.find((o) => o.value === decision);
  return hit?.label ?? decision;
}

export function toneDamageDecision(decision: string | null | undefined): StatusTone {
  switch (decision) {
    case "REPAIR":
      return "info";
    case "DISPOSE":
      return "danger";
    case "RETURN_TO_SUPPLIER":
      return "warning";
    case "SELLABLE":
      return "success";
    default:
      return "neutral";
  }
}

export function labelDamageType(type: string | null | undefined): string {
  if (!type) return "—";
  const hit = DAMAGE_TYPE_OPTIONS.find((o) => o.value === type);
  return hit?.label ?? type;
}

export type DamageEntryStatusFilter = DamageEntryStatus;
