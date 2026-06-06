import type { DirectSaleCompleteError } from "../../../types/directSalesCompletion";

const CODE_MESSAGES: Record<string, string> = {
  OUT_OF_STOCK: "Brak wystarczającego stanu do wydania. Sprawdź lokalizacje pozycji.",
  ALLOCATION_FAILED: "Nie udało się zaplanować wydania z magazynu. Zmień lokalizację pozycji.",
  ISSUE_FAILED: "Nie udało się zdjąć towaru z magazynu. Sprawdź stany i spróbuj ponownie.",
  PAYMENT_FAILED: "Płatność nie została zaksięgowana. Sprawdź terminal lub metodę płatności.",
  DOCUMENT_GENERATION_FAILED:
    "Sprzedaż mogła się udać, ale dokument nie został wygenerowany. Wygeneruj ponownie z ekranu potwierdzenia.",
  SESSION_INVALID: "Sesja sprzedaży jest w nieprawidłowym stanie. Rozpocznij nową sprzedaż.",
  insufficient_stock: "Brak wystarczającego stanu do wydania. Sprawdź lokalizacje pozycji.",
  missing_source_location: "Brak lokalizacji źródłowej. Wybierz lokalizację dla pozycji.",
};

const STEP_HINTS: Record<string, string> = {
  validation: "Sprawdź dane sesji, klienta i dokument sprzedaży.",
  create_order: "Nie udało się utworzyć zamówienia — rozpocznij nową sesję.",
  plan_allocations: "Popraw lokalizacje pozycji lub włącz sprzedaż ponad stan w ustawieniach.",
  reserve_stock: "Rezerwacja stanu nie powiodła się — odśwież stany i spróbuj ponownie.",
  issue_stock: "Wydanie z magazynu nie powiodło się — sprawdź stany w wybranych lokalizacjach.",
  create_payment: "Zmień metodę płatności lub kwoty i spróbuj ponownie.",
  generate_documents: "Sprzedaż mogła się udać — sprawdź historię i kolejkę dokumentów.",
  complete_session: "Finalizacja sesji nie powiodła się — spróbuj ponownie.",
  inventory: "Problem z alokacją lub wydaniem towaru z magazynu.",
  payment: "Problem z zaksięgowaniem płatności.",
  document: "Problem z generowaniem dokumentu sprzedaży.",
  commit: "Problem z zapisem transakcji — spróbuj ponownie.",
};

const PHASE_HINTS: Record<DirectSaleCompleteError["phase"], string> = {
  payment: "Sesja pozostaje aktywna — możesz zmienić metodę płatności i spróbować ponownie.",
  document: "Sesja może być zakończona — sprawdź historię sprzedaży i kolejkę dokumentów.",
  issue: "Sesja pozostaje aktywna — popraw lokalizacje lub ilości i spróbuj ponownie.",
  unknown: "Sesja pozostaje aktywna — możesz spróbować ponownie lub rozpocząć nową sprzedaż.",
};

export function resolveCompleteOperatorMessage(error: DirectSaleCompleteError): {
  title: string;
  message: string;
  hint: string;
} {
  const code = (error.code ?? "").toUpperCase();
  const message =
    CODE_MESSAGES[error.code ?? ""] ??
    CODE_MESSAGES[code] ??
    (error.message && !/internal server error/i.test(error.message)
      ? error.message
      : CODE_MESSAGES.SESSION_INVALID);

  const titles: Record<DirectSaleCompleteError["phase"], string> = {
    payment: "Błąd płatności",
    document: "Błąd dokumentu",
    issue: "Błąd wydania towaru",
    unknown: "Nie udało się zakończyć sprzedaży",
  };

  const stepHint = error.step ? STEP_HINTS[error.step] : null;

  return {
    title: titles[error.phase],
    message,
    hint: stepHint ?? PHASE_HINTS[error.phase],
  };
}
