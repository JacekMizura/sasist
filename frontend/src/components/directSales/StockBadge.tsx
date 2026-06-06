import { resolveStockLevel, STOCK_BADGE } from "./directSalesTerminology";

type Props = {
  available: number | null | undefined;
  orderedQty: number;
};

export function StockBadge({ available, orderedQty }: Props) {
  const level = resolveStockLevel(available, orderedQty);
  const badge = STOCK_BADGE[level];
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}>
      {badge.label}
      {available != null ? ` (${available})` : ""}
    </span>
  );
}
