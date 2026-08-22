import { StatusBadge, type StatusTone } from "@/design-system";
import type { BusinessDocStatus } from "./warehouseDocumentsUi";
import { normalizeWarehouseDocType, warehouseDocTypeBadgeLabel } from "./warehouseDocumentsUi";

function businessStatusTone(status: BusinessDocStatus): StatusTone {
  switch (status) {
    case "ZREALIZOWANA":
    case "ZAKOŃCZONE":
    case "GOTOWE":
    case "OTWARTY":
      return "success";
    case "W TRAKCIE":
      return "warning";
    case "ANULOWANE":
      return "danger";
    case "ZAMKNIĘTY":
      return "neutral";
    default:
      return "neutral";
  }
}

function documentTypeTone(code: string): StatusTone {
  const u = code.trim().toUpperCase();
  if (u === "FV" || u === "FAKTURA" || u === "WZ") return "primary";
  if (u === "PA" || u === "PARAGON" || u === "PZ" || u === "ZD") return "info";
  if (u.includes("KOR") || u === "KOREKTA" || u === "ZW" || u === "RW") return "warning";
  if (u === "PW") return "success";
  if (u === "MM" || u === "Z_PZ" || u === "Z-PZ" || u === "INV") return "info";
  return "neutral";
}

/** Payment badge — green paid, gray unpaid / unknown. */
export function PaymentStatusBadge({ paid }: { paid?: boolean | null }) {
  if (paid === true) {
    return <StatusBadge tone="success">Opłacone</StatusBadge>;
  }
  return <StatusBadge tone="neutral">Nieopłacone</StatusBadge>;
}

/** Neutral badge for warehouse / not applicable. */
export function PaymentNotApplicableBadge() {
  return <StatusBadge tone="neutral">N/D</StatusBadge>;
}

export function ExternalStatusBadge({ status }: { status: BusinessDocStatus }) {
  return (
    <StatusBadge tone={businessStatusTone(status)} className="uppercase tracking-wide">
      {status}
    </StatusBadge>
  );
}

/** Sales-style document type (FV, PA, Korekta) — StatusBadge tones. */
export function DocumentTypeBadge({ code }: { code: string }) {
  const u = code.trim().toUpperCase();
  const mag = ["PZ", "Z_PZ", "PW", "WZ", "MM", "RW", "ZW", "ZD", "INV"];
  const norm = mag.includes(u) || u === "Z-PZ" ? normalizeWarehouseDocType(u) : null;
  const label = norm ? warehouseDocTypeBadgeLabel(norm) : u === "Z_PZ" || u === "Z-PZ" ? "Z-PZ" : u.slice(0, 8);
  return (
    <StatusBadge tone={documentTypeTone(u)} className="uppercase tracking-wide">
      {label}
    </StatusBadge>
  );
}
