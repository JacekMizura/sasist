# Tryb Produkcji — przegląd biznesowy (PM)

**Dokument:** skrócona specyfikacja funkcjonalna dla Product Managera  
**Źródło:** pełny dokument „Tryb Produkcji” (Sasist)  
**Data:** 2026-08-16  

---

## Dwa główne flow

**NA ZAPAS**  
Planowanie → Zlecenie / Partia → Pobranie → RW → Produkcja → PW → Rozlokowanie → Stan magazynowy

**POD ZAMÓWIENIE**  
Zamówienie → Zlecenie produkcyjne → Pobranie → RW → Produkcja → Bufor → Pakowanie / Auto-pack

---

## 1. Cel modułu

Moduł **Produkcja** wytwarza wyroby gotowe z komponentów według receptury, z pełną kontrolą magazynową i operacyjną.

**Rozwiązuje:** kontrolę składu (BOM), produkcję pod popyt i na zapas, realizację WMS (pobranie → produkcja → przyjęcie → rozlokowanie lub pakowanie), identyfikowalność wyrobu oraz koszt materiałowy (szacunek i rzeczywisty po zużyciu).

| Warstwa | Rola |
|---|---|
| ERP Produkcja | Receptury, zlecenia, partie, planowanie, braki, historia, koszty, konfiguracja |
| WMS Produkcja | Pobieranie komponentów i rejestracja produkcji |
| WMS Rozlokowanie | Przyjęcie wyrobu z produkcji na zapas |
| WMS Pakowanie | Obsługa zamówień po produkcji pod zamówienie (opcjonalnie auto-pack) |

---

## 2. Modele produkcji

### Produkcja na zapas

Dotyczy **partii (BAT)** oraz zleceń planistycznych / ręcznych.

Utworzenie → sprawdzenie materiałów (opcjonalna rezerwacja) → pobranie → **RW** → rejestracja produkcji (możliwa częściowa) → **PW** → **Rozlokowanie** → stan dostępny.  
Operator rozlokowania pracuje na dokumencie PW.

### Produkcja pod zamówienie

Uruchamia się, gdy zamówienie wejdzie w **status wejściowy** z konfiguratora.

**Ograniczenie v1:** automatyczne zlecenie powstaje domyślnie dla zamówień **jednopozycyjnych**.

Zlecenie powiązane z zamówieniem → walidacja materiałów (OK albo braki) → pobranie → RW → produkcja → **lokalizacja buforowa** (bez klasycznej kolejki Rozlokowania) → status po wyprodukowaniu → **Pakowanie** albo **auto-pack**. Stan bufora schodzi przy zakończeniu pakowania.

Kilka zamówień tego samego produktu, magazynu i konfiguracji może być agregowanych w jedno zlecenie (dopóki nie wystartowało). Wyprodukowane sztuki są przypisywane do zamówień według priorytetu / starszeństwa.

### Auto-pack

Dla zestawu zamówień właśnie gotowych po produkcji: jeśli **wszystkie** mają już list przewozowy — automatyczne zakończenie pakowania; jeśli choć jedno nie ma — standardowe Pakowanie. Przy mieszance listów w jednym zestawie auto-pack nie startuje. Istniejący list nie jest generowany ponownie; druk tylko gdy włączony w ustawieniach Pakowania.

---

## 3. Receptury

Receptura = lista komponentów z ilościami na jednostkę wyrobu.

Dostępna na liście receptur, karcie receptury i zakładce Produkcja na karcie produktu. System utrzymuje aktywną wersję używaną przy planowaniu i zleceniach oraz liczy, ile wyrobu da się wytworzyć z dostępnych komponentów.

**Szacowany koszt** receptury = suma (cena zakupu netto komponentu × ilość).  
**Rzeczywisty koszt** powstaje po zużyciu materiałów (sekcja 8).

---

## 4. Planowanie i automatyczne uzupełnianie

### Cel
Pokazać, ile wyprodukować, żeby pokryć otwarte zamówienia i utrzymać zapas na zadany horyzont.

### Co uwzględnia
sprzedaż historyczną, otwarte zamówienia, aktualny stan, produkcję w toku, docelowe pokrycie zapasu, parametry produktu (min/max, MOQ, wielokrotność) oraz dostępność komponentów.

### Jak powstaje rekomendacja
Średnia dzienna ze sprzedaży historycznej → cel zapasu (średnia × dni pokrycia) → osobno popyt z otwartych zamówień → potrzeba łączna = zamówienia + cel − stan − produkcja w toku → zaokrąglenie do MOQ / wielokrotności i limit materiałów → priorytet.

### Strategie prognozy
| Strategia | Znaczenie |
|---|---|
| Standardowa | Równa średnia z okresu |
| Uwzględniaj trend | Nowsze dni mają większą wagę |
| Według dni tygodnia | Średnia z odpowiadających dni tygodnia |

Planista: rekomendacje → symulacja → utworzenie **partii BAT**.

### Automatyczne uzupełnianie
Włączenie, pokrycie (1/3/7/14 dni), częstotliwość. Tworzy wyłącznie **zlecenia planistyczne** (nie partie BAT). Najpierw obsługa braków pod zamówienia, potem nadprodukcja na zapas.

---

## 5. Realizacja w WMS

**Pobranie** — kolejka zleceń, komponenty z lokalizacjami, potwierdzenie ilości → po domknięciu **RW** → faza produkcji.  
System obsługuje pobieranie z wielu partii magazynowych; RW zachowuje informację o faktycznie wykorzystanych partiach.

**Produkcja** — rejestracja ilości (także częściowa); gdy wymagane — LOT / SN / data ważności wyrobu.  
Na zapas → PW → Rozlokowanie. Pod zamówienie → bufor → Pakowanie / auto-pack.

Dostępny tryb **wydruku zlecenia** zamiast pełnego terminala WMS.

---

## 6. Rezerwacje i braki

**Rezerwacje** — przy wejściu zamówienia / zleceniu planistycznym / opcjonalnie przy partii. Strategie zejścia ze stanu: **FEFO** (domyślna), **FIFO**, **LIFO**. Start pobierania blokuje rezerwację; koniec ją zużywa i tworzy RW.

**Braki** — analiza materiałów; przy zamówieniach status braku komponentów; po uzupełnieniu możliwe wznowienie. Z braków — most do zapotrzebowania zakupowego.

---

## 7. Identyfikowalność

Ustawienia magazynu (wyłączona / włączona; wymagaj LOT, SN, daty ważności) oraz override na produkcie.  
Dane **wyrobu** zbierane przy rejestracji produkcji. Przy pobieraniu komponentów system obsługuje wybór partii; LOT/SN mogą być wymagane polityką produktu / magazynu.

---

## 8. Dokumenty i koszt

| Dokument | Kiedy | Znaczenie |
|---|---|---|
| **RW** | Koniec pobrania | Zużycie komponentów |
| **PW** | Koniec produkcji (na zapas) | Przyjęcie → Rozlokowanie |
| **PW buforowe** | Produkcja pod zamówienie | Przyjęcie na bufor → pakowanie |

Dodatkowo: wydruk karty produkcyjnej i listy pobrania materiałów.

**Koszt:** rzeczywisty koszt produkcji wynika z kosztu faktycznie zużytych materiałów. Cena pobierana jest z dokumentu przyjęcia danej partii / zapasu; jeśli nie da się jej ustalić — z ceny zakupu na karcie produktu. Przy kilku dostawach koszt liczony jest osobno dla każdej części i podąża za faktycznie pobranym zapasem. Po zużyciu koszt jest zamrażany historycznie. To koszt materiałowy — nie pełny controlling z narzutami.

---

## 9. Najważniejsze ustawienia i integracje

**Konfigurator produkcji:** status wejściowy, status oczekiwania, status przy braku komponentów, status po wyprodukowaniu, lokalizacja buforowa, sposób realizacji (WMS / wydruk), akcja po produkcji (zmień status / przejdź do pakowania). Status wejściowy nie może kolidować z inną konfiguracją produkcji ani ze zbieraniem.

**Ponadto:** strategia i okres prognozy, auto-uzupełnianie, strategia rezerwacji, identyfikowalność, wygląd terminala, szablony dokumentów.

**Łączy się z:** Produktami, Zamówieniami, Magazynem, Rozlokowaniem, Pakowaniem i Zakupami (most z braków).

---

## 10. Zakres v1 i poza v1

### W v1
Oba modele (na zapas i pod zamówienie), receptury, planowanie (3 strategie), auto-uzupełnianie, zlecenia i partie, rezerwacje, braki, most do zakupów, terminal WMS (pobranie i produkcja, także częściowa), RW/PW, identyfikowalność, rzeczywisty koszt materiałów, konfigurator, pulpit / historia / koszty, Pakowanie i auto-pack, przypisanie operatora do zlecenia.

**Powierzchnie:** ERP Produkcja, WMS Produkcja, WMS Rozlokowanie, WMS Pakowanie.

### Poza v1
Gantt i rozbudowane raporty zarządcze; ekskluzywna kolejka tylko dla przypisanego operatora + push; zwrot niewykorzystanych komponentów jako osobny etap; pełne wersjonowanie receptur jak PLM; automatyczna produkcja z zamówień wielopozycyjnych; osobny terminal rozlokowania produkcji równoległy do PW; automatyczny workflow zamienników materiałów; granularne uprawnienia produkcji poza trybem WMS; wymagania QC / data produkcji (poza LOT/SN/expiry).
