/** Pure helpers for panel_fulfillment_history display (no React). */

export type PanelHistoryEntryLike = {
  kind?: string | null;
  quantity_ordered?: number | null;
  quantity_before?: number | null;
  quantity_affected?: number | null;
};

/** Zamówiono (przed zdarzeniem) — legacy wpisy bez quantity_before używają quantity_ordered dla pełnego usunięcia. */
export function panelHistoryOrderedQty(e: PanelHistoryEntryLike): number | null {
  const qb = e.quantity_before;
  if (qb != null && Number.isFinite(Number(qb))) return Number(qb);
  const k = (e.kind ?? "").trim();
  if (k === "order_line_removed") {
    const qo = e.quantity_ordered;
    if (qo != null && Number.isFinite(Number(qo))) return Number(qo);
  }
  if (k === "shortage_reduced") {
    return null;
  }
  const qo = e.quantity_ordered;
  if (qo != null && Number.isFinite(Number(qo))) return Number(qo);
  return null;
}

/** Usunięto / zmniejszono. */
export function panelHistoryAffectedQty(e: PanelHistoryEntryLike): number | null {
  const qa = e.quantity_affected;
  if (qa != null && Number.isFinite(Number(qa))) return Number(qa);
  const qo = e.quantity_ordered;
  if (qo != null && Number.isFinite(Number(qo))) return Number(qo);
  return null;
}
