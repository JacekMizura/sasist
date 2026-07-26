# Information Architecture (IA)

Obowiązujące zasady nawigacji i routingu aplikacji Sasist (ERP + WMS).

Źródło konfiguracji menu: `frontend/src/layout/mainNavConfig.tsx`.  
Źródło routingu: `frontend/src/App.tsx`.

**Status:** audyt IA zakończony (2026-07). Dalsze zmiany w strukturze menu wynikają wyłącznie z nowych wymagań biznesowych — nie z ponownego porządkowania istniejącej architektury.

---

## 1. Założenia

- **Jeden moduł = jedno miejsce w menu.** Użytkownik nie powinien mieć dwóch pozycji nawigacji prowadzących do tego samego ekranu.
- **Jeden moduł = jeden kanoniczny route.** Aliasów URL nie dodaje się „na zapas”.
- **Legacy route** mogą istnieć wyłącznie jako:
  - **redirect** do ścieżki kanonicznej, albo
  - **techniczny endpoint** (np. render HTML pod Puppeteer) bez pozycji w menu.
- **Brak dual-entry:** dwa różne wejścia menu do tego samego ekranu są błędem IA.

Świadomy wyjątek: **ERP vs WMS** to dwie powierzchnie operacyjne (biuro vs terminal). Te same słowa (np. „Produkcja”, „Inwentaryzacja”) mogą oznaczać **różne** ekrany i różne role użytkownika — to nie jest duplikat jednego modułu.

---

## 2. Struktura głównego menu

Sidebar ERP grupuje kategorie w **Sprzedaż** i **Operacje**. Na dole: CTA **Przejdź do WMS** → `/wms/menu`.

### Dashboard

- **Rola:** strona startowa / podsumowanie operacyjne.
- **Wejście:** logo / `/` → `/dashboard` (nie wymaga osobnej pozycji we flyoucie).

### Zamówienia

- **Rola:** lista zamówień, zwroty (ERP), dodatkowe pola, reklamacje, akcje automatyczne.
- **Wejście:** Sprzedaż → Zamówienia.

### Klienci

- **Rola:** kartoteka klientów.
- **Wejście:** Sprzedaż → Klienci.

### Asortyment (Produkty i powiązane)

- **Rola:** produkty, zestawy, producenci, dostawcy, zamówienia towaru, materiały magazynowe, rentowność oraz **zarządzanie produkcją ERP** (`/production`).
- **Wejście:** Sprzedaż → Asortyment.
- Produkcja ERP ≠ wykonanie produkcji w WMS (`/wms/production/…`).

### Dokumenty

- **Rola:** dokumenty sprzedażowe, korekty, dokumenty magazynowe, serie, eksporty dokumentów.
- **Wejście:** Sprzedaż → Dokumenty.
- Szablony PDF dokumentów (Twig/HTML) są w **Ustawieniach**, nie w hubie dokumentów.

### Zakupy i planowanie

- **Rola:** pulpit zakupów, plan, zamówienia zakupowe, ocena dostawców (zakładki in-module).
- **Wejście:** Operacje → Zakupy i planowanie → `/purchasing/dashboard`.

### Magazyn

- **Rola:** projektant magazynu, regały / wózki / strefy / nośniki, inwentaryzacja ERP, planer floty, BDO, **szkody i protokoły szkód** (procesy magazynowe).
- **Wejście:** Operacje → Magazyn (side flyout).

### Szablony

- **Rola:** hub wszystkich szablonów — etykiety, wydruki dokumentów, wiadomości, eksporty.
- **Wejście:** Operacje → **Szablony** → **`/templates`** (jedyny wpis w menu).
- **Sekcje (tabs):** `/templates/labels`, `/templates/print`, `/templates/messages`, `/templates/exports`.

### Analiza

- **Rola:** dashboard analityczny, wskaźniki magazynowe, symulacje, optymalizacja, mapy, centrum operacyjne.
- **Wejście:** Operacje → Analiza.

### WMS

- **Rola:** terminal operacyjny (przyjęcie, rozlokowanie, kompletacja, pakowanie, braki, produkcja — wykonanie, inwentaryzacja terminalowa, itd.).
- **Wejście:** CTA **Przejdź do WMS** → launcher `/wms/menu` (kafelki modułów).
- Osobno: **Ustawienia WMS** → `/settings/wms` (konfiguracja, nie operacje).

### Ustawienia

- **Rola:** wyłącznie konfiguracja systemu i integracji (patrz §3).
- **Wejście:** Operacje → Ustawienia (side flyout).

---

## 3. Zasady dla Ustawień

W **Ustawieniach** znajdują się wyłącznie elementy **konfiguracyjne** i administracyjne.

Przykłady (kolejność zgodna z flyoutem):

| Pozycja | Route (kanoniczny) |
|---------|-------------------|
| Ogólne | `/settings/company` |
| Użytkownicy | `/settings/administrators` |
| Integracje | `/settings/integrations` |
| Klucze API | `/settings/api-keys` |
| Import | `/settings/import` |
| Metody dostawy | `/settings/shipping-methods` |
| Pule stanów | `/settings/sales/stock-pools` |
| Drukarki | `/settings/printers` |
| System | `/system` |
| Słownik aplikacji | `/system/labels` (super-role) |

**Nie należy** umieszczać w Ustawieniach pełnych hubów szablonów (etykiety, wydruki, wiadomości, eksporty) — te żyją w **Operacje → Szablony**.  
**Drukarki** = infrastruktura druku; **Szablony etykiet** = projektowanie etykiet (w hubie Szablony).

---

## 4. Kanoniczne moduły (kluczowe decyzje)

| Moduł | Kanoniczny route | Uwagi |
|-------|------------------|--------|
| Szablony (hub) | `/templates` | Jedyny wpis menu. Tabs: etykiety / wydruki / wiadomości / eksporty. |
| Szablony etykiet | `/templates/labels` | Ten sam komponent `LabelSystem`. |
| Szablony wydruków | `/templates/print` | Dokumenty PDF/Twig. |
| Szablony wiadomości | `/templates/messages` | Komunikacja. |
| Eksporty | `/templates/exports` | Szablony eksportu CSV. |
| Drukarki | `/settings/printers` | Agenci / urządzenia / kolejka. |
| Słownik aplikacji | `/system/labels` | **Nie** mylić z `/templates/labels`. |

### Aliasy historyczne (tylko kompatybilność)

| Alias | Zachowanie |
|-------|------------|
| `/labels/*` | Redirect → `/templates/labels/*` |
| `/admin/print-templates/*` | Redirect → `/templates/labels/*` |
| `/system-etykiet/*` | Redirect → `/templates/labels/*` |
| `/administration/templates/prints/*` | Redirect → `/templates/labels/*` |
| `/settings/document-templates/*` | Redirect → `/templates/print/*` |
| `/admin/message-templates/*` | Redirect → `/templates/messages/*` |
| `/settings/exports/*` | Redirect → `/templates/exports/*` |
| `/designer` ≡ `/warehouse-designer` | Ten sam ekran (dwa URL; kanon: `/designer` w menu) |
| `/analysis/*`, `/analiza/*` | Redirect → `/analytics/*` |

Nowe aliasy wymagają uzasadnienia (bookmarki zewnętrzne, migracja URL) — nie dodawać „na wszelki wypadek”.

---

## 5. Legacy i route techniczne

| Route / obszar | Status | Dlaczego nadal istnieje |
|----------------|--------|-------------------------|
| `/inventory` | LEGACY (lista stanów) | Diagnostyka / bookmarki; **nie** jest Inwentaryzacją (`/inventory-count`). Poza menu. API `GET /inventory/` pozostaje SSOT dla Designera. |
| `/barcode-management` | DELETE_CANDIDATE | Zastąpiony Systemem Etykiet; poza menu; plik do osobnego PR cleanup. |
| `/waves` | Redirect → `/wms/picking` | UI stub ukryty; backend waves bez zmian. |
| `/planning/deliveries`, `/planning/list` | Redirect → `/purchasing/dashboard` | Placeholdery usunięte z UX. |
| `/documents/custom-fields`, `/documents/field-templates` | Redirect → `/orders/custom-fields` | Jedna kanoniczna ścieżka pól zamówień. |
| `/documents/ksef` | Redirect → `/documents/series` | Brak integracji MF; UI ukryty (`DocumentsPlaceholderPage` zachowany na przyszłość). |
| `/report/warehouse-structure`, `/report/product-locations` | Techniczne | Target HTML dla Puppeteer PDF z Designera — **nie** do menu, **nie** usuwać. |
| Pliki stubów (`PickingWaves`, `PlanningPlaceholder`, …) | Niezamontowane / oznaczone | Zachowane do świadomego cleanup PR; nie przywracać do menu. |

---

## 6. Zasady na przyszłość

Przy dodawaniu funkcjonalności:

1. **Nie twórz drugiego wejścia menu** do istniejącego modułu — rozszerzaj hub, zakładki in-module lub deep-link z kontekstu.
2. **Nie dodawaj nowych aliasów URL** bez uzasadnienia (migracja, zewnętrzne bookmarki). Preferuj jeden kanon + redirect.
3. **Każda nowa pozycja menu** musi mieć uzasadnienie biznesowe (rola użytkownika, częstotliwość, odrębny produkt).
4. **Moduły eksperymentalne, placeholdery i stuby** nie mogą być widoczne w menu ani jako „puste” ekrany — ukryj (redirect) lub nie rejestruj w nawigacji.
5. **Ustawienia = konfiguracja.** Operacje użytkownika końcowego → Sprzedaż / Operacje / WMS.
6. Przed zmianą IA sprawdź: czy to nie tworzy nowego silnika lifecycle / równoległej „prawdy” (patrz reguły WMS stabilization) — IA dotyczy nawigacji, nie logiki domenowej.

### Zamknięcie audytu

Audyt Information Architecture został **zakończony**. Od tego momentu zmiany w strukturze menu i kanonicznych route powinny wynikać **wyłącznie z nowych wymagań biznesowych**, a nie z dalszego porządkowania istniejącej architektury.

Techniczny cleanup plików oznaczonych `DELETE_CANDIDATE` / niezamontowanych stubów jest osobnym PR i **nie** jest reorganizacją IA.
