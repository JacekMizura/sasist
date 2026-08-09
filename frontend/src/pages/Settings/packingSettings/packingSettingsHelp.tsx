import type { ReactNode } from "react";

export type PackingSettingHelpEntry = {
  description: ReactNode;
  tip?: ReactNode;
};

/** Opisy ⓘ — klucze ustawień (nie wyświetlaj słowa „Podpowiedź”). */
export const PACKING_SETTING_HELP: Record<string, PackingSettingHelpEntry> = {
  "packing.require_notes_popup": {
    description: (
      <ul>
        <li>
          Jeśli zamówienie posiada notatkę, w trybie pakowania zostanie ona automatycznie wyświetlona w wyskakującym
          oknie (popup), które należy zamknąć, aby kontynuować pakowanie.
        </li>
        <li>
          W przypadku zamówienia jednoelementowego zawierającego 1 sztukę produktu, pakowanie standardowo pomija widok
          zamówienia i przechodzi od razu do akcji automatycznych.
        </li>
        <li>
          Jeżeli takie zamówienie posiada notatkę, proces zostaje przerwany przez popup z notatką, a po jego zamknięciu
          konieczne jest ponowne zeskanowanie lub spakowanie produktu, aby uruchomić dalsze akcje.
        </li>
      </ul>
    ),
  },
  "packing.show_all_notes": {
    description: (
      <ul>
        <li>Określa, które notatki są wyświetlane w trybie pakowania.</li>
        <li>
          Po włączeniu tej opcji w pakowaniu pokazywane są <strong>wszystkie notatki</strong> przypisane do zamówienia,
          niezależnie od ustawionej widoczności.
        </li>
        <li>
          Po wyłączeniu tej opcji wyświetlane są tylko notatki z włączoną widocznością{" "}
          <strong>„WMS – pakowanie”</strong>.
        </li>
      </ul>
    ),
    tip: (
      <ul>
        <li>Widoczność notatek jest ustawiana na karcie zamówienia lub przez akcje automatyczne.</li>
      </ul>
    ),
  },
  "packing.layout_mode": {
    description: "Określa sposób rozmieszczenia zawartości zamówienia na ekranie pakowania.",
  },
  "packing.product_display_mode": {
    description: (
      <ul>
        <li>
          <strong>Lista</strong> — kompaktowe karty poziome: zdjęcie po lewej, dane produktu i status pakowania w jednym
          rzędzie.
        </li>
        <li>
          <strong>Siatka</strong> — pionowe karty z większym zdjęciem u góry i informacjami pod spodem; wiele kart obok
          siebie.
        </li>
      </ul>
    ),
  },
  "packing.location_badge_position": {
    description: (
      <ul>
        <li>
          <strong>Prawy górny róg</strong> — lokalizacja magazynowa jest widoczna jako osobna etykieta w prawym górnym
          obszarze karty produktu.
        </li>
        <li>
          <strong>W szczegółach produktu</strong> — lokalizacja jest pokazywana razem z danymi produktu (EAN, symbol, nr
          katalogowy itd.), zamiast w rogu karty.
        </li>
        <li>Działa tylko gdy włączone jest „Wyświetlaj lokalizację produktów”.</li>
      </ul>
    ),
  },
  "packing.automation_buttons_position": {
    description: (
      <ul>
        <li>
          <strong>Na górze</strong> — przyciski aktywatorów automatyzacji pojawiają się nad listą / siatką produktów.
        </li>
        <li>
          <strong>Na dole</strong> — aktywatory są przypięte pod produktami jako belka na dole kolumny produktów.
        </li>
        <li>Widoczność samych przycisków steruje osobne ustawienie wyświetlania aktywatorów automatyzacji.</li>
      </ul>
    ),
  },
  "packing.move_packed_to_bottom": {
    description: "Po włączeniu całkowicie spakowane produkty są automatycznie przenoszone na koniec listy.",
  },
  "packing.show_order_phone": {
    description: "Po włączeniu numer telefonu klienta jest widoczny w widoku pakowania.",
  },
  "packing.show_order_value": {
    description: "Po włączeniu wartość zamówienia jest widoczna w widoku pakowania.",
  },
  "packing.show_shipping_address": {
    description: "Po włączeniu adres dostawy jest widoczny w widoku pakowania.",
  },
  "packing.customer_comment_style": {
    description: (
      <ul>
        <li>
          <strong>Wyróżniony</strong> — uwagi klienta pojawiają się jako czerwony panel nad produktami; w sidebarze nie
          są powtarzane, a dokument jest uproszczony.
        </li>
        <li>
          <strong>Zwykły</strong> — uwagi klienta pozostają w lewym panelu dokumentu.
        </li>
      </ul>
    ),
  },
  "packing.sales_document_preview": {
    description: (
      <ul>
        <li>
          <strong>Uproszczony</strong> — w sidebarze widać numer/typ dokumentu, przesyłkę, płatność i wartość (bez
          danych kupującego).
        </li>
        <li>
          <strong>Pełny</strong> — dodatkowo pokazuje nazwę kupującego, NIP i adres (gdy są dostępne).
        </li>
      </ul>
    ),
  },
  "packing.show_stock": {
    description: (
      <ul>
        <li>Po włączeniu przy produktach podczas pakowania wyświetlany jest ich stan magazynowy.</li>
        <li>Po wyłączeniu stan magazynowy nie jest pokazywany.</li>
      </ul>
    ),
  },
  "packing.show_ean": {
    description: (
      <ul>
        <li>Po włączeniu przy produktach podczas pakowania wyświetlany jest ich numer EAN.</li>
        <li>Po wyłączeniu EAN nie jest pokazywany.</li>
      </ul>
    ),
  },
  "packing.show_symbol": {
    description: (
      <ul>
        <li>Po włączeniu przy produktach podczas pakowania wyświetlany jest symbol/SKU produktu.</li>
        <li>Po wyłączeniu symbol nie jest pokazywany.</li>
      </ul>
    ),
  },
  "packing.show_catalog_number": {
    description: (
      <ul>
        <li>Po włączeniu przy produktach podczas pakowania wyświetlany jest numer katalogowy.</li>
        <li>Po wyłączeniu numer katalogowy nie jest pokazywany.</li>
      </ul>
    ),
  },
  "packing.show_signature": {
    description: (
      <ul>
        <li>Po włączeniu przy produktach podczas pakowania wyświetlana jest sygnatura produktu.</li>
        <li>Po wyłączeniu sygnatura nie jest pokazywana.</li>
      </ul>
    ),
  },
  "packing.show_price": {
    description: (
      <ul>
        <li>Po włączeniu przy produktach podczas pakowania wyświetlana jest cena produktu.</li>
        <li>Po wyłączeniu cena nie jest pokazywana.</li>
      </ul>
    ),
  },
  "packing.show_bundle_info": {
    description: (
      <ul>
        <li>Po włączeniu przy produktach z zestawu pokazywana jest informacja „Z zestawu”.</li>
        <li>Po wyłączeniu ta informacja nie jest wyświetlana.</li>
      </ul>
    ),
  },
  "packing.show_product_name_during_packing": {
    description: (
      <ul>
        <li>Po włączeniu na kafelku produktu podczas pakowania pokazywana jest nazwa produktu.</li>
        <li>Po wyłączeniu nazwa produktu nie jest wyświetlana.</li>
      </ul>
    ),
  },
  "packing.truncate_long_names": {
    description: (
      <ul>
        <li>Po włączeniu nazwy produktów są ograniczane do 25 znaków.</li>
        <li>Dłuższe nazwy są skracane z „…”.</li>
        <li>Po wyłączeniu pokazywana jest pełna nazwa produktu.</li>
      </ul>
    ),
  },
  "packing.show_product_image": {
    description: (
      <ul>
        <li>Po włączeniu zdjęcia produktów są wyświetlane na liście produktów podczas pakowania.</li>
        <li>Po wyłączeniu zdjęcie nie jest renderowane (bez szarego placeholdera).</li>
      </ul>
    ),
  },
  "packing.show_product_location": {
    description: (
      <ul>
        <li>Po włączeniu przy produkcie podczas pakowania wyświetlana jest jego lokalizacja magazynowa.</li>
        <li>Po wyłączeniu lokalizacja nie jest wyświetlana.</li>
      </ul>
    ),
  },
  "packing.choose_waybill_print_count": {
    description: (
      <ul>
        <li>W przypadku większej liczby listów niż 1, można będzie określić, ile z nich wydrukować.</li>
      </ul>
    ),
  },
  "packing.packer_is_not_picker": {
    description: (
      <ul>
        <li>Zaznacz tą opcję jeżeli osoby pakujące zamówienia nie zbierają zamówień.</li>
      </ul>
    ),
  },
  "packing.start_status_without_picking": {
    description: (
      <p>
        To ustawienie służy do określenia statusów zamówień dostępnych do pakowania, gdy nie korzystasz z procesu
        zbierania. Jeżeli korzystasz ze Zbierania, status do rozpoczęcia pakowania jest określany w konfiguracji
        Zbierania.
      </p>
    ),
  },
  "packing.main_packing_warehouse": {
    description: (
      <ul>
        <li>
          Określa magazyn, w którym będą pakowane zamówienia wymagające połączenia produktów z kilku magazynów.
          Produkty są najpierw kompletowane z odpowiednich magazynów, a następnie zamówienie trafia do wybranego
          magazynu pakowania.
        </li>
        <li>
          Dotyczy wyłącznie zamówień kierowanych do <strong>strefy sortującej</strong> (konsolidacja). Zamówienia
          możliwe do skompletowania w jednym magazynie nie są przez to ustawienie zmieniane.
        </li>
        <li>
          Brak wyboru oznacza dotychczasowe zachowanie systemu (bez preferowanego magazynu pakowania).
        </li>
      </ul>
    ),
  },
  "packing.show_automation_buttons": {
    description: (
      <ul>
        <li>
          W oknie pakowania pojawią się aktywatory automatyzacji (przyciski reguł z włączonym aktywatorem ręcznym).
        </li>
        <li>
          Pokazywane są wyłącznie reguły z zaznaczoną opcją „Pakowanie WMS”. To ustawienie steruje tylko widocznością —
          nie zmienia działania samych akcji automatycznych.
        </li>
      </ul>
    ),
  },
  "packing.show_product_image_in_orders": {
    description: (
      <ul>
        <li>Po włączeniu zdjęcia produktów są widoczne na liście zamówień.</li>
        <li>
          Dotyczy wyłącznie widoków <strong>Rozbudowany (Poziomy)</strong> i <strong>Rozbudowany (Pionowy)</strong>.
        </li>
        <li>W Standardowym zdjęcia nie są wyświetlane.</li>
      </ul>
    ),
  },
  "packing.show_sku_in_orders": {
    description: (
      <ul>
        <li>Po włączeniu na liście wyświetlany jest symbol produktu.</li>
        <li>Po wyłączeniu symbol nie jest wyświetlany.</li>
      </ul>
    ),
  },
  "packing.show_ean_in_orders": {
    description: (
      <ul>
        <li>Po włączeniu na liście wyświetlany jest EAN produktu.</li>
        <li>Po wyłączeniu EAN nie jest wyświetlany.</li>
      </ul>
    ),
  },
  "packing.show_catalog_number_in_orders": {
    description: (
      <ul>
        <li>Po włączeniu na liście wyświetlany jest numer katalogowy produktu.</li>
        <li>Po wyłączeniu numer katalogowy nie jest wyświetlany.</li>
      </ul>
    ),
  },
  "packing.truncate_names_in_orders": {
    description: (
      <ul>
        <li>Po włączeniu nazwy produktów na liście są ograniczane do 25 znaków.</li>
        <li>Dłuższe nazwy są skracane z „…”.</li>
        <li>Wyłączenie pokazuje pełną nazwę produktu.</li>
        <li>Nie zmienia to nazwy produktu w bazie.</li>
      </ul>
    ),
  },
  "packing.show_packed_orders": {
    description: (
      <ul>
        <li>Po włączeniu spakowane zamówienia są normalnie widoczne na liście.</li>
        <li>Po wyłączeniu spakowane zamówienia są domyślnie ukryte.</li>
        <li>
          Można je wtedy tymczasowo wyświetlić przyciskiem „Wyświetl spakowane zamówienia”.
        </li>
        <li>Ustawienie nie zmienia statusu zamówienia.</li>
      </ul>
    ),
  },
  "packing.block_extra_parcels_for": {
    description: (
      <ul>
        <li>
          Blokuje generowanie dodatkowych paczek dla wybranych typów usług kurierskich (działa tylko, jeśli włączona
          jest główna blokada).
        </li>
      </ul>
    ),
  },
  "packing.invoice_series": {
    description: (
      <ul>
        <li>
          Wybierz serię dokumentów faktur, które będą się wystawiać po spakowaniu zamówienia w akcjach automatycznych.
        </li>
      </ul>
    ),
  },
  "packing.receipt_series": {
    description: (
      <ul>
        <li>
          Wybierz serię dokumentów faktur, które będą się wystawiać po spakowaniu zamówienia w akcjach automatycznych.
        </li>
      </ul>
    ),
  },
};
