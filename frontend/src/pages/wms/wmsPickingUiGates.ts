import type {
  WmsPickingProductDetailApi,
  WmsPickingProductLineApi,
} from "../../api/wmsPickingProductsApi";

export type WmsPickingLineResolutionStatus = "ACTIVE" | "PARTIAL" | "COMPLETED_PICK" | "SHORTAGE";

/** Suma braków na wierszu listy produktów (kohorta). */
export function wmsPickingLineMissingQty(row: WmsPickingProductLineApi): number {
  const m = row.missing_quantity;
  return typeof m === "number" && Number.isFinite(m) ? Math.max(0, m) : 0;
}

/** Wyświetlane „zebrano”: picked nie może przekroczyć zamówionej ilości (bez trybu nadpick). */
export function wmsPickingDisplayPickedQuantity(row: { picked_quantity: number; total_quantity: number }): number {
  const t = Math.max(0, Number(row.total_quantity) || 0);
  const p = Math.max(0, Number(row.picked_quantity) || 0);
  return Math.min(p, t);
}

/** Zebrano do wyświetlenia z uwzględnieniem braku: picked + missing ≤ ordered. */
export function wmsPickingEffectivePickedQuantity(row: {
  picked_quantity: number;
  total_quantity: number;
  missing_quantity?: number;
}): number {
  const total = Math.max(0, Number(row.total_quantity) || 0);
  const miss =
    typeof row.missing_quantity === "number" && Number.isFinite(row.missing_quantity)
      ? Math.max(0, row.missing_quantity)
      : 0;
  const pickedCap = wmsPickingDisplayPickedQuantity(row);
  return Math.min(pickedCap, Math.max(0, total - miss));
}

/** Ilość jeszcze do zebrania lub zgłoszenia jako brak: ordered − picked − missing. */
export function wmsPickingRemainingQty(row: {
  total_quantity: number;
  picked_quantity: number;
  missing_quantity?: number;
  remaining_to_pick?: number;
}): number {
  if (typeof row.remaining_to_pick === "number" && Number.isFinite(row.remaining_to_pick)) {
    return Math.max(0, row.remaining_to_pick);
  }
  const total = Math.max(0, Number(row.total_quantity) || 0);
  const miss =
    typeof row.missing_quantity === "number" && Number.isFinite(row.missing_quantity)
      ? Math.max(0, row.missing_quantity)
      : 0;
  const picked = wmsPickingEffectivePickedQuantity(row);
  return Math.max(0, total - picked - miss);
}

/** Lokalna aktualizacja po udanym POST report-shortage — bez czekania na refetch. */
export function applyWmsPickingShortageToDetail(
  detail: WmsPickingProductDetailApi,
  qtyReported: number,
  /** MULTI: scope optimistic miss to one order_item (no FIFO walk). */
  orderItemId?: number | null,
): WmsPickingProductDetailApi {
  const qty = Math.max(0, Number(qtyReported) || 0);
  if (qty <= 1e-9) return detail;

  const prevMiss =
    typeof detail.missing_quantity === "number" && Number.isFinite(detail.missing_quantity)
      ? Math.max(0, detail.missing_quantity)
      : 0;
  const nextMiss = prevMiss + qty;
  const total = Math.max(0, Number(detail.total_quantity) || 0);
  const pickedEff = wmsPickingEffectivePickedQuantity(detail);
  const nextRem = Math.max(0, total - pickedEff - nextMiss);

  const targetOi =
    orderItemId != null && Number(orderItemId) > 0 ? Math.floor(Number(orderItemId)) : null;

  let left = qty;
  const orders = (detail.orders ?? []).map((o) => {
    if (left <= 1e-9) return o;
    if (targetOi != null && Number(o.order_item_id) !== targetOi) return o;
    const oTotal = Math.max(0, Number(o.quantity) || 0);
    const oMiss = Math.max(0, Number(o.missing_quantity) || 0);
    const oPicked = Math.max(0, Number(o.picked_quantity) || 0);
    const oRem = wmsPickingRemainingQty({
      total_quantity: oTotal,
      picked_quantity: oPicked,
      missing_quantity: oMiss,
      quantity_to_pick: o.quantity_to_pick,
    });
    const add = Math.min(left, oRem);
    if (add <= 1e-9) return o;
    left -= add;
    const nextLineMiss = oMiss + add;
    const nextLineRem = Math.max(0, oTotal - oPicked - nextLineMiss);
    return {
      ...o,
      missing_quantity: nextLineMiss,
      quantity_to_pick: nextLineRem,
      shortage_declarable_qty: Math.max(0, (o.shortage_declarable_qty ?? oRem) - add),
    };
  });

  const declarable =
    typeof detail.shortage_declarable_total === "number" && Number.isFinite(detail.shortage_declarable_total)
      ? Math.max(0, detail.shortage_declarable_total - qty)
      : detail.shortage_declarable_total;

  return {
    ...detail,
    missing_quantity: nextMiss,
    remaining_to_pick: nextRem,
    resolution_status: wmsPickingLineResolutionStatus({
      total_quantity: total,
      picked_quantity: pickedEff,
      missing_quantity: nextMiss,
      remaining_to_pick: nextRem,
    }),
    orders,
    shortage_declarable_total: declarable,
  };
}

/** Domyślna ilość w modalu „Zgłoś brak” — zawsze pozostało do rozliczenia, nigdy zebrane. */
export function wmsPickingShortageDefaultQty(row: {
  total_quantity: number;
  picked_quantity: number;
  missing_quantity?: number;
  remaining_to_pick?: number;
}): number {
  const rem = wmsPickingRemainingQty(row);
  return rem > 1e-9 ? rem : 1;
}

/** Spójny podział do etykiet typu „a / b zebrano · Brak: c”. */
export function wmsPickingDisplayProgressParts(row: WmsPickingProductLineApi): {
  pickedShown: number;
  total: number;
  miss: number;
  remaining: number;
} {
  const total = Math.max(0, Number(row.total_quantity) || 0);
  const miss = wmsPickingLineMissingQty(row);
  const pickedShown = wmsPickingEffectivePickedQuantity(row);
  const remaining = wmsPickingRemainingQty(row);
  return { pickedShown, total, miss, remaining };
}

/** Linia domknięta: zebrano + brak ≥ wymagane (wg ``remaining_to_pick`` jeśli jest). */
export function wmsPickingProductLineComplete(row: WmsPickingProductLineApi): boolean {
  if (typeof row.completed === "boolean") return row.completed;
  return row.total_quantity <= 1e-9 || wmsPickingRemainingQty(row) <= 1e-9;
}

/** Kanoniczny status UI — preferuj pole backendu, inaczej wylicz z qty. */
export function wmsPickingLineResolutionStatus(row: {
  total_quantity: number;
  picked_quantity: number;
  missing_quantity?: number;
  remaining_to_pick?: number;
  resolution_status?: WmsPickingLineResolutionStatus | string | null;
  completed?: boolean;
}): WmsPickingLineResolutionStatus {
  const raw = row.resolution_status;
  if (raw === "ACTIVE" || raw === "PARTIAL" || raw === "COMPLETED_PICK" || raw === "SHORTAGE") {
    return raw;
  }
  const rem = wmsPickingRemainingQty(row);
  const miss = wmsPickingLineMissingQty(row as WmsPickingProductLineApi);
  const picked = wmsPickingEffectivePickedQuantity(row);
  if (rem > 1e-9) {
    if (picked > 1e-9 || miss > 1e-9) return "PARTIAL";
    return "ACTIVE";
  }
  if (miss > 1e-9) return "SHORTAGE";
  return "COMPLETED_PICK";
}

/** 0=ACTIVE, 1=PARTIAL, 2=COMPLETED_PICK, 3=SHORTAGE. */
export function wmsPickingProductRowSortTier(row: WmsPickingProductLineApi): number {
  const status = wmsPickingLineResolutionStatus(row);
  if (status === "ACTIVE") return 0;
  if (status === "PARTIAL") return 1;
  if (status === "COMPLETED_PICK") return 2;
  return 3;
}

/** Ta sama kolejność co na liście zbierania (trasą → product_id). */
export function sortWmsPickingProductLinesPickFlow(rows: WmsPickingProductLineApi[]): WmsPickingProductLineApi[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    const ta = wmsPickingProductRowSortTier(a);
    const tb = wmsPickingProductRowSortTier(b);
    if (ta !== tb) return ta - tb;
    const ka = a.route_sort_key ?? "";
    const kb = b.route_sort_key ?? "";
    return ka.localeCompare(kb, "pl", { sensitivity: "base" }) || a.product_id - b.product_id;
  });
  return copy;
}

/** Czy skan EAN na liście produktów może otworzyć kartę SKU (w tym po pełnym braku — linia zostaje w sesji). */
export function wmsPickingRowScanEligible(row: {
  scanner_active?: boolean;
  remaining_to_pick?: number;
  total_quantity: number;
  picked_quantity: number;
  missing_quantity?: number;
}): boolean {
  const miss =
    typeof row.missing_quantity === "number" && Number.isFinite(row.missing_quantity)
      ? Math.max(0, row.missing_quantity)
      : 0;
  const rem = wmsPickingRemainingQty(row as WmsPickingProductLineApi);
  if (row.scanner_active === true) return true;
  if (rem > 1e-9) return true;
  if (miss > 1e-9 && rem <= 1e-9) return true;
  return false;
}

/** Zwraca true, gdy UI nie powinno pozwalać na zgłoszenie braku (brak wózka/sesji lub brak ilości do oznaczenia / konwersji pick→shortage). */
export function cannotReportPickingShortage(opts: {
  remaining: number;
  cartId: number | null | undefined;
  pickingSessionId?: number | null;
  /** Efektywne zebranie sesji — pozwala zgłosić brak także po completed (1/1). */
  pickedQuantity?: number;
}): boolean {
  const { remaining, cartId, pickingSessionId } = opts;
  const hasCart = cartId != null && Number.isFinite(cartId) && cartId >= 1;
  const hasSession = pickingSessionId != null && Number.isFinite(pickingSessionId) && pickingSessionId >= 1;
  if (!hasCart && !hasSession) return true;
  const picked = Math.max(0, Number(opts.pickedQuantity) || 0);
  if (remaining > 1e-9) return false;
  // Po pełnym picku: brak nadal możliwy przez cofnięcie draftów (backend).
  if (picked > 1e-9) return false;
  return true;
}

/** Liczniki nagłówka listy produktów (linie SKU — jak „Spakowane / Do spakowania” w pakowaniu). */
export function computeWmsPickingProductLineSessionStats(rows: WmsPickingProductLineApi[]): {
  zebrane: number;
  doZebrania: number;
  wTrakcie: number;
  braki: number;
  brakiSzt: number;
  zamowieniaZBrakami: number;
} {
  let zebrane = 0;
  let doZebrania = 0;
  let wTrakcie = 0;
  let braki = 0;
  let brakiSzt = 0;
  const orderIds = new Set<number>();
  for (const r of rows) {
    const miss = wmsPickingLineMissingQty(r);
    brakiSzt += miss;
    for (const a of r.allocations ?? []) {
      if (Number(a.shortage_qty) > 1e-9) orderIds.add(Number(a.order_id));
    }
    const status = wmsPickingLineResolutionStatus(r);
    if (status === "SHORTAGE") {
      braki++;
      continue;
    }
    if (status === "COMPLETED_PICK") {
      zebrane++;
      continue;
    }
    if (status === "PARTIAL") wTrakcie++;
    else doZebrania++;
  }
  return {
    zebrane,
    doZebrania,
    wTrakcie,
    braki,
    brakiSzt,
    zamowieniaZBrakami: orderIds.size,
  };
}

export function pickingFinalizeHasShortageSignals(resp: {
  cohort_shortage_product_count?: number;
  cohort_shortage_unit_total?: number;
}): boolean {
  const c = resp.cohort_shortage_product_count ?? 0;
  const u = resp.cohort_shortage_unit_total ?? 0;
  return c > 0 || u > 1e-9;
}

/** Nagłówek podsumowania: „N produktów z brakami” (PL odmiana). */
export function polishSkuWithShortagesLabel(count: number): string {
  const n = Math.floor(count);
  if (n <= 0) return "0 produktów z brakami";
  if (n === 1) return "1 produkt z brakami";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${n} produkty z brakami`;
  }
  return `${n} produktów z brakami`;
}

/** Tekst wiersza w modalu po finalizacji („X produktów z brakiem”). */
export function polishProductShortageModalSkuLine(count: number): string {
  const n = Math.floor(count);
  if (n <= 0) return "0 produktów z brakiem";
  if (n === 1) return "1 produkt z brakiem";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${n} produkty z brakiem`;
  }
  return `${n} produktów z brakiem`;
}

export function polishOrdersWithShortagesLabel(count: number): string {
  const n = Math.floor(count);
  if (n <= 0) return "0 zamówień z brakami";
  if (n === 1) return "1 zamówienie z brakami";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${n} zamówienia z brakami`;
  }
  return `${n} zamówień z brakami`;
}
