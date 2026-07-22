/** Compact cart stock — SSOT available from session enrichment / location-stock. */
type Props = {
  available: number | null | undefined;
  orderedQty: number;
  inCart?: boolean;
};

function formatQty(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1000) / 1000).replace(".", ",");
}

export function LineStockBadge({ available, orderedQty, inCart = true }: Props) {
  const avail = available ?? null;

  if (inCart) {
    if (avail == null) return null;
    const low = avail > 0 && (avail < orderedQty || avail < 3);
    return (
      <span
        className={`rounded-lg border px-2 py-1 text-[10px] font-bold tracking-wide ${
          avail <= 0
            ? "border-red-100 bg-red-50 text-red-700"
            : low
              ? "border-amber-100 bg-amber-50 text-amber-900"
              : "border-emerald-100 bg-emerald-50 text-emerald-800"
        }`}
      >
        Dostępne: {formatQty(avail)} szt.
      </span>
    );
  }

  if (avail == null) return null;
  if (avail <= 0) {
    return (
      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">Brak</span>
    );
  }
  if (avail < orderedQty || avail < 3) {
    return (
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
        Niski stan ({formatQty(avail)})
      </span>
    );
  }
  return (
    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
      Dostępne: {formatQty(avail)} szt.
    </span>
  );
}
