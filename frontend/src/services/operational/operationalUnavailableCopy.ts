export type OperationalUnavailableReason = "off" | "network" | "backend" | "auth" | null;

export function directSalesUnavailableMessage(reason: OperationalUnavailableReason): {
  title: string;
  body: string;
} {
  switch (reason) {
    case "off":
      return {
        title: "Moduł został wyłączony konfiguracją systemową",
        body: "Sprzedaż bezpośrednia nie została jeszcze aktywowana dla tego magazynu. Klasyczny WMS działa bez zmian.",
      };
    case "auth":
      return {
        title: "Sesja wygasła lub brak autoryzacji",
        body: "Nie udało się pobrać flag operacyjnych (401). Zaloguj się ponownie — nie zakładamy, że moduł jest wyłączony.",
      };
    case "network":
      return {
        title: "Backend operacyjny jest niedostępny",
        body: "Nie udało się połączyć z serwisem operacyjnym. Sprawdź połączenie sieciowe i spróbuj ponownie.",
      };
    case "backend":
      return {
        title: "Backend operacyjny jest niedostępny",
        body: "Konfiguracja wskazuje włączony moduł, ale endpoint sprzedaży nie odpowiada. Możliwy brak wdrożenia API.",
      };
    default:
      return {
        title: "Sprzedaż bezpośrednia jest obecnie niedostępna",
        body: "Moduł operacyjny nie jest dostępny. Klasyczny WMS działa bez zmian.",
      };
  }
}
