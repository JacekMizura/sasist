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
  "packing.show_packed_orders": {
    description: (
      <ul>
        <li>
          Domyślnie, przy wyłączonym ustawieniu, spakowane zamówienia będą ukryte, ale będzie można je wyświetlić,
          klikając przycisk „Wyświetl spakowane zamówienia”.
        </li>
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
