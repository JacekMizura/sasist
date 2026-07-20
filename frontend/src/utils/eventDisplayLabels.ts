/**
 * SSOT — user-facing Polish labels for machine-readable event codes.
 *
 * INTERNAL CODE (API / DB) may stay English.
 * USER-FACING UI must always use getEventDisplayLabel() — never raw codes.
 */

export const UNKNOWN_EVENT_LABEL = "Zdarzenie systemowe";

/**
 * Canonical Polish display titles (sentence case).
 * UI may apply CSS uppercase; never store UPPERCASE English codes as labels.
 */
export const EVENT_DISPLAY_LABELS: Record<string, string> = {
  // --- Cart lifecycle ---
  CART_CLAIMED: "Zarezerwowano wózek",
  PICKING_STARTED: "Rozpoczęto zbieranie",
  FIRST_PRODUCT_CONFIRMED: "Potwierdzono pierwszy produkt",
  PICKING_FINISHED: "Zakończono zbieranie",
  PACKING_STARTED: "Rozpoczęto pakowanie",
  ORDER_PACKED: "Spakowano zamówienie",
  PACKING_FINISHED: "Zakończono pakowanie",
  CART_RELEASED: "Zwolniono wózek",
  CART_AUTO_RELEASED_IDLE: "Automatycznie zwolniono nieaktywny wózek",
  PICKING_CANCELLED: "Anulowano zbieranie",
  PICKING_RESUMED: "Wznowiono zbieranie",
  CART_TRANSFERRED: "Przejęto wózek",
  RESERVATION_TIMED_OUT: "Wygasła rezerwacja wózka",
  DOUBLE_CLAIM_ATTEMPT: "Próba użycia zajętego wózka",
  ORDERS_ASSIGNED: "Przypisano zamówienia",
  ORDER_ADDED: "Dodano zamówienie",
  CAPACITY_BLOCKED: "Brak pojemności wózka",
  BASKET_ASSIGNED: "Przypisano koszyk",
  ADMIN_CART_RELEASED: "Zwolniono wózek przez administratora",
  ADMIN_ORDERS_DETACHED: "Odłączono zamówienia",
  ADMIN_PICKING_CANCELLED: "Anulowano zbieranie przez administratora",
  ORDER_DETACHED: "Odłączono zamówienie",
  EMPTY_ORPHAN_CART_RELEASED: "Zwolniono pusty wózek",

  // --- Order / WMS operational ---
  SYSTEM: "System",
  SOURCE: "Źródło",
  PICKED_ITEM: "Zebrano produkt",
  SHORTAGE_REPORTED: "Zgłoszono brak",
  ORDER_LINE_SHORTAGE_REPORTED: "Zgłoszono brak",
  REPLACEMENT_SHORTAGE_REPORTED: "Zgłoszono brak (zamiennik)",
  RECOVERY_SHORTAGE_REPORTED: "Zgłoszono brak (dogrywka)",
  ORDER_DETACHED_AFTER_SHORTAGE_FINALIZE: "Odłączono od wózka (braki)",
  OMS_DECISION_WAIT: "OMS: oczekuje na decyzję",
  OMS_DECISION_ACCEPTED: "Zaakceptowano decyzję OMS",
  ORDER_LINE_REPLACED: "Zamieniono produkt",
  ORDER_ITEM_REMOVED: "Usunięto pozycję",
  ORDER_LINE_REMOVED: "Usunięto linię zamówienia",
  REPLACEMENT_ITEM_REMOVED: "Usunięto zamiennik",
  RECOVERY_STARTED: "Rozpoczęto dogrywkę",
  RECOVERY_FINISHED: "Zakończono dogrywkę",
  RELOCATION_CREATED: "Utworzono rozlokowanie produktów",
  RELOCATION_FINISHED: "Zakończono rozlokowanie produktów",
  RELOCATION_STARTED: "Rozpoczęto rozlokowanie produktów",
  PACKING_PAUSED: "Wstrzymano pakowanie",
  PACKING_RESUMED: "Wznowiono pakowanie",
  PACKING_AUTOMATION_FINISHED: "Zakończono automatykę pakowania",
  PACKED_ITEM: "Spakowano produkt",
  PACKED: "Spakowano produkt",
  CARTON_SELECTED: "Wybrano karton",
  CARTON_CHANGED: "Zmieniono karton",
  LABEL_GENERATED: "Wygenerowano etykietę",
  LABEL_REPRINTED: "Ponownie wydrukowano etykietę",
  PACKAGE_WEIGHT_CONFIRMED: "Potwierdzono wagę przesyłki",
  LOCATION_CHANGED: "Zmieniono lokalizację",
  RESERVATION_CREATED: "Utworzono rezerwację",
  RESERVATION_RELEASED: "Zwolniono rezerwację",
  NOTE: "Notatka",
  NOTE_ADDED: "Dodano notatkę",
  FE_PICK: "Zebrano produkt",
  FE_MISSING: "Zgłoszono brak",
  FE_REMOVED: "Usunięto pozycję",
  FE_REPLACED: "Zamieniono produkt",
  FE_WAITING: "Oczekuje na towar",
  PICK_UNDONE: "Cofnięto pobranie",
  LOCATION_EMPTIED: "Opróżniono lokalizację",
  PICKING_CANCELLED_WMS: "Anulowano zbieranie",

  // --- Ops workflow actions ---
  WAITING_PROMOTED: "Przyjęcie odblokowało workflow",
  WAITING_PARTIAL_PROMOTED: "Częściowe przyjęcie",
  ASSIGN: "Przypisano do nośnika",
  BULK_ASSIGN: "Zbiorcze rozłożenie",
  SESSION_START: "Operator rozpoczął sesję",
  SESSION_TAKEOVER: "Przejęcie zadania",
  SESSION_RELEASE: "Zwolnienie sesji",
  SESSION_RESUME: "Wznowienie pracy",

  // --- Production material needs ---
  CREATED: "Utworzono",
  PARTIALLY_COVERED: "Częściowo pokryte",
  CLOSED: "Zamknięte",
  CANCELLED: "Anulowane",
  RECEIPT_SYNC: "Przyjęcie magazynowe",
};

/** Normalize any stored form: cart_released | CART_RELEASED | "cart released" → CART_RELEASED */
export function normalizeEventCode(code: string | null | undefined): string {
  return (code ?? "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .toUpperCase();
}

/**
 * Polish display label for any user-visible event code.
 * Unknown codes → UNKNOWN_EVENT_LABEL (never raw English).
 */
export function getEventDisplayLabel(eventCode: string | null | undefined): string {
  const k = normalizeEventCode(eventCode);
  if (!k) return UNKNOWN_EVENT_LABEL;
  return EVENT_DISPLAY_LABELS[k] ?? UNKNOWN_EVENT_LABEL;
}

/** True when a string looks like a machine event code (not a Polish sentence). */
export function looksLikeRawEventCode(value: string | null | undefined): boolean {
  const s = (value ?? "").trim();
  if (!s) return false;
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(s)) return false;
  if (/\s/.test(s) && !/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$/.test(s)) {
    // Polish sentence with spaces — OK unless Title Case English event
  }
  const k = normalizeEventCode(s);
  if (EVENT_DISPLAY_LABELS[k]) return true;
  // SCREAMING_SNAKE or Title Case English event-like tokens
  if (/^[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(s)) return true;
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$/.test(s) && s === s.replace(/_/g, " ")) {
    const asCode = normalizeEventCode(s);
    return asCode.includes("_") && asCode.length >= 8;
  }
  return false;
}

/**
 * Prefer API-provided Polish label; otherwise map code; never show raw code.
 */
export function resolveEventDisplayLabel(opts: {
  eventCode?: string | null;
  eventDisplayLabel?: string | null;
  fallbackDescription?: string | null;
}): string {
  const fromApi = (opts.eventDisplayLabel ?? "").trim();
  if (fromApi && !looksLikeRawEventCode(fromApi)) return fromApi;

  const fromCode = getEventDisplayLabel(opts.eventCode);
  if (fromCode !== UNKNOWN_EVENT_LABEL) return fromCode;

  const desc = (opts.fallbackDescription ?? "").trim();
  if (desc && !looksLikeRawEventCode(desc)) {
    // Short title-like ALL CAPS Polish (e.g. ANULOWANO ZBIERANIE) — OK as event title
    return desc.length > 80 ? desc.slice(0, 77) + "…" : desc;
  }
  return UNKNOWN_EVENT_LABEL;
}
