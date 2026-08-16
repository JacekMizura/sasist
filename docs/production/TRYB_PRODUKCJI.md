# Tryb Produkcji

**Dokument:** Specyfikacja biznesowo-funkcjonalna modułu Produkcja w Sasist  
**Charakter:** dokument projektowy „przed wdrożeniem” całego modułu  
**Źródło prawdy:** aktualny kod systemu Sasist (nie historyczne koncepcje)  
**Data opracowania:** 2026-08-16  
**Ostatnia aktualizacja:** 2026-08-16 — pobieranie multi-LOT (scoped discrepancy) + koszt materiałów z warstw przyjęcia  


**Legenda klasyfikacji obszarów**

| Oznaczenie | Znaczenie |
|---|---|
| **[ISTNIEJE]** | Funkcja działa end-to-end zgodnie z opisem |
| **[ISTNIEJE CZĘŚCIOWO]** | Rdzeń działa, ale brakuje domknięć / egzekucji części ustawień |
| **[GAP]** | Brak, niedomknięcie lub niespójność potwierdzona w systemie |
| **[PLANOWANE]** | Widoczne w UI/API jako przygotowane, ale bez pełnej logiki biznesowej |

---

## 1. Cel modułu

**[ISTNIEJE]**

Moduł **Produkcja** służy do wytwarzania wyrobów gotowych z komponentów (surowców i półproduktów) według receptury, z pełną kontrolą magazynową i operacyjną.

### Jakie problemy rozwiązuje

1. **Kontrola BOM** — ile i jakich komponentów zużywa się na jednostkę wyrobu.
2. **Produkcja pod popyt** — zamówienia klientów wymagające wytworzenia produktu uruchamiają zlecenie produkcyjne.
3. **Produkcja na zapas** — planowanie i automatyczne uzupełnianie stanu wyrobu gotowego.
4. **Operacyjna realizacja WMS** — pobranie komponentów → rejestracja produkcji → przyjęcie wyrobu → rozlokowanie lub pakowanie.
5. **Identyfikowalność** — LOT / SN / data ważności wyrobu (gdy włączone).
6. **Koszt materiałowy** — szacunek z receptury oraz rzeczywisty koszt po zużyciu (warstwy przyjęcia / fallback karty produktu).

### Powiązanie ERP + WMS

| Warstwa | Rola |
|---|---|
| **ERP Produkcja** | Receptury, zlecenia, partie, planowanie, braki, historia, koszty, konfiguracja |
| **WMS Produkcja** | Terminal operatora: pobieranie komponentów i rejestracja produkcji |
| **WMS Rozlokowanie** | Przyjęcie wyrobu z produkcji na zapas (ścieżka BAT / produkcja na zapas) |
| **WMS Pakowanie** | Dalsza obsługa zamówień po produkcji pod zamówienie (opcjonalnie auto-pack) |

### Dwa modele biznesowe

| Model | Kiedy | Co powstaje | Co dzieje się z wyrobem |
|---|---|---|---|
| **Produkcja pod zamówienie** | Zamówienie wchodzi w status wejściowy produkcji | Zlecenie MO typu ORDERS | Wyrób na lokalizację buforową → status po produkcji → Pakowanie (lub auto-pack) |
| **Produkcja na zapas** | Planista / automatyczne uzupełnianie / ręczne zlecenie | Partia BAT lub MO PLANNING/MANUAL | Dokument PW → Rozlokowanie WMS → stan magazynowy |

---

## 2. Słownik pojęć

Tylko pojęcia faktycznie używane w systemie:

| Pojęcie | Znaczenie biznesowe |
|---|---|
| **Wyrób (gotowy)** | Produkt finalny wytwarzany według receptury |
| **Komponent** | Surowiec lub półprodukt wchodzący w skład receptury |
| **Receptura** | Karta składu (BOM) wyrobu: lista komponentów z ilościami na jednostkę |
| **Wersja receptury** | Numer wersji karty składu; aktywna wersja jest używana przy zleceniach |
| **Wariant receptury** | Opcjonalny wariant (np. STANDARD / ECONOMIC / EXPORT) — wspierany w module braków / zamienników |
| **MO (zlecenie produkcyjne)** | Jednostkowe zlecenie na jeden wyrób i jedną ilość planowaną |
| **BAT (seria / partia produkcyjna)** | Zbiorcze zlecenie mogące obejmować wiele wyrobów (wiele linii) |
| **Produkcja pod zamówienie (ORDERS)** | MO powiązane ze źródłami zamówień klientów |
| **Produkcja na zapas** | BAT lub MO PLANNING/MANUAL — buduje wolny zapas |
| **Źródło zamówienia na MO** | Pozycja wiążąca zamówienie klienta z MO (status: open / reserved / shortage / fulfilled…) |
| **PW** | Przyjęcie wewnętrzne wyrobu gotowego |
| **RW** | Rozchód wewnętrzny komponentów zużytych do produkcji |
| **Bufor / staging FG** | Lokalizacja buforowa wyrobu po produkcji ORDERS (przed pakowaniem) |
| **Rozlokowanie** | Umieszczenie wyrobu z PW na lokalizację magazynową (moduł WMS Rozlokowanie) |
| **Konfigurator produkcji** | Reguła: status wejściowy zamówienia → statuses / bufor / sposób realizacji / akcja po produkcji |
| **Status wejściowy** | Status panelu zamówienia, który uruchamia produkcję |
| **Auto-pack** | Automatyczne zakończenie pakowania po produkcji, gdy wszystkie gotowe zamówienia mają już list przewozowy |
| **Pobieranie komponentów** | Faza WMS: zebranie materiałów pod MO/BAT |
| **Slice / partia przy picku** | Wybrany zapas: lokalizacja × LOT × data ważności × (opcjonalnie SN) |
| **Różnica stanu (discrepancy)** | Potwierdzenie mniejszej ilości niż stan systemowy **wybranego** slice — write-down tylko w tej tożsamości |
| **Rejestracja produkcji** | Zapisanie wyprodukowanej ilości (może być częściowa) |
| **combined need** | Łączne zapotrzebowanie produkcyjne: popyt z zamówień + luka magazynowa − zapas − produkcja w toku |
| **Rzeczywisty koszt materiałów** | Zamrożony koszt zużycia (`material_cost_json` na MO/BAT): receipt FIFO + fallback karty |

---

## 3. Receptury produkcyjne

**[ISTNIEJE]** (z elementami częściowymi przy wersjonowaniu UI)

### Gdzie jest receptura

1. **Lista receptur** — ERP → Produkcja → Receptury.
2. **Karta receptury** — szczegół składu, kosztów, edycja.
3. **Zakładka Produkcja na karcie produktu** — widok prezentacyjny wyrobu: hero produktu, tabela składu, przepływ INPUT → Produkcja → OUTPUT, koszt szacowany, zużycie w innych produktach.

### Tworzenie i edycja

- Recepturę tworzy się jako kartę składu wyrobu (tryb produkcyjny).
- Edycja: dodawanie / usuwanie komponentów, ilości, jednostki.
- Na karcie produktu: domyślnie widok prezentacyjny; przejście do edycji przez „Edytuj / Utwórz / Dodaj składnik”.

### Wersjonowanie i aktywna wersja

- Karta składu ma numer **wersji**.
- System utrzymuje aktywną wersję używaną przy planowaniu i zleceniach.
- **[ISTNIEJE CZĘŚCIOWO]** — pełne „historia wszystkich wersji jak w PLM” nie jest osobnym, bogatym workflowem użytkownika; wersja jest atrybutem karty, a nie rozbudowanym procesem zatwierdzania.

### Wydajność / „ile można wyprodukować”

- Przy planowaniu i analizie materiałów system liczy, ile wyrobu da się wytworzyć z dostępnych komponentów (limit materiałowy rekomendacji / blokada).

### Komponenty, ilości, jednostki

- Każda linia receptury: produkt komponentowy + ilość na jednostkę wyrobu + jednostka miary produktu.
- Typowe przypadki: sztuki, gramy, mililitry — zależnie od karty produktu.

### Koszt

- **Szacowany koszt jednostkowy** receptury = suma (cena zakupu netto komponentu × ilość).
- Widoczny na liście receptur, karcie receptury, karcie produktu, podglądach tworzenia zlecenia/partii.
- **Rzeczywisty koszt** po pobraniu wynika z warstw przyjęcia zużytych komponentów (lub fallback karty produktu) — patrz sekcja 20; nie jest to tylko bieżąca cena katalogowa stemplowana przy RW.

### Wykorzystanie produktu w innych recepturach

**[ISTNIEJE]** na karcie produktu („Zużycie w innych produktach”).  
**[GAP]** — brak równoważnej sekcji na stronie szczegółu receptury.

### Informacje na karcie produktu → Produkcja

- Skład (BOM) i ilości.
- Szacowany koszt.
- Przepływ materiałowy INPUT → Produkcja → OUTPUT.
- Lista produktów, w których dany produkt jest komponentem.
- Wejście do edycji / utworzenia receptury.

---

## 4. Planowanie produkcji

**[ISTNIEJE]**

### Cel

Pokazać, **ile trzeba wyprodukować**, żeby:
- pokryć otwarte zamówienia,
- utrzymać zapas wyrobu na zadany horyzont sprzedaży,
- uwzględnić to, co już jest na stanie i w produkcji.

### Wejścia biznesowe

| Wejście | Opis |
|---|---|
| Historia sprzedaży | Dzienne ilości z zamówień w wybranym okresie analizy |
| Aktualny stan | Zapas wyrobu gotowego |
| Produkcja w toku | BAT / MO / otwarte PW produkcyjne |
| Zapotrzebowanie z zamówień | Ilości na otwartych zamówieniach (niekońcowych, niespakowanych) |
| Parametry produktu | min/max, MOQ, wielokrotność, lead time |
| Dostępność komponentów | Limit „ile da się zrobić teraz” |

### Jak powstaje rekomendacja (język biznesowy)

1. Z **zrealizowanej** sprzedaży (packed / shipped / completed — bez anulowanych) wyliczana jest **średnia dzienna** (według strategii).
2. **Cel zapasu (target_stock)** = średnia dzienna × dni pokrycia (z ograniczeniem min/max produktu).
3. **Popyt z otwartych zamówień (order_demand)** = ilości na zamówieniach jeszcze niezrealizowanych (osobny strumień — nie wchodzi do historii prognozy).
4. **Potrzeba łączna (combined need)** =
   `max(0, order_demand + target_stock − on_hand − pipeline)`  
   Stan i pipeline są odejmowane **raz**. Nie liczy się najpierw „luki magazynowej”, a potem ponownie nie odejmuje zapasu.
5. Ilość jest zaokrąglana do MOQ / wielokrotności i ograniczana dostępnością materiałów.
6. Priorytet: CRITICAL / HIGH / MEDIUM / LOW (m.in. gdy zamówienia przekraczają zapas+pipeline lub pokrycie dni jest niskie).

**Przykład:** daily_rate=10, coverage=7 → target=70; otwarte zamówienia=20; stock=0 → combined=90  
(20 na bieżące zamówienia + 70 docelowego zapasu po ich obsłużeniu).

### Strategie prognozowania

| Strategia (UI) | Klucz | Działanie |
|---|---|---|
| Standardowa | PERIOD_AVERAGE | Równa średnia z okresu |
| Uwzględniaj trend | WEIGHTED_AVERAGE | Nowsze dni mają większą wagę |
| Według dni tygodnia | WEEKDAY_AVERAGE | Średnia z odpowiadających dni tygodnia |

### Symulacja i tworzenie partii

1. Planista widzi rekomendacje.
2. Uruchamia **symulację** (bez dokumentów).
3. Z symulacji może utworzyć **partię BAT** (jedna seria, wiele linii produktowych).

### Automatyczne uzupełnianie zapasu

**[ISTNIEJE]**

| Parametr | Wartości |
|---|---|
| Włączenie | Tak / Nie |
| Pokrycie | 1 / 3 / 7 / 14 dni |
| Częstotliwość | co 1 h / 3 h / 6 h / raz dziennie |

**Co tworzy automat:** wyłącznie **zlecenia MO źródła PLANNING** (tworzy nowe lub dokłada ilość do istniejącego draft/planned).  
**Nie tworzy BAT** z schedulera.

Kolejność pracy automatu: najpierw budzenie / obsługa braków pod zamówienia, potem nadprodukcja na zapas z pozostałych materiałów. Auto-replenishment używa tej samej metodyki `target_stock` / `forecast_stock_need` (dla nadprodukcji: order_demand=0).

---

## 5. Produkcja na zapas

**[ISTNIEJE]**

Dotyczy: **BAT** oraz MO **PLANNING / MANUAL** (ścieżka z rozlokowaniem).

### Lifecycle BAT (docelowy happy path)

```
Utworzenie (planned)
  → (opcjonalna) rezerwacja materiałów
  → wydanie do WMS / start pobierania (collecting)
  → pobranie komponentów
  → zakończenie pobrania → dokument RW → in_progress
  → rejestracja produkcji (może częściowa)
  → zakończenie produkcji → dokument PW (staging) → awaiting_putaway
  → Rozlokowanie WMS (dokument PW)
  → completed
```

### Krok po kroku

1. **Utworzenie** — ręcznie lub z symulacji planowania; status `planned`.
2. **Sprawdzenie materiałów** — analiza dostępności; przy braku: braki / blokada rekomendacji.
3. **Rezerwacja** — opcjonalnie przy tworzeniu BAT; lokalizacje pick-eligible wg strategii FIFO/FEFO/LIFO.
4. **Pobranie komponentów** — terminal WMS „Pobieranie komponentów”.
5. **RW** — powstaje przy zakończeniu pobrania (zużycie komponentów).
6. **Produkcja** — terminal WMS „Produkcja”; rejestracja ilości; możliwa produkcja częściowa.
7. **PW** — po domknięciu produkcji: przyjęcie wyrobu na staging, dokument trafia do kolejki Rozlokowania.
8. **Rozlokowanie** — operator w module WMS Rozlokowanie umieszcza towar na lokalizację docelową.
9. **Zakończenie** — po domknięciu PW partia przechodzi w `completed`.

### Statusy BAT

Patrz sekcja 17.

### GAP / wymaga domknięcia — projekcja rozlokowania

**[GAP]**

System utrzymuje fazę „oczekuje na rozlokowanie” na poziomie BAT/MO, ale:
- zakładka produkcyjna „Rozlokowanie” w WMS Produkcja **przekierowuje** do ogólnego modułu Rozlokowanie (dokumenty PW),
- operator widzi pracę po numerze dokumentu PW, nie po numerze BAT,
- status `putaway` („rozlokowanie w toku”) istnieje w słowniku, ale happy-path praktycznie przechodzi `awaiting_putaway` → `completed` bez trwałego użycia statusu pośredniego.

**Nie opisujemy tego jako poprawnej, domkniętej funkcjonalności „terminal rozlokowania produkcji”.**  
Opis poprawny: **produkcja tworzy PW → operator pracuje w Rozlokowaniu WMS.**

---

## 6. Produkcja wynikająca z zamówień klientów

**[ISTNIEJE]**

### Warunek wejścia

Zamówienie zmienia status panelu na **status wejściowy** skonfigurowany w Konfiguratorze produkcji.

### Ograniczenie zakresu

Domyślnie auto-MO powstaje dla zamówień **jednopozycyjnych**.  
Zamówienia wielopozycyjne nie tworzą automatycznego MO w tym zakresie (mogą trafić w status braku komponentów, jeśli skonfigurowany).

### Lifecycle MO ORDERS

```
Status wejściowy zamówienia
  → utworzenie / agregacja MO ORDERS (draft/planned)
  → walidacja materiałów + rezerwacja
     ├─ OK → źródła reserved; status oczekiwania na produkcję (jeśli skonfigurowany)
     └─ BRAK → źródła shortage; status braku komponentów
  → pobranie komponentów (collecting) → RW → in_progress
  → rejestracja produkcji
  → przyjęcie wyrobu na lokalizację buforową (PW buforowe, od razu „rozlokowane”)
  → alokacja sztuk do źródeł zamówień → fulfilled
  → status po wyprodukowaniu na zamówieniu (+ gotowość do pakowania)
  → handoff: auto-pack LUB Pakowanie LUB tylko zmiana statusu
  → MO completed (bez kolejki Rozlokowanie)
```

### Agregacja wielu zamówień w jedno MO

Jeżeli kolejne zamówienia mają ten sam magazyn, produkt, recepturę i konfigurację produkcji, a MO jest jeszcze `draft`/`planned`, system **dokłada źródła** do istniejącego MO i zwiększa planowaną ilość.

Przy produkcji wyprodukowane sztuki są alokowane do źródeł według kolejności biznesowej (priorytet / starszeństwo).

### Status po produkcji vs Pakowanie

- Zamówienie przechodzi na **status po wyprodukowaniu**.
- Dalej: zależnie od konfiguracji i auto-pack (sekcja 7).

### Bufor

Wyrób ORDERS **nie idzie** do klasycznej kolejki Rozlokowania.  
Trafia na **lokalizację buforową** z konfiguratora. Stan bufora schodzi przy zakończeniu pakowania.

---

## 7. Automatyczne pakowanie po produkcji

**[ISTNIEJE]**

### Zasada all-or-nothing

Dla zestawu zamówień, które właśnie stały się gotowe po produkcji:

| Warunek | Wynik |
|---|---|
| **Wszystkie** mają już list przewozowy | Auto-pack |
| **Choć jedno** nie ma listu | Brak auto-pack; standardowe przejście do Pakowania (gdy włączone) |

### Co robi auto-pack

1. Pomija ekran Pakowania dla operatora.
2. Wykonuje standardowe zakończenie pakowania (finalize) jak w Pakowaniu.
3. Wykonuje **aktywne akcje ustawień Pakowania** (dokument sprzedaży, zmiana statusu itd.).
4. **Nie generuje ponownie** istniejącego listu przewozowego.
5. Druk listu u klienta **tylko**, gdy ustawienie Pakowania `print_label` jest włączone i pipeline ma krok druku.
6. Jest **idempotentny** — ponowne wywołanie nie dubluje dokumentów / eventów finalize.

### Relacja do „Po wyprodukowaniu”

| Ustawienie konfiguratora | Bez auto-pack | Z udanym auto-pack |
|---|---|---|
| Zmień status | Toast: gotowe do pakowania | Toast auto-pack; bez nawigacji do Pakowania |
| Przejdź do pakowania | Toast + otwarcie Pakowania | Toast auto-pack; **bez** otwarcia Pakowania |

Auto-pack jest niezależny od wyboru „Przejdź do pakowania” — jeżeli warunki listów są spełnione, system finalizuje pakowanie automatycznie.

---

## 8. Rezerwacja materiałów

**[ISTNIEJE]**

### Kiedy powstaje

| Kontekst | Moment |
|---|---|
| MO ORDERS | Przy wejściu zamówienia / odświeżeniu walidacji materiałów (draft/planned) |
| MO PLANNING | Przy auto-uzupełnianiu / tworzeniu |
| BAT | Opcjonalnie przy tworzeniu partii |

### Skąd pobierane są lokalizacje

- Lokalizacje **kwalifikujące się do picku**.
- Domyślnie **bez lokalizacji sprzedażowych / retail**.
- Flaga „Uwzględniaj lokalizacje sprzedażowe” — rozszerza pulę.

### Strategie alokacji

| Strategia | Zachowanie |
|---|---|
| **FEFO** (domyślna) | Najpierw najwcześniejsza data ważności |
| **FIFO** | Najstarsze jednostki zapasu |
| **LIFO** | Najpóźniejsze jednostki zapasu |

### Zachowanie przy braku

- Część źródeł zamówień może zostać oznaczona jako brak (shortage).
- Zamówienie może przejść na status braku komponentów.
- Rezerwacja dotyczy tylko tego, co da się zabezpieczyć.

### Blokada i zużycie

- Start pobierania **blokuje** rezerwację.
- Koniec pobierania **zużywa** rezerwację i tworzy RW.
- Anulowanie / refresh może zwolnić rezerwację.

---

## 9. WMS — Pobieranie komponentów

**[ISTNIEJE]**

### Przebieg pracy magazyniera

1. **Kolejka** — lista MO/BAT oczekujących na pobranie.
2. **Wybór zlecenia** — wejście w konkretne MO lub BAT (także skan numeru zlecenia).
3. **Lista zadań** — komponenty z lokalizacjami i wymaganymi ilościami.
4. **Produkt** — karta zadania sterowana ustawieniami wyglądu terminala.
5. **Lokalizacja źródłowa** — wskazanie skąd zebrać (gdy włączone w wyglądzie).
6. **Partia (LOT) / SN** — gdy na lokalizacji jest więcej niż jedna partia, operator wybiera LOT (i datę ważności, jeśli rozróżnia warstwę); SN gdy wymagane.
7. **Skanowanie / potwierdzenie** — lokalizacja i produkt (zależnie od trybu pracy karty).
8. **Ilość** — podpowiedź = min(pozostało w zadaniu, stan **wybranego** slice); walidacja względem planu i dostępności.
9. **Identyfikowalność komponentu** — LOT/SN/expiry gdy wymagane na produkcie (patrz sekcja 12).
10. **Zakończenie pobrania** — gdy wszystkie zadania domknięte → RW → przejście do fazy produkcji.
11. **Przejście do Produkcji** — zlecenie pojawia się w kolejce „Produkcja”.

### Multi-LOT na jednej lokalizacji

**[ISTNIEJE]**

Na jednej lokalizacji może leżeć kilka partii tego samego komponentu (np. LOT-A = 6, LOT-B = 4, zadanie = 10).

| Zachowanie | Reguła |
|---|---|
| Potwierdzenie LOT-A ×6 | Rozlicza wyłącznie LOT-A; LOT-B zostaje nietknięty |
| Kolejne potwierdzenie LOT-B ×4 | Domknięcie 10/10; RW ma **dwie** linie (6 + 4) |
| Częściowy pick LOT-A ×4 przy remaining > stan LOT-A | LOT-A zostaje 2, LOT-B nietknięty — to normalny partial, **nie** write-down sąsiedniej partii |
| Różnica stanu w obrębie LOT | Write-down tylko wybranego LOT (+ expiry + lokalizacja + SN jeśli dotyczy) |

**Zakaz:** traktowanie niedoboru względem sumy całej lokalizacji jako discrepancy, gdy operator wskazał konkretną partię — to prowadziłoby do błędnego skonsumowania drugiej partii.

### Wygląd terminala

Patrz sekcja 11 — te same przełączniki wpływają na karty pobierania.

---

## 10. WMS — Produkcja

**[ISTNIEJE]**

### Przebieg

1. **Kolejka** — MO/BAT gotowe do rejestracji produkcji.
2. **Wybór zlecenia**.
3. **Produkt / plan / wyprodukowano / pozostało**.
4. **Rejestracja produkcji** — modal: ilość + wymagane pola LOT/SN/data ważności (gdy identyfikowalność włączona).
5. **Produkcja częściowa** — można zarejestrować mniej niż plan; zlecenie zostaje otwarte.
6. **Zakończenie** — gdy plan pokryty:
   - **BAT / PLANNING / MANUAL** → PW → oczekiwanie na Rozlokowanie,
   - **ORDERS** → bufor + handoff do pakowania / auto-pack → MO completed.

### Różnice BAT vs ORDERS

| | BAT / na zapas | ORDERS |
|---|---|---|
| Po produkcji | PW do Rozlokowania | Bufor FG |
| Status końcowy fazy | `awaiting_putaway` → `completed` po putaway | od razu `completed` |
| Pakowanie | Nie | Tak (lub auto-pack) |
| Dokument RW | Tak (po pobraniu) | Tak (po pobraniu) |

### Tryb wydruku zlecenia

**[ISTNIEJE]**

Konfigurator może ustawić realizację „Wydruk zlecenia” zamiast pełnego terminala WMS — wtedy operator pracuje w trybie papierowym / ERP realizacji, a nie w klasycznych zakładkach WMS collect/execute.

---

## 11. Informacje wyświetlane w terminalu

**[ISTNIEJE CZĘŚCIOWO]**

Ustawienia: WMS → Ustawienia → Produkcja → **Wygląd terminala**.

| Ustawienie | Co kontroluje | Ekrany | Status |
|---|---|---|---|
| Zdjęcie | Miniatura produktu | Kolejki, karty collect/execute, pasek aktywnego zlecenia, modal rejestracji | **ISTNIEJE** |
| Nazwa | Nazwa produktu | j.w. | **ISTNIEJE** |
| SKU | Kod SKU w meta | j.w. | **ISTNIEJE** |
| EAN | EAN w meta | j.w. | **ISTNIEJE** |
| Numer katalogowy | Numer katalogowy w meta | j.w. | **ISTNIEJE** |
| Kod kreskowy | Dodatkowy barcode produktu | j.w. | **ISTNIEJE** |
| Jednostka | Jednostka przy ilościach | collect/execute/kolejki | **ISTNIEJE** |
| Lokalizacja źródłowa | Skąd zbierać | Karty pobierania | **ISTNIEJE** |
| Stan magazynowy | „Dostępne tu” | Karty pobierania | **ISTNIEJE** |

---

## 12. Identyfikowalność

**[ISTNIEJE CZĘŚCIOWO]**

### Warstwy

1. **Ustawienia magazynu — Identyfikowalność produkcji**  
   - Tryb: Wyłączona / Włączona  
   - Wymagaj: LOT, SN, data ważności

2. **Override na produkcie** — dziedzicz / wymagaj / wyłącz (dla ścieżek komponentów i FG).

3. **Rejestracja FG (WMS Produkcja)** — modal rejestracji egzekwuje wymagane pola, gdy tryb włączony.

### Co jest wspierane

| Pole | Wsparcie |
|---|---|
| LOT (numer partii) | Tak — przy rejestracji wyrobu |
| Numer seryjny | Tak — lista SN przy rejestracji |
| Data ważności | Tak — przy rejestracji wyrobu |

### Moment rejestracji

- Dane identyfikowalności wyrobu są zbierane **przy rejestracji produkcji** (delta FG).
- Trafiają do zapisu wyjścia produkcyjnego i dalej do stanów / dokumentów PW.

### Komponenty przy pobieraniu

**[ISTNIEJE]** — przy multi-LOT operator wybiera partię (i expiry, gdy warstwy się różnią); consume i discrepancy są scoped do wybranego slice. LOT/SN mogą być dodatkowo **wymagane** polityką produktu / magazynu. Egzekucja „wymagaj expiry” na karcie collect jest pełniejsza dla FG niż dla komponentu (override produktu + polityka).

### LOT na dokumencie RW

**[ISTNIEJE]** — jedna pozycja RW na **PRODUCT × LOT × data ważności**, z ilościami ze slice/ISSUE (MO i BAT). Cena linii = średnia ważona kosztów zużytych slice’ów. SN komponentu pozostaje w audycie / operacjach magazynowych (bez kolumny SN na `StockDocumentItem`).

---

## 13. Dokumenty produkcyjne

**[ISTNIEJE CZĘŚCIOWO]**

| Dokument | Kiedy powstaje | Co dokumentuje | Powiązanie |
|---|---|---|---|
| **RW** | Koniec pobrania komponentów | Zużycie materiałów | MO / BAT |
| **PW (na zapas)** | Koniec produkcji BAT/PLANNING/MANUAL | Przyjęcie wyrobu na staging | Kolejka Rozlokowanie |
| **PW (bufor ORDERS)** | Rejestracja FG ORDERS | Przyjęcie na bufor | Od razu domknięte pod kątem rozlokowania; dalej pakowanie |
| **Karta produkcyjna** | Wydruk ze zlecenia/partii | Instrukcja / karta pracy | Szablon dokumentu; druk z ERP |
| **Lista pobrania materiałów** | Wydruk ze zlecenia/partii | Lista picku (MO/BAT, FG, komponenty, lokalizacje) | Szablon `production_material_pick_list`; CTA „Drukuj listę pobrania” |
| **Raport produkcji (szablon)** | Rodzaj szablonu w systemie szablonów | — | **[ISTNIEJE CZĘŚCIOWO]** — rodzaj istnieje w mapie szablonów; nie jest osobnym, domkniętym raportem operacyjnym |

### Dokumenty ze starej koncepcji (RWP / ZS / ZWP / PWP)

**Nie istnieją** jako osobne typy w obecnym Sasist. Odpowiedniki biznesowe: **RW**, **PW**, zlecenie MO/BAT, braki → zakupy (most zakupowy w brakach).

---

## 14. Rozlokowanie wyprodukowanego towaru

**[ISTNIEJE CZĘŚCIOWO]** + **[GAP] UX**

### Poprawny flow (BAT / produkcja na zapas)

```
Produkcja (rejestracja + finish)
  → dokument PW (creation source: produkcja)
  → lokalizacja staging
  → kolejka WMS Rozlokowanie (dokumenty)
  → lokalizacja docelowa
  → stock dostępny
  → BAT/MO completed
```

### Flow ORDERS (świadomie inny)

```
Produkcja
  → PW buforowe (już „DONE” pod kątem rozlokowania)
  → lokalizacja buforowa
  → Pakowanie / auto-pack
  → zejście ze stanu bufora przy finish pakowania
```

### Podejrzenie niespójności „Rozlokuj produkt” vs pusta kolejka PZ

**Werdykt audytu: GAP / wymaga domknięcia (projekcja UI), nie happy-path bez PW.**

1. BAT po produkcji ma status oczekiwania na rozlokowanie i w projekcji produkcji może sugerować pracę putaway.
2. Terminal `/wms/production/putaway` **nie istnieje operacyjnie** — przekierowuje do `/wms/putaway`.
3. Operator w Rozlokowaniu widzi **dokumenty PW**, nie listę BAT.
4. Jeżeli ktoś szuka „partii” zamiast PW, kolejka może wyglądać na pustą mimo statusu BAT.

**Opis docelowy dla wdrożenia:** rozlokowanie produkcji = praca na PW w module Rozlokowanie.  
Statusy BAT są lustrzane względem domknięcia PW.

---

## 15. Konfigurator produkcji

**[ISTNIEJE]**

Lokalizacja: Ustawienia WMS → Produkcja → Konfigurator produkcji.

| Pole | Wymagane | Działanie |
|---|---|---|
| **Status wejściowy** | Tak | Uruchamia produkcję, gdy zamówienie wejdzie w ten status |
| **Status po wyprodukowaniu** | Tak | Status zamówienia po fulfillment źródła |
| **Status oczekiwania na produkcję** | Tak | Status po przyjęciu do produkcji (gdy materiały OK) |
| **Status przy braku komponentów** | Tak | Status przy shortage |
| **Lokalizacja buforowa** | Tak | Gdzie ląduje wyrób ORDERS |
| **Sposób realizacji** | Tak | WMS / Wydruk zlecenia |
| **Po wyprodukowaniu** | Tak | Zmień status / Przejdź do pakowania |

### Unikalność statusu wejściowego

**[ISTNIEJE]**

Jeden status wejściowy **nie może** być użyty jednocześnie przez:
- inną konfigurację produkcji,
- konfigurację zbierania (picking).

UI blokuje zajęte statusy; backend również waliduje kolizję.

---

## 16. Ustawienia Produkcji

**[ISTNIEJE]** (z GAP-ami oznaczonymi)

### 16.1 Konfigurator produkcji

Patrz sekcja 15.

### 16.2 Prognozowanie i zapas

| Ustawienie | Wartości | Wpływ |
|---|---|---|
| Strategia prognozy | Standardowa / Uwzględniaj trend / Według dni tygodnia | Jak liczona średnia dzienna |
| Okres historii sprzedaży | 7–365 dni | Okno analizy |
| Automatyczne uzupełnianie zapasu | Tak/Nie | Scheduler MO PLANNING |
| Docelowe pokrycie | 1/3/7/14 dni | Horyzont celu zapasu |
| Automatyczne przeliczanie | 1h / 3h / 6h / daily | Częstotliwość joba |

### 16.3 Rezerwacje

| Ustawienie | Wartości | Wpływ |
|---|---|---|
| Strategia alokacji | FIFO / FEFO / LIFO | Kolejność zejścia ze stanów lokalizacji |
| Uwzględniaj lokalizacje sprzedażowe | Tak/Nie | Czy retail wchodzi do rezerwacji |

### 16.4 Identyfikowalność

| Ustawienie | Wartości | Wpływ |
|---|---|---|
| Identyfikowalność | Wyłączona / Włączona | Bramka wymagań FG |
| Numer partii (LOT) | Tak/Nie | Wymóg w modalu rejestracji |
| Numer seryjny (SN) | Tak/Nie | Wymóg SN |
| Data ważności | Tak/Nie | Wymóg daty |

### 16.5 Wygląd terminala

Patrz sekcja 11.

### 16.6 Dokumenty

| Ustawienie | Działanie |
|---|---|
| Przypisanie szablonu „Karta produkcyjna” | Druk karty ze zleceń/partii |
| Przypisanie szablonu „Lista pobrania materiałów” | Druk listy pobrania ze zlecenia/partii (ten sam flow druku) |

### 16.7 Legacy JSON (bez UI)

Kolumny / blob `terminal_required` oraz flaga `show_target_location` mogą nadal istnieć w JSON ustawień dla kompatybilności technicznej — **nie sterują** produktem v1 i nie mają aktywnego UI. Traceability SSOT: sekcja Identyfikowalność.

---

## 17. Statusy i lifecycle

Źródło: słownik statusów produkcyjnych w systemie (nie etykiety marketingowe).

### 17.1 MO i BAT — statusy wspólne

| Typ | Status | Co oznacza | Co powoduje przejście | Następny typowy status |
|---|---|---|---|---|
| MO/BAT | `draft` | Robocze | Zapis / planowanie | `planned` |
| MO/BAT | `planned` | Zaplanowane, gotowe do startu | Start pobierania / wydanie do WMS | `collecting` |
| MO/BAT | `collecting` | Trwa pobieranie komponentów | Zakończenie pobrania | `in_progress` (+ RW) |
| MO/BAT | `in_progress` | Trwa produkcja | Domknięcie planu produkcji | ORDERS → `completed`; zapas → `awaiting_putaway` |
| MO/BAT | `awaiting_putaway` | Czeka na rozlokowanie PW | Domknięcie Rozlokowania | `completed` |
| MO/BAT | `putaway` | Rozlokowanie w toku | *(słownikowo)* | `completed` |
| MO/BAT | `completed` | Zakończone | — | — |
| MO/BAT | `cancelled` | Anulowane | — | — |

**Uwaga:** `putaway` jest w słowniku, ale happy-path rzadko go ustawia — **[GAP] spójność słownika vs runtime**.

### 17.2 Linie BAT

| Status linii | Znaczenie |
|---|---|
| `planned` | Linia zaplanowana |
| `in_progress` | W produkcji |
| `produced` | Wyprodukowana (przed pełnym domknięciem putaway) |
| `completed` | Domknięta |

### 17.3 Źródła zamówień na MO ORDERS

| Status źródła | Znaczenie |
|---|---|
| `open` | Dołączone |
| `reserved` | Materiały zarezerwowane / zakwalifikowane |
| `partial` | Częściowo |
| `shortage` | Brak komponentów |
| `fulfilled` | Wyrób przypisany do zamówienia |
| `cancelled` | Anulowane |

### 17.4 WMS collect / execute / putaway (fazy kolejki)

| Faza | Statusy zleceń w kolejce | Znaczenie |
|---|---|---|
| Pobieranie | `collecting` (+ wejścia do zbierania) | Zbieranie komponentów |
| Produkcja | `in_progress` | Rejestracja FG |
| Putaway (projekcja) | `awaiting_putaway`, `putaway` | **Przekierowanie do Rozlokowania dokumentów** |

### 17.5 Handoff do packing (ORDERS)

| Stan | Znaczenie |
|---|---|
| Zamówienie po produkcji | Status po wyprodukowaniu + gotowość do pakowania |
| Auto-pack success | Zamówienie spakowane systemowo; bez UI pakowania |
| Fallback packing | Operator pakuje ręcznie (brak listu / mixed) |

---

## 18. Obsługa braków

**[ISTNIEJE]**

### Wykrywanie

- Analiza materiałów: OK / PARTIAL / BLOCKED.
- Przy ORDERS: demotion źródeł do `shortage` + status braku komponentów na zamówieniu.
- ERP: ekrany Braki / Analiza materiałów / Rezerwacje.

### Wpływ na produkcję

- Nie da się sensownie wystartować pełnej realizacji bez materiałów (blokady / ograniczenie ilości).
- Auto-uzupełnianie najpierw stara się budzić braki ORDERS.

### Wpływ na zamówienie

- Status „brak komponentów”.
- Po uzupełnieniu materiału proces może wrócić (auto-resume / ponowna walidacja) — zdarzenia audytowe przewidują wznowienie.

### Most do zakupów

**[ISTNIEJE]** — z braków można przejść do zapotrzebowania zakupowego / dodania do zamówienia zakupu.

---

## 19. Historia i audyt

**[ISTNIEJE]**

### Warstwy

1. **Historia produkcji (ERP)** — lista / przebieg zleceń i partii, KPI kosztów.
2. **Historia na karcie produktu** — kontekst produkcyjny produktu.
3. **Activity log domenowy** — zdarzenia: utworzenie, release, braki, rezerwacje, collecting, RW, progress, PW, fulfillment, completed, cancelled, auto-resume itd.
4. **Logi WMS / audit magazynowy** — dokumenty RW/PW i operacje warehouse.
5. **Activity pakowania** przy auto-pack (PACKING_FINISHED, PACKING_AUTO_AFTER_PRODUCTION, …).

### Co widać biznesowo

- Kto / kiedy utworzył i prowadził zlecenie.
- Dokumenty RW/PW.
- Postęp pobrania i produkcji.
- Domknięcie i powiązanie z zamówieniami.

---

## 20. Koszt produkcji

**[ISTNIEJE — receipt FIFO + fallback karty]**

Koszt produkcji opiera się na rzeczywistym koszcie zużytych komponentów.

### Zasada nadrzędna

**Koszt nie ma własnego, niezależnego FIFO.**  
Koszt **podąża za faktycznie zużytą warstwą magazynową**:

- fizyczny pick FIFO → koszt slice wybranego przez FIFO,
- FEFO → koszt slice wybranego przez FEFO,
- LIFO → koszt slice wybranego przez LIFO.

Nie wolno wyceniać zużycia z najstarszego przyjęcia, jeśli fizycznie FEFO/LIFO zużyło inną partię.

### Receipt → fallback

1. Dla każdej zużytej ilości system w pierwszej kolejności bierze koszt jednostkowy z **dokumentu przyjęcia** (RECEIPT z ceną), powiązanego z danym zapasem / LOT.
2. Jeżeli komponent pochodzi z kilku dostaw, koszt liczony jest **osobno dla każdej części**.
3. Jeżeli nie da się ustalić ceny z przyjęcia (brak RECEIPT z ceną, legacy stock, ręczna korekta bez provenance), używany jest fallback: **cena zakupu netto z karty produktu** (`purchase_price`). Źródło jest jawne: `cost_source = RECEIPT | PRODUCT_FALLBACK`.

Przykład (dwa przyjęcia, jeden pick multi-LOT):

| Źródło | Ilość | Cena netto | Składnik kosztu |
|---|---|---|---|
| PZ1 / LOT-A | 100 | 10 zł | 1000 |
| PZ2 / LOT-B | 50 | 12 zł | 600 |
| **Razem** | **150** | | **1600 zł** |

### Po RW — zamrożenie

| Pojęcie | Opis |
|---|---|
| Szacowany koszt receptury | Orientacyjny przed produkcją: Σ (cena katalogowa × qty BOM) |
| Rzeczywisty koszt materiałów | Po zakończeniu pobrania: `Σ (slice_qty × unit_cost)` — zapis w `material_cost_json` na MO/BAT (`actual_material_cost`) |
| Rzeczywisty koszt / szt. | `actual_material_cost / produced_qty` (przy partial: mianownik = planned aż do domknięcia) |
| Flaga fallback | UI / API: `has_product_cost_fallback`, gdy część slice’ów poszła z karty produktu |

RW: linie **PRODUCT × LOT × expiry** mają `purchase_price_net` jako średnią ważoną slice’ów tej linii.  
ISSUE: `unit_price_net` + metadane źródła receipt (dokument / linia), gdy dostępne.

**Niezmienność:** zamrożony koszt historyczny **nie zmienia się** po późniejszej zmianie ceny na karcie produktu.

**Nie jest** to pełny controlling ABC / rachunek kosztów z narzutami — to koszt materiałowy oparty o przyjęcia + fallback karty.

---

## 21. Uprawnienia i role

**[ISTNIEJE CZĘŚCIOWO]**

| Mechanizm | Stan |
|---|---|
| Logowanie + kontekst magazynu | Wymagane do API/UI |
| WMS tryb operacyjny „Produkcja” | Bramka dostępu do zakładek WMS Produkcja |
| Dedykowane permission keys `production.*` | **[GAP]** — brak w katalogu uprawnień |
| Przypisanie operatora do zlecenia + push + ekskluzywna kolejka | **[GAP]** względem starej koncepcji — **nie istnieje** jako domknięty proces (mimo śladów eventów/pól) |

---

## 22. Raportowanie

| Obszar | Klasyfikacja |
|---|---|
| Pulpit produkcji (KPI / kolejki) | **ISTNIEJE** |
| Historia produkcji | **ISTNIEJE** |
| Analiza kosztów | **ISTNIEJE** |
| Analiza materiałów / braki | **ISTNIEJE** |
| Raport zużycia surowców (osobny raport zarządczy) | **GAP** |
| Oś czasu zleceń (Gantt) | **GAP** |
| Statystyki wydajności pracy specjalnie dla trybu produkcji | **GAP** |
| Szablon „raport produkcji” | **ISTNIEJE CZĘŚCIOWO** (rodzaj szablonu, nie pełny raport operacyjny) |

---

## 23. Integracje modułu

| Integracja | Dane / moment |
|---|---|
| **Produkcja ↔ Produkty** | Receptura, ceny, jednostki, override identyfikowalności, min/max/MOQ |
| **Produkcja ↔ Zamówienia** | Status wejściowy → MO; statusy awaiting/shortage/after; fulfillment źródeł; handoff packing |
| **Produkcja ↔ Magazyn** | Stany lokalizacji, rezerwacje, bufor FG, staging PW |
| **Produkcja ↔ WMS** | Kolejki collect/execute; skany; terminal display |
| **Produkcja ↔ Dokumenty** | RW, PW, szablony karty / listy pobrania |
| **Produkcja ↔ Rozlokowanie** | PW PRODUCTION w kolejce putaway (ścieżka na zapas) |
| **Produkcja ↔ Pakowanie** | Status ready + auto-pack finalize + ustawienia print_label/document/status |
| **Produkcja ↔ Zakupy** | Most z braków do zapotrzebowania zakupowego |

---

## 24. Scenariusze biznesowe

### A. Produkcja 10 szt. na zapas

**Warunki:** aktywna receptura; komponenty dostępne.  
**Przebieg:** utworzenie BAT 10 szt. → pobranie → RW → rejestracja 10 → PW → rozlokowanie → completed.  
**Rezultat:** +10 na lokalizacji magazynowej; dokumenty RW/PW.

### A2. Pobranie multi-LOT z jednej lokalizacji

**Warunki:** komponent na jednej lokalizacji w dwóch partiach (np. LOT-A = 6, LOT-B = 4); zadanie = 10.  
**Przebieg:** pick LOT-A ×6 → pick LOT-B ×4 → finish collecting.  
**Rezultat:** oba picki OK; po pierwszym LOT-B nadal 4; RW z **dwoma** liniami (6 + 4); bez write-down sąsiedniej partii; `actual_material_cost` zgodny z cenami warstw / fallbackiem.

### B. Produkcja 1 szt. pod zamówienie

**Warunki:** zamówienie 1-pozycyjne wchodzi w status wejściowy; materiały OK.  
**Przebieg:** MO ORDERS → pobranie → produkcja 1 → bufor → status po produkcji → Pakowanie (lub auto-pack).  
**Rezultat:** zamówienie gotowe / spakowane; MO completed.

### C. Brak komponentów

**Warunki:** BOM nie pokryty stanem.  
**Przebieg:** MO powstaje lub jest ograniczane; źródła shortage; status braku na zamówieniu; ekran braków.  
**Rezultat:** produkcja nie idzie pełnym happy-path; po uzupełnieniu możliwy powrót.

### D. Produkcja częściowa

**Warunki:** plan 10; operator rejestruje 4.  
**Przebieg:** progress 4/10; zlecenie pozostaje w produkcji.  
**Rezultat:** częściowy FG; dokończenie później.

### E. Zamówienie z gotowym listem przewozowym

**Warunki:** list istnieje przed produkcją.  
**Przebieg:** produkcja → auto-pack → finalize + post-actions; bez UI pakowania.  
**Rezultat:** 1× dokumenty/akcje; toast sukcesu; status spakowane.

### F. Zamówienie bez listu

**Warunki:** brak listu.  
**Przebieg:** brak auto-pack; OPEN_PACKING → ekran Pakowania.  
**Rezultat:** operator pakuje ręcznie / generuje list w Pakowaniu.

### G. Kilka zamówień z jednego MO

**Warunki:** kilka 1-pozycyjnych zamówień tego samego SKU/konfiguracji.  
**Przebieg:** agregacja do jednego MO; produkcja alokuje sztuki do źródeł.  
**Rezultat:** wiele fulfilled; handoff dla wszystkich nowo gotowych.

### H. Mixed labels w jednym MO

**Warunki:** część zamówień ma list, część nie.  
**Przebieg:** all-or-nothing → **brak** auto-pack dla zestawu.  
**Rezultat:** standardowe Pakowanie.

### I. Produkcja wymagająca LOT / daty ważności

**Warunki:** identyfikowalność włączona + wymagania LOT/expiry.  
**Przebieg:** modal rejestracji blokuje zapis bez danych.  
**Rezultat:** FG ze śladem identyfikowalności.

### J. PW → rozlokowanie

**Warunki:** BAT po finish production.  
**Przebieg:** PW w kolejce Rozlokowanie → skan lokalizacji docelowej → DONE.  
**Rezultat:** stock na lokalizacji; BAT completed.

---

## 25. Zakres Produkcji v1

Moduł Produkcja w Sasist v1 obejmuje wytwarzanie wyrobów według receptury, z pełną kontrolą magazynową i operacyjną w dwóch modelach:

**Produkcja na zapas** — partie i zlecenia planistyczne: pobranie komponentów → produkcja → przyjęcie wewnętrzne (PW) → standardowe Rozlokowanie WMS → stan magazynowy.

**Produkcja pod zamówienie** — zlecenia powiązane z zamówieniami klientów: pobranie → produkcja → lokalizacja buforowa → status po produkcji → Pakowanie albo automatyczne pakowanie (gdy wszystkie nowo gotowe zamówienia mają już list przewozowy).

W zakresie v1 znajdują się m.in.:

- receptury (skład, ilości, koszt szacowany) oraz zakładka Produkcja na karcie produktu,
- planowanie zapotrzebowania z trzema strategiami prognozy: Standardowa, Uwzględniaj trend, Według dni tygodnia,
- automatyczne uzupełnianie zapasu (zlecenia planistyczne),
- zlecenia i partie, rezerwacje materiałów (FIFO / FEFO / LIFO), obsługa braków i most do zakupów,
- przypisanie operatora do zlecenia / partii,
- terminal WMS: pobieranie komponentów (w tym multi-LOT na jednej lokalizacji, discrepancy scoped do wybranej partii) i rejestracja produkcji (także częściowa),
- dokumenty RW (pozycje PRODUCT × LOT × expiry + koszt ważony) i PW, karta produkcyjna oraz lista pobrania materiałów (wydruk),
- identyfikowalność wyrobu (LOT / SN / data ważności) wg ustawień magazynu i produktu,
- rzeczywisty koszt materiałów z warstw przyjęcia (RECEIPT) z jawnym fallbackiem ceny karty produktu; zamrożenie na MO/BAT,
- konfigurator produkcji (statusy zamówienia, bufor, WMS vs wydruk, akcja po produkcji),
- wygląd terminala (zdjęcie, nazwa, kody, jednostka, lokalizacja źródłowa, stan),
- historia produkcji, dziennik zdarzeń, pulpit i analiza kosztów materiałowych,
- handoff do Pakowania oraz auto-pack zgodny z ustawieniami Pakowania (w tym druk listu wyłącznie gdy włączony).

**Powierzchnie użytkownika v1:** ERP Produkcja (pulpit, zlecenia, planowanie, receptury, materiały, historia, koszty, ustawienia), WMS Produkcja (pobieranie, produkcja), WMS Rozlokowanie (PW z produkcji na zapas), WMS Pakowanie (po ORDERS / auto-pack).

---

## 26. Do domknięcia przed wydaniem

| # | Problem | Oczekiwane zachowanie | Priorytet |
|---|---|---|---|
| 1 | Panel zamienników na Brakach to słownik analizy — bez automatycznej zmiany BOM / pick / RW | Pełny workflow accept-substitute (BOM + pick + RW) w dalszym rozwoju; martwa ścieżka `/produkcja/zastepniki-materialow` usunięta | **P2** (poza v1) |

Nie uznajemy za brak v1: rozlokowania przez standardowe WMS Rozlokowanie (PW), bufora ORDERS bez kolejki putaway, trzech strategii prognozy, auto-pack all-or-nothing, możliwości przypisania operatora do zlecenia, LOT na pozycjach RW, scoped multi-LOT przy pobieraniu (bez write-down sąsiedniej partii), kosztu materiałów z warstw przyjęcia + fallback karty, listy pobrania z CTA druku, poprawionej metodyki planowania (realized sales + combined need bez double subtraction).

---

## 27. Dalszy rozwój

Funkcje świadomie **niewchodzące** do Produkcji v1:

- oś czasu zleceń (Gantt) i rozbudowane raporty zarządcze (zużycie surowców, wydajność pracy),
- ograniczenie realizacji wyłącznie do przypisanego operatora, dedykowana kolejka oraz powiadomienia push (samo przypisanie operatora do zlecenia już jest w v1),
- zwrot niewykorzystanych komponentów po produkcji jako osobny etap,
- pełne wersjonowanie receptur w stylu PLM,
- automatyczna produkcja z zamówień wielopozycyjnych,
- osobne, granularne uprawnienia produkcji poza trybem WMS / kontekstem magazynu,
- osobny terminal „Rozlokowanie produkcji” równoległy do dokumentów PW,
- ważenie / krok jednostki przy pobieraniu oraz rejestracja FG wyłącznie skanem sztuka po sztuce,
- automatyczny workflow zamienników materiałów (zmiana BOM / pick / RW),
- wymagania procesu: operator / QC / data produkcji (poza LOT/SN/expiry),
- osobna kolumna SN na pozycji dokumentu RW.
