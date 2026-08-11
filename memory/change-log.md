## 2026-08-11 — Napraw ładowanie fontu Inter

- Usunięty `@import` Google Fonts z `index.css` (404 na fonts.gstatic.com/*.woff2)
- Inter 400/500/600/700 z `@fontsource/inter` (self-hosted w bundle)
- `font-family: Inter` + Tailwind `sans` bez zmian rozmiarów WMS

## 2026-08-11 — Lokalizacja źródłowa w widoku ilości zbierania

- Tylko `PickingQtyPanel`: belka `[←] [lokalizacja]` u góry (pełna szerokość)
- Label z `manualLocId ?? activeLocationId` (kontekst pobrania), nie `locations[0]`
- Lokalizacja nie w kafelku produktu; ← wraca do detail bez anulowania sesji

## 2026-08-11 — Przywróć wybór rodzaju zamówień przed zbieraniem

- Nowa tura zawsze: status → order-type → (cart) → products
- Usunięte pomijanie order-type przez cartId / require_cart / domyślne `all`
- Wznowienie tylko z jawnym order_type + cart/cartless
- Karty: „Produkty do zebrania” / „Produkty: zebrano X / Y”

## 2026-08-11 — Napraw flow szczegółów produktu i autoryzację zbierania

- Usunięty auto-open qty (regresja z 97b1271f); detail obowiązkowy
- Przywrócone: Zebrane, lokalizacja na kafelku, sekcja Zamówienia + BRAK badge
- Qty ← wraca do detail; skan produktu/lokalizacji → qty (nie auto-confirm)
- 401: shared axios paths; POST picking-terminal z auth; bez maskowania błędów auth

## 2026-08-11 — Kolejność dostaw: CTA z rzeczywistego workflow PZ

- Membership przez `derive_warehouse_workflow_status` (P2.5A), nie „≠ CLOSED”
- W kolejce: NEW, COUNTING, COUNTED, PUTAWAY_IN_PROGRESS
- Poza: PUTAWAY_COMPLETED, CLOSED (+ cancelled)
- CTA: Rozpocznij/Kontynuuj przyjęcie | Rozpocznij/Kontynuuj rozlokowanie
- Sort tylko `delivery_queue_sort` (+ created_at); priority niezależny od statusu/sortu

## 2026-08-11 — Kolejność dostaw: kolejka z otwartych PZ (nie Supply Flow)

- Root: ekran czytał `supply-flow/plan` / InboundDelivery; PZ NOWE nie były źródłem kolejki
- Nowy SSOT: `GET /wms/delivery-work-queue` z PZ wymagających przyjęcia/rozlokowania
- Persystencja: `stock_documents.delivery_queue_sort` + `delivery_queue_priority`
- FE KolejnoscDostawPage: lista PZ, priorytet, ↑↓ kolejność, CTA do receiving/putaway

## 2026-08-11 — Hierarchia lista vs produkt (lokalizacja + ←)

- Lista: lokalizacja tylko w kafelku (compact, prawy górny róg) — nie belka/nagłówek
- Produkt/liczenie: lokalizacja tylko jako belka obok ← (`variant="bar"`)
- `PackingLocationPill.fullWidth` — lista bez `w-full` (nie rozciąga badge’a jak belka)
- ← z produktu/qty → zawsze lista produktów (z zachowaniem cartId)

## 2026-08-11 — Flow zbierania 1:1 (status → rodzaj → popup wózka → lista → produkt)

- Status (UI bez zmian): klik bez sesji → zawsze order-type (nie skan na statusach)
- Order-type: kafelki „Liczba produktów zebranych” + `0/8`; po kliku → cart lub produkty
- Cart: modal „Zeskanuj wózek…”; wolny wózek startuje sesję (backend-first, bez fałszywego ACTIVE)
- Lista: `← Do zebrania: X/Y`; EAN badge; lokalizacja; Zebrano/BRAK
- Produkt: belka lokalizacji + qty panel `[-][n][+]` + Zatwierdź; auto-open gdy 1 loc

## 2026-08-11 — UX statusów + naprawa 409 skanu wolnego wózka

- Root: orphan ASSIGNED bez sesji → resolve-cart 409 + FE snapshot „masz sesję”
- BE heal orphan; active-session tylko przy otwartej sesji; resolve-cart code ACTIVE_PICKING_SESSION
- FE: skan backend-first; clearPickingCart bez sesji; empty state + hierarchia kart

## 2026-08-10 — Spójny przepływ zbierania (status → sesja → produkty → cancel)

- Usunięty in-card CTA i czerwony banner; centralny prompt + skaner SSOT
- Skan własnego wózka otwiera/kontynuuje sesję (bez „masz już…”, bez resolve-cart)
- BE: brak fallbacku sesji na obcy typ kafelka; FE merge active-session po typie
- Cancel: cart → cancel-session; products/detail cichy skan własnego wózka
- Meta: badge wózka + Do zebrania; tile bez przycisku skanu

## 2026-08-10 — Prezentacja „Zeskanuj wózek” na statusach

- Usunięty czerwony banner pełnej szerokości
- Po wyborze statusu wymagającego wózka: wyśrodkowany lekki komunikat + przycisk (BULK vs BASKETS)
- Karty statusów bez CTA skanu; logika assign/scan bez zmian

## 2026-08-10 — Uporządkuj obsługę aktywnych sesji zbierania

- Skan własnego wózka na liście statusów → otwiera sesję (products), nie toast
- Progres produktów tylko na karcie z moją sesją; CTA ukryte przy globalnej sesji wózkowej
- Nazwa statusu 19px/bold; BE active-session + products_picked/total

## 2026-08-10 — Napraw sesje i skanowanie wózków w zbieraniu

- Statusy: always-on scan handler; active-session SSOT; CTA niemożliwe przy aktywnej sesji
- Products: CART-* zawsze consumed (bez resolve-cart / consumed=false)
- BE: fallback bind sesji gdy source_status_id meta nie pasuje do kafelków

## 2026-08-10 — Napraw obsługę aktywnego wózka w zbieraniu

- FE statusy: brak fallbacku skanu na obcy `expected_cart_type`; CTA tylko bez aktywnej sesji
- BE: SSOT `wms_picking_active_session` + pole `has_operator_active_session` / `session_source_status_id`
- Sesja przypisana tylko do swojego `source_status_id` — nie doklejaj wózka do innych kafelków
- resolve-cart odrzuca skan gdy wózek już w sesji operatora; mixed modes → BULK

## 2026-08-10 — Napraw spójność sesji zbierania

- Root cause: sesja wózkowa ma `picking_session_id` + `cart_id`; FE traktował to jak cartless
- Fix FE: `isCartlessPickingSession` / merge; cancel po cart_id; skan wózka na products = consumed ignore
- Fix BE: product-lines remap session→cart; cancel-cartless→cancel_picking; tile mixed→BULK
- Projekcja ścisła po `source_status_id` z meta sesji

## 2026-08-10 — Uspójnij wznowienie sesji zbierania

- Skan wózka = tylko start nowej sesji; aktywna sesja → od razu lista produktów
- BE: nie waliduj typu wózka przy PICKING / ASSIGNED z otwartą sesją (źródło „Niewłaściwy wózek”)
- FE: `resolveAfterStatusWithConfig` resume by `cartId`; cart-scan redirect; brak confirm-scan
- Status: CTA skanu tylko bez `active_cart_id`; po skanie start → navigate products

## 2026-08-10 — Uspójnij sesję zbierania i przypisanie wózka

- BE: `wms_picking_session_projection` — produkty sesji jak na liście produktów (nie wolna kolejka)
- API statusów: `session_products_picked/total`, `active_session_id`; hub order-type session-aware
- FE: karta statusu pokazuje produkty sesji; CTA skanu tylko bez aktywnej sesji/wózka
- Skan: „Potwierdź przypisany wózek” gdy sesja zna cartId; odrzut innego wózka z PL msg
- Produkty: brak default-cart gdy tryb wymaga skanu; subtitle `Wózek: …`
- Anulowanie: bez nowego silnika — `cancel_picking` + rollback Inventory lokalizacji

## 2026-08-10 — Badge używanego wózka na statusach zbierania

- Kafelki z trybem skanu / koszyków: `Wózek: {nazwa|kod}` gdy operator ma przypisany wózek
- API: `active_cart_code` / `active_cart_name` na `GET /wms/picking/configured-statuses`
- FE: fallback do snapshotu skanu; bez pustego badge

## 2026-07-24 — 5 poziomów wielkości czcionki WMS (Ogólne)

- Dozwolone: 12 / 14 / 16 / 18 / 20 px; domyślna 16 (było 16|18|21, domyślna 18)
- BE + FE + panel „Przywróć domyślne”; nieprawidłowe (np. 21) → normalizacja do 16
- Bez nowego systemu ustawień — ten sam SSOT `wms_general_settings`

## 2026-08-10 — Zbieranie: czysty biały UI (Sellasist layout, Sasist badges)

- Lista/detal: minimalistyczne karty, `Do zebrania: X/Y`, sticky „Zebrane” + menu ⋮ (Opcje)
- Badge lokalizacji = istniejący `PackingLocationPill` (Sasist)
- Order-type + cart-scan uproszczone wizualnie; logika skanu/finalize bez zmian
- Kit UI: `frontend/src/components/wms/picking/Picking*`

## 2026-08-10 — Ustawienia WMS „Ogólne”: wielkość czcionki

- Nowa zakładka „Ogólne” (współdzielone ustawienia trybów)
- Trzy selecty 16/18/21 px: bazowa, lokalizacja, ilość (domyślnie 18)
- Persist: `wms_general_settings` + `/wms/settings/general`
- Operator shell: CSS vars `--wms-font-*`; packing/picking nowe widoki przez `wmsTypoClass`
- Bez osobnych ustawień mobile i bez auto-zmniejszania czcionki na kolektorze

## 2026-08-10 — Start zbierania: ekran „Wybierz” + skan wg konfiguracji

- Po statusie zawsze `/picking/order-type` (kafelki single/multi/all wg trybów konfiguracji)
- „Wszystkie” tylko gdy obie ścieżki mają tę samą bramkę skanu wózka
- `GET /wms/picking/order-type-hub` — zamówienia + produkty X/Y per typ
- Po wyborze: skan wózka / cartless / default-cart wg `single_mode`/`multi_mode`

## 2026-08-10 — Kafelki statusów zbierania: Realizowane przez innych/Ciebie

- `GET /wms/picking/configured-statuses`: `order_count` + `in_progress_by_me` + `in_progress_by_others`
- SSOT: wolne (`cart_id`+`picking_session_id` NULL); aktywne = wózek PICKING / otwarta sesja cartless
- FE: `WmsFlowStatusTileButton` work + `showRealizationCounts` (zera widoczne)

## 2026-08-10 — Terminal zbierania end-to-end + kompaktowe „Wykorzystane statusy”

- Badge’e wykorzystanych statusów: kompaktowe `h-9` / `w-fit` (bez rozciągania)
- Ustawienia Terminal: SSOT `wms_picking_terminal_settings` + GET/POST `/wms/settings/picking-terminal`
- Egzekwowanie w quick-pick / cartless / confirm-remaining: skan produktu, lokalizacji (FE policy), rezerwy
- Tooltipy „i” przy opcjach; komunikaty operatora w katalogu skanów (PL)

## 2026-08-09 — Konfigurator zbierania: wybór i filtr statusów

- Przyczyna: `OrderUiStatusField` portal `z-[130]` pod modalem `z-[5000]` — lista nieklikalna
- Fix: `floatingZIndexClass` + Escape nie zamyka modala gdy picker otwarty
- Eligibility: źródło = aktywne NEW/IN_PROGRESS (bez zajętych źródeł); cel = aktywne IN_PROGRESS + starty pakowania z API
- Walidacja zapisu/edycji z komunikatami PL; helper `pickingConfigStatusEligibility.ts` + testy

## 2026-08-09 — Packing „Akcja” activators execute real automation

- Extracted `frontend/src/utils/orderAutomationRun.ts` (visibility + execute + exclusive gate)
- Packing buttons call runner; success toast / red scanner error; busy spinner
- Tests: `orderAutomationRun.test.ts`
- Updated packing help for `show_automation_buttons`

## 2026-08-09 — Pakowanie: lista tylko ze skonfigurowanego statusu źródłowego

- **Przyczyna:** `_packing_queue_status_ids` dokładło wszystkie IN_PROGRESS z „pak”/„pack” w nazwie; eligibility dopuszczało `READY_TO_PACK`/`PACKING` bez filtra `order_ui_status_id`
- **Fix:** kolejka = wyłącznie wybrany `status_id`; zawsze `order_ui_status_id IN (status_ids)`; liczniki FE rozłączne z tej samej listy; overlay zielony na w pełni spakowanych kartach produktu
- Test: `test_packing_queue_single_source_status.py` + `ordersListStats.test.ts`

## 2026-08-09 — Packing finish #1249: otwarte zbieranie vs fake complete

- **Przyczyna 400:** 2× Cat x3 niezebrane → `has_recovery_work`; komunikat myląco o „dogrywce”; UI/`PACKING_FINISHED` mogły udawać komplet po samych pickach
- **Fix:** `required_pack_qty` = min(after_shortage, picked); `lines_packed_complete` wymaga braku recovery/OMS/relocation; `picked_quantity_final` nie dopycha 0→fulfillable; czytelny komunikat PL
- Test: `test_order_1249_partial_pick_recovery_blocks_finish_and_fake_complete`

## 2026-08-09 — Pakowanie: kompaktowy wybór opakowania

- Przebudowa `PackingCartonGateModal` (ten sam flow): białe tło, kompaktowy nagłówek (szablon / tytuł / wybrane), grid do 5 kolumn
- Karty: zdjęcie, nazwa, wymiary, badge REKOM. (`is_best`), prawdziwy CODE128 (JsBarcode) z EAN/SKU/id
- Skan kodu = ten sam `onSelectCarton` co klik; `ScannerHandler` nie czyści handlera przy `enabled=false`
- Backend (minimal): `barcode`/`ean` w `WmsPackingRecommendedCarton` + mapowanie w `_carton_row_to_recommended`

## 2026-08-09 — Zestaw STOCK: HTTP 500 przy tworzeniu zlecenia produkcyjnego

- **Przyczyna:** `production_orders.recipe_id` w DB = NOT NULL (legacy CREATE); BOM zestawu (`product_compositions`) nie ma `source_recipe_id` → INSERT z `recipe_id=NULL` → IntegrityError → 500
- **Fix:** `ensure_production_orders_recipe_id_nullable` (PG DROP NOT NULL / SQLite rebuild); CREATE TABLE nullable; migracja schema `2026.08.09.1`
- Test: `test_bundle_stock_production_order.py` (Dezodorant x3 × Coccine × 3, qty=1)

## 2026-08-09 — Packing finish 404 (`mode=no_cart`) + błąd jako popup

- **Przyczyna 404:** `POST …/finish` ładował zamówienie wyłącznie z aktywnej kolejki; po spakowaniu linii (detail poza kolejką / drift fulfillment / błędne `no_cart` z listy `all`) → `ORDER_NOT_IN_QUEUE` / HTTP 404.
- **Backend:** `_load_order_for_packing_finish` — fallback dla w pełni spakowanych przy zgodnym trybie; polskie `message` w `PackingScanError`; skan EAN z `mode=all` + NULL handoff nie wymyśla CARTLESS.
- **FE:** lista `all` nie forsowała `no_cart` bez wózka/koszyka; błąd finish → `WmsScanFeedbackOverlay` (czerwony popup); bez wielkiego czerwonego tekstu w panelu finalizacji; „Ponów finalizację” zostaje.
- Testy: `test_packing_finish_no_cart.py` + `packingHelpers` copy.

## 2026-08-09 — Pakowanie: lokalizacja + podgląd aktywatorów w ustawieniach

- Lokalizacja na karcie: tylko „Prawy górny róg” (`top_right`) / „W szczegółach produktu” (`in_details`); legacy rogi → `top_right`
- Działa w runtime (Default/Active/Done + `LineDetailsBlock`), nie tylko w config
- Podglądy w ustawieniach Widok: prawdziwe karty produktów + belka aktywatorów góra/dół
- Usunięto badge „BRAK FUNKCJONALNOŚCI”; dodano ⓘ help dla obu ustawień

## 2026-08-09 — Metody dostawy: NS_BINDING_ABORTED (prawdziwa przyczyna)

- **Werdykt:** `ShippingMethodLogo` / wiersz listy był **odmontowywany** (nie „zepsute pliki”).
- **DEV:** `React.StrictMode` w `main.tsx` remountował każdy komponent przy pierwszym mountcie → `<img src="/uploads/...">` odłączany mid-flight → Firefox `NS_BINDING_ABORTED` (część zdążyła 200).
- **Wtórne:** `onError` po abortcie + globalny `failedCustomLogoKeys` zmieniał `src` custom→heuristic (kolejne aborty); `useEffect([load])` bez cleanup → podwójny fetch/`setRows`.
- **Fix:** bez StrictMode; load z `cancelled` cleanup; `mergeShippingMethodsRows` (bail-out ref); `onError` tylko gdy mounted; brak module cache fail; stabilne `key={id}` + memo row.
- Test: `shippingMethodLogoUrl.test.ts` (lifecycle remount regression).

## 2026-08-09 — Pakowanie: chrome UI (ikona pack-all, sztuki, badge)

- „Spakuj wszystko” → `PackingPackAllIconButton` (PackageCheck)
- Przy #order: `packed_quantity/total_quantity` (sztuki), nie queue_index
- Wózek/Koszyk: `PackingCartBasketBadges` (Icon cart/basket + mono)
- Lokalizacja: `(97)` zamiast `(x97)`; EAN done: biały badge + ciemny tekst

## 2026-08-09 — Metody dostawy: pętla requestów logo

- Przyczyna: `onError` ustawiał `failedSrc` na SVG; potem `preferred` (custom `/uploads`) ≠ `failedSrc` → znowu custom → nieskończona pętla + NS_BINDING_ABORTED/ORB
- Fix: jednokierunkowy `pickShippingMethodLogoSrc` (custom → heuristic → none); flagi `customFailed`/`heuristicFailed`; bez `key={src}`
- Test: `shippingMethodLogoUrl.test.ts` (5 passed)

## 2026-08-09 — Metody dostawy: znikające logo

- Przyczyna (nie save wipe): `logo_url` w DB zostaje; pliki `/uploads` giną (efemeryczny dysk Railway) → 404/ORB; custom URL blokował heurystykę SVG
- `NS_BINDING_ABORTED` = anulowane requesty przy rerenderze, nie root cause
- Fix: PUT `model_fields_set` (omit=zachowaj); FE nie wysyła `logo_url` bez zmiany; `onError` → carrier SVG; testy `test_shipping_method_logo_persist.py`
- Brak GC „nieużywanych” uploadów dla logo metod; `clear_dev_artifacts` czyści cały katalog uploads (dev)

## 2026-08-09 — Packing finish 400: int(UUID) serii RW

- Objaw: `POST …/finish` → 400 `invalid literal for int()… 'd26516c5-…'`
- Przyczyna: `create_packing_packaging_rw` robiło `document_series_id=int(series.id)` przy `DocumentSeries.id` = UUID (`String(36)`)
- Fix: `str(series.id)`; cart_id=3 nie był winny — UUID to seria dokumentów RW

## 2026-08-09 — Finish pakowania: brak stanu opakowań nie blokuje

- Pipeline: `create_packing_packaging_rw(..., allow_negative=True)` + soft-fail bez `raise`
- Ostrzeżenie log `PACKING_PACKAGING_RW_STOCK_SHORTAGE`; status/dokumenty idą dalej
- FE finalizacja: „← Powrót do zamówienia” + „← Lista zamówień”
- Regresja: `test_packing_finish_packaging_stock.py`

## 2026-08-09 — /wms/packing: GLOBAL_SCAN handler (wózek/koszyk)

- Przyczyna: `WmsPackingStatusPage` rejestrował `registerScanHandler(null)` → `GLOBAL_SCAN_NO_HANDLER`
- Fix: ten sam wzorzec co inne strony WMS — handler → `resolvePackingHandoffScan` + `applyPackingHandoffScanResult` (preferowany status Pakowanie)
- Wejście bez skanu: kafelki statusów → lista `mode=all` (bez forced scan UI)

## 2026-08-09 — Packing finish 400: UUID serii RW → int()

- Przyczyna: `create_packing_packaging_rw` robiło `document_series_id=int(series.id)`; `document_series.id` i `stock_documents.document_series_id` to String(36) UUID
- Objaw: HTTP 400 `invalid literal for int() with base 10: 'd26516c5-…'` przy `POST …/packing/orders/{id}/finish`
- Fix: przekazywać `str(series.id)`; regresja `test_packing_packaging_rw_series_uuid.py`
- `cart_id` (int) był poprawny — UUID to seria dokumentów RW magazynu, nie wózek

## 2026-08-09 — Pakowanie: skan wózka jako lookup na liście (nie osobny etap)

- Wycofano forced UI „Skanuj wózek / koszyk” ze statusu / trybu
- Wejście w status → `mode=all` → normalna lista zamówień (niezależnie od konfiguracji zbierania)
- Globalny skaner na liście: `resolvePackingHandoffScan` (wózek / MULTI / koszyk) → filtr lub otwarcie zamówienia
- Backend: `mode=all` w scope kolejki + inferencja handoff przy resolve-ean/scan
- Usunięto `PackingHandoffScanModal`

## 2026-08-09 — Pakowanie: skan wózka/koszyka ze statusu Pakowanie (WYCOFANE)

- Pierwsza wersja z CTA / osobnym etapem skanu — błędny kierunek; zastąpione powyższym

## 2026-08-09 — Wyczyść wózek: pełny reset także w PACKING

- Przyczyna: `CartService.clear_cart` → `admin_release_cart` (celowo blokuje PACKING z custody) + 500 bez mapowania + FE `code=null` → „NIEZNANY KOD”
- Fix: `force_clear_cart` (SSOT) dla ASSIGNED/PICKING/READY/PACKING; `admin_release` bez zmian; clear → 409 + WmsUserMessage; FE `showWmsError` + katalog kodów

## 2026-08-09 — Magazyn → Wózki: scroll strony po rozwinięciu wózka

- Przyczyna: `CartsModuleLayout` zawsze `fillHeight` → `PageContainer` `h-full` + `overflow-hidden` ucinał treść
- Fix: `fillHeight` tylko dla edytora/podglądu `/carts/racks/...`; flota scrolluje w `<main>`
- Accordion detail: `max-content` + `overflow-visible` gdy open (bez wewnętrznego scrollera)

## 2026-08-09 — Ponowne wejście do spakowanego zamówienia (lista pakowania)

- Gate przy pierwszym wczytaniu detail: modal „już spakowane”, linie Done, bez aktywnego produktu / AutoActions
- `POST /wms/packing/orders/{id}/acknowledge-reopen` → `PACKING_REOPEN_ACKNOWLEDGED` (+ activity log)
- X zamyka bez logu; Accept zapisuje log; Wróć → lista
- Detail poza kolejką dla zamówień packed/finalized; `packed_by_label` w detail

## 2026-08-09 — Podglądy układu/produktów: realne karty + bez „—”

- `PackingLayoutModePreview`: prawdziwy sidebar + karty Default/Done (skala), nie szkielety
- Wspólne sample lines; brak wartości = ukryte pole w `LineDetailsBlock`
- Lokalizacja: ten sam `PackingLocationPill`; pusty badge niewidoczny

## 2026-08-09 — Ustawienia widoku: zwijane podglądy układu

- Wspólny `PackingSettingsPreviewCollapse` (domyślnie zwinięty)
- Podglądy: układ (sidebar/pełna), komentarze, dokument sprzedaży, produkty Lista/Siatka
- Siatka kart: zdjęcie wyśrodkowane pod nagłówkiem (jak mockup)

## 2026-08-09 — Karty pakowania: mockup Siatka/Lista

- Stałe wymiary: siatka 20×19.5rem; lista pełna szerokość + stała wysokość wiersza
- Layout: zdjęcie | dane | SPAKOWANO | LOKALIZACJA | … (lista); nagłówek + ciało (siatka)
- Done: półprzezroczyste zielone tło całej karty, grayscale zdjęcia/danych, czytelny status/X
- EAN: delikatny badge; bez białego tła pod zdjęciem; bez „1x” w nazwie

## 2026-08-09 — Podgląd układu produktów (Lista/Siatka)

- `ProductDisplayModePreview`: stała szerokość kart (`allowShrink: false` / `lockCardSize`), wrap zamiast ściskania
- `DefaultCard` lista: kolumny [zdjęcie|nazwa+meta] | [SPAKOWANO|LOKALIZACJA|…] — bez nachodzenia elementów

## 2026-08-09 — Fix zmiany statusu zamówienia (panel UI)

- Przyczyna: przy zamówieniu na wózku z zablokowanym detach (picki / READY_FOR_PACKING) `apply_order_panel_ui_status` rzucał 409 i rollbackował zapis statusu
- Fix: `order_ui_status_id` zawsze zapisywany; detach tylko gdy dozwolony
- UI: toast przy błędzie API; po sukcesie `reloadOrderById`; `build_order_read` czyta status z FK (nie stale relationship)
- Test: `test_panel_status_saves_when_detach_blocked_by_picks`

## 2026-08-09 — Wygląd produktów: Lista / Siatka

- `productDisplayMode` podpięty do kart Active/Default/Done + siatki w PackingView
- Lista = karty poziome; Siatka = pionowe z dużym zdjęciem; auto-fit na całą szerokość
- Podgląd w ustawieniach Widok (jak lista zamówień); usunięte CAP_NONE

## 2026-08-09 — Fix full-width packing layout

- Osobna gałąź layoutu w `PackingView` (bez sidebara); pas info + opakowania na całą szerokość
- Siatka produktów: `auto-fit minmax(15.5rem, 1fr)` — karty wypełniają rząd, bez pustej prawej kolumny
- Info: dokument, logo, wysyłka, telefon/wartość/adres, uwagi; opakowania `align=start`

## 2026-08-09 — Widok pakowania: telefon / wartość / adres

- Extended UI: `showOrderPhone`, `showOrderValue`, `showShippingAddress` (domyślnie ON)
- Sidebar + full-width: telefon i wartość; adres w bloku kupującego (dokument pełny)
- Checkboxy + (i) w Widok; bez CAP_NONE

## 2026-08-09 — Widok pakowania: układ + kolejność spakowanych

- Ustawienie układu: `Z sidebarem` / `Pełna szerokość` (zamiast Pełna szerokość / Wyśrodkowany)
- Full-width: ten sam `PackingView`, bez sidebara, pas info + siatka na całą szerokość
- `movePackedToBottom` faktycznie sortuje linie; usunięte CAP_NONE + teksty „brak funkcjonalności”
- Info (i) dla obu opcji; `npm run build` OK

## 2026-08-09 — Lista zamówień: korekta layoutu (3 warianty)

- Usunięte szare tło za zdjęciami produktów
- Nagłówek karty zwarty (flex w-max): nr | SPAKOWANO | logo — bez space-between / 1fr
- Standardowy: stała szerokość karty (~280px) + flex-wrap zamiast rozciąganego gridu
- `npm run build` OK; bez commit/push

## 2026-08-09 — Lista zamówień: Rozbudowany (Pionowy)

- `expanded_vertical` → UI „Rozbudowany (Pionowy)”; białe tło; karty full-width jedna pod drugą
- Nagłówek karty: NR | SPAKOWANO | logo; produkty w poziomie z separatorami; `+N innych`
- Spakowane: wyszarzenie + ✓ + X; podgląd w ustawieniach; `npm run build` OK; bez commit/push

## 2026-08-09 — Lista zamówień: Rozbudowany (Poziomy)

- Opcja `cards` → UI „Rozbudowany (Poziomy)” (rename z Karty); wartość `cards` bez zmian
- Poziomy scroll: karty ~300px z produktami (miniatura, qty×nazwa, EAN, kolor), logo po prawej SPAKOWANO
- Stany: czerwona ramka + badge Brak; linia Spakowane ✓/X; karta zakończona opacity; +N innych
- Pełny podgląd w ustawieniach Widok; `npm run build` OK; bez commit/push

## 2026-08-09 — Lista zamówień pakowania: układ Standardowy

- `ordersListLayout: compact` → UI „Standardowy” (rename z Kompaktowy); wartość `compact` bez zmian
- Siatka 4 kart/rząd; karta 3 kolumny: nr+Fa+klient | SPAKOWANO | logo przewoźnika (bez wrap logo pod licznik)
- Stan spakowany: ✓ + Spakowane n/n, czerwony X, wyszarzenie; nagłówek jak referencja Sellasist
- Podgląd układu w ustawieniach Widok; `npm run build` OK; bez commit/push

## 2026-08-08 — Smart Matching (WMS settings + learning)

- Trwałe ustawienia (enable, próg 2/3/5, status inicjujący, multi auto-label) zamiast localStorage
- Nauka z historii pakowania → reguły auto; przerwane serie; reset tylko reguł auto
- Hook finish + zmiana statusu panelu; propozycje w pakowaniu (ten sam model kartonu)
- UI Sellasist-like: OrderUiStatusPicker/Field, historia, „!”, SettingsSubsection
- Testy `test_wms_smart_matching.py`; `npm run build`; bez commit/push

## 2026-08-08 — Etykieta zastępcza (pakowanie WMS)

- Nowy typ szablonu `order_replacement` („Etykieta zastępcza”, rodzina Zamówienia) — constants/API/settings/UI designer
- Tabela `wms_packing_replacement_labels` + serwis: snapshot pakowania, PDF, barcode `RPL-*`, retry courier
- Finish pipeline: brak listu → `offer_replacement_label`; popup + delay; create/print; skan na liście/ekranie zamówienia
- Ustawienie szablonu filtruje tylko `order_replacement`; opóźnienie zachowane
- Testy backend (create/snapshot/scan/retry/fail) + `npm run build`; bez commit/push

## 2026-08-08 — Ustawienia WMS: śródsekcje SettingsSubsection

- Nowy lekki kontener: tło slate-50, cienka obwódka, zaokrąglenie, tytuł + opcjonalny opis, większy gap (`space-y-5`)
- Packing `Subsection`, picking `SubsectionPicking`, DS workflow statuses → ten sam komponent
- Wiersze ustawień bez dodatkowych ramek; `npm run build`; bez commit/push

## 2026-08-08 — Ustawienia WMS: „i” w pierwszym wierszu tytułu

- `SettingRow` z powrotem 2 kolumny LABEL|CONTROL; `.option-title` = flex (tekst + „i” `items-start`)
- Ikona przy pierwszej linii nazwy, nie obok całego wieloliniowego bloku
- `hint` nadal → „i” (bez tekstu pod opcją); kontrolka top-aligned; bez commit/push

## 2026-08-08 — Ustawienia WMS: układ LABEL | [i] | CONTROL

- `SettingRow`: 3 kolumny; `hint` nie renderuje się pod nazwą — treść trafia do środkowej ikony „i”
- Packing: `info` prop zamiast ikony w labelu; badge/capability bez zmian
- Globalnie: picking / direct sales / returns / silniki — istniejące `hint`/`help` → „i”
- Logika ustawień bez zmian; `npm run build`; bez commit/push

## 2026-08-08 — Ustawienia WMS: fałszywy dirty przy zmianie grupy

- Root cause: baseline draft liczony przed migracją localStorage `allowed_start_status_ids` + niespójny fingerprint
- Fix: `packingDraftFingerprint` / `packingExtendedFingerprint` (normalize + kanoniczne pola); baseline = stan po load/migrate; clear baseline podczas load; idempotent `setAllowedStartStatusIds`
- Ostrzeżenie nawigacji nadal tylko przy prawdziwej zmianie ustawień; bez commit/push

## 2026-08-08 — Pakowanie: dokumenty, listy, wielopaczkowość

- `preferred_document_type` API: FROM_ORDER | INVOICE | PARAGON (UI: Paragon/Faktura/Pobrane z zamówienia)
- Kopia dokumentu sprzedaży (ten sam PDF 2×); popup liczby listów; ConfirmModal przed generate_shipment
- Wielopaczkowość: okno paczek przed finish/auto; `packaging_carton_ids` → packing_consumables_json
- Testy packing auto-actions + finish baskets; `npm run build` OK; bez commit/push

## 2026-08-08 — Pakowanie: Automatyzacja / Przesyłki i dokumenty

- `change_order_status` off → bez zmiany statusu; on → `packed_status_id`
- List przewozowy: `LIST_PRZEWOZOWY` / pole SHIPPING_LABEL; brak = soft-skip (nie pusty PDF)
- Po dokumencie sprzedaży / liście: tylko Wydrukuj|Pobierz; przy Wydrukuj listu + companion „Dokument sprzedaży”
- Aktywatory w PackingView: filtr `visibleOnWmsPacking` + `showAutomationButtons`
- Testy `test_wms_packing_post_pack_auto_actions` (7) + finish baskets; `npm run build` OK; bez commit/push

## 2026-08-08 — Pakowanie: statusy startowe (wiele)

- API `allowed_start_status_ids` (JSON w `wms_packing_settings`) + walidacja UI statusów
- `list_packing_target_statuses` łączy picking targets + `start_status_id` + multi-start
- UI: multi `OrderUiStatusField` (badge NOWE/W TOKU/ZAKOŃCZONE), ikona (i), bez BRAK FUNKCJONALNOŚCI
- Migracja z localStorage `allowedStartStatusIds`; logika Zbierania bez zmian
- Testy unit + `npm run build` OK; bez commit/push

## 2026-08-08 — Ustawienia WMS: layout Sellasist LABEL|CONTROL

- Wspólny `SettingRow` (`wmsSettingRow.tsx`): kolumny ~20rem|15rem, `items-start`, max-width pary (kontrolki nie na krawędzi ekranu)
- Długie nazwy zawijają się; badge/hint/(i) w kolumnie LABEL; checkbox/select w CONTROL przy 1. linii
- Outliery: stacked label→input w Zbieraniu, Info/Printers stanowisk → `WmsControlSettingRow` / `WmsBoolSettingRow`
- Logika/API bez zmian; `npm run build` OK; bez commit/push

## 2026-08-08 — Pakowanie: efekt po akcjach automatycznych (3 opcje)

- Usunięty checkbox „Po spakowaniu… następnego…” i badge CZĘŚCIOWO WDROŻONE
- `packing_after_finish_action`: `STAY` | `GO_TO_LIST` | `NEXT_ORDER` (persist API)
- Finish: pipeline auto → potem nawigacja; NEXT_ORDER = FIFO z kolejki trybu (`next_order_id`)
- `npm run build` OK; bez commit/push

## 2026-08-08 — Pakowanie: start status, braki, jedno-/wieloelementowe

- Usunięty tekst CAP o zbieraniu przy `start_status_id`; status startowy wchodzi też do `list_packing_target_statuses` (bez mieszania z regułami zbierania)
- `missing_status_id` → akcja „Oznacz jako brak” na kafelku + popup + `POST …/mark-shortage` + powrót jak „Przerwij”
- Checkbox jedno-/wieloelementowe → kafelki na ekranie trybu; filtr `order_type` na liście (jak zbieranie)
- Testy packing/shortage + `npm run build`; bez commit/push

## 2026-08-08 — OrderUiStatusField: grupowanie wybranych statusów

- `OrderUiStatusSelectedGroups` — NOWE / W TOKU / ZAKOŃCZONE na liście już wybranych (puste grupy ukryte)
- Nazwa statusu bez sufiksu grupy; kolory z brief SSOT
- `OrderUiStatusField` (Pakowanie + Akcje automatyczne) + `AutomationConditionSummary` („jest jednym z…”)
- Logika zapisu bez zmian; `npm run build` OK; bez commit/push

## 2026-08-08 — Ustawienia WMS: wspólny standard UI (nie tylko Pakowanie)

- Barrel `wmsSettingsUi` + wiersze `WmsBoolSettingRow` / `WmsControlSettingRow` (kolumny 34rem|26rem, kontrolki nie na krawędzi)
- Migracja: Zbieranie, Sprzedaż bezpośrednia, Zwroty, Przyjęcia, Produkcja, Smart/3D Matching, Stanowiska (grid wierszy)
- Statusy → `OrderUiStatusField` + subgroups; capability badge / info (i) wspólne
- Logika biznesowa bez zmian; placeholdery Coming Soon bez usuwania zakładek
- `npm run build` OK; bez commit/push

## 2026-08-08 — Zbieranie: layout Sellasist + OrderUiStatusField

- `WmsPickingSettingsPanel`: `WmsBoolSettingRow` / `WmsControlSettingRow` / `wmsSettingsRowsStackClass`
- Statusy (braki API, extended, konfigurator trybu) → `OrderUiStatusField` + `getOrderPanelSubgroups`
- Usunięty `PickingStatusSelect` z panelu; payloady / znaczenie status id bez zmian

## 2026-08-08 — Wspólny OrderUiStatusPicker (NOWE / W TOKU / ZAKOŃCZONE)

- Kanoniczny `OrderUiStatusPicker` + `OrderUiStatusField` (Pakowanie + Akcje automatyczne)
- Popup: 3 grupy zwijane (domyślnie otwarte), wyszukiwarka, single/multi, kolorowe badge
- Wybrany status = sama nazwa (bez sufiksu grupy); aliasy `AutomationStatus*` zachowane

## 2026-08-08 — Pakowanie: layout Sellasist (kontrole nie na prawej krawędzi)

- `wmsSettingRow`: kolumny `[max 34rem | 26rem]` wyrównane do lewej — kontrolki zaraz obok etykiety
- Puste miejsce po prawej OK; bez `1fr` wypychającego select/checkbox na skraj ekranu

## 2026-08-08 — Wspólne kolorowe badge statusów WMS

- `OrderUiStatusBadge` / `OrderUiStatusBadgeList` → SSOT via `panelSidebarSubRowStyleRich` (kolory z rejestru statusów)
- Akcje automatyczne (warunki/efekty/lista) + `AutomationStatusField` (Pakowanie) + picker: kolorowe chipy, nazwa bez grupy
- `+N` overflow zachowany; `buildOrderUiStatusBriefById` jako mapa id → brief

## 2026-08-08 — Pakowanie: status field + layout full-width

- Wspólny `AutomationStatusField`: trigger z chipami → popover z `AutomationStatusPicker` (Pakowanie + Akcje automatyczne)
- Etykieta statusu = sama nazwa (`Spakowane`), bez sufiksu grupy; `buildOrderUiStatusNameById`
- Formularz pakowania: `w-full` (bez `mx-auto` / wąskiego max-width); prawa kolumna `16–22rem` wyrównana w osi

## 2026-08-08 — Pakowanie: wspólny picker statusów

- Ustawienia procesu pakowania używają `AutomationStatusPicker` (jak akcje automatyczne)
- Single + multi; badge „Nazwa — Grupa”; `allowClear` = „— brak —”
- Alias: `OrderPanelStatusPicker`; zapis statusów bez zmian modelu

## 2026-08-08 — WMS settings: label left, control right

- Wspólne `wmsSettingRow` (`WmsBoolSettingRow` / `WmsControlSettingRow`)
- Pakowanie, zbieranie (CustomCheckbox), sprzedaż bezpośrednia, produkcja, zwroty, Smart/3D Matching, walidacja przyjęcia
- Zasada: nazwa opcji (+ ⓘ) z lewej, checkbox/select/input z prawej

## 2026-08-08 — Główny magazyn do pakowania (funkcjonalny)

- UI: select magazynów tenanta (ID), bez badge BRAK; zapis przez `PATCH /company/fulfillment-configuration` → `consolidation_warehouse_id`
- Runtime: istniejący `resolve_preferred_consolidation_target_id` + soft validation jeśli WH usunięty/nie-eligible
- Testy: `test_main_packing_warehouse.py` (unset / set / single-WH / other-tenant / clear / invalid fallback)

## 2026-08-08 — Pakowanie: ⓘ jak w Sellasist

- Niebieskie (i) inline przy nazwie opcji (`BoolRow` / `SelectField` / magazyn)
- Modal: tytuł + X, „Jak działa ta opcja:”, opcjonalnie „Wskazówka:” — bez łapek pomocności
- `PACKING_SETTING_HELP` jako `{ description, tip? }`

## 2026-08-08 — ETAP 3A PPWR foundation

- Kontrakt: SALES / TRANSPORT / ECOMMERCE / AUXILIARY / FILLER / OUT_OF_SCOPE
- Carton + PackagingMaterial: ppwr_function/format/recyclable/recycled/reusable/status (bez duplikacji BDO)
- Nowa tabela `product_sales_packaging` + CRUD `/products/{id}/sales-packaging`
- FE: zakładka produktu „Opakowanie produktu”; WM PPWR projection; zakładka PPWR na karcie kartonu/materiału
- Migracja `ensure_ppwr_stage_3a_schema` (allowlist PG); testy `test_ppwr_stage_3a.py`; `npm run build` OK
- Poza zakresem: composition, void, consumables, hub

## 2026-08-08 — ETAP 1+2 Materiały opakowaniowe (IA + Inventory SSOT)

- Zakładki: Kartony | Pakowe | PPWR (projekcja) | Historia (StockDocument/StockOperation)
- Usunięto legacy scalar bump przy delivery `received` (metadata-only); stan tylko przez Inventory/PZ
- BDO movements = ta sama projekcja dokumentów (bez ledgeru)
- Bez: consumables packing, void snapshots, pełne PPWR fields

## 2026-08-08 — IA: jeden katalog Materiały opakowaniowe

- Jedyny katalog CRUD: Asortyment → Materiały opakowaniowe (`/warehouse-materials` — Kartony | Materiały pakowe)
- Usunięto zakładkę BDO „Materiały opakowaniowe” + `BdoMaterialsPage`; `/warehouse/bdo/materials` → redirect do katalogu
- BDO zostaje report/config; flagi kg/`include_in_bdo` edytowalne na karcie materiału (zakładka BDO)
- Modele/API Carton + PackagingMaterial bez zmian

## 2026-08-08 — Prod hotfix: BDO build + order_issue_tasks.status

- FE: restore `resolveBdoTabMeta` in `bdoTabMeta.ts` (current report-only tabs + breadcrumb) — Vercel Rollup import fix
- BE: widen `order_issue_tasks.status` String(16)→String(32) + `ensure_order_issue_tasks_status_column_width` (PG ALTER; READY_FOR_PACKING=17)
- BE: `_recover_session_after_failed_flush` in WMS issue-tasks list after nested repair failure (avoid PendingRollbackError mask)

## 2026-08-07 — Materiały opakowaniowe + BDO report-only (backend foundation)

- Stockable bridge: `Product.stock_item_kind` + `Carton/PackagingMaterial.product_id` → Inventory SSOT
- `wm_catalog_stock_service` posts Inventory (not scalar stock)
- Packing finish → `create_packing_packaging_rw` (RW ISSUE)
- BDO API rewrite: dashboard/catalog/settings/monthly from documents; purchases/corrections/stock-counts → 410
- Dropped BDO ledger tables in migration; FE redirects + deleted purchase/correction/stock-count pages
- Rename UI: Materiały opakowaniowe
- Remaining: packing consumables UI, movements projection, full FE polish, product-list filters excluding packaging stockables

## 2026-08-07 — Magazyn: uproszczenie urządzeń (Wózki + Strefa sortująca)

- Zakładki: Wózki | Strefa sortująca | Planer floty | Nośniki (`cartsTabs.ts`)
- Wózki: jeden ekran (`CartsFleetPage`) + filtr ALL/BULK/MULTI + modal typu przy „+ Dodaj wózek”; badge typu na karcie
- Redirect `/carts/baskets` → `/carts/bulk?type=multi`; `/carts/zones` → `/carts/bulk`
- Usunięto FE: CartsBulk/Baskets/Zones, ZonesTab, ZoneConfigurator
- Usunięto BE: `picking_zone` API/service/schema (model + M2M order zostaje dla WMS)
- Nav Magazyn: Wózki, Strefa sortująca (bez Stref); Planer floty
- `npm run build` + vitest carts/IA OK

## 2026-08-07 — Shell: header nad sidebarem + usunięcie martwych modułów

- Layout: wspólny header na całą szerokość; sidebar dopiero pod belką
- Logo SASIST zawsze w headerze; hamburger usunięty
- Zwijanie menu: pozycja w menu użytkownika (Administracja → Firma → Zwiń/Rozwiń → Wyloguj)
- Usunięto FE: Pule stanów, cały `/system/*` UI, Słownik aplikacji (admin)
- BE: wyrejestrowano/usunięto `offer_stock_pool` router; zostawiono health + labels/resolved
- `npm run build` OK

## 2026-08-07 — Globalna wyszukiwarka ustawień WMS

- `settingsSearch/`: catalog + combobox + navigate (tab/section/focus/flash 2s)
- Header chrome: VS Code-style search across all WMS tabs (≥3 znaki, klawiatura)
- Anchory: `data-wms-setting-id` / `WmsSettingField` (Pakowanie Widok + kluczowe pola)
- Usunięto lokalną wyszukiwarkę z `WmsSettingsTabFrame`
- `npm run build` OK

## 2026-08-07 — WMS settings: left nav switches section (no scroll)

- Registry: `selectSection` + `?section=` query; removed IntersectionObserver / scroll-spy
- `WmsSettingsSection` mounts only the active subsection
- Nav / Packing / Picking / DS / etc. unchanged visually; save logic untouched
- Deleted `wmsSettingsSectionDom.ts`
- `npm run build` OK

## 2026-08-07 — Order Multiakcje + shared multiActions shell

- Extracted generic `frontend/src/components/multiActions/` (MultiActionsModal, MultiModulePicker, createRegistry, types).
- Products: ProductMultiActionsModal → thin wrapper; ModuleCardProps uses `cardContext.tenantId`.
- Orders: `orderMultiActions/` — 13 modules; live: status, payment, note, shipping, document, custom_field; stubs: operator, tags, warehouse, source; host: packing_queue, export, delete.
- Removed dropdown `OrderListMultiActionsMenu`, old `OrderBulkMultiActionModal`, dead `OrderBulkCustomFieldModal`.
- OrderList + OrdersListBulkBar: Zap button → full creator modal; `executeOrderBulkActions` + `payment_status`.
- `npm run build` OK

## 2026-08-07 — Ustawienia WMS: wspólny wzorzec UI (Pakowanie)

- `WmsSettingsTabFrame`: tytuł, opis, wyszukiwarka, Przywróć / Zapisz
- Lewa nawigacja z ikonami (aktywny orange), mobile disclosure
- Sekcje zwijane z ikoną (`WmsSettingsSection`)
- Podpięte: Pakowanie, Zbieranie, Zwroty, Przyjęcia, Produkcja, DS, Smart/3D, Coming soon
- Logika/API bez zmian; sticky footer nadal dla dirty w hostcie
- `npm run build` OK

## 2026-08-07 — Asortyment → Ustawienia (Stany magazynowe)

- Nowa pozycja menu Asortyment → Ustawienia (`/assortment/settings`)
- Zakładka Stany magazynowe przeniesiona z Konfiguracji WMS (bez zmian API)
- WMS: usunięto tab `common`; default Pakowanie; `?tab=common` → redirect
- Shell zakładek gotowy na kolejne sekcje produktów
- `npm run build` OK

## 2026-08-07 — Lista produktów + Multiakcje: wyrównanie UX

- Formularze Multiakcji: jednolity wiersz `checkbox/radio | etykieta | pole` (`PmaFieldRow`, `PatchFieldsEditor`)
- Uzupełnienia WMS: etykiety „Minimalna/Maksymalna ilość PICK/ZAPAS”
- Toolbar produktów: bez Strona/Częściowo/wykonaj, maila, Usuń, Odznacz; eksport = ikona Upload
- Nowy moduł „Generowanie EAN” (pomiń/nadpisz) + BE `generate_fake_ean`
- `npm run build` OK

## 2026-08-07 — Multiakcje produktów: UX kreatora

- Naprawa UTF-8 w kartach/modułach
- Command-palette picker zamiast `<select>`; ikony + grupy
- „Parametry składowania”: sekcje Produkt/Karton, kompaktowa lista pól
- GhostButton ↑↓×; badge podsumowania produktów/modułów
- `npm run build` OK

## 2026-08-07 — Multiakcje produktów: kreator z pluginami (Etap 1)

- Usunięto dropdown „Wybierz akcję”; jeden przycisk Multiakcje + Usuń
- Pakiet `productMultiActions`: shell, registry, execute; 15 kart-modułów
- BE: set_categories / set_product_family / set_tags / set_custom_field_values / set_product_status
- `npm run build` OK

## 2026-08-07 — Dodatkowe pola produktów: akcje, typografia, grupy

- Kolumna Akcje: min. `5rem`, right-align, równe ikony `h-8 w-8`
- Nazwa pola: `adminListNameClass` (`text-sm font-medium`) — bez bold
- Grupowanie (jak Akcje automatyczne): tworzenie/rename/reorder/collapse; membership w `settings_json.group`; registry localStorage; „Bez grupy”
- Edycja: select grupy (+ nowa); usunięte techniczne opisy; order CF: usunięte „Akceptowane…” / „Opcjonalnie…”
- `npm run build` OK

## 2026-08-07 — Fix product custom fields list (AdminDataTable)

- Bug: `hidden` + `block` w AdminDataTable → tabela niewidoczna (Tailwind conflict)
- Product page: PageLayout fullBleed + ProductCustomFieldsTable jak OrderCustomFieldsTable
- Ten sam toolbar/search/DnD/bulk; kolumny: Typ, Rodzaj, Aktywne
- `npm run build` OK

## 2026-08-07 — Standard list administracyjnych (AdminDataTable)

- Nowy `components/admin/AdminDataTable` + tokeny (drag, checkbox, ID, name, columns, icon actions)
- `OrderCustomFieldsTable` przepięty na AdminDataTable; stare tokeny = re-export
- `ProductCustomFieldsPage` UI jak pola zamówień (wyszukiwarka, DnD, bulk delete, ikony Edytuj/Usuń)
- API FE: `bulkDeleteProductCustomFields`
- `npm run build` OK

## 2026-08-07 — Rodzina produktów: spójność przycisków DS

- Jeden toolbar (Generator Secondary, Zapisz Primary, Usuń danger outline + Trash)
- Usunięto zduplikowane akcje ze stripa i link „Wróć do listy”
- Dodaj cechę/wartość → SecondaryButton; otwórz produkt → IconButton + ExternalLink
- `npm run build` OK

## 2026-08-07 — Zakładka Rodzina na karcie produktu (assign + preview)

- 3 karty PIM: przynależność (select + zapisz dirty), podgląd KPI, cechy jako chipy
- Bez zarządzania cechami / generatorem / członkami
- `npm run build` OK

## 2026-08-07 — Dashboard edycji Rodziny produktów

- Kartowy UX: nagłówek (status, KPI, Generator/Zapisz), Informacje, Cechy (osobne karty), tabela Produktów, panel Generatora
- Komponenty: `FamilyEditInfoCard`, `FamilyEditAttributesSection`, `FamilyEditMembersCard`, `familyEditDraft.ts`
- Usunięto stopkę „Rodzina jest opcjonalna…”
- `npm run build` OK

## 2026-08-07 — Usunięcie panelu „Tożsamość produktu”

- `ProductEditIdentityHeader` usunięty — nie renderuje się już nad zakładkami
- SKU / numer katalogowy przywrócone w `ProductEditBasicTab`
- Zakładka Rodzina uproszczona do membership + cechy produktu; usunięto karty `productFamily/*` z karty produktu
- `npm run build` OK

## 2026-08-06 — Zakładka Rodzina na karcie produktu (etapy 1–6)

- Tab `family` w railu; panel w `pages/Products/productFamily/`
- Usunięto rodzinę z identity / Podstawowych
- Members: sale_price + stock_quantity w payloadzie członków
- Generator osadzony + Generuj SKU/katalogowe (`product_codes` allocate + PUT)
- Dziedziczenie: UI-only checkboxy; powiązania z produktu bazowego
- Historia: activity log `product_family` (attach/detach/generate)

## 2026-08-06 — Product Management ecosystem (etapy 0–7)

- Plan zaakceptowany: `memory/plan-product-management-ecosystem.md`
- 0 nav + size-tables stub · 1 Kategorie polish · 3 Rodziny UX · 4 generator allocate SKU/katalog · 5 lista group-by family · 6 identity header · 7 PIM UX tokens (`pimUi.ts`)
- Lista produktów: `product_family_id/name` w API; toggle Lista płaska | Grupuj po rodzinie
- Karta: blok Tożsamość (rodzina, kategoria, SKU, katalog, status); mid-page Family uproszczony

## 2026-08-06 — Product Family (7 commits) — ADR + implementacja

- ADR: `memory/adr-product-family.md` (opcjonalna rodzina, base product, generator A/B, etapowe usunięcie Variant)
- C1 modele · C2 CRUD `/product-families` · C3 UI Rodziny · C4 blok na karcie · C5 generator · C6 migracja · C7 usunięcie Variant
- Produkty bez rodziny bez zmian; brak `exclude_variant_children`; lista nadal pokazuje wszystkie produkty
- Follow-up: grupowanie listy produktów po rodzinie (UX), głębsze kopiowanie SEO/GPSR w generatorze

## 2026-08-06 — Product Family Commit 1 (modele)

- ADR zaakceptowany: `memory/adr-product-family.md` (opcjonalna rodzina, base product, generator A/B, etapowe usunięcie Variant)
- Modele: `product_families`, `family_attributes`, `family_attribute_values`, `product_attribute_values`
- `products.product_family_id`; schema `ensure_product_families_schema`
- Variant stack bez zmian (usunięcie w Commit 7)

## 2026-08-05 — Pola dodatkowe produktów (jak zamówienia, typy jak Sellasist)

- Definicje: Asortyment → Pola dodatkowe (tekst, liczba, pliki, lista 1/n, GPSR, załączniki z typem)
- Wartości na karcie produktu → Podstawowe, nad historią
- Osobny stack od order custom fields (tenant-scoped, bez warehouse)

## 2026-08-05 — Warianty produktów (lepiej niż Sellasist)

- Słownik grup: osie + wartości (karty, nie gęsta tabela); nav Asortyment → Warianty
- Produkt: zakładka Warianty — przypisz grupę, generuj brakujące kombinacje jako osobne SKU
- SKU dzieci ukryte na liście produktów (`exclude_variant_children`); stan/EAN/cena per SKU
- Świadomie bez marketplace / „produkty zależne” / „opcje” z Sellasist (v1 = czysty katalog)

## 2026-08-05 — Przekształć produkt ↔ zestaw (jak Sellasist)

- BE: `assortment_convert_service` — soft-delete źródła, przeniesienie EAN/cen/wymiarów; pusty BOM przy product→bundle
- API: `POST /products/{id}/convert-to-bundle`, `POST /bundles/{id}/convert-to-product`
- FE: przycisk Shapes w nagłówku karty produktu/zestawu + confirm + nawigacja do nowej karty

## 2026-08-05 — Centralne generowanie SKU / numeru katalogowego

- Kategorie: kod + szablon SKU/katalog; liczniki per `sequence_key`
- API preview/allocate; UI Generuj na Podstawowe z podglądem i regułami UX
- Silnik szablonów gotowy pod przyszłe tokeny ({YEAR}, {MANUFACTURER}, …)

## 2026-08-05 — Moduł Kategorie produktów (od zera)

- BE: `product_categories` tree + `product_category_links` + `primary_category_id`; API `/product-categories` + assignment
- FE: Asortyment `/categories` (drzewo + CRUD), `/size-tables` placeholder, zakładka Kategorie na karcie produktu
- Model gotowy pod przyszłe generatory SKU/katalog, VAT, etykiety, atrybuty, marketplace

## 2026-08-05 — Zdjęcia: zawsze białe tło + Oferty jak Sellasist

- Galeria / nagłówek / miniatury: `bg-white` pod zdjęciem produktu (zakaz szarego tła)
- Oferty: chrome Sellasist (sekcje kanałów + tabela ID/Konto/Nazwa/Stan/Cena/Status)

## 2026-08-05 — Edycja produktu: Generuj kody + cleanup tabów + wspólna Historia

- Generuj: dodatkowy EAN, Symbol, Numer katalogowy; persist `catalog_number`
- Historia czynności: wspólny panel pod każdą zakładką (`objectType=product`)
- Produkcja/Magazyn: usunięte zbędne teksty techniczne / angielskie dopiski

## 2026-08-05 — Etykieta: przywróć RetailLabel + spolszczone pola w podglądzie szablonu

- Gotowa etykieta: z powrotem `RetailLabel` (finalny wydruk produktu)
- Podgląd szablonu: ten sam układ, wartości = polskie nazwy pól (bez `{{}}` i bez tekstów technicznych)

## 2026-08-05 — Edycja produktu: multi-EAN + Drukuj (Podstawowe)

- UI: wiele EAN (+ Dodaj / Usuń), Drukuj przy EAN produktu i EAN kartonu, bez Metryczne/Imperialne
- BE: `extra_barcodes` sync na create/update; `ean_override` w `/labels/product`
- Print modal: etykieta z nadpisanym EAN dla wybranego kodu

## 2026-08-05 — Edycja produktu: Ceny final (bez banera TEST)

- `ProductEditPricesTab` dopięty do `ceny karta produktu.html` (bez probe banera)
- Hierarchia: Kalkulacja | Dostawcy / Ostatni zakup / Podsumowanie; handlery bez zmian

## 2026-08-04 — Edycja produktu: Oferty 1:1 z HTML (FE only)

- `ProductSalesOffersSection` wg `oferrty karta produktu.html` (karta marketplace, Zwiń/Rozwiń, tabela)
- Handlery/API ofert sprzedażowych (outlet, pool, cena) bez zmian; bez DataTable

## 2026-08-04 — Edycja produktu: Zdjęcia 1:1 z HTML (FE only)

- Nowy `ProductEditImagesTab` wg `zdjecia karta produktu.html`
- Dodaj URL + Wgraj z pliku; lista rekordów (miniatura, URL, Główne / W górę / W dół / Usuń)
- Wire w ProductEditModal; handlery/API bez zmian

## 2026-08-04 — Edycja produktu: Produkcja 1:1 z HTML (FE only)

- `ProductManufacturingPanel` + `CompositionVisualEditor` wg `produkcja karta produktu.html`
- Banner, receptura (składniki grid, BOM), sidebar: zużycie / historia / koszt / wersje
- Bez DataTable; SASIST Input/Checkbox/Button/Badge; API/logika bez zmian

## 2026-08-04 — Edycja produktu: Magazyn 1:1 z HTML (FE only)

- Nowy `ProductEditWarehouseTab` wg `magazyn karta produktu.html` (sekcje Stan i lokalizacje + Parametry logistyczne)
- Kafle lokalizacji (kolor typu + zajętość/progress); kolumna magazynów; Korekta stanu
- Wire w ProductEditModal; handlery/API/model bez zmian

## 2026-08-04 — Edycja produktu: Ceny 1:1 z `ceny karta produktu.html` (FE only)

- `ProductEditPricesTab`: układ 2/3+1/3, tabela HTML dostawców, Ostatni zakup, Podsumowanie (szary footer Zysk/Rentowność)
- SASIST Input/MoneyInput/Textarea/Select/Button/Radio; bez DataTable/MetricCard/sticky
- Handlery / API / model danych bez zmian

## 2026-08-04 — Edycja produktu: Podstawowe v2 z HTML (FE only)

- `ProductEditBasicTab` → layout 1:1 z `podstawowy karta produckut v2.html` (grid 7/5)
- Producent / GPSR rozdzielone; walidacja Produkt·Partie·Opakowanie; szablon z gated search
- Historia = `ActivityLogPanel` (jak zamówienia); Gabaryty jednostkowe; bez zmian API/handlerów

## 2026-08-04 — Edycja produktu: Podstawowe DOM 1:1 z HTML (FE only)

- Nowy `ProductEditBasicTab`: section/div jak `podstawowe karta produktu.html` (bez ProductLikeSection)
- SASIST Input/Select w slotach; handlery/API bez zmian
- Historia: chrome HTML + `ActivityLogPanel`; Producent/GPSR + Walidacja poza mockiem (zachowane)
- Bez commita

## 2026-08-04 — Edycja produktu: zakładka Ceny (FE only)

- 65/35: Kalkulacja cenowa (MoneyInput) · Dostawcy (DataTable) · Ostatni zakup · sticky Podsumowanie
- MetricCard (zysk) + StatusBadge (marża %); bez zmian API / walidacji / hooków
- Dodano cienkie DS: `MoneyInput`, wspólny `DataTable`

## 2026-08-04 — Edycja produktu: UX jak mock HTML (FE only)

- Header: breadcrumb + nazwa + Zamów / Drukuj / Kopiuj+Więcej / Zapisz
- Hero: zdjęcie, tenant, ID, SKU, EAN + 3 duże statystyki (stan / cena / marża)
- Tabs: brand TabsNav (pomarańczowy underline); basic = Cards 65%/35%
- Historia czynności = `ActivityLogPanel` objectType=product (jak Zamówienia)
- Backend / API / routing / walidacja / hooki — bez zmian

## 2026-08-04 — Pulpit: TabsNav zamiast accordionów

- Usunięte PulpitSection (accordion); zakładki Decyzja/Alerty/Operatorzy/Kolejki/Dostawy/Historia via istniejący TabsNav
- Route `pulpit/*`; treść Centrum tylko dla aktywnej zakładki
- Backend / API / hooki — bez zmian

## 2026-08-04 — Rename Zarządzanie/Magazyn + Pulpit jak Produkcja

- Sidebar: Zarządzanie (Pulpit/Kolejność/Raporty/Plan) + Magazyn (Layout…Protokoły); bez Wózków/Inwentaryzacji w flyoucie
- Pulpit: DS PageHeader + MetricCard + Card (wzorzec ProductionDashboard) — bez hero/landing
- Backend / routing — bez zmian

## 2026-08-04 — UX Magazyn: ujednolicenie do Layout System 2.0

- Usunięte lewe menu Raportów i Planu zmian → `TabsNav` (jak Zakupy/Produkcja)
- Pulpit / Kolejność / Przegląd: `PageHeader`, karty DS, tabela, filtry, bez `font-black` / `max-w-2xl`
- IA / routing / backend / funkcjonalność — bez zmian

## 2026-08-04 — IA Magazyn: flyout Magazyn + Administracja + Pulpit sekcje

- Sidebar: „Magazyn” (Pulpit · Kolejność · Raporty · Plan); „Administracja magazynem” (pełna lista + Wózki + Inwentaryzacja ERP; bez szablonów etykiet)
- Pulpit: ShiftConductor + zwijane sekcje z embed Centrum (Alerty / Operatorzy / Kolejki / Dostawy / Historia)
- Raporty: index = AnalysisDashboard (Przegląd); wszystkie raporty podłączone
- Backend / API / Engine — bez zmian

## 2026-08-03 — Pulpit jako przebieg zmiany (nie dashboard)

- ShiftConductor: status → decyzja → efekt → CTA → potem; kontekst schowany
- Usunięte widgety sekcji (alerts/status/crew/secondary jako osobne bloki)
- Tabs Raporty/Plan niewidoczne na Pulpicie
- Backend / Engine / API — bez zmian

## 2026-08-03 — Pulpit jako strona główna Zarządzania

- Usunięty landing (3 kafle) i tab „Przegląd”; `/zarzadzanie-magazynem` → `/pulpit`
- Pulpit przebudowany produktowo: decyzje → stan → alerty → obciążenie → stopka
- Odłączone embed Centrum Operacyjnego; bez ściany KPI
- Backend / Engine / API — bez zmian

## 2026-08-03 — IA: hub Zarządzanie + Administracja L1

- FE only: `/zarzadzanie-magazynem` (hub → pulpit / raporty / plan-zmian)
- Administracja: `/administracja-magazynem` jako L1 (nie flyout); usunięty osobny wiersz Ustawienia WMS
- Decyzje = sekcja Pulpitu („Co zrobić teraz”); bez `#decyzje`
- Redirecty: SF / operations / centrum / stary pulpit → `/zarzadzanie-magazynem/pulpit`; analytics → raporty; optymalizacja → plan-zmian
- WMS: usunięte wpisy supply_flow + operations z rejestru modułów
- Backend / Engine / API — bez zmian

## 2026-08-03 — IA: trzy stanowiska Magazyn

- FE only: menu/routing/nazwy; Pulpit kierownika wchłania Centrum + Decyzje (SF UI)
- Usunięte z WMS Home: Przepływ dostaw, Operacje
- Redirecty starych URL → `/pulpit-kierownika`
- Backend / Supply Flow Engine — bez zmian

## 2026-08-03 — Przepływ dostaw: UX prowadzenia zmiany (audyt)

- Pierwszy viewport: alert + 1 karta uwagi + CTA; Dlaczego w karcie (≤2)
- Co dalej ≤3 + „+ jeszcze X”; plan ukryty w „Szczegóły planu”; stan = 1 wiersz
- Jedno „Odśwież”; język magazynowy; powrót z WMS = zakończone + następne
- Backend / Engine / API — bez zmian

## 2026-08-03 — Przepływ dostaw: przebudowa UX kierownika

- Wyłącznie FE: hierarchia Alerty → Uwaga → Co dalej → Dlaczego → Plan pracy → Stan magazynu
- Mapper `shiftBoard.ts` tłumaczy plan API na język magazynu (bez score / polityk / klas)
- Usunięte stare panele architektury (Execution board, config, raw priorities)
- Backend / Engine / Event Pipeline / API — bez zmian

## 2026-08-03 — Supply Flow UX (Living Plan)

- API: GET/POST plan+recompute, GET/PATCH config (`/api/wms/supply-flow`)
- FE: `/wms/supply-flow` — CTA, Execution board+monitor, Explainable, dostawy, config
- Moduł WMS `supply_flow` w menu / home (daily)
- Bez przebudowy Engine / Event / Priority / Explainable / Planner / Monitor

## 2026-08-03 — Capability Pack 4: Execution Monitor

- Pakiet `execution_monitor/`: ExecutionStatus, ExecutionState, ExecutionMonitor
- Overlay na ExecutionPlan (seq); źródło: zdarzenia WMS (start/finish unload/putaway, cancel, fail)
- Dispatcher syncuje stan po batchu; start/cancel/fail bez recompute Engine
- Testy: 33 passed

## 2026-08-03 — Capability Pack 3: Execution Planner

- `ExecutionPlanner` + `ExecutionPlan` / `ExecutionStep` (status PLANNED)
- Porządkuje Recommendation 1:1 (seq, goal, delivery_groups, recommendation_ref)
- Plan: `projection.execution_plan`; bez zmiany decyzji Engine
- Testy CP3 + suite supply_flow

## 2026-08-03 — Capability Pack 2: Explainable Decision

- `ExplainableDecisionBuilder` + model `ExplainableDecision` (projekcja only)
- Konsumuje Recommendation, `priority_contributions` (z PriorityResolver), BusinessEffect
- Plan: `explainable_decisions` + `recommendation.explanation`
- Bez confidence / why_not / konfliktów / kolejek / Cross Dock / symulacji
- Testy: 25 passed

## 2026-08-03 — PriorityResolver → PriorityPolicy architecture

- Pakiet `pipeline/priority/`: Context, Contribution, Policy protocol, aggregator
- Policies: Phase, ETA, Demand, Recovery, Capacity, Slotting (CP1 math 1:1)
- `PriorityResolver` tylko buduje Context i sumuje Contribution
- Alias `DeliveryPriorityFactors` = `PriorityContext`; testy CP1 zielone (22 passed)
- Bez Explainable / confidence / why_not

## 2026-08-03 — Supply Flow Capability Pack 1: dynamic priority

- `PriorityResolver`: multi-factor (phase/ETA/wait/open PZ/unlockable Recovery orders/capacity/slotting)
- READ: delivery `product_ids`, recovery `shortage_links`, slotting `slotted_product_ids`
- `BusinessEffectBuilder` czyta PriorityResolution (unlock estimate + top priority)
- CandidateActionBuilder bez zmian logiki priorytetów
- Testy CP1 + suite supply_flow

## 2026-08-03 — Supply Flow ETAP 3C: decision pipeline

- Pakiet `services/supply_flow/pipeline/`: CandidateAction / Priority / BusinessEffect / CTA / Recommendation builders + runner
- Engine tylko: gather_input → DecisionPipeline.run → upsert plan
- RecommendationBuilder = czysta projekcja ranked actions (bez ifów biznesowych)
- Testy: 19 passed

## 2026-08-03 — Supply Flow ETAP 3B: Engine v1 (prosta logika)

- `engine_input.py` + `analysis.py`: rekomendacje fazowe, priorytet deterministyczny, business_effect jakościowy
- READ: inventory/recovery/slotting/capacity(DOCK)/putaway open PZ — agregaty SSOT
- Plan `stage=v1_simple`; CTA → istniejące ścieżki WMS
- Testy: 16 passed; bez ML / explainable / kolejek

## 2026-08-03 — Supply Flow ETAP 3A: Event Pipeline

- Pakiet `services/supply_flow/events/`: types, buffer, publisher, dispatcher, handlers
- WMS publikuje wyłącznie `publish_supply_flow_event` (receiving/putaway/delivery)
- Dispatcher: dedupe, group(warehouse), debounce (flush window), priority → 1× recompute
- Testy: 13 passed; bez algorytmów

## 2026-08-03 — Supply Flow ETAP 2: wiring WMS

- Hooki: `finish_wms_receiving_pz`, `finalize_wms_relocation_pz`, `create_delivery`, `update_delivery`
- `orchestration.advance_toward_phase` (graf + macierz, bez sync osi zakupowej)
- Soft CTA/next → `/wms/receiving`, `/wms/putaway`, `/goods-orders`
- Putaway READ: SQL agregaty statusów PZ; Engine stage=`wiring`
- Testy: 8 passed; bez UI / algorytmów

## 2026-08-03 — Supply Flow ETAP 1 zaakceptowany

- Po fixie config + macierz użytkownik zaakceptował zamknięcie ETAPU 1
- ETAP 2 nie rozpoczęty

## 2026-08-03 — Supply Flow ETAP 1: fix audytu (config + macierz)

- `SupplyFlowWarehouseConfig` (tenant+warehouse): `optimization_goal`, `planning_horizon_hours`
- Usunięto goal/horizon z `SupplyFlowPlan`; Engine czyta config, plan = wynik
- `PURCHASE_OPERATIONAL_PHASE_MATRIX` — walidacja kombinacji, bez nadpisywania osi
- Schema: bez seed sync status→phase; migracja legacy kolumn planu → config
- Testy: 5 passed

## 2026-08-03 — Supply Flow ETAP 1: fundament backendu

- `operational_phase` + historia na dostawie; Living `SupplyFlowPlan` (projekcja)
- Pakiet `services/supply_flow`: Engine szkielet, recompute triggers (TODO hooks), adaptery READ/WRITE
- Schema: `ensure_supply_flow_schema`; bez UI / algorytmów

## 2026-08-02 — Audyt wizualny Analizy (przeglądarka)

- Przejście całego hubu w UI; znaleziono 14 widocznych EN fraz
- Centrum: pick-face/stock/OMS/putaway/replenishment/priority_* → PL (API + render)
- Raporty: Unknown Product → Nieznany produkt
- Re-check w przeglądarce: 0 EN w treści Analizy

## 2026-08-02 — PL UI: Centrum operacyjne + Analysis leftovers

- CentrumOperacyjnePage: Deadline→Termin, Timeline→Oś czasu, Stock→Stan
- PickingStrategyPage: CART/BASKET/ZONE/HYBRID → Wózek/Koszyki/Strefy/Hybryda; vs→względem
- BundleIntelligence PriorityBadge: Wysoki/Średni/Niski; InventoryValue: backendem→systemem
- SalesForecast NOT_ENOUGH_MSG i PickingAnalysis: już PL, bez zmian

## 2026-08-02 — Pełna polonizacja UI hubu Analizy

- Usunięto EN z Centrum/Raportów/Optymalizacji (Idle/Score/Scan, vs, CART…, Plan/Ranking → harmonogram/klasyfikacja)
- Prognoza: mapowanie EN message z API; zestawy: polishRecommendation (bundle/pick-face)
- Audyt skryptowy UI stringów: 0 pozostałych EN z listy zakazanej
- Backend bez zmian

## 2026-08-02 — warehouse_id: wspólny scope Analizy/Optymalizacja

- Mechanizm: `useWarehouseApiScope` / `buildWarehouseParams` / `AnalizyWarehouseSelect`
- Naprawione m.in. Bundle Intelligence (brakowało `warehouse_id` → 422) + walking-cost, hot-locations, pick-density, picking-analysis, slotting, strategy, sales-forecast, pick-route/orders
- Źródło: aktywny magazyn z `WarehouseContext` (bez lokalnych `/warehouses/` na ekranach WH-scoped)
- Backend bez zmian

## 2026-08-02 — Analizy P0/P1: produkcyjna spójność UI

- Polonizacja (Centrum, kompletacja, układ, placeholdery)
- CTA/nagłówki/KPI/side-nav: tokeny `analizyUi` + brand orange
- Loading z nagłówkiem; empty Plan/Ranking z CTA czasownikami
- Mapa magazynu: `AnalysisDecisionHeader` + CTA

## 2026-08-02 — Audyt jakości hubu Analizy (pre-release)

Werdykt: **nie gotowy do wydania** bez poprawy EN w UI + Manifest na Mapie magazynu + ujednolicenia CTA/headerów.
Szczegóły w raporcie sesji (✅/⚠/❌). Legacy stubów brak; thin re-exporty analytics→Analysis nadal używane.

## 2026-08-02 — IA v2: Przegląd / Raporty (bez „Analizy → Analizy”)

- Zakładki hubu: Przegląd · Centrum operacyjne · Raporty · Optymalizacja
- Mapa magazynu w bocznym menu Raportów; usunięte martwe wrappery (batch/rotation/density/walking-cost)
- PL w UI (układ towaru, zestawy, rotacja); breadcrumbs Centrum uproszczone

## 2026-08-02 — IA: jeden hub Analizy w sidebarze

- Usunięto osobne pozycje sidebaru: Centrum operacyjne, Optymalizacja
- Jedna pozycja: **Analizy** → `/analytics` (Pulpit startowy)
- `AnalizyModuleLayout` + sekcje: Pulpit · Centrum operacyjne · Analizy · Optymalizacja
- Routing i logika biznesowa bez zmian; tylko Information Architecture

## 2026-08-02 — Faza 4 zaakceptowana

- Zamknięcie pętli: Realizacja → Ocena → Historia
- Produkt kompletny jako cykl zarządzania magazynem (nie Enterprise)

## 2026-08-02 — Faza 4: Realizacja + ocena + historia zmian

- Status „Zweryfikowana”; cykl życia zamknięty
- Historia zmian magazynu (`/optymalizacja/historia`) — decyzje biznesowe
- Ocena PRZED/PO/Różnica z realnych odczytów (walking-cost); inaczej „Oczekuje na dane”
- Ranking skuteczności (`/optymalizacja/ranking`) — tylko zweryfikowane z deltą
- Bez nowych analiz/KPI/wykresów

## 2026-08-02 — Plan zmian: statusy, źródło, realizacja

- Statusy: Nowa / Zaplanowana / W realizacji / Wdrożona / Odrzucona
- Źródło rekomendacji (originLabel) + efekt (metryka lub Wysoki/Średni/Niski wpływ)
- „Wybierz sposób realizacji” → Projektant / MM / Strategia / Centrum / WMS
- Migracja planu FE v1 → v2

## 2026-08-02 — Optymalizacja: jeden Plan zmian magazynu

- Wspólny plan FE (`warehouseChangePlanStore`) — rekomendacje z 3 analiz
- Landing = pulpit planu (ile czeka / wpływ / co pierwsze)
- CTA: „Dodaj do planu zmian” / „Dodaj strategię do planu”
- Strona `/optymalizacja/plan` — lista, priorytet, wpływ, usuń, źródło, wdrożenie

## 2026-08-02 — Optymalizacja Faza 3 v1

- Landing `/optymalizacja` (układ / strategia / trasy+dystans)
- `OptimizationToolHeader` + `OptimizationPlanPanel` — każde narzędzie kończy się planem
- Walking cost → Optymalizacja (scalenie z trasami); usunięte z nav Analiz
- Slotting: plan przesunięć A; Strategia: zapis rekomendacji; Trasy: plan skrócenia drogi

## 2026-08-02 — Analizy Faza 2: Manifest (pytanie → decyzja → CTA)

- Dashboard Analiz = landing decyzyjny (max 7 kart, bez backend health)
- `AnalysisDecisionHeader` na raportach + bezpośrednie CTA
- Scalenie: product-rotation / batch-picking → hot-products; pick-density → hot-locations
- Sub-nav Analizy skrócony do 9 pozycji hubowych

## 2026-08-02 — Analizy Faza 1: Split Centrum

- Centrum operacyjne → `/centrum-operacyjne` (top-level, poza Analizami)
- Analizy: Dashboard = landing `/analytics` (bez peer-tab)
- Optymalizacja → `/optymalizacja` (slotting, strategia, trasy)
- Mapy usunięte z menu; logika mapy zachowana
- PL etykiety UI (bez zmiany nazw technicznych API/plików)

## 2026-08-02 — Analizy Faza 0: Hygiene

- Usunięto z menu/nav 6 stubów (dzień, czas, ruch, layout, throughput, problemy kompletacji)
- Stare URL → redirect do działających powierzchni
- Usunięto orphan AnalysisLayout + analysisTabs + pliki stubów
- Batch pick-route: FE → prawdziwy silnik (`order_ids`); legacy `/batch/` deleguje zamiast liczników debug

## 2026-08-02 — WMS: tryby operacyjne vs uprawnienia modułów

- Usunięto z trybów: Operacje, Wózki, QC, Dokumenty, Analiza, Zakupy, Szablony etykiet
- Nowe liście uprawnień: `warehouse.carts`, `warehouse.qc`, `documents.view`, `analytics.view`, `purchasing.view` (+ reuse `warehouse.operations`, `workforce.ops.label_templates`)
- Migracja JSON trybów → `user_permissions`; Operacje gated przez `requiredPermission`
- Guard: profile tylko z hubami legacy nie są zerowane do `[]` (to otwierałoby wszystkie tryby floor)

## 2026-08-02 — Document logo: data-URI embed + company.logo

- Przyczyna: branding zapisuje `/uploads/...`, ale preview/PDF nie osadzały pliku (relative src + `file://` w Puppeteer)
- Fix: `upload_media_embed` → data URI; `company.logo` w global context; `document_header` czyta też `branding.logo_url`
- Tymczasowe logi `[doc.logo]`

## 2026-08-01 — RMZ: inline Uszkodzone/Odrzucone

- Zamiast drawera: rozwijany panel w karcie produktu (height+opacity ~220ms)
- Accordion: tylko jedna karta naraz; badge decyzji po zapisie
- Klasa A/B/C + checklist typów; odrzucenie: kategoria → powody

## 2026-08-01 — RMZ detail: spójność z Panelem Zamówienia

- Usunięty widget + CTA „Terminal WMS”; dostęp tylko z menu ⋮ gdy WMS aktywny
- Usunięty badge „W trakcie”; etykieta listy = `PanelBulkStatusPickerDropdown` / `PanelTreeStatusItem`
- Decyzje produktu: samodzielne segmented buttons (bez szarego kontenera)
- Prawa kolumna: etykieta → notatki → postęp → dziennik → dokumenty; kompaktowe karty produktów

## 2026-08-01 — Lista zwrotów: status panelu + kolumny

- Kolumna Status = `PanelTreeStatusItem` (ten sam co sidebar); bez szarych kapsuł
- Usunięty przycisk/akcja WMS z listy; wybór kolumn DnD + autosave + Przywróć domyślne

## 2026-08-01 — Zwroty: redesign widgetów detail

- Karty SaaS (`ReturnDetailWidgetShell`), produkty jako karty + segmented decyzje
- Status badge, progress bar, timeline dziennik, KPI podsumowanie/stats
- Terminal WMS ukrywany przy `inventory_management_mode=DOCUMENTS_ONLY`
- Konfigurator bez zmian

## 2026-08-01 — Formularz zwrotu klienta: nowy layout

- Osobna strona 70/30, karty produktów, sticky podsumowanie; bez tabel
- „Dodaj do zwrotu” → zielony stan + pola; IBAN dopiero przy przelewie
- Operator `OrderCaseCreateView` nietknięty

## 2026-08-01 — Panel statusów: wyrównanie lewej krawędzi

- Mniejszy lewy padding powłoki (`pl-0.5`); bez wcięć `pl` na listach/podgrupach
- Wspólna linia: Wszystkie / grupy / podgrupy / kafelki; ciaśniejszy mt grupa→status

## 2026-08-01 — Zwroty/reklamacje UX polish + formularz klienta

- Dropdown bez pustego stanu / WMS; Formularz zwrotu → ekran klienta
- Messages/docs bez „Przejdź do…”; scroll do wiadomości w Komunikacji
- `displayCustomerComment` odcina logi systemowe z komentarza klienta

## 2026-08-01 — Zwroty/reklamacje: tworzenie w Panelu Zamówienia

- Nowy zwrot/reklamacja w `OrderCaseCreateView` (produkty + summary), nie redirect WMS
- Header bez Spakuj; menu Dokumenty tylko wystawione + wystaw sprzedażowy/magazynowy
- Po create: karta w Panelu; RMZ nadal w module WMS

## 2026-08-01 — Modal Zamień produkt: redesign wizualny

- Bez ramek przy zdjęciach; filtry segmentowe; lżejsze badge; zwarta lista
- Kafelki „Najlepsze dopasowania” + scroll; footer: Zamieniany produkt + checkbox
- Logika search/filtrów bez zmian

## 2026-08-01 — Order header: Sellasist popover UX

- Ikony → dropdown (nie modal); modal tylko przy wprowadzaniu danych
- Returns/messages/docs/link/copy/print przebudowane na context menu
- Link: lista + „Połącz nowe…” → modal; Copy: 3 opcje → formularz

## 2026-07-24 — Panel statusów: wyciszone liczniki

- Usunięte kolorowe pastylki; małe okrągłe badge ~26px (białe + ramka)
- Tint badge tylko dla aktywnego wiersza; kolor kategorii na pasku/kropce
- Grupy: ten sam spokojny badge (nie solid); nazwa > licznik, hover = tło wiersza

## 2026-07-24 — Order header actions toolbar (mockup)

- 6 ikon 36×36: zwroty, wiadomości, dokumenty, połącz, kopiuj, drukuj
- Panele/modale w `headerActions/`; badge zgłoszeń + wiadomości
- Link lokalny (localStorage); copy UI gotowe pod API
- Zachowane: pin, bookmark, Spakuj

## 2026-07-24 — Panel statusów: UI pod mockup (tylko prezentacja)

- Grupy: kropka + uppercase + solid badge + lock + chevron; większe odstępy
- Statusy: kafelki z ramką/hover/active + soft badge; podgrupy uppercase
- Search pill; collapsed: kropka/pasek + badge bez nazw
- Bez zmian filtrowania / liczników / API

## 2026-07-24 — Fix „Oznacz jako czeka” (no auto-pick)

- `compute_line_missing_qty`: waiting nie zeruje braku; `line_shortage_display_kind` → `waiting` first
- Packing: nie inflate `picked_quantity_final` przy `oms_waiting_for_stock`
- Audit: `emit_oms_decision_wait` z `operator_user_id` + komunikat produktu; patch endpoint przekazuje usera
- UI: badge CZEKA/OCZEKUJE (karta produktu, workflow pick, Braki detail)

## 2026-07-24 — Dokumenty i pliki: polish pod mockup

- Karty Dokumenty/Załączniki/LP: gęstsza tabela, badge statusów, ujednolicone akcje
- Toolbar zaznaczania + CTA Dodaj plik; bez zmian logiki dokumentów/API

## 2026-07-24 — Komunikacja: centrum komunikacji pod mockup

- 8/4: compose + historia korespondencji | AI + klient + notatki/komentarz
- Bubble UI z istniejących `orderNotes`; kanały/szablony/Sugestia AI lokalnie; bez zmian API wysyłki

## 2026-07-24 — Logi: journal UX pod mockup

- Lekka tabela (czas+status, wykonawca, zdarzenie, efekt); sort newest/oldest; paginacja
- Szukaj + Filtruj (severity/daty przez istniejące parametry API); bez zmian backend/logiki

## 2026-07-24 — Produkty i magazyn: karty 1:1 mockup (UX only)

- Lista → osobne karty (thumb contain, meta, metryki, wartość, kebab); zestawy „Zestaw zawiera”
- Braki / zamienniki / usunięte jak mockup; footer WMS z lokalizacją + badge + operator
- Sticky prawa kolumna (KPI + timeline); opakowania: galeria rekomendacja+alternatywy
- Bez zmian API / modeli / logiki WMS; pełna funkcjonalność zachowana

## 2026-07-31 — Podsumowanie: final commercial polish

- Zwarte 4 kolumny kontekstu; produkty `text-3xl`; prawa kolumna jako jeden panel
- Kompaktowe empty: Wideo / listy; notatki 2 linie + auto-grow; cichszy Safe Order
- Ship/pay Zapisz–Anuluj tylko dirty; bez usuwania funkcji; bez ponownych logów

## 2026-07-31 — Dopasowane opakowanie: kompaktowa karta rekomendacji

- Jeden nagłówek sekcji; bez diagnostyki Smart Matching na wierzchu (Szczegóły)
- 2 kolumny: rekomendacja + placeholder/wybór; badge REKOMENDOWANY / Hybryda / Pewność / Wypełnienie / Tryb
- Miniatury produktów i kartonów: `object-contain`, bez ramek/tła/cieni

## 2026-07-31 — Karta Zamówienia: przywrócenie pełnej funkcjonalności

- Cofnięto nadmierne uproszczenia density pass: pełne opakowania, Safe Order, chipy WMS, Listy przewozowe, Wideo WMS, Wiadomość do klienta, pełny chrome kart
- Przyciski Spakuj / Dodaj produkt / Dodaj zestaw na Podsumowaniu (te same modale co zakładka Produkty)
- Sposób wysyłki / płatność: Zapisz+Anuluj tylko przy dirty draft
- Bez kasowania możliwości; mockup = tylko hierarchia/kompozycja

## 2026-07-30 — Karta Zamówienia: final product UX pass

- Usunięto stuby (puste Wideo, fałszywy composer wiadomości → link do Komunikacji)
- Opakowania tylko gdy jest treść; sticky panel finansowy; max-w 1680
- Gęstszy info strip, produkty jako pas centralny, kompaktowe empty/CTA
- Bez zmian API/logiki

## 2026-07-30 — Karta Zamówienia: UX density / hierarchia (summary)

- Status pełny (bez truncate), jak makieta; jedna etykieta grupy
- Produkty jako pas centralny; mniej ramek; niższe wiersze; wrap meta
- Prawa kolumna = jeden panel (`aside`) zamiast stosu kart
- Opakowania `operatorQuiet` (bez silnik/pewność); puste sekcje kompaktowe
- Zacieśnione paddingi/gapy; `max-w-[1440px]`; bez zmian API/logiki

## 2026-07-30 — Karta Zamówienia: przebudowa UX wg makiety (summary)

- Tokeny + `OrderDetailInfoColumn` / `OrderDetailProcessStatusRow`
- Nagłówek (numer dashed) + status/proces + stepper z istniejącego WMS pick/pack
- Podsumowanie: 4 kolumny info, tabela produktów (compact), siatka 8/4, notatki/logi
- Bez zmian backend/API/logiki

## 2026-07-30 — Automatyzacje: wspólne summary na liście + historii

- Extract: `AutomationConditionSummary`, `AutomationEffectSummary` (edytor + lista + historia)
- Lista: max 3 warunki/efekty, `+N kolejnych…`, expand jednego wiersza, bez ORAZ/LUB
- Historia: `groupChangeLogEntries` (ruleId+userId+sekunda/≤2s) → jedna karta / save; badge + tone diff
- Bez zmian API / `computeRuleChangeLogEntries`

## 2026-07-30 — Edytor automatyzacji: exclusive Auto/Ręcznie + layout SaaS

- Kafelki przełączają fokus UI — pokazywana tylko konfiguracja wybranego trybu
- Auto: 2 kolumny (opóźnienie/tryb | dni+harmonogram), wiersze dni z dividerami
- Ręcznie: wygląd+podgląd 2 kol., widoczność w siatce, skrót i „Sprawdzaj warunki” jako osobne karty
- Badge JEŚLI = orange jak TO

## 2026-07-30 — Edytor automatyzacji: layout 1:1 (v2)

- Jedna karta „Ustawienia wykonania”: kafle + 2 kolumny (tryb | dni/godziny)
- Dni Pn–Nd: równa szerokość, selected = brand orange
- JEŚLI/TO: wiersze jak select/operator/wartość + menu ⋮ (IconButton); edycja nadal modal
- Dolny pasek: tylko Anuluj; Zapisz w nagłówku; Usuń przy historii

## 2026-07-29 — Edytor automatyzacji: UI 1:1 z projektem

- Nagłówek w karcie: Nazwa / Grupa / toggle Aktywna (emerald) / Test / Zapisz
- Kafelki Automatycznie / Ręcznie (Przycisk) z brand orange selected
- Harmonogram: Ciągły / godziny / dni+godziny; karty per dzień (wspólne windowFrom/To w modelu)
- JEŚLI / TO: badge’e, dashed CTA, okrągła strzałka; bez zmian logiki/modali edycji

## 2026-07-29 — Profile wydruku na stanowisku

- SSOT: `backend/printing_profiles/` (`DOCUMENT_TYPE_TO_PRINT_PROFILE`, profile codes)
- Stanowisko mapuje drukarkę → profil (nie dokument / moduł WMS)
- Migracja `print_profiles_v1`: legacy `labels|shipping_label|invoice|order|other` → profile; collapse DOCUMENTS
- FE `PrintersTab`: tylko 4 profile; `resolvePrintRoute` przez `profilesForPrinterKind`
- Resolution kolejki: `printer_resolution_service` → `document_type_to_print_profile`

## 2026-07-29 — Browser PDF open + Agent GDI deploy

- `openPdfBlobInPrintViewer`: otwiera natywny blob PDF (bez HTML embed / bez noopener)
- Agent 1.4.0 zainstalowany in-place na E-HANDEL: `PdfShellPrint=False`, `WindowsGdiDocumentPrinter=True`, `PDFtoImage`+`pdfium` w Program Files; Host PID start 20:16:59
- Dowód pipeline: `pdf-driver.log` → `pipeline=PDFium->GDI`

## 2026-07-29 — Podgląd szablonów wydruków = render (jak etykiety)

- Wspólny `TemplatePreviewShellModal`; etykiety i dokumenty używają tego samego chrome
- Lista wydruków: „Podgląd” → PDF z silnika (`preview/pdf`), „Użycia” osobno; usunięto Otwórz→Firma z usage modal
- Karty: klik miniatury = podgląd, body = edytor

## 2026-07-29 — Agent: PDF przez renderer, nie RAW

- `PdfPrintDriver`: PDFium (`PDFtoImage`) → bitmap → GDI `PrintDocument` (STA); **bez** `WindowsRawSpooler`
- `WindowsRawSpooler` tylko ZPL/EPL/ESC-POS/PCL/PostScript/raw (`RawPrintDriver`)
- `DriverFactory` (alias `PrintDriverResolver`): switch format → `IPrintDriver`; dodano Image + native language tokens
- Lokalny „Druk testowy” tray nadal `PrintDocument` (GDI) — ta sama klasa ścieżki co PDF po renderze

## 2026-07-29 — Print dialog: szablon + miejsce wydruku

- Nowy `PrintDocumentDialog`: szablon (DTE), stanowisko (drukarka + Online/Offline), alternatywy PDF/przeglądarka
- Prefs `sasist_print_document_prefs_v1` per typ dokumentu
- `default_printer_name` na liście stanowisk; `template_version_id` w queue (stock/sale/production)
- Usunięto z UX słowa Agent / kolejka / mapowanie

## 2026-07-29 — Print UX: packing session ≠ wszystkie wydruki

- `resolvePrintWorkstation` + `usePrintMethodFlow`: sesja pakowania **lub** available-for-me (1=auto, N=picker Online/Offline)
- Domyślnie Agent (bez pierwszego ekranu Agent/Przeglądarka/PDF); alternatywy dopiero „Inna metoda” / offline / brak Agent
- Callery: dokumenty magazynowe/sprzedaż, produkcja, zwroty, Z-PZ, LabelPrintQueue
- Test print stanowiska bez zmian (workstation_id z edycji)
- Usunięto „Rozpocznij pakowanie…” z ścieżek poza gate pakowania

## 2026-07-29 — Print pipeline: packing session SSOT only

- Print FE (`usePrintMethodFlow`, `useQueuePrint`, `resolvePrintRoute`) reads only `packingSessionWorkstationId()` — no auth/me
- Without session → „Rozpocznij pakowanie i wybierz stanowisko.”
- Test page → WorkstationPrinterMapping (no PrintingDefaults); PrintJob.workstation_id set
- HistoryTab → PrintJobs by workstation_id
- device_count skips EdgeDevice with legacy_printer_id (align with DevicesTab)

## 2026-07-29 — Stanowisko SSOT + Pakowanie (final architecture)

- Usunięto Settings → Urządzenia/Drukarki (menu + strony); redirect `/settings/printers|devices|/setup/printers` → Stanowiska
- `user_wms_workstation_access` + `workstation_ids` w profilu WMS; admin checkboxy w AdministratorEditPage
- Gate tylko `/wms/packing/*` (`WmsPackingWorkstationGate`); sesja v3 = SSOT `workstationId`; `packing_station_id` = last-used
- Queue/capability: workstation mapping only (`NO_WORKSTATION` / `NO_WORKSTATION_MAPPING`); PrintJob: `workstation_id` + `created_by_user_id`
- Bez auto-fallback QZ/browser w `executePdfLabelPrint` / `resolvePrintRoute`

## 2026-07-29 — Printing cleanup po Sasist Agent

- `cloud-capability` → Stanowisko + Agent online + mapowanie (bez `PrintingDefault`); query `workstation_id`
- FE: `usePrintMethodFlow` bierze `packing_station_id`; QZ tylko w `import.meta.env.DEV`
- `/settings/printers/*` → redirect do Ustawienia WMS → Stanowiska; usunięto tab „Druk (kolejka)” z Urządzeń

## 2026-07-29 — Fix DTE Jinja loader for extends/include (production-card.pdf)

- Root: `_render_plain` / incomplete resolved sets used Environment(loader=None) or DictLoader without `base_document`
- Fix: `resolve_plain_twig` + `_ensure_system_dependencies` load filesystem BASE/PARTIALS into DictLoader
- Files: `_engine_backend.py`, `template_resolution_service.py`, `system_starter_library.py`

## 2026-07-29 — production-card.pdf HTTP 500 root cause


- Cause: DTE starter `production_card` uses `{% extends "base_document" %}` but `resolve_plain_twig` → `_render_plain` (no Jinja loader) → `TypeError: no loader for this environment specified` → unhandled 500
- Fix: `document_engine_available` returns False for plain extends starters (legacy Jinja path); full `logger.exception` on PDF/HTML path + API re-raise after log
- File/line: `backend/document_templates/render/_engine_backend.py` `_render_plain` ~L85

## 2026-07-29 — Stanowiska = zakładka Ustawień WMS (FE UX only)


- Shared `WmsSettingsChrome` + `WMS_SETTINGS_TABS` (Stanowiska as last tab → `/settings/wms/workstations`)
- Removed header CTA „Stanowiska”; breadcrumbs: Ustawienia WMS → Stanowiska → [nazwa]
- Dropped `max-w-3xl` / private PageLayout shells; list rows + `WmsSettingsSection` / tokens
- Detail full-width; Agent status panel; Devices category cards + compact empty; Printers settings rows; History timeline + icons
- `useWmsSettingsSectionAnchor` no-op outside registry (sections usable without side nav)

## 2026-07-29 — Stanowiska UX + nawigacja (FE)


- Shared shell: `WorkstationTabShell`, `WorkstationCard`, `DeviceCard`, `WsStatusBadge`, `WorkstationDescList` (`max-w-3xl`)
- Tabs rebuilt: Agent description cards; Devices device cards; Printers mapping cards + Skonfigurowano badges; History timeline cards
- Nav: removed Stanowiska from DevicesSettingsModule tabs; devices index → inventory (not workstations); tests assert WMS category active, Settings/Urządzenia inactive

## 2026-07-29 — Stanowiska: Drukarki empty state vs Urządzenia

- Root cause: Devices = EdgeDevice; Printers mapping = AgentPrinter only (empty after token-only pair)
- Fix: edge sync + GET devices/printers materialize AgentPrinter + legacy_printer_id; empty state only when zero discovered printers
- FE: mapping form copy; placeholder „wybierz drukarkę”
- Test: `test_printers_tab_uses_edge_discovered_printers`

## 2026-07-29 — Pairing blocker: Host crashed on spent pairing code

- Root cause: Tray persisted pairing code as `agent_api_key`; Host `EnsureRegisteredAsync` re-claimed it → 401 → no heartbeat
- Fix: Tray does not store pairing code; Host clears pairing-shaped ApiKey and skips register when token present
- Proven: register skip + heartbeat 200 + online + 4 devices against Railway
- TEMP diag logs (no secrets) on Agent/Backend/FE

## 2026-07-29 — Sasist Agent Tray UI/UX (SaaS desktop)

- Visual-only: Theme radii/typography/shadows, header (logo+name+badge+version), sidebar without brand block, PageShell centered max 960, Pairing onboarding card + SasistTextField 48px, soft status pills
- Build: Tray Release OK

## 2026-07-28 — Onboarding E2E: pairing code visible + flow


- Root cause: naive `expires_at` → FE local parse → immediate expire; poll cleared code; POST /pair then GET refetch race
- Fix: UTC-aware expires_at; FE parseApiUtcMs + sessionStorage code; no destructive refresh after pair; poll grace; default Agent tab; post-pair → Devices → Printers + test print
- Tests: pairing expires_at timezone assertion

## 2026-07-28 — WMS Stanowiska RC1 (Red Team blockers)


- RC1-1: no auto-pick workstation; `workstation_id` via `useQueuePrint` / session `packing_station_id` / label router; mapping then PrintingDefault
- RC1-2: removed Restart Agent UI + FE API client (`restartWorkstationAgent`)
- RC1-3: tenant stays panel SSOT (`DAMAGE_TENANT_ID` / `panelTenant`) — FE not inventing tenant truth beyond app pattern

## 2026-07-28 — WMS Stanowiska Medium/Low + Final audit (~92% PR)


- M1: batch serialize, history offset, pairing-status poll, visibility pause, event index
- M2/M3: FE split + Empty/Error states; warehouse filter; no tab double-fetch
- M4: business logs; no secrets; GET agents DEBUG
- M5/M6/Low: API cleanup, AddComputerModal removed, ApiKeys dead branches, Agents deprecation
- Deferred: is_default partial unique, settings.users permission pattern, Agents ops page
- Canvas final audit updated

## 2026-07-28 — WMS Stanowiska High Priority H1–H7

- H1: AgentTab poll 2.5s + TTL expire + auto „Połączono”
- H2: `claim_pairing_code` CAS single-use, rate-limit IP, audit issue/claim/fail
- H3: system keys hidden from API Keys; mutate blocked; workstation revoke/regen with allow flag
- H4: `assert_tenant_warehouse_scope` + tenant/warehouse checks on attach/claim
- H5: restart-agent → 501 bez eventu historii
- H6: re-pair disconnect-first; `pairing_active` z hash+TTL
- H7: empty state + download + status/PC/OS/version/IP/uptime/sync
- Tests: 12 passed (`backend.tests.wms_workstations`)
- Audyt #2: High 7/7 closed; Prod readiness ~75%; Medium/Low open

## 2026-07-28 — WMS Stanowiska C1–C3 production blockers

- C1: `resolve_queue_printer_id` → WorkstationPrinterMapping (SSOT) then PrintingDefault fallback; `workstation_id` on QueuePrintRequest
- C2: `register_agent_with_api_key` no longer commits; register+attach+events one transaction
- C3: one-shot `wms_data_migrations`; no key→empty-WS hijack
- Tests: 15 passed (workstations + print resolution)

## 2026-07-28 — WMS Stanowiska (miejsce pracy ≠ komputer)

- Model: `wms_workstations` + printer_mappings + events; 1 Agent max na stanowisko
- API: `/api/wms/workstations*` (pair/disconnect/devices/printers/history)
- Pair: kod `XXXX-XXXX-XXXX` 15 min → register Agenta bez zmian protokołu
- FE: lista + 5 zakładek; język biznesowy; API Keys bez tworzenia printer_agent
- Redirect: Devices/agents, AddComputer, setup/printers → Stanowiska
- Migracja idempotentna agentów/kluczy → stanowiska (Tier1 schema)
- Testy: `backend/tests/wms_workstations/` — 5 passed

## 2026-07-28 — Release: restore self-contained (no .NET Runtime)

- Root cause: `bin\Release` (FDD) was copied over install; runtimeconfig had `frameworks[]`
- Pipeline OK: `publish-release.ps1` uses `--self-contained true -r win-x64`; Inno sources `publish\win-x64`
- Added Assert-SelfContained gate (refuse ship if `frameworks[]` / missing coreclr)
- Fresh setup: `dist\SasistAgentSetup.exe` (~50 MB); publish ~163 MB; installed Tray has `includedFrameworks`

## 2026-07-28 — Sasist Agent Design System

- Central Theme tokens (colors, Space 4–48, Type scale Display→Hint)
- Component kit in `DesignSystem/`; all pages wired to DS (no local styles)
- Empty states on Devices/Jobs/Logs; Motion pulse for loading
- Layout smoke PASS 100–200%; shots in `dist/ui-shots/`
- MVP/poll/backend untouched

## 2026-07-28 — Sasist Agent UI quality: MVP + no flicker

- Root cause of flicker: timer called full page rebuild (`Controls.Clear`) every poll
- Fix: `ShellPresenter` / `IPageView` — structure once; poll updates labels/cards in place only
- Sidebar: `TableLayoutPanel` AutoSize rows; width from longest nav label
- Layout smoke PASS 100–200% (incl. 175%); stability 60s: rebuilds=0
- Cosmetics still frozen until UI stays stable

## 2026-07-27 — Sasist Agent layout foundation (DPI freeze)

- Fixed: PerMonitorV2 + AutoScaleMode.None; removed Absolute/Location layouts; AutoSize labels; card PreferredSize
- `--layout-smoke` audits clip/overlap at simulated 100/125/150/200% — all PASS
- Visual redesign paused until layout stays green

## 2026-07-27 — Sasist Agent 1.2.0 UI from scratch (Sasist DS)

- Discarded prior WinForms polish; new shell (top bar + 320px sidebar + pages)
- Tokens from FE design-system; custom cards/buttons/nav/toggles; PerMonitorV2, AutoScale none
- Pages: Status 6 cards, Devices printer cards, History list, Logs filters, Diagnostics sections, Test checklist, Settings rows+toggles, Updates card
- Screenshots: `sasist-agent/dist/ui-shots/`

## 2026-07-27 — Sasist Agent 1.1.1 modern UI redesign

- Theme system (light/dark), Fluent icons, rounded cards, modern nav
- Pages: Status cards, Devices cards + test print, Jobs timeline, color Logs, sectioned Diagnostics, Test suite, Settings, Updates
- No architecture/backend/protocol changes

## 2026-07-27 — Sasist Agent 1.1.0 desktop product window

- MainForm management center (Status / Devices+test / Jobs / Logs / Diagnostics / pairing)
- Installer: PrepareToInstall stop+taskkill before copy; version 1.1.0; CloseApplications=force
- Verified upgrade 1.0.0→1.1.0 silent: exit 0, no DeleteFile code 5; service Auto+Running; Tray MainWindowTitle=Sasist Agent

## 2026-07-27 — Sasist Agent customer UX (Tray)

- Status / Urządzenia / Diagnostyka as separate windows; no tech IDs on main screen
- Pairing: „Połącz z Sasist” + „Kod połączenia” only; tray menu simplified (Połączono, not Online)
- Friendly errors; updates copy: „Masz zainstalowaną najnowszą wersję.”
- INSTALACJA.md rewritten for warehouse owners

## 2026-07-27 — Stage 5 Final Cutover (Agent product)

- Official path only: `sasist-agent` → `SasistAgentSetup.exe`
- Root build/release/CI retargeted; Python agent → `legacy/sasist-printer-agent`
- Backend download default `SasistAgentSetup*` (+ legacy prefix compat)
- Report: `docs/sasist-agent/STAGE5-CUTOVER-REPORT.md`

## 2026-07-27 — Sasist Agent UX pairing (pre-release)

- Usunięto Server URL z UI; API wbudowane (`https://api.sasist.pl`, Dev: env / appsettings.Development)
- Ekran „Kod parowania” + Tray: Online, firma, urządzenia, Odłącz, branding (logo/ico)
- Przyjazne błędy; `company_name` w odpowiedzi register; `status.json` dla Tray
- Docs: INSTALACJA.md uproszczona pod klienta

## 2026-07-27 — E2E install test + ship fixes

- Full client-path E2E on Windows; report: `sasist-agent/dist/E2E-REPORT.md`
- Fixes: ProgramData ACL, plugin parameterless ctor, re-register printers, HttpClient BaseAddress, PDF spooler under LocalSystem, Host wait-for-config
- Final `SasistAgentSetup.exe` rebuilt after fixes

## 2026-07-27 — Sasist Agent Windows installer (ship)

- Tray (`Sasist.Agent.Tray`): Online/Offline, logi, diagnostyka, restart usługi, setup URL+API Key → DPAPI + register
- `scripts/publish-release.ps1` → `publish/win-x64` + `dist/SasistAgentSetup.exe` (Inno Setup)
- Instalator: usługa `SasistAgent`, ProgramData, config.default, Menu Start, start usługi
- Docs: `sasist-agent/INSTALACJA.md`

## 2026-07-27 — Architecture RC v1.0

- Core purged of Printing; `IAgentTransport` + ModuleRegistry + plugin loader
- Host `CompatPrintingTransport`; DPAPI secrets; ACL/replay/rate-limit; no legacy register
- Docs: ARCHITECTURE/RC-1.0/security/FREEZE aligned; WS marked Planned
- Designation: SASIST AGENT ARCHITECTURE v1.0 RELEASE CANDIDATE

## 2026-07-27 — Architecture audit (pre-1.0)

- Read-only validation: Core still holds printing compat + hardcoded job routing → not v1.0 Ready
- Scores & blockers in session report; docs overclaim WS/`/api/agent/v1`
- Plugin drop-in false until Host/runtime generic; registry/EventBus OK

## 2026-07-27 — Edge Computing Core: Device Registry + delta sync

- SDK/Core: config, healthScore, DeviceEventBus, differential sync, remote actions (Refresh/Diagnostics/Logs)
- Backend: `edge_devices*` tables + `/agent/devices/sync|actions|events`
- FE: `/settings/devices` hierarchy; scaffolds Scanner/Scale/Camera/RFID
- ADR-007; printing compat retained

## 2026-07-27 — Edge Device Management foundation

- SDK: `EdgeDevice`, `CapabilityDescriptor`, operational status, remote action contracts
- Core: `DeviceManager` + `RefreshDevices`; Printing uses `WindowsPrinterDeviceProvider`
- Backend parallel: `/api/agent/devices`, `/device/{id}`, `/modules` (projection from printers)
- FE: `frontend/src/devices/*`; Settings „Urządzenia” + type filters; `/printing` kept
- Docs: device.md, ARCHITECTURE, OpenAPI, ADR-006

## 2026-07-27 — Label cutover: PrintingRouter + prefer_sasist_agent

- Central `frontend/src/printing/router` (resolve, execute PDF labels, telemetry)
- Z-PZ / Return Labels / LabelPrintQueue routed via flag + zpl gate; QZ kept as fallback
- PrintMethodDialog: Sasist Agent first; QZ Legacy behind „Pokaż metody awaryjne”
- Smoke: `docs/sasist-agent/smoke-cutover-labels.md`

## 2026-07-27 — Sasist Agent Etap 1: drivers + capabilities + QZ map

- `IPrintDriver` Pdf/Zpl/Raw/Html; RAW spooler; PrintResult + logging
- Heartbeat `supported_formats` → `capabilities_json`; queue rejects unsupported formats
- `prefer_sasist_agent` (warehouse settings API + UI); `docs/sasist-agent/qz-migration-map.md` + TODOs (bez przepięcia)

## 2026-07-27 — Sasist Agent Etap 1: scaffold .NET

- `sasist-agent/`: Sdk + Core + Printing + Host (Windows Service worker)
- Compat `/api/printing` (PDF poll); diagnostics CLI; 4 unit tests
- Build Release OK; ZPL/RAW + installer + tray = kolejne incrementy

## 2026-07-27 — Sasist Agent: freeze protocol v1

- Decyzja użytkownika: `freeze v1`
- `docs/sasist-agent/FREEZE-v1.md`; Stage 0 w migration.md zamknięty
- Etap 1 (.NET Host) odblokowany

## 2026-07-27 — Sasist Agent Etap 0: pełny DoD dokumentów

- Pakiet `docs/sasist-agent/`: ARCHITECTURE, OpenAPI, WS protocol, plugin SDK, device, diagnostics, update, security, versioning, ADR-001..005, migration, README
- Gate: freeze protocol v1 przed Etapem 1 (.NET Host)

## 2026-07-27 — Sasist Agent: Etap 0 w planie + ARCHITECTURE.md

- Plan zaakceptowany z **Etapem 0 (Architektura)** przed kodem Host
- SSOT: `docs/sasist-agent/ARCHITECTURE.md` — Core, IAgentModule, agents/devices, protocol v1, API/WS, Module Bus
- Etapy: 0 Architektura → 1 Agent → 2 Backend → 3 FE → 4 Migracja → 5 Cleanup
- Tech: **.NET 8**; tabele extend w E2, rename w E5; poll = protocol 0 compat

## 2026-07-27 — Sasist Agent: architektura + plan migracji (analiza)

- Analiza `printing` + `sasist-printer-agent` + QZ; rekomendacja **.NET 8**
- Cel: uniwersalny edge agent (druk = moduł); rename Sellasist/Cloud Print → Sasist Agent
- Plan: Agent → Backend → FE → migracja → usunięcie QZ/Sellasist (bez pełnej implementacji w tej sesji)

## 2026-07-27 — Cloud Print: repair/queue bez ślepych 400/409

- `repair`: brak aktywnego agenta → 200 `{ success:false, reason:"NO_ACTIVE_AGENT" }` (bez 400)
- `GET /printing/cloud-capability` — ready tylko przy default + online agent
- FE `usePrintMethodFlow`: offline default → dialog, nie auto-queue; Cloud tile disabled
- Queue 409 z `code` (AGENT_OFFLINE / PRINTER_INACTIVE) jako fallback

## 2026-07-26 — StarterTemplateFlow (wspólny model starterów)

- `components/templates/starterFlow`: dialog + hook + stałe CTA
- Starter immutable; CTA „Użyj startera”; kreator kopii → edytor użytkownika
- Etykiety (presety) + wydruki (galeria/detail); ReadyTemplateCard `mode="starter"|"owned"`

## 2026-07-26 — PrintMethodDialog (systemowy wybór wydruku)

- Wspólny dialog: `components/printing/PrintMethodDialog` + `usePrintMethodFlow`
- Gdy jest domyślna drukarka Cloud (`/printing/defaults` A4) → od razu Cloud Print, bez okna
- W przeciwnym razie kafle: Drukuj / Sasist Cloud Print / Pobierz PDF
- Podpięte: karty produkcyjne + dokumenty magazynowe (lista/detail)
- Cloud queue: `production_batch_card`, `production_order_card`

## 2026-07-26 — Layout Master: wydruki = kompozycja Systemu Etykiet

- SSOT: `templatesListLayout.ts`, `readyTemplatesLayout.ts`
- Lista wydruków: ten sam root/rail/toolbar/rows/grid co etykiety
- Gotowe/Startery: ten sam page/CTA/filter tabs/sections/grid/empty
- Usunięto lokalny Sellasist filter panel z wydruków; CTA z PageHeader → in-page

## 2026-07-26 — Szablony = kategoria flyout (nie hub)

- Usunięto `TemplatesHubLayout` / tabs między modułami
- Sidebar: Szablony (`opensSideFlyout`) → etykiety / wydruki / wiadomości / eksporty
- Każdy moduł: własny PageHeader + własne zakładki; `/templates` → redirect labels
- Docs IA + testy `settingsNavIa` / `phaseBIa` zaktualizowane

## 2026-07-26 — Szablony wydruków = te same komponenty co etykiety

- Usunięto lokalne `DocumentStarterCard` / `DocumentTemplateListCard`
- Import: `ReadyTemplateCard`, `TemplateListRow`, `READY_TEMPLATES_GRID_CLASS` z LabelSystem
- Uogólnione sloty `thumbnail` (bez drugiej wersji UI)

## 2026-07-26 — IA hub Szablony (superseded — flyout category)

- Historycznie: jeden wpis `/templates` z tabs między sekcjami
- Zastąpione: kategoria flyout bez hub screen (patrz wpis powyżej)

## 2026-07-26 — Szablony wydruków: powrót do ERP Design System

- Filtry: `ListFilterEmbeddedShell` + Filtruj/Wyczyść/Ukryj (jak Produkty) — usunięto LightFilters
- Toolbar: `SuccessButton` Eksportuj + `PrimaryButton` Nowy szablon (bez „Więcej”)
- Lista: `ListTile` + `StatusBadge` + `SecondaryButton` (wzorzec Produkcja)
- Startery: layout Ready Templates (300px, gap-5, max 5 kolumn)

## 2026-07-26 — Szablony wydruków UX polish (pass 2)

- Karty listy: hierarchia nazwa→typ→status→używany jako/w→edycja; StatusBadge DS; Edytuj + menu Więcej
- Filtry: domyślnie Szukaj/Typ/Status; reszta w „Więcej filtrów”
- Startery: produktowa hierarchia, stała miniatura 132px, siatka jak Label Ready
- Bez zmian API/logiki

## 2026-07-26 — Szablony wydruków UI ≈ System Etykiet

- Lista: karty zamiast tabeli ERP; lekkie filtry (Szukaj/Typ/Kategoria/Status/Źródło + Więcej)
- Startery: kompaktowe karty (miniatura + Szczegóły/Użyj); usunięte zbędne H1/podtytuły
- Primary CTA `brandPrimaryButtonClass`; spójność spacing/radius/hover z Label System
- Bez zmian API / logiki biznesowej

## 2026-07-26 — Dokumentacja IA

- Dodano `docs/INFORMATION_ARCHITECTURE.md` (zasady, menu, kanony, legacy, przyszłość)
- Audyt IA uznany za zamknięty w dokumentacji
- Bez zmian kodu aplikacji

## 2026-07-26 — IA final cleanup audit (bez kasowania)

- IA uznana za zakończoną; menu/routing spójne
- Kandydaci osobnego PR: BarcodeManagement, PickingWaves, PlanningPlaceholder, App BatchesListPage import, WmsProductionPutawayRedirect
- Canvas: `ia-final-cleanup.canvas.tsx`

## 2026-07-26 — IA Faza B: orphans / stuby

- Magazyn flyout: Szkody, Protokoły szkód (`/office/damages*`) — bez nowego modułu Office
- Redirect: `/waves`→`/wms/picking`, `/planning/*`→`/purchasing/dashboard`, doc CF→orders, ksef→series
- Legacy: `/inventory`; tech: `report/*` bez zmian; Barcode = DELETE_CANDIDATE (plik zostaje)
- Pliki stubów zachowane z komentarzami; testy phaseBIa + settingsNavIa OK

## 2026-07-26 — Kwalifikacja orphan routes (pre Faza B)

- Office Damages: produkcyjny (scalić/menu); report/*: tech Puppeteer
- Martwe UI: Barcode, Waves stub, Planning, KSeF, Doc custom-fields
- Legacy: /inventory; BE waves/inventory nie kasować
- Bez zmian kodu — decyzja produktowa

## 2026-07-26 — Końcowy audyt IA (pre Faza B)

- Brak nowych dual-entry do tego samego ekranu po kanonie /labels
- Orphans/stuby: waves, planning, barcode, office, /inventory, /report/*
- Werdykt: globalne menu zamknięte; Faza B = lokalne Magazyn

## 2026-07-26 — IA: jeden System Etykiet (/labels)

- Usunięto Ustawienia → Szablony etykiet (duplikat)
- Redirect: `/admin/print-templates/*`, `/system-etykiet/*` (+ legacy prints) → `/labels/*`
- Bez zmian LabelSystem / API · testy settingsNavIa OK

## 2026-07-26 — IA Faza A: Ustawienia menu

- Przywrócono: Import, Pule stanów, Drukarki, Szablony etykiet/dokumentów/wiadomości
- Rename: „Szablony wydruków” → „Szablony etykiet” (print-templates)
- Tylko mainNavConfig + navActive + test · **No push.**

## 2026-07-26 — Audyt IA / nawigacji (raport)

- Pełny przegląd App.tsx + mainNavConfig + pages; bez zmian kodu
- Główne luki Ustawień po redesignie sidebara: drukarki, document-templates, import, message-templates, stock-pools
- Canvas raportu: `ia-navigation-audit.canvas.tsx`

## 2026-07-26 — Ustawienia: Szablony wydruków w menu

- Przywrócono pozycję w flyoucie Ustawienia → `/admin/print-templates`
- Tylko nawigacja; test `settingsNavIa` zaktualizowany

## 2026-07-26 — Realizacja: produkcja + rozlokowanie UX

- Produkuj +1/+5 → Zakończ produkcję; bez „Uzupełnij plan”
- Rozpocznij rozlokowanie (1 PW direct); usunięte Rozlokuj w wierszu
- Bez zmian API · tsc OK · **No push.**

## 2026-07-26 — Realizacja papierowa: UX magazyniera

- Nagłówek: numer + status + postęp; bez ERP/fioletu
- Karty lokalizacji (orange active); lot bez dropdown gdy 1
- Primary full-width Potwierdź pobranie · ProgressBar size lg
- Bez zmian API · tsc OK · **No push.**

## 2026-07-26 — Nowe zlecenie: kafelki rekomendacji MRP

- Tiles Dzisiaj…30 dni + Maksimum; qty sync; KPI bez opisów
- Dane z istniejącego demand planning + max_producible
- Bez zmian API create · tsc OK · **No push.**

## 2026-07-26 — Zlecenia: UX kart + globalne tony statusów

- Filtry: „Wszystkie”; bez Operator w toolbarze
- Karta bez Operatora; progress niebieski/zielony; Braki = warning
- `executionStatusTone` / `productionProgressTone` + tone `primary` (orange)
- Bez API/logiki · tsc OK · **No push.**

## 2026-07-26 — Symulacja planu: UX empty state

- EmptyState z CTA; ukryte KPI/Create przy lines=0; zielony tylko przy produktach
- Bez zmian backend/MRP · tsc OK · **No push.**

## 2026-07-26 — Symulacja planu: diagnostyka pustego wyniku

- `diagnostics` w odpowiedzi simulate (codes, skip_counts, empty_reason_*)
- Logi INPUT + SKIP/ACCEPT; UI pokazuje powód z API
- Bez zmiany filtrów MRP · testy OK · **No push.**

## 2026-07-26 — Symulacja planu: empty/success UI

- Bug: pusty `materials[]` → komunikat „Surowce wystarczają” + zera w KPI
- Empty state przy 0 produktach; Create disabled; loading bez zer
- Request simulate może dostać `lines` z rekomendacji UI (bez zmiany MRP)
- **No push.**

## 2026-07-26 — Szczegóły partii: UX jak dokument ERP

- PageHeader, StatusBadge, Card; bez fioletu / „Interfejs ERP” / żółtego boxa
- Akcje: Rozpocznij produkcję, Przejdź do realizacji, Drukuj kartę, Anuluj
- Informacje 2-kol, większy ProgressBar (orange), kompaktowy timeline
- Bez zmian API/routingu/stanów · `npm run build` OK · **No push.**

## 2026-07-26 — Modal „Nowa partia masowa” → Sasist UI Kit

- Dialog (xl, 85vh), Stepper, ListTile, Card, Primary/Secondary; bez fioletu
- Układ 1-kolumnowy; checkbox w Podsumowaniu; stopka Anuluj | Utwórz partię
- Bez zmian API/walidacji/kroków · `npm run build` OK · **No push.**

## 2026-07-26 — Planowanie: ekran decyzyjny (UX)

- KPI ×4; rekomendacje = Card/produkt + 1× Utwórz partię; usunięte 3 karty zbiorcze
- Tabela slim (bez osi czasu / Dlaczego / Rekom. / Można); pod aktywnymi partiami
- Aktywne partie: bez Operatora, StatusBadge, wyższe wiersze; bez KPI embedded
- Symuluj/Odśwież w Toolbar; bez zmian API/MRP · `npm run build` OK · **No push.**

## 2026-07-26 — Nagłówki: ujednolicony vertical rhythm

- DS PageHeader: separator + items-center + toolbar mt-4 + children mt-4/5
- DocumentsSectionShell → DS PageHeader; layout PageHeader → typography.h1
- Produkcja ERP: treść w children; usunięte `!space-y-*` / lokalne gap-y
- SettingsModuleStack: bez lokalnego border-t pod tytułem
- Bez API/logiki/routingu · `npm run build` OK · **No push.**

## 2026-07-26 — Nagłówki: jeden standard (Produkcja + audit)

- Produkcja ERP tabs: PageHeader Title+Actions; usunięte marketing opisy; CTA `comfortable`
- SecondaryButton default density → `comfortable` (jak Primary)
- Strip fluff: Dokumenty, Asortyment (zestawy/producenci), Rentowność, Settings, Analiza placeholders
- Empty states zostawione; bez API/logiki/routingu · `npm run build` OK · **No push.**

## 2026-07-26 — Pulpit Produkcji: podgląd, nie hub nawigacji

- Usunięto Terminal WMS / szybkie akcje / linki do terminali; listy pełnej szerokości (max 5)
- KPI bez linków; empty states uproszczone · `npm run build` OK · **No push.**

## 2026-07-26 — Typografia Produkcji = standard Dokumentów

- UI Kit `typography.ts`: h1/h2/section/label/caption/pageDesc/metric/body/tableHead wg Documents
- StatusBadge + density compact: floor `text-xs` (bez 10px); Production layout tokens + bump micro type
- Bez zmian layoutu/funkcji · `npm run build` OK · **No push.**

## 2026-07-26 — Kreator zlecenia produkcyjnego (UX)

- `/production/orders/new`: Stepper + 3 sekcje; preview/create batch (istniejące API)
- Planowanie = Symulacja MRP; create CTA osobno; highlight na liście zleceń
- UI Kit: Stepper (nowy), Card, SearchInput, MetricCard, ProgressBar, StatusBadge
- `npm run build` OK · **No push.**

## 2026-07-26 — Zlecenia produkcyjne: lista robocza (UI)

- `ProductionOrdersPage`: ListTile zamiast tabeli; Toolbar + SearchInput/Select; StatusBadge; ProgressBar gdy dostępny
- Mapowanie `progressPercent` z istniejącego `progress_percent`; menu akcji `align=end`
- Bez zmian API/routingu/logiki · `npm run build` OK · **No push.**

## 2026-07-26 — Pulpit Produkcji: UX centrum operacyjnego

- `ProductionDashboardPage` + `ProductionDashboardBatchGrid`: białe karty, KPI MetricCard, ProgressBar (+ ton `info`)
- Sekcje: Do rozlokowania / W produkcji / Gotowe do WMS / Uwaga + aktywność / zakończenia / szybkie akcje
- UI Kit only; bez zmian API/routingu/logiki · `npm run build` OK · **No push.**

## 2026-07-26 — Szkody: lekki polish (bez przebudowy)

- Modal Magazyn uproszczony; Raporty = lista + Pobierz PDF
- Biuro: tabela + StatusBadge + badge decyzji + szukaj/filtr
- `npm run build` OK · **No push.**

## 2026-07-26 — UX Polish: Szkody (PL + UI Kit)

- `DamageReportsPanel` + Office damages/reports: pełne spolszczenie UI
- Wspólne `damageUiLabels.ts`; bez zmian API/logiki
- `npm run build` OK · **No push.**

## 2026-07-26 — Magazyn: katalog tylko w widoku regału

- Przywrócono rail 360px w głównym Magazynie (przed siatką z 06da2001)
- `presentation="catalog"` wyłącznie po dwukliku regału
- `npm run build` OK · **No push.**

## 2026-07-26 — UX Polish: komunikaty Magazyn

- Krótkie dialogi/toasty/placeholdery/przyciski (Magazyn + projektowanie + trasy)
- Usunięto instrukcje typu „Kliknij… / Możesz…”; bez zmian logiki/API
- `npm run build` OK · **No push.**

## 2026-07-26 — WarehouseModuleLayout + wspólny LeftRail

- `WarehouseModuleLayout` / `WarehouseLeftRail` / `WarehouseRailSection`
- Taby Magazyn | Projektowanie | Trasy; Eksport na belce; Trasy content w lewym railu
- Panele bez własnego chrome; build OK · **No push.**

## 2026-07-26 — Designer: regresje UI po migracji do UI Kit

- Przywrócono widoczność Magazyn/Sklepowy oraz Drzwi/Brama (flex `min-w-0` zamiast dual `fullWidth`)
- Rail: białe `surface.page`; active `ring-inset`; SegmentedControl gap + nowrap
- Generuj układ → `SuccessButton`; build OK · **No push.**

## 2026-07-26 — Etap 4: Warehouse Designer → Sasist UI Kit

- Migracja toolbar/rails/routing/modals/canvas tools na design-system
- Usunięto `warehouseUiSkin` → `warehouseChrome`; Primary `intent=warning`
- Residual: MainView editors + TemplateCreator + ciężkie modale
- Raport: `memory/ui-kit-designer-migration-report.md` · **No push.**

## 2026-07-26 — Sasist UI Kit Etap 3 (hardening)

- ESLint `sasist-ui-kit`: blok magicznych klas / nowych wysp tokenów
- Density na komponentach; playground `/design-system`; README button rules
- Usunięto `WarehouseCardButton`; metryki `npm run ui-kit:metrics` · **No push.**

## 2026-07-26 — Sasist UI Kit (Etap 1–2)

- `design-system/tokens/*` + komponenty (Button suite, Card, Input, Status, SegmentedControl, Toolbar, PageHeader, …)
- Lokalne wyspy → fasady kit; Magazyn `CardButton` z design-system
- Raport: `memory/ui-kit-migration-report.md` · **No push.**

## 2026-07-26 — UI: ujednolicenie CardButton w Projektowaniu

- `WarehouseCardButton` — wspólny styl card (radius ~11, border, cień)
- Pasek: status tekstowy → select h-10 → Zapisz; bez badge
- Podpięte: Generuj/Nowy szablon, Magazyn/Sklep, Drzwi/Brama, Raporty/Szkody · **No push.**

## 2026-07-26 — Domain: warehouse_special_placements

- Nowa tabela map markers (role + x/y); `locations` = tożsamość operacyjna
- Migracja START/PACK/DOCK z locations → placements; clear special geometry
- DELETE/POST/PUT special-location → placements only; dokumenty nienaruszone
- `get_special_locations_xy` z placements · **No push.**

## 2026-07-26 — DELETE special-location: 409 zamiast RestrictViolation 500

- Pre-check `stock_documents.location_id`; używane → rollback + HTTP 409 (PL msg)
- `IntegrityError` / `RestrictViolation` → 409 (nigdy 500); to samo przy replace PICK_START
- FE: snackbar przy 409; testy jednostkowe delete
- Architektura: preferowane odpięcie od layoutu zamiast hard DELETE gdy rekord jest w historii · **No push.**

## 2026-07-26 — Skin: Projektowanie UI = Magazyn chrome

- Wspólne `warehouseUiSkin.ts`; rails `#f7f8fa`, search ring/orange, karty `rounded-xl/2xl`
- Hall mapy + surround w layout mode; tool groups white+ring
- Bez zmian narzędzi / workflow / occupancy Magazynu w Projektowaniu · **No push.**

## 2026-07-26 — UX regału: karta KPI (scanability)

- Inline detail: duży % zajętości + „N z M lokalizacji zajętych”; bez wierszy Wolne/Razem
- Objętość jako osobna sekcja meta; tylko prezentacja · **No push.**

## 2026-07-26 — UX regału: szczegóły in-place zamiast tooltipa

- Usunięty ciemny hover popup obok regału
- Zaznaczony regał pokazuje dane wewnątrz kafelka (occupancy SSOT); hover tylko rozjaśnia
- Pasek zajętości bez zmian; tsc OK · **No push.**

## 2026-07-24 — Unify Magazyn ↔ Projektowanie UI (v1)

- Shared: `WarehouseModeContext`, `WarehouseShell`, `WarehouseZoomControls`, `warehouseMapHall`, `features/registry`
- Designer owinięty w Provider + Shell; Canvas: wspólne białe tło/`p-0`/floating zoom; edit toolbar tylko Reset
- Bez zmian logiki DnD/zoom physics/API/routing; bez top-level `mode=routing`
- tsc OK · **No push.**

## 2026-07-26 — Projektant Magazynu: globalny spacing Layout 2.0

- `SettingsModuleStack` + tokeny `pageModuleTabsOffsetClass` / `pageModuleContentOffsetClass`
- Usunięte lokalne mt-2/mt-3/mt-4 między breadcrumb → tabs → content
- Workspace pills (Projektowanie/Trasy) przeniesione pod główne taby
- Audyt: `memory/erp-page-layout-audit.md`
- tsc OK · **No push.**

## 2026-07-26 — Magazyn: SSOT lokalizacji produktów + zajętość regału

- Nowy indeks: `productLocationIndex.ts` (inventory ∪ assigned, layout UUID only)
- Ujednolicono: search, map highlight, sidebary, klik regału, side-view occupancy
- Pasek zajętości na regale + hover tooltip (bez dużych kart)
- tsc + build OK · **No push.**

## 2026-07-26 — AppOverlayPortal migration (ErpShell overlays)

- Migrated inline `fixed inset-0` drawers/sheets/modals under ErpShell → `AppOverlayPortal` (Pattern A)
- z-index bumped to ≥250 (drawers) / ≥280 (center sheets) so overlays sit above NavFlyout (z-200)
- PurchasingRightDrawer: already `createPortal`; z bumped to 250/251 + `APP_OVERLAY_Z`
- Skipped: ConfirmModal / other already-portaled, WMS terminal intentional shells, tiny menu catchers
- `npx tsc --noEmit` OK · **No push.**

## 2026-07-26 — AppOverlayPortal: Drawers/Sheets nad sidebarem

- Przyczyna: ErpShell content `z-0` vs sidebar `z-30` (stacking context)
- SSOT: `components/overlay/AppOverlayPortal.tsx` → `document.body`
- Zmigrowano ~146 overlayów (m.in. Raporty/Szkody Magazyn, drawers ERP, modale designer, WMS)
- `WarehouseDocumentOverlayPortal` = alias AppOverlayPortal
- tsc + build OK · **No push.**

## 2026-07-26 — Projektant Magazynu: cleanup nagłówków UI


- Usunięty tytuł „Projektowanie magazynu” (breadcrumb + actions w jednym rzędzie)
- Usunięte „Dopasuj do ekranu” z zoomu mapy (zostaje − / % / +)
- Lewy panel: bez „Pulpit” / „Magazyn” — od razu Raporty / Szkody
- Bez zmian logiki / geometrii / paneli
- **No push.**

## 2026-07-26 — Projektant Magazynu: UX polish (bez geometrii)

- Usunięte szare placeholdery lokalizacji (RackSideViewGrid + MapLocationVisualizationLayer)
- Panel Produkty: białe karty/miniatury (object-contain)
- Nagłówek: „Projektowanie magazynu”; dropdown magazynu po prawej bez „Magazyn:”
- Zajęte/Wolne: lokalizacje z qty>0 (`isBinOccupiedByQuantity`); total z API `*_location_count`
- Viz Zajęte/Wolne: tint całych lokalizacji, bez szarego dimmingu
- tsc + build OK · **No push.**

## 2026-07-26 — Primary Button Design System (enforcement complete)

- Jeden Primary: `PrimaryButton` + `brandPrimaryButtonClass` (wzorzec „Dodaj użytkownika”)
- Migracja ERP CTA (Settings/Orders/Documents/Assortment/Production/Analysis/Warehouse/Complaints/Carts/…) z blue/slate/cyan/violet → orange DS
- Shared: `ProductLikePageLayout`, `ListPageCreateLink`, `cartsDarkCtaClass`, tokeny purchasing/filter/printQueue → alias do SSOT
- `npx tsc --noEmit` OK · `npm run build` OK
- **No push.**

## 2026-07-26 — PrimaryButton DS wave (slate-900/800 CTAs)

- Migrated remaining ERP solid slate Primary CTAs → `PrimaryButton` / `primaryButtonClassName`
- Confirmed list + scan extras (orders modals, purchasing, ops filters/alerts, auth, ErrorBoundary, labels color apply)
- Left: WMS/damage, nav pills, badges/toasts/pagination, icon boxes
- **No push.**

## 2026-07-26 — PrimaryButton DS wave (remaining CTAs)

- Migrated remaining solid blue/violet/cyan/indigo Primary CTAs → `PrimaryButton` / `brandPrimaryButtonClass` / `primaryButtonClassName`
- Includes: consolidation segment modal, customers notes/GUS, inventory traceability, complaints ops/wizard/shipments, direct sales customer+discount, production shortages/composition/monitoring, assortment labels, LocationPicker, fulfillment warehouse, Products filter, label import/print, WarehouseModals undo, ProductLikePageLayout header save, GenerateWarehouseLayout Generuj
- Skipped: WMS/damage, tabs/chips/toggles/badges/charts as listed
- **No push.**

## 2026-07-26 — ERP Primary CTAs → design-system orange (clusters)

- Migrated listed Assortment / Products / Production / Analysis / Warehouse / Settings / Orders / Customers / Complaints / WarehouseMaterials / Carts / documents / System / analytics / errors primary CTAs → `PrimaryButton` / `brandPrimaryButtonClass`
- Skipped: WMS terminal, Login, destructive, toggles/tabs/badges, filterToolbarBtnApply, non-CTA segmented controls
- No `"brandPrimaryButtonClass"` string-literal bugs
- **No push.**

## 2026-07-26 — ERP Primary CTAs → design-system orange (no push)

- High-priority Settings/exports/returns/import/orders/documents pages: `bg-blue/cyan/sky/slate-900` primary fills → `brandPrimaryButtonClass`
- WarehouseDrawers: removed unused `purchasingBtnPrimary` import (primary AppButton already uses DS)
- Skipped: ApiKeys `<pre>`, Import segmented tabs, WMS operator buttons

## 2026-07-25 — Magazyn: kamery per-warehouse + tryby wizualizacji (no push)

- Camera: `warehouse_map_camera_v1_{warehouseId}` (zoom, panX/Y, scroll); auto-fit tylko przy pierwszym wejściu; „Dopasuj do ekranu”
- Visualization: `mapVisualization/` registry (all/occupied/free + przyszłe); overlay opacity, bez filtrowania danych
- `tsc` + `build` OK
- **No push.**

## 2026-07-25 — Projektant Magazynu → Layout System 2.0 (no push)

- Usunięto `AppPageLayout` + `AppContentLayout` + osobny `TabsContainer` card-stack
- Shell: `PageLayout` (= `PageContainer`) + `PageHeader` + bare tabs (`pageShellDividerClass`)
- Lewy panel Magazyn: bez osobnego `bg-white` + shadow (border-r w tej samej karcie)
- Logika / mapa / panele biznesowe bez zmian
- `tsc` + `build` OK
- **No push.**

## 2026-07-25 — GLOBAL LAYOUT SYSTEM 2.0 (no push)

- SSOT: `PageContainer`/`PageLayout` + `design-system/pageLayout.ts` (jeden border, `p-6`)
- Tabs: `TabsContainer` divider-only; `TopTabsNavigation` default `bare`
- Migracja: Purchasing, Carts, Assortment shells, Company `companyCardClass`, PrintingDataTable, listy (Asortyment/Klienci/Materiały/Użytkownicy/Workforce/…), WmsSettings, Catalog/Warehouse entity shells
- Wyjątki: Login, Designer, WMS terminal, błędy, modale
- `npx tsc --noEmit` + `npm run build` OK
- **No push.**

## 2026-07-25 — Magazyn UX polish (bez zmiany geometrii) (no push)

- Białe tło mapy + delikatny cień kontenera
- Nakładka zielonej trasy preview wzdłuż istniejących alejek (bez nowej geometrii)
- Miniatury: object-contain + bg-neutral-100; EAN pod SKU
- Raporty = zielony; sekcja Lokalizacje Zajęte/Wolne
- **No push.**

## 2026-07-25 — Design System: brand sidebar nav (no push)

- Tokeny: `brandSidebarNavItemClassName`, `brandSidebarNavActiveBarClassName`, icon/chevron
- ErpSidebar + NavFlyoutPanel: aktywny = orange text/icon + lewy pasek (bez niebieskiego)
- Też: TemplatesListSidebar, OperationsSidebar, PickingSettingsSectionNav
- Status sidebary zamówień (BRAKI itd.) bez zmian
- **No push.**

## 2026-07-25 — Brand Enforcement: final Design System cleanup (no push)

- Usunięto aliasy Primary CTA (`cartsOrangeCtaClass`, `companyOrangeCtaClass`, `PrintingPrimaryButton`)
- Usunięto martwe `appTabActiveClass` / `printingTheme.primary`
- Soft/outline/link brand → tokeny w `brandUi.ts`; look bez zmian
- Badge / status / severity / segmented / heatmap — bez zmian (wyjątki)
- **No push.**

## 2026-07-25 — Magazyn UI: pełny redesign widoku operacyjnego (no push)

- Kompozycja: mapa jako bohater (powierzchnia hali), lewy pulpit jako jeden rail, prawa lista produktów light/nowoczesna
- Przejazdy/alejki jak drogi (hatch + kierunek), bez napisów/ramek „PRZEJAZD”
- Geometria regałów, logika i API bez zmian
- **No push.**

## 2026-07-25 — Etap 3.3 Routing Graph Architecture Cleanup

- Usunięto martwy `domain/simulation/route_engine.py` (Euclidean visit order)
- Usunięto nieużywane `LocationCapacityProfile.pick_sequence` (+ copy w capacity_service)
- Komentarze/docstringi/docs: Runtime Graph jako SSOT; bez „pick_sequence wyznacza trasę”
- Zachowano: kolumna DB `pick_sequence`, migracja `006`, model Location, bootstrap ALTER
- **No push.**

## 2026-07-25 — Etap 3.2 Putaway Graph Adoption

- NEAREST_AVAILABLE + WMS fallback: `putaway_hop_cost_m` (Reader), nie `pick_sequence`
- Candidate order: hop (NEAREST) lub `Location.id`
- Tests: `test_stage3_2_putaway_graph.py` + slotting/putaway PASS

## 2026-07-25 — Etap 3.1 Finalizacja SSOT Routing Graph (no push)

- Analytics: `order_location_ids_by_graph` → `chain_distance_m`
- Product list: `route_sort_key` = `visit_index_map`
- Allocation / zone / product_view / incomplete / recovery groups → Graph Reader
- Public `__init__`: tylko Runtime Graph Reader (+ CRUD Designer); Euclidean eksport usunięty
- Doc: Routing Surrogates. Tests: `test_stage3_1_ssot_finalization.py`. **No push.**

## 2026-07-25 — Architecture Review Etap 3 Routing Graph (no push)

- Audyt backendu pod SSOT; doc `docs/architecture/routing_graph_runtime.md`
- Werdykt: reader **nie** jest jeszcze jedynym SSOT (luki w raporcie sesji)
- **No push.**

## 2026-07-25 — Routing Graph Etap 3: runtime WMS → Authored Graph (no push)

- `runtime_graph_reader.py` — jedyny reader WMS (order/hop/chain)
- PickingRoutingService: kolejność `pick_list` z grafu
- wave `compute_wave_metrics`: bez `_distance_between` / label coords
- `_pick_helpers.compute_route_for_pick_nodes`: NN z grafu (bez Euclidean)
- Tests: `test_stage3_runtime_wms.py` 12 PASS. **No push.**

## 2026-07-25 — Projektant: jeden panel właściwości (no push)

- Usunięto panel/przycisk „Widok z boku”; karty lokalizacji w `RackPropertiesSidebar`
- Sekcje: Informacje / Przejazd / Statystyki / Lokalizacje; akcje: Układ / Zapisz / Usuń
- Bez „Dodaj produkt” w Projektancie (WMS only). **No push.**

## 2026-07-25 — Internal Layout: przejazd jako piętra + Usuń przejazd (no push)

- Void: N osobnych poziomów konstrukcyjnych z slotami-duchami (ile lokacji zabrał)
- „Usuń przejazd”: przywraca poziomy magazynowe; zapis `clearPassages` → `enabled: false`
- **No push.**

## 2026-07-25 — Internal Layout sync with template + passage (no push)

- `getInitialLevels`: storageCount = structural − void; ignore stale full/mismatched `internal_structure`
- Labels: construction level (createBins + modal save); no storage renumber in UI
- `applyInternalLayoutSave`: merge storage into full construction `levelConfig` when void > 0
- `structureDiffersFromTemplate`: compare storage levels vs template after void
- Tests: passageStorage (+ business) PASS. **No push.**

## 2026-07-25 — Template editor: front passage + width axis (no push)

- TemplatePassageOverlay: widok od przodu (nie z góry); along = `width_cm`
- Walidacja: start/szerokość względem szerokości regału (nie głębokości)
- Podgląd: etykiety po poziomie konstrukcyjnym (bez renumeracji); void = PRZEJAZD per poziom
- Bez push.

## 2026-07-25 — Hard: one enabled passage per rack (no push)

- Shared message: `Regał może posiadać tylko jeden przejazd pod regałem.`
- BE: `single_passage.assert_at_most_one_enabled_passage` — sync, void, template JSON, Pydantic RackSchema + WarehouseTemplatePayload
- FE: `assertAtMostOneEnabledPassage` — storage/void, materialize/rematerialize, upsert, layout save payload, entity integrity, TemplateCreator
- No first-pick / ignore / auto-repair. Tests: BE single_enabled + void + template; FE passageStorage + rackPassageGeometry. **No push.**

## 2026-07-25 — Passage architecture P0 closeout (no push)

- BE: `warehouse_layout/passage_void.py` void validation → 409; active ops gate; audit hook no-op
- FE: single `structureRebuildOrchestrator` for layout save + template instances; no `trimInternalStructureForVoid`
- Z: `_bin_coords_cm` uses full construction heights
- Preflight: `POST /warehouse/layout/rebuild-preflight`
- Tests: passage_void_gates 8 PASS; FE passage 17 PASS; tsc OK. **No push.**

## 2026-07-25 — Passage UX polish (no push)

- Labels: „Poziom konstrukcyjny” vs „Lokalizacja / Adres magazynowy”
- Void viz: double beams + hatch (PassageVoidBand), not solid gray
- Fields: Początek / Szerokość / Wysokość wolnej przestrzeni + hints
- Miniature: start/width/end numeric readout + dimension lines
- Rebuild dialog: Stare/Nowe counts+capacity, +/− lists, stock product/qty/unit/value
- Validation: red highlight on offending height/width/passage geometry fields
- PL copy cleanup (no qty=, Level load, CAD jargon). Tests 19 PASS. **No push.**

## 2026-07-25 — P0 Układ wewnętrzny / numeracja / dialogi (no push)

- Internal Layout: pełna szerokość + scroll (bez FitToContainer / miniatury)
- Numeracja: poziom konstrukcyjny vs adres magazynowy (level_index strukturalny; etykieta 1..N)
- Pole: „Początek przejazdu od lewej krawędzi (cm)”
- Miniatura przejazdu: start / szerokość / koniec
- Dialogi: X + Anuluj + ESC; zapis dopiero po decyzji (template instances + rebuild)
- Tests: passageStorage + business PASS. **No push.**

## 2026-07-25 — Passage storage: one structural + stock block (no push)

- Void height = first enabled passage only (no max); UI limit 1 passage/rack
- Rebuild with stock: FE dialog blocks confirm; BE save → 409
- Business vitest: 5→5, +80→3, +120→2, numbering, capacity, active-only WMS filter
- **No push.**

## 2026-07-25 — Passage under rack → storage model (variant A, no push)

- Generator: `createBinsForRack` + `passageStorage` skip void levels; labels 1..N storage-only
- Capacity from existing bins; Internal Layout / side view / template preview show PRZEJAZD
- Save: `prepareLayoutBinsForSave` + confirm dialog (addresses + stock) before soft-remove
- Clearance height editable in TemplateCreator + PassageInspector (LOCAL); required for void
- No `affects_storage`, no materialization table, no separate Apply action
- Tests: passageStorage vitest PASS; tsc OK. **No push.**

## 2026-07-25 — Pre-push UX: P0 regressions + „Projektowanie magazynu”

- Template preview scale-to-fit; ElevationSidePanel uuid match; routing htmlOverlay pointer trap
- PL passage labels; tab rename Projektant Layoutu → Projektowanie magazynu
- Passage/locations generator: deferred (no change this round)
- Local commit only. No push.

## 2026-07-25 — PassageInspector wired (pre-push fix, uncommitted)

- `PassageInspector` replaces `PassageQuickEditor` on Layout canvas
- INHERITED: banner + „Otwórz szablon” → `setEditingTemplateId(rack.templateId)`
- LOCAL: corridor width/delete/enabled; QuickEditor = thin alias
- tsc + designer vitest 78 + build OK. No push.

## 2026-07-25 — C3 gap-fix commit (inspectors + endpoint drag)

- Extract `NodeInspector` / `EdgeInspector`; panel is container only
- Canvas endpoint drag: handles, snap, ghost, rewire + normalizeAfterEdit via command
- Select rewire = fallback; vitest/tsc/build OK
- **No amend** of `ee6c7cef`. No push. Bez Etapu 3.

## 2026-07-25 — C3 gap-fix (inspectors + endpoint drag, uncommitted)

- Extract `NodeInspector` / `EdgeInspector`; `RoutingRoutesPanel` composes only
- Canvas endpoint drag in Edit: handles, node snap highlight, ghost, rewire + normalizeAfterEdit; select = fallback
- `routingEndpointDrag` + tests; vitest routing 53, tsc, build OK
- **No commit yet** — awaiting C3 acceptance. No push. Bez Etapu 3.

## 2026-07-25 — Layout+Routing UX rev. 3.1 (4 local commits, no push)

- C1: template `default_passages` + passage `INHERITED|LOCAL` + update dialog
- C2: TemplateCreator responsive + top-down passage mini-CAD
- C3: Routing Edit vs Select; selection clear on workspace switch; quick toolbar; merge/rewire
- C4: command bus foundation (no Undo UI)
- tsc+build OK; targeted vitest/pytest PASS. **No push. Bez Etapu 3.**

## 2026-07-25 — Layout UX C1: template passages + INHERITED/LOCAL

- `default_passages` on WarehouseTemplate; `passage_source` on WarehouseRackPassage
- Place/stamp/generate materialize INHERITED; legacy missing → LOCAL
- Template save: dialog Aktualizuj instancje vs Tylko zapisz (rematerialize INHERITED only)
- Tests: template_passage_defaults + FE rematerialize; no push

## 2026-07-25 — ETAP 2 controlled save WH1 (S1 provenance repair)

- 1× save_layout WH1 → S1 FRONT+180 LEGACY → FRONT+90 AUTO_REPAIR (NORTH only)
- A23×3: approach 4.56→0.1 m; P on packing edge y=490; collision clear
- Other racks unchanged; graph/passages/rev unchanged; 2nd save idempotent
- Bez Etapu 3

## 2026-07-25 — ETAP 1 deploy provenance (no WH1 save)

- Push `9292c0d2` + `32993af7` → origin/main `32993af7`
- Railway + Vercel success; healthz/readyz OK
- PROD read: all racks `LEGACY_DEFAULT`; S1 still FRONT+180; A23 RESOLVED ~4.56 m (stary zły face); Graph 14/14 rev18; passages 0
- **STOP przed Etapem 2** (controlled save)

## 2026-07-25 — Service Face Provenance finalization (committed, no push)

- `ServiceFaceOrigin` str Enum (BE model + FE const); repair gates EXPLICIT immutable.
- Schema ensure DEFAULT LEGACY_DEFAULT; FE/BE round-trip; warehouse_routing 150 PASS.
- Commit on top of `9292c0d2`. **No push / PROD / Etap 3.**

## 2026-07-24 — SERVICE FACE PROVENANCE (no push)

- Model: `Rack.service_face_origin` LEGACY_DEFAULT | AUTO_REPAIR | EXPLICIT; schema ensure DEFAULT LEGACY.
- Gates: EXPLICIT never repaired; AUTO recomputes; LEGACY FRONT+0 + narrow diagonal-EAST fingerprint.
- Open clearance: unbounded ≠ 0; deterministic remis.
- FE/BE round-trip origin; generators conscious face → EXPLICIT.
- Tests A–H + warehouse_routing 150 PASS; tsc/build/startup OK. **No push. Bez PROD. Bez Etapu 3.**

## 2026-07-24 — Routing Designer UX + S1 store face (no push)

- Store S1: repair face z aisle geometry (FRONT+90 NORTH); bez `if store => RESOLVED`.
- Usunięty box „Konfiguracja sieci”; MISSING Start/Packing → warning.
- UI point types: 5 typów + SVG ikony; legacy typy zachowane w DB.
- Location Access: „Bez dostępu” / wykluczenie START+DOCK z NO_RACK counts.
- Tests: warehouse_routing 131; FE routing 47; tsc+build OK. **No push. Bez Etapu 3.**

## 2026-07-24 — FINAL PRE-PUSH AUDIT + push (corridor UX)

- TSC vs origin/main `b17b8d72`: **NEW ERRORS = 0** (po fix `LayoutState` w corridor test).
- Persistence/collision audit tests PASS; warehouse_routing 130 PASS; FE routing/passage 58 PASS; build PASS.
- Push `93b16293` → origin/main. PROD healthz/readyz 200; LA summary unchanged (read-only).
- Bez Etapu 3. Bez zapisu passages na PROD WH1.

## 2026-07-24 — UX closures: problem locations + passage corridor group

- **A:** Interaktywna diagnostyka LA (lista + locate + „Pokaż wszystkie problemy”); bez 279 linii.
- **B:** `corridor_uuid` (FE+BE+schema); multi-rack create/move/resize/delete as one; RackSchema.passages (fix strip).
- PROD WH1 verify: 274 RESOLVED / 3× S1 BLOCKED (A23-A-1..3) / 2× NO_RACK (DOCK-IN, START).
- Tests: corridor FE + collision B4/C4 + sync corridor_uuid. Build OK. **No push. Bez Etapu 3.**

## 2026-07-24 — Stage B passage canvas UX (FE, uncommitted)

- `LayoutMode.DRAW_PASSAGE` + toolbar „Dodaj przejazd” (J); drag corridor → `worldCorridorToPassages` multi-rack.
- Passage preview ghost; PROJEKTOWANIE: select/drag/width/delete overlay; TRASY: subtle non-interactive.
- Save payload passages array unchanged; vitest `rackPassageGeometry.test.ts`.

## 2026-07-24 — Etap A+B Physical Routing fixes (no commit/push)

- **A:** SSOT `rack_service_face` (0/90/180/270); FE horizontal rows set face; `service_face_repair` from row_containers on layout save; store skipped.
- **B:** `DRAW_PASSAGE` multi-rack corridor UX; canvas select/move/width/delete; TRASY subtle.
- Tests: service_face_ssot, abc_faces_passage_regression; FE passage geometry 7; warehouse_routing 110; tsc+build OK.
- Bez Etapu 3. Bez push.

## 2026-07-24 — MANUAL UX+FUNCTIONAL AUDIT (Passage / Access) — no code

- Prod WH1: passage UI PARTIAL (sidebar only); B4+C4 need **two** passages; Test BEFORE 43.10 m / AFTER ~32.48 m.
- Access: 49 RESOLVED / 217 AMBIGUOUS / 11 BLOCKED / 2 NO_RACK; root cause FRONT+rot0 (normal left) vs ±Y aisles.
- Bez implementacji / commit / push / Etapu 3.

## 2026-07-24 — Physical Routing / Rack Passage Foundation

- Model `WarehouseRackPassage` (osobna tabela, UUID); geometria lokalna względem Rack.
- SSOT `physical_collision.py`: obstacle = footprint − enabled passages; eps=2cm; soft boundary.
- Soft „Sprawdź sieć”: `EDGES_THROUGH_OBSTACLES` (warning); save graph nie blokuje; FE highlight odcinków.
- Location Access: approach S→P + wykluczenie invalid edges; MANUAL_OVERRIDE nietknięty.
- FE: „Dodaj przejazd pod regałem”; orthogonal prefer + Shift free-angle.
- Tests: collision/passage/routing soft/access/draw. **No push. Bez Etapu 3.**

## 2026-07-24 — FINAL AUDIT Location Access Foundation

- P0 fix: migracja AP tylko gdy brak wiersza access (nie nadpisuje restore AUTO).
- P0 fix: MANUAL po usunięciu edge → `OVERRIDE_BROKEN`.
- P1 fix: one-way same-edge respektuje kolejność `t`; disabled edges wykluczone z virtual entry.
- Statusy: RESOLVED / AMBIGUOUS / UNREACHABLE / BLOCKED / OVERRIDE_BROKEN.
- Stage-2 consumers nadal OLD AP; NEW tylko Designer/API foundation (świadomy dual-store do Etapu 3).
- Tests: 21 foundation + 87 routing/startup; FE routing 41; tsc+build OK. **No push.**

## 2026-07-24 — Location Access Foundation (AUTO, bez Etapu 3)

- **Location→Rack SSOT:** `location_uuid`→`Bin.rack_id`→`Rack` (nie `rack_name`); brak ryzykownej migracji.
- Persist `Rack.service_side` + `rotation_degrees`; world normal z orientation+rotation.
- Tabela `warehouse_routing_location_access`; AUTO resolver (face edge, half-plane, reach, approach_m).
- Virtual entry runtime + approach w koszcie; authored graph bez pollution.
- Recompute po layout/graph save; AP → MANUAL_OVERRIDE (Stage-2 AP nadal żyje).
- FE: walidacja dostęp/review/bez drogi; diagnostyka overlay OFF; ręczne AP = wyjątek.
- Tests: 13 foundation + full warehouse_routing 74 PASS; FE build OK. **No push. Bez Etapu 3.**

## 2026-07-24 — TRASY: draw-time skrzyżowania + prostszy panel odcinka

- ROOT: przecięcia dopiero na BE save (`materialize_intersections`); FE tylko split po kliknięciu w odcinek → wizualny X bez topologii.
- FIX: `applyDrawStep` + `routingDrawNormalize` (cross / T / collinear) przy rysowaniu; snap POINT>EDGE>empty.
- UI: ukryty mnożnik kosztu; panel odcinka uproszczony; „Punkt trasy”/„Skrzyżowanie” zamiast Punkt N.
- Tests: routingDrawNormalize 10 + routing suite 32 PASS. **No push. Bez Etapu 3.**

## 2026-07-24 — HOTFIX: Railway /healthz 503 (dangling Stage2 import)

- ROOT: `slotting_service` → `from ..domain.simulation import get_special_locations_xy, distance_point_to_point_cm` po usunięciu `warehouse_graph_service` w 0ae9e47d.
- FIX: helpery w `backend/domain/layout_geometry.py` (Location + Euclidean; zero WarehouseNode/Edge).
- Audit dangling Stage2: tylko te 2 symbole żyły w runtime; FE deleted modules bez dangling imports.
- Smoke: `import backend.main` OK; `run_server.py` → GET /healthz HTTP 200; 130/130 router modules import OK.
- Regression: `backend/tests/test_backend_startup_import.py`. **No push. Bez Etapu 3.**

## 2026-07-23 — Routing Graph: fix rysowania odcinków + sticky Wybierz (audit)

- ROOT draw: stale React state w addEdge → `appendDrawClick` atomowo.
- engine.py: **wycofane** (tylko FE humanize wystarczy; bez zmiany logiki routingu).
- Sticky Wybierz, split przecięcia, test map-first, orphan cleanup.
- FINAL AUDIT tests PASS. Lokalny commit; **no push. Bez Etapu 3.**

## 2026-07-23 — Routing Graph: UX polish + delete bugfix (bez Etapu 3)

- Delete punktu: widoczny CTA „Usuń punkt”, Delete/Backspace, dirty+save+reload persistence test.
- Walidacja: agregacja orphanów (bez UUID / „edges” / „węzeł”); „Usuń niepołączone” + podświetlenie.
- Panel kontekstowy (sieć / punkt / odcinek / test); „Obsługiwane lokalizacje”; Typ punktu zamiast roli/węzła.
- Architektura Routing Graph SSOT nienaruszona. **No push. Bez Etapu 3.**

## 2026-07-23 — Routing Graph Etap 2: cleanup legacy Planuj trasę

- Designer: usunięto legacy route UX (`isRouteActive` / `routeRackIds` / `fetchRoutePath` / client aisle+grid engines). PathLayer props = null.
- Toolbar: brak przycisku „Planuj trasę”. Sidebar: usunięto sekcję „Trasa kompletacji”.
- DELETE: `aisleGraphRoute.ts`, `aisleRouteOrder.ts`, `gridRoutePathfinding.ts`, `routeApi.ts`.
- WalkingCostPage: N/A gdy `total_distance` null. TRASY workspace nienaruszony. **No push. Bez Etapu 3.**

## 2026-07-23 — Routing Graph Etap 2 (migracja READ-ONLY)

- SSOT AP: `access_resolution.py` (location 1..N → best A×B).
- `/route/path` = compatibility adapter → Routing Engine (bez legacy fallback).
- walking-cost / pick-route / strategy simulations → authored graph.
- Usunięto: Planuj trasę, aisle*/gridRoute*, routeApi, WarehouseGraphService, graph_location, domain warehouse_graph_service, save_layout rebuild.
- `/warehouse-graph` nodes/edges = projekcja authored; generate → 410.
- Tests: stage2 + updated smoke; 55 warehouse_routing PASS. **No push. No Etap 3.**

## 2026-07-23 — Routing Graph Etap 1: domknięcie UX TRASY


- Drag punktu trasy na canvasie (snap 10 cm, CTM zoom-safe, bez auto-merge, pan≠drag).
- Ciągłe „Rysuj trasę”, edytor odcinka PL, AP 1..N UX, unsaved (tabs/warehouse/nav/beforeunload).
- Schema `routing.3` bez drop „starego unique AP”; testy diamond/drag/legacy smoke.
- Osobny commit względem `993f6a9f`. **No push. Bez Etapu 2.**

## 2026-07-23 — Routing Graph Etap 1 (authored SSOT)


- Nowe modele: `WarehouseRoutingNode` / `Edge` / `AccessPoint` (stabilne UUID).
- Engine A→B (kierunek, enabled, process, transport, cost_multiplier) — **bez** fallbacku do WarehouseNode.
- API `/warehouse-routing/{id}/graph|route|validate`; `save_layout` nie rebuilduje nowego grafu.
- Designer: workspace **Projektowanie | Trasy**; Testuj trasę / Sprawdź sieć.
- Tests: `backend/tests/warehouse_routing/test_stage1_routing_graph.py` (15). **No push.**

## 2026-07-23 — Nośniki: globalny fiolet (CARRIER_VISUAL)

- SSOT: `CARRIER_VISUAL` + `carrierVisualClasses`; wszystkie prefixy PAL/BOX/BIN/CRT/MIX fioletowe.
- `CarrierBadge` / `CarrierIdentity`; karty wyboru PZ, paski aktywnego nośnika, putaway/relocation.
- Lokalizacje bez zmian (niebieski). Tests: `carrierConstants.test.ts`. **No push.**

## 2026-07-23 — Wózki: Kupujący w przypisanych zamówieniach

- Root cause: cart `_order_customer_name` czytał tylko EN `first_name`/`last_name` (shipping-first); karta zamówienia używa `_customer_names_from_order` (PL Imię/Nazwisko w billing).
- Fix: `_order_display_customer` → SSOT `_customer_names_for_order_display` (+ CRM fallback). Pole `customer_name` / `order_customer_name` bez N+1.
- Tests: `test_bulk_cart_fleet_semantics.py` (PL keys). **No push.**

## 2026-07-23 — Jedna kanoniczna karta produktu (Asortyment)

- Usunięto slim `ProductDetail`; `/products/:id` → `ProductDetailRedirect` → `/products/:id/edit`.
- Helper `getProductDetailsPath` + migracja linków (WMS/magazyn, wózki, zamówienia, zakupy, produkcja, scan).
- „Zamów u dostawcy” na `ProductEditModal`. Test: `productPaths.test.ts`. **No push.**

## 2026-07-23 — Magazyn → Wózki: semantyka BULK vs MULTI + hover zamówień

- BULK: `total_baskets=0`, brak sekcji w header/KPI; MULTI bez regresji.
- Postęp kompletacji = zamknięte linie operacyjne (`compute_pick_progress` + `pick_progress` API).
- Kupujący: imię+nazwisko → firma; produkty z `product_id`/`image_url` bez N+1.
- Rich hover numer/pozycje + nawigacja do `/products/:id`.
- Tests: `test_bulk_cart_fleet_semantics.py`, `bulkCartSemantics.test.ts`. **No push.**

## 2026-07-22 — Magazyn UI 1:1 (Wózki → Nośniki)

- Wspólny shell: breadcrumb Magazyn > tab, bare tabs + trailing CTA (`CartsTabActionsContext`).
- Wózki/koszyki: CTA na tabach, ConfirmModal destrukcji, KPI/zapełnienie z API; sekcje KPI tylko dla MULTI.
- Regały: 4 KPI, pomarańczowy „+ Nowy regał”, tabs na edycji; Strefy: jeden formularz + focus z CTA; Planer/Nośniki parity.
- Tests: `cartsFleetSummary.test.ts`. Build PASS. **No push.**

## 2026-07-22 — Ustawienia: Klucze API i Eksport jako osobne pozycje menu

- Flyout: Integracje ≠ Klucze API ≠ Eksport; canonical `/settings/api-keys` + redirect legacy.
- Hub `/settings/integrations`; breadcrumbs Ustawienia → Klucze API / Eksport.
- Tests: `settingsNavIa.test.ts`. **No push.**

## 2026-07-22 — Ustawienia → Firma: UI 1:1 (4 zakładki)

- Shell bare tabs + orange CTA; Dane firmy / Magazyny / Firmy / Branding pod screeny.
- Logika bez zmian: company_profile, warehouses, fulfillment strategy, COMPANY template scope, logo SSOT.
- Tests: `companySettingsTabs.test.ts`. **No push.**

## 2026-07-22 — Użytkownicy: sesja vs konto, WMS badges, role/statusy, czas pracy PL

- Presence SSOT: `UserSession.expires_at > now` → `has_active_session` na liście (Zalogowany/Niezalogowany).
- Kolumna WMS = effective operational modes (launcher parity); HoverPopover na „+X innych”.
- Role: rename „Role i dostęp do statusów”; „Może pracować”; `StatusAccessCheckbox` shared z edycją.
- Czas pracy: Throughput→Aktywności na godzinę; heatmap/dni w Europe/Warsaw; API historyczne humanize.
- Tests: `test_user_session_presence`, `effectiveWmsModes.test.ts`, tabs. **No push.**

## 2026-07-22 — Edycja użytkownika 1:1 + kod logowania w systemie etykiet

- UI edycji: orange tabs, lewa kolumna, dirty bar, hasło tylko „nowe” (puste).
- Zapis spójny wszystkich dirty fields; beforeunload; Anuluj = restore.
- Kod logowania: Generuj + szablon etykiety + podgląd/druk; lista „…” → Drukuj kod logowania.
- Label SSOT: template_type `user_login`, zmienna `{barcode_login_code}` (tekst/barcode fallback PDF).
- DB: `user_wms_profiles.login_code_label_template_id`; unikalność `barcode_login_code`.
- Tests: `test_user_login_code.py`, `userLoginCodeLabel.test.ts`. **No push.**

## 2026-07-22 — Ustawienia → Użytkownicy: UI 1:1 + telemetria operacyjna

- Chrome: bare tabs (orange underline), CTA „+ Dodaj użytkownika” pomarańczowe przy liście; bez dużego H1 nad tabami.
- Lista: działające wyszukiwanie + Filtruj (status/rola/magazyn); menu … z ikonami; chipy permisji zielone/czerwone.
- Koszty: 4 KPI jak na screenie; Historia: pagination „Załaduj więcej”; Czas pracy: expandable operatorzy + filtry.
- Backend: GET/unmapped API poza telemetrią; `filter_operational_activity` w dashboard/analytics/activity-logs.
- Tests: `test_workforce_activity`, `test_workforce_operational_filter`, `administratorsTabs.test.ts`. Build PASS. **No push.**

## 2026-07-22 — FE: stale Vite chunk recovery (PlanningDashboard)

- Prod: `PlanningDashboard-DvvOppzR.js` → 200 `text/html` (SPA rewrite); aktualny index wskazuje `PlanningDashboard-BqfS5N4m.js`.
- Root cause: stary main bundle po deployu (nie broken import, API 200).
- Centralnie: `lazyWithStaleChunkRecovery`, one-shot reload (sessionStorage), ErpPanelRouteErrorPage + ErrorBoundary; purchasing lazyViews + ProductList.
- Tests: `staleChunkRecovery.test.ts`. Build PASS. **No push.**

## 2026-07-22 — WMS cross-module 500: requires_putaway schema drift

- Root cause: ORM kolumny `requires_putaway` / `default_requires_putaway` (ba0dc357); ensure z `BOOLEAN DEFAULT 1` (nie-PG) + ensure w batch try/except → kolumny mogą nie powstać na PROD.
- Objaw: GET receiving/pz, putaway/pz, returns/active-z-pz → 500; warehouse-operations snapshot → 200 (COUNT bez pełnego SELECT).
- Fix: dialect-aware default, izolowany startup ensure, request-path heal na listach; test `test_requires_putaway_schema_drift_lists.py`.
- Lifecycle PROGRESS≠DONE i scanner SSOT bez zmian. **No push.**

## 2026-07-22 — Sprzedaż bezpośrednia: widoczny Przelew + cleanup UI

- Root cause: zapisane `payment_methods.transfer=false` (stary default) + filtr w `PaymentTerminalPanel` ukrywał TRANSFER mimo backendu TRANSFER/BANK.
- Migracja resolve/normalize: legacy false→true; po save `extensions.ds_payment_methods_v2` chroni świadome wyłączenie; cache settings `v2`.
- UI: 2×2 Gotówka|Karta|BLIK|Przelew; cash panel tylko CASH; usunięte teksty „Paragon — klient…” i „Wydanie od ręki…”.
- Tests: `test_direct_sales_settings_transfer.py`, `directSalesFulfillment.test.ts`. **No push.**

## 2026-07-22 — Sprzedaż bezpośrednia: stock, wysyłka, przelew, UX sum

- Stock SSOT: `build_location_stock` → `available_qty_hint` + badge „Dostępne: X szt.”; Lokalizacja = rozbicie location-stock.
- Fulfillment w `session.metadata_json` + PATCH `/fulfillment`; DELIVERY → Order.addresses_json + shipping_method_id (bez nowej integracji kuriera).
- Przelew + termin z `Customer.payment_terms_days` (IMMEDIATE settle / DEFERRED PENDING).
- Prawa kolumna: Suma → Rabat → Do zapłaty (PLN `6,15 zł`); cash UI tylko dla Gotówka.
- Tests: `test_fulfillment_service.py`, `directSalesFulfillment.test.ts`. **No push.**

## 2026-07-22 — Sprzedaż bezpośrednia: add-product 500 + auth probes

- **500 root cause:** `OperationalError: no such column: stock_document_items.requires_putaway` w `commercial_availability_service._purchase_lines_for_products` (stock check przed insert linii). Self-heal + mapowanie → 503/`{code,message}`; brak stock → 400 `offer_stock_unavailable`.
- **401 unrelated:** `/operational/features` i `/wms/settings/direct-sales` używają tego samego Bearer/`get_current_user` (settings: `require_operable_warehouse`). FE nie stosuje już fallbacku flag przy 401 (`unavailableReason=auth`).
- **Scanner:** terminal Direct Sales → `useWmsPageScanHandler` → `scanDirectSaleSession` (ten sam backend co klik/`add-product`).
- Tests: `backend/tests/direct_sales/test_add_product_api.py`, `operationalFeatureGuard.test.ts`. **No push.**

## 2026-07-22 — Inwentaryzacja: podłączenie do globalnego skanera WMS

- Root cause: `handleScan` tylko w lokalnym `useInventoryScanInput` — brak `registerScanHandler` → Helper: „Brak aktywnego odbiorcy” / „Ta strona nie obsługuje jeszcze skanera.”
- Fix: entry + terminal → `useWmsPageScanHandler`; krok lokalizacji odrzuca EAN; na liczeniu `location_like` → switch lokalizacji (fallback produkt).
- Mode/label: `inventory-count` / „Inwentaryzacja”. Tests A–L: `inventoryScanRouting.test.ts`. **No push.**

## 2026-07-22 — Rozlokowanie PZ: 100% ≠ zamknięcie (explicit finalize)

- Root cause: `recalculate_wms_document_completion` auto-ustawiał `relocation_status=DONE` (+ często `status=zakonczone`) przy `receiving_closed && full_put`; `recompute_putaway_status_for_document` ustawiał `putaway_status=DONE` przy catch-up 100% + receiving DONE.
- Fix: progress remaining=0 → tylko IN_PROGRESS; DONE wyłącznie po `finalize_wms_relocation_pz` (receiving=DONE ∧ remaining=0), z rewalidacją transakcyjną.
- UI: przycisk „Zakończ rozlokowanie” widoczny przy otwartym relocation; disabled + powód; catch-up banner slate; DONE = emerald (bez czerwonego alertu).
- Lista aktywna: filtr `relocation_status != DONE` (nie po remaining=0).
- Tests A–J: `test_wms_putaway_explicit_finalize.py`. **No push.**

## 2026-07-21 — Skan nośnika PAL-5 w Przyjęciach: SSOT code|barcode

- Root cause: Scanner Helper pokazywał syntetyczny „Nośnik / SSCC” bez DB; `/carriers/scan` zwraca zawsze 200, a lookup matchował tylko `barcode` (nie `code`).
- SSOT: `find_carrier_by_scan_code` (code OR barcode); inventory-count używa tej samej funkcji.
- Helper katalog: lista nośników z DB zamiast fałszywego PAL-N; MULTI_SCAN_TRACE w receiving.
- Tests A–J: `test_wms_carrier_scan_ssot.py`. **No push.**

## 2026-07-21 — Bez rozlokowania (crossdock) + anulowanie obowiązku putaway


- SSOT: `requires_putaway` na linii + `default_requires_putaway` na dokumencie; rozszerzony `stock_document_item_requires_putaway`.
- NO_PUTAWAY: brak DOCK inventory / brak karty w kolejce; qty doc==actual NIE wyłącza putaway.
- Anuluj 0/X → mark NO_PUTAWAY + withdraw DOCK; partial → `PUTAWAY_ALREADY_STARTED`.
- UI: pasek trybu w przyjęciu; kebab Anuluj na liście Rozlokowanie PZ.
- Tests P–X: `test_wms_putaway_no_putaway_handling.py`. **No push.**

## 2026-07-21 — Przyjęcia: korekta ilości + WADA + usuwanie pozycji


- Korekta: tryb „Korekta ilości” (−X); floor `received >= putaway`; DOCK upsert obsługuje delta −.
- WADA: podpięty `ReceivingDamageModal` (wcześniej brak renderu); mark-damaged tylko z DOCK-IN; putaway badge Pełnowartościowy / WADA.
- Delete EXTRA: A received=0; B withdraw DOCK+audit+delete; C putaway>0 → PL reject.
- Tests A–I: `test_wms_receiving_correction_defect_delete.py`. **No push.**

## 2026-07-21 — WMS Przyjęcia: blind floor UX + status receiving


- Lista: pełny numer bez ellipsis; badge tylko Otwarte/W trakcie/Zakończone (bez Dostawa/WMS/FV/Rozlokowane).
- Ekran + modal: zawsze blind (brak qty dokumentu / różnicy / cen); delta „Przyjmujesz teraz”; Zatwierdź zamyka modal + focus skanera.
- Historia czynności ukryta w WMS (audit SSOT bez zmian). Backoffice PZ bez zmian.
- Tests: `wmsReceivingListStatus`, blind receiving. **No push.**

## 2026-07-21 — PZ: ukryj OCZEKUJE FV + lokalizacje putaway 1:N

- FV: `purchase_workflow_status=PENDING_INVOICE` to martwy default bez encji/UI faktury — `showPurchaseWorkflowStatus` → false (kolumna DB zostaje).
- Lokalizacja linii: SSOT = `StockOperation` type PUTAWAY (`document_line_id` × `location_id`); usunięty fallback Inventory lot (bleed pre-stock).
- UI: `receiptLinePlacementRows` + qty + compact `+N lokalizacje` / HoverPopover ROZLOKOWANIE; DOCK-IN remaining.
- Tests: `test_pz_putaway_provenance_display.py`, FE placement + badge. **No push.**

## 2026-07-21 — WMS Dashboard/Topbar SSOT + order-issue-tasks heal

- Registry: `wmsTabConfig.ts` (accent, category, canPin, operationalMode) → dashboard + topbar.
- Topbar pins: `user_wms_profiles.wms_topbar_pins_json` + `PUT /auth/me/wms-topbar-pins`; default receiving/putaway/picking/packing/issues.
- RBAC: rozszerzony `wms_operational_modes`; gate `WmsOperationalModeGate`; brak bypass „mandatory production”.
- Launcher: usunięte numery 1–9 i teksty Skróty/Wskazówka; KPI Braki = liczba aktywnych tasks (błąd ≠ 0).
- order-issue-tasks: ensure Order ORM columns + heal/retry w `_fetch_orders_by_id`.
- Tests: `wmsNavTabs.test.ts`, `test_wms_topbar_pins.py`, handoff 500. **No push.**

## 2026-07-21 — Ręczne PZ: ostatnia cena zakupu + VAT snapshot + audyt PL

- Cena: `resolve_suggested_purchase_price_net_for_pz` (supplier PZ → global PZ → supplier_products → product.purchase_price); brak historii = `None` (nie 0).
- VAT: snapshot z `product_vat_rate_percent` na linii; rescan nie nadpisuje ręcznych zmian.
- Audyt: `activity_log` (object_type=document) + istniejący `ReceivingScanLog`; UI „Historia czynności”; delty qty / OLD→NEW cena/VAT / wady / cofnięcie.
- Endpointy: `PATCH …/commercial`, `PATCH …/supplier`, `DELETE …/items/{id}`; qty signed delta.
- Tests: `test_wms_pz_price_vat_audit.py`. **No push.**

## 2026-07-21 — Nowa dostawa: wybór istniejącego dostawcy (bez auto-create)

- Modal searchable combobox → `GET /suppliers/` (name/NIP); jawne „+ Utwórz nowego dostawcę”.
- Backend: `create_supplier` flag; bez `supplier_id` i bez flagi → 400 (nie tworzy rekordu).
- Duplicate: exact name → reuse. **No push.**

## 2026-07-21 — Przyjęcia: document/actual/różnica + bez auto-DONE na expected

- EXISTING SSOT restored in WMS UI: `ordered_quantity` / `received_quantity` / `difference` / wady (`REJECTED_STOCK`).
- Auto-DONE removed: only explicit „Zakończ przyjęcie”; surplus over ordered allowed.
- Manual ordered=0 → UI shows „—” for document/różnica (not fake +N).
- Tests: lifecycle + presentation + workflow. **No push.**

## 2026-07-21 — Przyjęcia PZ: nie zamykaj ręcznego PZ po 1 szt.

- ROOT 400 + zniknięcie z listy: `compute_line_receiving_progress` traktował `ordered=0` + received>0 jako `received` → `recalculate` → `DONE` → lista `receiving_status != DONE` + PATCH `_assert_receiving_session_open`.
- FIX: open-ended / manual lines → zawsze `in_progress` do jawnego „Zakończ przyjęcie”; ensure auto+1 też pisze DOCK-IN.
- UI: usunięty banner DOCK-IN z listy Przyjęć; „Rozbicie”→„Sposób przyjęcia”/ukryte przy samych sztukach; Przyjmujesz teraz / Po zatwierdzeniu; statusy PL.
- Tests: `test_manual_pz_receiving_lifecycle.py`. **No push.**

## 2026-07-21 — LIVE NO_PENDING_SOURCE_LOCATION: UI location vs source_lock

- ROOT: FE treated `activeLocationId=276` as ready-for-basket; after PUT lock cleared, preserve kept UI id without server re-accept.
- FIX: `ensureServerSourceForBasket` before confirm; continuous re-accept via `lastOperatorAcceptedLocationRef`; never bare activeLocationId; detail `source_accepted` contract; MULTI_SCAN_TRACE SOURCE_* events.
- Tests: live same-location second basket + FE `multiPickingSourceAcceptance`. No push.

## 2026-07-21 — Fix GET /order-issue-tasks 500 (orders.picking_handoff_mode)

- EXACT: `OperationalError` / `UndefinedColumn` — `no such column: orders.picking_handoff_mode`
- Failing SQL: ORM SELECT Order in `_fetch_orders_by_id` (after OPEN tasks exist)
- Cause: ORM maps handoff (afc6843a); Braki request-path ensured only `order_issue_tasks.*`
- Fix: `ensure_order_issue_task_lifecycle_schema` → `ensure_orders_picking_handoff_mode_column` (SSOT)
- NOT from picking commits 2de7345a / f5e881be
- Tests A–I: `test_order_issue_tasks_handoff_column_500.py`. No push.

## 2026-07-21 — MULTI quantity-mode server-side source_lock

- Gap after route-skip: client could still send any WH `location_id` with stock.
- SSOT: `basket_put.source_lock` in session metadata (accept → confirm → clear on success).
- API: `POST /wms/picking/accept-source-location`; confirm resolves lock first; body location mismatch → SOURCE_LOCATION_MISMATCH.
- Detail refetch keeps lock (no longer `clear_basket_put_state` on quantity detail).
- FE: accept on location select; restore from `detail.source_lock`.
- Tests A–O + exact LIVE in `test_wms_multi_basket_source_provenance.py`. No push.

## 2026-07-21 — MULTI basket put: source provenance vs greedy route

- LIVE: brck1-B02 recognized but record_wms_quick_pick rejected A23 (“nie należy do trasy”); FE → UNKNOWN_SCAN_CODE.
- Cause: greedy route on physical Inventory (draft picks ignored) + stale series location in _do_record.
- Fix: skip_route on basket-bound pick; request location_id SSOT; structured SOURCE_LOCATION_* errors.
- Tests: `test_wms_multi_basket_source_provenance.py`. No push.

## 2026-07-21 — WMS receiving: effective validation + scan gate (ST-003)

- ROOT overrides: PZ `track_*` / receive-serial used legacy `Product.track_*`, ignored `validation_skip_*`.
- ROOT scan: serial awaiting could treat next product EAN as serial / block without opening product; now resolve→modal, EAN≠serial, Polish conflict copy.
- SSOT: `resolve_effective_receiving_requirements`; scan `validation_requirements`; lot_keys + document lines use effective.
- Tests: `test_receiving_validation_effective_policy.py`. No push.

## 2026-07-21 — LIVE BASKET_PRODUCT_MISMATCH empty eligible (stale picked status)

- ROOT: `_line_eligible` skipped `wms_picking_line_status in (picked, missing)` while detail rem ignored status → UI unresolved=1, write eligible=[], „Oczekiwane: —”.
- FIX: eligibility = rem>0 + basket on active cart; heal stale `picked`; resolve accepts only eligible; rich 409 diagnostics.
- Tests: `test_wms_multi_basket_live_mismatch.py` (exact flow A–H). No push.

## 2026-07-21 — MULTI final audit: basket destination SSOT

- Proven mismatch: UI `orders[].basket_slot` could show S-1-2 from foreign-cart basket; confirm of local brck1-B02 → BASKET_PRODUCT_MISMATCH.
- Fix: `eligible_basket_destinations` on detail = list_eligible (+ barcode); FE destination list uses only that; postPutFollowUp from live eligible; scan resolve prefers barcode then primary label.
- 409 extra: scanned_basket_id/barcode + eligible rows for next LIVE repro.
- Tests: `test_wms_multi_picking_final_audit.py` (stock flow, parallel, foreign label, local OK, alias). No push.

## 2026-07-21 — MULTI picking effective stock + active location

- ROOT: detail showed raw Inventory; `useEffect([detail])` cleared activeLocationId after confirm refetch.
- SSOT: `location_pick_stock_projection_map` → detail `stock_quantity`=effective; write path unchanged.
- Active loc preserved when effective>0; cleared on product change / zero stock; no FIFO fallback.
- Basket UI labels unified to `primary_basket_label` (S-1-2 ↔ brck1-B02).
- Tests: `test_wms_picking_location_effective_stock.py` + FE `multiPickingActiveLocation.test.ts`.
- No push.

## 2026-07-21 — Replenishment need audit + Polish UI (no push)

- SSOT confirmed fill-to-min: need = min_pick − pick; demand/max only in priority.
- Operator UX: Przenieś N / Z / DO; partial fill note; no raw enums in Centrum operacyjne.
- Labels: `replenishmentUiLabels.ts` (+ severity/alert level); BUFFER removed from alert copy.
- Tests: CASE 1–3/6 policy + FE label maps. Formula unchanged (CORRECT for SSOT).
- SAFE TO PUSH: NO (user hold; demand-fill is product GAP if desired).

## 2026-07-20 — User-facing events always Polish (Historia czynności)

- Root cause: ActivityLogTable mapped cart `event_code` via `getOrderEventLabel` → English title-case + CSS uppercase → „CART RELEASED”.
- SSOT FE: `getEventDisplayLabel` (`eventDisplayLabels.ts`); unknown → „Zdarzenie systemowe”.
- SSOT BE: `title_pl` / `compose_informative_message` on presentation (no history migration).
- Fallback: no English `.title()` humanize for unknown WMS ops / material needs / workflow.
- Rule: `.cursor/rules/user-facing-polish.mdc`. Tests: FE vitest + `test_event_display_polish.py`. No push.

## 2026-07-20 — Trusted capacity vs computational fallback (putaway UX)

- Split: runtime 1×1×1/0 kg stays computational; operator numbers require trusted inputs.
- `capacity_trust.py`: geometry_source REAL_DATA|FALLBACK, capacity_numeric_trusted, planning probe=1.
- Presentation: POJEMNOŚĆ: NIEOKREŚLONA (no ~63000); one discreet banner on putaway.
- Ranking ignores synthetic max_fit; weight-only bounds still score/limit.
- Distribution: unknown geometry → probe 1, never allocate 500 from fake capacity.
- Packing: GEOMETRY_SOURCE_FALLBACK; never EXACT on synthetic dims.
- Tests: `test_capacity_trust_ux.py` A–G + suites green (88). No push.

## 2026-07-20 — Missing logistics: technical defaults + provenance

- SSOT: `normalize_product_logistics` — runtime 1×1×1 / 0 kg; never auto-write master.
- Provenance: provided = master field presence (real 1×1×1 ≠ default).
- Receiving validation: NULL/missing fails when required; technical defaults do NOT pass.
- Capacity/packing/putaway: `used_defaults` + ESTIMATED confidence; FE szacunkowe labels.
- Tests: `test_product_logistics_defaults.py` (M1–M10 / receiving / P12–P13) + 75 fit suite green.
- No push. SAFE TO PUSH: NO (multi-carton persist GAP + smoke).

## 2026-07-20 — PRODUCT INTEGRATION Phase 1 + core Phase 2

- Capacity contract: `ProductLocationCapacityRead` + GET product/location + POST batch (≤80).
- Putaway: capacity fields on suggestions; UI cards; distribution plan PLAN-only + revalidate rebuild.
- Product edit: batch capacity list for inventory locations.
- Packing: fit recommendation panel, alts/reject labels, override confirm, plan[] read-only.
- Multi-carton persistence still SINGLE selected_carton_id (explicit GAP).
- Tests: `test_fit_engine_product_integration.py` + existing fit suites green.
- No push.

## 2026-07-20 — FIT ENGINE production gaps closed (post deep audit)


- Internal/usable carton dims: `internal_*_cm`, `max_payload_kg`; fit uses internal; fallback + `USABLE_DIMENSIONS_NOT_DEFINED`.
- Product logistic validator SSOT + `Product.fragile` (≠ NO_STACK); FE ProductEdit + CartonDetail settings.
- AABB placement hard gate; free-space prune; Smart cannot primary when eligible empty.
- Packaging ranking WHY_SELECTED; multi-carton HEURISTIC/ESTIMATED + bounded improve; packing plan contract.
- Invariants A–O + O2. Tests: 54 fit + 8 slotting OK. No commit/push.

## 2026-07-20 — FIT ENGINE deep audit + critical fixes

- BUG: Smart Matching + finalize_primary mogło wybrać karton z `Odrzucony:` (volume cost) mimo fail geometrycznego → FIXED (merge + primary_pool).
- BUG: compression stosowana po rotacji na niewłaściwej osi → FIXED (tylko gdy vertical == product.height).
- SEMANTIC: same-SKU occupancy bez placement map → confidence ESTIMATED w location_capacity_solver.
- Regressions: `test_fit_engine_audit_regressions.py`. No commit/push. SAFE TO PUSH: NO (pozostałe GAPY).

## 2026-07-20 — Shared FIT / CAPACITY ENGINE (SSOT)

- NEW: `backend/services/fit_engine/` — geometry XYZ, orientations, stacking, compression, weight, placement.
- Location: `capacity_service` + `location_capacity_solver` → shared core (nie volume-only).
- Packaging: `cartonization_solver` + `three_d_matching` → prawdziwy geometric fit (nie SUM volume).
- Product: `max_stack_count` / `carton_max_stack_count` (limit jednego stosu).
- Tests: CORE 1–14, LOCATION 1–6, PACK 1–15 (`test_fit_engine_matrix.py`).
- FE Magazyn `calculatePackingLayout` = tylko wizualizacja designera; operational SSOT = backend.
- No commit / no push.

## 2026-07-20 — Pakowanie: skan EAN z listy nie pomija widoku zamówienia

- ROOT: `packingScanBootstrap` → `applyPackingResult` przy `fully_packed` (np. 1×1) od razu `awaitingPostPackCarton` → modal „Wybierz opakowanie”.
- FIX: bootstrap z listy deferuje karton/finalizację; pokazuje PackingView + CTA „Wybierz opakowanie”. Skan nadal zaliczony raz (API resolve-ean/scan).
- Helper `decideListScanBootstrapUi` + testy. No push.

## 2026-07-20 — Zatwierdź i wróć: confirm remaining across locations

- Was: button only navigated back (no picks).
- Now: `POST /wms/picking/confirm-remaining` plans remaining qty on routing location priority (pick-type → name → id), writes draft Picks via `record_wms_quick_pick` / cartless; atomic on insufficient stock; no global Inventory mutation until finalize.
- FE: detail footer calls API then returns to list.
- Tests: `test_wms_confirm_remaining_picks.py`. No push.

## 2026-07-20 — ANULUJ ZBIERANIE: full MULTI session rollback

- SSOT: `Inventory` = location stock; global = SUM(Inventory). Cancel never creates PZ/PW/WZ / global stock mutation.
- Draft Pick (`picked_at IS NULL`): delete record only; location qty unchanged; informational `put_back_required`.
- Finalized Pick (defensive): restore qty at exact `Pick.location_id` (no FIFO).
- Shortage: delete only `FE_MISSING` with `metadata.cart_id` / `picking_session_id`.
- Cart/baskets/operator/session cleared; order status from session snapshot; rich `PICKING_CANCELLED` audit.
- SAVEPOINT around optional tables so lean DBs cannot poison cancel txn.
- Tests: `test_wms_cancel_picking_rollback.py` (+ lifecycle SSOT green). Commit, no push.

## 2026-07-20 — FIX 500 report-shortage-bulk (Postgres FOR UPDATE + joinedload)

- ROOT: bulk locked OrderItem with `joinedload(product)+with_for_update` → Postgres ProgrammingError → uncaught 500.
- FIX: lock without joinedload; validate cart/tenant/product; map domain errors to 409 codes; SQLAlchemy → 409 PL.
- Orchestrates same `report_wms_picking_product_shortage`. Tests CASE 1–9 + lock regression. No push.

## 2026-07-20 — MULTI shortage UI audit/regression PASS

- allocations[] = order_item.wms_picking_line_missing_qty + Order.basket (no FIFO, no product_id→basket).
- Cart READY only when unresolved=0 & shortage=0; else NIEROZLICZONE / NIEKOMPLETNE.
- Counter always `Braki: N szt.` (braki_szt). Write paths untouched.
- Tests: allocation regression + FE presentation. Commit, no push.

## 2026-07-20 — MULTI shortage UI: per order_item / basket (not SKU-only)

- ROOT: BE had order_item shortage SSOT; product-lines list exposed only product aggregate; FE showed `BRAK 1/9` + „Zamówienie niekompletne” on whole SKU.
- FIX projection: `allocations[]` on product-lines (required/picked/shortage/unresolved per order_item + basket); session `braki_szt` / `zamowienia_z_brakami`; cart assigned orders + basket cells show NIEKOMPLETNE / GOTOWE from line missing qty.
- FE: list card + detail header name order/basket; counter „Braki: N szt.”; Rozliczenie per koszyk labels BRAK/NIEKOMPLETNE/GOTOWE.
- Shortage write SSOT unchanged (`order_item_id`). No push.

## 2026-07-19 — Legacy draft Pick recovery (per Pick.id)

- `GET /wms/picking/product-picks` + `POST /wms/picking/picks/{id}/undo` (Inventory=0, shortage=0).
- Finalize 409: code `PICK_LOCATION_STOCK_MISMATCH` + `failing_pick` + operator message; FE CTA „Przejdź do pobrania”.
- MULTI panel: Historia pobrań per koszyk + cofnij konkretny draft.
- Tests: `test_wms_undo_pick_by_id.py`. No push / no auto-migrate cart_id=2.

## 2026-07-19 — LIVE finalize still 409: LEGACY vs WRITE PATH separation

- Classification: **LEGACY BAD PICKS** on cart_id=2 most likely; new write path **hard-gated** (cannot create qty=5 when effective=1).
- LIVE `wymagane 5 / dostępne 1` reproduced: Pick1 LOC-A=3 then Pick2 LOC-A=5 on stock=4; in-txn after Pick1 available=1; rollback restores stock + `picked_at=NULL`.
- Diagnostics only (no finalize logic change): `FINALIZE_PICK_TRACE` / `FINALIZE_PICK_FAILED` + `failing_pick` in 409 detail.
- Undo = LIFO draft Picks per product (optional location); does not take MULTI `order_item_id` from FE — recovery possible but not precise split. No auto FIFO reassign. No push.

## 2026-07-19 — WRITE PATH location provenance (LIVE finalize 409 class)

- ROOT CONFIRMED: MULTI quantity put used FE `locations[0]` without source scan; modal max = line remaining only; BE did not check location stock / pending picks → Pick qty=5 @ loc with stock 1 → finalize 409.
- FIX (write path only; finalize untouched): `PICK_LOCATION_REQUIRED`, `QUANTITY_EXCEEDS_LOCATION_STOCK`, `effective_pickable = Inventory − pending Pick`; FE blocks multi-loc basket without `activeLocationId`; location scan before basket; modal max = min(line, loc).
- Tests: `test_wms_basket_put_location_provenance.py`. No push.

## 2026-07-19 — LIVE finalize-cart 409 audit (product 192 / cart 2) — NO FIX YET

- ERROR: `wymagane 5.0, dostępne 1.0` from `consume_inventory_fifo_slices` via `_decrement_inventory_for_wms_pick` on pending `Pick` (`picked_at IS NULL`).
- WHY 5: `qty = float(Pick.quantity)` of the failing pending row — **not** required−shortage, **not** product aggregate 9.
- Stock on QUANTITY_CONFIRM: **NO** (`picked_at=None`). Stock on FINALIZE: **YES**. Double deduction: **NO**. Shortage never enters inventory consume.
- Finalize preserves `Pick.location_id` (no cross-location re-FIFO). Live Pick/Inventory dump unavailable locally (`warehouse.db` empty, no `.env`).
- Suspected write-time provenance: MULTI basket confirm can fall back to `locations[0]` when `activeLocationId` unset — stamps all picks on one loc while stock is split. **STOP before changing finalize/quantity/shortage SSOT.**

## 2026-07-19 — MULTI: quantity put + shortage per allocation (no FIFO close)

- STATE MACHINE: SELECT_PRODUCT → SELECT_BASKET → ENTER_QUANTITY → CONFIRM → next basket / finish.
- SHORTAGE SSOT: `report_wms_picking_product_shortage` requires `order_item_id` on baskets carts; MULTI caps declarable to remaining (no pick→shortage convert).
- FE: per-basket panel + MultiAllocationShortageModal; quantityMode suppresses EAN+1/series; post-partial „oznacz pozostałe jako brak”.
- Tests: `test_wms_multi_basket_allocation_scenario.py` (20-qty CASE 6); FE allocation + scan route. No push.

## 2026-07-19 — DEFAULT QUANTITY MODE + fix BASKET_PRODUCT_MISMATCH

- ROOT MISMATCH: leftover `active_series` for foreign SKU blocked product-context basket resolve (`BASKET_PRODUCT_MISMATCH` on S-1-2 while UI showed eligible).
- FIX: clear foreign series when detail `product_id` provided; unify `resolve_allocation_for_basket_scan` with detail SSOT.
- NEW FLOW: EAN/CLICK = select product; basket = QUANTITY_REQUIRED (Pick=0); confirm quantity = Pick +N (live revalidate).
- FE: `BasketPutQuantityModal` (receiving-style ±); list MULTI EAN navigates without pending.
- Tests: `test_wms_basket_put_quantity_mode.py` CASE 1–12. No push.



- ROOT: `pending=false+series=false` → EXPECTED_PRODUCT_SCAN blocked eligible basket on detail even though product_id was known from route.
- NEW MODEL: selected product (click|EAN|route) vs physical pending qty. Basket+context → SERIES_ACTIVATED qty=0; basket+pending → Pick+1; EAN+series → Pick+1.
- Backend: `confirm_basket_put(product_id, location_id)`; API body fields; FE route `select_destination`; UI „Wybierz koszyk”.
- Tests: CASE 1–10 in `test_wms_basket_put_product_context_destination.py` (12 pass). No push.



- ROOT: Jedyny URL `/wms/picking/products/:id` idzie przez `goDetail`. Live `DETAIL_MOUNT has_seed=false navigation_source=click_or_other` = navigate **bez** seed/token ⇒ nie lista PRODUCT_SCAN. Brak `PRODUCT_SCAN_REQUEST_START` / `GLOBAL_SCAN` EAN przed mount ⇒ entry był **click** (lub bare goDetail), nie fizyczny skan. Label `click_or_other` mylący — brak seed = „nie physical_scan”.
- FIX: jawne `navigationSource` (physical_scan|click|pending_resume|other); HARD block physical_scan bez quick-pick+pending; `preparePickingProductDetailNavigation` + Scanner Helper dispatch harness; DETAIL_MOUNT czyta source z routera.
- Tests: `wmsScanDispatch.integration.test.ts` via `performScannerHelperScan` (nie bezpośredni list handler).
- No confirm-basket-put / allocation changes. No push until live retest.



- ROOT: Fizyczny skan EAN w Scanner Helper odpalał `products/search` + `returns/lookup` (catalog query z inputu), a workflow mógł nie mieć `consumed`. Detail po wejściu miał `pending=false` → basket `EXPECTED_PRODUCT_SCAN`.
- FIX: `handleScan` awaits handler + `{consumed}`; picking path suppresses helper lookups; list returns SCAN_CONSUMED + PRODUCT_SCAN before navigate + traces; detail keeps seed/handler during load.
- Tests: `wmsScanDispatch.integration.test.ts` (dispatcher entry, not backend helper alone).
- No push.

## 2026-07-19 — REAL MULTI: list EAN = PRODUCT_SCAN → detail STATE B (no second EAN)

- ROOT: List could navigate without pending visible on detail (STATE A → basket EXPECTED_PRODUCT_SCAN). Valid EAN without selectedLocation → UNKNOWN_SCAN_CODE.
- FIX: list PRODUCT_SCAN before navigate + pending seed; detail effectivePending; UI „PRODUKT ZESKANOWANY — ZESKANUJ KOSZYK”; get_basket_put_ui_state via find_open_picking_session; re-attach pending after detail touch; location fallback for product EAN.
- Tests: `test_wms_basket_put_list_scan_pending_survives_detail.py`.
- No push.

## 2026-07-19 — PRE-PUSH AUDIT ab1f70a8: scan lock + non-MULTI gate + session FOR UPDATE

- BLOCKERS fixed: FE scan gate (detail+list); list `requiresBasketPut` from API not `Boolean(cartId)`; pending before bundle; session `FOR UPDATE` on put mutations.
- Regression: same SKU S-1-2 complete → unbound → S-1-1; FE catalog/popup contract + non-MULTI fallthrough.
- No push.

## 2026-07-19 — STRICT MULTI scan state machine + operator error popups

- CLASSIFY → STATE → VALIDATE: invalid scan consumed, ZERO mutation.
- Codes: EXPECTED_BASKET_SCAN, EXPECTED_PRODUCT_SCAN, BASKET_EMPTY, BASKET_OTHER_CART, OVERPICK_BLOCKED, …
- FE: `wmsScanErrorCatalog` + fullscreen `WmsScanFeedbackOverlay` + error beep.
- Tests: `test_wms_basket_put_scan_state_machine.py` + FE route/catalog.

## 2026-07-19 — REAL runtime: state A UI + silent basket scan (brck1-B0x)

- ROOT: Screen „KOSZYKI WYMAGAJĄCE… Zeskanuj EAN, potem koszyk” = pending=NULL (state A). Detail handler ignored brck1-B0x (silent). List with pending blocked basket instead of confirm. classifyWmsScanCode treated brck1-B01 as location_like.
- FIX: multiPickingScanRoute (A/B/C); detail/list route basket → confirm; clear state A copy; basket_like classify; MULTI_SCAN_TRACE; brck1 runtime tests.
- SSOT unchanged: EAN→pending→basket→Pick.

## 2026-07-19 — SERIES LINE PROGRESS: live line_remaining ≠ product aggregate

- ROOT: series banner used product aggregate `remaining` (e.g. 17) instead of allocation rem (8).
- FIX: `project_active_series_with_live_remaining` on UI/API series; FE banner + toast use `active_series.line_remaining` only. Aggregate widget unchanged.
- Tests: `test_wms_basket_put_series_line_progress.py` CASE 1–5.

## 2026-07-19 — FINAL INTEGRATION AUDIT MULTI basket put (42cfee48…788ebff8)

- HEAD `788ebff8`; all 4 commits present; 38 basket-put tests PASS; no code changes; no push.
- Hard gates PASS: no FIFO destination before basket scan; no Pick before confirm; no cross-SKU series on detail; no double EAN required.
- Residual BUG (non hard-gate): series banner „Pozostało” uses aggregate product `remaining`, not series line_remaining (pending path is correct per basket).
- SAFE TO PUSH: YES (hard gates); fix series-line progress before treating UI as fully SSOT-clean.

## 2026-07-19 — MULTI 409 on S-1-2: foreign/stale series on product detail

- ROOT: `get_basket_put_ui_state` exposed `active_series` for *any* product_id. Detail SKU X showed SERIA S-1-1 from leftover series of SKU Y; progress 0/N for X; basket scan S-1-2 → series switch with `series.product_id=Y` → `BASKET_PRODUCT_MISMATCH` 409.
- FIX: product-scoped series/pending on detail; sanitize invalid series; pending forces no destination label; clearer mismatch when switch product ≠ basket need.
- Tests: `test_wms_basket_put_multi_sku_s12_regression.py` CASE 1–7.

## 2026-07-19 — Pending basket-put list UX + cancel

- List shows banner for `basket_put_pending` only (series ≠ pending).
- Resume detail / same-SKU scan opens existing pending; other SKU blocked.
- `POST /picking/cancel-pending-basket-put` clears pending only (no Pick/stock/series).
- Tests: `test_wms_basket_put_pending_list_ux.py` CASE 1–9.

## 2026-07-19 — PRE-PUSH AUDIT MULTI basket put (42cfee48 → follow-up)

- BLOCKER found: series switch invented pending qty=1 and wrote Pick; API rejected confirm when pending=None (switch dead in prod).
- FIX: `SERIES_DESTINATION_SWITCHED` retargets series with quantity_put=0; API allows confirm when series active; `picked` = qty>0.
- eligible_baskets = UI hint; confirm always `resolve_allocation_for_basket_scan` live DB.
- Tests: +stale eligible, switch no increment, basket without pending, product change, 20-qty overpick.

## 2026-07-19 — MULTI basket put: free basket choice + list EAN as PRODUCT_SCAN

- ROOT: `resolve_next_basket_allocation` FIFO bound `order_item_id`/`expected_basket_id` into pending at product scan → forced „KOSZYK DOCELOWY: S-1-1”; list EAN only navigated → detail demanded second EAN.
- FIX SSOT: product scan → product-level pending + `eligible_baskets` (no Pick); basket scan → `resolve_allocation_for_basket_scan` → Pick + series for that basket/line. Mid-series other-basket scan switches destination.
- FE: list scan calls quick-pick then detail with one-shot `listProductScanToken`; UI lists all eligible baskets (no single destination).
- Errors: `BASKET_PRODUCT_MISMATCH`, `BASKET_PRODUCT_ALREADY_COMPLETE`; `scope_order_id` on quick-pick (no recovery gate).
- Tests: `test_wms_basket_put_confirmation.py` CASE 1–11 (+ extras).

## 2026-07-19 — POST /orders 500: phantom offer_id (ProductSalesOffer)

- ROOT: `GET /products/{id}/sales-offers` → `ensure_default_offer` + flush, **no commit**; `get_db` closes → rollback. FE stored ephemeral offer.id → POST `offer_not_found` → 500.
- NOT product.id-as-offer_id (FE used real offer.id from list); IDs were never persisted.
- FIX: list endpoint `db.commit()` after ensure; FE auto-add uses `product_id` (offer_id only on explicit multi-offer pick); create maps `ProductSalesOfferError` → 400 `OFFER_NOT_FOUND`.
- Tests: `test_order_create_offer_contract.py`.

## 2026-07-19 — Packing BASKET ghost count (entry 1, scan 404)

- ROOT: `packing_mode_distribution` / `_packing_orders_base_query` liczyły `picking_handoff_mode=BASKET` bez live custody; po finish custody cleared, handoff zostaje (provenance) → COUNT=1, GET basket → EMPTY.
- FIX: SSOT eligibility + scope — BASKET wymaga `Order.basket_id` + `CartBasket.order_id==Order.id`; exclude `wms_packing_automation_finished_at`; PACKING_QUEUE_TRACE przy ghost.
- NIE czyszczono `picking_handoff_mode`.
- Tests: `test_packing_active_queue_ssot.py` CASE 1–7.

## 2026-07-19 — POST /orders 500: diagnostics-only (no root-cause fix yet)

- Deployed `6b70515e` contains `ORDER_CREATE_ERROR` (from parent `2aa7114b`) but only `logger.error` (no traceback) + commit `6b70515e` itself is pycache-only.
- Startup `columns_added=0` ⇒ do not assume missing `picking_handoff_mode`.
- Upgrade: `ORDER_CREATE_TRACE` stages + `logger.exception` + stderr print + `flushed/committed/order_id` + payload fingerprint; wrap unexpected → safe HTTP 500 after rollback.
- Suspects to verify on next deploy log: `product_sales_offers` (resolve lines), `tenant_fulfillment_configurations` (POST_FLUSH_ASSIGN), item offer FK — not handoff alone.
- Tests: `test_order_create_diagnostics.py`.

## 2026-07-19 — Orphan PACKING cart after last pack (cart id=2 pattern)

- ROOT: `finish_packing` cleared custody only when `order.cart_id` set; remaining used session-heal (`list_orders_on_cart`). Path: cart_id already NULL + `picking_session_id`/`current_session_id` → remaining>0 → event `order_packed` → stuck PACKING; UI later 0 orders (cart_id-only).
- cancel-session 409 `InvalidCartTransition` READY/PACKING = correct (CASE A ≠ CASE C). Magazyn→Wózki must use admin-release heal, not cancel-session.
- FIX: always clear packed-order custody; remaining = `Order.cart_id` only; `release_empty_orphan_cart` SSOT; admin-release allows empty READY/PACKING orphan; UI copy for orphan „Zwolnij wózek”.
- Tests: lifecycle ssot orphan / last-pack / cancel still blocked.

## 2026-07-19 — POST /orders 500: missing picking_handoff_mode

- ROOT: ORM INSERT always includes `picking_handoff_mode`; prod schema without column → OperationalError → HTTP 500.
- PG tier0 previously skipped dedicated order ensures (sqlite-only steps); sync can fail silently.
- FIX: `ensure_orders_create_schema` before create; PG tier0 explicit handoff ensure; `ORDER_CREATE_ERROR` log + rollback; list schema includes handoff.
- Tests: `test_order_create_schema.py`.

## 2026-07-19 — AUDIT: picking dashboard 0 vs panel 1 (#1233) + cancel 409

- Dashboard 0 = PRELIMINARY eligibility (cart_id NULL + picking_finished_at NULL + open fulfillment) — **correct**, nie bug licznika.
- Cancel cart_id=2 → 409 READY_FOR_PACKING/PACKING = **correct**; UI nadal oferuje „Anuluj zbieranie” bez gate na cart status.
- Reopen Picking: **nie istnieje** (tylko tekst błędu); status panel → picking source bez guarda (`apply_order_panel_ui_status` / bulk).
- PROD row #1233: nie odczytano (brak DB); rekonstrukcja z 409 + predicates.
- NEEDS: status guard + kanoniczny Reopen + UI cancel gate. NIE counter fix.

## 2026-07-19 — Packing finish preflight audit (AVAILABLE)

- AVAILABLE + aktywne `order.cart_id` ≠ legalny flow (lifecycle breach; `finish_packing` no-op bez detach).
- Preflight: tylko PACKING | READY_FOR_PACKING; AVAILABLE+custody → `CART_LIFECYCLE_INCONSISTENT` przed pipeline.
- Tests: AVAILABLE custody fail + local 4xx before pipeline.

## 2026-07-19 — Packing finish HTTP 400 (mode=baskets / basket-first)

- ROOT: `packing_finish_order` rzucał `CART_NOT_IN_PACKING` gdy cart = `READY_FOR_PACKING` **po** post-pack pipeline; basket-first nie woła `startPacking`. `finish_packing` już akceptował READY.
- FIX: preflight cart przed mutacjami; READY_FOR_PACKING OK; usunięty hard-raise; `PACKING_FINISH_TRACE`; idempotentny retry po `automation_finished_at`.
- Tests: `test_packing_finish_baskets.py` CASE 1–10.
- ORDER-ISSUE-TASKS 500: UNRELATED.

## 2026-07-19 — FINAL PRE-PUSH AUDIT (afc6843a + packing) — fixes

- BUG: cartless finalize used relative import `.picking_handoff_service` → ModuleNotFoundError (CARTLESS handoff never wrote). Fixed → `..picking_handoff_service`.
- BUG: `finish_packing` partial MULTI left `CartBasket.order_id` set. Fixed: clear basket slot like detach.
- GAP (open): `PATCH /orders/{id}/select-carton` tenant-only, no packing handoff/cart scope.
- GAP (open): recovery/consolidation → READY_TO_PACK can leave `picking_handoff_mode=NULL` (not cart/cartless finalize paths).
- PERF WARN: soft reconcile on every `GET /packing/modes` loads packing-ready orders + completed null-cart sessions.
- HEAD at audit: `136fed44` (memory+pycache only after afc6843a). 24863af + afc6843a ancestors OK; first-scan helpers intact.
- Tests matrix: 80 passed (handoff/packing/lifecycle/cartless/finalize); FE packingHelpers 4 passed. Postgres schema: NOT TESTED.

## 2026-07-19 — Pick→pack handoff provenance + scoped packing

- SSOT: `orders.picking_handoff_mode` = CART|BASKET|CARTLESS (immutable execution snapshot).
- Live `cart_id`/`basket_id` = custody until pack finish (CartLifecycle unchanged).
- Packing queue/EAN scoped; basket-first warehouse-global; no global FIFO; no NULL→CARTLESS.
- Entry counts from real cohorts; 24863af pack-once preserved with required scope.
- Tests: `test_picking_packing_handoff.py`.

## 2026-07-19 — WMS Packing: first list scan + fake FINALIZED

- ROOT: list EAN → resolve-only navigate (no pack); `isPackingSessionFinished` = `packed_at`; AutoActions hardcoded ✓✓; list qty without `order_item_required_pack_qty`.
- AFTER: `POST /wms/packing/resolve-ean/scan` (FIFO + +1); FINALIZED = `wms_packing_automation_finished_at` + packed complete; list `pack_qty_from_required`; pipeline real states; lines_packed_complete requires `total_required_qty > 0`.
- Tests: `test_wms_packing_scan_flow.py`, `packingHelpers.test.ts`.
- ORDER-ISSUE-TASKS 500: UNRELATED.

## 2026-07-19 — Baskets put confirmation (PRODUCT→BASKET)

- ROOT: quick-pick incrementował qty bez skanu koszyka; UI tylko „Odłóż do…”.
- AFTER: SSOT `wms_basket_put` w `WmsOperationSession.metadata_json`; pending put + series per (product, order_item, basket).
- API: gate w `POST /picking/quick-pick`; `POST /picking/confirm-basket-put`.
- FE: duży ekran potwierdzenia koszyka; seria bez ponownego skanu.
- Tests: `test_wms_basket_put_confirmation.py` CASE 1–11.

## 2026-07-19 — Modal „Edycja trybu zbierania”: własny sticky footer

- ROOT: modal bez Zapisz/Anuluj; UX kierował na globalny sticky bar (z-40) widoczny pod overlayem.
- AFTER: modal z-5000, sticky header/footer; Zapisz = commit do `savedConfigs` (bez API); Anuluj/X/ESC = restore `editBackup`; globalny pasek = API.
- Commit: `ca32f29` (bez push).

## 2026-07-19 — GET /order-issue-tasks 500: missing archived_at on request path

- ROOT (reproduced): request-path `ensure_order_issue_task_lifecycle_schema` added priority_* but **not** `archived_at`/`archived_by_user_id`; ORM SELECT still requires them → `OperationalError`/`UndefinedColumn` after previous priority-only fix.
- FIX: call `ensure_order_issue_tasks_archive_columns` in request-path ensure; `ORDER_ISSUE_TASKS_ERROR` structured logging (no traceback to FE).
- Tests: `test_order_issue_tasks_archive_request_path.py` (legacy schema → ensure → list ×3).
- PROD SCHEMA VERIFIED: NO (no Railway/DB access); PG runtime test: NOT AVAILABLE.

## 2026-07-19 — CARTLESS PICKING (bulk / cart_no_scan)

- ROOT: `cart_no_scan` był AUTO_SELECT_PHYSICAL_CART via `GET /picking/default-cart` → first BULK cart → claim.
- AFTER: `start_cartless_picking` — `WmsOperationSession.cart_id=NULL`, `Order.cart_id=NULL`, scope=`picking_session_id`.
- API: `/picking/start-cartless`, `finalize-cartless`, `cancel-cartless-session`, `heartbeat-cartless`; product-lines + quick-pick + shortage z `picking_session_id`.
- FE: brak default-cart dla cart_no_scan; label „Zbieranie bez identyfikacji wózka”; header sesji bez CART-xxxx.
- Timeout: `release_stale_cartless_sessions` w `run_cart_lifecycle_maintenance`.
- Tests: `test_wms_cartless_picking_ssot.py` (9). Bez migracji schematu / bez auto-heal legacy.

## 2026-07-19 — UX PRELIMINARY count + zero-assignment message

- Tile: tooltip + aria „zamówień oczekujących” (bez zmiany nazwy statusu).
- Gate 8/8 → `operator_message` z bootstrap (nie zależny od count po FAIL status); FE modal + empty state products.
- Bez gate na configured-statuses; bez claim; CART AVAILABLE.

## 2026-07-19 — FINAL AUDIT: Wózki tile vs assignment (PRELIMINARY SSOT)

- Dashboard ≠ FULL assignment SSOT: count = eligibility + free `cart_id` only; scan still runs `gate_orders_before_capacity` → real scenario tile>0 / assign=0 (stock/location FAIL).
- Intentional: no heavy validation on every configured-statuses GET.
- Zero-after-gate cart: already `_heal_empty_assigned("gate_rejected_all")` → AVAILABLE (no claim). CASE 5 regression added.
- Docstrings corrected: PRELIMINARY SSOT, not „SSOT z assignment”.

## 2026-07-19 — Wózki:8 vs empty CART assignment (PICK_ASSIGN_TRACE)

- ROOT: (1) kafel `configured-statuses.order_count` = surowy COUNT po `order_ui_status_id` (A); assignment = eligibility (`picking_finished_at`, fulfillment PICKING/PARTIAL/blank, consolidation…) + `cart_id IS NULL` + WMS validation gate (B) → semantic drift; shortage/MISSING + `picking_finished_at` po finalize nadal w A. (2) `bootstrap_start_picking_if_needed` przy 0 candidates wołał `claim_cart` → CART ASSIGNED/PRZYPISANY z orders=0.
- FIX: `count_assignable_orders_for_picking_statuses` w kafelku; eligibility traktuje blank fulfillment jak open + `deleted_at`; brak claim przy 0 — `release_cart` gdy ASSIGNED; log `PICK_ASSIGN_TRACE` per order z REJECTION_REASON.
- Tests: `test_wms_picking_assign_cart_empty_ssot.py` CASE 1–4.

## 2026-07-19 — GET /order-issue-tasks 500 + stale „Do zebrania”

- ROOT list 500: (1) `ensure_order_issue_task_items_table` used SQLite-only DDL on PG allowlist path; (2) sync failure left session dirty → `db.commit()` → PendingRollback/500; (3) repair without savepoint poisoned PG txn; (4) `ensure_picking_shortage_support` SQLite-gated so `disable_auto_detach` ALTER skipped on Railway.
- Fix: ORM dialect-aware CREATE; rollback after sync fail; `begin_nested` around repair; PG-safe `ensure_wms_picking_shortage_settings_columns` on allowlist; clamp `ge=0` DTO fields; eager-load fallback.
- Semantics: shortage YES → 1 active OrderIssueTask per order (upsert idempotent) on report + finalize.
- Stale „Do zebrania: 2”: cart scan painted status-level `hubPickStats`; now refetch product-lines for scanned cart_id before navigate; products page does not show hub stats while loading.
- Tests: `test_order_issue_tasks_after_shortage_finalize.py`.

## 2026-07-19 — Finalize shortage detach: setting + heal READY_FOR_PACKING


- ROOT: checkbox `disableAutoDetachMissingOrdersFromCarts` was **localStorage-only** (backend never read it). Stuck carts in `READY_FOR_PACKING` early-returned without detach.
- Fix: DB field `disable_auto_detach_missing_orders_from_carts` on `wms_picking_shortage_settings`; helper `is_shortage_auto_detach_enabled` (= not disable); finalize reads it.
- Detach via `detach_order_from_cart(..., allow_shortage_finalize=True)`; heal path for READY_FOR_PACKING shortage; `release_cart` clears leftover order.cart_id.
- Trace logs: `FINALIZE_TRACE *`. Tests: real DB + fresh session + boolean ON/OFF.

## 2026-07-19 — Finalize shortage cart detach + activity log UX

- ROOT finalize: `finish_picking` always → READY_FOR_PACKING with ALL orders still on cart (`clear_cart=False`). Shortage never detached.
- Fix: `finish_picking_after_wms_finalize` — detach shortage via CartLifecycle; all-shortage → release; mixed → packing-bound stay.
- Logs: OrderActivityLog.operator_user_id; LOGI CZYNNOŚCI + ActivityLogTable columns CZAS|UŻYTKOWNIK|ZDARZENIE|KOMUNIKAT; NEWEST first; shortage single ActivityEvent (order+cart links, no duplicate).
- Tests: `test_wms_picking_finalize_shortage_cart_detach.py`.
- Audit: [Audit finalize shortage cart](54d3471c-7c00-4a93-b94a-2f97ad3eba17) confirmed keep-cart + `finish_picking` clobber.

# Change log

## 2026-07-19 — Railway boot: wms_order_validation imports

- Broken: `from ..auth_deps` / `from ..warehouse_context` (modules do not exist).
- Fixed: `from ..auth.deps import get_optional_current_user`, `from ..auth.warehouse_deps import require_operable_warehouse`.
- Gate: `python -c "import backend.main"` → BACKEND IMPORT OK (exit 0). Commit `f3668ad`.

# Change log

## 2026-07-19 — Prod bugs: shortage list race + banner + finalize FK

- **P1 shortage 2×entry:** FE `createRequestDeduper` joined pre-mutation `GET product-lines` after POST → stale ACTIVE. Fix: `force` bypass; list refresh after shortage forces new GET; POST shortage returns `product_line` snapshot (same builder).
- **P2:** Removed top „Zamówienia niekompletne” banner (+ `cohortMissingByOrder`); row SHORTAGE UI kept.
- **P3 finalize FK:** orphan `orders.shipping_method_id` breaks UPDATE; sanitize before apply; safe operator message + `request_id`; audit script `audit_orphan_shipping_method_fk`; import assert FK assignable.
- **P4:** Finalize still classifies per-order (`all_picked`→PACKING, `all_missing`→MISSING, else NEEDS_DECISION) — not bulk PACKING; safe errors + rollback on failure.
- Tests: BE shortage product-lines / finalize orphan+classify; FE dedupe force + error UX.

## 2026-07-19 — SHORTAGE hardening verification (final)

- Flush SSOT: **flush-before-aggregate** in `sum_line_events` / `sum_missing` / `sum_pick` (nie globalny flush w `append_event`).
- Concurrent PG: `FOR UPDATE` na candidate `OrderItem`; test `ConcurrentShortagePostgresTests` (SHORTAGE_PG_URL).
- Legacy: audit raw vs effective; runtime clamp; bez MagicMock w produkcji.
- Logi: order + cart dual-write z `#order` / EAN / 1/1 / operator / CART.
- Related regression: 131 BE + 22 FE. Production deploy/repro: NOT VERIFIED.

## 2026-07-19 — SHORTAGE hardening (flush SSOT + concurrent + legacy clamp)

- SSOT: `append_event` flush + `sum_line_events`/`sum_missing`/`sum_pick` flush; safe scalar coerce (no `float(MagicMock)`→1).
- Concurrent: `SELECT … FOR UPDATE` on candidate OrderItems before declarable/write.
- Legacy: display/report clamp `missing ≤ required−picked`; read-only `audit_fe_missing_duplicates`.
- Atomicity: report-shortage endpoint rolls back on any unexpected Exception before commit.
- Tests: `test_wms_picking_shortage_hardening.py`.

## 2026-07-18 — ZGŁOŚ BRAK: first-submit wipe + idempotency + red UI

- ROOT: `SessionLocal(autoflush=False)` → `sync_declared` / `recompute` SUM(MISSING) nie widziały pending `FE_MISSING` → zerowały `wms_picking_line_missing_qty` mimo Activity eventu; drugie kliknięcie „naprawiało” UI i dublowało log.
- Fix: `db.flush()` po append + w sync/recompute; idempotent `already_resolved` NO-OP; order-aware Activity + `operator_user_id`; SHORTAGE ≠ zebrane (`braki`); czerwony wiersz; badge zamówień niekompletnych; defensive revalidate nie odłącza przy shortage.
- Tests: `test_wms_picking_shortage_first_submit.py` + FE `wmsPickingUiGates`.

## 2026-07-18 — CartLifecycle invariant: panel status + clear_cart

- `office_order_ui` patch status → `apply_order_panel_ui_status` → `detach_order_from_cart` (no raw clear).
- `cart_service.clear_cart` → `admin_release_cart`; `clear_basket` → `detach_order_from_cart`.
- `apply_fulfillment_state(clear_cart=True)` raises — cart clear only via lifecycle.
- Tests: `test_office_order_ui_cart_detach.py`.

## 2026-07-18 — WMS Validation hardening (detach SSOT + tests)

- `detach_order_from_cart(..., operator_user_id=None)` = System actor; gate no longer uses `clear_order_picking_session_context` bypass.
- Technical `ERROR`/`ORDER_NOT_FOUND` separated from product issues (no fake WMS_VALIDATION_FAILED).
- Integration: race G, active session H, multi-tenant J, activity L, perf (1 routing / batch).
- DEV audit test.db: 0 active cart orders would_fail.

## 2026-07-18 — WMS Order Validation SSOT (pre-Capacity)

- Package `backend/services/wms_order_validation/` — routing shortfalls → PASS/FAIL + issues/reason_label.
- Settings: `wms_validation_failed_order_ui_status_id` (NULL = gate without status mutate).
- Gates: bootstrap + start_picking before Capacity; defensive revalidate on cart (no picks → detach).
- Activity: one `WMS_VALIDATION_FAILED` / `PASSED` event; no PASS spam on auto gate.
- Revalidate: previous UI status in order metadata; order detail panel + API.
- Legacy: `audit_active_cart_orders_validation_failures` read-only.
- Tests: `test_wms_order_validation.py` (10).

## 2026-07-18 — shortage multi-order / remaining-first audit

- Audyt: FE wysyłało `order_item_id` FIFO → shortage tylko na 1 linii; alokacja budgetem zjadała `declarable` (konwersja picków) przed remaining.
- Fix: product-level shortage bez `order_item_id` (tylko recovery); Orders `order_by(id)`; pass1=remaining, pass2=pick→shortage; PARTIAL gdy rem>0 i (picked|miss)>0.
- Tests: `test_wms_picking_shortage_multi_order.py`.

## 2026-07-18 — shortage resolved ≠ DO POBRANIA / ≠ ZEBRANO

- ROOT: lista FE liczyła `remaining = total − picked` (ignorując `missing`); `completed` renderowane zawsze jako zielone ZEBRANO; powrót z detail bez refresh → stale „DO POBRANIA” + „BRAK LOKALIZACJI”.
- SSOT: `resolution_status` ACTIVE|PARTIAL|COMPLETED_PICK|SHORTAGE na product-lines/detail; remaining = req − picked − miss (już w builderze).
- FE: SHORTAGE → „ZGŁOSZONO BRAK”; sort ACTIVE→PARTIAL→COMPLETED_PICK→SHORTAGE; detail bez CTA skanu przy pełnym shortage; refresh listy po powrocie.
- Finalize: bez zmian — nadal `all_picked` vs `all_missing`/`some_missing`.
- Tests: `test_wms_picking_shortage_resolution_status.py`, `wmsPickingUiGates.test.ts`.

## 2026-07-18 — empty location DOCUMENTS_ONLY + location-aware undo audit

- DOCUMENTS_ONLY: always accept empty-location report; pending CONTROL inventory + `InventoryLocationLock` (block_picking) — no illegal stock write; routing excludes location.
- HYBRID: unchanged RK zeroing.
- Undo/empty-location: Pick.location_id filter confirmed; regression A/B multi-loc undo.

## 2026-07-18 — picking corrections: undo pick + empty location + shortage after completed

- Audit: draft Pick does not touch Inventory; stock only at finalize.
- `POST /wms/picking/undo-pick` — LIFO delete/reduce draft picks + audit `PICK_UNDONE`.
- Shortage after 1/1: `declarable = ordered − missing`; undoes picks as needed before `FE_MISSING`.
- `POST /wms/picking/confirm-empty-location` — RK via `apply_manual_stock_correction`, concurrency `observed_stock_qty`, LOCATION vs PRODUCT shortage.
- Detail UI: corrective CTAs when completed; problem modal (empty / qty mismatch / product shortage).

## 2026-07-18 — picking session keeps completed products on list

- ROOT: backend `build_wms_picking_product_lines` filtered via `_picking_product_line_still_active` (remaining≈0 dropped).
- SSOT: with `cart_id` return full demand snapshot + `completed`; hub without cart still filters active-only.
- FE: partial multi-qty label; completed shows ✓ ZEBRANO + „Pobrano z …”; sort unfinished→completed (already in `sortWmsPickingProductLinesPickFlow`).
- Tests: `test_wms_picking_session_keeps_completed_products.py` (SCAN→still 5→completed last).

## 2026-07-18 — product-lines/detail TypeError `_safe_touch_picking_session`

- Production: `TypeError: takes 0 positional arguments but 1 was given` at detail ~L915.
- Helper is `def _safe_touch_picking_session(**kwargs)`; 4 call-sites passed positional `db`.
- Fixed all to `db=db` (product-lines recovery, detail, quick-pick, shortage).
- E2E regression: `test_wms_picking_detail_safe_touch_session.py` (router + authenticated user).

## 2026-07-18 — bundle_component_index: canonical normalize (detail 500 fix)

- Root cause: `or 0` in tree builder → `WmsPickingBundleComponentStatus(ge=1)` ValidationError at detail L1867.
- Semantics: index is projected (not DB column); NULL = unassigned; valid = unique ≥1 among siblings.
- Canonical: `backend/services/bundles/bundle_component_index.py` + reindex in UX index / trees / scan.
- Skip non-components (`is_bundle_component=False`); never map all NULL→1; safe sort; per-bundle try/except.
- `DEBUG_HTTP_500` body opt-in only (no APP_ENV auto-leak). Logs keep full traceback + request_id.
- Tests: `test_bundle_component_index_normalize.py`, detail endpoint 200 with NULL/0 meta.

## 2026-07-18 — HTTP 500 diagnostics + product-lines/detail root cause

- Canonical `wms.exceptions` log always includes `exception_type`, message, traceback, `file`/`function`/`line` under `request_id`.
- Added `ResponseValidationError` handler; HTTP 5xx keeps `__cause__` (`from e`); `exception_origin` prefers `backend/` frames.
- Local PG repro: detail 500 = `ValidationError` at `wms_picking_product_list_service.py` `build_wms_picking_product_detail` **L1867** (`bundle_component_index=0`).
- Reports: `memory/wms-http-500-diagnostics-audit.md`. No business fix yet.

## 2026-07-18 — Cart details UX (ERP layout)

- Layout: Podsumowanie KPI → tabela zamówień → Historia doboru (collapsed) → Historia czynności (table).
- Shared `ActivityLogTable` (Data | Operator | Akcja); `ActivityLogPanel` wraps it.
- Report: `memory/cart-details-ux-redesign.md`.

## 2026-07-18 — Activity Log final UX (no dupes, complete detach history)

- Capacity Analytics: collapsed by default; shows last-run date + analyzed/assigned/stop reason (historical).
- Activity: action without embedded #; numbers only when `show_order_numbers`; no metadata expand.
- Timeout / idle / cancel / admin release: explicit „Odłączono wszystkie zamówienia.” + # list.
- Report: `memory/activity-log-final-ux-report.md`.

## 2026-07-18 — Activity Log UX simplify + Capacity summary only

- ActivityLogPanel: only When / Who / What (+ optional #orders line); no expand/details.
- Assign/detach activity text: short sentences; numbers in metadata line.
- Capacity Analytics UI: last-run summary only (analyzed/assigned/stop reason); removed reject lists, 24h stats, order Capacity history panel.
- Report: `memory/activity-log-ux-simplify-report.md`.

## 2026-07-18 — Activity Log Framework (unified panel standard)

- Audit: `memory/activity-log-audit.md`.
- Backend ready fields: `occurred_at_display`, `operator_display`, `action`, `details`, `order_numbers`.
- FE `ActivityLogPanel`: DATA → OPERATOR → AKCJA + expand (no client translation).
- Dual-write WMS order activity → `activity_events`; cart assign/detach full sentences with `#orders`.
- Capacity Analytics untouched. Report: `memory/activity-log-framework-report.md`.

## 2026-07-18 — SSOT Panel ↔ WMS picking (capacity truncate regression)

- Root cause: WMS product-lines/count used status cohort while Panel used `list_orders_on_cart`.
- Added `resolve_wms_picking_order_ids` — with `cart_id` always SSOT; hub without cart stays cohort.
- Wired: product lines, detail, quick pick, shortage, finalize, bundle scan.
- Tests: `test_wms_picking_cart_ssot.py`; audit+report in `memory/ssot-panel-wms-orders-*.md`.

## 2026-07-18 — Capacity Analytics (diag layer)

- Activity Log: tylko wynik operacji (bez basket_assigned / skipów); meta numerów capped.
- Nowy magazyn: `capacity_analytics_runs` + reason aggs + details (lazy).
- API `/capacity-analytics/*`; admin sekcja „Analiza Capacity”; historia Capacity na zamówieniu.
- Report: `memory/capacity-analytics.md`.

## 2026-07-18 — Carts: detach one order + tooltips + Activity Log UX

- Lifecycle: `detach_order_from_cart` + `POST /carts/{id}/orders/{order_id}/detach` (blocked after picks / READY|PACKING).
- Assigned orders DTO: customer, products/EAN/SKU, weight, `can_detach`.
- FE tooltips on number + Pozycje; Activity Log expandable with inline order list.
- Report: `memory/carts-detach-tooltips-activity.md`.

## 2026-07-18 — Carts consistency audit (close-out)

- Full SSOT audit: all live order counts via `list_orders_on_cart` (volume refresh, clear_cart/basket, finish_packing remaining, pick progress).
- Activity descriptions include `#order_numbers` (no bare „Przypisano N zamówień”).
- UI: Activity Log `refreshKey` + soft poll after admin release / timeout.
- Scenarios A–E: `backend/tests/test_cart_orders_consistency_scenarios.py` (PASSED).
- Report: `memory/carts-consistency-audit.md`.

## 2026-07-18 — Carts: assigned orders SSOT + admin UI

- SSOT: `list_orders_on_cart` for admin, WMS stats, Capacity Engine (BULK), lifecycle, WMS entry count.
- Admin expand: `AssignedOrdersSection` (number/status/items/volume/open + stub detach).
- Activity Log: `order_numbers` on assign/detach/timeout/admin release/start-finish-cancel picking.
- Capacity UI: single strip (collapsed card only).
- Report: `memory/cart-orders-ssot-report.md`.

## 2026-07-18 — Database Schema Health Check

- Tool: `python -m backend.scripts.schema_health_check` (+ `memory/schema-health-check.md`).
- PG allowlist: `ensure_wms_audit_tables`, packing automation, order WMS timeline, picks, carts code, esp scan.
- `ensure_wms_audit_tables` dialect-safe for PostgreSQL; capacity legacy DROP hardened.
- Local SQLite heal: carts capacity/lifecycle columns + `activity_event_links`; KRYTYCZNE focus → 0.

## 2026-07-18 — Event Log: retire legacy `event_type`

- Root cause 500 admin-release: PG `cart_lifecycle_events.event_type NOT NULL` while ORM/writers use only `event_code`.
- `ensure_cart_lifecycle_events_table`: backfill `event_code` ← `event_type`, then `DROP COLUMN event_type` (+ commit so DDL sticks).
- Idempotent: live column check (`PRAGMA` / `information_schema`), 2nd/3rd run = no-op.
- Audit: 0 consumer/runtime refs to `event_type` for cart Event Log; SSOT = `event_code`.
- Regression: `backend/tests/test_cart_lifecycle_event_type_migration.py` (incl. 3× ensure).

## 2026-07-18 — WMS stabilization health check (critical fixes)

- Fix: duplicate ORM index `ix_activity_events_category` crashed `create_all` on boot.
- Fix: activity log indexes always `CREATE INDEX IF NOT EXISTS` (even if table pre-existed).
- Fix: PostgreSQL allowlist runs cart lifecycle / capacity / cartstatus ensures (was SQLite-only no-op).

## 2026-07-18 — Admin force-release cart (OMS)

- `admin_release_cart` w CartLifecycleService (ASSIGNED/PICKING; blokada READY/PACKING).
- API `POST /carts/{id}/admin-release/` + perm `warehouse.carts.admin_release`.
- FE: `AdminReleaseCartButton` + modal potwierdzenia w `CartFleetDetailPanel`.
- Eventy: `admin_cart_released` / `admin_orders_detached` / `admin_picking_cancelled`.

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

## 2026-07-29 — Agent 1.5.0 release process + E2E print

- Auto versioning: VERSION + Directory.Build.props + publish-release bump; clean-reinstall-admin.ps1
- Installed 1.5.0 on E-HANDEL; shortcut Sasist Agent on desktop
- E2E ERP batch 9: Pobierz PDF, Drukuj przez przeglądarkę (blob open bez noopener), Stanowisko 1 job 18 PDFium→GDI
- Fix route order: /agents/self/test-page before {agent_id}
- Update metadata: ignore legacy SasistPrinterAgent-Setup; default release 1.5.0

## 2026-07-29 — Template usage impact report

- Replaced small Użycia modal with right drawer + full usage report
- Backend usage endpoint returns summary counts and sectioned entries with erp_link deep links
- Editor Przypisania/Użycia tab shows the same report body
