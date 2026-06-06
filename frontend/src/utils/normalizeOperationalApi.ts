import type { LiveEvent } from "../api/operationalRuntimeApi";
import type { OperationalAlert } from "../api/operationalAlertsApi";
import type { WmsOperationalTaskApi } from "../api/wmsOperationalTasksApi";
import { safeTrim } from "./safeStrings";

/** Defensive normalization at API boundary — components must not trust raw payloads. */
export function normalizeOperationalAlert(raw: OperationalAlert): OperationalAlert {
  return {
    ...raw,
    alert_type: safeTrim(raw.alert_type) || "UNKNOWN",
    severity: safeTrim(raw.severity) || "INFO",
    status: safeTrim(raw.status) || "OPEN",
    title: safeTrim(raw.title) || "Alert operacyjny",
    message: raw.message != null ? safeTrim(raw.message) || null : null,
    entity_type: raw.entity_type != null ? safeTrim(raw.entity_type) || null : null,
  };
}

export function normalizeWmsOperationalTask(raw: WmsOperationalTaskApi): WmsOperationalTaskApi {
  const productId = raw.product_id;
  return {
    ...raw,
    task_type: safeTrim(raw.task_type) || "UNKNOWN",
    status: safeTrim(raw.status) || "open",
    queue: safeTrim(raw.queue) || "default",
    product_name: safeTrim(raw.product_name) || (productId != null ? `Produkt #${productId}` : "Produkt"),
    product_sku: raw.product_sku != null ? safeTrim(raw.product_sku) || null : null,
    product_ean: raw.product_ean != null ? safeTrim(raw.product_ean) || null : null,
    summary_line: safeTrim(raw.summary_line) || `Zadanie #${raw.id}`,
    group_key: safeTrim(raw.group_key) || `task-${raw.id}`,
    location_hint: raw.location_hint != null ? safeTrim(raw.location_hint) || null : null,
    orchestration_state:
      raw.orchestration_state != null ? safeTrim(raw.orchestration_state) || null : null,
    blocked_reason: raw.blocked_reason != null ? safeTrim(raw.blocked_reason) || null : null,
    order_number: raw.order_number != null ? safeTrim(raw.order_number) || null : null,
    picked_from_location:
      raw.picked_from_location != null ? safeTrim(raw.picked_from_location) || null : null,
  };
}

export function normalizeLiveEvent(raw: LiveEvent): LiveEvent {
  return {
    ...raw,
    event_type: safeTrim(raw.event_type) || "unknown",
  };
}
