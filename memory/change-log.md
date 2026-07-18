# Change log

## 2026-07-18 — Panel Activity Log (OMS)

- SSOT: `activity_events` + `activity_event_links` (jedno zdarzenie → wiele obiektów).
- API `GET /activity-log`; writer `record_activity` + bridge z CartLifecycle.
- FE: `ActivityLogPanel` (oś czasu, zwijany) na zamówieniach, wózkach, regałach.
- Szczegóły: `memory/activity-log-architecture.md`.

## 2026-07-18 — WMS user messages + Event Log PL

- Katalog `WmsUserMessage` (code/severity/title/message/details/suggested_action) — PL, bez HTTP/exception w UI.
- Picking claim/start/cancel → komunikaty biznesowe; FE `WmsMessageModal` + Provider.
- Event Log: bogatsze opisy PL + `orders_assigned` / `basket_assigned` przy starcie zbierania.

## 2026-07-18 — Capacity Engine (target architecture)

- Nowy SSOT: `backend/services/cart_capacity/` (strategie LIMIT_ORDERS / LIMIT_VOLUME / HYBRID_* / BASKETS).
- Lifecycle `Cart.status` nietknięty; occupancy (`OccupancyState`) tylko wyliczane.
- Model: `capacity_strategy` / `capacity_orders` / `capacity_volume`; drop `capacity_mode` / `max_orders`.
- Usunięto `cart_capacity_service.py`; `_apply_capacity_slice` → engine; optimizer/basket best-fit → engine.
- FE: StatusPill = lifecycle; CartCapacitySection = pojemność; edytory strategii.

## 2026-07-18 — Capacity Engine architecture (design)

- Status wózka = wyłącznie lifecycle; zapełnienie = osobna logika strategii.
- Docelowo jeden Capacity Engine: LIMIT_ORDERS / LIMIT_VOLUME / HYBRID (+ BASKETS dla MULTI).
- Szczegóły: `memory/capacity-engine-architecture.md`.

## 2026-07-18 — Frontend cart capacity UI

- Fleet list/card/detail/editors: `capacity_strategy` + `CapacitySnapshot`; `StatusPill` (lifecycle) + `CartCapacitySection` (occupancy).
- Removed `CapacityModeFields.tsx`; `capacityStrategyLabel` in `labels.ts`.

## 2026-07-18 — CartStatus variant B (clean enum rebuild)

- Docelowy enum: AVAILABLE | ASSIGNED | PICKING | READY_FOR_PACKING | PACKING.
- PG: `migrate_cartstatus_enum_clean` — nowy typ → remap → swap kolumny → drop starego → rename (bez ADD VALUE).
- ORM: `CartStatus` tylko 5 członków; legacy tylko w `CARTSTATUS_LEGACY_TO_CANONICAL` / `normalize_cart_status_value`.
- FE: `types/cartStatus.ts`, StatusPill, fleet summary, locale keys bez FULL/PEŁNY.
- Usunięto TEMP `START_PICKING STEP` diagnostykę (po ustaleniu root cause enum).

## 2026-07-18 — Fix cartstatus PG enum (PICKING missing)

- Root cause: `InvalidTextRepresentation: invalid input value for enum cartstatus: "PICKING"`.
- Kod używa lifecycle: AVAILABLE/ASSIGNED/PICKING/READY_FOR_PACKING/PACKING; stary enum miał PL lub IN_PROGRESS.
- **Superseded by variant B** (clean rebuild instead of ADD VALUE).

## 2026-07-17 — Fix Cart FOR UPDATE + joinedload (PostgreSQL)

- Przyczyna 500 picking/start: `FeatureNotSupported: FOR UPDATE cannot be applied to the nullable side of an outer join`.
- `_lock_cart` / `cancel_picking` / timeout workers: najpierw `SELECT carts FOR UPDATE`, potem `selectinload(Cart.baskets)` — bez OUTER JOIN na tym samym statement.

## 2026-07-17 — Fix silent HTTP 500 (log in exception handler)

- Root cause: handler zwracał `request_id`, ale tylko `attach_http_500_exception`; middleware (`BaseHTTPMiddleware`) nie widzi `request.state` → brak tracebacku w Deploy Logs.
- Fix: `record_error` / `global_exception_handler` woła `log_request_server_error` **przed** JSON 500; `exc_info=exc` (nie `format_exc()`).

## 2026-07-17 — Log flood control + HTTP 500 middleware

- `schema.reconcile`: jeden summary `FK cycles detected: N` + fallback (bez per-`fk_cycle_break`).
- Per-column/index/FK sync → DEBUG; jeden INFO summary reconcile.
- `postgres_sequence_sync`: fix odczytu `is_called` + fallback `pg_sequences.last_value`; tylko summary (+ max 5 error samples).
- Middleware `outer_request_logger`: każdy HTTP 500 → ERROR z request_id/method/path/user/tenant/warehouse/file/line/traceback/duration (handler tylko attach exc).

## 2026-07-17 — Startup fixes + global 500 traceback

- `postgres_sequence_sync`: `is_called` z relacji sekwencji (nie z `pg_sequences`).
- `z_pz_schema._migrate_z_pz_series_padding`: SQL używa kolumny `"type"` (ORM `series_type`); guard gdy brak kolumny.
- Exception logging: `format_exception_traceback(exc)` zamiast `traceback.format_exc()` w handlerze (usuwa fałszywe `NoneType: None`); log z request_id / method / path / file / line; HTTP 5xx z `HTTPException` też logowane.

## 2026-07-17 — Fix postgres_sequence_sync `is_called`

- Błąd: `SELECT last_value, is_called FROM pg_catalog.pg_sequences` — `pg_sequences` (PG 10+) **nigdy** nie miało `is_called`.
- `is_called` jest potrzebne do `next_sequence_value` / `setval` semantics — odczyt z relacji sekwencji: `SELECT last_value, is_called FROM "schema"."seq"`.
- Logika sync bez zmian; testy sequence sync: 9 passed.

## 2026-07-17 — Event Log: event_code + severity

- `event_code` (system) oddzielony od `description` (PL UI); logika tylko po kodzie.
- `severity`: INFO / SUCCESS / WARNING / ERROR / AUDIT (katalog).
- Analiza uogólnienia `audit_events`: odłożona — `memory/audit-events-generalization-analysis.md`.

## 2026-07-17 — Event Log (PL) + Active Picking

- Tabela `cart_lifecycle_events` — dziennik biznesowy po polsku; writer tylko CartLifecycleService.
- API: `GET /wms/carts/{id}/events`; Active Picking: `/active-picking` (+ alias current-task).
- Eventy: rezerwacja, start/koniec kompletacji, pierwszy produkt, pakowanie, zwolnienie, timeout, auto-release, podwójny claim…
- `notify_first_product_confirmed` z quick-pick; test pełnego cyklu PL.

## 2026-07-17 — Architecture Health Check (CartLifecycleService)

- FOR UPDATE na wszystkich mutacjach; heal bez wewnętrznego commit.
- Atomic AVAILABLE→PICKING (1 historia); idempotencja cancel/finish/release/start.
- `assert_cart_lifecycle_invariants` + `_after_mutation`.
- `ARCHITECTURE.md` + docstring ownership; raport: `memory/cart-lifecycle-architecture-health-check.md`.
- Testy: 16 passed (historia, idempotencja).

## 2026-07-17 — Cart lifecycle: claim opcjonalny, timeout, heartbeat, auto-release

- Claim opcjonalny: AVAILABLE→start = atomowy claim+start; ASSIGNED bez orders/session.
- `CartAlreadyClaimed` (409); `claimed_at`; timeout ASSIGNED (`CART_ASSIGNED_TIMEOUT_MINUTES`).
- Auto-release PICKING przy 0 Pick (`CART_PICKING_IDLE_NO_PICKS_MINUTES`); ≥1 pick → zabronione.
- Worker: `backend/workers/cart_lifecycle_worker.py` (startup + maintenance).
- Heartbeat: `POST /wms/picking/heartbeat` → tylko `last_activity_at` (+ refresh current_task).
- Current Task: `picked_count` / `remaining_count`; capacity tylko w `startPicking`.
- Legacy assign (`_assign_bulk`/`_assign_multi`/`mark_cart_*`) → raise; writerzy lifecycle tylko w CartLifecycleService.
- Testy: atomic start, claim conflict, timeout, auto-release, current_task fields.

## 2026-07-17 — Cart Current Task + Lifecycle History

- `carts.current_task_json` + `apply_cart_transition` w CartLifecycleService.
- Tabela `cart_lifecycle_history` (from/to status, operator, reason, task_id).
- API: stats z `current_task`, `GET .../current-task`, `GET .../lifecycle-history`.
- Zapisy historii wyłącznie przez lifecycle.

## 2026-07-17 — Cart lifecycle SSOT (nowy model biznesowy)

- Zamówienia **nie** są przypisywane przed skanem wózka.
- `ASSIGNED` = wybór wózka (bez orders/session); `start_picking` (skan) = sesja + cart_id + capacity + PICKING.
- SSOT: `cart_picking_lifecycle_service.py`; API: `POST /picking/claim-cart`, `/picking/start`, `/packing/start-cart`.
- `touch` nigdy nie tworzy sesji (409 SessionNotFound).
- Assignment / simulation / optimizer: bez zapisu lifecycle.
- READY_FOR_PACKING: cart_id + assigned_user zostają; PACKING przy skanie pakowacza (`packing_user`).
- Testy: `test_cart_picking_lifecycle_ssot.py`.

## 2026-07-17 — Fix: cart AVAILABLE mimo aktywnej picking_session

- Root cause: sesja tworzona (`touch` / ensure), wózek bez `current_session_id` / status≠PICKING.
- `bind_cart_to_picking_session`: status=PICKING, current_session_id, assigned_user_id, started_at.
- `assert_cart_ready_for_quick_pick` + quick-pick bootstrap: self-heal AVAILABLE+sesja → PICKING.
- Startup: `heal_carts_with_orphaned_picking_sessions`.
- Stats: zamówienia też po `picking_session_id` aktywnej sesji (gdy current_session_id NULL).

## 2026-07-17 — Capacity ORDERS: enforce na wszystkich assign paths

- SSOT: `enforce_cart_orders_capacity(db, cart, new_orders=N)` → 409 `{code, current_orders, max_orders, attempted}`.
- Wpięte: simulation, picking assignment, ensure_order_basket, ensure_picking_session,
  quick-pick (`record_wms_quick_pick`), optimizer `_apply_fleet`.
- Bez polegania na FE.

## 2026-07-17 — quick-pick 409: log + message/debug

- Przed każdym 409: `logger.warning("quick_pick rejected", extra={code, cart_*, session_*, order_count, …})`.
- Body: `{ code, message, debug: { cart_id, cart_status, session_id, current_session_id } }`.
- FE: `formatFastApiErrorDetail` / `extractApiErrorMessage` czytają `message`; toast bez „Request failed with status code 409”.

## 2026-07-17 — Cart stats SSOT: GET /wms/carts/{id}/stats

- Jedno źródło prawdy: `orders.cart_id` + `orders.picking_session_id` (`cart_stats_service`).
- Endpoint: `GET /wms/carts/{id}/stats` → orders/products/sections/occupied/volume/percent.
- Lista/detail cartów używa tego samego agregatu (bez picks / ORM-only fallback).
- FE: CartCard, CartFleetDetailPanel, CartDetails, BulkCartEditor → `fetchWmsCartStats`.
- Test: `backend/tests/test_cart_stats_ssot.py`.

## 2026-07-17 — Cart capacity ORDERS: 409 CART_CAPACITY_EXCEEDED

- SSOT: `cart_capacity_service.assert_cart_orders_capacity` — przy `capacity_mode=orders`:
  `current_orders + incoming_orders <= max_orders`.
- Przekroczenie → HTTP 409 `{ code, current_orders, max_orders, attempted_orders }`.
- Wpięte: `simulation_service.assign_orders_to_cart`, `PickingAssignmentService`, WMS basket attach.
- FE CartCard: toast „Wózek może pomieścić maksymalnie X zamówień.”
- Test: `backend/tests/test_cart_orders_capacity.py`.

## 2026-07-17 — quick-pick: 409 zamiast 503 + logi SSOT

- Przyczyna 503: `SQLAlchemyError` przy zapisie `cart.status=PICKING` do starego PG ENUM (PL) / brak `current_session_id`.
- Fix: status→VARCHAR w `ensure_carts_picking_lifecycle_columns`; walidacja SSOT → 409 `SessionNotFound` / `InvalidCartState`.
- `POST /wms/picking/quick-pick`: `logger.exception` z tenant/warehouse/source_status/barcode/session/cart/user_id; brak nieobsłużonych wyjątków.

## 2026-07-17 — Cart/picking SSOT lifecycle

- Backend SSOT: `cart_picking_lifecycle_service` — AVAILABLE→ASSIGNED→PICKING→READY_FOR_PACKING→PACKING→AVAILABLE.
- Assign: `picking_session` + `order.cart_id` / `picking_session_id` + `PICKING_IN_PROGRESS`.
- Finalize: **nie** odłącza wózka; `cart=READY_FOR_PACKING`, `order=PACKING`; zwolnienie po ostatnim pack.
- Cancel: `POST /wms/picking/cancel-session` — restore status + free cart.
- FE: liczniki z `session_stats` API; modal wyjścia Kontynuuj / Anuluj zbieranie.
- Test: `backend/tests/test_cart_picking_lifecycle_ssot.py`.

## 2026-07-17 — Scanner Helper: pomocnik kodów magazynowych

- Przebudowa Emulatora skanera (FE only): usunięto przycisk ENTER; Enter/Skanuj = skan, Wyczyść zostaje.
- Kategorie z licznikami, wyszukiwanie nazwa/kod/EAN/SKU, ulubione ⭐, szybki dostęp (ostatni wózek/koszyk/lokacja/produkt).
- Relacje wózek ↔ koszyki (drzewo, kopiuj kod, ponowny skan) na istniejących `/carts/`, lokalizacjach, produktach, lookup zamówień.
- Mobile: poziomy scroll kategorii, większe kafelki (`useIsHandheldDevice`).
- Moduł: `frontend/src/components/wms/dev-scanner/*` + `useDevScannerCatalog`.

## 2026-07-17 — Warehouse policy v2: OperationContext + OMS/WMS split

- FE: `getOperationPolicy` / `OperationContext` w `warehouseOperationPolicy.ts`.
- BE: `warehouse_operation_policy.py` (lustrzana polityka + `assert_warehouse_if_required`).
- „Wszystkie z filtra” ≠ wymóg magazynu dla workflow (status, priorytet, notatki, …).
- `order.delete_orders` = OMS (bez WH); delete lokalizacji/zbiorów/rezerwacji = WMS.
- Bulk status/patch/delete: WH opcjonalny; soft-skip statusów cross-warehouse.
- Raport: `memory/warehouse-operation-policy-report.md`.

## 2026-07-17 — Warehouse gate: workflow zamówień bez wymogu magazynu

- Problem: `requireFulfillmentWarehouseForBulk` blokował zmianę statusu panelu (i inne ops OMS) bez filtra magazynu.
- Policy: `frontend/src/lib/warehouseOperationPolicy.ts` → `requiresWarehouse(operationType)`.
- OrderList: bramka per akcja; explicit IDs + workflow bez blokady; delete / filtered_all nadal potrzebują WH.
- Backend: optional `warehouse_id` na bulk-status / bulk-patch (explicit) i PATCH ui-status.
- Audyt: `memory/warehouse-requirement-audit.md`.

## 2026-07-17 — WMS home: większe karty, bez „Otwórz”, belka

- Karty desktop ~148px, większe ikony/nazwy; cała karta klikalna — usunięto „Otwórz →”.
- KPI: duże liczby w kolorze tonu, cień/border, nie jak inputy.
- Belka: biała, większe ikony, gap, aktywny = `#f5f8ff` + border primary; bez truncate nazw.
- Hint: „Enter — wybierz”; sekcje wyraźniejsze; grid `minmax(280px,1fr)`.
- Preview: `/dev/wms-home-preview`.

## 2026-07-17 — WMS home: dopracowanie UI (ewolucja)

- Belka: 56px, `#ffffff`, border `#e9edf5`; aktywny moduł `#f5f8ff` + primary, bez szarych filli / GripVertical.
- KPI: karty liczba→etykieta (h~76), desktop 5 kolumn, mobile scroll poziomy.
- Kafelki: min-h 120, max-w 280, hover `translateY(-2px)`; nazwy 2 linie (bez ellipsis).
- Krótsze `shortDescription`; kontener `max-w 1800`; grid `minmax(260px,1fr)`; sekcje ciaśniej.
- Kolektor: wiersz ~70px, większe ikony/badge, większy odstęp sekcji.
- Preview: `/dev/wms-home-preview`.

## 2026-07-17 — WMS home: sekcje desktop + lista kolektor

- `/wms/menu`: `WmsHomePage` — `useIsHandheldDevice` → `WmsDesktopHome` | `WmsCollectorHome` (wspólne tiles/KPI/API).
- Desktop: KPI strip, wyszukiwarka + „Skróty: 1-9 • Enter - otwórz”, sekcje Operacje / Kontrola / Pozostałe, kafelki ~320×140.
- Kolektor: listy DO ZROBIENIA / POZOSTAŁE (~72px), bez dużych kart.
- Tło WMS shell + home: `#ffffff`, obramowania `#e9edf5` (bez szarych powierzchni).
- Podgląd UI: `/dev/wms-home-preview` (mock KPI, desktop + kolektor obok siebie).

## 2026-07-17 — Fix login HTTP 500 (app_users protection columns)

- Przyczyna: ORM mapuje `is_system_user|is_owner|is_deletable|is_role_changeable`, a na PG kolumny mogły nie powstać — `ensure_app_users_bootstrap_columns` dodawał je w tej samej transakcji co `CREATE TABLE app_user_warehouses (... AUTOINCREMENT)` (składnia SQLite) → wyjątek + rollback ALTER → SELECT przy loginie = 500.
- Fix: `ensure_app_users_protection_columns` w osobnej transakcji; DDL junction dialect-aware; wywołanie w Tier 0 bootstrap + self-heal w `/auth/login`.
- Migracja ops: `025_app_users_protection_columns.sql` (brak Alembic w repo).
- Auth endpoints: `logger.exception` + detail z `error`/`code` zamiast cichego 500.
- Role w DB: `super_admin` (nie `SUPER_ADMIN`).

## 2026-07-16 — SUPER_ADMIN + słownik aplikacji (system_labels)

- `app_users`: `is_system_user`, `is_owner`, `is_deletable`, `is_role_changeable` (+ schema upgrade / migracja `024`).
- SUPER_ADMIN: nieusuwalny, bez zmiany roli, bez dezaktywacji; pierwszy ADMIN → `is_owner` (lock delete/role).
- Tabela `system_labels` + API `/api/system/labels/*`; seed katalogu (nav/system).
- Frontend: `getLabel(key, fallback)` + cache localStorage + Support mode; panel **System → Słownik aplikacji** (tylko SUPER_ADMIN).
- `UI_STRINGS` przez Proxy → `getLabel` (centralne etykiety); dalsza migracja hardcoded stringów poza `UI_STRINGS` przyrostowo.

## 2026-07-16 — Modal „Nowy tryb zbierania”: layout + Select statusów

- Tryb zbierania | Kolejność zamówień w 2 kolumnach; w „Po produktach” kolejność widoczna, disabled z opisem.
- Sekcje A/B zawsze widoczne; nieobsługiwane opcje/pola disabled z powodem (bez ukrywania).
- Krótsze etykiety pojemników (Wózek skan/bez, Pick & Pack, Regał…); opisy pod opcjami.
- Statusy: `PickingStatusSelect` (szukaj, badge koloru, grupy, max-h 300px, sticky search); etykieta „Status po zakończeniu zbierania”.
- Tylko UI — bez zmian API / enum / zapisu.

## 2026-07-16 — Zbieranie: nazewnictwo Sellasist 1:1 (UI)

- Nav: Konfiguracja statusów, Zarządzanie zbiorami, Ustawienia wspólne, Metody zbierania, Braki przy zbieraniu, Magazyny, …
- Etykiety pól/checkboxów/przycisku dodawania wg briefu; opcje trybów 1:1.
- Sekcja `wms-pick-workflow` usunięta z nav — treść przeniesiona (bez zmian API).
- Raport: `memory/wms-picking-naming-deploy-report.md`.

## 2026-07-16 — Konfigurator zbierania: modal 1400px + nazwy Sellasist 1:1

- Drawer → `PickingSettingsModal` (max-width 1400px), sekcje pionowe / gęste, A|B obok siebie na XL.
- Etykiety opcji: „Do wózka z/bez wymuszenia skanowania…”, „Do wózków z koszykami”, „Wózkiem mobilnym…”, kolejność daty/kurierów jak w Sellasist.
- Bez zmian API / wartości enum / zapisu.

## 2026-07-16 — Zbieranie settings UX: mniej scrolla, 2 kolumny

- Usunięto prawy sticky „Podgląd konfiguracji” (`PickingConfigPreviewPanel` deleted).
- Shell: `sticky menu | content`, lewa nawigacja `lg:sticky lg:top-4`.
- Scroll-spy: `IntersectionObserver` w `WmsSettingsSectionRegistryContext` (+ scroll dla wysokich sekcji).
- Nagłówek uproszczony do „Zbieranie”; karty kompaktowe bez badge Aktywny/Nieaktywny (brak pojęcia default w API).

## 2026-07-16 — Ustawienia zbierania: audit brakujących helperów po refaktorze

- Przywrócono lokalne helpery w `WmsPickingSettingsPanel.tsx`: `flattenOrderUiStatusOptions`, limity `BULK_ORDER_*` + `parseBulkOrderLimitInput`, `fieldHintClass`, `configBlockTitleClass`.
- Przyczyna: usunięcie przy czyszczeniu `WmsSettingsPage` bez przeniesienia do panelu.
- `npm run build` OK.

## 2026-07-16 — Ustawienia WMS → Zbieranie: redesign UX (3 kolumny)

- Tylko UI: bez zmian API / pól / zapisu (configs API + shortage API + localStorage extended).
- Moduł: `frontend/src/modules/wmsSettings/picking/` — shell 3-kolumnowy, lewa nawigacja IA, sticky podgląd, drawer edycji trybu.
- Karty trybów (status → sposób → 1-poz./multi → po zakończeniu → Edytuj/Usuń); sekcje: tryby, workflow, kolejka, skan, wózki, braki, magazyny, automatyzacja, widok, zaawansowane.
- `WmsSettingsPage` oczyszczony z martwego kodu po ekstrakcji panelu.

## 2026-07-16 — WMS settings UI standardization

- Shared: `WmsSettingsLayout` (hide aside ≤1 section), `WmsSettingsSection`, `WmsSettingCard`, `WmsSettingsFooter`.
- Coming soon tabs (Reklamacje, Crossdocking, Rozlokowania, Przesunięcia): no dashed empty boxes.
- Canonical section labels: Ogólne / Workflow / Widok / Automatyzacja / Integracje / Drukowanie / Zaawansowane.
- Global sticky save bar via `WmsSettingsFooter` for dirty packing/picking/direct sales.

## 2026-07-16 — Settings: merge Uprawnienia into Użytkownicy

- Removed fly-out item „Uprawnienia” (was a duplicate entry to groups).
- Users module tabs: Użytkownicy · Role i uprawnienia · Grupy użytkowników (+ audit/costs/workforce).
- Restored status-access matrix at `/settings/administrators/roles` as „Role i uprawnienia”.

## 2026-07-16 — Restore Ustawienia WMS in ERP sidebar

- Re-added top-level sidebar item ``Ustawienia WMS`` (`Settings2`) → `/settings/wms`.
- Placed after ``Ustawienia``, above ``Przejdź do WMS`` (not inside Settings fly-out).
- Page/route were intact; only nav entry was missing after sidebar refactor.

## 2026-07-16 — Global WMS scanner emulator restored

- `DevScannerPanel` always on under WMS (unless `VITE_ENABLE_DEV_SCANNER=false`).
- FAB „Skaner”, drawer: Skanuj / Enter / Wyczyść, last 20 scans, active receiver footer.
- Ctrl+Shift+S; localStorage open + history. Same `handleScan` path as physical scanner.
- Keyboard wedge only in DEV or when flag explicitly `true`.

## 2026-07-16 — Cart list: assignment badge (who uses the cart)

- API list/detail: `assigned_user_id`, `assigned_user_name`, `assignment_type` (`packing` | `collecting` | null), `assignment_since`.
- Source: open `WmsPackingSession` via `order.cart_id` (priority) → open picking `WmsOperationSession` → unassigned. No new tables.
- UI: badge on each cart row (gray / blue / green) + hover tooltip (assignee, mode, since).

## 2026-07-16 — Cart orders hover preview

- API `orders_preview` on cart list/detail (eager: customer, ui status, items+product).
- Expand panel: hover on order count → Floating UI popover (scroll, max 500px); click → `/orders/:id`.

## 2026-07-16 — Wózki: white page background

- `CartsModuleLayout`: `omitCard` + `bg-white` fill (no slate canvas around nested card).
- Expand panel content on white; row hover highlight kept light.

## 2026-07-16 — Remove intermediate module h1 (breadcrumb → tabs)

- Dropped duplicate page titles between breadcrumb and tabs in module shells.
- `ModuleListBreadcrumb` margin `mb-6` → `mb-2` (tabs sit directly under nav).

## 2026-07-16 — Wózki: breadcrumb/title follow active tab

- `CartsModuleLayout`: Magazyn > {active tab} + h1 = tab label (not always „Wózki”).

## 2026-07-16 — Cart content: expand under row (no Drawer)

- Wózki / Wózki z koszykami: content preview expands under the cart row (full width), not right Drawer.
- One open cart at a time (`expandedCartId` in `CartsFleetList`); 200ms grid-rows animation.
- `CartBasketEditDrawer` / edit flows unchanged.

## 2026-07-16 — Wózki: single module header

- `CartsModuleLayout` alone owns Magazyn > Wózki + title + tabs (incl. Nośniki list).
- Tab pages keep description/actions/KPI only — no duplicate PageHeader/breadcrumb/title.
- Carriers list no longer self-hosts tabs.

## 2026-07-16 — Product link from location/carrier → full edit card

- `LocationPreviewCarrierContents` + `CarrierItemsTable`: navigate to `/products/:id/edit` (catalog card), not simplified `/products/:id`.
- Pass `tenantId` in location state when available.

## 2026-07-16 — Nośniki header rebuild

- KPI: Wszystkie / Zajęte / Puste (occupied = sku_count|total_qty > 0); removed „Grupy”.
- Page owns breadcrumb + title + tabs (no duplicate „Magazyn > Wózki” from CartsModuleLayout).
- Compact spacing (`space-y-2`/`space-y-4`, compact KPI) for large monitors.

## 2026-07-16 — Location preview UX fixes

- Slot hover: Floating UI only (`LocationSlotHoverCard`) — no native `title` tooltip; flip/shift so popup stays on screen.
- Occupancy: `used_volume` from Σ(L×W×H×qty) in dm³; if product dims missing → `— %` + „Brak danych o objętości produktów” (no fake 0%).
- Carrier product cards: whole card clickable → `/products/:id`, hover cursor + „Otwórz kartę produktu”.

## 2026-07-16 — Location preview modal rebuild

- Modal wider (`max-w` ~1760px), 3-column layout for 27–32" screens.
- Occupancy: volume/weight/slots only when max known; else `— %` + „Brak danych o pojemności nośnika” (no fake 0%).
- Rack front: all levels/positions, color legend (primary/reserve/active/blocked/empty), hover tip (kod/typ/nośnik/SKU/ilość).
- Floor plan: highlight rack + aisle + location; carrier contents show photo/name/SKU/EAN/qty.
- API `visual-context`: `ean`, capacity fields, enriched `rack_bins` / `rack_grid.aisle`.

## 2026-07-16 — Szablony / Gotowe szablony card polish

- Cards: white `#FFFFFF`, border `#E5E7EB`, radius 16px, soft shadow + hover lift; removed grey preview backgrounds.
- Ready filter tabs: wrap + horizontal scroll, never clipped.
- Dimensions via `formatMm` / `formatLabelSizeMm` (max 1 decimal); no DPI / raw type ids in card meta — Polish labels (`Lokalizacja • 93 × 67 mm • Edytowano…`).

## 2026-07-15 — Szablony list UI rebuild

- `LabelTemplatesList`: single inner rail (260–280px) for typ etykiety + grupy; full-width right content.
- Row cards (`TemplateListRow`): checkbox, thumbnail, name/type/size/date/uses, actions; click selects; Lista/Karty toggle kept.
- Split into `templatesList/*`; no SASIST sidebar/navbar/tab changes; same APIs.

## 2026-07-15 — CSV mapping modal live label preview

- `CsvMappingModal`: two-column layout with right panel „Podgląd etykiety” (`CsvMappingPreviewPanel`).
- Live `LabelPreviewCard` from draft mapping + in-memory CSV; record nav, single/grid (6), field values with orange „Brak mapowania”.
- Mapping table column „Przykład (1. rekord)”: `Kolumna → Pole → wartość`. No PDF/backend.

## 2026-07-15 — Print queue unified 3-column layout

- All print modes (Lokalizacje, Regały, Pasek, Wózki, Import PDF, Import CSV) share `PrintQueueWorkspaceShell`: `380px | minmax(700px,1fr) | 320px`.
- Removed vertical stack + `max-w-[1500px]`; CSV keeps fullscreen `CsvMappingModal`; deleted `CsvImportQueueShell`.
- Handlers/API unchanged — UI shell only.

## 2026-07-15 — CSV mapping fullscreen modal

- Import CSV: mapping moved from left column into `CsvMappingModal` (backdrop blur, badges, table, auto/clear/save).
- Removed artificial `max-w-[1800px]` from CSV shell.

## 2026-07-15 — CSV import template picker UX

- Import CSV only: friendly print-kind chips filter templates; `CsvTemplatePicker` (search + thumbnails); no raw `(location)` labels.
- Mapping dropdown = template used variables only (no type-catalog dump).

## 2026-07-15 — Ready templates library UI

- `LabelReadyTemplatesPage`: Figma/Canva-style library — orange filter tabs, grouped sections, preview-first cards (`LabelGalleryThumbnail`), outline Edytuj/Użyj + ⋮ menu.
- New `readyTemplates/*`; presets stay client-side; „Własne” from existing `GET /label-templates/`.

## 2026-07-15 — Label CSV print queue 3-column wizard

- Import CSV: wizard steps + left accordions (320px) + paginated preview + sticky summary (320px).
- New `printQueue/CsvImportQueueShell`, `PrintQueueStepWizard`, `PrintQueueAccordion`, `PrintQueueThreeColumnLayout`, `PrintQueueLabelPreviewPane`, `PrintQueueSummaryPanel`.
- No API/print logic changes — UI shell only for `printMode === "csv_import"`.

## 2026-07-15 — Label CSV mapping UX

- Dropdown no longer lists full `LABEL_VARIABLE_CATEGORIES`; scoped to `available_variables` / bindings / type fallback.
- New `csvMapping/*`: grouped searchable combobox, template field checklist, Wymagane/Opcjonalne/Nie znaleziono status.

## 2026-07-15 — Sidebar IA + new Sasist logo

- Removed MAGAZYN section and System/WMS menu rows; Magazyn + Ustawienia open right flyouts under OPERACJE.
- Footer CTA „Przejdź do WMS” (56px, rounded-16, white border).
- New assets: `frontend/src/assets/logo/sasist-{mark,logo}.svg` (+ public/favicon sync); HeaderLogo / login / printer modal.

## 2026-07-15 — ERP shell polish (blue active + Magazyn flyout)

- Sidebar 260px: hamburger + logo in rail; active `bg-blue-50` + `w-1 bg-blue-600`; larger icons/gaps.
- Top bar: search + bell + warehouse (≥220px) + avatar only (no logo).
- Magazyn: side flyout 300px `rounded-r-3xl shadow-2xl` (click/hover, not accordion).

## 2026-07-15 — ERP AppTopBar rebuild

- New `components/layout/topbar/*`: HeaderLogo, GlobalSearch, NotificationBell, WarehouseSwitcher, UserMenu, AppTopBar.
- Removed KPI pills and secondary header icons; white 70px bar; Ctrl+K search (`erpTopbar` variant).
- Hamburger toggles sidebar via `ErpSidebarUiContext`; removed mobile overlay drawer (desktop-first).

## 2026-07-15 — ERP left sidebar UX rebuild

- New `ErpSidebar`: sections SPRZEDAŻ / OPERACJE / MAGAZYN, WMS sticky bottom, profile footer, collapse 76px, mobile drawer.
- Orange active item (`bg-orange-50`, `border-l-[3px] border-orange-500`), white surface, 24px icons.
- Grouping via `NAV_SIDEBAR_SECTIONS` in `mainNavConfig.tsx`.

## 2026-07-15 — Purchasing product images

- Root cause: API returns relative `/uploads/...`; purchasing thumbs used raw URL → 404 on SPA origin.
- Added `getProductImage` / `toAbsoluteProductImageUrl` (candidate fields + semicolon first + backend origin).
- Wired into `PurchasingProductThumbnail` and `purchasingProductDisplayMeta`.
- Dashboard critical/suggested rows now include `image_url`.

## 2026-07-12 — Sasist Printer Agent v1.0.4 pre-release audit

- `WindowRegistry` — singleton okien Status/Config/Logs; `TrayApp` reużywa instancji.
- `agent/ui/host.py` — jeden hidden root, non-daemon UI thread, Toplevel only (tray).
- `agent/ui_smoke_test.py` + `--ui-smoke-test` + `scripts/verify_agent_ui_smoke.ps1`.
- `verify_agent_exe.py` — icon SHA256 + moduły `host/dialogs/window_registry`.
- `verify-release.ps1` — icon, built_at, build_info.json; manifest `icon_sha256`.
- `installer.iss` — `[InstallDelete]` legacy skrótów; jeden skrót pulpitu.
- `install.ps1` — usuwa legacy skróty przy upgrade; `verify_agent_upgrade.ps1`.
- VERSION → 1.0.4.

## 2026-07-12 — Sasist Printer Agent desktop UI audit

- Wspólny wątek UI (`agent/ui/host.py`), Toplevel zamiast wielu `tk.Tk()` na wątkach daemon.
- Ujednolicony nagłówek (`app_header`), theme, karty, badge, filtry chip w Log Viewer.
- Setup Wizard 4-krokowy; Config/Status/Logi bez `messagebox` / `LabelFrame`.
- Instalator: jeden skrót pulpitu z `{app}\assets\icon.ico`; usunięte skróty Logs/Config.

## 2026-07-12 — Sasist Printer Agent release validation

- `installer/build.ps1`: po PyInstaller walidacja PYZ (UI modules + VERSION); po Inno Setup walidacja nazwy instalatora i EXE wyciągniętego z setupu; exit 1 przy braku modułów UI.
- `scripts/verify_agent_exe.py`: weryfikacja modułów `agent.ui.*` i spójności VERSION (utf-8-sig).
- `scripts/verify-release.ps1`: SHA256 manifest vs lokalny build vs GitHub asset, UI modules, wynik PASS/FAIL.
- CI: `verify-release.ps1 -SkipGithub` przed uploadem; pełna weryfikacja GitHub po publikacji tagu.

## 2026-07-11 — Integracja drukowania Sasist (frontend + orchestracja backend)

- Backend: `POST /api/printing/jobs/queue` — generuje PDF server-side, zapisuje plik, tworzy PrintJob z `pdf_url` → `/jobs/{id}/file`.
- Backend: `GET /api/printing/jobs/{id}/file` — pobranie PDF przez agenta (Bearer).
- Frontend: `printingApi.ts`, `useQueuePrint`, moduł Ustawienia → Drukarki (agenci / drukarki / domyślne / legacy QZ).
- Integracja „Drukuj”: dokumenty magazynowe, sprzedażowe, kolejka etykiet → kolejka drukowania + toast sukcesu.

## 2026-07-11 — Sasist Printer Agent Windows MVP (Faza 2A–2F)

- Nowy projekt: `sasist-printer-agent/` — Python 3.12, requests, pywin32, pystray, PyInstaller.
- Moduły: config, api, auth, printers, heartbeat, jobs, printing, tray, app.
- Config/logs: `%ProgramData%\Sasist\PrinterAgent\`.
- Testy: `sasist-printer-agent/tests/` (6 passed).

## 2026-07-11 — Printing MVP Faza 1B–1D (API + serwisy + testy)

- Serwisy: `backend/services/printing/` — auth token `spt_*`, rejestracja/heartbeat agentów, sync drukarek, job lifecycle (atomowy claim), defaults.
- API: `/api/printing/*` — agents, printers, jobs, defaults (`backend/api/printing/`).
- Auth agenta: `get_current_agent()` — Bearer `spt_*`, bez JWT.
- Testy: `backend/tests/printing/test_printing_api.py` — 16 testów, wszystkie przechodzą.
- **Następny krok:** Faza 2 — agent Windows.

## 2026-07-11 — Printing MVP Faza 1A (modele + migracje + schemas)

- Nowe tabele ORM: `printer_agents`, `agent_printers`, `print_jobs`, `printing_defaults` (`backend/models/printing/`).
- Pydantic schemas: `backend/schemas/printing/` (agent, printer, job, defaults).
- Tier 1 ensure: `backend/db/printing_schema.py` + wpis w `schema_tiers.py`.
- SQL referencyjny: `backend/migrations/018_printing_mvp.sql`.
- Legacy `printers` (QZ) bez zmian; nowy model `AgentPrinter` → tabela `agent_printers`.
- **Następny krok:** Faza 1B–1D (serwisy + API `/api/printing/*`).

## 2026-06-08 — Usunięcie segmentacji ABC/XYZ (Zakupy i planowanie)

- Usunięto endpoint `GET /purchasing/segments`, serwis `purchasing_segments_service`, strony/komponenty heatmapy i priorytetów.
- Plan zakupów: `PlanCategoryStrip` (Hity sprzedaży, Niski zapas, Martwy stock, Ryzyko braku, Wysoka wartość magazynu) zamiast AX–CZ.
- Auto-reorder i replenishment bez filtrów `segment_abc` / `only_segments`.
- Opcjonalna migracja SQL: `backend/db/migrations/optional/2026-06-08_drop_abc_xyz_purchasing.sql`.
- Raport: `docs/abc-xyz-removal-report.md`.

## 2026-06-08 — Sidebar ERP + dashboardy: gęstość informacji (design tokens)

- `erpDensityTokens.ts` — globalne tokeny: `sidebarItemHeight`, `sidebarItemGap`, `dashboardCardPadding`, `dashboardSectionGap`, `kpiCardHeight` + klasy Tailwind.
- `dashboardDensityPrimitives.ts` — wspólne klasy kart/sekcji dashboardów.
- Lewy sidebar (`ErpShellLayout`, `NavFlyoutPanel`): wiersze 36px, `px-3 py-1.5`, ikony 17px, ciaśniejszy fly-out.
- WMS w menu jako normalna kategoria (między Etykietami a Dokumentami) — bez separatora na dole; routing `/wms/menu` bez zmian.
- Dashboardy: główny (`Dashboard.tsx`), zakupy (`PurchasingKpi*`, `PlanningDashboard` shell), analityka, WMS supervisor, flota wózków, magazyn, dokumenty KPI — mniejsze paddingi i odstępy.
- Backend / routing / logika / uprawnienia bez zmian.

## 2026-06-08 — Listy floty (wózki, nośniki, regały): kompaktowe wiersze 68px

- Wspólny moduł `modules/fleetResource/` — wiersz 68px, pasek zapełnienia 6px, akcje 32×32 poziomo, drawer szczegółów.
- `CartCard` — widok zwinięty (jeden rząd); szczegóły w `CartFleetDetailPanel` (drawer z prawej).
- `CarriersGroupTable`, `ConsolidationRacksListTable` — ta sama wysokość wiersza i poziome akcje.
- Backend bez zmian.

## 2026-06-08 — Faza 0 layoutów + migracja Projektanta Magazynu

- Nowa infrastruktura: `frontend/src/components/layout/app/*` (`AppPageLayout`, `AppContentLayout`, `AppSplitView`, `AppRightPanel`, `AppSectionCard`) + `appLayoutTokens.ts`.
- Shell: `ErpShellLayout`, `WmsOperationalLayout`, `WmsTopBar` — jedno tło `bg-slate-50`, border-only (bez shadow / overlay).
- Projektant: `WarehouseDesigner` → `AppPageLayout` + `AppSplitView`; prawy panel regału/elewacji in-flow (`WarehouseMainView`, `ElevationSidePanel`, `RackPropertiesSidebar`); usunięto `fixed right-0` z `WarehouseModals`.
- Backend bez zmian.

## 2026-06-08 — Purchasing API: schema sync PostgreSQL + orders N+1

- `ensure_purchasing_orm_schema` — cross-dialect sync Supplier / PurchaseOrder ORM (Railway Postgres).
- `ensure_supplier_purchasing_columns`, `ensure_purchase_order_tax_invoice_columns` — działają też na PostgreSQL (wcześniej sqlite-only → potencjalne HTTP 500).
- `list_purchase_orders` — `joinedload(supplier)` + batch `item_count` (eliminacja N+1).
- `purchasing_segments_service` — agregacja tygodniowa w SQL (ISO year/week) zamiast GROUP BY dzień.

## 2026-06-08 — Plan zakupów: split layout + panel produktu

- `/purchasing/plan` — lewa: KPI, mini heatmapa segmentów (AX–CZ), liczniki alertów + szybkie filtry, tabela; prawa (max 420px): szczegóły po kliknięciu wiersza (prognoza, segment, alerty, historia sprzedaży, rekomendacja).
- Usunięto osadzanie pełnych stron Alerty/Segmenty/Prognoza w sidebarze; `PlanSidePanel` / `?panel=` wycofane.
- Backend bez zmian.

## 2026-06-08 — Zakupy i planowanie: refaktor UX (4 zakładki)

- Menu: Pulpit | Plan zakupów | Zamówienia | Dostawcy (zamiast 10 zakładek).
- `/purchasing/plan` — centrum pracy (tabela + panele prognozy/segmentów/alertów); legacy redirecty z generatora, prognozy, segmentów, alertów, auto-reorder.
- `/purchasing/suppliers/{ocena,historia,oszczednosci}` — hub dostawców w module Zakupów; redirecty ze starych tras i `/suppliers/ocena|historia`.
- Backend bez zmian.

## 2026-06-08 — Dokumenty magazynowe: kompaktowy widok szczegółów (UX/UI)

- Modal PZ/WZ/MM/PW/RW: nagłówek ~250px, dwie karty info, pasek finansów inline.
- Tabela pozycji: `flex-1`, scroll wewnętrzny, gęstsze komórki.
- Podsumowanie: jeden wiersz Netto | VAT | Brutto (+ ilości).
- Stopka: akcje pomocnicze lewo, operacyjne prawo, tokeny `listSellasist`.
- Z-PZ: ten sam układ kompaktowy + fix importu `documentCreatedByLabel`.


- `LabelGalleryThumbnail` — renderuje prawdziwy podgląd SVG (`renderLabel` + `buildPreviewRecord`), cache per preset.
- Karty: miniatury 140px, proporcje zachowane, wybór slate-900 + ✓, hover translate/shadow 150ms.
- Modal: segmented control (`tabsNavSegmentedItemClassName`), stopka z licznikiem + `listSellasistToolbarToggleBtn` / `labelDesignerToolbarPrimaryBtnClass`.
- Usunięto ikony zastępcze i kolory cyan z galerii.


- Typ etykiety: wyłącznie typy magazynowe (`LABEL_DESIGNER_TYPE_OPTIONS`), bez dokumentów ERP.
- Pasek: `LabelDesignerToolbarSelect`, pola liczbowe bez spinbuttonów, `h-10` na wszystkich kontrolkach.
- Menu „Więcej”: import/eksport, zapisz jako, duplikuj, reset, ustawienia projektu (`LabelDesignerMoreMenu`).
- Przycisk „Zapisz”: tokeny jak PrimaryButton w listach ERP (`labelDesignerToolbarTokens`).
- Ustawienia projektu: modal z custom selectem grupy (`LabelDesignerProjectSettingsModal`).

## 2026-06-08 — DTE edytor: UX IDE (12 poprawek, frontend only)

- Lewy panel: persist zakładka + rozwinięte sekcje zmiennych (`useLeftPanelPersistence`).
- Użycia: klikalne badge → `AssignmentConfigModal`; funkcje pogrupowane (`HelperCatalogPanel`).
- Prawy panel: przypięty / odłączony (`DetachedInspectorPanel`); podgląd bez auto-refresh przy pisaniu; scroll iframe.
- Monaco: minimap (localStorage), breadcrumbs TWIG, status bar VS Code, dark theme; responsywność &lt;1600 / &gt;2200 px.

## 2026-06-08 — DTE ERP: fix picking-list 503 + masowy druk

- **503 picking-list:** `order_provider` wołał `map_sale_document(doc=None)` → `AttributeError` w `_resolve_payment`; naprawa: `map_order_for_print()` + guard `doc is not None` w mapperze.
- **Masowy druk DTE:** `ErpBulkPrintModal` — zamówienia (Multiakcje → Drukuj), produkty (bulk bar), magazyn (`DocumentsWarehousePage`), sprzedaż (`DocumentsSalesPage` — checkboxy + Drukuj).
- **Frontend build:** exit 0 po integracji.

## 2026-06-08 — MRP komercyjny: strategie prognozy, MOQ, symulacja

- **Strategy Pattern:** `DemandForecastStrategy` — 6 strategii (średnia, ważona, dzień tygodnia, mediana, max, AI placeholder).
- **Ustawienia:** Produkcja → Prognozowanie (`production_forecast_json` per magazyn).
- **Produkt:** `max_total_stock`, `production_moq`, `production_batch_multiple`, `production_lead_time_days` (+ istniejące `min_total_stock`).
- **Serwisy:** `PlanningService`, `MaterialAvailabilityService`, `ProductionRecommendationService`, `PriorityEngine`, `LeadTimeService`, `SimulationService`, `InventoryCoverageService`.
- **API:** `POST /production/planning/simulate`, `POST /production/planning/simulate/create-batches`.
- **UI:** KPI dashboard, kolumna „Dlaczego?”, wykres osi czasu, modal symulacji.

## 2026-06-08 — Planowanie zapotrzebowania MRP (ProductionPlanningService)

- Backend: `backend/services/production_planning/` — order demand, velocity, pipeline, priority, `demand_engine_service`.
- API: `GET /production/planning/demand?warehouse_id=&coverage_days=&sales_lookback_days=`.
- UI: sekcja Planowanie zapotrzebowania na `/production/planning` — 3 karty + tabela; CreateBatchModal z pre-fill z MRP.

## 2026-06-08 — Produkcja WMS: jeden ekran zbierania + WmsProductTaskCard + PW draft

- **Zbieranie:** nagłówek z produktem końcowym (partia/MO, zdjęcie, SKU, ilość); wszystkie półprodukty na jednym ekranie; accordion — aktywna karta rozwinięta, po potwierdzeniu auto-rozwija następną; `CollectionJobHeaderRead` w API.
- **Komponenty:** `WmsProductTaskCard` (wrapper na `WmsProductCard`) — Produkcja/Zbieranie; Przyjęcie/Rozlokowanie nadal na własnych kartach (ReceivingLineCard, PutawayLineCard) — migracja w toku.
- **PW:** status `draft` + `receiving_status=DONE` + `putaway_status=NOT_STARTED` (jak PZ po Przyjęciu) — ta sama brama Rozlokowania.
- **Railway 404 settings:** `/api/wms/settings/production` i `product-validation` → 404 na produkcji; `/api/wms/settings/packing` → 401 (trasa istnieje). Wniosek: Railway uruchamia commit **sprzed** `4438ab9` (trasy dodane w v3) — nie brak routera lokalnie, lecz stary deploy.

## 2026-06-08 — Produkcja WMS: zbieranie z wyborem lokalizacji + fixy PW/settings

- Zbieranie: jedno zadanie na półprodukt, lista lokalizacji z badge WMS, LOT/partia/ważność/S/N, wybór lokalizacji przez operatora.
- Dostępne: ilość na wybranej lokalizacji + suma magazynowa `(X szt. w magazynie)`.
- Zdjęcia wyrobu: kolejka WMS, pasek aktywnego zadania, karty zadań, ERP BatchCard (product_image_url z API).
- PW: `recompute_putaway_status_for_document` po utworzeniu; po zakończeniu produkcji nawigacja do `/wms/putaway/{pwId}`.
- WMS Settings: `_wms_settings_wh_dep` respektuje `warehouse_id` z query; log montowania tras przy starcie.

## 2026-06-08 — Produkcja WMS: PW → standardowe Rozlokowanie + ustawienia terminala

- **Workflow:** zakończenie produkcji tworzy dokument PW (`creation_source=PRODUCTION`) i wrzuca go do kolejki `/wms/putaway` — bez osobnego terminala „Odłożenie wyrobów”.
- **Backend:** `pw_putaway_handoff.py`, `finish_production` / `finish_order_production` → `completed` + PW; fazy terminala: tylko `collecting` | `execute`.
- **Ustawienia:** Ustawienia → WMS → Produkcja — widok terminala + wymagane dane (`GET/PUT /wms/settings/production`).
- **Zbieranie:** karty zadań jak inne terminale WMS (zdjęcie, SKU, EAN, lokalizacja, ilości); `CollectionTaskRead` rozszerzony o EAN/stan/jednostkę.
- **ERP:** miniatury produktów na szczególe partii i MO (wyroby + składniki).
- **Frontend:** usunięto zakładkę putaway z terminala produkcji; redirect legacy URL → `/wms/putaway`.

## 2026-06-08 — WMS: globalna walidacja produktów + override per SKU

- **Globalne ustawienia:** `wms_settings.validation_require_*` — konfiguracja w Ustawienia → WMS → Przyjęcia → Walidacja produktów.
- **Override produktu:** `products.validation_skip_*` — wyłączenie globalnej reguły dla konkretnego SKU.
- **SSOT:** `product_validation_policy.resolve_effective_receiving_requirements()` — effective = global && !skip (legacy per-product flags do migracji).
- **Migracja:** `ensure_wms_product_validation_schema` — OR flag produktów → global, skip = NOT legacy per produkt.
- **UI:** karta produktu = tylko wyłączenia; `ProductReceivingRequirementsSection` przeniesiony do ustawień WMS.

## 2026-06-08 — Produkcja UX: layout receptury + fix React #130

- **React #130:** `AppEmptyState` wymaga `icon: LucideIcon`; brak `icon` na `ProductionOrdersPage` (i innych listach) powodował render `<Icon />` z `undefined` → crash przy pustej liście zleceń po utworzeniu MO.
- Naprawiono: `ProductionOrdersPage`, `BatchesListPage`, `ProductionHistoryPage`, `ProductionAnalyticsPage` — dodano ikony.
- **Formularz receptury:** `PRODUCTION_NUMBER_INPUT` ukrywa natywne spinnery w polach number (wydajność, ilość, odpad); wersja pozostaje polem tekstowym.
- **Layout `ProductManufacturingPanel`:** grid 65/35 — lewa: dane receptury, edytor składników, podgląd BOM, RW/PW; prawa (sticky): zużycie materiałów + historia produkcji.
- **`CompositionVisualEditor`:** składniki i podgląd BOM w jednej kolumnie (nie obok siebie).

## 2026-06-08 — Produkcja Faza 3: ERP monitoring-only (execution → WMS)

- `ProductionOrderDetailPage` / `BatchDetailPage` — monitoring + timeline, CTA: Wydaj do WMS / Otwórz terminal / Anuluj
- `ProductionMonitoringPanel`, `ProductionExecutionTimeline`, `productionExecutionTimeline.ts`
- Odłączono `ProductionOrderExecutionPanel` i `ProductionBatchExecutionPanel` od UI
- `ProductionPage`, `BatchCard` — bez akcji wykonawczych ERP
- Legacy API/endpoints oznaczone `@deprecated` (Phase 4 cleanup)

## 2026-06-08 — Produkcja Faza 2: unified WMS terminal (frontend)

- Kolejki terminala przez `GET /production/wms-queue` (partie + MO w jednej liście)
- Hook `useProductionExecutionJob` — ukrywa różnice batch/order API
- Routing kanoniczny: `/wms/production/{collecting|execute|putaway}/:kind/:id` + redirecty legacy
- `WmsProductionJobQueueCard` z badge Partia/MO; strony Collecting/Execute/Putaway przebudowane
- ERP panele execution oznaczone `@deprecated` (Phase 3)

## 2026-06-08 — Produkcja Faza 1: unified WMS execution (MO + partia)

- **Model MO:** `collection_state_json`, `released_to_wms_at`, `released_by_user_id`, fazy `collecting_completed_at` / `production_completed_at`; statusy `collecting` / `putaway`
- **Pakiet `production_execution/`:** `order_execution_service`, `wms_queue_service`, `job_projection_service`, `constants`, `status_migration`
- **Kontrakt:** `ProductionExecutionJobRead` + `GET /production/wms-queue?phase=collecting|execute|putaway`
- **MO WMS API:** release-to-wms, start-collecting, collection, finish-collecting, production-progress, finish-production, finish-putaway
- **Migracja:** `migrate_legacy_order_execution_statuses` w `ensure_production_schema_evolution`
- **Frontend (minimal):** `releaseOrderToWms`, statusy MO, „Wydaj do WMS” na liście zleceń dla MO
- **Testy:** `backend/tests/test_production_execution.py`

## 2026-06-08 — Produkcja: fundamenty architektury (receptury, MO, handoff WMS)

- **Receptury:** MO tworzone przez `composition_id` (`ProductComposition`); `clone_composition_version` + `POST /compositions/{id}/clone`; lista receptur używa `compositionApi` (activate/clone)
- **MO:** ekran `/production/orders/:orderId` (`ProductionOrderDetailPage`) + `ProductionOrderExecutionPanel` (start/complete/cancel, RW/PW)
- **Handoff WMS:** `released_to_wms_at` na partii, `POST /production/batches/{id}/release-to-wms`; kolejka WMS tylko partie wydane; `start-collecting` wymaga wydania
- **Integracja zestawów:** `BundleProductionPanel` → `composition_id` przy tworzeniu MO

## 2026-06-08 — Globalny system widoków list (listView) — faza 2

- UI: split button `[Filtruj ▼]` w `FilterApplyActions` (menu: Filtruj / Zapisz / Wczytaj / Zarządzaj / Resetuj) — bez osobnego przycisku „Widoki”
- Enter w polach filtrów → submit formularza (`FilterPanelBodyWithActions`) — jeden request
- Wspólna fabryka adapterów `listViewAdapterFactory.ts` + adaptery per ekran
- Migracja wszystkich głównych list z filtrami (14+ screenId) — patrz wpis fazy 1 + lista w PR/komunikacie
- Usunięto `ListViewPresetsMenu` z toolbarów Zamówienia/Produkty

## 2026-06-08 — Globalny system widoków list (listView) — faza 1

- Backend: tabela `user_list_views`, REST `/api/ui/list-views/{screen_key}` (autosave + presety publiczne/prywatne)
- Frontend: moduł `preferences/listView/` — `useListViewState`, `ListViewPresetsMenu`, adaptery per ekran
- Pilot: Zamówienia (`orders.list`) + Produkty (`products.list`)
- Stare hooki `useFilterFieldOrder` / `useProductsListColumnOrder` — tryb `controlled` (cienkie wrappery)

## 2026-06-08 — Produkcja: obsługa 409 przy start-collecting

- Wspólne helpery w `productionUi.ts`: `formatStartCollectingError`, `batchHasMaterialShortages`, lista braków w toaście
- `BatchDetailPage` + `CollectingPage`: try/catch → `toast.error` (bez uncaught AxiosError)
- Blokada UX: przycisk/karta zablokowane gdy `has_shortages` (tooltip `START_COLLECTING_BLOCKED_TOOLTIP`)

## 2026-06-08 — Ustawienia → Firma: redesign UX (design system)

- Moduł `companySettings`: layout full-width, `TabsNav` (pomarańczowa linia), trasy `/settings/company/*`
- Zakładki konfiguracyjne bez KPI i bez powielonych nagłówków (tylko PageHeader w layoutcie)
- Wspólne komponenty: `PurchasingPageShell`, `PurchasingKpiGrid`, `PurchasingTableSection`, `AppButton`, tokeny formularzy
- Backend: `PATCH tenant-warehouses` obsługuje `is_default` (ustaw magazyn domyślny)
- Usunięto monolityczny `CompanySettingsPage.tsx` (~1160 linii)

## 2026-06-08 — Zakupy: ujednolicone miniatury produktów + inspektor

- `PurchasingProductThumbnail` / `PurchasingProductCell` — 40×40 px, `object-fit: contain`, hover preview (150 ms, preload, portal)
- `PurchasingProductInspectorDrawer` — klik słupka Top rotacja → drawer (zdjęcie, SKU, dostawca, sprzedaż, stan, sugerowane zamówienie)
- `PurchasingForecastBarTooltip` — karta produktu w tooltipie wykresu (miniatura 56 px, sprzedaż 30d, średnia dzienna, stan, w drodze)
- Migracja: Generator, Prognoza, PO detail, Segmenty, Alerty, Auto-uzupełnianie, Okazje cenowe, dashboard planowania

## 2026-06-08 — Produkcja / Receptury: redesign listy + miniatury

- `ProductThumb` bez ramek i szarego tła (Produkcja, OMS panel, WMS inwentaryzacja)
- Receptury: ikony akcji zamiast menu „…”, drawer składników, `PurchasingTableSection`
- `ProductionRowIconActions`, `RecipeIngredientsDrawer`

## 2026-06-08 — BDO: pełny redesign UX/UI

- Layout jak Produkcja/Magazyn: breadcrumb Asortyment → BDO → zakładka, tytuł + opis, TabsNav
- Wspólne komponenty: `BdoKpiGrid`, `BdoReportKpiGrid` (5 KPI), `BdoFilterBar`, `AppButton`, `AppCard`
- Wszystkie zakładki: PurchasingTableSection, AppEmptyState, filtry w pasku, formularze max-w 900–1200px

## 2026-06-08 — Produkcja: ujednolicenie siatki KPI

- `ProductionKpiGrid` (4 kolumny desktop) + `ProductionKpiCard` (`density="compact"`)
- Analiza kosztów: układ 4+3 zamiast 3+3+1; efektywność zawsze widoczna (— gdy brak danych)
- Pulpit, Planowanie, Historia — migracja na wspólne komponenty KPI

## 2026-06-08 — Planer floty: redesign UX + nawigacja modułu Wózki

- Trasa `/carts/optimizer` w shellu Wózki (breadcrumb, zakładki); redirect z `/optimizer`
- KPI: 4× `PurchasingKpiCard` (NEW, pojemność, sekcyjne, standardowe) + podsumowanie operacyjne po obliczeniu
- Akcje: Primary „Oblicz”, Secondary „Zatwierdź” (disabled bez wyniku)
- Wynik: 3 sekcje (flota, pojemność z progress bar, zamówienia z pokryciem %)

## 2026-06-08 — Zakupy i planowanie: redesign UX/UI (design system)

- Wspólne tokeny: `purchasingButtonTokens` (PRIMARY/SECONDARY/GHOST/LINK), `purchasingTableTokens`, `PurchasingInfoNotice`, `PurchasingSummaryStrip`
- KPI: ujednolicony `PurchasingKpiCard` (min-h 88px, ikony 8×8, uppercase label)
- Nagłówki tabel: jednolite tło `bg-slate-50`, `purchasingTableThClass`
- `AppEmptyState` density `inline` — zwarte puste stany w sekcjach tabel
- Auto-uzupełnianie: komunikat harmonogramu poza KPI (`PurchasingInfoNotice`)
- Alerty: akcje w `quickActions`, nie w sekcji analizy
- Historia współpracy: `PurchasingSummaryStrip` zamiast dużych kart
- Priorytety: mniejsza heatmapa (bez długich opisów w kafelkach)
- Zamówienia PO: `PurchasingPageShell` + `PurchasingTableSection`

## 2026-06-08 — Zakupy i planowanie: kompaktowy UX/UI (10 zakładek)

- Wspólne komponenty modułu: mniejsze KPI (`PurchasingKpiCard` bez min-height, p-4, text-2xl), gęstsze odstępy (`PurchasingContentArea`, `PurchasingPageShell`, `PurchasingFilterBar`, `PurchasingAnalysisSection`)
- `PurchasingDataPanel`: usunięto `flex-grow` — sekcje dopasowują wysokość do treści
- Pulpit, Generator, PO, Prognoza, Priorytety, Alerty, Auto-uzupełnianie, Oszczędności, Historia współpracy: `AppEmptyState` zamiast pustych kontenerów z dużym paddingiem
- Prognoza: wykresy 220/240px, czytelniejsze etykiety osi Y (truncate + szersza oś)
- Priorytety: kompaktowa heatmapa (mniejsze kafle, line-clamp opisów)
- Historia współpracy: jedna sekcja podsumowania zamiast dwóch pustych kart

## 2026-06-08 — Produkcja ERP: kolumna Akcje na końcu tabel

- Wszystkie listy modułu: Zlecenia, Planowanie (BatchesListPage), Receptury, Historia, Analiza kosztów — kolumna Akcje sticky right (tokens `productsListActions*`), ostatnia kolumna
- Pulpit: nagłówek „Akcje” w ostatniej kolumnie tabeli partii gotowych

## 2026-06-08 — Produkcja ERP (Zarządzanie produkcją): standard UI systemowy

- `ProductionErpModuleLayout`: `TabsNav` + breadcrumb (jak Dostawcy / Inwentaryzacja); pełnoekranowe szczegóły partii/receptury bez tabów
- Pulpit: 8× `PurchasingKpiCard`, alert braków z CTA „Przejdź do braków”, sekcja WMS jako `PurchasingTableSection` + `AppEmptyState`
- Zlecenia: filtry (status, operator, produkt, daty, priorytet), licznik wyników, tabela modułowa, menu akcji
- Planowanie: KPI nad tabelą partii (postęp, materiały, operator, termin)
- Receptury / Historia / Analiza kosztów: filtry, KPI, sortowanie (analiza), menu akcji zamiast linków „Otwórz”
- Badge statusów i priorytetów: `operationalSemanticBadges` (fiolet/niebieski/zielony/pomarańczowy/czerwony)

## 2026-06-08 — Inwentaryzacja (ERP): poprawki layoutu i menu akcji

- Dokumenty: kolumna Akcje przeniesiona na koniec tabeli (sticky right, jak Produkty)
- Menu akcji wiersza: portal + `position: fixed` (z-index 10050) — bez obcinania pod sidebar / overflow tabeli
- Kreator: przywrócony shell modułu (breadcrumb, tytuł, zakładki Pulpit/Dokumenty/Nowa/Raporty); kroki kreatora wewnątrz zakładki; pełna szerokość contentu

## 2026-06-08 — Inwentaryzacja (ERP): przebudowa UI na standard systemowy

- `InventoryLayout`: `TabsNav` + breadcrumb (jak Dostawcy / Materiały magazynowe); pomarańczowy CTA „Nowa inwentaryzacja”
- Pulpit: `PurchasingKpiGrid` × 6 + sekcje `PurchasingTableSection` (aktywne / do zatwierdzenia / zakończone)
- Dokumenty: licznik wyników, filtry (szukaj / status / typ), tabela modułowa, dropdown akcji (Otwórz / Edytuj / Duplikuj / Eksportuj / Usuń)
- Kreator: layout 2-kolumnowy (formularz + panel podsumowania), karty typu z pomarańczowym zaznaczeniem
- Raporty: karty raportów z badge statusu i eksportem PDF/XLSX
- Badge statusów: `inventoryDocumentStatusBadgeClass` (operational semantics)

## 2026-06-08 — Wózki / Wózki z koszykami: ujednolicony layout WMS

- Wspólny `CartsFleetList` (BULK + MULTI): `ListPageHeader`, KPI (`PurchasingKpiGrid`), sekcje grup pełnej szerokości
- `CartsFleetGroupActions`: Dodaj wózek (pomarańczowy), Edytuj (neutralny), Usuń grupę (czerwony)
- `CartCard`: ten sam układ flex + ikony akcji (`OperationalActionColumn`)
- Globalne zapełnienie w karcie zgodnej z design system

## 2026-06-08 — Regały (WMS): standard UI jak Nośniki / Produkty

- `ConsolidationRacksListPage`: `ListPageHeader` (breadcrumb Magazyn → WMS → Regały), KPI (`PurchasingKpiGrid` × 5), przycisk „Nowy regał kompletacyjny”
- Tabela proporcjonalna: `ConsolidationRacksListTable` — kolumna Akcje 120px sticky, ikony Podgląd / Edycja / Usuń (`OperationalActionColumn`)
- Pakiet: `frontend/src/components/consolidationRacks/rackList/*`

## 2026-06-08 — Nośniki (Wózki): płaski layout modułu + KPI + tabela standard

- `CartsModuleLayout`: breadcrumb → tytuł → `TabsNav` → treść (jak Materiały magazynowe); bypass pełnoekranowy dla szczegółu nośnika / edycji regału
- `WarehouseCarriersPage`: `ListPageHeader`, kafelki KPI (`PurchasingKpiGrid`), akcje w toolbarze, sekcje grup bez zagnieżdżonych ramek
- `CarrierGroupCard`: płaska sekcja (nagłówek + tabela), przycisk „Dodaj nośnik”
- `CarriersGroupTable`: proporcjonalna tabela modułu, kolumna Akcje 120px sticky, `OperationalActionColumn`

## 2026-06-08 — Zestawy: standard UI jak Produkty / Producenci / Dostawcy

- `BundlesPage`: `ListPageHeader` z licznikiem wyników i opisem sekcji; toolbar (Filtry, Widoczne pola, Eksport)
- Filtry: `ListFilterEmbeddedShell` + `FilterPanelBodyWithActions` (Wyczyść / pomarańczowy Filtruj) — bez `ModuleListFiltersCard`
- Tabela proporcjonalna: checkbox 56px, zdjęcie 80px (`ProductListPhotoCell`), nazwa 2fr, akcje 120px sticky; akcje wiersza: Podgląd / Edycja / Usuń
- Multiakcje: `ModuleBulkActionsToolbar` przez `BundlesListBulkBar` (Zaznacz… / Multiakcje / Eksport / Odznacz)
- Pusty stan: `AppEmptyState` z przyciskiem „Dodaj pierwszy zestaw”
- Pakiet: `frontend/src/components/bundles/bundleList/*`

## 2026-06-08 — Materiały magazynowe: nagłówek modułu jak Dostawcy

- `WarehouseMaterialsLayout`: breadcrumb → tytuł → `TabsNav` → treść (bez `WmsModuleLayout` / karty tabów)
- Listy kartonów i materiałów pakowych: usunięty zduplikowany `ListPageHeader`; toolbar jak na liście Dostawców
- Formularze edycji: breadcrumb `Asortyment > Materiały magazynowe > …`

## 2026-06-08 — Produkty (lista): standard tabel + bulk bar jak Zamówienia

- Pasek masowych akcji: `ModuleBulkActionsToolbar` przez `ProductsListBulkBar` (Wybierz akcję / Multiakcje / Drukuj / E-mail / Eksport / Odznacz)
- Tabela proporcjonalna: checkbox 56px, zdjęcie 80px, nazwa 2fr max 500px, akcje 120px; konfigurator kolumn (`FilterVisibilityModal`)
- Filtry: licznik w przycisku „Filtry (N)”, `ListPageHeader`, `TableProperties`
- Pakiet: `frontend/src/components/products/productList/*`

## 2026-06-08 — Materiały magazynowe: wzorzec formularza produktu + tabele list

- Formularze kartonów i materiałów pakowych: `WarehouseMaterialEditLayout` + `ProductLikePageLayout` (breadcrumb, hero 80px, zakładki z ikonami, Zapisz/Usuń/Duplikuj)
- Sekcje w kartach (`WmFormSectionCard`); edycja bez zakładek modułu (jak Produkty)
- Listy: proporcjonalne tabele z checkboxem, `ProductListPhotoCell`, konfigurator kolumn, filtry z licznikiem

## 2026-06-08 — Rentowność produktów: standard tabel + KPI zakupowe

- Tabela proporcjonalna (Akcje 80px, Zdjęcie 80px, Produkt 2fr max 500px), konfigurator kolumn pod ikoną tabeli
- Miniatury: wspólny `ProductListPhotoCell` (identyczny jak Asortyment → Produkty)
- Filtry: przycisk „Filtry” z licznikiem, panel `PurchasingFilterBar`, draft/applied
- KPI: `PurchasingKpiGrid` × 6 + `PurchasingKpiCard` z ikonami (jak Pulpit zakupów); filtry: `ListFilterEmbeddedShell` + pomarańczowy „Filtruj”

## 2026-06-08 — Zamówienia towaru: pełna strona edycji + tabela Akcje/Poz.

- Edycja PO: `/goods-orders/:id`, `/goods-orders/:id/:tab` (Podstawowe, Produkty) — shell jak Klienci/Dostawcy
- Nowe zamówienie: `/goods-orders/new` → szkic + redirect na stronę edycji
- Lista: bez modala; legacy `?edit=` → redirect
- Tabela: kolumna Poz. stała 52px; Akcje stała 176px, `flex-nowrap`, sticky prawo
- `proportionalTableColumns`: opcja `extraFixedColumnsPx` dla kolumn poza pulą fr

## 2026-06-08 — Producenci i Dostawcy: pełne strony edycji (wzorzec Klienci)

- Producenci: `/manufacturers/new`, `/manufacturers/:id`, `/manufacturers/:id/:tab` — breadcrumb, zakładki, shell `AssortmentEntityPageShell`
- Dostawcy: `/suppliers/new`, `/suppliers/:id`, `/suppliers/:id/:tab` — poza `SuppliersLayout` (bez podwójnego shella modułu)
- Zakładki dostawcy: Podstawowe (z adresem), Kontakt, Produkty, Warunki handlowe, Statystyki, Historia
- Listy: nawigacja zamiast popupów; legacy `?edit=` → redirect na stronę encji
- `SupplierEditModal` / `ManufacturerEditModal`: cienkie re-exporty (deprecated)

## 2026-06-08 — Zamówienia towaru: punktacja, KPI, filtry, tabela

- Nazewnictwo: Scoring → Punktacja (lista, KPI, modal, badge)
- KPI: `PurchasingKpiGrid` + `PurchasingKpiCard` (6 kafelków jak Pulpit/Ocena)
- Filtry: `PurchasingFilterBar`, siatka 6 pól, przyciski Wyczyść/Filtruj
- Tabela: proporcjonalne kolumny (Nazwa 2fr), Akcje 120px sticky, badge punktacji 90/70/50/0

## 2026-06-08 — Dostawcy: płaski shell modułu (wzorzec Zwroty)

- `SuppliersLayout`: breadcrumb → tytuł → `TabsNav` (bez karty wokół tabów) → outlet; jeden `PageLayout`
- Usunięto `WmsModuleLayout` (podwójna karta + ramka wokół tabów)
- `SuppliersPage`: bez wewnętrznego `PageLayout` i duplikatu breadcrumb/nagłówka
- Ocena / Historia: bez `PurchasingContentArea` i nagłówka strony w kontekście `/suppliers/*`

## 2026-06-08 — Dostawcy: Ocena i Historia w stylu Pulpitu zakupów

- KPI: `PurchasingKpiCard` + `PurchasingKpiGrid` (4 / 5 kolumn), ikony, układ liczba + opis jak dashboard
- Ocena: karta „Ranking dostawców” z nagłówkiem/opisem; tabela ze stylami dashboardu
- Historia: 5 KPI w jednym rzędzie, filtr dostawcy pod KPI, sekcje analityczne 2-kolumnowe, karta „Ostatnie dokumenty”
- `PurchasingKpiGrid`: nowa opcja `columns={5}`; obsługa `supplier_id` z URL na Historii

## 2026-06-08 — Lista dostawców: nowy standard tabel

- Tabela jak Producenci/Klienci: checkbox, Nazwa (system), kolumny konfigurowalne, Akcje 120px sticky
- Konfigurator kolumn (Widoczne pola), filtry rozszerzone, licznik `Filtry (N)`
- Proporcjonalny układ bez logo: Nazwa 2fr (250–500px), pozostałe 1fr
- API: `product_count`, filtry kraj/miasto/e-mail/telefon/waluta/MOQ/dostawa/min. produkty/zamówienia

## 2026-06-08 — Konfiguratory kolumn/filtrów: kierunkowe strzałki

- `FilterVisibilityModal` + `ColumnSelectorModal`: ← przed nazwą (Dostępne), → po wierszu (Widoczne), układ ⋮⋮ ↑ ↓ →
- Tooltipy: „Dodaj do widocznych” / „Usuń z widocznych” — wszystkie listy korzystające ze wspólnych komponentów

## 2026-06-08 — Lista producentów: nowy standard tabel

- Tabela jak Klienci/Pola dodatkowe: checkbox, kolumny konfigurowalne (localStorage), akcje 36×36
- Filtry: Tenant, Nazwa, Kraj, Status, NIP, Miasto, E-mail, Telefon, Dostawca; licznik `Filtry (N)` w nagłówku
- Logo: max 40×40, `ImageOff` bez ramek; kolumna Nazwa 3-liniowa; produkty jako link gdy >0
- API listy: filtry NIP/miasto/e-mail/telefon/dostawca + `supplier_count` w odpowiedzi

## 2026-06-08 — Akcje automatyczne: warunki multi-value + historia diff

- Warunki pól wyboru wielokrotnego: `value: string[]`, operatory „jest jednym z” / „nie jest jednym z”, `FilterMultiSelect` w modalu warunku
- Historia zmian konfiguracji: model `{ type, field, before, after, userId, createdAt }` w localStorage; diff przy zapisie reguły
- Edytor: zakładki **Historia zmian** / **Historia wykonań** (`AutomationRuleHistoryPanel`); moduł logs = tylko wykonania

## 2026-06-08 — Konfigurator zwrotów: uproszczenie UX (analiza + refaktor)

- **Statusy RMZ** → zwinięta sekcja „Workflow magazynowy” z opisem 3 pojęć (etykiety / decyzje / etapy dokumentu)
- **Decyzje:** usunięto „Widoczna dla magazyniera” z UI (pole zachowane w danych); aktywność na liście; karty pokazują skutek biznesowy
- **Modal decyzji:** tylko nazwa, kategoria, „Produkt wraca na magazyn”; bez code/sort_order
- **Integracje i API** zamiast „Zaawansowane” (RMZ, uszkodzenia, etykiety — kolejność)

## 2026-06-08 — Konfigurator statusów zwrotów: eksperymentalna przebudowa UX

- 4 sekcje kartami: Etykiety listy, Decyzje produktowe, Statusy RMZ (proces), Uszkodzenia
- Ukryto tabele techniczne, skróty WMS/Z-PZ, kody klas B/C na liście głównej
- Pola techniczne (code, transition_key, typ workflow, sort_order) → „Ustawienia zaawansowane” w modalach
- RMZ workflow włączone do konfiguratora (wcześniej osobna strona `/workflow-statuses`)
- Screenshoty mock: `/dev/returns-statuses-configurator-screenshots`, PNG w `returnsStatusesConfigurator/mockups/`

## 2026-06-08 — Słowniki zwrotów: przebudowa UX

- Pełna szerokość — usunięto panel „Podgląd formularza klienta”
- Rodzaje zwrotów: bez emoji; źródła: logotypy marketplace (`OrderSourceLogo` + SVG w `public/assets/marketplaces/`)
- Aktywność: checkbox inline w wierszu + auto-zapis (`persistConfig` w `ReturnsModuleSettingsPanel`)
- Kolejność: drag & drop (`@dnd-kit`); bez pola kolejności i sekcji „Zaawansowane” w modalach
- Modal rodzaju: tylko nazwa; modal źródła: marketplace + nazwa + aktywny
- `slugDictionaryCode()` generuje identyfikator systemowy automatycznie

## 2026-06-08 — Słowniki zwrotów (UI)

- Połączono zakładki „Rodzaje zwrotów” + „Źródła” → **Słowniki zwrotów** (`/orders/returns/dictionaries`)
- Układ 2-kolumnowy: karty rodzajów/źródeł + podgląd formularza klienta (radio na żywo)
- Edycja przez modale; legacy URL `/return-types`, `/sources` → przekierowanie

## 2026-06-08 — Konfigurator statusów zwrotów (UI)

- `/orders/returns/statuses`: układ 2-kolumnowy (grupy statusów + podgląd listy), tabela decyzji produktowych, modale edycji
- `/orders/returns/panel-statuses` → przekierowanie na `/orders/returns/statuses`
- Klasy/powody uszkodzeń w zwiniętej sekcji zaawansowanej (bez zmian API)

## 2026-06-08 — Zwroty: wspólny shell breadcrumb + zakładki

- `ReturnsModuleLayout`: jeden `ModuleListBreadcrumb` (🏠 > Zamówienia > Zwroty) + `ReturnsModuleTabsStrip` dla wszystkich zakładek modułu
- Usunięto lokalne duplikaty z `ReturnsListPanel`, `ReturnsModuleSettingsTabPage`, `ReturnStatusesPage`, `ReturnPanelUiStatusesSettingsPage`
- Szczegół RMZ (`/orders/returns/:id`) bez zmian — własna ścieżka nawigacji w widoku szczegółu

## 2026-06-08 — Module list: Orders vs Returns UX (wiersze)

- `ReturnsListProductCell`: klikalne rozwijanie `+X poz. ▼` / `Zwiń ▲` (stan lokalny, `stopPropagation`)
- `OrderListDenseTable`: akcje jako ostatnia kolumna, `OperationalActionColumn layout="stack"` (pionowy stos 40×40 jak zwroty)
- Kolumny zamówień: `Zamówienie | Status | Produkty | … | Akcje`; backend `items_display_lines` = pełna lista pozycji
- Dev/screenshot: `/dev/module-list-orders-vs-returns`, PNG w `moduleList/mockups/module-list-orders-vs-returns.png`

## 2026-06-08 — Zakupy Faza 3: operacyjny pulpit + unified KPI

- `PlanningDashboard`: copy operacyjne, 5 Quick Actions (Dostawcy, Oszczędności), nawigacja z tabel, poprawione nazwy sekcji PZ
- `PurchasingKpiCard`: styl „Balanced” (rounded-2xl, ikona po prawej, opcjonalny badge trendu)
- `PurchasingKpiGrid`: gap-6 — propagacja na wszystkie zakładki modułu

## 2026-06-08 — Zakupy Faza 2.5: cleanup UI po unifikacji

- Usunięto z barrel `ui/index.ts`: `purchasingFilterLabelClass`, `PurchasingSectionHeader` (komponent zostaje wewnętrzny w `PurchasingDataPanel`)
- `PurchasingTableHeader`: usunięto prop `compact`; domyślny padding nagłówka `px-3 py-3`; Pulpit + PO zachowują `px-6 py-4` przez wariant `children`
- Przeszukanie `modules/purchasing/**`: brak dodatkowych martwych helperów / nieużywanych importów do usunięcia

## 2026-06-08 — Zakupy Faza 2: Alerty + Generator UX

- `PurchasingAlertsPage`: usunięto lokalne `KpiCard`/`SectionCard` → `PageShell` + wspólne KPI/Filter/Table/Analysis
- `PurchasingReplenishmentPage`: chipy KPI → `KpiGrid`, filtry → `FilterBar`, tabela → `TableSection` + sticky `TableHeader`
- `PurchasingTableHeader`: rozszerzony o `children`, `sticky`, `className`; naprawione klasy align (bez dynamic Tailwind)
- Wszystkie strony list zakupów: inline `<thead>` → `PurchasingTableHeader` (oprócz PO detail / modal preview)
- Zero zmian API / logiki biznesowej

## 2026-06-08 — Zakupy Faza 1: UX Consistency Pass

- Wspólne komponenty: `PurchasingKpiGrid`, `PurchasingFilterBar`, `PurchasingTableSection`, `PurchasingAnalysisSection`, `PurchasingPageShell`, `PurchasingQuickActions`
- `PurchasingKpiCard`: opcjonalna nawigacja (`to`) — klikalne KPI na Pulpicie
- Pulpit: Quick Actions → Generator / Alerty / PO; KPI linkują do replenishment, orders, suppliers/analytics
- Ujednolicony układ (Header → KPI → Filtry → Analiza → Tabela) na: Prognoza, Ocena dostawców, Historia, Priorytety, Auto-uzupełnianie, Oszczędności
- Zero zmian API, routingu, logiki biznesowej, struktury zakładek

## 2026-06-08 — PZ: UX akceptacji różnicy dostawy (bez backendu)

- Menu ⋯: „Zaakceptuj różnicę dostawy” gdy `ordered > received` (lokalny stan sesji)
- Badge „Niedobór zaakceptowany” / „Różnica zaakceptowana” w tabeli i szczegółach
- Szczegóły pozycji: Zamówiono / Przyjęto / Brak
- Ukryta „Dodaj blokadę sprzedaży” przy `received <= 0`
- Zero zmian API, modelu, inventory, sales_block

## 2026-06-08 — Zakupy i planowanie: UI refactor (prototyp)

- Nowy shell: `PurchasingModuleLayout` — sticky zakładki w ramce, podmiot + odśwież w pasku
- Wspólne komponenty UI: `modules/purchasing/ui/*` (KPI, tabele, panele, statusy)
- Widoki lazy-loaded: `PlanningDashboard`, `PurchaseGeneratorView`, … `SavingsView`
- Kontekst: `PurchasingModuleContext` + `usePurchasingTenant` (tenant z URL, global refresh)
- Pulpit przepisany na nowy design z ikonami lucide; generator/PO zaktualizowane wizualnie
- Zero zmian API / logiki biznesowej


- `backend/db/postgres_sequence_sync.py` — idempotent sync all integer PK sequences vs MAX(id)
- Tier 0 startup + `migrate_sqlite_to_postgres` post-step
- SQL: `backend/migrations/postgres_sync_all_sequences.sql`
- Fixes bundle STOCK shadow `products_pkey` after import/migration desync

## 2026-06-08 — B1 bundle STOCK EAN validation fix

- `_validate_identifier_uniqueness`: product EAN check mirrors `uq_product_tenant_ean` (includes soft-deleted rows)
- PUT/POST bundle → HTTP 400 `"EAN jest już używany przez inny produkt."` zamiast 500
- Safety net: `map_product_integrity_error` w routerze (adapter + commit)
- Testy: `test_bundle_stock_identifier_validation.py`

## 2026-06-08 — P2.1A Warehouse Context UX Fix

- `useActiveWarehouseContext()` + banner „Wybierz aktywny magazyn.”
- Formularze tworzące encje magazynowe: `warehouse_id` z aktywnego kontekstu topbar
- Raport: `memory/p2.1a-warehouse-context-ux-report.md`

## 2026-06-08 — P2.1 Multi Warehouse Hardening

- PO: `warehouse_id` wymagane w generatorze i alertach (`ERR_PO_WAREHOUSE_REQUIRED`)
- Usunięto auto-assign PZ (`maybe_auto_assign_single_warehouse_on_pz`) i single-WH fallback w resolve/receiving-target
- Frontend: usunięte hardcoded WH w reklamacjach, inwentaryzacji, import zamówień, regałach, create order
- Skrypt legacy: `backend/scripts/report_deliveries_missing_warehouse.py`
- Testy: `test_purchase_order_warehouse_hardening.py`, `test_multi_warehouse_hardening.py` (10 passed)
- Raport: `memory/p2.1-multi-warehouse-hardening-report.md`

## 2026-06-08 — P4.18 Bundle Warehouse Intelligence

- Serwisy read-only: analytics, slotting, replenishment, capacity (`backend/services/bundles/intelligence/`)
- API `/bundles/intelligence/*` — dashboard, slotting, replenishment, capacity
- Frontend: `/analytics/bundle-intelligence` (4 zakładki raportu)
- Testy: `test_bundle_intelligence.py` (25+)
- Raport: `bundle-warehouse-intelligence-report.md` — rekomendacje only, bez automatyzacji

## 2026-06-08 — P4.17A Bundle Scanner UX Integration

- Picking/packing/returns/bulk scan — integracja `bundleScannerIntegration` z globalnym skanerem WMS
- Komponenty: `BundlePickingScanCard`, `BundleVerifiedBadge`, `BundleTraceabilityStrip`, RK/RMZ/reklamacje
- Ekran `WmsBundleBulkScanPage` (`/wms/picking/bundle-bulk-scan`)
- Testy frontend: 22 w `bundleScanFlow.test.ts`
- Raport: `bundle-scanner-ux-report.md` — **READY FOR P4.18**

## 2026-06-08 — P4.17 Bundle Logistic Unit & EAN Automation

- `resolve_bundle_barcode()` — EAN produktu/bundle, SKU, kod wewnętrzny
- Scan orchestration: pick/pack/returns/complaints (ON_DEMAND vs STOCK)
- Model `BundleLogisticUnit` + migracja `bundle_logistic_units`
- API `/bundles/logistics/*`; bulk STOCK scan; RK view; wave aggregation helpers
- Frontend: `bundlesLogisticsApi.ts`
- Testy: 42 w `test_bundle_logistics.py`; pakiet bundle 178 passed
- Raport: `bundle-logistic-unit-report.md` — **READY FOR P4.18**

## 2026-06-08 — P4.16 Bundle Traceability & Lot Tracking

- Model `order_line_bundle_component_lots` + migracja schema
- `bundle_lot_snapshot_service` — persist po finalize pick / WZ issue
- Traceability API A–D, recall report, lot-trace + bundle-lots reports
- Rozszerzenie drzew zwrotów/reklamacji o `lots[]`; UI partii w RMZ panelu
- Testy: 25 w `test_bundle_traceability.py`; raport `bundle-traceability-report.md`

## 2026-06-08 — P4.15B Bundle Operational UX Layer

- Projekcje UX: `bundle_operational_ux_service`, rozszerzone `picking_lines()` metadata
- Picking API: `bundle_breakdown`, `order_bundle_trees`, bundle fields on order rows
- Packing API: `bundle_trees` + line bundle fields
- UI: drzewo bundle w pickingu i pakowaniu; breakdown SKU multi-order
- Single/multi filter + cart volume fix (operational lines only)
- Testy: `test_bundle_operational_ux.py`; raport `bundle-operational-ux-report.md` — **READY FOR TRACEABILITY**

## 2026-06-08 — P4.15A Bundle operational execution review

- Przegląd WMS: picking, EAN, regały, nośniki, pakowanie, cross-dock, multi-order/fala
- Werdykt: **CHANGES REQUIRED** — raport `bundle-operational-readiness-report.md`
- Proponowany P4.15B (UX pick/pack + agregacja) przed P4.16 lot snapshot
- Bez implementacji lot snapshot / recall / EAN bundle

## 2026-06-08 — P4.15 Bundle returns, complaints & corrections

- Model `return_line_bundle_components`; RMZ `bundle_return_scenario` / `bundle_return_status`
- Refund engine ze snapshotu; PZ per składnik (ON_DEMAND) / SKU (STOCK)
- API: `/orders/{id}/bundle-return-tree`, PUT bundle-components, raporty
- UI: `BundleReturnLinePanel` (checkboxy składników, preview refundu)
- Testy: 38 w `test_bundle_returns_complaints.py`; raport `bundle-returns-complaints-report.md`
- Poza scope: EAN bundle scan, lot snapshot, recall, OrderCancellationService

## 2026-06-08 — P4.14A Bundle warehouse documents layer

- `warehouse_document_lines()` / `warehouse_receipt_lines()` — projekcje COMMERCIAL vs WAREHOUSE
- `bundle_warehouse_document_service` — SSOT linii dokumentów dla zamówień z bundle
- Integracja: `stock_document_service`, walidacja WZ w `direct_sale/wz_service`
- Testy: 20 + raport `bundle-warehouse-documents-report.md`

## 2026-06-08 — P4.14 BundleLineResolver (SSOT)

- Pakiet `backend/services/bundles/`: `BundleLineContext`, `BundleLineResolver`, projekcje (commercial, picking, reservation, warehouse_issue, margin, return, complaint)
- Snapshot: `order_id`, `unit_price_net_snapshot` na `order_line_bundle_components` + migracja P414
- Marża OMS order read → `margin_from_context()` z resolvera
- Eksplozja ON_DEMAND wzbogaca snapshot o ceny składników
- Testy: `test_bundle_line_resolver.py` (23); raport: `bundle-line-resolver-report.md`
- Bez: RMZ/reklamacje/korekty bundle UI, nowych endpointów HTTP

## 2026-06-08 — P4.13B Bundle P0 stabilization (pre–BundleLineResolver)

- **SSOT:** `bundle_order_item_ops.sqlalchemy_operational_picking_order_item_clause()` — zastąpienie lokalnych `is_bundle_parent=False` w falach, dashboardach, konsolidacji, symulacji, routingu, recovery
- **STOCK_PRODUCTION:** parent traktowany jak normalny SKU; **ON_DEMAND:** pick/braki tylko na składnikach
- **Footprint:** `order_footprint_service` liczy wyłącznie linie operacyjne
- **Testy:** `test_bundle_p0_stabilization.py` (14 passed z architekturą)
- **Docs:** `bundle-stabilization-report.md`, `bundle-order-cancellation-analysis.md`, `bundle-traceability-audit.md`
- **Werdykt:** READY FOR BUNDLELINERESOLVER

## 2026-06-08 — User warehouse assignments + active warehouse context

- **Model:** `user_warehouse_assignments` (backfill z `app_user_warehouses`); `user_wms_profiles.active_warehouse_id`
- **API:** `GET /auth/me/warehouse-context`, `PUT /auth/me/active-warehouse`; login ustawia domyślny magazyn
- **Frontend:** `WarehouseContext` z kontekstu serwera; globalny przełącznik „Magazyn:” w headerze
- **Backward compat:** brak przypisań → dostęp do wszystkich magazynów (jak dotąd); 1 magazyn → bez selektora

## 2026-06-08 — Offer Stock Pools MVP (Availability Sources)

- **Model:** `offer_stock_pools`, `offer_stock_pool_warehouses`, `product_sales_offers.stock_pool_id`
- **Serwis:** `offer_stock_availability_service.offer_pool_available_qty` — suma `offer_available_qty` po magazynach puli (filter `participates_in_network_stock`)
- **API:** CRUD pul `/offer-stock-pools`; oferty: `stock_pool_id` w PATCH, `available_qty` z puli
- **UI:** Ustawienia → Sprzedaż → Pule stanów; dropdown „Źródło stanu” w ofercie produktu
- **Testy:** Pool A (W+P)=50, B (G)=40, C (all)=90

## 2026-06-08 — Z-PZ UI komplet + numeracja globalna bez zer

- **Numeracja:** domyślne `padding_length=0` (model, schema, API); repair serii WAREHOUSE; RMZ bez `:05d`
- **Kafelek aktywnego Z-PZ:** tylko `/wms/returns`, max-w-sm, RMZ/pozycje/sztuki/data + Zamknij
- **Szczegóły Z-PZ:** pełny ekran `/documents/warehouse/z-pz?id=` (Sellasist: nagłówek, podsumowanie, tabela + RMZ)
- **Menu dokumentów:** dedupe po etykiecie + stock_type w katalogu API (fix duplikat PZ)

## 2026-06-08 — Numeracja magazynowa bez paddingu + widok Z-PZ (Sellasist)

- **Numeracja:** wszystkie serie WAREHOUSE (PZ, MM, WZ, RW, PW, ZD, Z-PZ) + RMZ bez wiodących zer; migracja `padding_length=0`; `_next_rmz_number` → `RMZ-2026-1`
- **API read Z-PZ:** pozycje z `return_decision_label` (A/B/C), `source_rmz_id`, `source_rmz_number`; nagłówek `closed_at` przy CLOSED
- **Frontend:** dedykowany `WarehouseZPzDocumentDetail` w modalu dokumentów magazynowych (nagłówek + tabela pozycji + link do RMZ)

## 2026-06-08 — Z-PZ poprawki: panel, numeracja, lista, auto-druk

- **Panel WMS:** kompaktowy kafelek (numer, AKTYWNY, pozycje/sztuki, data, Zamknij)
- **Ustawienia WMS → Zwroty:** checkbox auto-druk + wybór szablonu etykiety; `POST /labels/print/z-pz`
- **Numeracja:** brak paddingu domyślnie (`Z-PZ-2026-1`); seria Z_PZ `padding_length=0`
- **Dokumenty magazynowe:** `Z_PZ` w katalogu/menu (dedupe segmentów, kolejność MM→Z-PZ); lista OTWARTY/ZAMKNIĘTY

## 2026-06-08 — Z-PZ zbiorczy: OPEN do ręcznego zamknięcia (nośnik zwrotów)

- **Backend:** status `OPEN` / `CLOSED`; wyszukiwanie aktywnego Z-PZ bez filtra daty (`collective_z_pz_service.py`)
- **API:** `GET/POST /api/wms/returns/active-z-pz` (+ `/close`) — zamknięcie → `relocation_status=OPEN`, kolejka rozlokowania
- **Migracja:** `draft`→`OPEN` dla starych zbiorczych; indeks `ux_stock_documents_collective_z_pz_open`
- **Frontend:** panel „Aktywny dokument zwrotów” na `/wms/returns`; etykieta druku (QR + kod kreskowy)
- **Seria dokumentów:** opis checkboxa „zbiorczy Z-PZ” — operator zamyka nośnik, nie dzień kalendarzowy

## 2026-06-08 — Z-PZ schema sync (fix 500 orders/stock-documents)

- **`backend/db/z_pz_schema.py`**: `ensure_z_pz_schema()` — jawna, idempotentna migracja kolumn Z-PZ (PG + SQLite)
- Startup: `require_z_pz_schema_or_raise()` przed tier0/API; log `[Z_PZ_SCHEMA] …=OK|MISSING`
- `main.py`: rozdzielone try/except migracji stock_documents; Z-PZ przed `migrate_wms_pz_workflow_statuses`
- Tier0 SQL probes: kolumny Z-PZ w `stock_documents` / `stock_document_items`
- Test: `backend/tests/returns/test_z_pz_schema_startup.py`

## 2026-06-08 — WMS zwroty (RMZ/RMA): transakcyjny commit + upload zdjęć

- **Upload 422:** axios usuwa `Content-Type` dla `FormData`; log `[returns.damage.upload]`
- **Backend:** `commit_workflow=false` (domyślnie) na `split-process` / `process` — bez sync OMS; nowy `POST …/commit-wms`
- **Frontend:** decyzje lokalne bez natychmiastowego API; **ZAPISZ** gdy wszystkie linie rozstrzygnięte; confirm przy DAMAGED bez zdjęć; upload fail nie blokuje decyzji

## 2026-06-08 — Snapshot operacji magazynowych: fix 500 po zwrocie RMZ

- **Przyczyna:** alert rozlokowania używał `category="Rozlokowanie PZ"` poza enumem Pydantic → 500 gdy po RMZ/PZ_RT pojawiał się towar do rozlokowania
- **Fix:** kategoria `"Rozlokowanie"` + `_normalize_alert_category()` jako fallback
- **Odporność:** każda sekcja snapshotu w `try/except` z `[warehouse.snapshot] section=…`; endpoint zwraca pusty snapshot zamiast 500 przy total failure
- **Frontend:** `getWarehouseOperationsSnapshot` zwraca `null` zamiast rzucać — nie blokuje workflow zwrotów

## 2026-06-08 — Podgląd lokalizacji: fix pustej mapy + większy shelf view

- **Mapa:** jawna wysokość kontenera (`min(52vh,520px)`), `useDesignerCanvas(null)`, auto-fit na aktywny regał — naprawia pusty lewy panel (flex `h-full` = 0px)
- **Regał:** `RackSideViewGrid` `embeddedPreview` — większe sloty, etykiety, subtelny highlight; dane zajętości dla aktywnego slota
- **UI:** białe tła zamiast szarych placeholderów w modalu i liście produktów

## 2026-06-08 — Podgląd lokalizacji: powrót do design systemu + projektant magazynu

- **Usunięto** ciemny/neonowy custom map (digital twin, cyberpunk HUD)
- **Mapa:** `WarehouseLayoutRenderer` (read) + ten sam layout co projektant magazynu (`GET /warehouse/layout`)
- **Regał:** `RackSideViewGrid` — nomenklatura systemowa (`A1-A-1` via `resolveWarehouseLocation`)
- **Modal:** jasny enterprise (white/slate), spójny z `ProductLocationMapModal`

## 2026-06-08 — Podgląd lokalizacji: industrial digital twin (v2) — **COOFNIĘTE**

- Ciemna posadzka hali (tekstura, vignette, siatka techniczna) zamiast szarego wireframe
- Regały: metalowe słupy, segmenty, belki, cień na podłodze — nie kafelki/buttony
- Alejki wyliczane z pozycji regałów: pasy ruchu, strzałki, numeracja A-/V-
- Strefy: subtelne wash + etykiety (Kompletacja, Przyjęcie, Składowanie…)
- Modal = warehouse navigation center (dark HUD); regał front z konstrukcją i glow TU

## 2026-06-08 — Podgląd lokalizacji WMS: layout magazyn-first

- Modal: **72% plan magazynu** (mapa + regał fizyczny), **28% info + zawartość**
- Usunięto mini-mapkę z kolorowymi kwadratami; plan z alejkami, strefami, skalą, cieniami
- Regał: konstrukcja pionowa, poziomy, sloty, glow + badge TU
- Panel info skrócony (więcej pod rozwijanym linkiem); karty produktów większe

## 2026-06-08 — Nośniki: wizualny podgląd lokalizacji (LocationPreviewModal)

- Klik badge lokalizacji → modal z mapą regałów, widokiem pionowym regału, zawartością nośnika
- API: `GET /api/wms/locations/{id}/visual-context`
- Komponenty: `LocationPreviewModal`, `LocationPreviewWarehouseGrid`, `LocationPreviewRackView`

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
