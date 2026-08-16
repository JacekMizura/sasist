import type { ReactNode } from "react";

import type {
  ProductionForecastSettings,
  ProductionReservationSettings,
} from "../../../api/wmsProductionSettingsApi";

export type SettingHelpContent = {
  title: string;
  description: ReactNode;
  tip?: ReactNode;
};

/** Canonical help copy for Ustawienia → WMS → Produkcja (plain language, no backend jargon). */
export const productionSettingsHelp = {
  // —— Konfigurator ——
  sourceStatus: {
    title: "Status wejściowy",
    description: (
      <>
        <p>
          Status zamówienia, przy którym Sasist uruchamia produkcję z zamówień. Dla każdego takiego
          statusu w magazynie może istnieć tylko jedna konfiguracja.
        </p>
        <p>
          Przykład: ustawienie statusu „Do produkcji” oznacza, że zamówienia w tym statusie mogą
          wejść w flow produkcyjny.
        </p>
      </>
    ),
  },
  statusAfterProduction: {
    title: "Status po wyprodukowaniu",
    description: (
      <p>
        Status, na który zamówienie przechodzi po wyprodukowaniu wymaganej ilości. Dalej zamówienie
        może iść do pakowania lub kolejnego kroku procesu.
      </p>
    ),
  },
  statusAwaitingProduction: {
    title: "Status oczekiwania na produkcję",
    description: (
      <p>
        Status ustawiany, gdy zamówienie (zwłaszcza wielopozycyjne) nie może iść dalej w zbieraniu,
        bo brakuje gotowego wyrobu z produkcji. Zamówienie czeka, aż produkcja uzupełni brakujący
        produkt.
      </p>
    ),
  },
  statusOnComponentShortage: {
    title: "Status przy braku komponentów",
    description: (
      <p>
        Status ustawiany, gdy do produkcji brakuje materiałów (komponentów). Dzięki temu widać w
        zamówieniach, że flow utknął na brakach materiałowych, a nie na samym oczekiwaniu na wyrób.
      </p>
    ),
  },
  bufferLocation: {
    title: "Lokalizacja buforowa",
    description: (
      <p>
        Miejsce, do którego trafia wyrób gotowy z produkcji powiązanej z zamówieniami. Stamtąd towar
        jest dostępny do pakowania bez osobnej kolejki rozlokowania.
      </p>
    ),
  },
  executionMethod: {
    title: "Sposób realizacji",
    description: (
      <>
        <p>Określa, jak operator realizuje zlecenie produkcyjne z zamówienia:</p>
        <ul>
          <li>
            <strong>WMS</strong> — praca w terminalu (skanowanie, zbieranie komponentów, rejestracja
            produkcji).
          </li>
          <li>
            <strong>Wydruk zlecenia</strong> — ten sam proces produkcyjny, ale z kartą PDF zamiast
            pełnej pracy skanerem w terminalu.
          </li>
        </ul>
      </>
    ),
  },
  afterProductionAction: {
    title: "Po wyprodukowaniu",
    description: (
      <>
        <p>Co ma się stać po zakończeniu produkcji dla zamówienia:</p>
        <ul>
          <li>
            <strong>Zmień status</strong> — zamówienie dostaje status po wyprodukowaniu; bez
            automatycznego przejścia do pakowania.
          </li>
          <li>
            <strong>Przejdź do pakowania</strong> — to samo, a dodatkowo operator jest kierowany do
            pakowania tego zamówienia.
          </li>
        </ul>
      </>
    ),
  },

  // —— Prognoza ——
  forecastStrategy: {
    title: "Strategia prognozy",
    description: (
      <p>
        Określa, w jaki sposób Sasist oblicza przewidywaną dzienną sprzedaż produktu. Wynik jest
        używany do wyliczenia zapotrzebowania produkcyjnego i docelowego zapasu.
      </p>
    ),
  } satisfies SettingHelpContent,
  forecastStrategyOptions: {
    PERIOD_AVERAGE: {
      title: "Średnia z okresu",
      description: (
        <p>
          Średnia dzienna sprzedaż z wybranego okresu. Przykład: 300 szt. sprzedanych przez 30 dni =
          prognoza 10 szt./dzień.
        </p>
      ),
    },
    WEIGHTED_AVERAGE: {
      title: "Średnia ważona",
      description: (
        <p>
          Nowsza sprzedaż ma większy wpływ na prognozę niż starsza. Przydatne, gdy sprzedaż produktu
          rośnie lub spada.
        </p>
      ),
    },
    WEEKDAY_AVERAGE: {
      title: "Średnia z tego samego dnia tygodnia",
      description: (
        <p>
          Prognoza uwzględnia sprzedaż z odpowiadających dni tygodnia. Przydatne, gdy np. weekendy
          znacząco różnią się od dni roboczych.
        </p>
      ),
    },
    MEDIAN: {
      title: "Mediana sprzedaży",
      description: (
        <p>
          Wykorzystuje typową dzienną sprzedaż i ogranicza wpływ pojedynczych bardzo wysokich lub
          niskich dni.
        </p>
      ),
    },
    MAX_DAILY: {
      title: "Maksymalna sprzedaż dzienna",
      description: (
        <p>
          Przyjmuje najwyższą dzienną sprzedaż z analizowanego okresu. To najbardziej zachowawcza
          strategia — utrzymuje większy zapas.
        </p>
      ),
    },
    AI_SMART: {
      title: "Inteligentna (AI — w przygotowaniu)",
      description: (
        <p>
          Strategia będzie automatycznie analizować charakter sprzedaży produktu i dobierać
          prognozę. Funkcja nie jest jeszcze dostępna.
        </p>
      ),
    },
  } satisfies Record<ProductionForecastSettings["strategy"], SettingHelpContent>,

  salesLookbackDays: {
    title: "Okres historii sprzedaży",
    description: (
      <p>
        Określa, ile ostatnich dni sprzedaży Sasist bierze pod uwagę przy obliczaniu prognozy. Np.
        30 oznacza analizę sprzedaży z ostatnich 30 dni.
      </p>
    ),
  },
  autoStockReplenishment: {
    title: "Automatyczne uzupełnianie zapasu",
    description: (
      <p>
        Po włączeniu Sasist automatycznie oblicza brakującą ilość produktu na podstawie prognozy,
        aktualnego zapasu i produkcji w toku oraz tworzy odpowiednie zapotrzebowanie produkcyjne
        zgodnie z istniejącym mechanizmem.
      </p>
    ),
    tip: (
      <p>
        Uzupełnianie zapasu nie zastępuje produkcji z zamówień klientów — zlecenia z zamówień mają
        pierwszeństwo.
      </p>
    ),
  },
  coverageDays: {
    title: "Docelowe pokrycie",
    description: (
      <p>
        Określa, na ile dni przewidywanej sprzedaży ma wystarczyć zapas. Przykład: prognoza 10
        szt./dzień i pokrycie 7 dni oznacza docelowo około 70 szt.
      </p>
    ),
  },
  replenishmentInterval: {
    title: "Automatyczne przeliczanie",
    description: (
      <p>
        Określa, jak często Sasist ponownie analizuje sprzedaż, zapas i produkcję w toku oraz
        aktualizuje zapotrzebowanie.
      </p>
    ),
  },

  // —— Rezerwacje ——
  allocationStrategy: {
    title: "Strategia alokacji",
    description: (
      <p>
        Określa, z którego dostępnego zapasu Sasist w pierwszej kolejności zarezerwuje komponenty
        potrzebne do produkcji.
      </p>
    ),
  },
  allocationStrategyOptions: {
    FIFO: {
      title: "FIFO — najstarsze partie pierwsze",
      description: (
        <p>
          Najpierw rezerwowany jest najstarszy dostępny zapas. Przydatne dla materiałów bez istotnego
          terminu ważności.
        </p>
      ),
    },
    FEFO: {
      title: "FEFO — najkrótsza data ważności",
      description: (
        <p>
          Najpierw rezerwowane są partie z najbliższą datą ważności. Zalecane dla materiałów z
          terminem ważności.
        </p>
      ),
    },
    LIFO: {
      title: "LIFO — najnowsze partie pierwsze",
      description: <p>Najpierw rezerwowany jest najnowszy dostępny zapas.</p>,
    },
  } satisfies Record<ProductionReservationSettings["allocation_strategy"], SettingHelpContent>,
  allowSalesLocations: {
    title: "Uwzględniaj lokalizacje sprzedażowe",
    description: (
      <p>
        Pozwala rezerwować komponenty do produkcji również z lokalizacji używanych do sprzedaży, np.
        sklepu, ekspozycji lub POS. Po wyłączeniu takie lokalizacje są pomijane podczas rezerwacji
        materiałów.
      </p>
    ),
  },

  // —— Identyfikowalność ——
  traceabilityMode: {
    title: "Identyfikowalność",
    description: (
      <>
        <p>
          Określa, czy w produkcji wymagane jest podawanie danych identyfikujących materiały i
          wyroby (niezależnie od ustawień przyjęcia).
        </p>
        <ul>
          <li>
            <strong>Wyłączona</strong> — nie wymusza LOT / numeru seryjnego / daty ważności w
            procesie produkcji.
          </li>
          <li>
            <strong>Włączona</strong> — obowiązują wybrane poniżej wymagania (z uwzględnieniem
            ustawień produktu).
          </li>
        </ul>
      </>
    ),
    tip: <p>Partia dokumentu magazynowego to nie to samo, co numer partii (LOT) produktu.</p>,
  },
  requireBatch: {
    title: "Numer partii (LOT)",
    description: (
      <p>
        Wymaga podania numeru partii przy pobieraniu komponentów oraz przy rejestracji wyrobu
        gotowego, gdy produkt ma włączone śledzenie partii.
      </p>
    ),
  },
  requireSerial: {
    title: "Numer seryjny (SN)",
    description: (
      <p>
        Wymaga podania numeru seryjnego (zwykle sztuka po sztuce) przy pobieraniu i rejestracji
        produkcji, gdy produkt ma włączone śledzenie numerów seryjnych.
      </p>
    ),
  },
  requireExpiry: {
    title: "Data ważności",
    description: (
      <p>
        Wymaga podania daty ważności przy pobieraniu komponentów i rejestracji wyrobu, gdy produkt
        ma włączone śledzenie terminu ważności.
      </p>
    ),
  },

  // —— Terminal / sposób pracy ——
  requireOperator: {
    title: "Operator",
    description: (
      <p>
        Oznacza, że przy pracy produkcyjnej ma być wskazany operator. Ustawienie jest zapisane w
        konfiguracji magazynu; obecnie nie blokuje samodzielnie zakończenia produkcji w terminalu.
      </p>
    ),
  },
  requireQualityControl: {
    title: "Kontrola jakości",
    description: (
      <p>
        Oznacza, że przy pracy produkcyjnej ma być uwzględniona kontrola jakości. Ustawienie jest
        zapisane w konfiguracji magazynu; obecnie nie blokuje samodzielnie zakończenia produkcji w
        terminalu.
      </p>
    ),
  },

  // —— Wygląd ——
  show_product_image: {
    title: "Zdjęcie",
    description: <p>Pokazuje zdjęcie produktu na ekranach produkcji, gdy dany ekran to obsługuje.</p>,
  },
  show_name: {
    title: "Nazwa",
    description: <p>Pokazuje nazwę produktu na ekranach produkcji, gdy dany ekran to obsługuje.</p>,
  },
  show_sku: {
    title: "SKU",
    description: <p>Pokazuje kod SKU produktu w kreatorze zleceń i terminalu produkcyjnym.</p>,
  },
  show_ean: {
    title: "EAN",
    description: <p>Pokazuje kod EAN produktu w kreatorze zleceń i terminalu produkcyjnym.</p>,
  },
  show_catalog_number: {
    title: "Numer katalogowy",
    description: (
      <p>Pokazuje numer katalogowy produktu w kreatorze zleceń i terminalu produkcyjnym.</p>
    ),
  },
  show_source_location: {
    title: "Lokalizacja źródłowa",
    description: (
      <p>Pokazuje lokalizację, z której pobierany jest materiał lub towar w trakcie pracy.</p>
    ),
  },
  show_target_location: {
    title: "Lokalizacja docelowa",
    description: (
      <p>
        Pokazuje lokalizację docelową na ekranach produkcji, gdy dany ekran to obsługuje (np. gdzie
        ma trafić wyrób).
      </p>
    ),
  },
  show_stock_level: {
    title: "Stan magazynowy",
    description: <p>Pokazuje dostępny stan magazynowy produktu podczas pracy produkcyjnej.</p>,
  },
  show_unit: {
    title: "Jednostka",
    description: <p>Pokazuje jednostkę miary produktu (np. szt., kg) przy ilościach.</p>,
  },
  show_barcode: {
    title: "Kod kreskowy",
    description: (
      <p>
        Pokazuje osobny kod kreskowy produktu (pole <code>barcode</code> w karcie produktu — np. PRD-…),
        niezależny od EAN. Jeśli produkt nie ma kodu, nic nie jest wyświetlane.
      </p>
    ),
  },

  // —— Dokumenty ——
  productionCardTemplate: {
    title: "Karta produkcyjna",
    description: (
      <p>
        Szablon karty produkcyjnej zlecenia lub partii. Używany m.in. gdy realizacja odbywa się przez
        wydruk zlecenia.
      </p>
    ),
  },
  materialPickListTemplate: {
    title: "Lista pobrania materiałów",
    description: (
      <p>Szablon listy materiałów do pobrania na produkcję — pomoc przy kompletacji komponentów.</p>
    ),
  },
} as const;

export const FORECAST_STRATEGY_OPTIONS: {
  key: ProductionForecastSettings["strategy"];
  label: string;
  disabled?: boolean;
}[] = [
  { key: "PERIOD_AVERAGE", label: "Średnia z okresu" },
  { key: "WEIGHTED_AVERAGE", label: "Średnia ważona" },
  { key: "WEEKDAY_AVERAGE", label: "Średnia z tego samego dnia tygodnia" },
  { key: "MEDIAN", label: "Mediana sprzedaży" },
  { key: "MAX_DAILY", label: "Maksymalna sprzedaż dzienna" },
  { key: "AI_SMART", label: "Inteligentna (AI — w przygotowaniu)", disabled: true },
];

export const ALLOCATION_STRATEGY_OPTIONS: {
  key: ProductionReservationSettings["allocation_strategy"];
  label: string;
}[] = [
  { key: "FIFO", label: "FIFO — najstarsze partie pierwsze" },
  { key: "FEFO", label: "FEFO — najkrótsza data ważności" },
  { key: "LIFO", label: "LIFO — najnowsze partie pierwsze" },
];
