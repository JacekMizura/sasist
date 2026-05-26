import type { ComplaintStatusCode } from "../types/complaint";
import { COMPLAINT_STATUS_LABELS_PL, normalizeComplaintStatus } from "../types/complaint";
import type { ReturnStatusBrief, ReturnUiStatusBrief } from "../types/wmsReturn";
import type { PanelSidebarMainGroup } from "./panelSidebarHierarchy";
import { isValidPanelStatusHex } from "./panelStatusColor";

/** Minimal shape for {@link OrderUiStatusConfigRowPresent} / panel sidebar rich styles. */
export type PanelConfigurableUiStatusBrief = {
  name: string;
  color: string;
  main_group: PanelSidebarMainGroup;
  badge_color?: string | null;
  background_color?: string | null;
  text_color?: string | null;
  image_url?: string | null;
  is_active?: boolean;
};

const RMZ_COLOR_NAME_HEX: Record<string, string> = {
  blue: "#3b82f6",
  green: "#22c55e",
  red: "#ef4444",
  slate: "#64748b",
  amber: "#f59e0b",
  emerald: "#10b981",
  rose: "#f43f5e",
  violet: "#8b5cf6",
  orange: "#f97316",
  cyan: "#06b6d4",
  lime: "#84cc16",
  fuchsia: "#d946ef",
};

/** RMZ workflow status → same colored bar + tint pipeline as panel UI statuses. */
export function returnWorkflowStatusToPanelBrief(status: ReturnStatusBrief): PanelConfigurableUiStatusBrief {
  const main_group: PanelSidebarMainGroup =
    status.type === "in_progress"
      ? "IN_PROGRESS"
      : status.type === "done_success" || status.type === "done_rejected"
        ? "DONE"
        : "NEW";
  const c = (status.color || "").trim();
  const color = isValidPanelStatusHex(c) ? c : (RMZ_COLOR_NAME_HEX[c.toLowerCase()] ?? "");
  return {
    name: status.name,
    color,
    main_group,
  };
}

/** Etykieta panelu (triaged RMZ) → ten sam pipeline kolorów co sidebar / OrderUiStatusConfigRowPresent. */
export function returnUiStatusBriefToPanelBrief(ui: ReturnUiStatusBrief): PanelConfigurableUiStatusBrief {
  const c = (ui.color || "").trim();
  const color = isValidPanelStatusHex(c) ? c : (RMZ_COLOR_NAME_HEX[c.toLowerCase()] ?? "");
  return {
    name: ui.name,
    color,
    main_group: ui.main_group,
    badge_color: ui.badge_color ?? null,
    background_color: ui.background_color ?? null,
    text_color: ui.text_color ?? null,
    image_url: ui.image_url ?? null,
    is_active: ui.is_active,
  };
}

/** Stripe hex aligned with {@link COMPLAINT_STATUS_STYLES} family. */
const COMPLAINT_STRIPE_HEX: Record<ComplaintStatusCode, string> = {
  NOWE: "#16a34a",
  OCZEKIWANIE_NA_PRODUKT: "#d97706",
  WERYFIKACJA: "#2563eb",
  DECYZJA: "#ea580c",
  ZAAKCEPTOWANA: "#15803d",
  ODRZUCONA: "#dc2626",
};

const COMPLAINT_MAIN_GROUP: Record<ComplaintStatusCode, PanelSidebarMainGroup> = {
  NOWE: "NEW",
  OCZEKIWANIE_NA_PRODUKT: "IN_PROGRESS",
  WERYFIKACJA: "IN_PROGRESS",
  DECYZJA: "IN_PROGRESS",
  ZAAKCEPTOWANA: "DONE",
  ODRZUCONA: "DONE",
};

export function complaintStatusToPanelBrief(code: ComplaintStatusCode): PanelConfigurableUiStatusBrief {
  return {
    name: COMPLAINT_STATUS_LABELS_PL[code],
    color: COMPLAINT_STRIPE_HEX[code],
    main_group: COMPLAINT_MAIN_GROUP[code],
  };
}

/** Fallback for unknown `status` strings from API. */
export function complaintRawStatusToPanelBrief(raw: string | null | undefined): PanelConfigurableUiStatusBrief {
  const code = normalizeComplaintStatus(raw);
  return complaintStatusToPanelBrief(code);
}
