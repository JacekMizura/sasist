import type { ReactNode } from "react";

/** Opisy ⓘ — klucze ustawień (nie wyświetlaj słowa „Podpowiedź”). */
export const PACKING_SETTING_HELP: Record<string, ReactNode> = {
  "packing.require_notes_popup": (
    <>
      <p>
        Jeśli zamówienie posiada notatkę, w trybie pakowania zostanie ona automatycznie wyświetlona w wyskakującym oknie
        (popup), które należy zamknąć, aby kontynuować pakowanie.
      </p>
      <p>
        W przypadku zamówienia jednoelementowego zawierającego 1 sztukę produktu, pakowanie standardowo pomija widok
        zamówienia i przechodzi od razu do akcji automatycznych.
      </p>
      <p>
        Jeżeli takie zamówienie posiada notatkę, proces zostaje przerwany przez popup z notatką, a po jego zamknięciu
        konieczne jest ponowne zeskanowanie lub spakowanie produktu, aby uruchomić dalsze akcje.
      </p>
    </>
  ),
  "packing.show_all_notes": (
    <>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Określa, które notatki są wyświetlane w trybie pakowania.</li>
        <li>
          Po włączeniu tej opcji w pakowaniu pokazywane są wszystkie notatki przypisane do zamówienia, niezależnie od
          ustawionej widoczności.
        </li>
        <li>Po wyłączeniu tej opcji wyświetlane są tylko notatki z włączoną widocznością „WMS – pakowanie”.</li>
      </ul>
      <p className="font-semibold text-slate-800">Ważne:</p>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Widoczność notatek jest ustawiana na karcie zamówienia lub przez akcje automatyczne.</li>
      </ul>
    </>
  ),
  "packing.choose_waybill_print_count": (
    <p>W przypadku większej liczby listów niż 1, można będzie określić, ile z nich wydrukować.</p>
  ),
  "packing.packer_is_not_picker": (
    <p>Zaznacz tą opcję jeżeli osoby pakujące zamówienia nie zbierają zamówień.</p>
  ),
  "packing.main_packing_warehouse": (
    <p>zamówienia, których nie da się skompletować w jednym magazynie będą docelowo pakowane w tym magazynie.</p>
  ),
  "packing.show_automation_buttons": (
    <p>
      W oknie pakowania pojawią się aktywatory automatyzacji, takie same jak w edycji zamówienia w panelu Sellasist.
    </p>
  ),
  "packing.show_packed_orders": (
    <p>
      Domyślnie, przy wyłączonym ustawieniu, spakowane zamówienia będą ukryte, ale będzie można je wyświetlić, klikając
      przycisk „Wyświetl spakowane zamówienia”
    </p>
  ),
  "packing.block_extra_parcels_for": (
    <p>
      Blokuje generowanie dodatkowych paczek dla wybranych typów usług kurierskich (działa tylko, jeśli włączona jest
      główna blokada)
    </p>
  ),
  "packing.invoice_series": (
    <p>Wybierz serię dokumentów faktur, które będą się wystawiać po spakowaniu zamówienia w akcjach automatycznych</p>
  ),
  "packing.receipt_series": (
    <p>Wybierz serię dokumentów faktur, które będą się wystawiać po spakowaniu zamówienia w akcjach automatycznych</p>
  ),
};
