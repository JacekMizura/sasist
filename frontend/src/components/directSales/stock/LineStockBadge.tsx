type Props = {
  available: number | null | undefined;
  orderedQty: number;
  inCart?: boolean;
};

/** Cart lines never show misleading "Brak (0)" — only pre-add warnings. */
export function LineStockBadge({ available, orderedQty, inCart = true }: Props) {
  if (inCart) {
    const avail = available ?? null;
    if (avail != null && avail > 0 && avail < orderedQty) {
      return (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
          Ostatnie sztuki
        </span>
      );
    }
    if (avail != null && avail > 0 && avail < 3) {
      return (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
          Niski stan
        </span>
      );
    }
    return null;
  }

  const avail = available ?? null;
  if (avail == null) return null;
  if (avail <= 0) {
    return (
      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">Brak</span>
    );
  }
  if (avail < orderedQty || avail < 3) {
    return (
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
        Niski stan ({avail})
      </span>
    );
  }
  return (
    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
      Dostępny ({avail})
    </span>
  );
}
