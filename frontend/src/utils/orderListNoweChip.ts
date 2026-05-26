/**
 * Ukrywa tylko etykietę statusu systemowego „Nowe” (gdy `status === NEW`) po 24 h od `created_at`
 * (lub `order_date` gdy brak created_at). Zamówienie ze statusem PACKED / itd. i tak pokazuje inną etykietę.
 */
export function shouldHideNoweSystemStatusChip(o: {
  status?: string | null;
  created_at?: string | null;
  order_date?: string | null;
}): boolean {
  const st = (o.status ?? "").trim().toUpperCase();
  if (st !== "NEW") return false;
  const ref = o.created_at ?? o.order_date;
  if (!ref) return false;
  const t = new Date(ref).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t >= 24 * 60 * 60 * 1000;
}
