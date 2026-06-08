/** Stock source label — shelf vs carrier context for inventory lines. */

export function inventoryStockSourceLabel(line: {
  carrier_id?: number | null;
  carrier_code?: string | null;
}): { label: string; detail: string } {
  if (line.carrier_id != null || line.carrier_code) {
    return {
      label: "W nośniku",
      detail: line.carrier_code ? `Nośnik ${line.carrier_code}` : "Nośnik",
    };
  }
  return {
    label: "Na półce",
    detail: "Bezpośrednio w lokalizacji (bez nośnika)",
  };
}
