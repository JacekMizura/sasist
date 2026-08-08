import type { OrderUiStatusPanelSummary } from "../../../types/orderUiStatus";

/** Status display names as in automations — name only, no group suffix. */
export function buildOrderUiStatusNameById(
  summary: OrderUiStatusPanelSummary | null | undefined,
): Map<number, string> {
  const m = new Map<number, string>();
  for (const g of summary?.groups ?? []) {
    for (const s of g.sub_statuses ?? []) {
      const name = (s.name || "").trim();
      m.set(s.id, name || `#${s.id}`);
    }
  }
  return m;
}
