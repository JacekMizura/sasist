/**
 * Deep-link STATUS_ACTION → panel status configurator (ORDER / RETURN / COMPLAINT).
 */
import type { AutomationEntityType } from "../api/automationsApi";

export const STATUS_ACTION_EDIT_QUERY = "editStatusId";

export type StatusActionDeepLink =
  | { ok: true; path: string; entityType: AutomationEntityType; statusId: number }
  | { ok: false; reason: "missing_status_id" | "unsupported_entity"; message: string };

export function statusActionConfiguratorPath(
  entityType: string,
  statusId: number,
): string {
  const et = String(entityType || "").toUpperCase();
  const q = `${STATUS_ACTION_EDIT_QUERY}=${encodeURIComponent(String(statusId))}`;
  if (et === "ORDER") return `/orders/statuses?${q}`;
  if (et === "RETURN") return `/orders/returns/statuses?${q}`;
  if (et === "COMPLAINT") return `/settings/complaints/ui-statuses?${q}`;
  return `/orders/statuses?${q}`;
}

export function resolveStatusActionDeepLink(opts: {
  entityType?: string | null;
  triggerStatusId?: number | null;
}): StatusActionDeepLink {
  const et = String(opts.entityType || "").toUpperCase();
  const sid = opts.triggerStatusId;
  if (sid == null || !Number.isFinite(Number(sid)) || Number(sid) <= 0) {
    return {
      ok: false,
      reason: "missing_status_id",
      message: "Ta akcja statusu nie ma poprawnego status_id w konfiguracji wyzwalacza.",
    };
  }
  if (et !== "ORDER" && et !== "RETURN" && et !== "COMPLAINT") {
    return {
      ok: false,
      reason: "unsupported_entity",
      message: `Nieobsługiwana domena automatyzacji statusu: ${et || "—"}.`,
    };
  }
  const statusId = Number(sid);
  return {
    ok: true,
    entityType: et as AutomationEntityType,
    statusId,
    path: statusActionConfiguratorPath(et, statusId),
  };
}

export function statusActionDomainLabel(entityType?: string | null): string {
  const et = String(entityType || "").toUpperCase();
  if (et === "ORDER") return "Zamówienia";
  if (et === "RETURN") return "Zwroty";
  if (et === "COMPLAINT") return "Reklamacje";
  return et || "—";
}

/** Key for cross-domain status name maps (ids can collide across entity types). */
export function statusNameMapKey(entityType: string, statusId: number): string {
  return `${String(entityType).toUpperCase()}:${statusId}`;
}
