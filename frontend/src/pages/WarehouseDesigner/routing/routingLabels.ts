/** Shared types / labels for designer Routes workspace (Polish UX only). */

/** UI-selectable operational types (5). Legacy values remain valid in DB. */
export const ROUTING_OP_OPTIONS: { value: string; label: string }[] = [
  { value: "picking_start", label: "Start" },
  { value: "packing", label: "Pakowanie" },
  { value: "receiving_dock", label: "Przyjęcia" },
  { value: "receiving_buffer", label: "Strefa buforowa" },
];

/** Legacy operational_type → operator label (not offered in the select). */
export const ROUTING_OP_LEGACY_LABELS: Record<string, string> = {
  putaway_buffer: "Strefa buforowa",
  cart_parking: "Strefa wózków (legacy)",
  consolidation: "Konsolidacja (legacy)",
  end_point: "Punkt końcowy (legacy)",
  // Old Polish-era aliases if any persisted as value
};

/** Map deprecated aliases to the current UI canonical value when editing. */
export const ROUTING_OP_LEGACY_TO_UI: Record<string, string> = {
  putaway_buffer: "receiving_buffer",
};

export const ROUTING_PROCESS_OPTIONS = [
  { value: "picking", label: "Kompletacja" },
  { value: "putaway", label: "Rozlokowanie" },
  { value: "replenishment", label: "Uzupełnienia" },
];

export const ROUTING_TRANSPORT_OPTIONS = [
  { value: "foot", label: "Pieszo" },
  { value: "cart", label: "Wózek kompletacyjny" },
  { value: "pallet_jack", label: "Paleciak" },
  { value: "forklift", label: "Wózek widłowy" },
];

export type RoutingTool = "select" | "add_node" | "draw_edge" | "test_route";

export function isUiOperationalType(value: string | null | undefined): boolean {
  if (!value) return false;
  return ROUTING_OP_OPTIONS.some((o) => o.value === value);
}

/** Label for canvas / panel — includes legacy mapping. */
export function operationalTypeLabel(op: string | null | undefined): string | null {
  if (!op) return null;
  const ui = ROUTING_OP_OPTIONS.find((o) => o.value === op);
  if (ui) return ui.label;
  if (ROUTING_OP_LEGACY_LABELS[op]) return ROUTING_OP_LEGACY_LABELS[op];
  return op;
}
