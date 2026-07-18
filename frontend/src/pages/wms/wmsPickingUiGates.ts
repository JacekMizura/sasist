import type {
  WmsPickingProductDetailApi,
  WmsPickingProductLineApi,
} from "../../api/wmsPickingProductsApi";

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

  let left = qty;
  const orders = (detail.orders ?? []).map((o) => {
    if (left <= 1e-9) return o;
    const oTotal = Math.max(0, Number(o.quantity) || 0);
    const oMiss = Math.max(0, Number(o.missing_quantity) || 0);
    const oRem = wmsPickingRemainingQty({
      total_quantity: oTotal,
      picked_quantity: o.picked_quantity ?? 0,
      missing_quantity: oMiss,
    });
    const add = Math.min(left, oRem);
    if (add <= 1e-9) return o;
    left -= add;
    return { ...o, missing_quantity: oMiss + add };
  });

  const declarable =
    typeof detail.shortage_declarable_total === "number" && Number.isFinite(detail.shortage_declarable_total)
      ? Math.max(0, detail.shortage_declarable_total - qty)
      : detail.shortage_declarable_total;

  return {
    ...detail,
    missing_quantity: nextMiss,
    remaining_to_pick: nextRem,
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
} {
  const total = Math.max(0, Number(row.total_quantity) || 0);
  const miss = wmsPickingLineMissingQty(row);
  const pickedShown = wmsPickingEffectivePickedQuantity(row);
  return { pickedShown, total, miss };
}

/** Linia domknięta: zebrano + brak ≥ wymagane (wg ``remaining_to_pick`` jeśli jest). */
export function wmsPickingProductLineComplete(row: WmsPickingProductLineApi): boolean {
  if (typeof row.completed === "boolean") return row.completed;
  return row.total_quantity <= 1e-9 || wmsPickingRemainingQty(row) <= 1e-9;
}

/** 0 = jeszcze coś pobrać; 1 = brak bez dalszego pobrania; 2 = zebrano bez braków. */
export function wmsPickingProductRowSortTier(row: WmsPickingProductLineApi): number {
  if (!wmsPickingProductLineComplete(row)) return 0;
  if (wmsPickingLineMissingQty(row) > 1e-9) return 1;
  return 2;
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

/** Zwraca true, gdy UI nie powinno pozwalać na zgłoszenie braku (brak wózka lub brak ilości do oznaczenia / konwersji pick→shortage). */
export function cannotReportPickingShortage(opts: {
  remaining: number;
  cartId: number | null | undefined;
  /** Efektywne zebranie sesji — pozwala zgłosić brak także po completed (1/1). */
  pickedQuantity?: number;
}): boolean {
  const { remaining, cartId } = opts;
  if (cartId == null || !Number.isFinite(cartId) || cartId < 1) return true;
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
} {
  let zebrane = 0;
  let doZebrania = 0;
  let wTrakcie = 0;
  for (const r of rows) {
    if (wmsPickingProductLineComplete(r)) {
      zebrane++;
      continue;
    }
    const { pickedShown } = wmsPickingDisplayProgressParts(r);
    if (pickedShown <= 1e-9) doZebrania++;
    else wTrakcie++;
  }
  return { zebrane, doZebrania, wTrakcie };
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

/** Nagłówek sekcji zamówień na szczególe SKU: „N zamówień z brakami”. */
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
