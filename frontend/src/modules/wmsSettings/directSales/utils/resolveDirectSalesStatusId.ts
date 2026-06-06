import type { OrderStatusOption } from "../../../../types/wmsPackingSettings";

const LEGACY_HINTS: Record<string, string[]> = {
  new: ["nowe"],
  paid: ["opłacone", "oplacone", "paid"],
  ready: ["gotowe do wydania", "gotowe", "ready"],
  completed: ["zakończone", "zakonczone", "spakowane", "completed"],
};

export function resolveDirectSalesStatusId(
  configuredId: number | null | undefined,
  options: OrderStatusOption[],
  legacyKey?: string | null,
): number | null {
  if (configuredId != null && options.some((o) => o.id === configuredId)) {
    return configuredId;
  }
  const key = (legacyKey || "").trim().toLowerCase();
  const hints = LEGACY_HINTS[key];
  if (hints?.length) {
    for (const o of options) {
      const nm = (o.name || "").trim().toLowerCase();
      if (hints.some((h) => nm.includes(h) || nm === h)) {
        return o.id;
      }
    }
    if (key === "completed") {
      const done = options.find((o) => (o.main_group || "").toUpperCase() === "DONE");
      if (done) return done.id;
    }
  }
  return options[0]?.id ?? null;
}
