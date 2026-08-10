/**
 * SSOT: aktywna sesja zbierania na karcie statusu.
 * Progres / badge / CTA wynikają wyłącznie z sesji operatora — nie z „wolnej kolejki”.
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
  products_picked?: number | null;
  products_total?: number | null;
};

/** Czy ta karta ma aktywną sesję operatora (źródło prawdy z API). */
export function statusRowHasActiveSession(r: PickingStatusSessionRow): boolean {
  if (r.has_operator_active_session === true) return true;
  if (r.active_session_id != null && r.active_session_id > 0) return true;
  if (r.active_cart_id != null && r.active_cart_id > 0) return true;
  if ((r.in_progress_by_me ?? 0) > 0) return true;
  return false;
}

/** Badge wózka — wyłącznie przy aktywnej sesji z wózkiem. */
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
 * „Produkty do zebrania” — TYLKO dla karty z moją aktywną sesją wózkową.
 * Nigdy 0/0 na obcych statusach / bez wózka.
 */
export function statusRowShowSessionProgress(r: PickingStatusSessionRow): boolean {
  if (!statusRowHasActiveSession(r)) return false;
  return statusRowCartBadgeLabel(r) != null || (r.active_cart_id != null && r.active_cart_id > 0);
}

/**
 * Czy start statusu wymaga skanu wózka (poza kartą — centralny prompt / skaner).
 * Karty NIGDY nie pokazują CTA skanu — to tylko warunek logiki skanera.
 */
export function statusRowNeedsCartScanToStart(
  r: PickingStatusSessionRow,
  opts?: { operatorHasActiveCartSession?: boolean },
): boolean {
  if (!r.require_cart) return false;
  if (!r.cart_type) return false;
  if (opts?.operatorHasActiveCartSession === true) return false;
  if (statusRowHasActiveSession(r)) return false;
  if (statusRowCartBadgeLabel(r)) return false;
  if ((r.in_progress_by_me ?? 0) > 0) return false;
  return true;
}

/** @deprecated In-card CTA usunięte — zawsze false. Użyj statusRowNeedsCartScanToStart. */
export function statusRowShowScanCartCta(
  r: PickingStatusSessionRow,
  opts?: { operatorHasActiveCartSession?: boolean },
): boolean {
  void r;
  void opts;
  return false;
}

export function operatorHasActiveCartSession(
  active: OperatorActivePickingSession | null | undefined,
  rows: PickingStatusSessionRow[],
): boolean {
  if (active?.has_active_session && active.has_cart && active.cart_id != null && active.cart_id > 0) {
    return true;
  }
  return findActiveCartStatusRow(rows) != null;
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
  if (active.cart_id != null) {
    const byCart = rows.find((r) => r.active_cart_id === active.cart_id);
    if (byCart) return byCart;
  }
  // Typ wózka → kafelek (BULK / BASKETS), bez mieszania typów.
  if (active.cart_type === "BULK" || active.cart_type === "BASKETS") {
    const byType = rows.find(
      (r) => r.require_cart && r.cart_type === active.cart_type && !statusRowHasActiveSession(r),
    );
    if (byType) return byType;
  }
  return findActiveCartStatusRow(rows);
}

/**
 * Uzupełnij wiersze statusów z GET /picking/active-session gdy configured-statuses
 * nie dokleiło sesji (np. brak meta.source_status_id). Nie miesza typów wózków.
 */
export function mergeActiveSessionIntoStatusRows<T extends PickingStatusSessionRow>(
  rows: T[],
  active: OperatorActivePickingSession | null,
): T[] {
  if (!active?.has_active_session) return rows;
  if (rows.some((r) => statusRowHasActiveSession(r) && (r.active_cart_id != null || r.active_session_id != null))) {
    // Już spójnie sparowane z API statusów — ewentualnie tylko dopisz counts.
    return rows.map((r) => {
      if (!statusRowHasActiveSession(r)) return r;
      if (r.active_session_id !== active.session_id && r.active_cart_id !== active.cart_id) return r;
      const picked = r.session_products_picked ?? active.products_picked ?? 0;
      const total = r.session_products_total ?? active.products_total ?? 0;
      if (
        (r.session_products_total ?? 0) > 0 ||
        (active.products_total ?? 0) <= 0
      ) {
        return r;
      }
      return {
        ...r,
        session_products_picked: picked,
        session_products_total: total,
        has_operator_active_session: true,
      };
    });
  }

  const target = findActiveStatusRowForSession(rows, active);
  if (!target) return rows;
  // Nie przypisuj BULK sesji do kafelka BASKETS (i odwrotnie).
  if (
    active.has_cart &&
    active.cart_type &&
    target.require_cart &&
    target.cart_type &&
    target.cart_type !== active.cart_type
  ) {
    return rows;
  }

  return rows.map((r) => {
    if (r.source_status_id !== target.source_status_id) return r;
    return {
      ...r,
      has_operator_active_session: true,
      active_session_id: active.session_id,
      session_source_status_id: active.source_status_id ?? r.source_status_id,
      active_cart_id: active.cart_id,
      active_cart_code: active.cart_code,
      active_cart_name: active.cart_name,
      active_cart_type: active.cart_type,
      active_order_type: active.order_type,
      session_products_picked: active.products_picked ?? r.session_products_picked ?? 0,
      session_products_total: active.products_total ?? r.session_products_total ?? 0,
      in_progress_by_me: Math.max(r.in_progress_by_me ?? 0, active.has_cart ? 1 : 0),
    };
  });
}
