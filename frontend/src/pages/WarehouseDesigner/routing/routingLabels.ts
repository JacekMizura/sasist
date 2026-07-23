/** Shared types / labels for designer Routes workspace (Polish UX only). */

export const ROUTING_OP_OPTIONS: { value: string; label: string }[] = [
  { value: "picking_start", label: "Start kompletacji" },
  { value: "packing", label: "Pakowanie" },
  { value: "receiving_dock", label: "Przyjęcie / Dock" },
  { value: "receiving_buffer", label: "Bufor przyjęcia" },
  { value: "putaway_buffer", label: "Bufor rozlokowania" },
  { value: "cart_parking", label: "Strefa odkładania wózków" },
  { value: "consolidation", label: "Konsolidacja" },
  { value: "end_point", label: "Punkt końcowy" },
];

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
