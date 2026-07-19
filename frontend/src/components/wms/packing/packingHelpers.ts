import type { MeResponse } from "../../../api/authApi";
import type { WmsPackingOrderDetailApi, WmsPackingOrderLineApi } from "../../../api/wmsPackingApi";

export function lineQuantityRequired(line: WmsPackingOrderLineApi): number {
  const req = line.quantity_required;
  if (typeof req === "number" && Number.isFinite(req) && req >= 0) {
    return Math.floor(req);
  }
  return line.quantity;
}

export function sortLinesForPacking(
  lines: WmsPackingOrderLineApi[],
  pinFlashToEndId: number | null,
): WmsPackingOrderLineApi[] {
  return [...lines].sort((a, b) => {
    const da = a.quantity_packed >= lineQuantityRequired(a);
    const db = b.quantity_packed >= lineQuantityRequired(b);
    if (da !== db) return da ? 1 : -1;
    if (da && pinFlashToEndId != null) {
      if (a.order_item_id === pinFlashToEndId) return 1;
      if (b.order_item_id === pinFlashToEndId) return -1;
    }
    return a.order_item_id - b.order_item_id;
  });
}

export function firstIncompleteOrderItemId(lines: WmsPackingOrderLineApi[]): number | null {
  const sorted = [...lines].sort((a, b) => a.order_item_id - b.order_item_id);
  for (const row of sorted) {
    if (row.quantity_packed < lineQuantityRequired(row)) return row.order_item_id;
  }
  return null;
}

/** Etykieta operatora z sesji JWT — bez cache ani nazwisk z demo. */
export function formatPackerDisplayName(user: MeResponse | null | undefined): string | null {
  if (!user) return null;
  const fn = (user.first_name ?? "").trim();
  const ln = (user.last_name ?? "").trim();
  const full = `${fn} ${ln}`.trim();
  if (full) return full;
  const em = (user.email ?? "").trim();
  if (em) return em;
  const login = (user.login ?? "").trim();
  if (login) return login;
  return null;
}

export function scanErrorMessage(code: string | null): string {
  switch (code) {
    case "PRODUCT_NOT_FOUND":
    case "WRONG_PRODUCT":
    case "ALREADY_PACKED":
      return "Zły produkt";
    case "INVALID_QUANTITY":
      return "Nieprawidłowa ilość";
    case "ORDER_NOT_IN_QUEUE":
      return "Zamówienie poza kolejką";
    case "SCOPE_REQUIRED":
      return "Brak zakresu pakowania (wózek / koszyk / bez wózka)";
    case "AMBIGUOUS_BASKET_CODE":
      return "Kod koszyka nie jest jednoznaczny w magazynie";
    case "BASKET_NOT_FOUND":
      return "Nie rozpoznano koszyka";
    case "BASKET_EMPTY":
      return "Koszyk jest pusty — brak przypisanego zamówienia";
    case "BASKET_ORDER_NOT_IN_QUEUE":
      return "Zamówienie z tego koszyka nie jest w kolejce pakowania";
    case "SHELF_ORDER_NOT_READY":
      return "Zamówienie nie jest jeszcze kompletne.";
    case "SHELF_ORDER_NOT_IN_QUEUE":
      return "Zamówienie z tej półki nie jest w tej kolejce pakowania.";
    case "ORDER_NOT_FULLY_PACKED":
    case "LINE_NOT_FULLY_PACKED":
      return "Nie można domknąć — zamówienie nie jest w pełni spakowane";
    case "UNRESOLVED_SHORTAGES":
      return "Zamówienie ma nierozwiązane braki — domknięcie pakowania zablokowane";
    case "PACKING_FINISH_FAILED":
    case "PACKING_FINISH_DATABASE_ERROR":
      return "Błąd domknięcia pakowania — spróbuj ponownie lub skontaktuj kierownika";
    case "CARTON_REQUIRED":
      return "Wybierz opakowanie albo — jeśli masz uprawnienie — potwierdź kontynuację bez kartonu";
    case "FORBIDDEN_FINISH_WITHOUT_CARTON":
      return "Brak uprawnienia do domknięcia bez wybranego kartonu";
    default:
      return "Błąd skanowania";
  }
}

export function orderNumberLabel(raw: string): string {
  const t = raw.trim();
  return t.startsWith("#") ? t : `#${t}`;
}

/** Wszystkie linie mają niedobór wyzerowany (EAN-level). */
export function isPackingOrderLinesFullyPacked(detail: WmsPackingOrderDetailApi): boolean {
  if (!detail.lines.length) return false;
  return detail.lines.every((item) => item.quantity_packed >= lineQuantityRequired(item));
}

/**
 * Zamówienie uznane za domknięte na pakowaniu: flaga z API lub spójność linii / sum.
 */
export function isPackingOrderCompleted(detail: WmsPackingOrderDetailApi): boolean {
  if (detail.is_completed === true) return true;
  if (isPackingOrderLinesFullyPacked(detail)) return true;
  return detail.packed_quantity >= detail.total_quantity && detail.total_quantity > 0;
}

/**
 * Pakowanie domknięte w WMS (POST …/finish + automatyzacje).
 * ``wms_packing_finished_at`` (packed_at) = linie fizycznie spakowane — NIE ekran FINALIZED.
 * Ekran „zeskanuj kolejny produkt” / AutoActions tylko po ``wms_packing_automation_finished_at``
 * oraz gdy progress packed jest kompletny (brak fake FINALIZED przy 0/1).
 */
export function isPackingSessionFinished(detail: WmsPackingOrderDetailApi): boolean {
  const autoAt = detail.wms_packing_automation_finished_at;
  if (autoAt == null || String(autoAt).trim() === "") return false;
  if (detail.total_quantity > 0 && detail.packed_quantity < detail.total_quantity) return false;
  if (detail.lines.length > 0 && !isPackingOrderLinesFullyPacked(detail)) return false;
  return true;
}

/** Fizyczne linie spakowane (packed_at), ale finish/automatyzacje jeszcze nie. */
export function isPackingPhysicallyComplete(detail: WmsPackingOrderDetailApi): boolean {
  if (isPackingSessionFinished(detail)) return true;
  if (!isPackingOrderLinesFullyPacked(detail)) return false;
  if (detail.total_quantity > 0 && detail.packed_quantity < detail.total_quantity) return false;
  const at = detail.wms_packing_finished_at;
  return (at != null && String(at).trim() !== "") || isPackingOrderCompleted(detail);
}

/** Nazwa kuriera: ``shipping_method_name`` lub ``shipping_method`` z zamówienia. */
export function packingCourierName(detail: WmsPackingOrderDetailApi): string | null {
  return (detail.shipping_method_name ?? detail.shipping_method ?? "").trim() || null;
}

/** Liczba etykiet/listów: ``labels_count`` (alias API) lub ``waybill_count``. */
export function packingCourierLabelCount(detail: WmsPackingOrderDetailApi): number {
  const raw = detail.labels_count ?? detail.waybill_count;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, Math.floor(raw));
  return 0;
}
