# Change log

## 2026-06-08 — Klienci CRM: typ / kanał / flagi (architektura ERP)

- **`customer_type`:** tylko `retail`, `company`, `wholesale` (usunięto `marketplace`, `b2b` z enum)
- **Nowe `sales_channel`:** store, ecommerce, allegro, amazon, phone, b2b_portal, marketplace_other
- **`flags_json`:** + `requires_invoice`, `marketplace` (VIP/blokada/priorytet osobno)
- **Migracja idempotentna:** `b2b`→`wholesale`+`b2b_portal`, `marketplace`→`retail`+flag+`marketplace_other`
- **Frontend:** select typu (3 opcje), kanał sprzedaży, badge VIP/Zablokowany/Marketplace/Priorytet, filtry i kolumny listy

## 2026-06-08 — Schema sync: NOT NULL ADD COLUMN na PostgreSQL (customers CRM)

- **Przyczyna:** reconcile robił `ADD COLUMN … NOT NULL` na tabeli z danymi → `NotNullViolation` na Railway
- **Fix (`schema_introspection.py`):** nullable ADD → `UPDATE` backfill (`customer_type=retail`, `customer_status=active`) → `ALTER COLUMN SET NOT NULL`
- **Guards:** indeksy/FK pomijane gdy kolumna indeksu nie istnieje w DB; `failed_columns` przy błędzie ADD
- **Testy:** `backend/tests/test_customer_crm_schema_sync.py`

## 2026-06-08 — Klienci + zamówienia: 500 (schema CRM + logging)

- **Przyczyna:** brak kolumn CRM na `customers` w PostgreSQL → `OperationalError: no such column: customers.customer_type`
- **Order detail:** ten sam błąd przy `db.query(Customer)` gdy zamówienie ma `customer_id`
- **Fix:** `ensure_customer_crm_schema` + `verify_customer_schema_columns` w **blocking** `_bootstrap_tier0_platform_schema` (przed HTTP)
- **Logging:** `[customers.list] failed`, `[orders.detail] failed`, `[orders.detail] customer brief failed`
- **Safe fallback:** agregaty `customer_sales_stats` / `summary_out` — lista nie pada gdy analytics niedostępne
- **Order customer brief:** try/except — zamówienie zwraca 200 bez `customer` gdy query klienta pada (z logiem)

## 2026-06-08 — Klienci: naprawa GET /api/customers (500)
- **Przyczyna:** ORM miał kolumny CRM (`customer_type`, `customer_status`, `flags_json`, …) bez migracji DB → `OperationalError: no such column`
- **`backend/db/customer_schema.py`:** `ensure_customer_crm_schema()` — ADD COLUMN + CREATE TABLE (`customer_notes`, `customer_crm_events`) via `ensure_model_schema_sync`
- **`main.py`:** sync przy imporcie + w `upgrade_schema_background`
- **`customers.py`:** `logger.exception("[customers.list] failed tenant_id=%s")`
- Frontend: skeleton ładowania + retry przy błędzie listy
- Testy: `backend/tests/test_customers_list_api.py`

## 2026-06-08 — Wózki / nośniki: UI operacyjny WMS (frontend only)
- Wózki standardowe (`BulkCartEditor`): usunięte taby, jeden widok (dane, wymiary, pojemność, operacje, zdjęcie)
- Tokeny modułu: większe fonty (15–16px), badge, koszyki w edytorze wózków z koszykami
- Nośniki: `CarrierIdentity` (kod + nazwa + opis, bez duplikatu barcode), `CarrierContentPreview` (popover zawartości), `CarrierLocationLink` (badge lokalizacji)
- Lista nośników: tabela desktop + kafle mobile; statusy PL w modalach; prefiksy PAL/BOX/BIN z kolorem i typem
- Szczegóły nośnika: kompaktowy header operacyjny, produkty + historia + ostatnia operacja bez tabów ProductLike
- Etykiety: PUTAWAY → „Odkładanie”, ARCHIVED → „Archiwalny”

## 2026-06-08 — Klienci: CRM profile (typ, status, flagi, VIP/blokada, agregaty)
- Model `customers`: `customer_type`, `customer_status`, `flags_json`, pola hurtowe (limit, termin, opiekun)
- Tabela `customer_crm_events` — timeline (VIP, blokada, zmiana typu/statusu)
- API: `PATCH /customers/{id}/crm`, `POST /customers/{id}/crm/actions` (mark_vip, block, …)
- Lista klientów: typ, status, flagi, `order_count`, `total_gross` (batch stats)
- Detail: `summary` z KPI; self-heal agregatów gdy `order_count=0` ale są zamówienia
- Stats: pomijanie anulowanych/draftów; refresh po complete direct sale
- Blokada: guard w `set_session_customer` → 403 „Klient jest zablokowany”
- Frontend: header CRM (back inline, badge VIP/Blokada, tylko menu „Więcej”), summary strip, picker z KPI, form hurtowy

## 2026-06-08 — Direct sales: naprawa DELETE pozycji koszyka (500)
- Nowy `line_delete_service.py`: lookup linii z DB, bezpieczne zwolnienie rezerwacji, activity event non-blocking
- Endpoint `DELETE .../lines/{line_id}`: commit → `get_session` (fresh lines) → `_session_to_read`; pełny `logger.exception` przy 500
- `_session_to_read` / `enrich_session_lines`: pomijanie linii bez `product_id`, per-line try/except na financials
- PATCH qty=0: ten sam reload sesji po commit
- Frontend: `removingLineId` (loading tylko na usuwanej pozycji), toast przy błędzie
- Testy: `backend/tests/test_direct_sale_line_delete.py` (5 cases)

## 2026-06-08 — Klienci: CRM-lite etap 1–2 (order-link, aktywność, notatki)
- Backend: `customer_order_link_service` — podgląd/utworzenie/połączenie klienta z zamówienia + wykrywanie duplikatów (email, telefon, NIP, nazwa)
- Endpointy: `GET/POST /api/customers/order-link/{preview,create,link}`
- Backend: `customer_notes`, `customer_activity_service`, `customer_note_service` — timeline (zamówienia + notatki), CRUD notatek (pin, soft delete)
- Endpointy: `/api/customers/{id}/activity`, `/api/customers/{id}/notes`
- Historia zakupów KPI: obrót 30/90/365 dni, największe zamówienie (`purchase_history_service`)
- Frontend: `OrderCustomerLinkPanel` w `OrderDetailPage` (badge „Klient niezapisany”), `getCustomerDisplayName` na linku klienta
- Frontend: zakładka „Aktywność”, `CustomerNotesSection`, `CustomerQuickActions`, rozszerzone KPI historii
- **Następne etapy:** tagi/segmenty, merge duplikatów, wiele adresów, pełniejszy timeline (FV, zwroty, GUS)

## 2026-06-08 — Klienci: spójna nazwa + direct sales refresh
- `getCustomerDisplayName()` — lista, detail, historia, direct sales (FV)
- Direct sales: pełna sesja z `set-customer`, eager fetch klienta, auto-uzupełnianie formularza FV
- Naprawa UI: przypisany klient widoczny od razu (bez błędnego `customer_is_retail` w stanie)

## 2026-06-08 — Schema reconciliation: startup crash fix
- `log_schema_tier()` — kwargs-safe (`columns_added`, `indexes_added`, `foreign_keys_added`, …)
- Reconcile fazowy: tabele → kolumny → indeksy → FK (ostatni etap)
- Orphan FK: NULL przed ADD CONSTRAINT (np. `direct_sale_sessions.customer_id`)
- Topological sort fallback przy cyklach FK (zamiast `sorted_tables` crash/warn)

## 2026-06-08 — Klienci: utwardzenie GUS/BIR + VAT MF/VIES
- Backend: `customers_gus.py`, cache PostgreSQL `gus_lookup_cache` (TTL 24h), timeout/retry/circuit breaker BIR
- VAT badge tylko z MF (`rejestr_vat`) i VIES — rozdzielone od danych firmy GUS
- Normalizacja adresów (title case PL, kod pocztowy, ulica/nr)
- Frontend: `customersGusApi.ts`, brak auto-fetch przy wejściu na klienta; debounce 900 ms + przycisk „Pobierz z GUS”
- Admin: „Nadpisz istniejące” z potwierdzeniem; panel: `fetched_label`, źródło danych
- Logi strukturalne: nip, tenant_id, cache hit/miss, czas, source (bez pełnych danych firmy)

## 2026-06-08 — Klienci: naprawa routerów + layout
- Purchase history + GUS scalone w `customers_router` (jeden mount `/api/customers`)
- GUS: `POST /api/customers/gus-lookup` (usunięto `/clients`)
- Frontend: `CustomerDetailPageShell` (PageLayout + PageHeader jak lista klientów)
- KPI historii: kompaktowy skeleton + empty state bez dużych pustych kart

## 2026-06-08 — Klienci: integracja GUS (NIP)
- Backend: `POST /api/customers/gus-lookup` — proxy BIR1 GUS + MF VAT, cache 24h
- Frontend: pole NIP z „Pobierz z GUS”, debounce 900 ms, panel podglądu, „Uzupełnij dane” (tylko puste pola)
- Badge: Zweryfikowano w GUS, Aktywny VAT, VAT UE
- Env: `GUS_API_KEY`, opcjonalnie `GUS_USE_TEST=true` (środowisko testowe GUS)

## 2026-06-08 — Klienci: historia zakupów (CRM dashboard)
- Backend: tabele `customer_sales_stats`, `customer_product_stats`; lazy refresh (TTL 60 min)
- Endpointy: `/customers/{id}/purchase-history/{summary,documents,top-products,trend}` + filtry/paginacja
- Frontend: tab „Historia zakupów” (`/customers/:id/historia-zakupow`), KPI AppStatCard, filtry AppFilterPanel, tabela dokumentów, top produkty, wykres Recharts

## 2026-06-08 — PostgreSQL schema reconciliation (ORM startup sync)
- `schema_reconciliation.py`: pełna rekonsyliacja ORM vs DB (CREATE TABLE, ADD COLUMN, INDEX, FK)
- `sync_model_schema` / `ensure_model_schema_sync`: indeksy IF NOT EXISTS + brakujące FK
- Tier 0 bootstrap: `reconcile_startup_schema` na PostgreSQL i SQLite (nie tylko create_all)
- Tier 1 background: drugi przebieg reconcile po ensure_* operacyjnych
- `ensure_workforce_operational_tables` / `ensure_workforce_user_groups_schema`: ORM sync (naprawa `user_activity_logs.warehouse_id` na PG)
- main.py: workforce ensures w allowliście PostgreSQL

## 2026-06-08 — Wózki z koszykami: uproszczony UX edytora
- CartEditor: usunięto taby Podstawowe/Pojemność/Powiązania; meta w headerze + zwijane info techniczne
- CartSectionGrid: karty koszyków bez szarych teł; edycja w drawerze bocznym
- CartRowAddToolbar: kompaktowy pasek dodawania całego rzędu
- ProductLikePageLayout: `hideTabs`, `hideModeLabel` dla widoków jednoekranowych
- Logika API/zapisu bez zmian (capacity_mode nadal z payloadu istniejącego wózka)

## 2026-06-08 — Dokumenty magazynowe: nowy widok szczegółu (PZ/PW/RW/WZ/ZW/ZD)
- Wydzielono `WarehouseDocumentLinesSection`, `warehouseDocumentLineUi`, `WarehouseDocumentDetailFooter`
- Tabela pozycji: lekkie miniatury, skróty typu (LP/KART/MAT), badge statusów i LocationBadge
- Kolumny VAT %, cena/wartość brutto dla wszystkich typów dokumentów
- Podsumowanie: siatka AppStatCard (pozycje, ilości, różnica, netto/VAT/brutto)
- Footer: hierarchy z primary „Zaksięguj”, secondary akcje po lewej
- DocumentTypeBadge w nagłówku i karcie dokumentu (PW/ZD/ZW w palecie)

## 2026-06-08 — Struktura magazynu: layout jak karta produktu
- `modules/warehouse-structure/`: etykiety PL, CapacityModeFields, WarehouseEntityPageShell
- BulkCartEditor + CartEditor → ProductLikePageLayout (taby: Podstawowe, Pojemność/Sekcje, Operacje, Powiązania)
- CartSectionGrid: wizualny układ sekcji modułowych
- OrderProductPreviewModal: biały panel, linki do zamówienia/produktu
- WarehouseCarrierDetailPage → ProductLikePageLayout (Podstawowe, Zawartość, Historia)
- CarrierStatusBadge: polskie statusy (Aktywny zamiast ACTIVE)

## 2026-06-08 — Wózki / Regały / Strefy / Nośniki: UI spójne z ERP
- `CartsModuleLayout`: jedna biała powierzchnia + systemowe taby (jak Dokumenty)
- `modules/carts/cartsModuleTokens.ts`: dense inputs/buttons/tables
- Listy wózków: AppStatCard KPI, CartsListPageHeader, kompaktowe grupy
- Edytory bulk/multi: formularze ERP (bez rounded-2xl / gradientów)
- Regały/strefy: AppSection-style konfiguratory + AppEmptyState
- Nośniki: tabela dokumentów, prostsze badge, CarrierGroupCard dopasowany do grup wózków

## 2026-06-08 — ProductLikePageLayout: wspólny shell produkt + zestaw
- `components/catalog/`: ProductLikePageLayout, CatalogEntityPageShell, ProductLikeSection, tokens
- ProductEditModal + BundleEditModal na tym samym layoutcie (header, taby, rail, footer)
- ProductNewPage/EditPage + BundleNewPage/EditPage → CatalogEntityPageShell

## 2026-06-08 — Zestawy: pełna strona edycji + design system app-shell
- Trasy: `/bundles/new`, `/bundles/:id/edit` (bez modala tworzenia/edycji)
- `BundleEditModal variant="page"`: taby Podstawowe/Produkty/Magazyn/Historia/Logi/Powiązania
- `components/app-shell/`: AppFilterPanel, AppPageHeader, AppEmptyState, AppSection, AppStatCard, AppToolbar
- Filtry: akcje Filtruj/Wyczyść zawsze na dole panelu (ModuleListFiltersCard → AppFilterPanel)

## 2026-06-08 — Czas pracy: telemetria operacyjna całego systemu
- `track_user_activity()` + `session_id` / `warehouse_id` na `user_activity_logs` (gap 15 min)
- Middleware API: automatyczne logowanie mutacji + sensownych GET (mapowanie modułów)
- Analytics: heatmapa godzin, top moduły, aktywność dzienna, sesje, timeline, throughput
- API: `GET /workforce/analytics`; UI: przebudowany dashboard + strona aktywności
- Testy: `test_workforce_activity.py`

## 2026-06-08 — Inwentaryzacja ERP: WMS shell polish
- Layout: breadcrumb Magazyn/Inwentaryzacja, + zamiast dużego CTA, bez subtitle
- Tabela przebiegu: bez duplikatów Oczek./Policz./Różn., kolumny Operator/Czas, dense rows
- theme.ts: gęstsze paddingi, lżejsze bordery, slate tabs

- `resolve_line_unit_cost_net`: obsługa `line=None` (orphan RW), fallback ceny z kartoteki
- `_line_target_quantity`: używa zaakceptowanego wyniku supervisora zamiast pomijać linię
- `reconcile_line_counted_from_operators`: nie zeruje qty po ręcznym rozwiązaniu konfliktu
- Testy: `test_posting_preview.py` (6 scenariuszy)
- UI: przycisk „Wyślij do zatwierdzenia” → „Zatwierdź”

- Backend conflicts API: `ean`, `product_image_url` w `_build_conflict_item`
- Panel: karty zamiast tabeli ERP; miniatura 56×56, EAN, SKU; operator/ilość/akcje z hierarchią
- Status vs akcja: badge „Oczekuje ponownego liczenia”; button „Zleć ponowne liczenie” (1× na konflikt, tylko gdy `conflict_open`)

- `wmsLayoutTokens`: `WMS_TERMINAL_SHELL`, `WMS_TERMINAL_INNER`, `WMS_TASK_GRID`, `WMS_TASK_CARD`
- Braki: `WmsOrderIssuesHub` — left-aligned, grid 1/2/3, `BrakiOrderIssueCard` (accent strip, badges, CTA)
- Produkcja: layout + Collecting/Execute/Putaway — grid kolejki, kompaktowy `WmsTerminalEmptyState`, `WmsProductionActiveBatchBar`
- Wspólne: bez centrowania, bez wąskich wrapperów i kolorowych borderów całej karty

## 2026-06-09 — Dokumenty magazynowe: config-driven kolumny + RW/PW wartości
- Frontend: `warehouseDocumentConfigs.ts`, `WarehouseDocumentsTable.tsx` — osobne kolumny per PZ/PW/RW/WZ/MM/ZD/ZW; usunięte kolumny płatności
- Backend: `series` object, `resolve_document_financial_totals` dla RW/PW; persist totals przy posting inwentaryzacji
- Detail: ukryty dostawca gdy brak; sekcja „Źródło dokumentu” dla RW/PW; kompaktowe menu boczne

## 2026-06-09 — Konflikty inwentaryzacji: grouped API + accept bez recount
- Backend: `counts[]` z `count_id`, `conflict_status`, `quantity_diff_label`; `POST .../conflicts/accept` (supervisor wybiera istniejący wpis)
- `conflict_resolution_service`: metadata `operator_conflict_resolution` — konflikt znika bez tworzenia recount
- Frontend: tabela 1 wiersz = produkt+lokalizacja; operatorzy/ilości/czasy stacked; approve po `count_id`; recount tylko „Wymuś ponowne liczenie”
- Testy: `test_conflict_accept.py`, rozszerzenie `test_conflicts_endpoint.py`

## 2026-06-09 — Fix: pełna inwentaryzacja zeruje niepoliczone stany (FULL + update_stock)
- `full_inventory_posting_service.py`: plan księgowania target − live stock; zero dla uncounted/orphan scope
- PARTIAL/CYCLE/CONTROL bez zmian — tylko policzone linie
- Testy: `test_full_inventory_zeroing.py` (CASE 1–3)

## 2026-06-09 — WMS shell polish: topbar tabs, launcher command center, DnD
- Topbar: glass (`backdrop-blur`, `bg-white/90`), underline active tab (Linear-style), DnD reorder pinned
- Launcher: search + `/` shortcut, keyboard nav, pinned tiles drag-reorder (mobile: strzałki)
- Kafelki: subtelniejszy hover, mniejsze badge, ciaśniejszy spacing, `React.memo`

## 2026-06-09 — Fix: GET /inventory-count/documents/{id}/conflicts → 500
- Przyczyna: brak importu `list_document_conflicts` w `inventory_count.py` → NameError
- `conflict_detail_service`: batch load (lines/products/locations/carriers/recounts/operators), `_safe_float`, per-item try/except, logi skip/partial
- API: `logger.exception` + structured 500 detail; testy `test_conflicts_endpoint.py`
- Frontend: `conflictsError` + retry w panelu konfliktów (nie blokuje widoku dokumentu)

## 2026-06-09 — WMS launcher + topbar: przypinanie, biały UI
- Launcher: bez hero, bg-white, kafel z pinezką (pin/unpin), reorder ←/→ dla przypiętych
- Topbar: h-11, white, pills przypiętych modułów (środek), grid menu + magazyn (lewo)
- `finalTabs` = tylko pinned (localStorage per user); brak fallbacku na cały katalog
- Shell WMS: `bg-white` zamiast slate-100

## 2026-06-09 — Fix: inventory posting StockDocument(notes=…) TypeError
- Przyczyna: `adjustment_service` przekazywał `notes=` do `StockDocument` — pole nie istnieje w modelu
- Nowy `stock_document_factory.create_stock_document()` — walidacja kolumn ORM + log `STOCK_DOCUMENT_INVALID_KWARGS`
- Testy: `test_stock_document_factory.py`, `test_inventory_posting_integration.py` (PW, status, idempotency)

## 2026-06-08 — WMS launcher: enterprise module grid (rebuild)
- Usunięty terminal shell (`WmsHeader`, footer CE); launcher używa standardowego `WmsTopBar` jak reszta WMS
- Duże kafle (min ~185px): ikona, tytuł, opis, chipy statystyk (konflikty, aktywne, oczekujące)
- Grid 1/2/3/4 kolumn, max-width 1600px, slate-50 + white cards, hover elevation
- `useWmsLauncherBadges` → `metrics` per moduł (inwentaryzacja: konflikty + aktywne docs)

## 2026-06-08 — WMS inwentaryzacja: lista dokumentów jak PZ / Rozlokowanie
- `WmsInventoryDocumentList`: usunięty hero; pełna szerokość; scanner + grid jak Przyjęcie/Rozlokowanie PZ
- Karta: lewa (ikona, nr, status, operatorzy, konflikty, data), prawa (pokrycie, policzone), dół (progress bar)
- Skan/filtr dokumentu; integracja `useWmsScanner` + `useWmsPageScanHandler`

## 2026-06-08 — Fix: HTTP 500 przy księgowaniu RW/PW inwentaryzacji
- `posting_validation_service.py`: walidacja przed postem — reconcile operatorów (nigdy suma), snapshot linii `[POST INVENTORY] line snapshot` (cartons/carton_capacity/pieces/computed_total/delta), blokada absurdalnych qty, preflight stock RW
- `adjustment_service.py`: per-line try/except → `InventoryPostingFailedError` (FIFO ValueError zamiast surowego 500)
- API `POST .../post`: `posting_failed` → HTTP 422 ze szczegółami; nieoczekiwane błędy → traceback w `detail`
- Testy: `test_posting_validation.py`

## 2026-06-08 — WMS launcher: terminal operacyjny (kafelki modułów)
- Nowy widok `/wms/menu`: `WmsLauncherPage`, `WmsModuleTile`, `WmsHeader`
- Industrial UI: granatowy header, duże kafelki (≥140px), bez pinów/hover SaaS
- Badge z API: Braki, Zbieranie, Pakowanie, Przyjęcie, Rozlokowanie, Inwentaryzacja
- Nawigacja klawiaturą (strzałki, Enter), focus dla skanerów/kolektorów

## 2026-06-08 — Fix: eksplozja ilości WMS (multi-browser / stale state)
- Przyczyna: optimistic update + frontend liczył `quantity` (absolute) z lokalnej bazy; stale `packaging.loaded` w closure; effect re-dekomponował total przy każdej zmianie `counted_quantity`
- Skany: backend SSOT przez `delta` (+1 szt / +pack karton); UI aktualizuje się dopiero z `my_counted_quantity` z API
- Ręczna korekta: `quantity` (absolute) tylko po zapisie — bez optimistic
- Wyłączono optimistic; `applyServerQuantity` jako jedyny hydrator UI; `savingQty` blokuje double-submit
- Czyszczenie `localStorage` sesji lokalizacji po zakończeniu (`clearLocationSessionForTask`)
- Logi `[COUNT DEBUG]` frontend (console) + backend (`count_entry_service`)

## 2026-06-08 — Fix: stale lock przy księgowaniu inwentaryzacji (409 posting_in_progress)
- Lock w DB (`posting_in_progress`), nie Redis; brak cleanup po błędzie zostawiał dokument zablokowany
- Backend: `SELECT FOR UPDATE`, auto-clear orphan lock (`posting_in_progress=1` w DB = failed cleanup), `finally` + force unlock w osobnej transakcji
- Logi `[POST INVENTORY]`: start, acquire lock, transaction, rw/pw, commit, rollback, release lock
- Idempotency key ustawiany dopiero przed commitem (nie przy acquire lock)
- Frontend: ref guard double-submit, UUID idempotency key, loading na przycisku modala

## 2026-06-08 — Fix: eksplozja ilości kartonów (WMS inwentaryzacja)
- Przyczyna: total w szt. dekomponowany przy pack=1, potem ponownie mnożony po załadowaniu unitsPerCarton
- SSOT: cartons + pieces w UI; total tylko computed; API wysyła wyłącznie `quantity` (absolute pieces)
- Resync stanu po załadowaniu opakowania; refs zamiast stale closures
- Backend conflicts: skip lines bez product_id, NaN guard na quantity

## 2026-06-08 — Nowoczesny ekran logowania Sasist (SaaS)
- Split layout: ciemny branding + jasny formularz (`LoginBrandingPanel`, `LoginFormPanel`)
- `ProtectedRoute` — globalna ochrona tras; public: `/login`, `/wms-upload/*`
- Sesja: remember me (localStorage vs sessionStorage), last path redirect, auto refresh token, `auth:session-expired` event
- UX: show/hide password, caps lock, last email, inline errors, API status footer

## 2026-06-08 — Inventory counting UX: terminal + ERP progress
- WMS: optymistyczny licznik po skanie (`applyScanQty` przed API); baza qty z `my_counted_quantity`, nie globalnej sumy
- WMS: header produktu — większe zdjęcie, badge lokalizacji/nośnika (bez duplikatu w belce); konflikt tylko dla kierownika/superadmin
- WMS: kompaktowe liczniki; dolny pasek: Nieznany (warning), Wada (danger), Zakończ (primary)
- ERP tab „Przebieg liczenia”: osobny wiersz per operator przy konflikcie (`expandOperatorRows`)

## 2026-06-08 — ERP inventory: uproszczony przebieg liczenia (UI only)
- Usunięto kolumnę „Źródło stanu”; nośnik pod lokalizacją (`InventoryLocationStack`)
- Produkt: większe zdjęcie, nazwa/EAN/SKU; bez nośnika pod produktem
- Konflikty: POLICZ. pokazuje operatorów osobno (nie suma); badge „Konflikt liczenia”; akcje zatwierdź/recount (istniejące endpointy)
- Usunięto listę „Policzone w lokalizacji” → **Ostatnio policzone przeze mnie** (max 2 pozycje)
- Hero produktu: duże zdjęcie (bez ramek) → nazwa → EAN → lokalizacja → nośnik → kartony/sztuki/suma
- Nośnik przypisywany w kontekście produktu (nie w belce lokalizacji)
- Wada przeniesiona do dolnego paska: `[ Nieznany ] [ Wada ] [ Zakończ ]`
- Backend: liczenia operatorów **nie sumują się** (27 + 8 ≠ 35); konflikt → `line.counted_quantity = null`, wpisy per operator w `inventory_count_entries`
- API WMS: `scope=mine` na liniach, `my_counted_quantity` / `operator_count_conflict` na skanie

## 2026-06-08 — WMS inventory terminal UI (mockup-aligned)
- Presentation-only restyle of operator flow: document cards, location scan, product scan, qty modal
- New/updated `ui/wms/` components: `WmsInventoryLandingView`, `WmsInventoryProductDetailPanel`, mockup theme tokens
- Hooks, API, scan handlers, counting logic unchanged; ERP admin inventory untouched

## 2026-06-08 — Inventory UX: portal dropdown + draft delete
- Reports document picker renders via portal (`z-index: 10050`) — no clipping under sticky ERP chrome
- Draft documents deletable from list (trash action + confirm modal); `DELETE /inventory-count/documents/{id}` with status/session validation

## 2026-06-08 — ERP inventory layout unified with panel shell
- Replaced custom inventory shell (`max-w-[1600px]`, white full-page) with standard `PageLayout` + `SettingsModuleStack` (same as Producenci / Administratorzy)
- Module header: breadcrumbs, title, `TopTabsNavigation`, primary action in header
- Views use `moduleListPageShellClass`, `erpSurfaceCard`, `panelListDense*` table tokens

## 2026-06-08 — ERP inventory admin UI (mockup-aligned, presentation only)
- `ui/erp/theme.ts` — shared tokens: KPI cards, tables, indigo tabs, wizard steps, selection cards, scope box
- `InventoryLayout` — `PageLayout` + indigo tab nav (Pulpit / Dokumenty / Kreator / Raporty)
- Dashboard, documents list, wizard, reports — mockup layout on existing hooks/API
- `InventoryDocumentDetailView` — KPI grid, indigo detail tabs, table shell; approval/conflict/unknown panels unchanged logically
- `InventoryDocumentPicker` — optional `id` + `triggerClassName` for reports selector styling
- WMS inventory terminal untouched; no backend/API/hook changes

## 2026-06-08 — Inventory frontend UI architecture cleanup
- `docs/inventory-architecture.md` — flow maps, routes, persistence, risk files, orphaned legacy
- New `modules/inventoryCount/ui/erp/` + `ui/wms/` presentation layer (themes separated)
- God page split: `useInventoryDocumentDetail` + `InventoryDocumentDetailView`; `useWmsInventoryTerminalPage` + `WmsInventoryTerminalView`
- API split: `inventoryDocumentsApi`, `inventoryApprovalApi`, `inventoryConflictsApi`, `inventoryReportsApi`, `inventoryWmsApi`; barrel `inventoryCountApi.ts`
- Legacy WMS execution files archived to `frontend/_archive/inventory-count-legacy/`
- Deprecated shims at old `erp/components/` and `components/` paths for incremental import migration

## 2026-06-08 — WMS inventory document-scoped entry flow
- WMS `/wms/inventory-count` landing: active docs only (`in_progress`, `awaiting_approval`); drafts/approved/cancelled hidden
- Document cards: number, title, type, scope, progress, operators, conflicts, movement policy, last activity
- Routes: `/d/:documentId` (location scan), `/d/:documentId/count/:taskId` (terminal); legacy `/count/:taskId` redirects
- Sticky header switcher (`WmsInventoryDocumentSwitcher`); sessionStorage per warehouse for active document
- Empty state „Brak aktywnych inwentaryzacji”; „Utwórz dokument” gated by `inventory.submit`
- Backend: `GET /wms/inventory-count/active-documents` + `wms_active_documents_service`

## 2026-06-08 — Inventory start stability + movement enforcement + wizard UX
- **500 on start fixed**: missing `log_inventory_audit` import in `location_lock_service` (triggered when movement policy ≠ allow)
- Start returns structured errors: `scope_not_configured`, `scope_not_materialized`, `inventory_start_failed` (+ 500 fallback with code/details)
- `inventory_movement_guard_service`: real enforcement — picking complete, putaway, replenishment, pick routing suggestions
- Wizard: collapsible product/location pickers, tag chips, product thumbnails, zones hidden, richer summary + full server persist before start
- Partial scope operational impact copy; `formatInventoryRequestError` for start failures

## 2026-06-08 — Inventory operational polish (supervisor + WMS ergonomics)
- Approval safety modal: shortages/surpluses, unknown count, locations, RW/PW preview before submit/approve/post
- `posting_preview_service` + `GET .../posting-preview`; unresolved conflicts in preview
- Dedicated conflict panel: operators, qty, timestamps, carrier, recount state (`GET .../conflicts`)
- Unknown product supervisor resolution: map to catalog product or reject (`GET/POST unknown-products`)
- ERP detail: ops metadata bar (type, policies, warehouse, operators, started/last activity)
- Line table „Źródło stanu”: Na półce vs W nośniku
- WMS sticky context bar: LOKALIZACJA → NOŚNIK → PRODUKT always visible during counting
- Filter/tab state persisted in sessionStorage across Przebieg/Różnice/Kontrola
- KPI valuation tooltips (purchase net / snapshot / FIFO foundation)
- Wizard scope operational presets (bez EAN, ABC A, brak ruchu, nośniki, …)

## 2026-06-08 — Inventory UX production cleanup
- Submit-for-approval: only blocks empty doc, wrong status, operator recount conflicts (not partial count, differences, open WMS tasks)
- KPI: „Konflikty liczenia” + wartość nadwyżek/braków PLN (removed dead „Wpływ netto”)
- ERP tabs: filter toolbar on Przebieg / Różnice / Kontrola
- WMS: carrier hierarchy card (LOCATION → CARRIER → PRODUCTS)
- Editable document title + notes; scope preview API + wizard location/product pickers
- Wizard: 4 steps (removed fake Zadania step)

## 2026-06-08 — Inventory strategy simplification (operator-first config)
- Replaced snapshot/soft/hard with movement policies: allow_operations | block_picking | block_all
- Result policy: update_stock | count_only | report_only — post skips RW/PW for non-update modes
- Partial scope modes in wizard: zones, locations, products, categories, carriers, dynamic filters
- Materialization respects scope_mode + expanded filters; legacy lock_mode values normalized
- Wizard redesigned: Typ → Zakres → Ustawienia → Podsumowanie; removed recount_required checkbox
- Detail page shows operator settings; conditional „Zakończ bez korekt” vs „Księguj RW/PW”

## 2026-06-08 — Recount vs inventory variance (domain fix)
- Różnice expected≠counted → supervisor_review, NIE mandatory recount
- `recount_conflict_service`: recount tylko przy konflikcie operatorów (ten sam produkt/lokalizacja, różne ilości)
- `recount_state`: none | required | resolved na liniach; approval blokuje tylko nierozwiązane konflikty
- UI: „Różnica” vs „Wymaga ponownego liczenia” vs „Zweryfikowano”

## 2026-06-08 — WMS inwentaryzacja: location → carrier → product
- `wmsInventoryExecutionContext.ts` — locationContext, carrierContext, grouping, PAL-/BOX- detection
- Hook: auto-aktywacja lokalizacji po załadowaniu taska; carrier przez API; scan z carrier_id
- Backend: linie liczone per (location × product × carrier); `resolve-carrier`; task lines z carrier_code
- UI: `WmsInventoryActiveContextBar`, grupowana lista „Policzone w lokalizacji”

## 2026-06-08 — Submit approval: scoped inventory + Polish errors
- `approval_service`: PARTIAL/CYCLE/CONTROL skip full coverage; smarter WMS task blocking (only incomplete locations); projected recount gate; Polish block messages; rollback on recount failure
- Frontend: `formatInventoryRequestError`, toast + reload doc after failed submit; scoped types in `canSubmitInventoryDocument`

## 2026-06-08 — ERP inwentaryzacja: oś czasu Kontrola
- `inventoryAuditEventLabels.ts` — mapowanie zdarzeń audytu na polskie etykiety operacyjne + `buildInventoryAuditTimeline`
- `InventoryAuditPanel` — gęsta tabela ERP (operator, czas, operacja, produkt/EAN/miniatura, delta ilości); bez surowego JSON/kluczy
- Backend `audit_log_service` — wzbogacenie o `user_name`, `line_context`, `location_name`
- Usunięto redundantny link „← Lista dokumentów” z widoku szczegółów dokumentu

## 2026-06-04 — WMS production execution UI shell alignment
- `/wms/production/*` renders inside shared `WmsOperationalLayout` + `WmsTopBar` (removed hideProductionTopBar)
- Removed duplicate header from `WmsProductionExecutionLayout` (icon, TERMINAL WMS, mode title, Menu WMS)
- Removed extra amber „Prod. WMS” button from topbar — single „Produkcja — wykonanie” in module nav
- Workflow tabs only (Zbieranie / Wykonanie / Odłożenie) + `WMS_OPERATIONAL_CONTAINER` spacing
- Centered empty states via `WmsProductionTerminalEmptyState`

## 2026-06-04 — Production schema platform integrity
- Fail-fast `run_production_schema_startup_gate` (import + tier0); blocks on missing tables/columns/types + required batch columns
- `GET /health/schema` — dialect, generation `12`, drift fields (Railway/CI/support)
- Startup logs: `PRODUCTION_SCHEMA_VERSION=12`, `[production.schema.audit.summary]`
- Workers guarded via `schema_guard.require_production_schema_valid`; background upgrade aborts workers on gate failure
- PostgreSQL no-op wrapper logs `SCHEMA_HELPER_SKIPPED_POSTGRES` + allowlist warning (production helpers exempt)
- Tests: `test_production_schema_platform.py` (27 production schema tests passing)

## 2026-06-04 — Composition Engine + Batch/Wave Production
- `product_compositions` + `product_composition_lines` (bundle | manufacturing modes, no product_type)
- `production_batches` + `production_batch_lines`; aggregated component demand + shortages
- Migration from `production_recipes`; recipe service syncs compositions; stock docs link batch_id
- API: `/compositions`, `/production/batches`; frontend Kompozycje tab + batch Produkcja UI
- Tests: `test_composition_batch.py` (aggregation engine)

## 2026-06-04 — Manufacturing / Production module (WMS)
- PostgreSQL-safe migration `ensure_production_tables` (recipes, orders, line snapshots)
- Recipe service + production order service (FIFO consume, RW/PW docs, valuation on complete)
- API router `/production`; no `product_type` enum
- Frontend: Produkcja nav + list/detail UI; product tab with recipe editor and component usage
- Tests: recipe calculations, schema, self-reference guard

## 2026-06-04 — Direct Sales PDF + Dokumenty print templates
- Root-cause fix: sale PDF 500 (`map_sale_document` keyword-only call)
- Central `document_print_service` with logging, builtin/custom template fallback, PDF validation
- Auto-seed Paragon/FV/WZ/Korekta A4 templates (stable slugs) in label template Dokumenty category
- Frontend PDF fetch validates `%PDF` bytes; print errors surface backend `detail`

## 2026-06-04 — WZ warehouse document cleanup
- `wz_service`: finalize WZ as `completed` with line net/VAT pricing and document totals
- Stock document list/read: order number, series prefix, customer, financial totals for WZ
- `DocumentsWarehousePage` WZ tab: removed payment columns; ZREALIZOWANA status; warehouse-oriented line table

## 2026-06-04 — Retail/POS workflow (Direct Sales)
- Auto retail customer (`Klient detaliczny`) on every new session
- Document-first flow: PA = retail badge; FV = NIP lookup + invoice customer upsert
- Line + order discounts with backend canonical totals (`session_financials_service`)
- Discount settings + admin panel section; server-side max-% validation
- Complete pipeline reads session `document_subtype`; `httpx` for MF NIP API

## 2026-06-04 — Direct-sale NET price pipeline fix
- Session `unit_price` is catalog NET; backend no longer treats it as gross
- `netto_line_to_gross_fields`, updated `compute_direct_sale_session_total` with per-product VAT
- Receipts/documents: 5.00 net / 1.15 VAT / 6.15 gross (was wrongly 4.07/0.93/5.00)

## 2026-06-04 — Financial consistency pass
- Unified order line financials on `sale_document_financials.compute_order_line_financials_with_margin`
- Fixed order-level margin: null when `sum_purchase_active` is zero (no more false 100%)
- Frontend order detail: display-only `line_gross_total` / `unit_price_gross` (fixes 5.01 brutto bug)
- Direct-sale completion traceability: load issue movements from WZ / `source_movement_id`
- PA series padding repair at seed (`padding_length=0`)
- Operational debug panel gated to Vite DEV only

## 2026-06-04 — POS UX polish
- PDF print endpoints wired; formatMoneyPl; stationary-sale labels; linked documents UI
