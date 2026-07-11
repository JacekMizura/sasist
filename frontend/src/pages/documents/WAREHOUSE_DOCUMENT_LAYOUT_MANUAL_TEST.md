# Test manualny — layout dokumentów magazynowych

Moduł: **Dokumenty → Dokumenty magazynowe** (`/documents/warehouse/:docSegment`)

Typy: **MM, PZ, PW, RW, WZ, ZD, Z-PZ**

Środowisko: Chrome/Edge, zalogowany użytkownik z aktywnym magazynem i seriami dokumentów.

---

## Przygotowanie

- [ ] Magazyn aktywny w nagłówku
- [ ] Serie MM/PZ/PW/RW/WZ/ZD/Z-PZ skonfigurowane (co najmniej po 1 dokumencie testowym na typ, jeśli możliwe)
- [ ] DevTools → zakładka Network (opcjonalnie, do weryfikacji braku regresji API)
- [ ] DevTools → toggle device toolbar **wyłączony** na start (testy zoom osobno)

---

## Matryca typów dokumentów

Dla każdego typu powtórz sekcje A–F.

| Typ | URL listy | Deep link `?id=` | Modal / strona |
|-----|-----------|------------------|----------------|
| MM | `/documents/warehouse/mm` | `/documents/warehouse/mm?id={id}` | Modal |
| PZ | `/documents/warehouse/pz` | `/documents/warehouse/pz?id={id}` | Modal |
| PW | `/documents/warehouse/pw` | … | Modal |
| RW | `/documents/warehouse/rw` | … | Modal |
| WZ | `/documents/warehouse/wz` | … | Modal |
| ZD | `/documents/warehouse/zd` | … | Modal |
| Z-PZ | `/documents/warehouse/z-pz` | `/documents/warehouse/z-pz?id={id}` | **Strona pełna** (nie modal) |

---

## A. Otwarcie z listy

1. Wejdź na listę typu (np. `/documents/warehouse/pz`).
2. Kliknij wiersz dokumentu.

**Oczekiwane:**
- [ ] Sidebar **MAGAZYN** (MM, PZ, …) **nie nachodzi** na treść ani modal
- [ ] Modal/strona dokumentu nad całym UI (sidebar modułu przyciemniony za overlayem modala)
- [ ] Nagłówek dokumentu, tabela pozycji i stopka mają **tę samą szerokość** kolumny treści
- [ ] Brak poziomego scrollbara na **całej stronie** (tylko wewnątrz tabeli, jeśli wiele kolumn)

---

## B. Odświeżenie z `?id=`

1. Otwórz dokument (modal lub Z-PZ).
2. Skopiuj URL z `?id=`.
3. Odśwież stronę (F5).

**Oczekiwane:**
- [ ] Dokument wczytuje się ponownie (modal auto-open / Z-PZ detail)
- [ ] Layout bez nakładania sidebara
- [ ] Brak błędu w konsoli związanego z layoutem

---

## C. Zamknięcie ESC

**Modal (MM–ZD):**
1. Otwórz dokument.
2. Naciśnij **Esc**.

**Oczekiwane:**
- [ ] Modal zamyka się, wraca lista
- [ ] Esc **nie** zamyka modala gdy otwarte: menu druku, menu akcji linii, drawer szczegółów, dialog różnicy dostawy, drawer blokady sprzedaży (najpierw zamyka overlay)

**Z-PZ:**
1. Otwórz `/documents/warehouse/z-pz?id={id}`.
2. **Zamknij** przyciskiem (brak globalnego ESC na stronie pełnej — OK).

---

## D. Przewijanie tabeli

1. Otwórz dokument z ≥5 pozycjami.
2. Przewiń tabelę w dół.

**Oczekiwane:**
- [ ] **Sticky header** tabeli (`thead`) pozostaje widoczny w obszarze scroll
- [ ] **Stopka akcji** (Zamknij, Duplikuj, Zaksięguj…) **nie przewija się** — stała na dole modala
- [ ] Panel podsumowania pozycji (jeśli widoczny) scrolluje się z tabelą lub jest pod tabelą zgodnie z UX

---

## E. Zoom przeglądarki

Powtórz **A + D** przy zoom:

- [ ] **80%**
- [ ] **100%**
- [ ] **125%**
- [ ] **150%**

**Oczekiwane:** sidebar modułu nie nachodzi; ewentualny scroll poziomy **tylko** w kontenerze tabeli.

---

## F. Szerokość okna

Powtórz **A + D** przy:

- [ ] **1366×768** (DevTools responsive)
- [ ] **1920×1080**

**Oczekiwane:**
- [ ] Układ dwukolumnowy sidebar 200px + treść od `sm` (≥640px)
- [ ] Na wąskim ekranie (<640px): sidebar typów w pasku na dole, treść na pełną szerokość

---

## G. Overlaye w modalu (PZ z pozycjami)

Tylko jeśli dane testowe pozwalają:

| Element | Jak otworzyć | Oczekiwane |
|---------|--------------|------------|
| Menu druku | Ikona drukarki w stopce | Menu **nad** modalem, nie ucięte |
| Menu akcji linii | ⋮ na pozycji PZ | Portal, widoczne w całości |
| Drawer szczegółów linii | Akcje → Szczegóły | Panel z prawej, z-index nad modalem |
| Dialog różnicy dostawy | Akcje → Zaakceptuj różnicę | Wyśrodkowany dialog nad modalem |
| Drawer blokady sprzedaży | Akcje → Dodaj blokadę | Panel z prawej nad modalem |
| Usuń dokument | Ikona kosza → potwierdzenie | Dialog nad modalem |

---

## H. Regresje layoutu — checklist końcowy

- [ ] Sidebar MAGAZYN **nigdy** nie nachodzi na modal ani tabelę
- [ ] Tabela **nie wychodzi** poza `DocumentContent` / panel modala
- [ ] **Brak** poziomego scrollbara na `<body>` / `<main>` modułu Dokumenty
- [ ] Sticky header tabeli działa
- [ ] Stopka dokumentu (shrink-0) zawsze widoczna na dole modala bez scrollowania całej strony

---

## Notatki z testu

| Data | Tester | Typ | Zoom | Szerokość | Wynik | Uwagi |
|------|--------|-----|------|-----------|-------|-------|
| | | | | | | |
