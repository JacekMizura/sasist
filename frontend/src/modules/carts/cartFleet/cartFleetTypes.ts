export type BasketDetail = {
  id: number;
  name: string | null;
  barcode?: string | null;
  row: number;
  column: number;
  length?: number;
  width?: number;
  height?: number;
  order_id: number | null;
  order_number: string | null;
  order_customer_name?: string | null;
  used_volume_dm3: number;
  total_weight_kg?: number;
  picking_shortage_qty?: number | null;
  picking_status?: string | null;
  picking_status_label?: string | null;
};

export function basketSlotCode(b: BasketDetail): string {
  const bc = (b.barcode ?? "").trim();
  if (bc) return bc;
  const n = b.name && String(b.name).trim();
  if (n) return n;
  return `S-${b.row}-${b.column}`;
}
