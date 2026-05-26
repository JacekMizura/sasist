/** Lista zadań „Po lokalizacjach” — spójne z `PickingRoutingResult.pick_list` (backend). */

export type LocationPickBasketRow = {
  basket_id: number | null;
  quantity: number;
};

export type LocationPickListRow = {
  location_id: number;
  location_code: string;
  product_id: number;
  total_quantity: number;
  baskets: LocationPickBasketRow[];
  /** Wzbogacenie z API produktu (opcjonalne). */
  product_name?: string;
  product_ean?: string;
  product_eans?: string[];
};
