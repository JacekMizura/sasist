import type { WmsOperationalTaskApi } from "../api/wmsOperationalTasksApi";
import { formatOperationalDurationSince } from "./formatOperationalDuration";

export type ReplenishmentRow = {
  taskId: number;
  priority: number;
  productName: string;
  skuEan: string;
  sourceZone: string;
  sourceLocation: string;
  targetZone: string;
  targetLocation: string;
  currentQty: number;
  targetQty: number;
  suggestedQty: number;
  taskStatus: string;
  assignedOperatorId: number | null;
  slaDue: string | null;
  ageLabel: string;
  raw: WmsOperationalTaskApi;
};

function readPayload(task: WmsOperationalTaskApi): Record<string, unknown> {
  return (task.task_payload ?? {}) as Record<string, unknown>;
}

export function toReplenishmentRow(task: WmsOperationalTaskApi): ReplenishmentRow {
  const p = readPayload(task);
  const shelfQty = Number(p.shelf_qty ?? 0);
  const targetQty = shelfQty + Number(task.quantity_required ?? 0);
  const sourceZone = String(p.preferred_source_zone ?? p.source_zone ?? "BACKROOM");
  const targetZone = String(p.zone_type ?? task.location_hint ?? "SALES");
  const sku = task.product_sku ?? "";
  const ean = task.product_ean ?? "";
  const skuEan = [sku, ean].filter(Boolean).join(" / ") || "—";

  return {
    taskId: task.id,
    priority: task.priority,
    productName: task.product_name || `Produkt #${task.product_id}`,
    skuEan,
    sourceZone,
    sourceLocation: String(p.source_scan_code ?? p.source_location ?? task.location_hint ?? "—"),
    targetZone,
    targetLocation: String(p.target_scan_code ?? p.target_location ?? "—"),
    currentQty: shelfQty,
    targetQty,
    suggestedQty: task.quantity_remaining,
    taskStatus: task.orchestration_state ?? task.status,
    assignedOperatorId: task.assigned_user_id ?? null,
    slaDue: task.sla_due_at ?? null,
    ageLabel: formatOperationalDurationSince(task.created_at ?? undefined) || "—",
    raw: task,
  };
}

export function orchColumn(task: WmsOperationalTaskApi): string {
  const o = (task.orchestration_state ?? "").toUpperCase();
  if (o) return o;
  if (task.status === "done") return "COMPLETED";
  if (task.status === "in_progress") return "ACTIVE";
  if (task.status === "cancelled") return "BLOCKED";
  return "QUEUED";
}
