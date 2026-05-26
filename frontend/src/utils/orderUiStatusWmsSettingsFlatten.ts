import { orderPanelGroupTitle } from "./orderPanelStatusUi";
import type { OrderUiMainGroup, OrderUiStatusPanelSummary } from "../types/orderUiStatus";

export type WmsSettingsOrderStatusRow = {
  id: number;
  name: string;
  main_group: OrderUiMainGroup;
  /** Kolor znacznika (badge) — jak na panelu zamówień. */
  accentColor: string;
  /** Ścieżka grupy do kolumny operacyjnej (Sellasist-style). */
  operationalGroup: string;
};

/** Spłaszcza podsumowanie panelu do tabeli konfiguracyjnej modułów WMS. */
export function flattenOrderUiStatusPanelForWmsModuleSettings(
  summary: OrderUiStatusPanelSummary | null,
): WmsSettingsOrderStatusRow[] {
  if (!summary?.groups?.length) return [];
  const out: WmsSettingsOrderStatusRow[] = [];
  for (const block of summary.groups) {
    const blockLabel = (block.group_display_name ?? "").trim() || orderPanelGroupTitle(block.main_group);
    for (const s of block.sub_statuses) {
      const gn = (s.group_name ?? "").trim();
      const sn = (s.subgroup_name ?? "").trim();
      const trail = [blockLabel, gn, sn].filter(Boolean);
      out.push({
        id: s.id,
        name: (s.name || "").trim() || `Status #${s.id}`,
        main_group: s.main_group,
        accentColor: (s.badge_color || s.color || "#64748b").trim() || "#64748b",
        operationalGroup: trail.join(" › "),
      });
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "pl", { sensitivity: "base" }));
  return out;
}
