/**
 * SSOT: aktywna sesja zbierania na karcie statusu.
 * Nie zgaduj z typu kafelka — używaj flag i pól z configured-statuses / active-session.
 */

export type PickingStatusSessionRow = {
  source_status_id: number;
  require_cart: boolean;
  cart_type?: "BULK" | "BASKETS" | null;
  has_operator_active_session?: boolean | null;
  active_cart_id?: number | null;
  active_cart_code?: string | null;
  active_cart_name?: string | null;
  active_cart_type?: "BULK" | "BASKETS" | null;
  active_session_id?: number | null;
  session_source_status_id?: number | null;
  in_progress_by_me?: number | null;
  session_products_picked?: number | null;
  session_products_total?: number | null;
  active_order_type?: "single" | "multi" | "all" | null;
};

export type OperatorActivePickingSession = {
  has_active_session: boolean;
  session_id: number | null;
  source_status_id: number | null;
  order_type: "single" | "multi" | "all" | null;
  has_cart: boolean;
  cart_id: number | null;
  cart_code: string | null;
  cart_name: string | null;
  cart_type: "BULK" | "BASKETS" | null;
};

/** Czy ta karta ma aktywną sesję operatora (źródło prawdy z API). */
export function statusRowHasActiveSession(r: PickingStatusSessionRow): boolean {
  if (r.has_operator_active_session === true) return true;
  if (r.active_session_id != null && r.active_session_id > 0) return true;
  if (r.active_cart_id != null && r.active_cart_id > 0) return true;
  if ((r.in_progress_by_me ?? 0) > 0) return true;
  if ((r.session_products_total ?? 0) > 0) return true;
  return false;
}

/** Badge wózka — wyłącznie przy aktywnej sesji. */
export function statusRowCartBadgeLabel(r: PickingStatusSessionRow): string | null {
  if (!statusRowHasActiveSession(r)) return null;
  const name = (r.active_cart_name || "").trim();
  if (name) return name;
  const code = (r.active_cart_code || "").trim();
  if (code) return code;
  if (r.active_cart_id != null && r.active_cart_id > 0) return `CART-${r.active_cart_id}`;
  return null;
}

/**
 * CTA „Zeskanuj wózek” — wyłącznie start nowej sesji.
 * Nigdy równolegle z aktywną sesją / badge / Realizowane przez Ciebie > 0.
 */
export function statusRowShowScanCartCta(r: PickingStatusSessionRow): boolean {
  if (!r.require_cart) return false;
  if (statusRowHasActiveSession(r)) return false;
  if (statusRowCartBadgeLabel(r)) return false;
  if ((r.in_progress_by_me ?? 0) > 0) return false;
  return true;
}

export function normalizeCartScanCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function looksLikePickingCartCode(raw: string): boolean {
  const c = normalizeCartScanCode(raw);
  if (!c) return false;
  return /^CART[-_]?\d+/i.test(c) || /^W[ÓO]ZEK/i.test(c);
}

/** Czy skan pasuje do już przypisanego wózka sesji. */
export function scanMatchesAssignedCart(
  raw: string,
  opts: { cartCode?: string | null; cartName?: string | null; cartId?: number | null },
): boolean {
  const scan = normalizeCartScanCode(raw);
  if (!scan) return false;
  const code = normalizeCartScanCode(opts.cartCode || "");
  if (code && (scan === code || scan.replace(/[-_]/g, "") === code.replace(/[-_]/g, ""))) {
    return true;
  }
  const name = normalizeCartScanCode(opts.cartName || "");
  if (name && scan === name) return true;
  if (opts.cartId != null && opts.cartId > 0) {
    if (scan === `CART-${opts.cartId}` || scan === `CART${opts.cartId}` || scan === String(opts.cartId)) {
      return true;
    }
  }
  return false;
}

/** Pierwszy wiersz z aktywną sesją wózkową (jeśli jest). */
export function findActiveCartStatusRow(
  rows: PickingStatusSessionRow[],
): PickingStatusSessionRow | null {
  for (const r of rows) {
    if (!statusRowHasActiveSession(r)) continue;
    if (r.active_cart_id != null && r.active_cart_id > 0) return r;
    if ((r.active_cart_code || "").trim() || (r.active_cart_name || "").trim()) return r;
  }
  return null;
}

export function findActiveStatusRowForSession(
  rows: PickingStatusSessionRow[],
  active: OperatorActivePickingSession | null,
): PickingStatusSessionRow | null {
  if (!active?.has_active_session) return findActiveCartStatusRow(rows);
  if (active.source_status_id != null) {
    const bySid = rows.find((r) => r.source_status_id === active.source_status_id);
    if (bySid) return bySid;
  }
  if (active.session_id != null) {
    const bySess = rows.find((r) => r.active_session_id === active.session_id);
    if (bySess) return bySess;
  }
  return findActiveCartStatusRow(rows);
}
