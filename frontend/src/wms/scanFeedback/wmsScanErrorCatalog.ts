/**
 * Central WMS scan error catalog — code → operator Polish copy + severity.
 * Do not parse free-text messages in page components.
 */

export type WmsScanFeedbackSeverity = "error" | "warning" | "info" | "success";

export type WmsScanFeedback = {
  code: string;
  severity: WmsScanFeedbackSeverity;
  /** Short headline shown above the body */
  title: string;
  /** Operator-facing Polish body */
  message: string;
};

const CATALOG: Record<
  string,
  { severity: WmsScanFeedbackSeverity; title: string; message: string }
> = {
  PRODUCT_NOT_IN_PICKING: {
    severity: "error",
    title: "BŁĘDNY SKAN",
    message: "Ten produkt nie znajduje się na liście do zebrania.",
  },
  PRODUCT_ALREADY_COMPLETE: {
    severity: "warning",
    title: "PRODUKT JUŻ ZEBRANY",
    message: "Ten produkt został już zebrany w wymaganej ilości.",
  },
  EXPECTED_PRODUCT_SCAN: {
    severity: "warning",
    title: "WYBIERZ PRODUKT",
    message: "Otwórz produkt na liście albo zeskanuj EAN — potem możesz wybrać koszyk.",
  },
  UNKNOWN_SCAN_CODE: {
    severity: "error",
    title: "NIEZNANY KOD",
    message: "Nie rozpoznano zeskanowanego kodu.",
  },
  CART_NOT_ACTIVE: {
    severity: "error",
    title: "ZŁY WÓZEK",
    message: "Ten wózek nie należy do aktywnego zbierania.",
  },
  EXPECTED_BASKET_SCAN: {
    severity: "warning",
    title: "OCZEKIWANY KOSZYK",
    message:
      "Teraz zeskanuj koszyk, do którego chcesz odłożyć produkt.",
  },
  PENDING_PUT_EXISTS: {
    severity: "warning",
    title: "OCZEKIWANY KOSZYK",
    message: "Najpierw odłóż poprzednio zeskanowaną sztukę do koszyka.",
  },
  AWAITING_BASKET_CONFIRMATION: {
    severity: "warning",
    title: "OCZEKIWANY KOSZYK",
    message: "Najpierw odłóż zeskanowany produkt do koszyka.",
  },
  NO_PENDING_PUT: {
    severity: "warning",
    title: "OCZEKIWANY PRODUKT",
    message: "Najpierw zeskanuj produkt, który chcesz zebrać.",
  },
  BASKET_MISMATCH: {
    severity: "error",
    title: "NIEWŁAŚCIWY KOSZYK",
    message: "Oczekiwany jest skan koszyka. Nie rozpoznano tego kodu jako właściwego koszyka.",
  },
  BASKET_OTHER_CART: {
    severity: "error",
    title: "KOSZYK INNEGO WÓZKA",
    message: "Ten koszyk należy do innego wózka.",
  },
  BASKET_EMPTY: {
    severity: "error",
    title: "PUSTY KOSZYK",
    message: "Ten koszyk nie ma przypisanego zamówienia.",
  },
  BASKET_PRODUCT_MISMATCH: {
    severity: "error",
    title: "NIEWŁAŚCIWY KOSZYK",
    message: "Ten produkt nie należy do zamówienia przypisanego do tego koszyka.",
  },
  BASKET_PRODUCT_ALREADY_COMPLETE: {
    severity: "warning",
    title: "KOSZYK KOMPLETNY",
    message: "W tym koszyku zebrano już pełną wymaganą ilość tego produktu.",
  },
  BASKET_PUT_OWNED_BY_OTHER: {
    severity: "error",
    title: "INNY OPERATOR",
    message: "To oczekujące odłożenie należy do innego operatora.",
  },
  OVERPICK_BLOCKED: {
    severity: "warning",
    title: "ILOŚĆ KOMPLETNA",
    message: "Zebrano już pełną wymaganą ilość tego produktu.",
  },
  FOREIGN_SKU_ON_SERIES: {
    severity: "warning",
    title: "INNY PRODUKT",
    message: "Aktywna seria dotyczy innego produktu. Zeskanuj EAN z aktywnej serii albo wróć do listy.",
  },
  SERIES_DESTINATION_SWITCHED: {
    severity: "success",
    title: "KOSZYK ZMIENIONY",
    message: "Zmieniono koszyk docelowy. Zeskanuj EAN, aby odłożyć kolejną sztukę.",
  },
  QUANTITY_REQUIRED: {
    severity: "info",
    title: "PODAJ ILOŚĆ",
    message: "Wybierz ile sztuk odkładasz do koszyka i zatwierdź.",
  },
  QUANTITY_INVALID: {
    severity: "warning",
    title: "BŁĘDNA ILOŚĆ",
    message: "Ilość musi być większa od zera.",
  },
  QUANTITY_EXCEEDS_REMAINING: {
    severity: "warning",
    title: "ZA DUŻO",
    message: "Nie możesz odłożyć więcej niż pozostało w koszyku dla tego produktu.",
  },
  QUANTITY_STALE: {
    severity: "warning",
    title: "ILOŚĆ ZMIENIONA",
    message: "Pozostała ilość zmieniła się. Odśwież i podaj ilość ponownie.",
  },
  PICK_LOCATION_REQUIRED: {
    severity: "warning",
    title: "ZESKANUJ LOKALIZACJĘ",
    message: "Najpierw zeskanuj lokalizację, z której pobierasz produkt.",
  },
  QUANTITY_EXCEEDS_LOCATION_STOCK: {
    severity: "warning",
    title: "BRAK STANU W LOKALIZACJI",
    message:
      "W wybranej lokalizacji nie ma wystarczającego stanu. Zeskanuj inną lokalizację albo zmniejsz ilość.",
  },
  SOURCE_LOCATION_NOT_ON_ROUTE: {
    severity: "error",
    title: "LOKALIZACJA ŹRÓDŁOWA",
    message: "Wybrana lokalizacja źródłowa nie jest dostępna dla tego produktu w bieżącej zbiórce.",
  },
  SOURCE_LOCATION_STALE: {
    severity: "warning",
    title: "LOKALIZACJA NIEAKTUALNA",
    message: "Lokalizacja źródłowa zmieniła się lub stała się niedostępna. Zeskanuj lokalizację ponownie.",
  },
  SOURCE_LOCATION_INVALID: {
    severity: "error",
    title: "BŁĘDNA LOKALIZACJA",
    message: "Nieprawidłowa lokalizacja źródłowa dla tego pobrania.",
  },
  SOURCE_LOCATION_MISMATCH: {
    severity: "error",
    title: "LOKALIZACJA NIEZGODNA",
    message:
      "Lokalizacja źródłowa nie zgadza się z wcześniej zeskanowaną lokalizacją. Zeskanuj produkt ponownie.",
  },
  NO_PENDING_SOURCE_LOCATION: {
    severity: "warning",
    title: "ZESKANUJ LOKALIZACJĘ",
    message: "Brak zatwierdzonej lokalizacji pobrania. Zeskanuj lokalizację produktu ponownie.",
  },
  NO_PENDING_PICK: {
    severity: "warning",
    title: "BRAK POBRANIA",
    message: "Brak oczekującego pobrania do odłożenia do koszyka.",
  },
  PENDING_PICK_STATE_CONFLICT: {
    severity: "error",
    title: "STAN NIESPÓJNY",
    message: "Stan oczekującego pobrania jest niespójny — odśwież produkt i spróbuj ponownie.",
  },
};

export function mapWmsScanErrorCode(
  code: string | null | undefined,
  opts?: { backendMessage?: string | null; contextHint?: string | null },
): WmsScanFeedback {
  const key = (code || "UNKNOWN_SCAN_CODE").trim();
  const entry = CATALOG[key] ?? {
    severity: "error" as const,
    title: "BŁĘDNY SKAN",
    message: "Nie można wykonać tego skanu w aktualnym stanie.",
  };
  const backend = opts?.backendMessage?.trim();
  const hint = opts?.contextHint?.trim();
  const body = backend || entry.message;
  return {
    code: key,
    severity: entry.severity,
    title: entry.title,
    message: hint ? `${body}\n\n${hint}` : body,
  };
}

/** Extract FastAPI detail `{ code, message, ... }` from axios-like error. */
export function extractWmsScanErrorDetail(err: unknown): {
  code: string | null;
  message: string | null;
  eligibleLabels: string | null;
} {
  const empty = { code: null, message: null, eligibleLabels: null };
  if (!err || typeof err !== "object") return empty;
  const ax = err as { response?: { data?: { detail?: unknown } } };
  const detail = ax.response?.data?.detail;
  if (detail == null) return empty;
  if (typeof detail === "string") {
    const msg = detail.trim();
    if (/nie należy do trasy/i.test(msg)) {
      return { code: "SOURCE_LOCATION_NOT_ON_ROUTE", message: msg, eligibleLabels: null };
    }
    return { code: null, message: msg || null, eligibleLabels: null };
  }
  if (typeof detail !== "object") return empty;
  const d = detail as {
    code?: string;
    message?: string;
    eligible_baskets?: Array<{ basket_label?: string }>;
    scanned_basket?: string;
  };
  const labels =
    d.eligible_baskets
      ?.map((b) => b.basket_label)
      .filter(Boolean)
      .join(", ") || null;
  const hintParts: string[] = [];
  if (d.scanned_basket) hintParts.push(`Zeskanowano: ${d.scanned_basket}`);
  if (labels) hintParts.push(`Oczekiwane koszyki: ${labels}`);
  return {
    code: d.code ?? null,
    message: d.message ?? null,
    eligibleLabels: hintParts.length ? hintParts.join(" · ") : labels,
  };
}
