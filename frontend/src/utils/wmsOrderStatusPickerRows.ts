import type { OrderUiMainGroup, OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary, OrderUiStatusWithCount } from "../types/orderUiStatus";
import { ORDERS_PANEL_GROUP_LABELS } from "../components/orders/OrdersPanelStatusSidebar";
import { buildPanelSidebarLayout } from "./orderPanelSidebarBuckets";
import { MAIN_PANEL_GROUP_ORDER } from "./orderPanelMainGroupOrder";

export type WmsStatusPickerRow =
  | { kind: "main"; key: string; label: string; mainGroup: OrderUiMainGroup }
  | { kind: "sep"; key: string; label: string }
  | { kind: "status"; key: string; mainGroup: OrderUiMainGroup; subgroup: string | null; status: OrderUiStatusWithCount };

export function buildWmsOrderedStatusPickerRows(
  summary: OrderUiStatusPanelSummary | null,
  subgroups: OrderUiPanelSubgroupRead[],
): WmsStatusPickerRow[] {
  const blocks = new Map<OrderUiMainGroup, OrderUiStatusPanelSummary["groups"][number]>();
  for (const g of summary?.groups ?? []) {
    blocks.set(g.main_group, g);
  }
  const defs = subgroups ?? [];
  const rows: WmsStatusPickerRow[] = [];
  for (const mg of MAIN_PANEL_GROUP_ORDER) {
    const block = blocks.get(mg);
    if (!block?.sub_statuses?.length) continue;
    rows.push({ kind: "main", key: `mg-${mg}`, label: ORDERS_PANEL_GROUP_LABELS[mg], mainGroup: mg });
    const { ungrouped, subgroupSections } = buildPanelSidebarLayout(mg, block.sub_statuses, defs);
    for (const s of ungrouped) {
      rows.push({ kind: "status", key: `st-${mg}-${s.id}`, mainGroup: mg, subgroup: null, status: s });
    }
    for (const sec of subgroupSections) {
      rows.push({ kind: "sep", key: `sep-${mg}-${sec.key}`, label: sec.title });
      for (const s of sec.rows) {
        rows.push({
          kind: "status",
          key: `st-${mg}-${sec.key}-${s.id}`,
          mainGroup: mg,
          subgroup: sec.title,
          status: s,
        });
      }
    }
  }
  return rows;
}

export function filterWmsStatusPickerRows(rows: WmsStatusPickerRow[], q: string): WmsStatusPickerRow[] {
  const s = q.trim().toLowerCase();
  if (!s) return rows;
  const idx = new Set<number>();
  rows.forEach((r, i) => {
    if (r.kind !== "status") return;
    if (!r.status.name.toLowerCase().includes(s)) return;
    idx.add(i);
    for (let j = i - 1; j >= 0; j--) {
      const rr = rows[j]!;
      if (rr.kind === "main") {
        idx.add(j);
        break;
      }
      if (rr.kind === "sep") idx.add(j);
    }
  });
  return rows.filter((_, i) => idx.has(i));
}
