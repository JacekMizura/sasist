import type { OrderUiStatusPanelSummary } from "../../../types/orderUiStatus";
import type { PanelConfigurableUiStatusBrief } from "../../../utils/panelListStatusBriefMappers";

export type OrderUiStatusBriefById = Map<number, PanelConfigurableUiStatusBrief & { id: number }>;

/** Status registry briefs (name + colors) keyed by id — SSOT for badge presentation. */
export function buildOrderUiStatusBriefById(
  summary: OrderUiStatusPanelSummary | null | undefined,
): OrderUiStatusBriefById {
  const m: OrderUiStatusBriefById = new Map();
  for (const g of summary?.groups ?? []) {
    for (const s of g.sub_statuses ?? []) {
      const name = (s.name || "").trim() || `#${s.id}`;
      m.set(s.id, {
        id: s.id,
        name,
        color: s.color,
        main_group: s.main_group,
        badge_color: s.badge_color ?? null,
        background_color: s.background_color ?? null,
        text_color: s.text_color ?? null,
        image_url: s.image_url ?? null,
        is_active: s.is_active,
      });
    }
  }
  return m;
}

/** Status display names — name only, no group suffix. */
export function buildOrderUiStatusNameById(
  summary: OrderUiStatusPanelSummary | null | undefined,
): Map<number, string> {
  const m = new Map<number, string>();
  for (const [id, brief] of buildOrderUiStatusBriefById(summary)) {
    m.set(id, brief.name);
  }
  return m;
}

export function fallbackOrderUiStatusBrief(
  id: number,
  name?: string | null,
): PanelConfigurableUiStatusBrief & { id: number } {
  return {
    id,
    name: (name || "").trim() || `#${id}`,
    color: "#94a3b8",
    main_group: "DONE",
  };
}
