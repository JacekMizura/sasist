## 2026-08-13 — Fix: bom_preview name/sku w RMZ (odzysk komponentów KROK 3)

- `_rmz_line_to_read` przekazuje `component_name` / `component_sku` z `bom_preview_for_product` (wcześniej drop)
- FE: nazwa + SKU meta; fallback „Komponent #ID” tylko awaryjnie
- Test: `test_bom_preview_includes_component_name_and_sku`; returns 53 passed

## 2026-08-13 — FE+API wiring: manufactured component recovery

- API serialize + split/finalize apply; bundle precedence; return-level recovery mode
- Settings panel „Produkty produkowane”; WmsReturns intake panel + payload
- Tests returns/ 52 passed

## 2026-08-13 — Backend: odzysk komponentów z FG przy zwrocie (Z-PZ)

- Settings: `manufactured_component_recovery_mode` / `manufactured_recovery_receipt_mode` / `manufactured_recovery_location_id`
- RMZLine: `stock_intake_mode`, `fg_intake_qty`, `disassembly_qty` + tabela `rmz_line_component_recoveries`
- Service `manufactured_component_recovery_service` + wiring Z-PZ (`rmz_return_receipt_service`); scrap = audit only
- API: returns-mode PUT + line read/split-process/finalize payload
- Testy: `backend/tests/returns/test_manufactured_component_recovery.py` (24 passed)

## 2026-08-13 — Fix: completed MO ORDERS nie wiszą jako „Gotowe do pakowania”

- Root cause: FE traktował `completed` + `source_fulfilled_order_count>0` jako READY_TO_PACK (fulfilled = FG, nie packing)
- BE: `source_awaiting_packing_order_count` w serialize MO; helper `order_awaits_packing_after_orders_production` (DONE/Spakowane/SHIPPED/PACKED → false)
- FE: operational state + aktywna lista + CTA packing tylko przy awaiting > 0
- Testy A–D w `productionOperationalState.test.ts` + `test_orders_mo_awaiting_packing_projection.py`; FE build OK

## 2026-08-13 — Fix: FOR UPDATE + joinedload blokuje MO ORDERS (UAT #1092)

- Root cause: `_find_aggregable_mo` / withdraw / `_find_aggregable_planning_mo` — `joinedload` + `with_for_update` → PG `FeatureNotSupported` (LEFT OUTER JOIN)
- Fix: SELECT MO z `FOR UPDATE` bez eager join; `line_snapshots` / `order_sources` przez `selectinload` po locku
- Soft-fail savepoint zostawiał status Produkcja bez MO — po deploy re-entry Nowe→Produkcja lub ponowny trigger na #1092
- Testy: `test_find_aggregable_mo_for_update_without_outer_join`, `test_uat_qty1_status_production_creates_exactly_one_orders_mo`; 69 passed (trigger + material + sources + replenishment)

## 2026-08-13 — Fix UAT3: production status hook savepoint + orphan shipping FK

- Root cause PATCH ui-status 500: NO_BOM → shortage status UPDATE hit orphan `orders.shipping_method_id` FK → session PendingRollbackError (hook bez savepoint)
- Soft-fail: `_run_production_status_hook` = `begin_nested` jak smart-matching; trigger re-raise po logu (savepoint rollback)
- Sanitize orphan shipping FK przed mutacją statusu + przed move-to-shortage; `_log_order` nie czyta expired attrs po flush fail
- Testy: IntegrityError w hooku nie truuje commit; NO_BOM → shortage bez 500; sanitize orphan
- UAT #1158: `shipping_method_id` już NULL (label DHL); produkt 350 **bez** aktywnego manufacturing BOM → osobny blocker UAT

## 2026-08-13 — Fix: martwy „Zobacz szczegóły” na zakończonym BAT/MO

- Przyczyna: na detailu completed CTA `view_details` wskazywało ten sam URL → Link noop
- Fix: `isOnEntityDetailPage` (pathname === detail href) → `primaryAction.kind=none`; poza detailem href BAT vs MO poprawny
- ORDERS READY_TO_PACK bez zmian; testy `productionOperationalState.test.ts` (22)

## 2026-08-13 — ProductionBatch: jedno PW dla całej partii (multi-FG)

- Root cause: `create_batch_pw_documents_for_putaway` tworzył osobny PW w pętli po produktach końcowych
- Fix: jeden nagłówek PW (`production_batch_id`) + N pozycji; wszystkie `ProductionBatchLine.pw_stock_document_id` → ten sam dokument
- Idempotencja: ponowne wywołanie nie tworzy drugiego PW / nie duplikuje pozycji; legacy multi-PW bez migracji
- Putaway standardowy (per pozycja); BAT `completed` dopiero gdy PW DONE
- FE: Dokumenty deduplikują PW; „Do rozlokowania pozostało N produktów” liczy produkty
- Testy: `test_production_batch_single_pw.py` (1 PW, 2 linie, partial putaway, idempotencja)

## 2026-08-13 — WMS collection multi-location + discrepancy

- Pobranie per lokalizacja (`pick_events`); `collected_qty` = suma; GOTOWE dopiero przy sumie ≥ required
- Ilość edytowalna: default min(remaining, stan lokalizacji); discrepancy = suggested − confirmed (+ write-down ghost stock)
- Brak pokrycia remaining → `pending_shortage` + modal WMS (inna lokalizacja / zgłoś brak / wróć)
- finish-collecting: RW z sumy lokalizacji / slices; brak double-consume
- Testy: `test_production_collection_multi_location.py` A–E + report shortage

## 2026-08-13 — Fix: WMS collection confirm commits stock; finish-collecting no re-pick

- Root cause: confirm only wrote `collection_state_json`; finish re-validated/consumed against live inventory → 409 „wymagane 28 / dostępne 24” after UI GOTOWE
- WMS confirm → `collection_pick_commit_service` consumes inventory + stores `picked_slices`; finish posts RW from slices (no second consume)
- Legacy JSON-only GOTOWE healed on GET collection (not shown as done); ERP paper path unchanged (reserve + consume on finish)
- FE: production mutation 4xx → WmsMessageModal (not toast); toast kept for successes
- Tests: `test_production_batch_finish_collecting_multi_fg.py` (committed pick + inventory drift; reject insufficient on confirm)

## 2026-08-13 — UAT Produkcja: ryzyka A/C/D (lista packing, braki, release copy)

- Lista: completed ORDERS z fulfilled > 0 zostaje jako READY_TO_PACK; MANUAL/PLANNING completed ukryte
- Braki: `shortageHintFromOrderLines` → „Brakuje N szt. — Nazwa + M kolejnych” (lines API, bez nowego BE)
- Planned: przed release „Przekaż do realizacji” / po release „Pobierz komponenty”; collecting bez zmian
- E zweryfikowane (bez fix): brak FK BAT↔MO; UI merge dashboard batches + list MO może pokazać obie niezależne encje
- Testy: `productionOperationalState.test.ts` (18); FE build OK

## 2026-08-13 — UX pass Produkcja: jedna główna akcja „Co dalej?”

- SSOT `productionNextAction.ts`: status → komunikat + jedno CTA; druk/anuluj/papier w menu „…”
- Pulpit: „Wymaga Twojej uwagi” + „Produkcja w toku” na górze; KPI/aktywność niżej
- Lista/detail MO + batch: bez konkurujących „Wydaj do WMS” / „Rozpocznij produkcję”
- Nawigacja: Materiały = Braki | Rezerwacje | Analiza (`/production/materials/*` + redirecty)
- Język: Na zamówienia / Na magazyn / Terminal WMS; timeline z Wykonane / Aktualny / Następny
- Testy: `productionNextAction.test.ts`; FE build OK

## 2026-08-13 — Faza 9: realne automatyczne uzupełnianie zapasu

- Wspólna pętla `operational_workers_loop` (daemon thread w procesie Railway) + worker produkcji
- `stock_replenishment_interval` + `last_replenishment_run_at` w `production_forecast_json`
- Job → `run_production_stock_replenishment` (ORDERS retry/soft-hold przed PLANNING); unique index PLANNING
- UI: kafelki przeliczania; info na planowaniu; testy `test_auto_stock_replenishment.py`

## 2026-08-13 — Faza 8: automatyczne wznawianie shortage po dostępności komponentów

- `availability_retry_service.on_component_availability_increased` + wspólny `retry_order_driven_production_shortages(component_product_ids=…)`
- Eventy: release reservation (coalesce), PZ dock ATP, putaway, korekta +, cancel MO (po `cancelled`, bez pętli ALL_SHORTAGE)
- Kandydaci przez BOM snapshot; partial/priority bez nowego sortu; status przez SSOT `apply_order_panel_ui_status`
- Testy: `test_production_shortage_availability_retry.py`

## 2026-08-13 — Pipeline free-stock + fulfilled re-entry + soft-hold

- `pipeline_service`: order-driven vs free-stock; `stock_replenishment_needed` używa tylko free-stock pipeline
- Trigger: `RESULT_ALREADY_FULFILLED`; outstanding = qty − sum(fulfilled); cancelled/shortage bez regresji
- Soft-hold: `component_soft_hold_qty(need − reserved)`; PLANNING nie zjada hold mapy

## 2026-08-13 — Krytyczne regresje UX produkcji (audyt B.1/B.2/C.1)

- Terminal: `formatProductionMutationError` + `withMutationLock` (ref); catch na progress/finish collecting/finish
- ORDERS finish: `ordersMoSkipsPutaway(source_type)` → toast bufora, bez `/putaway`
- API: `source_reserved_quantity_total` / `source_shortage_quantity_total`; UI nie miesza count zamówień ze sztukami

## 2026-08-12 — UX produkcji i planowania

- Lista MO: źródło / WMS|Wydruk / gotowość materiałów / progress X/Y; bez enumów ORDERS/PLANNING
- Detail MO: sekcje Produkt, Komponenty, Zamówienia, Dokumenty, Historia; PRINT „Produkcja rozpoczęta”
- Planowanie: Stan/Sprzedaż/Cel/pipeline; Przelicz zapotrzebowanie vs Utwórz zlecenia; coverage kafelki
- Konfigurator zbierania: sekcja Tryb produkcji + (i) + walidacja bufora; terminal tabs Pobierz komponenty

## 2026-08-12 — Nadprodukcja / uzupełnianie zapasu (faza 7)

- Ustawienia: `auto_stock_replenishment` + `stock_replenishment_coverage_days` ∈ {1,3,7,14} w `production_forecast_json`
- `run_production_stock_replenishment` → MO `source_type=PLANNING` (agregacja draft/planned; bez FG buffer ORDERS)
- ORDERS materials first (rezerwacje + soft-hold); min/max stock respektowane; UI badge Zamówienia / Uzupełnienie
- Endpoint `POST /production/planning/stock-replenishment/run`; testy `test_stock_replenishment.py`

## 2026-08-12 — Produkcja → pakowanie (faza 6)

- fter_production_action STATUS_ONLY|OPEN_PACKING; walidacja status_after (unikalność, ≠ source/picking)
- Fulfill: READY_TO_PACK + CARTLESS; packing_handoff w progress; FE toast/auto-open; badge Z produkcji
- Pack finish: zużycie stocku bufora; bez nowego modułu pakowania / kuriera
## 2026-08-12 â€” Realizacja produkcji przez wydruk zlecenia (faza 5)

- `picking_config.production_execution_method` WMS|PRINT (per status produkcyjny)
- Preview PDF bez skutkĂłw magazynowych; `start-print-execution` â†’ lock + RW (idempotent)
- PDF: alokacje lokalizacji, zamĂłwienia ĹşrĂłdĹ‚owe + pĹ‚omieĹ„, kod MO; resolve-scan + skaner terminala
- UI: badge Wydruk / Terminal WMS; PodglÄ…d vs Wydrukuj i rozpocznij + modal RW

## 2026-08-12 â€” Produkcja z buforem i pakowaniem (faza 4)

- Progress: alokacja sztuk do source (priority) + status_after przez SSOT; ORDERS PW na lokalizacjÄ™ buforowÄ… (putaway DONE)
- Finish ORDERS â†’ `completed` bez kolejki Rozlokowanie; packing widzi stock bufora + production fulfilled qty
- UI detail/lista: wyprodukowano / gotowe / oczekujÄ…ce / braki

## 2026-08-12 â€” Rezerwacje i braki w produkcji z zamĂłwieĹ„ (faza 3)

- Walidacja materiaĹ‚owa po attach: `analyze_composition_quantity` â†’ max producible + podziaĹ‚ source (priority/oldest)
- Rezerwacje przez istniejÄ…cy `create_production_order_reservations`; shortage â†’ status brakĂłw
- `retry_order_driven_production_shortages`; UI counts reserved/shortage w detail MO
- Bez statusu po produkcji / PW bufora / pakowania (kolejna faza)

## 2026-08-12 â€” Automatyczne zlecenia produkcji z zamĂłwieĹ„ (faza 2)

- Trigger SSOT po zmianie statusu panelu â†’ create/aggregate MO `ORDERS` (idempotent source items)
- Agregacja tylko `draft`/`planned` + ta sama composition i `picking_config_id`; wycofanie przed startem
- Partial unique indexes + advisory lock; testy `test_production_order_trigger.py`
- Bez rezerwacji materiaĹ‚Ăłw / statusu po produkcji (faza 3)

## 2026-08-12 â€” Fundament produkcji z zamĂłwieĹ„ (faza 1)

- `ProductionOrder.source_type` (MANUAL|PLANNING|ORDERS) + tabela `production_order_source_items`
- Konfigurator zbierania: `is_production_mode` + statusy po produkcji / brakach + lokalizacja buforowa
- Helper aktywnej composition manufacturing; UI badge â€žZ zamĂłwieĹ„â€ť + sekcja ĹşrĂłdeĹ‚ w detail MO
- Bez auto-MO, bez zmian lifecycle RW/PW/collecting

## 2026-08-11 â€” Walidacja zbierania (skany / lokalizacje / EAN)

- UI: Terminal â†’ â€žWalidacja zbieraniaâ€ť; â€žProdukty bez kodu EANâ€ť + tooltips
- WspĂłlny resolver FE/BE; `location_scan_confirmed` + `allow_products_without_ean`
- Egzekwowanie na quick-pick / cartless / confirm-remaining; rezerwa bez auto-poboru

## 2026-08-11 â€” Widok listy zbierania (ustawienia â†’ kafelki)

- `list_display_json` na `wms_picking_terminal_settings` + API `list_display`
- Lista produktĂłw czyta flagi i ukrywa zdjÄ™cie/EAN/SKU/nr kat./stan/lokalizacjÄ™
- Copy Ustawienia WMS â†’ Zbieranie â†’ Widok: â€žLista zbieraniaâ€ť bez zbÄ™dnych opisĂłw

## 2026-08-11 â€” Konfiguracja â€žWszystkie zamĂłwieniaâ€ť w zbieraniu

- Osobne `all_mode` / `all_order_sort` / `max_all_orders` (nullable; runtime default bez kopii single/multi)
- UI: trzeci blok + kolumna â€žWszystkieâ€ť; metody = intersection (bulk/scanned/baskets)
- Flow: wybĂłr `all` uĹĽywa wyĹ‚Ä…cznie configu `all` (cart + sort)

## 2026-08-11 â€” Ekran iloĹ›ci zbierania 1:1 (belka + bez ILOĹšÄ†)

- `PickingQtyPanel`: [â†]+belka lokalizacji (h-10), zdjÄ™cieâ†’nazwaâ†’EANâ†’â’/+â†’ZatwierdĹş
- UsuniÄ™ty label â€žILOĹšÄ†â€ť; EAN bez prefiksu â€žEAN:â€ť; lokalizacja tylko w belce
- Label lokalizacji: `manualLocId ?? activeLocationId ??` single-loc auto

## 2026-08-11 â€” Napraw Ĺ‚adowanie fontu Inter

- UsuniÄ™ty `@import` Google Fonts z `index.css` (404 na fonts.gstatic.com/*.woff2)
- Inter 400/500/600/700 z `@fontsource/inter` (self-hosted w bundle)
- `font-family: Inter` + Tailwind `sans` bez zmian rozmiarĂłw WMS

## 2026-08-11 â€” Lokalizacja ĹşrĂłdĹ‚owa w widoku iloĹ›ci zbierania

- Tylko `PickingQtyPanel`: belka `[â†] [lokalizacja]` u gĂłry (peĹ‚na szerokoĹ›Ä‡)
- Label z `manualLocId ?? activeLocationId` (kontekst pobrania), nie `locations[0]`
- Lokalizacja nie w kafelku produktu; â† wraca do detail bez anulowania sesji

## 2026-08-11 â€” PrzywrĂłÄ‡ wybĂłr rodzaju zamĂłwieĹ„ przed zbieraniem

- Nowa tura zawsze: status â†’ order-type â†’ (cart) â†’ products
- UsuniÄ™te pomijanie order-type przez cartId / require_cart / domyĹ›lne `all`
- Wznowienie tylko z jawnym order_type + cart/cartless
- Karty: â€žProdukty do zebraniaâ€ť / â€žProdukty: zebrano X / Yâ€ť

## 2026-08-11 â€” Napraw flow szczegĂłĹ‚Ăłw produktu i autoryzacjÄ™ zbierania

- UsuniÄ™ty auto-open qty (regresja z 97b1271f); detail obowiÄ…zkowy
- PrzywrĂłcone: Zebrane, lokalizacja na kafelku, sekcja ZamĂłwienia + BRAK badge
- Qty â† wraca do detail; skan produktu/lokalizacji â†’ qty (nie auto-confirm)
- 401: shared axios paths; POST picking-terminal z auth; bez maskowania bĹ‚Ä™dĂłw auth

## 2026-08-11 â€” KolejnoĹ›Ä‡ dostaw: CTA z rzeczywistego workflow PZ

- Membership przez `derive_warehouse_workflow_status` (P2.5A), nie â€žâ‰  CLOSEDâ€ť
- W kolejce: NEW, COUNTING, COUNTED, PUTAWAY_IN_PROGRESS
- Poza: PUTAWAY_COMPLETED, CLOSED (+ cancelled)
- CTA: Rozpocznij/Kontynuuj przyjÄ™cie | Rozpocznij/Kontynuuj rozlokowanie
- Sort tylko `delivery_queue_sort` (+ created_at); priority niezaleĹĽny od statusu/sortu

## 2026-08-11 â€” KolejnoĹ›Ä‡ dostaw: kolejka z otwartych PZ (nie Supply Flow)

- Root: ekran czytaĹ‚ `supply-flow/plan` / InboundDelivery; PZ NOWE nie byĹ‚y ĹşrĂłdĹ‚em kolejki
- Nowy SSOT: `GET /wms/delivery-work-queue` z PZ wymagajÄ…cych przyjÄ™cia/rozlokowania
- Persystencja: `stock_documents.delivery_queue_sort` + `delivery_queue_priority`
- FE KolejnoscDostawPage: lista PZ, priorytet, â†‘â†“ kolejnoĹ›Ä‡, CTA do receiving/putaway

## 2026-08-11 â€” Hierarchia lista vs produkt (lokalizacja + â†)

- Lista: lokalizacja tylko w kafelku (compact, prawy gĂłrny rĂłg) â€” nie belka/nagĹ‚Ăłwek
- Produkt/liczenie: lokalizacja tylko jako belka obok â† (`variant="bar"`)
- `PackingLocationPill.fullWidth` â€” lista bez `w-full` (nie rozciÄ…ga badgeâ€™a jak belka)
- â† z produktu/qty â†’ zawsze lista produktĂłw (z zachowaniem cartId)

## 2026-08-11 â€” Flow zbierania 1:1 (status â†’ rodzaj â†’ popup wĂłzka â†’ lista â†’ produkt)

- Status (UI bez zmian): klik bez sesji â†’ zawsze order-type (nie skan na statusach)
- Order-type: kafelki â€žLiczba produktĂłw zebranychâ€ť + `0/8`; po kliku â†’ cart lub produkty
- Cart: modal â€žZeskanuj wĂłzekâ€¦â€ť; wolny wĂłzek startuje sesjÄ™ (backend-first, bez faĹ‚szywego ACTIVE)
- Lista: `â† Do zebrania: X/Y`; EAN badge; lokalizacja; Zebrano/BRAK
- Produkt: belka lokalizacji + qty panel `[-][n][+]` + ZatwierdĹş; auto-open gdy 1 loc

## 2026-08-11 â€” UX statusĂłw + naprawa 409 skanu wolnego wĂłzka

- Root: orphan ASSIGNED bez sesji â†’ resolve-cart 409 + FE snapshot â€žmasz sesjÄ™â€ť
- BE heal orphan; active-session tylko przy otwartej sesji; resolve-cart code ACTIVE_PICKING_SESSION
- FE: skan backend-first; clearPickingCart bez sesji; empty state + hierarchia kart

## 2026-08-10 â€” SpĂłjny przepĹ‚yw zbierania (status â†’ sesja â†’ produkty â†’ cancel)

- UsuniÄ™ty in-card CTA i czerwony banner; centralny prompt + skaner SSOT
- Skan wĹ‚asnego wĂłzka otwiera/kontynuuje sesjÄ™ (bez â€žmasz juĹĽâ€¦â€ť, bez resolve-cart)
- BE: brak fallbacku sesji na obcy typ kafelka; FE merge active-session po typie
- Cancel: cart â†’ cancel-session; products/detail cichy skan wĹ‚asnego wĂłzka
- Meta: badge wĂłzka + Do zebrania; tile bez przycisku skanu

## 2026-08-10 â€” Prezentacja â€žZeskanuj wĂłzekâ€ť na statusach

- UsuniÄ™ty czerwony banner peĹ‚nej szerokoĹ›ci
- Po wyborze statusu wymagajÄ…cego wĂłzka: wyĹ›rodkowany lekki komunikat + przycisk (BULK vs BASKETS)
- Karty statusĂłw bez CTA skanu; logika assign/scan bez zmian

## 2026-08-10 â€” UporzÄ…dkuj obsĹ‚ugÄ™ aktywnych sesji zbierania

- Skan wĹ‚asnego wĂłzka na liĹ›cie statusĂłw â†’ otwiera sesjÄ™ (products), nie toast
- Progres produktĂłw tylko na karcie z mojÄ… sesjÄ…; CTA ukryte przy globalnej sesji wĂłzkowej
- Nazwa statusu 19px/bold; BE active-session + products_picked/total

## 2026-08-10 â€” Napraw sesje i skanowanie wĂłzkĂłw w zbieraniu

- Statusy: always-on scan handler; active-session SSOT; CTA niemoĹĽliwe przy aktywnej sesji
- Products: CART-* zawsze consumed (bez resolve-cart / consumed=false)
- BE: fallback bind sesji gdy source_status_id meta nie pasuje do kafelkĂłw

## 2026-08-10 â€” Napraw obsĹ‚ugÄ™ aktywnego wĂłzka w zbieraniu

- FE statusy: brak fallbacku skanu na obcy `expected_cart_type`; CTA tylko bez aktywnej sesji
- BE: SSOT `wms_picking_active_session` + pole `has_operator_active_session` / `session_source_status_id`
- Sesja przypisana tylko do swojego `source_status_id` â€” nie doklejaj wĂłzka do innych kafelkĂłw
- resolve-cart odrzuca skan gdy wĂłzek juĹĽ w sesji operatora; mixed modes â†’ BULK

## 2026-08-10 â€” Napraw spĂłjnoĹ›Ä‡ sesji zbierania

- Root cause: sesja wĂłzkowa ma `picking_session_id` + `cart_id`; FE traktowaĹ‚ to jak cartless
- Fix FE: `isCartlessPickingSession` / merge; cancel po cart_id; skan wĂłzka na products = consumed ignore
- Fix BE: product-lines remap sessionâ†’cart; cancel-cartlessâ†’cancel_picking; tile mixedâ†’BULK
- Projekcja Ĺ›cisĹ‚a po `source_status_id` z meta sesji

## 2026-08-10 â€” UspĂłjnij wznowienie sesji zbierania

- Skan wĂłzka = tylko start nowej sesji; aktywna sesja â†’ od razu lista produktĂłw
- BE: nie waliduj typu wĂłzka przy PICKING / ASSIGNED z otwartÄ… sesjÄ… (ĹşrĂłdĹ‚o â€žNiewĹ‚aĹ›ciwy wĂłzekâ€ť)
- FE: `resolveAfterStatusWithConfig` resume by `cartId`; cart-scan redirect; brak confirm-scan
- Status: CTA skanu tylko bez `active_cart_id`; po skanie start â†’ navigate products

## 2026-08-10 â€” UspĂłjnij sesjÄ™ zbierania i przypisanie wĂłzka

- BE: `wms_picking_session_projection` â€” produkty sesji jak na liĹ›cie produktĂłw (nie wolna kolejka)
- API statusĂłw: `session_products_picked/total`, `active_session_id`; hub order-type session-aware
- FE: karta statusu pokazuje produkty sesji; CTA skanu tylko bez aktywnej sesji/wĂłzka
- Skan: â€žPotwierdĹş przypisany wĂłzekâ€ť gdy sesja zna cartId; odrzut innego wĂłzka z PL msg
- Produkty: brak default-cart gdy tryb wymaga skanu; subtitle `WĂłzek: â€¦`
- Anulowanie: bez nowego silnika â€” `cancel_picking` + rollback Inventory lokalizacji

## 2026-08-10 â€” Badge uĹĽywanego wĂłzka na statusach zbierania

- Kafelki z trybem skanu / koszykĂłw: `WĂłzek: {nazwa|kod}` gdy operator ma przypisany wĂłzek
- API: `active_cart_code` / `active_cart_name` na `GET /wms/picking/configured-statuses`
- FE: fallback do snapshotu skanu; bez pustego badge

## 2026-07-24 â€” 5 poziomĂłw wielkoĹ›ci czcionki WMS (OgĂłlne)

- Dozwolone: 12 / 14 / 16 / 18 / 20 px; domyĹ›lna 16 (byĹ‚o 16|18|21, domyĹ›lna 18)
- BE + FE + panel â€žPrzywrĂłÄ‡ domyĹ›lneâ€ť; nieprawidĹ‚owe (np. 21) â†’ normalizacja do 16
- Bez nowego systemu ustawieĹ„ â€” ten sam SSOT `wms_general_settings`

## 2026-08-10 â€” Zbieranie: czysty biaĹ‚y UI (Sellasist layout, Sasist badges)

- Lista/detal: minimalistyczne karty, `Do zebrania: X/Y`, sticky â€žZebraneâ€ť + menu â‹® (Opcje)
- Badge lokalizacji = istniejÄ…cy `PackingLocationPill` (Sasist)
- Order-type + cart-scan uproszczone wizualnie; logika skanu/finalize bez zmian
- Kit UI: `frontend/src/components/wms/picking/Picking*`

## 2026-08-10 â€” Ustawienia WMS â€žOgĂłlneâ€ť: wielkoĹ›Ä‡ czcionki

- Nowa zakĹ‚adka â€žOgĂłlneâ€ť (wspĂłĹ‚dzielone ustawienia trybĂłw)
- Trzy selecty 16/18/21 px: bazowa, lokalizacja, iloĹ›Ä‡ (domyĹ›lnie 18)
- Persist: `wms_general_settings` + `/wms/settings/general`
- Operator shell: CSS vars `--wms-font-*`; packing/picking nowe widoki przez `wmsTypoClass`
- Bez osobnych ustawieĹ„ mobile i bez auto-zmniejszania czcionki na kolektorze

## 2026-08-10 â€” Start zbierania: ekran â€žWybierzâ€ť + skan wg konfiguracji

- Po statusie zawsze `/picking/order-type` (kafelki single/multi/all wg trybĂłw konfiguracji)
- â€žWszystkieâ€ť tylko gdy obie Ĺ›cieĹĽki majÄ… tÄ™ samÄ… bramkÄ™ skanu wĂłzka
- `GET /wms/picking/order-type-hub` â€” zamĂłwienia + produkty X/Y per typ
- Po wyborze: skan wĂłzka / cartless / default-cart wg `single_mode`/`multi_mode`

## 2026-08-10 â€” Kafelki statusĂłw zbierania: Realizowane przez innych/Ciebie

- `GET /wms/picking/configured-statuses`: `order_count` + `in_progress_by_me` + `in_progress_by_others`
- SSOT: wolne (`cart_id`+`picking_session_id` NULL); aktywne = wĂłzek PICKING / otwarta sesja cartless
- FE: `WmsFlowStatusTileButton` work + `showRealizationCounts` (zera widoczne)

## 2026-08-10 â€” Terminal zbierania end-to-end + kompaktowe â€žWykorzystane statusyâ€ť

- Badgeâ€™e wykorzystanych statusĂłw: kompaktowe `h-9` / `w-fit` (bez rozciÄ…gania)
- Ustawienia Terminal: SSOT `wms_picking_terminal_settings` + GET/POST `/wms/settings/picking-terminal`
- Egzekwowanie w quick-pick / cartless / confirm-remaining: skan produktu, lokalizacji (FE policy), rezerwy
- Tooltipy â€žiâ€ť przy opcjach; komunikaty operatora w katalogu skanĂłw (PL)

## 2026-08-09 â€” Konfigurator zbierania: wybĂłr i filtr statusĂłw

- Przyczyna: `OrderUiStatusField` portal `z-[130]` pod modalem `z-[5000]` â€” lista nieklikalna
- Fix: `floatingZIndexClass` + Escape nie zamyka modala gdy picker otwarty
- Eligibility: ĹşrĂłdĹ‚o = aktywne NEW/IN_PROGRESS (bez zajÄ™tych ĹşrĂłdeĹ‚); cel = aktywne IN_PROGRESS + starty pakowania z API
- Walidacja zapisu/edycji z komunikatami PL; helper `pickingConfigStatusEligibility.ts` + testy

## 2026-08-09 â€” Packing â€žAkcjaâ€ť activators execute real automation

- Extracted `frontend/src/utils/orderAutomationRun.ts` (visibility + execute + exclusive gate)
- Packing buttons call runner; success toast / red scanner error; busy spinner
- Tests: `orderAutomationRun.test.ts`
- Updated packing help for `show_automation_buttons`

## 2026-08-09 â€” Pakowanie: lista tylko ze skonfigurowanego statusu ĹşrĂłdĹ‚owego

- **Przyczyna:** `_packing_queue_status_ids` dokĹ‚adĹ‚o wszystkie IN_PROGRESS z â€žpakâ€ť/â€žpackâ€ť w nazwie; eligibility dopuszczaĹ‚o `READY_TO_PACK`/`PACKING` bez filtra `order_ui_status_id`
- **Fix:** kolejka = wyĹ‚Ä…cznie wybrany `status_id`; zawsze `order_ui_status_id IN (status_ids)`; liczniki FE rozĹ‚Ä…czne z tej samej listy; overlay zielony na w peĹ‚ni spakowanych kartach produktu
- Test: `test_packing_queue_single_source_status.py` + `ordersListStats.test.ts`

## 2026-08-09 â€” Packing finish #1249: otwarte zbieranie vs fake complete

- **Przyczyna 400:** 2Ă— Cat x3 niezebrane â†’ `has_recovery_work`; komunikat mylÄ…co o â€ždogrywceâ€ť; UI/`PACKING_FINISHED` mogĹ‚y udawaÄ‡ komplet po samych pickach
- **Fix:** `required_pack_qty` = min(after_shortage, picked); `lines_packed_complete` wymaga braku recovery/OMS/relocation; `picked_quantity_final` nie dopycha 0â†’fulfillable; czytelny komunikat PL
- Test: `test_order_1249_partial_pick_recovery_blocks_finish_and_fake_complete`

## 2026-08-09 â€” Pakowanie: kompaktowy wybĂłr opakowania

- Przebudowa `PackingCartonGateModal` (ten sam flow): biaĹ‚e tĹ‚o, kompaktowy nagĹ‚Ăłwek (szablon / tytuĹ‚ / wybrane), grid do 5 kolumn
- Karty: zdjÄ™cie, nazwa, wymiary, badge REKOM. (`is_best`), prawdziwy CODE128 (JsBarcode) z EAN/SKU/id
- Skan kodu = ten sam `onSelectCarton` co klik; `ScannerHandler` nie czyĹ›ci handlera przy `enabled=false`
- Backend (minimal): `barcode`/`ean` w `WmsPackingRecommendedCarton` + mapowanie w `_carton_row_to_recommended`

## 2026-08-09 â€” Zestaw STOCK: HTTP 500 przy tworzeniu zlecenia produkcyjnego

- **Przyczyna:** `production_orders.recipe_id` w DB = NOT NULL (legacy CREATE); BOM zestawu (`product_compositions`) nie ma `source_recipe_id` â†’ INSERT z `recipe_id=NULL` â†’ IntegrityError â†’ 500
- **Fix:** `ensure_production_orders_recipe_id_nullable` (PG DROP NOT NULL / SQLite rebuild); CREATE TABLE nullable; migracja schema `2026.08.09.1`
- Test: `test_bundle_stock_production_order.py` (Dezodorant x3 Ă— Coccine Ă— 3, qty=1)

## 2026-08-09 â€” Packing finish 404 (`mode=no_cart`) + bĹ‚Ä…d jako popup

- **Przyczyna 404:** `POST â€¦/finish` Ĺ‚adowaĹ‚ zamĂłwienie wyĹ‚Ä…cznie z aktywnej kolejki; po spakowaniu linii (detail poza kolejkÄ… / drift fulfillment / bĹ‚Ä™dne `no_cart` z listy `all`) â†’ `ORDER_NOT_IN_QUEUE` / HTTP 404.
- **Backend:** `_load_order_for_packing_finish` â€” fallback dla w peĹ‚ni spakowanych przy zgodnym trybie; polskie `message` w `PackingScanError`; skan EAN z `mode=all` + NULL handoff nie wymyĹ›la CARTLESS.
- **FE:** lista `all` nie forsowaĹ‚a `no_cart` bez wĂłzka/koszyka; bĹ‚Ä…d finish â†’ `WmsScanFeedbackOverlay` (czerwony popup); bez wielkiego czerwonego tekstu w panelu finalizacji; â€žPonĂłw finalizacjÄ™â€ť zostaje.
- Testy: `test_packing_finish_no_cart.py` + `packingHelpers` copy.

## 2026-08-09 â€” Pakowanie: lokalizacja + podglÄ…d aktywatorĂłw w ustawieniach

- Lokalizacja na karcie: tylko â€žPrawy gĂłrny rĂłgâ€ť (`top_right`) / â€žW szczegĂłĹ‚ach produktuâ€ť (`in_details`); legacy rogi â†’ `top_right`
- DziaĹ‚a w runtime (Default/Active/Done + `LineDetailsBlock`), nie tylko w config
- PodglÄ…dy w ustawieniach Widok: prawdziwe karty produktĂłw + belka aktywatorĂłw gĂłra/dĂłĹ‚
- UsuniÄ™to badge â€žBRAK FUNKCJONALNOĹšCIâ€ť; dodano â“ help dla obu ustawieĹ„

## 2026-08-09 â€” Metody dostawy: NS_BINDING_ABORTED (prawdziwa przyczyna)

- **Werdykt:** `ShippingMethodLogo` / wiersz listy byĹ‚ **odmontowywany** (nie â€žzepsute plikiâ€ť).
- **DEV:** `React.StrictMode` w `main.tsx` remountowaĹ‚ kaĹĽdy komponent przy pierwszym mountcie â†’ `<img src="/uploads/...">` odĹ‚Ä…czany mid-flight â†’ Firefox `NS_BINDING_ABORTED` (czÄ™Ĺ›Ä‡ zdÄ…ĹĽyĹ‚a 200).
- **WtĂłrne:** `onError` po abortcie + globalny `failedCustomLogoKeys` zmieniaĹ‚ `src` customâ†’heuristic (kolejne aborty); `useEffect([load])` bez cleanup â†’ podwĂłjny fetch/`setRows`.
- **Fix:** bez StrictMode; load z `cancelled` cleanup; `mergeShippingMethodsRows` (bail-out ref); `onError` tylko gdy mounted; brak module cache fail; stabilne `key={id}` + memo row.
- Test: `shippingMethodLogoUrl.test.ts` (lifecycle remount regression).

## 2026-08-09 â€” Pakowanie: chrome UI (ikona pack-all, sztuki, badge)

- â€žSpakuj wszystkoâ€ť â†’ `PackingPackAllIconButton` (PackageCheck)
- Przy #order: `packed_quantity/total_quantity` (sztuki), nie queue_index
- WĂłzek/Koszyk: `PackingCartBasketBadges` (Icon cart/basket + mono)
- Lokalizacja: `(97)` zamiast `(x97)`; EAN done: biaĹ‚y badge + ciemny tekst

## 2026-08-09 â€” Metody dostawy: pÄ™tla requestĂłw logo

- Przyczyna: `onError` ustawiaĹ‚ `failedSrc` na SVG; potem `preferred` (custom `/uploads`) â‰  `failedSrc` â†’ znowu custom â†’ nieskoĹ„czona pÄ™tla + NS_BINDING_ABORTED/ORB
- Fix: jednokierunkowy `pickShippingMethodLogoSrc` (custom â†’ heuristic â†’ none); flagi `customFailed`/`heuristicFailed`; bez `key={src}`
- Test: `shippingMethodLogoUrl.test.ts` (5 passed)

## 2026-08-09 â€” Metody dostawy: znikajÄ…ce logo

- Przyczyna (nie save wipe): `logo_url` w DB zostaje; pliki `/uploads` ginÄ… (efemeryczny dysk Railway) â†’ 404/ORB; custom URL blokowaĹ‚ heurystykÄ™ SVG
- `NS_BINDING_ABORTED` = anulowane requesty przy rerenderze, nie root cause
- Fix: PUT `model_fields_set` (omit=zachowaj); FE nie wysyĹ‚a `logo_url` bez zmiany; `onError` â†’ carrier SVG; testy `test_shipping_method_logo_persist.py`
- Brak GC â€žnieuĹĽywanychâ€ť uploadĂłw dla logo metod; `clear_dev_artifacts` czyĹ›ci caĹ‚y katalog uploads (dev)

## 2026-08-09 â€” Packing finish 400: int(UUID) serii RW

- Objaw: `POST â€¦/finish` â†’ 400 `invalid literal for int()â€¦ 'd26516c5-â€¦'`
- Przyczyna: `create_packing_packaging_rw` robiĹ‚o `document_series_id=int(series.id)` przy `DocumentSeries.id` = UUID (`String(36)`)
- Fix: `str(series.id)`; cart_id=3 nie byĹ‚ winny â€” UUID to seria dokumentĂłw RW

## 2026-08-09 â€” Finish pakowania: brak stanu opakowaĹ„ nie blokuje

- Pipeline: `create_packing_packaging_rw(..., allow_negative=True)` + soft-fail bez `raise`
- OstrzeĹĽenie log `PACKING_PACKAGING_RW_STOCK_SHORTAGE`; status/dokumenty idÄ… dalej
- FE finalizacja: â€žâ† PowrĂłt do zamĂłwieniaâ€ť + â€žâ† Lista zamĂłwieĹ„â€ť
- Regresja: `test_packing_finish_packaging_stock.py`

## 2026-08-09 â€” /wms/packing: GLOBAL_SCAN handler (wĂłzek/koszyk)

- Przyczyna: `WmsPackingStatusPage` rejestrowaĹ‚ `registerScanHandler(null)` â†’ `GLOBAL_SCAN_NO_HANDLER`
- Fix: ten sam wzorzec co inne strony WMS â€” handler â†’ `resolvePackingHandoffScan` + `applyPackingHandoffScanResult` (preferowany status Pakowanie)
- WejĹ›cie bez skanu: kafelki statusĂłw â†’ lista `mode=all` (bez forced scan UI)

## 2026-08-09 â€” Packing finish 400: UUID serii RW â†’ int()

- Przyczyna: `create_packing_packaging_rw` robiĹ‚o `document_series_id=int(series.id)`; `document_series.id` i `stock_documents.document_series_id` to String(36) UUID
- Objaw: HTTP 400 `invalid literal for int() with base 10: 'd26516c5-â€¦'` przy `POST â€¦/packing/orders/{id}/finish`
- Fix: przekazywaÄ‡ `str(series.id)`; regresja `test_packing_packaging_rw_series_uuid.py`
- `cart_id` (int) byĹ‚ poprawny â€” UUID to seria dokumentĂłw RW magazynu, nie wĂłzek

## 2026-08-09 â€” Pakowanie: skan wĂłzka jako lookup na liĹ›cie (nie osobny etap)

- Wycofano forced UI â€žSkanuj wĂłzek / koszykâ€ť ze statusu / trybu
- WejĹ›cie w status â†’ `mode=all` â†’ normalna lista zamĂłwieĹ„ (niezaleĹĽnie od konfiguracji zbierania)
- Globalny skaner na liĹ›cie: `resolvePackingHandoffScan` (wĂłzek / MULTI / koszyk) â†’ filtr lub otwarcie zamĂłwienia
- Backend: `mode=all` w scope kolejki + inferencja handoff przy resolve-ean/scan
- UsuniÄ™to `PackingHandoffScanModal`

## 2026-08-09 â€” Pakowanie: skan wĂłzka/koszyka ze statusu Pakowanie (WYCOFANE)

- Pierwsza wersja z CTA / osobnym etapem skanu â€” bĹ‚Ä™dny kierunek; zastÄ…pione powyĹĽszym

## 2026-08-09 â€” WyczyĹ›Ä‡ wĂłzek: peĹ‚ny reset takĹĽe w PACKING

- Przyczyna: `CartService.clear_cart` â†’ `admin_release_cart` (celowo blokuje PACKING z custody) + 500 bez mapowania + FE `code=null` â†’ â€žNIEZNANY KODâ€ť
- Fix: `force_clear_cart` (SSOT) dla ASSIGNED/PICKING/READY/PACKING; `admin_release` bez zmian; clear â†’ 409 + WmsUserMessage; FE `showWmsError` + katalog kodĂłw

## 2026-08-09 â€” Magazyn â†’ WĂłzki: scroll strony po rozwiniÄ™ciu wĂłzka

- Przyczyna: `CartsModuleLayout` zawsze `fillHeight` â†’ `PageContainer` `h-full` + `overflow-hidden` ucinaĹ‚ treĹ›Ä‡
- Fix: `fillHeight` tylko dla edytora/podglÄ…du `/carts/racks/...`; flota scrolluje w `<main>`
- Accordion detail: `max-content` + `overflow-visible` gdy open (bez wewnÄ™trznego scrollera)

## 2026-08-09 â€” Ponowne wejĹ›cie do spakowanego zamĂłwienia (lista pakowania)

- Gate przy pierwszym wczytaniu detail: modal â€žjuĹĽ spakowaneâ€ť, linie Done, bez aktywnego produktu / AutoActions
- `POST /wms/packing/orders/{id}/acknowledge-reopen` â†’ `PACKING_REOPEN_ACKNOWLEDGED` (+ activity log)
- X zamyka bez logu; Accept zapisuje log; WrĂłÄ‡ â†’ lista
- Detail poza kolejkÄ… dla zamĂłwieĹ„ packed/finalized; `packed_by_label` w detail

## 2026-08-09 â€” PodglÄ…dy ukĹ‚adu/produktĂłw: realne karty + bez â€žâ€”â€ť

- `PackingLayoutModePreview`: prawdziwy sidebar + karty Default/Done (skala), nie szkielety
- WspĂłlne sample lines; brak wartoĹ›ci = ukryte pole w `LineDetailsBlock`
- Lokalizacja: ten sam `PackingLocationPill`; pusty badge niewidoczny

## 2026-08-09 â€” Ustawienia widoku: zwijane podglÄ…dy ukĹ‚adu

- WspĂłlny `PackingSettingsPreviewCollapse` (domyĹ›lnie zwiniÄ™ty)
- PodglÄ…dy: ukĹ‚ad (sidebar/peĹ‚na), komentarze, dokument sprzedaĹĽy, produkty Lista/Siatka
- Siatka kart: zdjÄ™cie wyĹ›rodkowane pod nagĹ‚Ăłwkiem (jak mockup)

## 2026-08-09 â€” Karty pakowania: mockup Siatka/Lista

- StaĹ‚e wymiary: siatka 20Ă—19.5rem; lista peĹ‚na szerokoĹ›Ä‡ + staĹ‚a wysokoĹ›Ä‡ wiersza
- Layout: zdjÄ™cie | dane | SPAKOWANO | LOKALIZACJA | â€¦ (lista); nagĹ‚Ăłwek + ciaĹ‚o (siatka)
- Done: pĂłĹ‚przezroczyste zielone tĹ‚o caĹ‚ej karty, grayscale zdjÄ™cia/danych, czytelny status/X
- EAN: delikatny badge; bez biaĹ‚ego tĹ‚a pod zdjÄ™ciem; bez â€ž1xâ€ť w nazwie

## 2026-08-09 â€” PodglÄ…d ukĹ‚adu produktĂłw (Lista/Siatka)

- `ProductDisplayModePreview`: staĹ‚a szerokoĹ›Ä‡ kart (`allowShrink: false` / `lockCardSize`), wrap zamiast Ĺ›ciskania
- `DefaultCard` lista: kolumny [zdjÄ™cie|nazwa+meta] | [SPAKOWANO|LOKALIZACJA|â€¦] â€” bez nachodzenia elementĂłw

## 2026-08-09 â€” Fix zmiany statusu zamĂłwienia (panel UI)

- Przyczyna: przy zamĂłwieniu na wĂłzku z zablokowanym detach (picki / READY_FOR_PACKING) `apply_order_panel_ui_status` rzucaĹ‚ 409 i rollbackowaĹ‚ zapis statusu
- Fix: `order_ui_status_id` zawsze zapisywany; detach tylko gdy dozwolony
- UI: toast przy bĹ‚Ä™dzie API; po sukcesie `reloadOrderById`; `build_order_read` czyta status z FK (nie stale relationship)
- Test: `test_panel_status_saves_when_detach_blocked_by_picks`

## 2026-08-09 â€” WyglÄ…d produktĂłw: Lista / Siatka

- `productDisplayMode` podpiÄ™ty do kart Active/Default/Done + siatki w PackingView
- Lista = karty poziome; Siatka = pionowe z duĹĽym zdjÄ™ciem; auto-fit na caĹ‚Ä… szerokoĹ›Ä‡
- PodglÄ…d w ustawieniach Widok (jak lista zamĂłwieĹ„); usuniÄ™te CAP_NONE

## 2026-08-09 â€” Fix full-width packing layout

- Osobna gaĹ‚Ä…Ĺş layoutu w `PackingView` (bez sidebara); pas info + opakowania na caĹ‚Ä… szerokoĹ›Ä‡
- Siatka produktĂłw: `auto-fit minmax(15.5rem, 1fr)` â€” karty wypeĹ‚niajÄ… rzÄ…d, bez pustej prawej kolumny
- Info: dokument, logo, wysyĹ‚ka, telefon/wartoĹ›Ä‡/adres, uwagi; opakowania `align=start`

## 2026-08-09 â€” Widok pakowania: telefon / wartoĹ›Ä‡ / adres

- Extended UI: `showOrderPhone`, `showOrderValue`, `showShippingAddress` (domyĹ›lnie ON)
- Sidebar + full-width: telefon i wartoĹ›Ä‡; adres w bloku kupujÄ…cego (dokument peĹ‚ny)
- Checkboxy + (i) w Widok; bez CAP_NONE

## 2026-08-09 â€” Widok pakowania: ukĹ‚ad + kolejnoĹ›Ä‡ spakowanych

- Ustawienie ukĹ‚adu: `Z sidebarem` / `PeĹ‚na szerokoĹ›Ä‡` (zamiast PeĹ‚na szerokoĹ›Ä‡ / WyĹ›rodkowany)
- Full-width: ten sam `PackingView`, bez sidebara, pas info + siatka na caĹ‚Ä… szerokoĹ›Ä‡
- `movePackedToBottom` faktycznie sortuje linie; usuniÄ™te CAP_NONE + teksty â€žbrak funkcjonalnoĹ›ciâ€ť
- Info (i) dla obu opcji; `npm run build` OK

## 2026-08-09 â€” Lista zamĂłwieĹ„: korekta layoutu (3 warianty)

- UsuniÄ™te szare tĹ‚o za zdjÄ™ciami produktĂłw
- NagĹ‚Ăłwek karty zwarty (flex w-max): nr | SPAKOWANO | logo â€” bez space-between / 1fr
- Standardowy: staĹ‚a szerokoĹ›Ä‡ karty (~280px) + flex-wrap zamiast rozciÄ…ganego gridu
- `npm run build` OK; bez commit/push

## 2026-08-09 â€” Lista zamĂłwieĹ„: Rozbudowany (Pionowy)

- `expanded_vertical` â†’ UI â€žRozbudowany (Pionowy)â€ť; biaĹ‚e tĹ‚o; karty full-width jedna pod drugÄ…
- NagĹ‚Ăłwek karty: NR | SPAKOWANO | logo; produkty w poziomie z separatorami; `+N innych`
- Spakowane: wyszarzenie + âś“ + X; podglÄ…d w ustawieniach; `npm run build` OK; bez commit/push

## 2026-08-09 â€” Lista zamĂłwieĹ„: Rozbudowany (Poziomy)

- Opcja `cards` â†’ UI â€žRozbudowany (Poziomy)â€ť (rename z Karty); wartoĹ›Ä‡ `cards` bez zmian
- Poziomy scroll: karty ~300px z produktami (miniatura, qtyĂ—nazwa, EAN, kolor), logo po prawej SPAKOWANO
- Stany: czerwona ramka + badge Brak; linia Spakowane âś“/X; karta zakoĹ„czona opacity; +N innych
- PeĹ‚ny podglÄ…d w ustawieniach Widok; `npm run build` OK; bez commit/push

## 2026-08-09 â€” Lista zamĂłwieĹ„ pakowania: ukĹ‚ad Standardowy

- `ordersListLayout: compact` â†’ UI â€žStandardowyâ€ť (rename z Kompaktowy); wartoĹ›Ä‡ `compact` bez zmian
- Siatka 4 kart/rzÄ…d; karta 3 kolumny: nr+Fa+klient | SPAKOWANO | logo przewoĹşnika (bez wrap logo pod licznik)
- Stan spakowany: âś“ + Spakowane n/n, czerwony X, wyszarzenie; nagĹ‚Ăłwek jak referencja Sellasist
- PodglÄ…d ukĹ‚adu w ustawieniach Widok; `npm run build` OK; bez commit/push

## 2026-08-08 â€” Smart Matching (WMS settings + learning)

- TrwaĹ‚e ustawienia (enable, prĂłg 2/3/5, status inicjujÄ…cy, multi auto-label) zamiast localStorage
- Nauka z historii pakowania â†’ reguĹ‚y auto; przerwane serie; reset tylko reguĹ‚ auto
- Hook finish + zmiana statusu panelu; propozycje w pakowaniu (ten sam model kartonu)
- UI Sellasist-like: OrderUiStatusPicker/Field, historia, â€ž!â€ť, SettingsSubsection
- Testy `test_wms_smart_matching.py`; `npm run build`; bez commit/push

## 2026-08-08 â€” Etykieta zastÄ™pcza (pakowanie WMS)

- Nowy typ szablonu `order_replacement` (â€žEtykieta zastÄ™pczaâ€ť, rodzina ZamĂłwienia) â€” constants/API/settings/UI designer
- Tabela `wms_packing_replacement_labels` + serwis: snapshot pakowania, PDF, barcode `RPL-*`, retry courier
- Finish pipeline: brak listu â†’ `offer_replacement_label`; popup + delay; create/print; skan na liĹ›cie/ekranie zamĂłwienia
- Ustawienie szablonu filtruje tylko `order_replacement`; opĂłĹşnienie zachowane
- Testy backend (create/snapshot/scan/retry/fail) + `npm run build`; bez commit/push

## 2026-08-08 â€” Ustawienia WMS: Ĺ›rĂłdsekcje SettingsSubsection

- Nowy lekki kontener: tĹ‚o slate-50, cienka obwĂłdka, zaokrÄ…glenie, tytuĹ‚ + opcjonalny opis, wiÄ™kszy gap (`space-y-5`)
- Packing `Subsection`, picking `SubsectionPicking`, DS workflow statuses â†’ ten sam komponent
- Wiersze ustawieĹ„ bez dodatkowych ramek; `npm run build`; bez commit/push

## 2026-08-08 â€” Ustawienia WMS: â€žiâ€ť w pierwszym wierszu tytuĹ‚u

- `SettingRow` z powrotem 2 kolumny LABEL|CONTROL; `.option-title` = flex (tekst + â€žiâ€ť `items-start`)
- Ikona przy pierwszej linii nazwy, nie obok caĹ‚ego wieloliniowego bloku
- `hint` nadal â†’ â€žiâ€ť (bez tekstu pod opcjÄ…); kontrolka top-aligned; bez commit/push

## 2026-08-08 â€” Ustawienia WMS: ukĹ‚ad LABEL | [i] | CONTROL

- `SettingRow`: 3 kolumny; `hint` nie renderuje siÄ™ pod nazwÄ… â€” treĹ›Ä‡ trafia do Ĺ›rodkowej ikony â€žiâ€ť
- Packing: `info` prop zamiast ikony w labelu; badge/capability bez zmian
- Globalnie: picking / direct sales / returns / silniki â€” istniejÄ…ce `hint`/`help` â†’ â€žiâ€ť
- Logika ustawieĹ„ bez zmian; `npm run build`; bez commit/push

## 2026-08-08 â€” Ustawienia WMS: faĹ‚szywy dirty przy zmianie grupy

- Root cause: baseline draft liczony przed migracjÄ… localStorage `allowed_start_status_ids` + niespĂłjny fingerprint
- Fix: `packingDraftFingerprint` / `packingExtendedFingerprint` (normalize + kanoniczne pola); baseline = stan po load/migrate; clear baseline podczas load; idempotent `setAllowedStartStatusIds`
- OstrzeĹĽenie nawigacji nadal tylko przy prawdziwej zmianie ustawieĹ„; bez commit/push

## 2026-08-08 â€” Pakowanie: dokumenty, listy, wielopaczkowoĹ›Ä‡

- `preferred_document_type` API: FROM_ORDER | INVOICE | PARAGON (UI: Paragon/Faktura/Pobrane z zamĂłwienia)
- Kopia dokumentu sprzedaĹĽy (ten sam PDF 2Ă—); popup liczby listĂłw; ConfirmModal przed generate_shipment
- WielopaczkowoĹ›Ä‡: okno paczek przed finish/auto; `packaging_carton_ids` â†’ packing_consumables_json
- Testy packing auto-actions + finish baskets; `npm run build` OK; bez commit/push

## 2026-08-08 â€” Pakowanie: Automatyzacja / PrzesyĹ‚ki i dokumenty

- `change_order_status` off â†’ bez zmiany statusu; on â†’ `packed_status_id`
- List przewozowy: `LIST_PRZEWOZOWY` / pole SHIPPING_LABEL; brak = soft-skip (nie pusty PDF)
- Po dokumencie sprzedaĹĽy / liĹ›cie: tylko Wydrukuj|Pobierz; przy Wydrukuj listu + companion â€žDokument sprzedaĹĽyâ€ť
- Aktywatory w PackingView: filtr `visibleOnWmsPacking` + `showAutomationButtons`
- Testy `test_wms_packing_post_pack_auto_actions` (7) + finish baskets; `npm run build` OK; bez commit/push

## 2026-08-08 â€” Pakowanie: statusy startowe (wiele)

- API `allowed_start_status_ids` (JSON w `wms_packing_settings`) + walidacja UI statusĂłw
- `list_packing_target_statuses` Ĺ‚Ä…czy picking targets + `start_status_id` + multi-start
- UI: multi `OrderUiStatusField` (badge NOWE/W TOKU/ZAKOĹCZONE), ikona (i), bez BRAK FUNKCJONALNOĹšCI
- Migracja z localStorage `allowedStartStatusIds`; logika Zbierania bez zmian
- Testy unit + `npm run build` OK; bez commit/push

## 2026-08-08 â€” Ustawienia WMS: layout Sellasist LABEL|CONTROL

- WspĂłlny `SettingRow` (`wmsSettingRow.tsx`): kolumny ~20rem|15rem, `items-start`, max-width pary (kontrolki nie na krawÄ™dzi ekranu)
- DĹ‚ugie nazwy zawijajÄ… siÄ™; badge/hint/(i) w kolumnie LABEL; checkbox/select w CONTROL przy 1. linii
- Outliery: stacked labelâ†’input w Zbieraniu, Info/Printers stanowisk â†’ `WmsControlSettingRow` / `WmsBoolSettingRow`
- Logika/API bez zmian; `npm run build` OK; bez commit/push

## 2026-08-08 â€” Pakowanie: efekt po akcjach automatycznych (3 opcje)

- UsuniÄ™ty checkbox â€žPo spakowaniuâ€¦ nastÄ™pnegoâ€¦â€ť i badge CZÄĹšCIOWO WDROĹ»ONE
- `packing_after_finish_action`: `STAY` | `GO_TO_LIST` | `NEXT_ORDER` (persist API)
- Finish: pipeline auto â†’ potem nawigacja; NEXT_ORDER = FIFO z kolejki trybu (`next_order_id`)
- `npm run build` OK; bez commit/push

## 2026-08-08 â€” Pakowanie: start status, braki, jedno-/wieloelementowe

- UsuniÄ™ty tekst CAP o zbieraniu przy `start_status_id`; status startowy wchodzi teĹĽ do `list_packing_target_statuses` (bez mieszania z reguĹ‚ami zbierania)
- `missing_status_id` â†’ akcja â€žOznacz jako brakâ€ť na kafelku + popup + `POST â€¦/mark-shortage` + powrĂłt jak â€žPrzerwijâ€ť
- Checkbox jedno-/wieloelementowe â†’ kafelki na ekranie trybu; filtr `order_type` na liĹ›cie (jak zbieranie)
- Testy packing/shortage + `npm run build`; bez commit/push

## 2026-08-08 â€” OrderUiStatusField: grupowanie wybranych statusĂłw

- `OrderUiStatusSelectedGroups` â€” NOWE / W TOKU / ZAKOĹCZONE na liĹ›cie juĹĽ wybranych (puste grupy ukryte)
- Nazwa statusu bez sufiksu grupy; kolory z brief SSOT
- `OrderUiStatusField` (Pakowanie + Akcje automatyczne) + `AutomationConditionSummary` (â€žjest jednym zâ€¦â€ť)
- Logika zapisu bez zmian; `npm run build` OK; bez commit/push

## 2026-08-08 â€” Ustawienia WMS: wspĂłlny standard UI (nie tylko Pakowanie)

- Barrel `wmsSettingsUi` + wiersze `WmsBoolSettingRow` / `WmsControlSettingRow` (kolumny 34rem|26rem, kontrolki nie na krawÄ™dzi)
- Migracja: Zbieranie, SprzedaĹĽ bezpoĹ›rednia, Zwroty, PrzyjÄ™cia, Produkcja, Smart/3D Matching, Stanowiska (grid wierszy)
- Statusy â†’ `OrderUiStatusField` + subgroups; capability badge / info (i) wspĂłlne
- Logika biznesowa bez zmian; placeholdery Coming Soon bez usuwania zakĹ‚adek
- `npm run build` OK; bez commit/push

## 2026-08-08 â€” Zbieranie: layout Sellasist + OrderUiStatusField

- `WmsPickingSettingsPanel`: `WmsBoolSettingRow` / `WmsControlSettingRow` / `wmsSettingsRowsStackClass`
- Statusy (braki API, extended, konfigurator trybu) â†’ `OrderUiStatusField` + `getOrderPanelSubgroups`
- UsuniÄ™ty `PickingStatusSelect` z panelu; payloady / znaczenie status id bez zmian

## 2026-08-08 â€” WspĂłlny OrderUiStatusPicker (NOWE / W TOKU / ZAKOĹCZONE)

- Kanoniczny `OrderUiStatusPicker` + `OrderUiStatusField` (Pakowanie + Akcje automatyczne)
- Popup: 3 grupy zwijane (domyĹ›lnie otwarte), wyszukiwarka, single/multi, kolorowe badge
- Wybrany status = sama nazwa (bez sufiksu grupy); aliasy `AutomationStatus*` zachowane

## 2026-08-08 â€” Pakowanie: layout Sellasist (kontrole nie na prawej krawÄ™dzi)

- `wmsSettingRow`: kolumny `[max 34rem | 26rem]` wyrĂłwnane do lewej â€” kontrolki zaraz obok etykiety
- Puste miejsce po prawej OK; bez `1fr` wypychajÄ…cego select/checkbox na skraj ekranu

## 2026-08-08 â€” WspĂłlne kolorowe badge statusĂłw WMS

- `OrderUiStatusBadge` / `OrderUiStatusBadgeList` â†’ SSOT via `panelSidebarSubRowStyleRich` (kolory z rejestru statusĂłw)
- Akcje automatyczne (warunki/efekty/lista) + `AutomationStatusField` (Pakowanie) + picker: kolorowe chipy, nazwa bez grupy
- `+N` overflow zachowany; `buildOrderUiStatusBriefById` jako mapa id â†’ brief

## 2026-08-08 â€” Pakowanie: status field + layout full-width

- WspĂłlny `AutomationStatusField`: trigger z chipami â†’ popover z `AutomationStatusPicker` (Pakowanie + Akcje automatyczne)
- Etykieta statusu = sama nazwa (`Spakowane`), bez sufiksu grupy; `buildOrderUiStatusNameById`
- Formularz pakowania: `w-full` (bez `mx-auto` / wÄ…skiego max-width); prawa kolumna `16â€“22rem` wyrĂłwnana w osi

## 2026-08-08 â€” Pakowanie: wspĂłlny picker statusĂłw

- Ustawienia procesu pakowania uĹĽywajÄ… `AutomationStatusPicker` (jak akcje automatyczne)
- Single + multi; badge â€žNazwa â€” Grupaâ€ť; `allowClear` = â€žâ€” brak â€”â€ť
- Alias: `OrderPanelStatusPicker`; zapis statusĂłw bez zmian modelu

## 2026-08-08 â€” WMS settings: label left, control right

- WspĂłlne `wmsSettingRow` (`WmsBoolSettingRow` / `WmsControlSettingRow`)
- Pakowanie, zbieranie (CustomCheckbox), sprzedaĹĽ bezpoĹ›rednia, produkcja, zwroty, Smart/3D Matching, walidacja przyjÄ™cia
- Zasada: nazwa opcji (+ â“) z lewej, checkbox/select/input z prawej

## 2026-08-08 â€” GĹ‚Ăłwny magazyn do pakowania (funkcjonalny)

- UI: select magazynĂłw tenanta (ID), bez badge BRAK; zapis przez `PATCH /company/fulfillment-configuration` â†’ `consolidation_warehouse_id`
- Runtime: istniejÄ…cy `resolve_preferred_consolidation_target_id` + soft validation jeĹ›li WH usuniÄ™ty/nie-eligible
- Testy: `test_main_packing_warehouse.py` (unset / set / single-WH / other-tenant / clear / invalid fallback)

## 2026-08-08 â€” Pakowanie: â“ jak w Sellasist

- Niebieskie (i) inline przy nazwie opcji (`BoolRow` / `SelectField` / magazyn)
- Modal: tytuĹ‚ + X, â€žJak dziaĹ‚a ta opcja:â€ť, opcjonalnie â€žWskazĂłwka:â€ť â€” bez Ĺ‚apek pomocnoĹ›ci
- `PACKING_SETTING_HELP` jako `{ description, tip? }`

## 2026-08-08 â€” ETAP 3A PPWR foundation

- Kontrakt: SALES / TRANSPORT / ECOMMERCE / AUXILIARY / FILLER / OUT_OF_SCOPE
- Carton + PackagingMaterial: ppwr_function/format/recyclable/recycled/reusable/status (bez duplikacji BDO)
- Nowa tabela `product_sales_packaging` + CRUD `/products/{id}/sales-packaging`
- FE: zakĹ‚adka produktu â€žOpakowanie produktuâ€ť; WM PPWR projection; zakĹ‚adka PPWR na karcie kartonu/materiaĹ‚u
- Migracja `ensure_ppwr_stage_3a_schema` (allowlist PG); testy `test_ppwr_stage_3a.py`; `npm run build` OK
- Poza zakresem: composition, void, consumables, hub

## 2026-08-08 â€” ETAP 1+2 MateriaĹ‚y opakowaniowe (IA + Inventory SSOT)

- ZakĹ‚adki: Kartony | Pakowe | PPWR (projekcja) | Historia (StockDocument/StockOperation)
- UsuniÄ™to legacy scalar bump przy delivery `received` (metadata-only); stan tylko przez Inventory/PZ
- BDO movements = ta sama projekcja dokumentĂłw (bez ledgeru)
- Bez: consumables packing, void snapshots, peĹ‚ne PPWR fields

## 2026-08-08 â€” IA: jeden katalog MateriaĹ‚y opakowaniowe

- Jedyny katalog CRUD: Asortyment â†’ MateriaĹ‚y opakowaniowe (`/warehouse-materials` â€” Kartony | MateriaĹ‚y pakowe)
- UsuniÄ™to zakĹ‚adkÄ™ BDO â€žMateriaĹ‚y opakowanioweâ€ť + `BdoMaterialsPage`; `/warehouse/bdo/materials` â†’ redirect do katalogu
- BDO zostaje report/config; flagi kg/`include_in_bdo` edytowalne na karcie materiaĹ‚u (zakĹ‚adka BDO)
- Modele/API Carton + PackagingMaterial bez zmian

## 2026-08-08 â€” Prod hotfix: BDO build + order_issue_tasks.status

- FE: restore `resolveBdoTabMeta` in `bdoTabMeta.ts` (current report-only tabs + breadcrumb) â€” Vercel Rollup import fix
- BE: widen `order_issue_tasks.status` String(16)â†’String(32) + `ensure_order_issue_tasks_status_column_width` (PG ALTER; READY_FOR_PACKING=17)
- BE: `_recover_session_after_failed_flush` in WMS issue-tasks list after nested repair failure (avoid PendingRollbackError mask)

## 2026-08-07 â€” MateriaĹ‚y opakowaniowe + BDO report-only (backend foundation)

- Stockable bridge: `Product.stock_item_kind` + `Carton/PackagingMaterial.product_id` â†’ Inventory SSOT
- `wm_catalog_stock_service` posts Inventory (not scalar stock)
- Packing finish â†’ `create_packing_packaging_rw` (RW ISSUE)
- BDO API rewrite: dashboard/catalog/settings/monthly from documents; purchases/corrections/stock-counts â†’ 410
- Dropped BDO ledger tables in migration; FE redirects + deleted purchase/correction/stock-count pages
- Rename UI: MateriaĹ‚y opakowaniowe
- Remaining: packing consumables UI, movements projection, full FE polish, product-list filters excluding packaging stockables

## 2026-08-07 â€” Magazyn: uproszczenie urzÄ…dzeĹ„ (WĂłzki + Strefa sortujÄ…ca)

- ZakĹ‚adki: WĂłzki | Strefa sortujÄ…ca | Planer floty | NoĹ›niki (`cartsTabs.ts`)
- WĂłzki: jeden ekran (`CartsFleetPage`) + filtr ALL/BULK/MULTI + modal typu przy â€ž+ Dodaj wĂłzekâ€ť; badge typu na karcie
- Redirect `/carts/baskets` â†’ `/carts/bulk?type=multi`; `/carts/zones` â†’ `/carts/bulk`
- UsuniÄ™to FE: CartsBulk/Baskets/Zones, ZonesTab, ZoneConfigurator
- UsuniÄ™to BE: `picking_zone` API/service/schema (model + M2M order zostaje dla WMS)
- Nav Magazyn: WĂłzki, Strefa sortujÄ…ca (bez Stref); Planer floty
- `npm run build` + vitest carts/IA OK

## 2026-08-07 â€” Shell: header nad sidebarem + usuniÄ™cie martwych moduĹ‚Ăłw

- Layout: wspĂłlny header na caĹ‚Ä… szerokoĹ›Ä‡; sidebar dopiero pod belkÄ…
- Logo SASIST zawsze w headerze; hamburger usuniÄ™ty
- Zwijanie menu: pozycja w menu uĹĽytkownika (Administracja â†’ Firma â†’ ZwiĹ„/RozwiĹ„ â†’ Wyloguj)
- UsuniÄ™to FE: Pule stanĂłw, caĹ‚y `/system/*` UI, SĹ‚ownik aplikacji (admin)
- BE: wyrejestrowano/usuniÄ™to `offer_stock_pool` router; zostawiono health + labels/resolved
- `npm run build` OK

## 2026-08-07 â€” Globalna wyszukiwarka ustawieĹ„ WMS

- `settingsSearch/`: catalog + combobox + navigate (tab/section/focus/flash 2s)
- Header chrome: VS Code-style search across all WMS tabs (â‰Ą3 znaki, klawiatura)
- Anchory: `data-wms-setting-id` / `WmsSettingField` (Pakowanie Widok + kluczowe pola)
- UsuniÄ™to lokalnÄ… wyszukiwarkÄ™ z `WmsSettingsTabFrame`
- `npm run build` OK

## 2026-08-07 â€” WMS settings: left nav switches section (no scroll)

- Registry: `selectSection` + `?section=` query; removed IntersectionObserver / scroll-spy
- `WmsSettingsSection` mounts only the active subsection
- Nav / Packing / Picking / DS / etc. unchanged visually; save logic untouched
- Deleted `wmsSettingsSectionDom.ts`
- `npm run build` OK

## 2026-08-07 â€” Order Multiakcje + shared multiActions shell

- Extracted generic `frontend/src/components/multiActions/` (MultiActionsModal, MultiModulePicker, createRegistry, types).
- Products: ProductMultiActionsModal â†’ thin wrapper; ModuleCardProps uses `cardContext.tenantId`.
- Orders: `orderMultiActions/` â€” 13 modules; live: status, payment, note, shipping, document, custom_field; stubs: operator, tags, warehouse, source; host: packing_queue, export, delete.
- Removed dropdown `OrderListMultiActionsMenu`, old `OrderBulkMultiActionModal`, dead `OrderBulkCustomFieldModal`.
- OrderList + OrdersListBulkBar: Zap button â†’ full creator modal; `executeOrderBulkActions` + `payment_status`.
- `npm run build` OK

## 2026-08-07 â€” Ustawienia WMS: wspĂłlny wzorzec UI (Pakowanie)

- `WmsSettingsTabFrame`: tytuĹ‚, opis, wyszukiwarka, PrzywrĂłÄ‡ / Zapisz
- Lewa nawigacja z ikonami (aktywny orange), mobile disclosure
- Sekcje zwijane z ikonÄ… (`WmsSettingsSection`)
- PodpiÄ™te: Pakowanie, Zbieranie, Zwroty, PrzyjÄ™cia, Produkcja, DS, Smart/3D, Coming soon
- Logika/API bez zmian; sticky footer nadal dla dirty w hostcie
- `npm run build` OK

## 2026-08-07 â€” Asortyment â†’ Ustawienia (Stany magazynowe)

- Nowa pozycja menu Asortyment â†’ Ustawienia (`/assortment/settings`)
- ZakĹ‚adka Stany magazynowe przeniesiona z Konfiguracji WMS (bez zmian API)
- WMS: usuniÄ™to tab `common`; default Pakowanie; `?tab=common` â†’ redirect
- Shell zakĹ‚adek gotowy na kolejne sekcje produktĂłw
- `npm run build` OK

## 2026-08-07 â€” Lista produktĂłw + Multiakcje: wyrĂłwnanie UX

- Formularze Multiakcji: jednolity wiersz `checkbox/radio | etykieta | pole` (`PmaFieldRow`, `PatchFieldsEditor`)
- UzupeĹ‚nienia WMS: etykiety â€žMinimalna/Maksymalna iloĹ›Ä‡ PICK/ZAPASâ€ť
- Toolbar produktĂłw: bez Strona/CzÄ™Ĺ›ciowo/wykonaj, maila, UsuĹ„, Odznacz; eksport = ikona Upload
- Nowy moduĹ‚ â€žGenerowanie EANâ€ť (pomiĹ„/nadpisz) + BE `generate_fake_ean`
- `npm run build` OK

## 2026-08-07 â€” Multiakcje produktĂłw: UX kreatora

- Naprawa UTF-8 w kartach/moduĹ‚ach
- Command-palette picker zamiast `<select>`; ikony + grupy
- â€žParametry skĹ‚adowaniaâ€ť: sekcje Produkt/Karton, kompaktowa lista pĂłl
- GhostButton â†‘â†“Ă—; badge podsumowania produktĂłw/moduĹ‚Ăłw
- `npm run build` OK

## 2026-08-07 â€” Multiakcje produktĂłw: kreator z pluginami (Etap 1)

- UsuniÄ™to dropdown â€žWybierz akcjÄ™â€ť; jeden przycisk Multiakcje + UsuĹ„
- Pakiet `productMultiActions`: shell, registry, execute; 15 kart-moduĹ‚Ăłw
- BE: set_categories / set_product_family / set_tags / set_custom_field_values / set_product_status
- `npm run build` OK

## 2026-08-07 â€” Dodatkowe pola produktĂłw: akcje, typografia, grupy

- Kolumna Akcje: min. `5rem`, right-align, rĂłwne ikony `h-8 w-8`
- Nazwa pola: `adminListNameClass` (`text-sm font-medium`) â€” bez bold
- Grupowanie (jak Akcje automatyczne): tworzenie/rename/reorder/collapse; membership w `settings_json.group`; registry localStorage; â€žBez grupyâ€ť
- Edycja: select grupy (+ nowa); usuniÄ™te techniczne opisy; order CF: usuniÄ™te â€žAkceptowaneâ€¦â€ť / â€žOpcjonalnieâ€¦â€ť
- `npm run build` OK

## 2026-08-07 â€” Fix product custom fields list (AdminDataTable)

- Bug: `hidden` + `block` w AdminDataTable â†’ tabela niewidoczna (Tailwind conflict)
- Product page: PageLayout fullBleed + ProductCustomFieldsTable jak OrderCustomFieldsTable
- Ten sam toolbar/search/DnD/bulk; kolumny: Typ, Rodzaj, Aktywne
- `npm run build` OK

## 2026-08-07 â€” Standard list administracyjnych (AdminDataTable)

- Nowy `components/admin/AdminDataTable` + tokeny (drag, checkbox, ID, name, columns, icon actions)
- `OrderCustomFieldsTable` przepiÄ™ty na AdminDataTable; stare tokeny = re-export
- `ProductCustomFieldsPage` UI jak pola zamĂłwieĹ„ (wyszukiwarka, DnD, bulk delete, ikony Edytuj/UsuĹ„)
- API FE: `bulkDeleteProductCustomFields`
- `npm run build` OK

## 2026-08-07 â€” Rodzina produktĂłw: spĂłjnoĹ›Ä‡ przyciskĂłw DS

- Jeden toolbar (Generator Secondary, Zapisz Primary, UsuĹ„ danger outline + Trash)
- UsuniÄ™to zduplikowane akcje ze stripa i link â€žWrĂłÄ‡ do listyâ€ť
- Dodaj cechÄ™/wartoĹ›Ä‡ â†’ SecondaryButton; otwĂłrz produkt â†’ IconButton + ExternalLink
- `npm run build` OK

## 2026-08-07 â€” ZakĹ‚adka Rodzina na karcie produktu (assign + preview)

- 3 karty PIM: przynaleĹĽnoĹ›Ä‡ (select + zapisz dirty), podglÄ…d KPI, cechy jako chipy
- Bez zarzÄ…dzania cechami / generatorem / czĹ‚onkami
- `npm run build` OK

## 2026-08-07 â€” Dashboard edycji Rodziny produktĂłw

- Kartowy UX: nagĹ‚Ăłwek (status, KPI, Generator/Zapisz), Informacje, Cechy (osobne karty), tabela ProduktĂłw, panel Generatora
- Komponenty: `FamilyEditInfoCard`, `FamilyEditAttributesSection`, `FamilyEditMembersCard`, `familyEditDraft.ts`
- UsuniÄ™to stopkÄ™ â€žRodzina jest opcjonalnaâ€¦â€ť
- `npm run build` OK

## 2026-08-07 â€” UsuniÄ™cie panelu â€žToĹĽsamoĹ›Ä‡ produktuâ€ť

- `ProductEditIdentityHeader` usuniÄ™ty â€” nie renderuje siÄ™ juĹĽ nad zakĹ‚adkami
- SKU / numer katalogowy przywrĂłcone w `ProductEditBasicTab`
- ZakĹ‚adka Rodzina uproszczona do membership + cechy produktu; usuniÄ™to karty `productFamily/*` z karty produktu
- `npm run build` OK

## 2026-08-06 â€” ZakĹ‚adka Rodzina na karcie produktu (etapy 1â€“6)

- Tab `family` w railu; panel w `pages/Products/productFamily/`
- UsuniÄ™to rodzinÄ™ z identity / Podstawowych
- Members: sale_price + stock_quantity w payloadzie czĹ‚onkĂłw
- Generator osadzony + Generuj SKU/katalogowe (`product_codes` allocate + PUT)
- Dziedziczenie: UI-only checkboxy; powiÄ…zania z produktu bazowego
- Historia: activity log `product_family` (attach/detach/generate)

## 2026-08-06 â€” Product Management ecosystem (etapy 0â€“7)

- Plan zaakceptowany: `memory/plan-product-management-ecosystem.md`
- 0 nav + size-tables stub Â· 1 Kategorie polish Â· 3 Rodziny UX Â· 4 generator allocate SKU/katalog Â· 5 lista group-by family Â· 6 identity header Â· 7 PIM UX tokens (`pimUi.ts`)
- Lista produktĂłw: `product_family_id/name` w API; toggle Lista pĹ‚aska | Grupuj po rodzinie
- Karta: blok ToĹĽsamoĹ›Ä‡ (rodzina, kategoria, SKU, katalog, status); mid-page Family uproszczony

## 2026-08-06 â€” Product Family (7 commits) â€” ADR + implementacja

- ADR: `memory/adr-product-family.md` (opcjonalna rodzina, base product, generator A/B, etapowe usuniÄ™cie Variant)
- C1 modele Â· C2 CRUD `/product-families` Â· C3 UI Rodziny Â· C4 blok na karcie Â· C5 generator Â· C6 migracja Â· C7 usuniÄ™cie Variant
- Produkty bez rodziny bez zmian; brak `exclude_variant_children`; lista nadal pokazuje wszystkie produkty
- Follow-up: grupowanie listy produktĂłw po rodzinie (UX), gĹ‚Ä™bsze kopiowanie SEO/GPSR w generatorze

## 2026-08-06 â€” Product Family Commit 1 (modele)

- ADR zaakceptowany: `memory/adr-product-family.md` (opcjonalna rodzina, base product, generator A/B, etapowe usuniÄ™cie Variant)
- Modele: `product_families`, `family_attributes`, `family_attribute_values`, `product_attribute_values`
- `products.product_family_id`; schema `ensure_product_families_schema`
- Variant stack bez zmian (usuniÄ™cie w Commit 7)

## 2026-08-05 â€” Pola dodatkowe produktĂłw (jak zamĂłwienia, typy jak Sellasist)

- Definicje: Asortyment â†’ Pola dodatkowe (tekst, liczba, pliki, lista 1/n, GPSR, zaĹ‚Ä…czniki z typem)
- WartoĹ›ci na karcie produktu â†’ Podstawowe, nad historiÄ…
- Osobny stack od order custom fields (tenant-scoped, bez warehouse)

## 2026-08-05 â€” Warianty produktĂłw (lepiej niĹĽ Sellasist)

- SĹ‚ownik grup: osie + wartoĹ›ci (karty, nie gÄ™sta tabela); nav Asortyment â†’ Warianty
- Produkt: zakĹ‚adka Warianty â€” przypisz grupÄ™, generuj brakujÄ…ce kombinacje jako osobne SKU
- SKU dzieci ukryte na liĹ›cie produktĂłw (`exclude_variant_children`); stan/EAN/cena per SKU
- Ĺšwiadomie bez marketplace / â€žprodukty zaleĹĽneâ€ť / â€žopcjeâ€ť z Sellasist (v1 = czysty katalog)

## 2026-08-05 â€” PrzeksztaĹ‚Ä‡ produkt â†” zestaw (jak Sellasist)

- BE: `assortment_convert_service` â€” soft-delete ĹşrĂłdĹ‚a, przeniesienie EAN/cen/wymiarĂłw; pusty BOM przy productâ†’bundle
- API: `POST /products/{id}/convert-to-bundle`, `POST /bundles/{id}/convert-to-product`
- FE: przycisk Shapes w nagĹ‚Ăłwku karty produktu/zestawu + confirm + nawigacja do nowej karty

## 2026-08-05 â€” Centralne generowanie SKU / numeru katalogowego

- Kategorie: kod + szablon SKU/katalog; liczniki per `sequence_key`
- API preview/allocate; UI Generuj na Podstawowe z podglÄ…dem i reguĹ‚ami UX
- Silnik szablonĂłw gotowy pod przyszĹ‚e tokeny ({YEAR}, {MANUFACTURER}, â€¦)

## 2026-08-05 â€” ModuĹ‚ Kategorie produktĂłw (od zera)

- BE: `product_categories` tree + `product_category_links` + `primary_category_id`; API `/product-categories` + assignment
- FE: Asortyment `/categories` (drzewo + CRUD), `/size-tables` placeholder, zakĹ‚adka Kategorie na karcie produktu
- Model gotowy pod przyszĹ‚e generatory SKU/katalog, VAT, etykiety, atrybuty, marketplace

## 2026-08-05 â€” ZdjÄ™cia: zawsze biaĹ‚e tĹ‚o + Oferty jak Sellasist

- Galeria / nagĹ‚Ăłwek / miniatury: `bg-white` pod zdjÄ™ciem produktu (zakaz szarego tĹ‚a)
- Oferty: chrome Sellasist (sekcje kanaĹ‚Ăłw + tabela ID/Konto/Nazwa/Stan/Cena/Status)

## 2026-08-05 â€” Edycja produktu: Generuj kody + cleanup tabĂłw + wspĂłlna Historia

- Generuj: dodatkowy EAN, Symbol, Numer katalogowy; persist `catalog_number`
- Historia czynnoĹ›ci: wspĂłlny panel pod kaĹĽdÄ… zakĹ‚adkÄ… (`objectType=product`)
- Produkcja/Magazyn: usuniÄ™te zbÄ™dne teksty techniczne / angielskie dopiski

## 2026-08-05 â€” Etykieta: przywrĂłÄ‡ RetailLabel + spolszczone pola w podglÄ…dzie szablonu

- Gotowa etykieta: z powrotem `RetailLabel` (finalny wydruk produktu)
- PodglÄ…d szablonu: ten sam ukĹ‚ad, wartoĹ›ci = polskie nazwy pĂłl (bez `{{}}` i bez tekstĂłw technicznych)

## 2026-08-05 â€” Edycja produktu: multi-EAN + Drukuj (Podstawowe)

- UI: wiele EAN (+ Dodaj / UsuĹ„), Drukuj przy EAN produktu i EAN kartonu, bez Metryczne/Imperialne
- BE: `extra_barcodes` sync na create/update; `ean_override` w `/labels/product`
- Print modal: etykieta z nadpisanym EAN dla wybranego kodu

## 2026-08-05 â€” Edycja produktu: Ceny final (bez banera TEST)

- `ProductEditPricesTab` dopiÄ™ty do `ceny karta produktu.html` (bez probe banera)
- Hierarchia: Kalkulacja | Dostawcy / Ostatni zakup / Podsumowanie; handlery bez zmian

## 2026-08-04 â€” Edycja produktu: Oferty 1:1 z HTML (FE only)

- `ProductSalesOffersSection` wg `oferrty karta produktu.html` (karta marketplace, ZwiĹ„/RozwiĹ„, tabela)
- Handlery/API ofert sprzedaĹĽowych (outlet, pool, cena) bez zmian; bez DataTable

## 2026-08-04 â€” Edycja produktu: ZdjÄ™cia 1:1 z HTML (FE only)

- Nowy `ProductEditImagesTab` wg `zdjecia karta produktu.html`
- Dodaj URL + Wgraj z pliku; lista rekordĂłw (miniatura, URL, GĹ‚Ăłwne / W gĂłrÄ™ / W dĂłĹ‚ / UsuĹ„)
- Wire w ProductEditModal; handlery/API bez zmian

## 2026-08-04 â€” Edycja produktu: Produkcja 1:1 z HTML (FE only)

- `ProductManufacturingPanel` + `CompositionVisualEditor` wg `produkcja karta produktu.html`
- Banner, receptura (skĹ‚adniki grid, BOM), sidebar: zuĹĽycie / historia / koszt / wersje
- Bez DataTable; SASIST Input/Checkbox/Button/Badge; API/logika bez zmian

## 2026-08-04 â€” Edycja produktu: Magazyn 1:1 z HTML (FE only)

- Nowy `ProductEditWarehouseTab` wg `magazyn karta produktu.html` (sekcje Stan i lokalizacje + Parametry logistyczne)
- Kafle lokalizacji (kolor typu + zajÄ™toĹ›Ä‡/progress); kolumna magazynĂłw; Korekta stanu
- Wire w ProductEditModal; handlery/API/model bez zmian

## 2026-08-04 â€” Edycja produktu: Ceny 1:1 z `ceny karta produktu.html` (FE only)

- `ProductEditPricesTab`: ukĹ‚ad 2/3+1/3, tabela HTML dostawcĂłw, Ostatni zakup, Podsumowanie (szary footer Zysk/RentownoĹ›Ä‡)
- SASIST Input/MoneyInput/Textarea/Select/Button/Radio; bez DataTable/MetricCard/sticky
- Handlery / API / model danych bez zmian

## 2026-08-04 â€” Edycja produktu: Podstawowe v2 z HTML (FE only)

- `ProductEditBasicTab` â†’ layout 1:1 z `podstawowy karta produckut v2.html` (grid 7/5)
- Producent / GPSR rozdzielone; walidacja ProduktÂ·PartieÂ·Opakowanie; szablon z gated search
- Historia = `ActivityLogPanel` (jak zamĂłwienia); Gabaryty jednostkowe; bez zmian API/handlerĂłw

## 2026-08-04 â€” Edycja produktu: Podstawowe DOM 1:1 z HTML (FE only)

- Nowy `ProductEditBasicTab`: section/div jak `podstawowe karta produktu.html` (bez ProductLikeSection)
- SASIST Input/Select w slotach; handlery/API bez zmian
- Historia: chrome HTML + `ActivityLogPanel`; Producent/GPSR + Walidacja poza mockiem (zachowane)
- Bez commita

## 2026-08-04 â€” Edycja produktu: zakĹ‚adka Ceny (FE only)

- 65/35: Kalkulacja cenowa (MoneyInput) Â· Dostawcy (DataTable) Â· Ostatni zakup Â· sticky Podsumowanie
- MetricCard (zysk) + StatusBadge (marĹĽa %); bez zmian API / walidacji / hookĂłw
- Dodano cienkie DS: `MoneyInput`, wspĂłlny `DataTable`

## 2026-08-04 â€” Edycja produktu: UX jak mock HTML (FE only)

- Header: breadcrumb + nazwa + ZamĂłw / Drukuj / Kopiuj+WiÄ™cej / Zapisz
- Hero: zdjÄ™cie, tenant, ID, SKU, EAN + 3 duĹĽe statystyki (stan / cena / marĹĽa)
- Tabs: brand TabsNav (pomaraĹ„czowy underline); basic = Cards 65%/35%
- Historia czynnoĹ›ci = `ActivityLogPanel` objectType=product (jak ZamĂłwienia)
- Backend / API / routing / walidacja / hooki â€” bez zmian

## 2026-08-04 â€” Pulpit: TabsNav zamiast accordionĂłw

- UsuniÄ™te PulpitSection (accordion); zakĹ‚adki Decyzja/Alerty/Operatorzy/Kolejki/Dostawy/Historia via istniejÄ…cy TabsNav
- Route `pulpit/*`; treĹ›Ä‡ Centrum tylko dla aktywnej zakĹ‚adki
- Backend / API / hooki â€” bez zmian

## 2026-08-04 â€” Rename ZarzÄ…dzanie/Magazyn + Pulpit jak Produkcja

- Sidebar: ZarzÄ…dzanie (Pulpit/KolejnoĹ›Ä‡/Raporty/Plan) + Magazyn (Layoutâ€¦ProtokoĹ‚y); bez WĂłzkĂłw/Inwentaryzacji w flyoucie
- Pulpit: DS PageHeader + MetricCard + Card (wzorzec ProductionDashboard) â€” bez hero/landing
- Backend / routing â€” bez zmian

## 2026-08-04 â€” UX Magazyn: ujednolicenie do Layout System 2.0

- UsuniÄ™te lewe menu RaportĂłw i Planu zmian â†’ `TabsNav` (jak Zakupy/Produkcja)
- Pulpit / KolejnoĹ›Ä‡ / PrzeglÄ…d: `PageHeader`, karty DS, tabela, filtry, bez `font-black` / `max-w-2xl`
- IA / routing / backend / funkcjonalnoĹ›Ä‡ â€” bez zmian

## 2026-08-04 â€” IA Magazyn: flyout Magazyn + Administracja + Pulpit sekcje

- Sidebar: â€žMagazynâ€ť (Pulpit Â· KolejnoĹ›Ä‡ Â· Raporty Â· Plan); â€žAdministracja magazynemâ€ť (peĹ‚na lista + WĂłzki + Inwentaryzacja ERP; bez szablonĂłw etykiet)
- Pulpit: ShiftConductor + zwijane sekcje z embed Centrum (Alerty / Operatorzy / Kolejki / Dostawy / Historia)
- Raporty: index = AnalysisDashboard (PrzeglÄ…d); wszystkie raporty podĹ‚Ä…czone
- Backend / API / Engine â€” bez zmian

## 2026-08-03 â€” Pulpit jako przebieg zmiany (nie dashboard)

- ShiftConductor: status â†’ decyzja â†’ efekt â†’ CTA â†’ potem; kontekst schowany
- UsuniÄ™te widgety sekcji (alerts/status/crew/secondary jako osobne bloki)
- Tabs Raporty/Plan niewidoczne na Pulpicie
- Backend / Engine / API â€” bez zmian

## 2026-08-03 â€” Pulpit jako strona gĹ‚Ăłwna ZarzÄ…dzania

- UsuniÄ™ty landing (3 kafle) i tab â€žPrzeglÄ…dâ€ť; `/zarzadzanie-magazynem` â†’ `/pulpit`
- Pulpit przebudowany produktowo: decyzje â†’ stan â†’ alerty â†’ obciÄ…ĹĽenie â†’ stopka
- OdĹ‚Ä…czone embed Centrum Operacyjnego; bez Ĺ›ciany KPI
- Backend / Engine / API â€” bez zmian

## 2026-08-03 â€” IA: hub ZarzÄ…dzanie + Administracja L1

- FE only: `/zarzadzanie-magazynem` (hub â†’ pulpit / raporty / plan-zmian)
- Administracja: `/administracja-magazynem` jako L1 (nie flyout); usuniÄ™ty osobny wiersz Ustawienia WMS
- Decyzje = sekcja Pulpitu (â€žCo zrobiÄ‡ terazâ€ť); bez `#decyzje`
- Redirecty: SF / operations / centrum / stary pulpit â†’ `/zarzadzanie-magazynem/pulpit`; analytics â†’ raporty; optymalizacja â†’ plan-zmian
- WMS: usuniÄ™te wpisy supply_flow + operations z rejestru moduĹ‚Ăłw
- Backend / Engine / API â€” bez zmian

## 2026-08-03 â€” IA: trzy stanowiska Magazyn

- FE only: menu/routing/nazwy; Pulpit kierownika wchĹ‚ania Centrum + Decyzje (SF UI)
- UsuniÄ™te z WMS Home: PrzepĹ‚yw dostaw, Operacje
- Redirecty starych URL â†’ `/pulpit-kierownika`
- Backend / Supply Flow Engine â€” bez zmian

## 2026-08-03 â€” PrzepĹ‚yw dostaw: UX prowadzenia zmiany (audyt)

- Pierwszy viewport: alert + 1 karta uwagi + CTA; Dlaczego w karcie (â‰¤2)
- Co dalej â‰¤3 + â€ž+ jeszcze Xâ€ť; plan ukryty w â€žSzczegĂłĹ‚y planuâ€ť; stan = 1 wiersz
- Jedno â€žOdĹ›wieĹĽâ€ť; jÄ™zyk magazynowy; powrĂłt z WMS = zakoĹ„czone + nastÄ™pne
- Backend / Engine / API â€” bez zmian

## 2026-08-03 â€” PrzepĹ‚yw dostaw: przebudowa UX kierownika

- WyĹ‚Ä…cznie FE: hierarchia Alerty â†’ Uwaga â†’ Co dalej â†’ Dlaczego â†’ Plan pracy â†’ Stan magazynu
- Mapper `shiftBoard.ts` tĹ‚umaczy plan API na jÄ™zyk magazynu (bez score / polityk / klas)
- UsuniÄ™te stare panele architektury (Execution board, config, raw priorities)
- Backend / Engine / Event Pipeline / API â€” bez zmian

## 2026-08-03 â€” Supply Flow UX (Living Plan)

- API: GET/POST plan+recompute, GET/PATCH config (`/api/wms/supply-flow`)
- FE: `/wms/supply-flow` â€” CTA, Execution board+monitor, Explainable, dostawy, config
- ModuĹ‚ WMS `supply_flow` w menu / home (daily)
- Bez przebudowy Engine / Event / Priority / Explainable / Planner / Monitor

## 2026-08-03 â€” Capability Pack 4: Execution Monitor

- Pakiet `execution_monitor/`: ExecutionStatus, ExecutionState, ExecutionMonitor
- Overlay na ExecutionPlan (seq); ĹşrĂłdĹ‚o: zdarzenia WMS (start/finish unload/putaway, cancel, fail)
- Dispatcher syncuje stan po batchu; start/cancel/fail bez recompute Engine
- Testy: 33 passed

## 2026-08-03 â€” Capability Pack 3: Execution Planner

- `ExecutionPlanner` + `ExecutionPlan` / `ExecutionStep` (status PLANNED)
- PorzÄ…dkuje Recommendation 1:1 (seq, goal, delivery_groups, recommendation_ref)
- Plan: `projection.execution_plan`; bez zmiany decyzji Engine
- Testy CP3 + suite supply_flow

## 2026-08-03 â€” Capability Pack 2: Explainable Decision

- `ExplainableDecisionBuilder` + model `ExplainableDecision` (projekcja only)
- Konsumuje Recommendation, `priority_contributions` (z PriorityResolver), BusinessEffect
- Plan: `explainable_decisions` + `recommendation.explanation`
- Bez confidence / why_not / konfliktĂłw / kolejek / Cross Dock / symulacji
- Testy: 25 passed

## 2026-08-03 â€” PriorityResolver â†’ PriorityPolicy architecture

- Pakiet `pipeline/priority/`: Context, Contribution, Policy protocol, aggregator
- Policies: Phase, ETA, Demand, Recovery, Capacity, Slotting (CP1 math 1:1)
- `PriorityResolver` tylko buduje Context i sumuje Contribution
- Alias `DeliveryPriorityFactors` = `PriorityContext`; testy CP1 zielone (22 passed)
- Bez Explainable / confidence / why_not

## 2026-08-03 â€” Supply Flow Capability Pack 1: dynamic priority

- `PriorityResolver`: multi-factor (phase/ETA/wait/open PZ/unlockable Recovery orders/capacity/slotting)
- READ: delivery `product_ids`, recovery `shortage_links`, slotting `slotted_product_ids`
- `BusinessEffectBuilder` czyta PriorityResolution (unlock estimate + top priority)
- CandidateActionBuilder bez zmian logiki priorytetĂłw
- Testy CP1 + suite supply_flow

## 2026-08-03 â€” Supply Flow ETAP 3C: decision pipeline

- Pakiet `services/supply_flow/pipeline/`: CandidateAction / Priority / BusinessEffect / CTA / Recommendation builders + runner
- Engine tylko: gather_input â†’ DecisionPipeline.run â†’ upsert plan
- RecommendationBuilder = czysta projekcja ranked actions (bez ifĂłw biznesowych)
- Testy: 19 passed

## 2026-08-03 â€” Supply Flow ETAP 3B: Engine v1 (prosta logika)

- `engine_input.py` + `analysis.py`: rekomendacje fazowe, priorytet deterministyczny, business_effect jakoĹ›ciowy
- READ: inventory/recovery/slotting/capacity(DOCK)/putaway open PZ â€” agregaty SSOT
- Plan `stage=v1_simple`; CTA â†’ istniejÄ…ce Ĺ›cieĹĽki WMS
- Testy: 16 passed; bez ML / explainable / kolejek

## 2026-08-03 â€” Supply Flow ETAP 3A: Event Pipeline

- Pakiet `services/supply_flow/events/`: types, buffer, publisher, dispatcher, handlers
- WMS publikuje wyĹ‚Ä…cznie `publish_supply_flow_event` (receiving/putaway/delivery)
- Dispatcher: dedupe, group(warehouse), debounce (flush window), priority â†’ 1Ă— recompute
- Testy: 13 passed; bez algorytmĂłw

## 2026-08-03 â€” Supply Flow ETAP 2: wiring WMS

- Hooki: `finish_wms_receiving_pz`, `finalize_wms_relocation_pz`, `create_delivery`, `update_delivery`
- `orchestration.advance_toward_phase` (graf + macierz, bez sync osi zakupowej)
- Soft CTA/next â†’ `/wms/receiving`, `/wms/putaway`, `/goods-orders`
- Putaway READ: SQL agregaty statusĂłw PZ; Engine stage=`wiring`
- Testy: 8 passed; bez UI / algorytmĂłw

## 2026-08-03 â€” Supply Flow ETAP 1 zaakceptowany

- Po fixie config + macierz uĹĽytkownik zaakceptowaĹ‚ zamkniÄ™cie ETAPU 1
- ETAP 2 nie rozpoczÄ™ty

## 2026-08-03 â€” Supply Flow ETAP 1: fix audytu (config + macierz)

- `SupplyFlowWarehouseConfig` (tenant+warehouse): `optimization_goal`, `planning_horizon_hours`
- UsuniÄ™to goal/horizon z `SupplyFlowPlan`; Engine czyta config, plan = wynik
- `PURCHASE_OPERATIONAL_PHASE_MATRIX` â€” walidacja kombinacji, bez nadpisywania osi
- Schema: bez seed sync statusâ†’phase; migracja legacy kolumn planu â†’ config
- Testy: 5 passed

## 2026-08-03 â€” Supply Flow ETAP 1: fundament backendu

- `operational_phase` + historia na dostawie; Living `SupplyFlowPlan` (projekcja)
- Pakiet `services/supply_flow`: Engine szkielet, recompute triggers (TODO hooks), adaptery READ/WRITE
- Schema: `ensure_supply_flow_schema`; bez UI / algorytmĂłw

## 2026-08-02 â€” Audyt wizualny Analizy (przeglÄ…darka)

- PrzejĹ›cie caĹ‚ego hubu w UI; znaleziono 14 widocznych EN fraz
- Centrum: pick-face/stock/OMS/putaway/replenishment/priority_* â†’ PL (API + render)
- Raporty: Unknown Product â†’ Nieznany produkt
- Re-check w przeglÄ…darce: 0 EN w treĹ›ci Analizy

## 2026-08-02 â€” PL UI: Centrum operacyjne + Analysis leftovers

- CentrumOperacyjnePage: Deadlineâ†’Termin, Timelineâ†’OĹ› czasu, Stockâ†’Stan
- PickingStrategyPage: CART/BASKET/ZONE/HYBRID â†’ WĂłzek/Koszyki/Strefy/Hybryda; vsâ†’wzglÄ™dem
- BundleIntelligence PriorityBadge: Wysoki/Ĺšredni/Niski; InventoryValue: backendemâ†’systemem
- SalesForecast NOT_ENOUGH_MSG i PickingAnalysis: juĹĽ PL, bez zmian

## 2026-08-02 â€” PeĹ‚na polonizacja UI hubu Analizy

- UsuniÄ™to EN z Centrum/RaportĂłw/Optymalizacji (Idle/Score/Scan, vs, CARTâ€¦, Plan/Ranking â†’ harmonogram/klasyfikacja)
- Prognoza: mapowanie EN message z API; zestawy: polishRecommendation (bundle/pick-face)
- Audyt skryptowy UI stringĂłw: 0 pozostaĹ‚ych EN z listy zakazanej
- Backend bez zmian

## 2026-08-02 â€” warehouse_id: wspĂłlny scope Analizy/Optymalizacja

- Mechanizm: `useWarehouseApiScope` / `buildWarehouseParams` / `AnalizyWarehouseSelect`
- Naprawione m.in. Bundle Intelligence (brakowaĹ‚o `warehouse_id` â†’ 422) + walking-cost, hot-locations, pick-density, picking-analysis, slotting, strategy, sales-forecast, pick-route/orders
- ĹąrĂłdĹ‚o: aktywny magazyn z `WarehouseContext` (bez lokalnych `/warehouses/` na ekranach WH-scoped)
- Backend bez zmian

## 2026-08-02 â€” Analizy P0/P1: produkcyjna spĂłjnoĹ›Ä‡ UI

- Polonizacja (Centrum, kompletacja, ukĹ‚ad, placeholdery)
- CTA/nagĹ‚Ăłwki/KPI/side-nav: tokeny `analizyUi` + brand orange
- Loading z nagĹ‚Ăłwkiem; empty Plan/Ranking z CTA czasownikami
- Mapa magazynu: `AnalysisDecisionHeader` + CTA

## 2026-08-02 â€” Audyt jakoĹ›ci hubu Analizy (pre-release)

Werdykt: **nie gotowy do wydania** bez poprawy EN w UI + Manifest na Mapie magazynu + ujednolicenia CTA/headerĂłw.
SzczegĂłĹ‚y w raporcie sesji (âś…/âš /âťŚ). Legacy stubĂłw brak; thin re-exporty analyticsâ†’Analysis nadal uĹĽywane.

## 2026-08-02 â€” IA v2: PrzeglÄ…d / Raporty (bez â€žAnalizy â†’ Analizyâ€ť)

- ZakĹ‚adki hubu: PrzeglÄ…d Â· Centrum operacyjne Â· Raporty Â· Optymalizacja
- Mapa magazynu w bocznym menu RaportĂłw; usuniÄ™te martwe wrappery (batch/rotation/density/walking-cost)
- PL w UI (ukĹ‚ad towaru, zestawy, rotacja); breadcrumbs Centrum uproszczone

## 2026-08-02 â€” IA: jeden hub Analizy w sidebarze

- UsuniÄ™to osobne pozycje sidebaru: Centrum operacyjne, Optymalizacja
- Jedna pozycja: **Analizy** â†’ `/analytics` (Pulpit startowy)
- `AnalizyModuleLayout` + sekcje: Pulpit Â· Centrum operacyjne Â· Analizy Â· Optymalizacja
- Routing i logika biznesowa bez zmian; tylko Information Architecture

## 2026-08-02 â€” Faza 4 zaakceptowana

- ZamkniÄ™cie pÄ™tli: Realizacja â†’ Ocena â†’ Historia
- Produkt kompletny jako cykl zarzÄ…dzania magazynem (nie Enterprise)

## 2026-08-02 â€” Faza 4: Realizacja + ocena + historia zmian

- Status â€žZweryfikowanaâ€ť; cykl ĹĽycia zamkniÄ™ty
- Historia zmian magazynu (`/optymalizacja/historia`) â€” decyzje biznesowe
- Ocena PRZED/PO/RĂłĹĽnica z realnych odczytĂłw (walking-cost); inaczej â€žOczekuje na daneâ€ť
- Ranking skutecznoĹ›ci (`/optymalizacja/ranking`) â€” tylko zweryfikowane z deltÄ…
- Bez nowych analiz/KPI/wykresĂłw

## 2026-08-02 â€” Plan zmian: statusy, ĹşrĂłdĹ‚o, realizacja

- Statusy: Nowa / Zaplanowana / W realizacji / WdroĹĽona / Odrzucona
- ĹąrĂłdĹ‚o rekomendacji (originLabel) + efekt (metryka lub Wysoki/Ĺšredni/Niski wpĹ‚yw)
- â€žWybierz sposĂłb realizacjiâ€ť â†’ Projektant / MM / Strategia / Centrum / WMS
- Migracja planu FE v1 â†’ v2

## 2026-08-02 â€” Optymalizacja: jeden Plan zmian magazynu

- WspĂłlny plan FE (`warehouseChangePlanStore`) â€” rekomendacje z 3 analiz
- Landing = pulpit planu (ile czeka / wpĹ‚yw / co pierwsze)
- CTA: â€žDodaj do planu zmianâ€ť / â€žDodaj strategiÄ™ do planuâ€ť
- Strona `/optymalizacja/plan` â€” lista, priorytet, wpĹ‚yw, usuĹ„, ĹşrĂłdĹ‚o, wdroĹĽenie

## 2026-08-02 â€” Optymalizacja Faza 3 v1

- Landing `/optymalizacja` (ukĹ‚ad / strategia / trasy+dystans)
- `OptimizationToolHeader` + `OptimizationPlanPanel` â€” kaĹĽde narzÄ™dzie koĹ„czy siÄ™ planem
- Walking cost â†’ Optymalizacja (scalenie z trasami); usuniÄ™te z nav Analiz
- Slotting: plan przesuniÄ™Ä‡ A; Strategia: zapis rekomendacji; Trasy: plan skrĂłcenia drogi

## 2026-08-02 â€” Analizy Faza 2: Manifest (pytanie â†’ decyzja â†’ CTA)

- Dashboard Analiz = landing decyzyjny (max 7 kart, bez backend health)
- `AnalysisDecisionHeader` na raportach + bezpoĹ›rednie CTA
- Scalenie: product-rotation / batch-picking â†’ hot-products; pick-density â†’ hot-locations
- Sub-nav Analizy skrĂłcony do 9 pozycji hubowych

## 2026-08-02 â€” Analizy Faza 1: Split Centrum

- Centrum operacyjne â†’ `/centrum-operacyjne` (top-level, poza Analizami)
- Analizy: Dashboard = landing `/analytics` (bez peer-tab)
- Optymalizacja â†’ `/optymalizacja` (slotting, strategia, trasy)
- Mapy usuniÄ™te z menu; logika mapy zachowana
- PL etykiety UI (bez zmiany nazw technicznych API/plikĂłw)

## 2026-08-02 â€” Analizy Faza 0: Hygiene

- UsuniÄ™to z menu/nav 6 stubĂłw (dzieĹ„, czas, ruch, layout, throughput, problemy kompletacji)
- Stare URL â†’ redirect do dziaĹ‚ajÄ…cych powierzchni
- UsuniÄ™to orphan AnalysisLayout + analysisTabs + pliki stubĂłw
- Batch pick-route: FE â†’ prawdziwy silnik (`order_ids`); legacy `/batch/` deleguje zamiast licznikĂłw debug

## 2026-08-02 â€” WMS: tryby operacyjne vs uprawnienia moduĹ‚Ăłw

- UsuniÄ™to z trybĂłw: Operacje, WĂłzki, QC, Dokumenty, Analiza, Zakupy, Szablony etykiet
- Nowe liĹ›cie uprawnieĹ„: `warehouse.carts`, `warehouse.qc`, `documents.view`, `analytics.view`, `purchasing.view` (+ reuse `warehouse.operations`, `workforce.ops.label_templates`)
- Migracja JSON trybĂłw â†’ `user_permissions`; Operacje gated przez `requiredPermission`
- Guard: profile tylko z hubami legacy nie sÄ… zerowane do `[]` (to otwieraĹ‚oby wszystkie tryby floor)

## 2026-08-02 â€” Document logo: data-URI embed + company.logo

- Przyczyna: branding zapisuje `/uploads/...`, ale preview/PDF nie osadzaĹ‚y pliku (relative src + `file://` w Puppeteer)
- Fix: `upload_media_embed` â†’ data URI; `company.logo` w global context; `document_header` czyta teĹĽ `branding.logo_url`
- Tymczasowe logi `[doc.logo]`

## 2026-08-01 â€” RMZ: inline Uszkodzone/Odrzucone

- Zamiast drawera: rozwijany panel w karcie produktu (height+opacity ~220ms)
- Accordion: tylko jedna karta naraz; badge decyzji po zapisie
- Klasa A/B/C + checklist typĂłw; odrzucenie: kategoria â†’ powody

## 2026-08-01 â€” RMZ detail: spĂłjnoĹ›Ä‡ z Panelem ZamĂłwienia

- UsuniÄ™ty widget + CTA â€žTerminal WMSâ€ť; dostÄ™p tylko z menu â‹® gdy WMS aktywny
- UsuniÄ™ty badge â€žW trakcieâ€ť; etykieta listy = `PanelBulkStatusPickerDropdown` / `PanelTreeStatusItem`
- Decyzje produktu: samodzielne segmented buttons (bez szarego kontenera)
- Prawa kolumna: etykieta â†’ notatki â†’ postÄ™p â†’ dziennik â†’ dokumenty; kompaktowe karty produktĂłw

## 2026-08-01 â€” Lista zwrotĂłw: status panelu + kolumny

- Kolumna Status = `PanelTreeStatusItem` (ten sam co sidebar); bez szarych kapsuĹ‚
- UsuniÄ™ty przycisk/akcja WMS z listy; wybĂłr kolumn DnD + autosave + PrzywrĂłÄ‡ domyĹ›lne

## 2026-08-01 â€” Zwroty: redesign widgetĂłw detail

- Karty SaaS (`ReturnDetailWidgetShell`), produkty jako karty + segmented decyzje
- Status badge, progress bar, timeline dziennik, KPI podsumowanie/stats
- Terminal WMS ukrywany przy `inventory_management_mode=DOCUMENTS_ONLY`
- Konfigurator bez zmian

## 2026-08-01 â€” Formularz zwrotu klienta: nowy layout

- Osobna strona 70/30, karty produktĂłw, sticky podsumowanie; bez tabel
- â€žDodaj do zwrotuâ€ť â†’ zielony stan + pola; IBAN dopiero przy przelewie
- Operator `OrderCaseCreateView` nietkniÄ™ty

## 2026-08-01 â€” Panel statusĂłw: wyrĂłwnanie lewej krawÄ™dzi

- Mniejszy lewy padding powĹ‚oki (`pl-0.5`); bez wciÄ™Ä‡ `pl` na listach/podgrupach
- WspĂłlna linia: Wszystkie / grupy / podgrupy / kafelki; ciaĹ›niejszy mt grupaâ†’status

## 2026-08-01 â€” Zwroty/reklamacje UX polish + formularz klienta

- Dropdown bez pustego stanu / WMS; Formularz zwrotu â†’ ekran klienta
- Messages/docs bez â€žPrzejdĹş doâ€¦â€ť; scroll do wiadomoĹ›ci w Komunikacji
- `displayCustomerComment` odcina logi systemowe z komentarza klienta

## 2026-08-01 â€” Zwroty/reklamacje: tworzenie w Panelu ZamĂłwienia

- Nowy zwrot/reklamacja w `OrderCaseCreateView` (produkty + summary), nie redirect WMS
- Header bez Spakuj; menu Dokumenty tylko wystawione + wystaw sprzedaĹĽowy/magazynowy
- Po create: karta w Panelu; RMZ nadal w module WMS

## 2026-08-01 â€” Modal ZamieĹ„ produkt: redesign wizualny

- Bez ramek przy zdjÄ™ciach; filtry segmentowe; lĹĽejsze badge; zwarta lista
- Kafelki â€žNajlepsze dopasowaniaâ€ť + scroll; footer: Zamieniany produkt + checkbox
- Logika search/filtrĂłw bez zmian

## 2026-08-01 â€” Order header: Sellasist popover UX

- Ikony â†’ dropdown (nie modal); modal tylko przy wprowadzaniu danych
- Returns/messages/docs/link/copy/print przebudowane na context menu
- Link: lista + â€žPoĹ‚Ä…cz noweâ€¦â€ť â†’ modal; Copy: 3 opcje â†’ formularz

## 2026-07-24 â€” Panel statusĂłw: wyciszone liczniki

- UsuniÄ™te kolorowe pastylki; maĹ‚e okrÄ…gĹ‚e badge ~26px (biaĹ‚e + ramka)
- Tint badge tylko dla aktywnego wiersza; kolor kategorii na pasku/kropce
- Grupy: ten sam spokojny badge (nie solid); nazwa > licznik, hover = tĹ‚o wiersza

## 2026-07-24 â€” Order header actions toolbar (mockup)

- 6 ikon 36Ă—36: zwroty, wiadomoĹ›ci, dokumenty, poĹ‚Ä…cz, kopiuj, drukuj
- Panele/modale w `headerActions/`; badge zgĹ‚oszeĹ„ + wiadomoĹ›ci
- Link lokalny (localStorage); copy UI gotowe pod API
- Zachowane: pin, bookmark, Spakuj

## 2026-07-24 â€” Panel statusĂłw: UI pod mockup (tylko prezentacja)

- Grupy: kropka + uppercase + solid badge + lock + chevron; wiÄ™ksze odstÄ™py
- Statusy: kafelki z ramkÄ…/hover/active + soft badge; podgrupy uppercase
- Search pill; collapsed: kropka/pasek + badge bez nazw
- Bez zmian filtrowania / licznikĂłw / API

## 2026-07-24 â€” Fix â€žOznacz jako czekaâ€ť (no auto-pick)

- `compute_line_missing_qty`: waiting nie zeruje braku; `line_shortage_display_kind` â†’ `waiting` first
- Packing: nie inflate `picked_quantity_final` przy `oms_waiting_for_stock`
- Audit: `emit_oms_decision_wait` z `operator_user_id` + komunikat produktu; patch endpoint przekazuje usera
- UI: badge CZEKA/OCZEKUJE (karta produktu, workflow pick, Braki detail)

## 2026-07-24 â€” Dokumenty i pliki: polish pod mockup

- Karty Dokumenty/ZaĹ‚Ä…czniki/LP: gÄ™stsza tabela, badge statusĂłw, ujednolicone akcje
- Toolbar zaznaczania + CTA Dodaj plik; bez zmian logiki dokumentĂłw/API

## 2026-07-24 â€” Komunikacja: centrum komunikacji pod mockup

- 8/4: compose + historia korespondencji | AI + klient + notatki/komentarz
- Bubble UI z istniejÄ…cych `orderNotes`; kanaĹ‚y/szablony/Sugestia AI lokalnie; bez zmian API wysyĹ‚ki

## 2026-07-24 â€” Logi: journal UX pod mockup

- Lekka tabela (czas+status, wykonawca, zdarzenie, efekt); sort newest/oldest; paginacja
- Szukaj + Filtruj (severity/daty przez istniejÄ…ce parametry API); bez zmian backend/logiki

## 2026-07-24 â€” Produkty i magazyn: karty 1:1 mockup (UX only)

- Lista â†’ osobne karty (thumb contain, meta, metryki, wartoĹ›Ä‡, kebab); zestawy â€žZestaw zawieraâ€ť
- Braki / zamienniki / usuniÄ™te jak mockup; footer WMS z lokalizacjÄ… + badge + operator
- Sticky prawa kolumna (KPI + timeline); opakowania: galeria rekomendacja+alternatywy
- Bez zmian API / modeli / logiki WMS; peĹ‚na funkcjonalnoĹ›Ä‡ zachowana

## 2026-07-31 â€” Podsumowanie: final commercial polish

- Zwarte 4 kolumny kontekstu; produkty `text-3xl`; prawa kolumna jako jeden panel
- Kompaktowe empty: Wideo / listy; notatki 2 linie + auto-grow; cichszy Safe Order
- Ship/pay Zapiszâ€“Anuluj tylko dirty; bez usuwania funkcji; bez ponownych logĂłw

## 2026-07-31 â€” Dopasowane opakowanie: kompaktowa karta rekomendacji

- Jeden nagĹ‚Ăłwek sekcji; bez diagnostyki Smart Matching na wierzchu (SzczegĂłĹ‚y)
- 2 kolumny: rekomendacja + placeholder/wybĂłr; badge REKOMENDOWANY / Hybryda / PewnoĹ›Ä‡ / WypeĹ‚nienie / Tryb
- Miniatury produktĂłw i kartonĂłw: `object-contain`, bez ramek/tĹ‚a/cieni

## 2026-07-31 â€” Karta ZamĂłwienia: przywrĂłcenie peĹ‚nej funkcjonalnoĹ›ci

- CofniÄ™to nadmierne uproszczenia density pass: peĹ‚ne opakowania, Safe Order, chipy WMS, Listy przewozowe, Wideo WMS, WiadomoĹ›Ä‡ do klienta, peĹ‚ny chrome kart
- Przyciski Spakuj / Dodaj produkt / Dodaj zestaw na Podsumowaniu (te same modale co zakĹ‚adka Produkty)
- SposĂłb wysyĹ‚ki / pĹ‚atnoĹ›Ä‡: Zapisz+Anuluj tylko przy dirty draft
- Bez kasowania moĹĽliwoĹ›ci; mockup = tylko hierarchia/kompozycja

## 2026-07-30 â€” Karta ZamĂłwienia: final product UX pass

- UsuniÄ™to stuby (puste Wideo, faĹ‚szywy composer wiadomoĹ›ci â†’ link do Komunikacji)
- Opakowania tylko gdy jest treĹ›Ä‡; sticky panel finansowy; max-w 1680
- GÄ™stszy info strip, produkty jako pas centralny, kompaktowe empty/CTA
- Bez zmian API/logiki

## 2026-07-30 â€” Karta ZamĂłwienia: UX density / hierarchia (summary)

- Status peĹ‚ny (bez truncate), jak makieta; jedna etykieta grupy
- Produkty jako pas centralny; mniej ramek; niĹĽsze wiersze; wrap meta
- Prawa kolumna = jeden panel (`aside`) zamiast stosu kart
- Opakowania `operatorQuiet` (bez silnik/pewnoĹ›Ä‡); puste sekcje kompaktowe
- ZacieĹ›nione paddingi/gapy; `max-w-[1440px]`; bez zmian API/logiki

## 2026-07-30 â€” Karta ZamĂłwienia: przebudowa UX wg makiety (summary)

- Tokeny + `OrderDetailInfoColumn` / `OrderDetailProcessStatusRow`
- NagĹ‚Ăłwek (numer dashed) + status/proces + stepper z istniejÄ…cego WMS pick/pack
- Podsumowanie: 4 kolumny info, tabela produktĂłw (compact), siatka 8/4, notatki/logi
- Bez zmian backend/API/logiki

## 2026-07-30 â€” Automatyzacje: wspĂłlne summary na liĹ›cie + historii

- Extract: `AutomationConditionSummary`, `AutomationEffectSummary` (edytor + lista + historia)
- Lista: max 3 warunki/efekty, `+N kolejnychâ€¦`, expand jednego wiersza, bez ORAZ/LUB
- Historia: `groupChangeLogEntries` (ruleId+userId+sekunda/â‰¤2s) â†’ jedna karta / save; badge + tone diff
- Bez zmian API / `computeRuleChangeLogEntries`

## 2026-07-30 â€” Edytor automatyzacji: exclusive Auto/RÄ™cznie + layout SaaS

- Kafelki przeĹ‚Ä…czajÄ… fokus UI â€” pokazywana tylko konfiguracja wybranego trybu
- Auto: 2 kolumny (opĂłĹşnienie/tryb | dni+harmonogram), wiersze dni z dividerami
- RÄ™cznie: wyglÄ…d+podglÄ…d 2 kol., widocznoĹ›Ä‡ w siatce, skrĂłt i â€žSprawdzaj warunkiâ€ť jako osobne karty
- Badge JEĹšLI = orange jak TO

## 2026-07-30 â€” Edytor automatyzacji: layout 1:1 (v2)

- Jedna karta â€žUstawienia wykonaniaâ€ť: kafle + 2 kolumny (tryb | dni/godziny)
- Dni Pnâ€“Nd: rĂłwna szerokoĹ›Ä‡, selected = brand orange
- JEĹšLI/TO: wiersze jak select/operator/wartoĹ›Ä‡ + menu â‹® (IconButton); edycja nadal modal
- Dolny pasek: tylko Anuluj; Zapisz w nagĹ‚Ăłwku; UsuĹ„ przy historii

## 2026-07-29 â€” Edytor automatyzacji: UI 1:1 z projektem

- NagĹ‚Ăłwek w karcie: Nazwa / Grupa / toggle Aktywna (emerald) / Test / Zapisz
- Kafelki Automatycznie / RÄ™cznie (Przycisk) z brand orange selected
- Harmonogram: CiÄ…gĹ‚y / godziny / dni+godziny; karty per dzieĹ„ (wspĂłlne windowFrom/To w modelu)
- JEĹšLI / TO: badgeâ€™e, dashed CTA, okrÄ…gĹ‚a strzaĹ‚ka; bez zmian logiki/modali edycji

## 2026-07-29 â€” Profile wydruku na stanowisku

- SSOT: `backend/printing_profiles/` (`DOCUMENT_TYPE_TO_PRINT_PROFILE`, profile codes)
- Stanowisko mapuje drukarkÄ™ â†’ profil (nie dokument / moduĹ‚ WMS)
- Migracja `print_profiles_v1`: legacy `labels|shipping_label|invoice|order|other` â†’ profile; collapse DOCUMENTS
- FE `PrintersTab`: tylko 4 profile; `resolvePrintRoute` przez `profilesForPrinterKind`
- Resolution kolejki: `printer_resolution_service` â†’ `document_type_to_print_profile`

## 2026-07-29 â€” Browser PDF open + Agent GDI deploy

- `openPdfBlobInPrintViewer`: otwiera natywny blob PDF (bez HTML embed / bez noopener)
- Agent 1.4.0 zainstalowany in-place na E-HANDEL: `PdfShellPrint=False`, `WindowsGdiDocumentPrinter=True`, `PDFtoImage`+`pdfium` w Program Files; Host PID start 20:16:59
- DowĂłd pipeline: `pdf-driver.log` â†’ `pipeline=PDFium->GDI`

## 2026-07-29 â€” PodglÄ…d szablonĂłw wydrukĂłw = render (jak etykiety)

- WspĂłlny `TemplatePreviewShellModal`; etykiety i dokumenty uĹĽywajÄ… tego samego chrome
- Lista wydrukĂłw: â€žPodglÄ…dâ€ť â†’ PDF z silnika (`preview/pdf`), â€žUĹĽyciaâ€ť osobno; usuniÄ™to OtwĂłrzâ†’Firma z usage modal
- Karty: klik miniatury = podglÄ…d, body = edytor

## 2026-07-29 â€” Agent: PDF przez renderer, nie RAW

- `PdfPrintDriver`: PDFium (`PDFtoImage`) â†’ bitmap â†’ GDI `PrintDocument` (STA); **bez** `WindowsRawSpooler`
- `WindowsRawSpooler` tylko ZPL/EPL/ESC-POS/PCL/PostScript/raw (`RawPrintDriver`)
- `DriverFactory` (alias `PrintDriverResolver`): switch format â†’ `IPrintDriver`; dodano Image + native language tokens
- Lokalny â€žDruk testowyâ€ť tray nadal `PrintDocument` (GDI) â€” ta sama klasa Ĺ›cieĹĽki co PDF po renderze

## 2026-07-29 â€” Print dialog: szablon + miejsce wydruku

- Nowy `PrintDocumentDialog`: szablon (DTE), stanowisko (drukarka + Online/Offline), alternatywy PDF/przeglÄ…darka
- Prefs `sasist_print_document_prefs_v1` per typ dokumentu
- `default_printer_name` na liĹ›cie stanowisk; `template_version_id` w queue (stock/sale/production)
- UsuniÄ™to z UX sĹ‚owa Agent / kolejka / mapowanie

## 2026-07-29 â€” Print UX: packing session â‰  wszystkie wydruki

- `resolvePrintWorkstation` + `usePrintMethodFlow`: sesja pakowania **lub** available-for-me (1=auto, N=picker Online/Offline)
- DomyĹ›lnie Agent (bez pierwszego ekranu Agent/PrzeglÄ…darka/PDF); alternatywy dopiero â€žInna metodaâ€ť / offline / brak Agent
- Callery: dokumenty magazynowe/sprzedaĹĽ, produkcja, zwroty, Z-PZ, LabelPrintQueue
- Test print stanowiska bez zmian (workstation_id z edycji)
- UsuniÄ™to â€žRozpocznij pakowanieâ€¦â€ť z Ĺ›cieĹĽek poza gate pakowania

## 2026-07-29 â€” Print pipeline: packing session SSOT only

- Print FE (`usePrintMethodFlow`, `useQueuePrint`, `resolvePrintRoute`) reads only `packingSessionWorkstationId()` â€” no auth/me
- Without session â†’ â€žRozpocznij pakowanie i wybierz stanowisko.â€ť
- Test page â†’ WorkstationPrinterMapping (no PrintingDefaults); PrintJob.workstation_id set
- HistoryTab â†’ PrintJobs by workstation_id
- device_count skips EdgeDevice with legacy_printer_id (align with DevicesTab)

## 2026-07-29 â€” Stanowisko SSOT + Pakowanie (final architecture)

- UsuniÄ™to Settings â†’ UrzÄ…dzenia/Drukarki (menu + strony); redirect `/settings/printers|devices|/setup/printers` â†’ Stanowiska
- `user_wms_workstation_access` + `workstation_ids` w profilu WMS; admin checkboxy w AdministratorEditPage
- Gate tylko `/wms/packing/*` (`WmsPackingWorkstationGate`); sesja v3 = SSOT `workstationId`; `packing_station_id` = last-used
- Queue/capability: workstation mapping only (`NO_WORKSTATION` / `NO_WORKSTATION_MAPPING`); PrintJob: `workstation_id` + `created_by_user_id`
- Bez auto-fallback QZ/browser w `executePdfLabelPrint` / `resolvePrintRoute`

## 2026-07-29 â€” Printing cleanup po Sasist Agent

- `cloud-capability` â†’ Stanowisko + Agent online + mapowanie (bez `PrintingDefault`); query `workstation_id`
- FE: `usePrintMethodFlow` bierze `packing_station_id`; QZ tylko w `import.meta.env.DEV`
- `/settings/printers/*` â†’ redirect do Ustawienia WMS â†’ Stanowiska; usuniÄ™to tab â€žDruk (kolejka)â€ť z UrzÄ…dzeĹ„

## 2026-07-29 â€” Fix DTE Jinja loader for extends/include (production-card.pdf)

- Root: `_render_plain` / incomplete resolved sets used Environment(loader=None) or DictLoader without `base_document`
- Fix: `resolve_plain_twig` + `_ensure_system_dependencies` load filesystem BASE/PARTIALS into DictLoader
- Files: `_engine_backend.py`, `template_resolution_service.py`, `system_starter_library.py`

## 2026-07-29 â€” production-card.pdf HTTP 500 root cause


- Cause: DTE starter `production_card` uses `{% extends "base_document" %}` but `resolve_plain_twig` â†’ `_render_plain` (no Jinja loader) â†’ `TypeError: no loader for this environment specified` â†’ unhandled 500
- Fix: `document_engine_available` returns False for plain extends starters (legacy Jinja path); full `logger.exception` on PDF/HTML path + API re-raise after log
- File/line: `backend/document_templates/render/_engine_backend.py` `_render_plain` ~L85

## 2026-07-29 â€” Stanowiska = zakĹ‚adka UstawieĹ„ WMS (FE UX only)


- Shared `WmsSettingsChrome` + `WMS_SETTINGS_TABS` (Stanowiska as last tab â†’ `/settings/wms/workstations`)
- Removed header CTA â€žStanowiskaâ€ť; breadcrumbs: Ustawienia WMS â†’ Stanowiska â†’ [nazwa]
- Dropped `max-w-3xl` / private PageLayout shells; list rows + `WmsSettingsSection` / tokens
- Detail full-width; Agent status panel; Devices category cards + compact empty; Printers settings rows; History timeline + icons
- `useWmsSettingsSectionAnchor` no-op outside registry (sections usable without side nav)

## 2026-07-29 â€” Stanowiska UX + nawigacja (FE)


- Shared shell: `WorkstationTabShell`, `WorkstationCard`, `DeviceCard`, `WsStatusBadge`, `WorkstationDescList` (`max-w-3xl`)
- Tabs rebuilt: Agent description cards; Devices device cards; Printers mapping cards + Skonfigurowano badges; History timeline cards
- Nav: removed Stanowiska from DevicesSettingsModule tabs; devices index â†’ inventory (not workstations); tests assert WMS category active, Settings/UrzÄ…dzenia inactive

## 2026-07-29 â€” Stanowiska: Drukarki empty state vs UrzÄ…dzenia

- Root cause: Devices = EdgeDevice; Printers mapping = AgentPrinter only (empty after token-only pair)
- Fix: edge sync + GET devices/printers materialize AgentPrinter + legacy_printer_id; empty state only when zero discovered printers
- FE: mapping form copy; placeholder â€žwybierz drukarkÄ™â€ť
- Test: `test_printers_tab_uses_edge_discovered_printers`

## 2026-07-29 â€” Pairing blocker: Host crashed on spent pairing code

- Root cause: Tray persisted pairing code as `agent_api_key`; Host `EnsureRegisteredAsync` re-claimed it â†’ 401 â†’ no heartbeat
- Fix: Tray does not store pairing code; Host clears pairing-shaped ApiKey and skips register when token present
- Proven: register skip + heartbeat 200 + online + 4 devices against Railway
- TEMP diag logs (no secrets) on Agent/Backend/FE

## 2026-07-29 â€” Sasist Agent Tray UI/UX (SaaS desktop)

- Visual-only: Theme radii/typography/shadows, header (logo+name+badge+version), sidebar without brand block, PageShell centered max 960, Pairing onboarding card + SasistTextField 48px, soft status pills
- Build: Tray Release OK

## 2026-07-28 â€” Onboarding E2E: pairing code visible + flow


- Root cause: naive `expires_at` â†’ FE local parse â†’ immediate expire; poll cleared code; POST /pair then GET refetch race
- Fix: UTC-aware expires_at; FE parseApiUtcMs + sessionStorage code; no destructive refresh after pair; poll grace; default Agent tab; post-pair â†’ Devices â†’ Printers + test print
- Tests: pairing expires_at timezone assertion

## 2026-07-28 â€” WMS Stanowiska RC1 (Red Team blockers)


- RC1-1: no auto-pick workstation; `workstation_id` via `useQueuePrint` / session `packing_station_id` / label router; mapping then PrintingDefault
- RC1-2: removed Restart Agent UI + FE API client (`restartWorkstationAgent`)
- RC1-3: tenant stays panel SSOT (`DAMAGE_TENANT_ID` / `panelTenant`) â€” FE not inventing tenant truth beyond app pattern

## 2026-07-28 â€” WMS Stanowiska Medium/Low + Final audit (~92% PR)


- M1: batch serialize, history offset, pairing-status poll, visibility pause, event index
- M2/M3: FE split + Empty/Error states; warehouse filter; no tab double-fetch
- M4: business logs; no secrets; GET agents DEBUG
- M5/M6/Low: API cleanup, AddComputerModal removed, ApiKeys dead branches, Agents deprecation
- Deferred: is_default partial unique, settings.users permission pattern, Agents ops page
- Canvas final audit updated

## 2026-07-28 â€” WMS Stanowiska High Priority H1â€“H7

- H1: AgentTab poll 2.5s + TTL expire + auto â€žPoĹ‚Ä…czonoâ€ť
- H2: `claim_pairing_code` CAS single-use, rate-limit IP, audit issue/claim/fail
- H3: system keys hidden from API Keys; mutate blocked; workstation revoke/regen with allow flag
- H4: `assert_tenant_warehouse_scope` + tenant/warehouse checks on attach/claim
- H5: restart-agent â†’ 501 bez eventu historii
- H6: re-pair disconnect-first; `pairing_active` z hash+TTL
- H7: empty state + download + status/PC/OS/version/IP/uptime/sync
- Tests: 12 passed (`backend.tests.wms_workstations`)
- Audyt #2: High 7/7 closed; Prod readiness ~75%; Medium/Low open

## 2026-07-28 â€” WMS Stanowiska C1â€“C3 production blockers

- C1: `resolve_queue_printer_id` â†’ WorkstationPrinterMapping (SSOT) then PrintingDefault fallback; `workstation_id` on QueuePrintRequest
- C2: `register_agent_with_api_key` no longer commits; register+attach+events one transaction
- C3: one-shot `wms_data_migrations`; no keyâ†’empty-WS hijack
- Tests: 15 passed (workstations + print resolution)

## 2026-07-28 â€” WMS Stanowiska (miejsce pracy â‰  komputer)

- Model: `wms_workstations` + printer_mappings + events; 1 Agent max na stanowisko
- API: `/api/wms/workstations*` (pair/disconnect/devices/printers/history)
- Pair: kod `XXXX-XXXX-XXXX` 15 min â†’ register Agenta bez zmian protokoĹ‚u
- FE: lista + 5 zakĹ‚adek; jÄ™zyk biznesowy; API Keys bez tworzenia printer_agent
- Redirect: Devices/agents, AddComputer, setup/printers â†’ Stanowiska
- Migracja idempotentna agentĂłw/kluczy â†’ stanowiska (Tier1 schema)
- Testy: `backend/tests/wms_workstations/` â€” 5 passed

## 2026-07-28 â€” Release: restore self-contained (no .NET Runtime)

- Root cause: `bin\Release` (FDD) was copied over install; runtimeconfig had `frameworks[]`
- Pipeline OK: `publish-release.ps1` uses `--self-contained true -r win-x64`; Inno sources `publish\win-x64`
- Added Assert-SelfContained gate (refuse ship if `frameworks[]` / missing coreclr)
- Fresh setup: `dist\SasistAgentSetup.exe` (~50 MB); publish ~163 MB; installed Tray has `includedFrameworks`

## 2026-07-28 â€” Sasist Agent Design System

- Central Theme tokens (colors, Space 4â€“48, Type scale Displayâ†’Hint)
- Component kit in `DesignSystem/`; all pages wired to DS (no local styles)
- Empty states on Devices/Jobs/Logs; Motion pulse for loading
- Layout smoke PASS 100â€“200%; shots in `dist/ui-shots/`
- MVP/poll/backend untouched

## 2026-07-28 â€” Sasist Agent UI quality: MVP + no flicker

- Root cause of flicker: timer called full page rebuild (`Controls.Clear`) every poll
- Fix: `ShellPresenter` / `IPageView` â€” structure once; poll updates labels/cards in place only
- Sidebar: `TableLayoutPanel` AutoSize rows; width from longest nav label
- Layout smoke PASS 100â€“200% (incl. 175%); stability 60s: rebuilds=0
- Cosmetics still frozen until UI stays stable

## 2026-07-27 â€” Sasist Agent layout foundation (DPI freeze)

- Fixed: PerMonitorV2 + AutoScaleMode.None; removed Absolute/Location layouts; AutoSize labels; card PreferredSize
- `--layout-smoke` audits clip/overlap at simulated 100/125/150/200% â€” all PASS
- Visual redesign paused until layout stays green

## 2026-07-27 â€” Sasist Agent 1.2.0 UI from scratch (Sasist DS)

- Discarded prior WinForms polish; new shell (top bar + 320px sidebar + pages)
- Tokens from FE design-system; custom cards/buttons/nav/toggles; PerMonitorV2, AutoScale none
- Pages: Status 6 cards, Devices printer cards, History list, Logs filters, Diagnostics sections, Test checklist, Settings rows+toggles, Updates card
- Screenshots: `sasist-agent/dist/ui-shots/`

## 2026-07-27 â€” Sasist Agent 1.1.1 modern UI redesign

- Theme system (light/dark), Fluent icons, rounded cards, modern nav
- Pages: Status cards, Devices cards + test print, Jobs timeline, color Logs, sectioned Diagnostics, Test suite, Settings, Updates
- No architecture/backend/protocol changes

## 2026-07-27 â€” Sasist Agent 1.1.0 desktop product window

- MainForm management center (Status / Devices+test / Jobs / Logs / Diagnostics / pairing)
- Installer: PrepareToInstall stop+taskkill before copy; version 1.1.0; CloseApplications=force
- Verified upgrade 1.0.0â†’1.1.0 silent: exit 0, no DeleteFile code 5; service Auto+Running; Tray MainWindowTitle=Sasist Agent

## 2026-07-27 â€” Sasist Agent customer UX (Tray)

- Status / UrzÄ…dzenia / Diagnostyka as separate windows; no tech IDs on main screen
- Pairing: â€žPoĹ‚Ä…cz z Sasistâ€ť + â€žKod poĹ‚Ä…czeniaâ€ť only; tray menu simplified (PoĹ‚Ä…czono, not Online)
- Friendly errors; updates copy: â€žMasz zainstalowanÄ… najnowszÄ… wersjÄ™.â€ť
- INSTALACJA.md rewritten for warehouse owners

## 2026-07-27 â€” Stage 5 Final Cutover (Agent product)

- Official path only: `sasist-agent` â†’ `SasistAgentSetup.exe`
- Root build/release/CI retargeted; Python agent â†’ `legacy/sasist-printer-agent`
- Backend download default `SasistAgentSetup*` (+ legacy prefix compat)
- Report: `docs/sasist-agent/STAGE5-CUTOVER-REPORT.md`

## 2026-07-27 â€” Sasist Agent UX pairing (pre-release)

- UsuniÄ™to Server URL z UI; API wbudowane (`https://api.sasist.pl`, Dev: env / appsettings.Development)
- Ekran â€žKod parowaniaâ€ť + Tray: Online, firma, urzÄ…dzenia, OdĹ‚Ä…cz, branding (logo/ico)
- Przyjazne bĹ‚Ä™dy; `company_name` w odpowiedzi register; `status.json` dla Tray
- Docs: INSTALACJA.md uproszczona pod klienta

## 2026-07-27 â€” E2E install test + ship fixes

- Full client-path E2E on Windows; report: `sasist-agent/dist/E2E-REPORT.md`
- Fixes: ProgramData ACL, plugin parameterless ctor, re-register printers, HttpClient BaseAddress, PDF spooler under LocalSystem, Host wait-for-config
- Final `SasistAgentSetup.exe` rebuilt after fixes

## 2026-07-27 â€” Sasist Agent Windows installer (ship)

- Tray (`Sasist.Agent.Tray`): Online/Offline, logi, diagnostyka, restart usĹ‚ugi, setup URL+API Key â†’ DPAPI + register
- `scripts/publish-release.ps1` â†’ `publish/win-x64` + `dist/SasistAgentSetup.exe` (Inno Setup)
- Instalator: usĹ‚uga `SasistAgent`, ProgramData, config.default, Menu Start, start usĹ‚ugi
- Docs: `sasist-agent/INSTALACJA.md`

## 2026-07-27 â€” Architecture RC v1.0

- Core purged of Printing; `IAgentTransport` + ModuleRegistry + plugin loader
- Host `CompatPrintingTransport`; DPAPI secrets; ACL/replay/rate-limit; no legacy register
- Docs: ARCHITECTURE/RC-1.0/security/FREEZE aligned; WS marked Planned
- Designation: SASIST AGENT ARCHITECTURE v1.0 RELEASE CANDIDATE

## 2026-07-27 â€” Architecture audit (pre-1.0)

- Read-only validation: Core still holds printing compat + hardcoded job routing â†’ not v1.0 Ready
- Scores & blockers in session report; docs overclaim WS/`/api/agent/v1`
- Plugin drop-in false until Host/runtime generic; registry/EventBus OK

## 2026-07-27 â€” Edge Computing Core: Device Registry + delta sync

- SDK/Core: config, healthScore, DeviceEventBus, differential sync, remote actions (Refresh/Diagnostics/Logs)
- Backend: `edge_devices*` tables + `/agent/devices/sync|actions|events`
- FE: `/settings/devices` hierarchy; scaffolds Scanner/Scale/Camera/RFID
- ADR-007; printing compat retained

## 2026-07-27 â€” Edge Device Management foundation

- SDK: `EdgeDevice`, `CapabilityDescriptor`, operational status, remote action contracts
- Core: `DeviceManager` + `RefreshDevices`; Printing uses `WindowsPrinterDeviceProvider`
- Backend parallel: `/api/agent/devices`, `/device/{id}`, `/modules` (projection from printers)
- FE: `frontend/src/devices/*`; Settings â€žUrzÄ…dzeniaâ€ť + type filters; `/printing` kept
- Docs: device.md, ARCHITECTURE, OpenAPI, ADR-006

## 2026-07-27 â€” Label cutover: PrintingRouter + prefer_sasist_agent

- Central `frontend/src/printing/router` (resolve, execute PDF labels, telemetry)
- Z-PZ / Return Labels / LabelPrintQueue routed via flag + zpl gate; QZ kept as fallback
- PrintMethodDialog: Sasist Agent first; QZ Legacy behind â€žPokaĹĽ metody awaryjneâ€ť
- Smoke: `docs/sasist-agent/smoke-cutover-labels.md`

## 2026-07-27 â€” Sasist Agent Etap 1: drivers + capabilities + QZ map

- `IPrintDriver` Pdf/Zpl/Raw/Html; RAW spooler; PrintResult + logging
- Heartbeat `supported_formats` â†’ `capabilities_json`; queue rejects unsupported formats
- `prefer_sasist_agent` (warehouse settings API + UI); `docs/sasist-agent/qz-migration-map.md` + TODOs (bez przepiÄ™cia)

## 2026-07-27 â€” Sasist Agent Etap 1: scaffold .NET

- `sasist-agent/`: Sdk + Core + Printing + Host (Windows Service worker)
- Compat `/api/printing` (PDF poll); diagnostics CLI; 4 unit tests
- Build Release OK; ZPL/RAW + installer + tray = kolejne incrementy

## 2026-07-27 â€” Sasist Agent: freeze protocol v1

- Decyzja uĹĽytkownika: `freeze v1`
- `docs/sasist-agent/FREEZE-v1.md`; Stage 0 w migration.md zamkniÄ™ty
- Etap 1 (.NET Host) odblokowany

## 2026-07-27 â€” Sasist Agent Etap 0: peĹ‚ny DoD dokumentĂłw

- Pakiet `docs/sasist-agent/`: ARCHITECTURE, OpenAPI, WS protocol, plugin SDK, device, diagnostics, update, security, versioning, ADR-001..005, migration, README
- Gate: freeze protocol v1 przed Etapem 1 (.NET Host)

## 2026-07-27 â€” Sasist Agent: Etap 0 w planie + ARCHITECTURE.md

- Plan zaakceptowany z **Etapem 0 (Architektura)** przed kodem Host
- SSOT: `docs/sasist-agent/ARCHITECTURE.md` â€” Core, IAgentModule, agents/devices, protocol v1, API/WS, Module Bus
- Etapy: 0 Architektura â†’ 1 Agent â†’ 2 Backend â†’ 3 FE â†’ 4 Migracja â†’ 5 Cleanup
- Tech: **.NET 8**; tabele extend w E2, rename w E5; poll = protocol 0 compat

## 2026-07-27 â€” Sasist Agent: architektura + plan migracji (analiza)

- Analiza `printing` + `sasist-printer-agent` + QZ; rekomendacja **.NET 8**
- Cel: uniwersalny edge agent (druk = moduĹ‚); rename Sellasist/Cloud Print â†’ Sasist Agent
- Plan: Agent â†’ Backend â†’ FE â†’ migracja â†’ usuniÄ™cie QZ/Sellasist (bez peĹ‚nej implementacji w tej sesji)

## 2026-07-27 â€” Cloud Print: repair/queue bez Ĺ›lepych 400/409

- `repair`: brak aktywnego agenta â†’ 200 `{ success:false, reason:"NO_ACTIVE_AGENT" }` (bez 400)
- `GET /printing/cloud-capability` â€” ready tylko przy default + online agent
- FE `usePrintMethodFlow`: offline default â†’ dialog, nie auto-queue; Cloud tile disabled
- Queue 409 z `code` (AGENT_OFFLINE / PRINTER_INACTIVE) jako fallback

## 2026-07-26 â€” StarterTemplateFlow (wspĂłlny model starterĂłw)

- `components/templates/starterFlow`: dialog + hook + staĹ‚e CTA
- Starter immutable; CTA â€žUĹĽyj starteraâ€ť; kreator kopii â†’ edytor uĹĽytkownika
- Etykiety (presety) + wydruki (galeria/detail); ReadyTemplateCard `mode="starter"|"owned"`

## 2026-07-26 â€” PrintMethodDialog (systemowy wybĂłr wydruku)

- WspĂłlny dialog: `components/printing/PrintMethodDialog` + `usePrintMethodFlow`
- Gdy jest domyĹ›lna drukarka Cloud (`/printing/defaults` A4) â†’ od razu Cloud Print, bez okna
- W przeciwnym razie kafle: Drukuj / Sasist Cloud Print / Pobierz PDF
- PodpiÄ™te: karty produkcyjne + dokumenty magazynowe (lista/detail)
- Cloud queue: `production_batch_card`, `production_order_card`

## 2026-07-26 â€” Layout Master: wydruki = kompozycja Systemu Etykiet

- SSOT: `templatesListLayout.ts`, `readyTemplatesLayout.ts`
- Lista wydrukĂłw: ten sam root/rail/toolbar/rows/grid co etykiety
- Gotowe/Startery: ten sam page/CTA/filter tabs/sections/grid/empty
- UsuniÄ™to lokalny Sellasist filter panel z wydrukĂłw; CTA z PageHeader â†’ in-page

## 2026-07-26 â€” Szablony = kategoria flyout (nie hub)

- UsuniÄ™to `TemplatesHubLayout` / tabs miÄ™dzy moduĹ‚ami
- Sidebar: Szablony (`opensSideFlyout`) â†’ etykiety / wydruki / wiadomoĹ›ci / eksporty
- KaĹĽdy moduĹ‚: wĹ‚asny PageHeader + wĹ‚asne zakĹ‚adki; `/templates` â†’ redirect labels
- Docs IA + testy `settingsNavIa` / `phaseBIa` zaktualizowane

## 2026-07-26 â€” Szablony wydrukĂłw = te same komponenty co etykiety

- UsuniÄ™to lokalne `DocumentStarterCard` / `DocumentTemplateListCard`
- Import: `ReadyTemplateCard`, `TemplateListRow`, `READY_TEMPLATES_GRID_CLASS` z LabelSystem
- UogĂłlnione sloty `thumbnail` (bez drugiej wersji UI)

## 2026-07-26 â€” IA hub Szablony (superseded â€” flyout category)

- Historycznie: jeden wpis `/templates` z tabs miÄ™dzy sekcjami
- ZastÄ…pione: kategoria flyout bez hub screen (patrz wpis powyĹĽej)

## 2026-07-26 â€” Szablony wydrukĂłw: powrĂłt do ERP Design System

- Filtry: `ListFilterEmbeddedShell` + Filtruj/WyczyĹ›Ä‡/Ukryj (jak Produkty) â€” usuniÄ™to LightFilters
- Toolbar: `SuccessButton` Eksportuj + `PrimaryButton` Nowy szablon (bez â€žWiÄ™cejâ€ť)
- Lista: `ListTile` + `StatusBadge` + `SecondaryButton` (wzorzec Produkcja)
- Startery: layout Ready Templates (300px, gap-5, max 5 kolumn)

## 2026-07-26 â€” Szablony wydrukĂłw UX polish (pass 2)

- Karty listy: hierarchia nazwaâ†’typâ†’statusâ†’uĹĽywany jako/wâ†’edycja; StatusBadge DS; Edytuj + menu WiÄ™cej
- Filtry: domyĹ›lnie Szukaj/Typ/Status; reszta w â€žWiÄ™cej filtrĂłwâ€ť
- Startery: produktowa hierarchia, staĹ‚a miniatura 132px, siatka jak Label Ready
- Bez zmian API/logiki

## 2026-07-26 â€” Szablony wydrukĂłw UI â‰ System Etykiet

- Lista: karty zamiast tabeli ERP; lekkie filtry (Szukaj/Typ/Kategoria/Status/ĹąrĂłdĹ‚o + WiÄ™cej)
- Startery: kompaktowe karty (miniatura + SzczegĂłĹ‚y/UĹĽyj); usuniÄ™te zbÄ™dne H1/podtytuĹ‚y
- Primary CTA `brandPrimaryButtonClass`; spĂłjnoĹ›Ä‡ spacing/radius/hover z Label System
- Bez zmian API / logiki biznesowej

## 2026-07-26 â€” Dokumentacja IA

- Dodano `docs/INFORMATION_ARCHITECTURE.md` (zasady, menu, kanony, legacy, przyszĹ‚oĹ›Ä‡)
- Audyt IA uznany za zamkniÄ™ty w dokumentacji
- Bez zmian kodu aplikacji

## 2026-07-26 â€” IA final cleanup audit (bez kasowania)

- IA uznana za zakoĹ„czonÄ…; menu/routing spĂłjne
- Kandydaci osobnego PR: BarcodeManagement, PickingWaves, PlanningPlaceholder, App BatchesListPage import, WmsProductionPutawayRedirect
- Canvas: `ia-final-cleanup.canvas.tsx`

## 2026-07-26 â€” IA Faza B: orphans / stuby

- Magazyn flyout: Szkody, ProtokoĹ‚y szkĂłd (`/office/damages*`) â€” bez nowego moduĹ‚u Office
- Redirect: `/waves`â†’`/wms/picking`, `/planning/*`â†’`/purchasing/dashboard`, doc CFâ†’orders, ksefâ†’series
- Legacy: `/inventory`; tech: `report/*` bez zmian; Barcode = DELETE_CANDIDATE (plik zostaje)
- Pliki stubĂłw zachowane z komentarzami; testy phaseBIa + settingsNavIa OK

## 2026-07-26 â€” Kwalifikacja orphan routes (pre Faza B)

- Office Damages: produkcyjny (scaliÄ‡/menu); report/*: tech Puppeteer
- Martwe UI: Barcode, Waves stub, Planning, KSeF, Doc custom-fields
- Legacy: /inventory; BE waves/inventory nie kasowaÄ‡
- Bez zmian kodu â€” decyzja produktowa

## 2026-07-26 â€” KoĹ„cowy audyt IA (pre Faza B)

- Brak nowych dual-entry do tego samego ekranu po kanonie /labels
- Orphans/stuby: waves, planning, barcode, office, /inventory, /report/*
- Werdykt: globalne menu zamkniÄ™te; Faza B = lokalne Magazyn

## 2026-07-26 â€” IA: jeden System Etykiet (/labels)

- UsuniÄ™to Ustawienia â†’ Szablony etykiet (duplikat)
- Redirect: `/admin/print-templates/*`, `/system-etykiet/*` (+ legacy prints) â†’ `/labels/*`
- Bez zmian LabelSystem / API Â· testy settingsNavIa OK

## 2026-07-26 â€” IA Faza A: Ustawienia menu

- PrzywrĂłcono: Import, Pule stanĂłw, Drukarki, Szablony etykiet/dokumentĂłw/wiadomoĹ›ci
- Rename: â€žSzablony wydrukĂłwâ€ť â†’ â€žSzablony etykietâ€ť (print-templates)
- Tylko mainNavConfig + navActive + test Â· **No push.**

## 2026-07-26 â€” Audyt IA / nawigacji (raport)

- PeĹ‚ny przeglÄ…d App.tsx + mainNavConfig + pages; bez zmian kodu
- GĹ‚Ăłwne luki UstawieĹ„ po redesignie sidebara: drukarki, document-templates, import, message-templates, stock-pools
- Canvas raportu: `ia-navigation-audit.canvas.tsx`

## 2026-07-26 â€” Ustawienia: Szablony wydrukĂłw w menu

- PrzywrĂłcono pozycjÄ™ w flyoucie Ustawienia â†’ `/admin/print-templates`
- Tylko nawigacja; test `settingsNavIa` zaktualizowany

## 2026-07-26 â€” Realizacja: produkcja + rozlokowanie UX

- Produkuj +1/+5 â†’ ZakoĹ„cz produkcjÄ™; bez â€žUzupeĹ‚nij planâ€ť
- Rozpocznij rozlokowanie (1 PW direct); usuniÄ™te Rozlokuj w wierszu
- Bez zmian API Â· tsc OK Â· **No push.**

## 2026-07-26 â€” Realizacja papierowa: UX magazyniera

- NagĹ‚Ăłwek: numer + status + postÄ™p; bez ERP/fioletu
- Karty lokalizacji (orange active); lot bez dropdown gdy 1
- Primary full-width PotwierdĹş pobranie Â· ProgressBar size lg
- Bez zmian API Â· tsc OK Â· **No push.**

## 2026-07-26 â€” Nowe zlecenie: kafelki rekomendacji MRP

- Tiles Dzisiajâ€¦30 dni + Maksimum; qty sync; KPI bez opisĂłw
- Dane z istniejÄ…cego demand planning + max_producible
- Bez zmian API create Â· tsc OK Â· **No push.**

## 2026-07-26 â€” Zlecenia: UX kart + globalne tony statusĂłw

- Filtry: â€žWszystkieâ€ť; bez Operator w toolbarze
- Karta bez Operatora; progress niebieski/zielony; Braki = warning
- `executionStatusTone` / `productionProgressTone` + tone `primary` (orange)
- Bez API/logiki Â· tsc OK Â· **No push.**

## 2026-07-26 â€” Symulacja planu: UX empty state

- EmptyState z CTA; ukryte KPI/Create przy lines=0; zielony tylko przy produktach
- Bez zmian backend/MRP Â· tsc OK Â· **No push.**

## 2026-07-26 â€” Symulacja planu: diagnostyka pustego wyniku

- `diagnostics` w odpowiedzi simulate (codes, skip_counts, empty_reason_*)
- Logi INPUT + SKIP/ACCEPT; UI pokazuje powĂłd z API
- Bez zmiany filtrĂłw MRP Â· testy OK Â· **No push.**

## 2026-07-26 â€” Symulacja planu: empty/success UI

- Bug: pusty `materials[]` â†’ komunikat â€žSurowce wystarczajÄ…â€ť + zera w KPI
- Empty state przy 0 produktach; Create disabled; loading bez zer
- Request simulate moĹĽe dostaÄ‡ `lines` z rekomendacji UI (bez zmiany MRP)
- **No push.**

## 2026-07-26 â€” SzczegĂłĹ‚y partii: UX jak dokument ERP

- PageHeader, StatusBadge, Card; bez fioletu / â€žInterfejs ERPâ€ť / ĹĽĂłĹ‚tego boxa
- Akcje: Rozpocznij produkcjÄ™, PrzejdĹş do realizacji, Drukuj kartÄ™, Anuluj
- Informacje 2-kol, wiÄ™kszy ProgressBar (orange), kompaktowy timeline
- Bez zmian API/routingu/stanĂłw Â· `npm run build` OK Â· **No push.**

## 2026-07-26 â€” Modal â€žNowa partia masowaâ€ť â†’ Sasist UI Kit

- Dialog (xl, 85vh), Stepper, ListTile, Card, Primary/Secondary; bez fioletu
- UkĹ‚ad 1-kolumnowy; checkbox w Podsumowaniu; stopka Anuluj | UtwĂłrz partiÄ™
- Bez zmian API/walidacji/krokĂłw Â· `npm run build` OK Â· **No push.**

## 2026-07-26 â€” Planowanie: ekran decyzyjny (UX)

- KPI Ă—4; rekomendacje = Card/produkt + 1Ă— UtwĂłrz partiÄ™; usuniÄ™te 3 karty zbiorcze
- Tabela slim (bez osi czasu / Dlaczego / Rekom. / MoĹĽna); pod aktywnymi partiami
- Aktywne partie: bez Operatora, StatusBadge, wyĹĽsze wiersze; bez KPI embedded
- Symuluj/OdĹ›wieĹĽ w Toolbar; bez zmian API/MRP Â· `npm run build` OK Â· **No push.**

## 2026-07-26 â€” NagĹ‚Ăłwki: ujednolicony vertical rhythm

- DS PageHeader: separator + items-center + toolbar mt-4 + children mt-4/5
- DocumentsSectionShell â†’ DS PageHeader; layout PageHeader â†’ typography.h1
- Produkcja ERP: treĹ›Ä‡ w children; usuniÄ™te `!space-y-*` / lokalne gap-y
- SettingsModuleStack: bez lokalnego border-t pod tytuĹ‚em
- Bez API/logiki/routingu Â· `npm run build` OK Â· **No push.**

## 2026-07-26 â€” NagĹ‚Ăłwki: jeden standard (Produkcja + audit)

- Produkcja ERP tabs: PageHeader Title+Actions; usuniÄ™te marketing opisy; CTA `comfortable`
- SecondaryButton default density â†’ `comfortable` (jak Primary)
- Strip fluff: Dokumenty, Asortyment (zestawy/producenci), RentownoĹ›Ä‡, Settings, Analiza placeholders
- Empty states zostawione; bez API/logiki/routingu Â· `npm run build` OK Â· **No push.**

## 2026-07-26 â€” Pulpit Produkcji: podglÄ…d, nie hub nawigacji

- UsuniÄ™to Terminal WMS / szybkie akcje / linki do terminali; listy peĹ‚nej szerokoĹ›ci (max 5)
- KPI bez linkĂłw; empty states uproszczone Â· `npm run build` OK Â· **No push.**

## 2026-07-26 â€” Typografia Produkcji = standard DokumentĂłw

- UI Kit `typography.ts`: h1/h2/section/label/caption/pageDesc/metric/body/tableHead wg Documents
- StatusBadge + density compact: floor `text-xs` (bez 10px); Production layout tokens + bump micro type
- Bez zmian layoutu/funkcji Â· `npm run build` OK Â· **No push.**

## 2026-07-26 â€” Kreator zlecenia produkcyjnego (UX)

- `/production/orders/new`: Stepper + 3 sekcje; preview/create batch (istniejÄ…ce API)
- Planowanie = Symulacja MRP; create CTA osobno; highlight na liĹ›cie zleceĹ„
- UI Kit: Stepper (nowy), Card, SearchInput, MetricCard, ProgressBar, StatusBadge
- `npm run build` OK Â· **No push.**

## 2026-07-26 â€” Zlecenia produkcyjne: lista robocza (UI)

- `ProductionOrdersPage`: ListTile zamiast tabeli; Toolbar + SearchInput/Select; StatusBadge; ProgressBar gdy dostÄ™pny
- Mapowanie `progressPercent` z istniejÄ…cego `progress_percent`; menu akcji `align=end`
- Bez zmian API/routingu/logiki Â· `npm run build` OK Â· **No push.**

## 2026-07-26 â€” Pulpit Produkcji: UX centrum operacyjnego

- `ProductionDashboardPage` + `ProductionDashboardBatchGrid`: biaĹ‚e karty, KPI MetricCard, ProgressBar (+ ton `info`)
- Sekcje: Do rozlokowania / W produkcji / Gotowe do WMS / Uwaga + aktywnoĹ›Ä‡ / zakoĹ„czenia / szybkie akcje
- UI Kit only; bez zmian API/routingu/logiki Â· `npm run build` OK Â· **No push.**

## 2026-07-26 â€” Szkody: lekki polish (bez przebudowy)

- Modal Magazyn uproszczony; Raporty = lista + Pobierz PDF
- Biuro: tabela + StatusBadge + badge decyzji + szukaj/filtr
- `npm run build` OK Â· **No push.**

## 2026-07-26 â€” UX Polish: Szkody (PL + UI Kit)

- `DamageReportsPanel` + Office damages/reports: peĹ‚ne spolszczenie UI
- WspĂłlne `damageUiLabels.ts`; bez zmian API/logiki
- `npm run build` OK Â· **No push.**

## 2026-07-26 â€” Magazyn: katalog tylko w widoku regaĹ‚u

- PrzywrĂłcono rail 360px w gĹ‚Ăłwnym Magazynie (przed siatkÄ… z 06da2001)
- `presentation="catalog"` wyĹ‚Ä…cznie po dwukliku regaĹ‚u
- `npm run build` OK Â· **No push.**

## 2026-07-26 â€” UX Polish: komunikaty Magazyn

- KrĂłtkie dialogi/toasty/placeholdery/przyciski (Magazyn + projektowanie + trasy)
- UsuniÄ™to instrukcje typu â€žKliknijâ€¦ / MoĹĽeszâ€¦â€ť; bez zmian logiki/API
- `npm run build` OK Â· **No push.**

## 2026-07-26 â€” WarehouseModuleLayout + wspĂłlny LeftRail

- `WarehouseModuleLayout` / `WarehouseLeftRail` / `WarehouseRailSection`
- Taby Magazyn | Projektowanie | Trasy; Eksport na belce; Trasy content w lewym railu
- Panele bez wĹ‚asnego chrome; build OK Â· **No push.**

## 2026-07-26 â€” Designer: regresje UI po migracji do UI Kit

- PrzywrĂłcono widocznoĹ›Ä‡ Magazyn/Sklepowy oraz Drzwi/Brama (flex `min-w-0` zamiast dual `fullWidth`)
- Rail: biaĹ‚e `surface.page`; active `ring-inset`; SegmentedControl gap + nowrap
- Generuj ukĹ‚ad â†’ `SuccessButton`; build OK Â· **No push.**

## 2026-07-26 â€” Etap 4: Warehouse Designer â†’ Sasist UI Kit

- Migracja toolbar/rails/routing/modals/canvas tools na design-system
- UsuniÄ™to `warehouseUiSkin` â†’ `warehouseChrome`; Primary `intent=warning`
- Residual: MainView editors + TemplateCreator + ciÄ™ĹĽkie modale
- Raport: `memory/ui-kit-designer-migration-report.md` Â· **No push.**

## 2026-07-26 â€” Sasist UI Kit Etap 3 (hardening)

- ESLint `sasist-ui-kit`: blok magicznych klas / nowych wysp tokenĂłw
- Density na komponentach; playground `/design-system`; README button rules
- UsuniÄ™to `WarehouseCardButton`; metryki `npm run ui-kit:metrics` Â· **No push.**

## 2026-07-26 â€” Sasist UI Kit (Etap 1â€“2)

- `design-system/tokens/*` + komponenty (Button suite, Card, Input, Status, SegmentedControl, Toolbar, PageHeader, â€¦)
- Lokalne wyspy â†’ fasady kit; Magazyn `CardButton` z design-system
- Raport: `memory/ui-kit-migration-report.md` Â· **No push.**

## 2026-07-26 â€” UI: ujednolicenie CardButton w Projektowaniu

- `WarehouseCardButton` â€” wspĂłlny styl card (radius ~11, border, cieĹ„)
- Pasek: status tekstowy â†’ select h-10 â†’ Zapisz; bez badge
- PodpiÄ™te: Generuj/Nowy szablon, Magazyn/Sklep, Drzwi/Brama, Raporty/Szkody Â· **No push.**

## 2026-07-26 â€” Domain: warehouse_special_placements

- Nowa tabela map markers (role + x/y); `locations` = toĹĽsamoĹ›Ä‡ operacyjna
- Migracja START/PACK/DOCK z locations â†’ placements; clear special geometry
- DELETE/POST/PUT special-location â†’ placements only; dokumenty nienaruszone
- `get_special_locations_xy` z placements Â· **No push.**

## 2026-07-26 â€” DELETE special-location: 409 zamiast RestrictViolation 500

- Pre-check `stock_documents.location_id`; uĹĽywane â†’ rollback + HTTP 409 (PL msg)
- `IntegrityError` / `RestrictViolation` â†’ 409 (nigdy 500); to samo przy replace PICK_START
- FE: snackbar przy 409; testy jednostkowe delete
- Architektura: preferowane odpiÄ™cie od layoutu zamiast hard DELETE gdy rekord jest w historii Â· **No push.**

## 2026-07-26 â€” Skin: Projektowanie UI = Magazyn chrome

- WspĂłlne `warehouseUiSkin.ts`; rails `#f7f8fa`, search ring/orange, karty `rounded-xl/2xl`
- Hall mapy + surround w layout mode; tool groups white+ring
- Bez zmian narzÄ™dzi / workflow / occupancy Magazynu w Projektowaniu Â· **No push.**

## 2026-07-26 â€” UX regaĹ‚u: karta KPI (scanability)

- Inline detail: duĹĽy % zajÄ™toĹ›ci + â€žN z M lokalizacji zajÄ™tychâ€ť; bez wierszy Wolne/Razem
- ObjÄ™toĹ›Ä‡ jako osobna sekcja meta; tylko prezentacja Â· **No push.**

## 2026-07-26 â€” UX regaĹ‚u: szczegĂłĹ‚y in-place zamiast tooltipa

- UsuniÄ™ty ciemny hover popup obok regaĹ‚u
- Zaznaczony regaĹ‚ pokazuje dane wewnÄ…trz kafelka (occupancy SSOT); hover tylko rozjaĹ›nia
- Pasek zajÄ™toĹ›ci bez zmian; tsc OK Â· **No push.**

## 2026-07-24 â€” Unify Magazyn â†” Projektowanie UI (v1)

- Shared: `WarehouseModeContext`, `WarehouseShell`, `WarehouseZoomControls`, `warehouseMapHall`, `features/registry`
- Designer owiniÄ™ty w Provider + Shell; Canvas: wspĂłlne biaĹ‚e tĹ‚o/`p-0`/floating zoom; edit toolbar tylko Reset
- Bez zmian logiki DnD/zoom physics/API/routing; bez top-level `mode=routing`
- tsc OK Â· **No push.**

## 2026-07-26 â€” Projektant Magazynu: globalny spacing Layout 2.0

- `SettingsModuleStack` + tokeny `pageModuleTabsOffsetClass` / `pageModuleContentOffsetClass`
- UsuniÄ™te lokalne mt-2/mt-3/mt-4 miÄ™dzy breadcrumb â†’ tabs â†’ content
- Workspace pills (Projektowanie/Trasy) przeniesione pod gĹ‚Ăłwne taby
- Audyt: `memory/erp-page-layout-audit.md`
- tsc OK Â· **No push.**

## 2026-07-26 â€” Magazyn: SSOT lokalizacji produktĂłw + zajÄ™toĹ›Ä‡ regaĹ‚u

- Nowy indeks: `productLocationIndex.ts` (inventory âŞ assigned, layout UUID only)
- Ujednolicono: search, map highlight, sidebary, klik regaĹ‚u, side-view occupancy
- Pasek zajÄ™toĹ›ci na regale + hover tooltip (bez duĹĽych kart)
- tsc + build OK Â· **No push.**

## 2026-07-26 â€” AppOverlayPortal migration (ErpShell overlays)

- Migrated inline `fixed inset-0` drawers/sheets/modals under ErpShell â†’ `AppOverlayPortal` (Pattern A)
- z-index bumped to â‰Ą250 (drawers) / â‰Ą280 (center sheets) so overlays sit above NavFlyout (z-200)
- PurchasingRightDrawer: already `createPortal`; z bumped to 250/251 + `APP_OVERLAY_Z`
- Skipped: ConfirmModal / other already-portaled, WMS terminal intentional shells, tiny menu catchers
- `npx tsc --noEmit` OK Â· **No push.**

## 2026-07-26 â€” AppOverlayPortal: Drawers/Sheets nad sidebarem

- Przyczyna: ErpShell content `z-0` vs sidebar `z-30` (stacking context)
- SSOT: `components/overlay/AppOverlayPortal.tsx` â†’ `document.body`
- Zmigrowano ~146 overlayĂłw (m.in. Raporty/Szkody Magazyn, drawers ERP, modale designer, WMS)
- `WarehouseDocumentOverlayPortal` = alias AppOverlayPortal
- tsc + build OK Â· **No push.**

## 2026-07-26 â€” Projektant Magazynu: cleanup nagĹ‚ĂłwkĂłw UI


- UsuniÄ™ty tytuĹ‚ â€žProjektowanie magazynuâ€ť (breadcrumb + actions w jednym rzÄ™dzie)
- UsuniÄ™te â€žDopasuj do ekranuâ€ť z zoomu mapy (zostaje â’ / % / +)
- Lewy panel: bez â€žPulpitâ€ť / â€žMagazynâ€ť â€” od razu Raporty / Szkody
- Bez zmian logiki / geometrii / paneli
- **No push.**

## 2026-07-26 â€” Projektant Magazynu: UX polish (bez geometrii)

- UsuniÄ™te szare placeholdery lokalizacji (RackSideViewGrid + MapLocationVisualizationLayer)
- Panel Produkty: biaĹ‚e karty/miniatury (object-contain)
- NagĹ‚Ăłwek: â€žProjektowanie magazynuâ€ť; dropdown magazynu po prawej bez â€žMagazyn:â€ť
- ZajÄ™te/Wolne: lokalizacje z qty>0 (`isBinOccupiedByQuantity`); total z API `*_location_count`
- Viz ZajÄ™te/Wolne: tint caĹ‚ych lokalizacji, bez szarego dimmingu
- tsc + build OK Â· **No push.**

## 2026-07-26 â€” Primary Button Design System (enforcement complete)

- Jeden Primary: `PrimaryButton` + `brandPrimaryButtonClass` (wzorzec â€žDodaj uĹĽytkownikaâ€ť)
- Migracja ERP CTA (Settings/Orders/Documents/Assortment/Production/Analysis/Warehouse/Complaints/Carts/â€¦) z blue/slate/cyan/violet â†’ orange DS
- Shared: `ProductLikePageLayout`, `ListPageCreateLink`, `cartsDarkCtaClass`, tokeny purchasing/filter/printQueue â†’ alias do SSOT
- `npx tsc --noEmit` OK Â· `npm run build` OK
- **No push.**

## 2026-07-26 â€” PrimaryButton DS wave (slate-900/800 CTAs)

- Migrated remaining ERP solid slate Primary CTAs â†’ `PrimaryButton` / `primaryButtonClassName`
- Confirmed list + scan extras (orders modals, purchasing, ops filters/alerts, auth, ErrorBoundary, labels color apply)
- Left: WMS/damage, nav pills, badges/toasts/pagination, icon boxes
- **No push.**

## 2026-07-26 â€” PrimaryButton DS wave (remaining CTAs)

- Migrated remaining solid blue/violet/cyan/indigo Primary CTAs â†’ `PrimaryButton` / `brandPrimaryButtonClass` / `primaryButtonClassName`
- Includes: consolidation segment modal, customers notes/GUS, inventory traceability, complaints ops/wizard/shipments, direct sales customer+discount, production shortages/composition/monitoring, assortment labels, LocationPicker, fulfillment warehouse, Products filter, label import/print, WarehouseModals undo, ProductLikePageLayout header save, GenerateWarehouseLayout Generuj
- Skipped: WMS/damage, tabs/chips/toggles/badges/charts as listed
- **No push.**

## 2026-07-26 â€” ERP Primary CTAs â†’ design-system orange (clusters)

- Migrated listed Assortment / Products / Production / Analysis / Warehouse / Settings / Orders / Customers / Complaints / WarehouseMaterials / Carts / documents / System / analytics / errors primary CTAs â†’ `PrimaryButton` / `brandPrimaryButtonClass`
- Skipped: WMS terminal, Login, destructive, toggles/tabs/badges, filterToolbarBtnApply, non-CTA segmented controls
- No `"brandPrimaryButtonClass"` string-literal bugs
- **No push.**

## 2026-07-26 â€” ERP Primary CTAs â†’ design-system orange (no push)

- High-priority Settings/exports/returns/import/orders/documents pages: `bg-blue/cyan/sky/slate-900` primary fills â†’ `brandPrimaryButtonClass`
- WarehouseDrawers: removed unused `purchasingBtnPrimary` import (primary AppButton already uses DS)
- Skipped: ApiKeys `<pre>`, Import segmented tabs, WMS operator buttons

## 2026-07-25 â€” Magazyn: kamery per-warehouse + tryby wizualizacji (no push)

- Camera: `warehouse_map_camera_v1_{warehouseId}` (zoom, panX/Y, scroll); auto-fit tylko przy pierwszym wejĹ›ciu; â€žDopasuj do ekranuâ€ť
- Visualization: `mapVisualization/` registry (all/occupied/free + przyszĹ‚e); overlay opacity, bez filtrowania danych
- `tsc` + `build` OK
- **No push.**

## 2026-07-25 â€” Projektant Magazynu â†’ Layout System 2.0 (no push)

- UsuniÄ™to `AppPageLayout` + `AppContentLayout` + osobny `TabsContainer` card-stack
- Shell: `PageLayout` (= `PageContainer`) + `PageHeader` + bare tabs (`pageShellDividerClass`)
- Lewy panel Magazyn: bez osobnego `bg-white` + shadow (border-r w tej samej karcie)
- Logika / mapa / panele biznesowe bez zmian
- `tsc` + `build` OK
- **No push.**

## 2026-07-25 â€” GLOBAL LAYOUT SYSTEM 2.0 (no push)

- SSOT: `PageContainer`/`PageLayout` + `design-system/pageLayout.ts` (jeden border, `p-6`)
- Tabs: `TabsContainer` divider-only; `TopTabsNavigation` default `bare`
- Migracja: Purchasing, Carts, Assortment shells, Company `companyCardClass`, PrintingDataTable, listy (Asortyment/Klienci/MateriaĹ‚y/UĹĽytkownicy/Workforce/â€¦), WmsSettings, Catalog/Warehouse entity shells
- WyjÄ…tki: Login, Designer, WMS terminal, bĹ‚Ä™dy, modale
- `npx tsc --noEmit` + `npm run build` OK
- **No push.**

## 2026-07-25 â€” Magazyn UX polish (bez zmiany geometrii) (no push)

- BiaĹ‚e tĹ‚o mapy + delikatny cieĹ„ kontenera
- NakĹ‚adka zielonej trasy preview wzdĹ‚uĹĽ istniejÄ…cych alejek (bez nowej geometrii)
- Miniatury: object-contain + bg-neutral-100; EAN pod SKU
- Raporty = zielony; sekcja Lokalizacje ZajÄ™te/Wolne
- **No push.**

## 2026-07-25 â€” Design System: brand sidebar nav (no push)

- Tokeny: `brandSidebarNavItemClassName`, `brandSidebarNavActiveBarClassName`, icon/chevron
- ErpSidebar + NavFlyoutPanel: aktywny = orange text/icon + lewy pasek (bez niebieskiego)
- TeĹĽ: TemplatesListSidebar, OperationsSidebar, PickingSettingsSectionNav
- Status sidebary zamĂłwieĹ„ (BRAKI itd.) bez zmian
- **No push.**

## 2026-07-25 â€” Brand Enforcement: final Design System cleanup (no push)

- UsuniÄ™to aliasy Primary CTA (`cartsOrangeCtaClass`, `companyOrangeCtaClass`, `PrintingPrimaryButton`)
- UsuniÄ™to martwe `appTabActiveClass` / `printingTheme.primary`
- Soft/outline/link brand â†’ tokeny w `brandUi.ts`; look bez zmian
- Badge / status / severity / segmented / heatmap â€” bez zmian (wyjÄ…tki)
- **No push.**

## 2026-07-25 â€” Magazyn UI: peĹ‚ny redesign widoku operacyjnego (no push)

- Kompozycja: mapa jako bohater (powierzchnia hali), lewy pulpit jako jeden rail, prawa lista produktĂłw light/nowoczesna
- Przejazdy/alejki jak drogi (hatch + kierunek), bez napisĂłw/ramek â€žPRZEJAZDâ€ť
- Geometria regaĹ‚Ăłw, logika i API bez zmian
- **No push.**

## 2026-07-25 â€” Etap 3.3 Routing Graph Architecture Cleanup

- UsuniÄ™to martwy `domain/simulation/route_engine.py` (Euclidean visit order)
- UsuniÄ™to nieuĹĽywane `LocationCapacityProfile.pick_sequence` (+ copy w capacity_service)
- Komentarze/docstringi/docs: Runtime Graph jako SSOT; bez â€žpick_sequence wyznacza trasÄ™â€ť
- Zachowano: kolumna DB `pick_sequence`, migracja `006`, model Location, bootstrap ALTER
- **No push.**

## 2026-07-25 â€” Etap 3.2 Putaway Graph Adoption

- NEAREST_AVAILABLE + WMS fallback: `putaway_hop_cost_m` (Reader), nie `pick_sequence`
- Candidate order: hop (NEAREST) lub `Location.id`
- Tests: `test_stage3_2_putaway_graph.py` + slotting/putaway PASS

## 2026-07-25 â€” Etap 3.1 Finalizacja SSOT Routing Graph (no push)

- Analytics: `order_location_ids_by_graph` â†’ `chain_distance_m`
- Product list: `route_sort_key` = `visit_index_map`
- Allocation / zone / product_view / incomplete / recovery groups â†’ Graph Reader
- Public `__init__`: tylko Runtime Graph Reader (+ CRUD Designer); Euclidean eksport usuniÄ™ty
- Doc: Routing Surrogates. Tests: `test_stage3_1_ssot_finalization.py`. **No push.**

## 2026-07-25 â€” Architecture Review Etap 3 Routing Graph (no push)

- Audyt backendu pod SSOT; doc `docs/architecture/routing_graph_runtime.md`
- Werdykt: reader **nie** jest jeszcze jedynym SSOT (luki w raporcie sesji)
- **No push.**

## 2026-07-25 â€” Routing Graph Etap 3: runtime WMS â†’ Authored Graph (no push)

- `runtime_graph_reader.py` â€” jedyny reader WMS (order/hop/chain)
- PickingRoutingService: kolejnoĹ›Ä‡ `pick_list` z grafu
- wave `compute_wave_metrics`: bez `_distance_between` / label coords
- `_pick_helpers.compute_route_for_pick_nodes`: NN z grafu (bez Euclidean)
- Tests: `test_stage3_runtime_wms.py` 12 PASS. **No push.**

## 2026-07-25 â€” Projektant: jeden panel wĹ‚aĹ›ciwoĹ›ci (no push)

- UsuniÄ™to panel/przycisk â€žWidok z bokuâ€ť; karty lokalizacji w `RackPropertiesSidebar`
- Sekcje: Informacje / Przejazd / Statystyki / Lokalizacje; akcje: UkĹ‚ad / Zapisz / UsuĹ„
- Bez â€žDodaj produktâ€ť w Projektancie (WMS only). **No push.**

## 2026-07-25 â€” Internal Layout: przejazd jako piÄ™tra + UsuĹ„ przejazd (no push)

- Void: N osobnych poziomĂłw konstrukcyjnych z slotami-duchami (ile lokacji zabraĹ‚)
- â€žUsuĹ„ przejazdâ€ť: przywraca poziomy magazynowe; zapis `clearPassages` â†’ `enabled: false`
- **No push.**

## 2026-07-25 â€” Internal Layout sync with template + passage (no push)

- `getInitialLevels`: storageCount = structural â’ void; ignore stale full/mismatched `internal_structure`
- Labels: construction level (createBins + modal save); no storage renumber in UI
- `applyInternalLayoutSave`: merge storage into full construction `levelConfig` when void > 0
- `structureDiffersFromTemplate`: compare storage levels vs template after void
- Tests: passageStorage (+ business) PASS. **No push.**

## 2026-07-25 â€” Template editor: front passage + width axis (no push)

- TemplatePassageOverlay: widok od przodu (nie z gĂłry); along = `width_cm`
- Walidacja: start/szerokoĹ›Ä‡ wzglÄ™dem szerokoĹ›ci regaĹ‚u (nie gĹ‚Ä™bokoĹ›ci)
- PodglÄ…d: etykiety po poziomie konstrukcyjnym (bez renumeracji); void = PRZEJAZD per poziom
- Bez push.

## 2026-07-25 â€” Hard: one enabled passage per rack (no push)

- Shared message: `RegaĹ‚ moĹĽe posiadaÄ‡ tylko jeden przejazd pod regaĹ‚em.`
- BE: `single_passage.assert_at_most_one_enabled_passage` â€” sync, void, template JSON, Pydantic RackSchema + WarehouseTemplatePayload
- FE: `assertAtMostOneEnabledPassage` â€” storage/void, materialize/rematerialize, upsert, layout save payload, entity integrity, TemplateCreator
- No first-pick / ignore / auto-repair. Tests: BE single_enabled + void + template; FE passageStorage + rackPassageGeometry. **No push.**

## 2026-07-25 â€” Passage architecture P0 closeout (no push)

- BE: `warehouse_layout/passage_void.py` void validation â†’ 409; active ops gate; audit hook no-op
- FE: single `structureRebuildOrchestrator` for layout save + template instances; no `trimInternalStructureForVoid`
- Z: `_bin_coords_cm` uses full construction heights
- Preflight: `POST /warehouse/layout/rebuild-preflight`
- Tests: passage_void_gates 8 PASS; FE passage 17 PASS; tsc OK. **No push.**

## 2026-07-25 â€” Passage UX polish (no push)

- Labels: â€žPoziom konstrukcyjnyâ€ť vs â€žLokalizacja / Adres magazynowyâ€ť
- Void viz: double beams + hatch (PassageVoidBand), not solid gray
- Fields: PoczÄ…tek / SzerokoĹ›Ä‡ / WysokoĹ›Ä‡ wolnej przestrzeni + hints
- Miniature: start/width/end numeric readout + dimension lines
- Rebuild dialog: Stare/Nowe counts+capacity, +/â’ lists, stock product/qty/unit/value
- Validation: red highlight on offending height/width/passage geometry fields
- PL copy cleanup (no qty=, Level load, CAD jargon). Tests 19 PASS. **No push.**

## 2026-07-25 â€” P0 UkĹ‚ad wewnÄ™trzny / numeracja / dialogi (no push)

- Internal Layout: peĹ‚na szerokoĹ›Ä‡ + scroll (bez FitToContainer / miniatury)
- Numeracja: poziom konstrukcyjny vs adres magazynowy (level_index strukturalny; etykieta 1..N)
- Pole: â€žPoczÄ…tek przejazdu od lewej krawÄ™dzi (cm)â€ť
- Miniatura przejazdu: start / szerokoĹ›Ä‡ / koniec
- Dialogi: X + Anuluj + ESC; zapis dopiero po decyzji (template instances + rebuild)
- Tests: passageStorage + business PASS. **No push.**

## 2026-07-25 â€” Passage storage: one structural + stock block (no push)

- Void height = first enabled passage only (no max); UI limit 1 passage/rack
- Rebuild with stock: FE dialog blocks confirm; BE save â†’ 409
- Business vitest: 5â†’5, +80â†’3, +120â†’2, numbering, capacity, active-only WMS filter
- **No push.**

## 2026-07-25 â€” Passage under rack â†’ storage model (variant A, no push)

- Generator: `createBinsForRack` + `passageStorage` skip void levels; labels 1..N storage-only
- Capacity from existing bins; Internal Layout / side view / template preview show PRZEJAZD
- Save: `prepareLayoutBinsForSave` + confirm dialog (addresses + stock) before soft-remove
- Clearance height editable in TemplateCreator + PassageInspector (LOCAL); required for void
- No `affects_storage`, no materialization table, no separate Apply action
- Tests: passageStorage vitest PASS; tsc OK. **No push.**

## 2026-07-25 â€” Pre-push UX: P0 regressions + â€žProjektowanie magazynuâ€ť

- Template preview scale-to-fit; ElevationSidePanel uuid match; routing htmlOverlay pointer trap
- PL passage labels; tab rename Projektant Layoutu â†’ Projektowanie magazynu
- Passage/locations generator: deferred (no change this round)
- Local commit only. No push.

## 2026-07-25 â€” PassageInspector wired (pre-push fix, uncommitted)

- `PassageInspector` replaces `PassageQuickEditor` on Layout canvas
- INHERITED: banner + â€žOtwĂłrz szablonâ€ť â†’ `setEditingTemplateId(rack.templateId)`
- LOCAL: corridor width/delete/enabled; QuickEditor = thin alias
- tsc + designer vitest 78 + build OK. No push.

## 2026-07-25 â€” C3 gap-fix commit (inspectors + endpoint drag)

- Extract `NodeInspector` / `EdgeInspector`; panel is container only
- Canvas endpoint drag: handles, snap, ghost, rewire + normalizeAfterEdit via command
- Select rewire = fallback; vitest/tsc/build OK
- **No amend** of `ee6c7cef`. No push. Bez Etapu 3.

## 2026-07-25 â€” C3 gap-fix (inspectors + endpoint drag, uncommitted)

- Extract `NodeInspector` / `EdgeInspector`; `RoutingRoutesPanel` composes only
- Canvas endpoint drag in Edit: handles, node snap highlight, ghost, rewire + normalizeAfterEdit; select = fallback
- `routingEndpointDrag` + tests; vitest routing 53, tsc, build OK
- **No commit yet** â€” awaiting C3 acceptance. No push. Bez Etapu 3.

## 2026-07-25 â€” Layout+Routing UX rev. 3.1 (4 local commits, no push)

- C1: template `default_passages` + passage `INHERITED|LOCAL` + update dialog
- C2: TemplateCreator responsive + top-down passage mini-CAD
- C3: Routing Edit vs Select; selection clear on workspace switch; quick toolbar; merge/rewire
- C4: command bus foundation (no Undo UI)
- tsc+build OK; targeted vitest/pytest PASS. **No push. Bez Etapu 3.**

## 2026-07-25 â€” Layout UX C1: template passages + INHERITED/LOCAL

- `default_passages` on WarehouseTemplate; `passage_source` on WarehouseRackPassage
- Place/stamp/generate materialize INHERITED; legacy missing â†’ LOCAL
- Template save: dialog Aktualizuj instancje vs Tylko zapisz (rematerialize INHERITED only)
- Tests: template_passage_defaults + FE rematerialize; no push

## 2026-07-25 â€” ETAP 2 controlled save WH1 (S1 provenance repair)

- 1Ă— save_layout WH1 â†’ S1 FRONT+180 LEGACY â†’ FRONT+90 AUTO_REPAIR (NORTH only)
- A23Ă—3: approach 4.56â†’0.1 m; P on packing edge y=490; collision clear
- Other racks unchanged; graph/passages/rev unchanged; 2nd save idempotent
- Bez Etapu 3

## 2026-07-25 â€” ETAP 1 deploy provenance (no WH1 save)

- Push `9292c0d2` + `32993af7` â†’ origin/main `32993af7`
- Railway + Vercel success; healthz/readyz OK
- PROD read: all racks `LEGACY_DEFAULT`; S1 still FRONT+180; A23 RESOLVED ~4.56 m (stary zĹ‚y face); Graph 14/14 rev18; passages 0
- **STOP przed Etapem 2** (controlled save)

## 2026-07-25 â€” Service Face Provenance finalization (committed, no push)

- `ServiceFaceOrigin` str Enum (BE model + FE const); repair gates EXPLICIT immutable.
- Schema ensure DEFAULT LEGACY_DEFAULT; FE/BE round-trip; warehouse_routing 150 PASS.
- Commit on top of `9292c0d2`. **No push / PROD / Etap 3.**

## 2026-07-24 â€” SERVICE FACE PROVENANCE (no push)

- Model: `Rack.service_face_origin` LEGACY_DEFAULT | AUTO_REPAIR | EXPLICIT; schema ensure DEFAULT LEGACY.
- Gates: EXPLICIT never repaired; AUTO recomputes; LEGACY FRONT+0 + narrow diagonal-EAST fingerprint.
- Open clearance: unbounded â‰  0; deterministic remis.
- FE/BE round-trip origin; generators conscious face â†’ EXPLICIT.
- Tests Aâ€“H + warehouse_routing 150 PASS; tsc/build/startup OK. **No push. Bez PROD. Bez Etapu 3.**

## 2026-07-24 â€” Routing Designer UX + S1 store face (no push)

- Store S1: repair face z aisle geometry (FRONT+90 NORTH); bez `if store => RESOLVED`.
- UsuniÄ™ty box â€žKonfiguracja sieciâ€ť; MISSING Start/Packing â†’ warning.
- UI point types: 5 typĂłw + SVG ikony; legacy typy zachowane w DB.
- Location Access: â€žBez dostÄ™puâ€ť / wykluczenie START+DOCK z NO_RACK counts.
- Tests: warehouse_routing 131; FE routing 47; tsc+build OK. **No push. Bez Etapu 3.**

## 2026-07-24 â€” FINAL PRE-PUSH AUDIT + push (corridor UX)

- TSC vs origin/main `b17b8d72`: **NEW ERRORS = 0** (po fix `LayoutState` w corridor test).
- Persistence/collision audit tests PASS; warehouse_routing 130 PASS; FE routing/passage 58 PASS; build PASS.
- Push `93b16293` â†’ origin/main. PROD healthz/readyz 200; LA summary unchanged (read-only).
- Bez Etapu 3. Bez zapisu passages na PROD WH1.

## 2026-07-24 â€” UX closures: problem locations + passage corridor group

- **A:** Interaktywna diagnostyka LA (lista + locate + â€žPokaĹĽ wszystkie problemyâ€ť); bez 279 linii.
- **B:** `corridor_uuid` (FE+BE+schema); multi-rack create/move/resize/delete as one; RackSchema.passages (fix strip).
- PROD WH1 verify: 274 RESOLVED / 3Ă— S1 BLOCKED (A23-A-1..3) / 2Ă— NO_RACK (DOCK-IN, START).
- Tests: corridor FE + collision B4/C4 + sync corridor_uuid. Build OK. **No push. Bez Etapu 3.**

## 2026-07-24 â€” Stage B passage canvas UX (FE, uncommitted)

- `LayoutMode.DRAW_PASSAGE` + toolbar â€žDodaj przejazdâ€ť (J); drag corridor â†’ `worldCorridorToPassages` multi-rack.
- Passage preview ghost; PROJEKTOWANIE: select/drag/width/delete overlay; TRASY: subtle non-interactive.
- Save payload passages array unchanged; vitest `rackPassageGeometry.test.ts`.

## 2026-07-24 â€” Etap A+B Physical Routing fixes (no commit/push)

- **A:** SSOT `rack_service_face` (0/90/180/270); FE horizontal rows set face; `service_face_repair` from row_containers on layout save; store skipped.
- **B:** `DRAW_PASSAGE` multi-rack corridor UX; canvas select/move/width/delete; TRASY subtle.
- Tests: service_face_ssot, abc_faces_passage_regression; FE passage geometry 7; warehouse_routing 110; tsc+build OK.
- Bez Etapu 3. Bez push.

## 2026-07-24 â€” MANUAL UX+FUNCTIONAL AUDIT (Passage / Access) â€” no code

- Prod WH1: passage UI PARTIAL (sidebar only); B4+C4 need **two** passages; Test BEFORE 43.10 m / AFTER ~32.48 m.
- Access: 49 RESOLVED / 217 AMBIGUOUS / 11 BLOCKED / 2 NO_RACK; root cause FRONT+rot0 (normal left) vs Â±Y aisles.
- Bez implementacji / commit / push / Etapu 3.

## 2026-07-24 â€” Physical Routing / Rack Passage Foundation

- Model `WarehouseRackPassage` (osobna tabela, UUID); geometria lokalna wzglÄ™dem Rack.
- SSOT `physical_collision.py`: obstacle = footprint â’ enabled passages; eps=2cm; soft boundary.
- Soft â€žSprawdĹş sieÄ‡â€ť: `EDGES_THROUGH_OBSTACLES` (warning); save graph nie blokuje; FE highlight odcinkĂłw.
- Location Access: approach Sâ†’P + wykluczenie invalid edges; MANUAL_OVERRIDE nietkniÄ™ty.
- FE: â€žDodaj przejazd pod regaĹ‚emâ€ť; orthogonal prefer + Shift free-angle.
- Tests: collision/passage/routing soft/access/draw. **No push. Bez Etapu 3.**

## 2026-07-24 â€” FINAL AUDIT Location Access Foundation

- P0 fix: migracja AP tylko gdy brak wiersza access (nie nadpisuje restore AUTO).
- P0 fix: MANUAL po usuniÄ™ciu edge â†’ `OVERRIDE_BROKEN`.
- P1 fix: one-way same-edge respektuje kolejnoĹ›Ä‡ `t`; disabled edges wykluczone z virtual entry.
- Statusy: RESOLVED / AMBIGUOUS / UNREACHABLE / BLOCKED / OVERRIDE_BROKEN.
- Stage-2 consumers nadal OLD AP; NEW tylko Designer/API foundation (Ĺ›wiadomy dual-store do Etapu 3).
- Tests: 21 foundation + 87 routing/startup; FE routing 41; tsc+build OK. **No push.**

## 2026-07-24 â€” Location Access Foundation (AUTO, bez Etapu 3)

- **Locationâ†’Rack SSOT:** `location_uuid`â†’`Bin.rack_id`â†’`Rack` (nie `rack_name`); brak ryzykownej migracji.
- Persist `Rack.service_side` + `rotation_degrees`; world normal z orientation+rotation.
- Tabela `warehouse_routing_location_access`; AUTO resolver (face edge, half-plane, reach, approach_m).
- Virtual entry runtime + approach w koszcie; authored graph bez pollution.
- Recompute po layout/graph save; AP â†’ MANUAL_OVERRIDE (Stage-2 AP nadal ĹĽyje).
- FE: walidacja dostÄ™p/review/bez drogi; diagnostyka overlay OFF; rÄ™czne AP = wyjÄ…tek.
- Tests: 13 foundation + full warehouse_routing 74 PASS; FE build OK. **No push. Bez Etapu 3.**

## 2026-07-24 â€” TRASY: draw-time skrzyĹĽowania + prostszy panel odcinka

- ROOT: przeciÄ™cia dopiero na BE save (`materialize_intersections`); FE tylko split po klikniÄ™ciu w odcinek â†’ wizualny X bez topologii.
- FIX: `applyDrawStep` + `routingDrawNormalize` (cross / T / collinear) przy rysowaniu; snap POINT>EDGE>empty.
- UI: ukryty mnoĹĽnik kosztu; panel odcinka uproszczony; â€žPunkt trasyâ€ť/â€žSkrzyĹĽowanieâ€ť zamiast Punkt N.
- Tests: routingDrawNormalize 10 + routing suite 32 PASS. **No push. Bez Etapu 3.**

## 2026-07-24 â€” HOTFIX: Railway /healthz 503 (dangling Stage2 import)

- ROOT: `slotting_service` â†’ `from ..domain.simulation import get_special_locations_xy, distance_point_to_point_cm` po usuniÄ™ciu `warehouse_graph_service` w 0ae9e47d.
- FIX: helpery w `backend/domain/layout_geometry.py` (Location + Euclidean; zero WarehouseNode/Edge).
- Audit dangling Stage2: tylko te 2 symbole ĹĽyĹ‚y w runtime; FE deleted modules bez dangling imports.
- Smoke: `import backend.main` OK; `run_server.py` â†’ GET /healthz HTTP 200; 130/130 router modules import OK.
- Regression: `backend/tests/test_backend_startup_import.py`. **No push. Bez Etapu 3.**

## 2026-07-23 â€” Routing Graph: fix rysowania odcinkĂłw + sticky Wybierz (audit)

- ROOT draw: stale React state w addEdge â†’ `appendDrawClick` atomowo.
- engine.py: **wycofane** (tylko FE humanize wystarczy; bez zmiany logiki routingu).
- Sticky Wybierz, split przeciÄ™cia, test map-first, orphan cleanup.
- FINAL AUDIT tests PASS. Lokalny commit; **no push. Bez Etapu 3.**

## 2026-07-23 â€” Routing Graph: UX polish + delete bugfix (bez Etapu 3)

- Delete punktu: widoczny CTA â€žUsuĹ„ punktâ€ť, Delete/Backspace, dirty+save+reload persistence test.
- Walidacja: agregacja orphanĂłw (bez UUID / â€žedgesâ€ť / â€žwÄ™zeĹ‚â€ť); â€žUsuĹ„ niepoĹ‚Ä…czoneâ€ť + podĹ›wietlenie.
- Panel kontekstowy (sieÄ‡ / punkt / odcinek / test); â€žObsĹ‚ugiwane lokalizacjeâ€ť; Typ punktu zamiast roli/wÄ™zĹ‚a.
- Architektura Routing Graph SSOT nienaruszona. **No push. Bez Etapu 3.**

## 2026-07-23 â€” Routing Graph Etap 2: cleanup legacy Planuj trasÄ™

- Designer: usuniÄ™to legacy route UX (`isRouteActive` / `routeRackIds` / `fetchRoutePath` / client aisle+grid engines). PathLayer props = null.
- Toolbar: brak przycisku â€žPlanuj trasÄ™â€ť. Sidebar: usuniÄ™to sekcjÄ™ â€žTrasa kompletacjiâ€ť.
- DELETE: `aisleGraphRoute.ts`, `aisleRouteOrder.ts`, `gridRoutePathfinding.ts`, `routeApi.ts`.
- WalkingCostPage: N/A gdy `total_distance` null. TRASY workspace nienaruszony. **No push. Bez Etapu 3.**

## 2026-07-23 â€” Routing Graph Etap 2 (migracja READ-ONLY)

- SSOT AP: `access_resolution.py` (location 1..N â†’ best AĂ—B).
- `/route/path` = compatibility adapter â†’ Routing Engine (bez legacy fallback).
- walking-cost / pick-route / strategy simulations â†’ authored graph.
- UsuniÄ™to: Planuj trasÄ™, aisle*/gridRoute*, routeApi, WarehouseGraphService, graph_location, domain warehouse_graph_service, save_layout rebuild.
- `/warehouse-graph` nodes/edges = projekcja authored; generate â†’ 410.
- Tests: stage2 + updated smoke; 55 warehouse_routing PASS. **No push. No Etap 3.**

## 2026-07-23 â€” Routing Graph Etap 1: domkniÄ™cie UX TRASY


- Drag punktu trasy na canvasie (snap 10 cm, CTM zoom-safe, bez auto-merge, panâ‰ drag).
- CiÄ…gĹ‚e â€žRysuj trasÄ™â€ť, edytor odcinka PL, AP 1..N UX, unsaved (tabs/warehouse/nav/beforeunload).
- Schema `routing.3` bez drop â€žstarego unique APâ€ť; testy diamond/drag/legacy smoke.
- Osobny commit wzglÄ™dem `993f6a9f`. **No push. Bez Etapu 2.**

## 2026-07-23 â€” Routing Graph Etap 1 (authored SSOT)


- Nowe modele: `WarehouseRoutingNode` / `Edge` / `AccessPoint` (stabilne UUID).
- Engine Aâ†’B (kierunek, enabled, process, transport, cost_multiplier) â€” **bez** fallbacku do WarehouseNode.
- API `/warehouse-routing/{id}/graph|route|validate`; `save_layout` nie rebuilduje nowego grafu.
- Designer: workspace **Projektowanie | Trasy**; Testuj trasÄ™ / SprawdĹş sieÄ‡.
- Tests: `backend/tests/warehouse_routing/test_stage1_routing_graph.py` (15). **No push.**

## 2026-07-23 â€” NoĹ›niki: globalny fiolet (CARRIER_VISUAL)

- SSOT: `CARRIER_VISUAL` + `carrierVisualClasses`; wszystkie prefixy PAL/BOX/BIN/CRT/MIX fioletowe.
- `CarrierBadge` / `CarrierIdentity`; karty wyboru PZ, paski aktywnego noĹ›nika, putaway/relocation.
- Lokalizacje bez zmian (niebieski). Tests: `carrierConstants.test.ts`. **No push.**

## 2026-07-23 â€” WĂłzki: KupujÄ…cy w przypisanych zamĂłwieniach

- Root cause: cart `_order_customer_name` czytaĹ‚ tylko EN `first_name`/`last_name` (shipping-first); karta zamĂłwienia uĹĽywa `_customer_names_from_order` (PL ImiÄ™/Nazwisko w billing).
- Fix: `_order_display_customer` â†’ SSOT `_customer_names_for_order_display` (+ CRM fallback). Pole `customer_name` / `order_customer_name` bez N+1.
- Tests: `test_bulk_cart_fleet_semantics.py` (PL keys). **No push.**

## 2026-07-23 â€” Jedna kanoniczna karta produktu (Asortyment)

- UsuniÄ™to slim `ProductDetail`; `/products/:id` â†’ `ProductDetailRedirect` â†’ `/products/:id/edit`.
- Helper `getProductDetailsPath` + migracja linkĂłw (WMS/magazyn, wĂłzki, zamĂłwienia, zakupy, produkcja, scan).
- â€žZamĂłw u dostawcyâ€ť na `ProductEditModal`. Test: `productPaths.test.ts`. **No push.**

## 2026-07-23 â€” Magazyn â†’ WĂłzki: semantyka BULK vs MULTI + hover zamĂłwieĹ„

- BULK: `total_baskets=0`, brak sekcji w header/KPI; MULTI bez regresji.
- PostÄ™p kompletacji = zamkniÄ™te linie operacyjne (`compute_pick_progress` + `pick_progress` API).
- KupujÄ…cy: imiÄ™+nazwisko â†’ firma; produkty z `product_id`/`image_url` bez N+1.
- Rich hover numer/pozycje + nawigacja do `/products/:id`.
- Tests: `test_bulk_cart_fleet_semantics.py`, `bulkCartSemantics.test.ts`. **No push.**

## 2026-07-22 â€” Magazyn UI 1:1 (WĂłzki â†’ NoĹ›niki)

- WspĂłlny shell: breadcrumb Magazyn > tab, bare tabs + trailing CTA (`CartsTabActionsContext`).
- WĂłzki/koszyki: CTA na tabach, ConfirmModal destrukcji, KPI/zapeĹ‚nienie z API; sekcje KPI tylko dla MULTI.
- RegaĹ‚y: 4 KPI, pomaraĹ„czowy â€ž+ Nowy regaĹ‚â€ť, tabs na edycji; Strefy: jeden formularz + focus z CTA; Planer/NoĹ›niki parity.
- Tests: `cartsFleetSummary.test.ts`. Build PASS. **No push.**

## 2026-07-22 â€” Ustawienia: Klucze API i Eksport jako osobne pozycje menu

- Flyout: Integracje â‰  Klucze API â‰  Eksport; canonical `/settings/api-keys` + redirect legacy.
- Hub `/settings/integrations`; breadcrumbs Ustawienia â†’ Klucze API / Eksport.
- Tests: `settingsNavIa.test.ts`. **No push.**

## 2026-07-22 â€” Ustawienia â†’ Firma: UI 1:1 (4 zakĹ‚adki)

- Shell bare tabs + orange CTA; Dane firmy / Magazyny / Firmy / Branding pod screeny.
- Logika bez zmian: company_profile, warehouses, fulfillment strategy, COMPANY template scope, logo SSOT.
- Tests: `companySettingsTabs.test.ts`. **No push.**

## 2026-07-22 â€” UĹĽytkownicy: sesja vs konto, WMS badges, role/statusy, czas pracy PL

- Presence SSOT: `UserSession.expires_at > now` â†’ `has_active_session` na liĹ›cie (Zalogowany/Niezalogowany).
- Kolumna WMS = effective operational modes (launcher parity); HoverPopover na â€ž+X innychâ€ť.
- Role: rename â€žRole i dostÄ™p do statusĂłwâ€ť; â€žMoĹĽe pracowaÄ‡â€ť; `StatusAccessCheckbox` shared z edycjÄ….
- Czas pracy: Throughputâ†’AktywnoĹ›ci na godzinÄ™; heatmap/dni w Europe/Warsaw; API historyczne humanize.
- Tests: `test_user_session_presence`, `effectiveWmsModes.test.ts`, tabs. **No push.**

## 2026-07-22 â€” Edycja uĹĽytkownika 1:1 + kod logowania w systemie etykiet

- UI edycji: orange tabs, lewa kolumna, dirty bar, hasĹ‚o tylko â€žnoweâ€ť (puste).
- Zapis spĂłjny wszystkich dirty fields; beforeunload; Anuluj = restore.
- Kod logowania: Generuj + szablon etykiety + podglÄ…d/druk; lista â€žâ€¦â€ť â†’ Drukuj kod logowania.
- Label SSOT: template_type `user_login`, zmienna `{barcode_login_code}` (tekst/barcode fallback PDF).
- DB: `user_wms_profiles.login_code_label_template_id`; unikalnoĹ›Ä‡ `barcode_login_code`.
- Tests: `test_user_login_code.py`, `userLoginCodeLabel.test.ts`. **No push.**

## 2026-07-22 â€” Ustawienia â†’ UĹĽytkownicy: UI 1:1 + telemetria operacyjna

- Chrome: bare tabs (orange underline), CTA â€ž+ Dodaj uĹĽytkownikaâ€ť pomaraĹ„czowe przy liĹ›cie; bez duĹĽego H1 nad tabami.
- Lista: dziaĹ‚ajÄ…ce wyszukiwanie + Filtruj (status/rola/magazyn); menu â€¦ z ikonami; chipy permisji zielone/czerwone.
- Koszty: 4 KPI jak na screenie; Historia: pagination â€žZaĹ‚aduj wiÄ™cejâ€ť; Czas pracy: expandable operatorzy + filtry.
- Backend: GET/unmapped API poza telemetriÄ…; `filter_operational_activity` w dashboard/analytics/activity-logs.
- Tests: `test_workforce_activity`, `test_workforce_operational_filter`, `administratorsTabs.test.ts`. Build PASS. **No push.**

## 2026-07-22 â€” FE: stale Vite chunk recovery (PlanningDashboard)

- Prod: `PlanningDashboard-DvvOppzR.js` â†’ 200 `text/html` (SPA rewrite); aktualny index wskazuje `PlanningDashboard-BqfS5N4m.js`.
- Root cause: stary main bundle po deployu (nie broken import, API 200).
- Centralnie: `lazyWithStaleChunkRecovery`, one-shot reload (sessionStorage), ErpPanelRouteErrorPage + ErrorBoundary; purchasing lazyViews + ProductList.
- Tests: `staleChunkRecovery.test.ts`. Build PASS. **No push.**

## 2026-07-22 â€” WMS cross-module 500: requires_putaway schema drift

- Root cause: ORM kolumny `requires_putaway` / `default_requires_putaway` (ba0dc357); ensure z `BOOLEAN DEFAULT 1` (nie-PG) + ensure w batch try/except â†’ kolumny mogÄ… nie powstaÄ‡ na PROD.
- Objaw: GET receiving/pz, putaway/pz, returns/active-z-pz â†’ 500; warehouse-operations snapshot â†’ 200 (COUNT bez peĹ‚nego SELECT).
- Fix: dialect-aware default, izolowany startup ensure, request-path heal na listach; test `test_requires_putaway_schema_drift_lists.py`.
- Lifecycle PROGRESSâ‰ DONE i scanner SSOT bez zmian. **No push.**

## 2026-07-22 â€” SprzedaĹĽ bezpoĹ›rednia: widoczny Przelew + cleanup UI

- Root cause: zapisane `payment_methods.transfer=false` (stary default) + filtr w `PaymentTerminalPanel` ukrywaĹ‚ TRANSFER mimo backendu TRANSFER/BANK.
- Migracja resolve/normalize: legacy falseâ†’true; po save `extensions.ds_payment_methods_v2` chroni Ĺ›wiadome wyĹ‚Ä…czenie; cache settings `v2`.
- UI: 2Ă—2 GotĂłwka|Karta|BLIK|Przelew; cash panel tylko CASH; usuniÄ™te teksty â€žParagon â€” klientâ€¦â€ť i â€žWydanie od rÄ™kiâ€¦â€ť.
- Tests: `test_direct_sales_settings_transfer.py`, `directSalesFulfillment.test.ts`. **No push.**

## 2026-07-22 â€” SprzedaĹĽ bezpoĹ›rednia: stock, wysyĹ‚ka, przelew, UX sum

- Stock SSOT: `build_location_stock` â†’ `available_qty_hint` + badge â€žDostÄ™pne: X szt.â€ť; Lokalizacja = rozbicie location-stock.
- Fulfillment w `session.metadata_json` + PATCH `/fulfillment`; DELIVERY â†’ Order.addresses_json + shipping_method_id (bez nowej integracji kuriera).
- Przelew + termin z `Customer.payment_terms_days` (IMMEDIATE settle / DEFERRED PENDING).
- Prawa kolumna: Suma â†’ Rabat â†’ Do zapĹ‚aty (PLN `6,15 zĹ‚`); cash UI tylko dla GotĂłwka.
- Tests: `test_fulfillment_service.py`, `directSalesFulfillment.test.ts`. **No push.**

## 2026-07-22 â€” SprzedaĹĽ bezpoĹ›rednia: add-product 500 + auth probes

- **500 root cause:** `OperationalError: no such column: stock_document_items.requires_putaway` w `commercial_availability_service._purchase_lines_for_products` (stock check przed insert linii). Self-heal + mapowanie â†’ 503/`{code,message}`; brak stock â†’ 400 `offer_stock_unavailable`.
- **401 unrelated:** `/operational/features` i `/wms/settings/direct-sales` uĹĽywajÄ… tego samego Bearer/`get_current_user` (settings: `require_operable_warehouse`). FE nie stosuje juĹĽ fallbacku flag przy 401 (`unavailableReason=auth`).
- **Scanner:** terminal Direct Sales â†’ `useWmsPageScanHandler` â†’ `scanDirectSaleSession` (ten sam backend co klik/`add-product`).
- Tests: `backend/tests/direct_sales/test_add_product_api.py`, `operationalFeatureGuard.test.ts`. **No push.**

## 2026-07-22 â€” Inwentaryzacja: podĹ‚Ä…czenie do globalnego skanera WMS

- Root cause: `handleScan` tylko w lokalnym `useInventoryScanInput` â€” brak `registerScanHandler` â†’ Helper: â€žBrak aktywnego odbiorcyâ€ť / â€žTa strona nie obsĹ‚uguje jeszcze skanera.â€ť
- Fix: entry + terminal â†’ `useWmsPageScanHandler`; krok lokalizacji odrzuca EAN; na liczeniu `location_like` â†’ switch lokalizacji (fallback produkt).
- Mode/label: `inventory-count` / â€žInwentaryzacjaâ€ť. Tests Aâ€“L: `inventoryScanRouting.test.ts`. **No push.**

## 2026-07-22 â€” Rozlokowanie PZ: 100% â‰  zamkniÄ™cie (explicit finalize)

- Root cause: `recalculate_wms_document_completion` auto-ustawiaĹ‚ `relocation_status=DONE` (+ czÄ™sto `status=zakonczone`) przy `receiving_closed && full_put`; `recompute_putaway_status_for_document` ustawiaĹ‚ `putaway_status=DONE` przy catch-up 100% + receiving DONE.
- Fix: progress remaining=0 â†’ tylko IN_PROGRESS; DONE wyĹ‚Ä…cznie po `finalize_wms_relocation_pz` (receiving=DONE â§ remaining=0), z rewalidacjÄ… transakcyjnÄ….
- UI: przycisk â€žZakoĹ„cz rozlokowanieâ€ť widoczny przy otwartym relocation; disabled + powĂłd; catch-up banner slate; DONE = emerald (bez czerwonego alertu).
- Lista aktywna: filtr `relocation_status != DONE` (nie po remaining=0).
- Tests Aâ€“J: `test_wms_putaway_explicit_finalize.py`. **No push.**

## 2026-07-21 â€” Skan noĹ›nika PAL-5 w PrzyjÄ™ciach: SSOT code|barcode

- Root cause: Scanner Helper pokazywaĹ‚ syntetyczny â€žNoĹ›nik / SSCCâ€ť bez DB; `/carriers/scan` zwraca zawsze 200, a lookup matchowaĹ‚ tylko `barcode` (nie `code`).
- SSOT: `find_carrier_by_scan_code` (code OR barcode); inventory-count uĹĽywa tej samej funkcji.
- Helper katalog: lista noĹ›nikĂłw z DB zamiast faĹ‚szywego PAL-N; MULTI_SCAN_TRACE w receiving.
- Tests Aâ€“J: `test_wms_carrier_scan_ssot.py`. **No push.**

## 2026-07-21 â€” Bez rozlokowania (crossdock) + anulowanie obowiÄ…zku putaway


- SSOT: `requires_putaway` na linii + `default_requires_putaway` na dokumencie; rozszerzony `stock_document_item_requires_putaway`.
- NO_PUTAWAY: brak DOCK inventory / brak karty w kolejce; qty doc==actual NIE wyĹ‚Ä…cza putaway.
- Anuluj 0/X â†’ mark NO_PUTAWAY + withdraw DOCK; partial â†’ `PUTAWAY_ALREADY_STARTED`.
- UI: pasek trybu w przyjÄ™ciu; kebab Anuluj na liĹ›cie Rozlokowanie PZ.
- Tests Pâ€“X: `test_wms_putaway_no_putaway_handling.py`. **No push.**

## 2026-07-21 â€” PrzyjÄ™cia: korekta iloĹ›ci + WADA + usuwanie pozycji


- Korekta: tryb â€žKorekta iloĹ›ciâ€ť (â’X); floor `received >= putaway`; DOCK upsert obsĹ‚uguje delta â’.
- WADA: podpiÄ™ty `ReceivingDamageModal` (wczeĹ›niej brak renderu); mark-damaged tylko z DOCK-IN; putaway badge PeĹ‚nowartoĹ›ciowy / WADA.
- Delete EXTRA: A received=0; B withdraw DOCK+audit+delete; C putaway>0 â†’ PL reject.
- Tests Aâ€“I: `test_wms_receiving_correction_defect_delete.py`. **No push.**

## 2026-07-21 â€” WMS PrzyjÄ™cia: blind floor UX + status receiving


- Lista: peĹ‚ny numer bez ellipsis; badge tylko Otwarte/W trakcie/ZakoĹ„czone (bez Dostawa/WMS/FV/Rozlokowane).
- Ekran + modal: zawsze blind (brak qty dokumentu / rĂłĹĽnicy / cen); delta â€žPrzyjmujesz terazâ€ť; ZatwierdĹş zamyka modal + focus skanera.
- Historia czynnoĹ›ci ukryta w WMS (audit SSOT bez zmian). Backoffice PZ bez zmian.
- Tests: `wmsReceivingListStatus`, blind receiving. **No push.**

## 2026-07-21 â€” PZ: ukryj OCZEKUJE FV + lokalizacje putaway 1:N

- FV: `purchase_workflow_status=PENDING_INVOICE` to martwy default bez encji/UI faktury â€” `showPurchaseWorkflowStatus` â†’ false (kolumna DB zostaje).
- Lokalizacja linii: SSOT = `StockOperation` type PUTAWAY (`document_line_id` Ă— `location_id`); usuniÄ™ty fallback Inventory lot (bleed pre-stock).
- UI: `receiptLinePlacementRows` + qty + compact `+N lokalizacje` / HoverPopover ROZLOKOWANIE; DOCK-IN remaining.
- Tests: `test_pz_putaway_provenance_display.py`, FE placement + badge. **No push.**

## 2026-07-21 â€” WMS Dashboard/Topbar SSOT + order-issue-tasks heal

- Registry: `wmsTabConfig.ts` (accent, category, canPin, operationalMode) â†’ dashboard + topbar.
- Topbar pins: `user_wms_profiles.wms_topbar_pins_json` + `PUT /auth/me/wms-topbar-pins`; default receiving/putaway/picking/packing/issues.
- RBAC: rozszerzony `wms_operational_modes`; gate `WmsOperationalModeGate`; brak bypass â€žmandatory productionâ€ť.
- Launcher: usuniÄ™te numery 1â€“9 i teksty SkrĂłty/WskazĂłwka; KPI Braki = liczba aktywnych tasks (bĹ‚Ä…d â‰  0).
- order-issue-tasks: ensure Order ORM columns + heal/retry w `_fetch_orders_by_id`.
- Tests: `wmsNavTabs.test.ts`, `test_wms_topbar_pins.py`, handoff 500. **No push.**

## 2026-07-21 â€” RÄ™czne PZ: ostatnia cena zakupu + VAT snapshot + audyt PL

- Cena: `resolve_suggested_purchase_price_net_for_pz` (supplier PZ â†’ global PZ â†’ supplier_products â†’ product.purchase_price); brak historii = `None` (nie 0).
- VAT: snapshot z `product_vat_rate_percent` na linii; rescan nie nadpisuje rÄ™cznych zmian.
- Audyt: `activity_log` (object_type=document) + istniejÄ…cy `ReceivingScanLog`; UI â€žHistoria czynnoĹ›ciâ€ť; delty qty / OLDâ†’NEW cena/VAT / wady / cofniÄ™cie.
- Endpointy: `PATCH â€¦/commercial`, `PATCH â€¦/supplier`, `DELETE â€¦/items/{id}`; qty signed delta.
- Tests: `test_wms_pz_price_vat_audit.py`. **No push.**

## 2026-07-21 â€” Nowa dostawa: wybĂłr istniejÄ…cego dostawcy (bez auto-create)

- Modal searchable combobox â†’ `GET /suppliers/` (name/NIP); jawne â€ž+ UtwĂłrz nowego dostawcÄ™â€ť.
- Backend: `create_supplier` flag; bez `supplier_id` i bez flagi â†’ 400 (nie tworzy rekordu).
- Duplicate: exact name â†’ reuse. **No push.**

## 2026-07-21 â€” PrzyjÄ™cia: document/actual/rĂłĹĽnica + bez auto-DONE na expected

- EXISTING SSOT restored in WMS UI: `ordered_quantity` / `received_quantity` / `difference` / wady (`REJECTED_STOCK`).
- Auto-DONE removed: only explicit â€žZakoĹ„cz przyjÄ™cieâ€ť; surplus over ordered allowed.
- Manual ordered=0 â†’ UI shows â€žâ€”â€ť for document/rĂłĹĽnica (not fake +N).
- Tests: lifecycle + presentation + workflow. **No push.**

## 2026-07-21 â€” PrzyjÄ™cia PZ: nie zamykaj rÄ™cznego PZ po 1 szt.

- ROOT 400 + znikniÄ™cie z listy: `compute_line_receiving_progress` traktowaĹ‚ `ordered=0` + received>0 jako `received` â†’ `recalculate` â†’ `DONE` â†’ lista `receiving_status != DONE` + PATCH `_assert_receiving_session_open`.
- FIX: open-ended / manual lines â†’ zawsze `in_progress` do jawnego â€žZakoĹ„cz przyjÄ™cieâ€ť; ensure auto+1 teĹĽ pisze DOCK-IN.
- UI: usuniÄ™ty banner DOCK-IN z listy PrzyjÄ™Ä‡; â€žRozbicieâ€ťâ†’â€žSposĂłb przyjÄ™ciaâ€ť/ukryte przy samych sztukach; Przyjmujesz teraz / Po zatwierdzeniu; statusy PL.
- Tests: `test_manual_pz_receiving_lifecycle.py`. **No push.**

## 2026-07-21 â€” LIVE NO_PENDING_SOURCE_LOCATION: UI location vs source_lock

- ROOT: FE treated `activeLocationId=276` as ready-for-basket; after PUT lock cleared, preserve kept UI id without server re-accept.
- FIX: `ensureServerSourceForBasket` before confirm; continuous re-accept via `lastOperatorAcceptedLocationRef`; never bare activeLocationId; detail `source_accepted` contract; MULTI_SCAN_TRACE SOURCE_* events.
- Tests: live same-location second basket + FE `multiPickingSourceAcceptance`. No push.

## 2026-07-21 â€” Fix GET /order-issue-tasks 500 (orders.picking_handoff_mode)

- EXACT: `OperationalError` / `UndefinedColumn` â€” `no such column: orders.picking_handoff_mode`
- Failing SQL: ORM SELECT Order in `_fetch_orders_by_id` (after OPEN tasks exist)
- Cause: ORM maps handoff (afc6843a); Braki request-path ensured only `order_issue_tasks.*`
- Fix: `ensure_order_issue_task_lifecycle_schema` â†’ `ensure_orders_picking_handoff_mode_column` (SSOT)
- NOT from picking commits 2de7345a / f5e881be
- Tests Aâ€“I: `test_order_issue_tasks_handoff_column_500.py`. No push.

## 2026-07-21 â€” MULTI quantity-mode server-side source_lock

- Gap after route-skip: client could still send any WH `location_id` with stock.
- SSOT: `basket_put.source_lock` in session metadata (accept â†’ confirm â†’ clear on success).
- API: `POST /wms/picking/accept-source-location`; confirm resolves lock first; body location mismatch â†’ SOURCE_LOCATION_MISMATCH.
- Detail refetch keeps lock (no longer `clear_basket_put_state` on quantity detail).
- FE: accept on location select; restore from `detail.source_lock`.
- Tests Aâ€“O + exact LIVE in `test_wms_multi_basket_source_provenance.py`. No push.

## 2026-07-21 â€” MULTI basket put: source provenance vs greedy route

- LIVE: brck1-B02 recognized but record_wms_quick_pick rejected A23 (â€śnie naleĹĽy do trasyâ€ť); FE â†’ UNKNOWN_SCAN_CODE.
- Cause: greedy route on physical Inventory (draft picks ignored) + stale series location in _do_record.
- Fix: skip_route on basket-bound pick; request location_id SSOT; structured SOURCE_LOCATION_* errors.
- Tests: `test_wms_multi_basket_source_provenance.py`. No push.

## 2026-07-21 â€” WMS receiving: effective validation + scan gate (ST-003)

- ROOT overrides: PZ `track_*` / receive-serial used legacy `Product.track_*`, ignored `validation_skip_*`.
- ROOT scan: serial awaiting could treat next product EAN as serial / block without opening product; now resolveâ†’modal, EANâ‰ serial, Polish conflict copy.
- SSOT: `resolve_effective_receiving_requirements`; scan `validation_requirements`; lot_keys + document lines use effective.
- Tests: `test_receiving_validation_effective_policy.py`. No push.

## 2026-07-21 â€” LIVE BASKET_PRODUCT_MISMATCH empty eligible (stale picked status)

- ROOT: `_line_eligible` skipped `wms_picking_line_status in (picked, missing)` while detail rem ignored status â†’ UI unresolved=1, write eligible=[], â€žOczekiwane: â€”â€ť.
- FIX: eligibility = rem>0 + basket on active cart; heal stale `picked`; resolve accepts only eligible; rich 409 diagnostics.
- Tests: `test_wms_multi_basket_live_mismatch.py` (exact flow Aâ€“H). No push.

## 2026-07-21 â€” MULTI final audit: basket destination SSOT

- Proven mismatch: UI `orders[].basket_slot` could show S-1-2 from foreign-cart basket; confirm of local brck1-B02 â†’ BASKET_PRODUCT_MISMATCH.
- Fix: `eligible_basket_destinations` on detail = list_eligible (+ barcode); FE destination list uses only that; postPutFollowUp from live eligible; scan resolve prefers barcode then primary label.
- 409 extra: scanned_basket_id/barcode + eligible rows for next LIVE repro.
- Tests: `test_wms_multi_picking_final_audit.py` (stock flow, parallel, foreign label, local OK, alias). No push.

## 2026-07-21 â€” MULTI picking effective stock + active location

- ROOT: detail showed raw Inventory; `useEffect([detail])` cleared activeLocationId after confirm refetch.
- SSOT: `location_pick_stock_projection_map` â†’ detail `stock_quantity`=effective; write path unchanged.
- Active loc preserved when effective>0; cleared on product change / zero stock; no FIFO fallback.
- Basket UI labels unified to `primary_basket_label` (S-1-2 â†” brck1-B02).
- Tests: `test_wms_picking_location_effective_stock.py` + FE `multiPickingActiveLocation.test.ts`.
- No push.

## 2026-07-21 â€” Replenishment need audit + Polish UI (no push)

- SSOT confirmed fill-to-min: need = min_pick â’ pick; demand/max only in priority.
- Operator UX: PrzenieĹ› N / Z / DO; partial fill note; no raw enums in Centrum operacyjne.
- Labels: `replenishmentUiLabels.ts` (+ severity/alert level); BUFFER removed from alert copy.
- Tests: CASE 1â€“3/6 policy + FE label maps. Formula unchanged (CORRECT for SSOT).
- SAFE TO PUSH: NO (user hold; demand-fill is product GAP if desired).

## 2026-07-20 â€” User-facing events always Polish (Historia czynnoĹ›ci)

- Root cause: ActivityLogTable mapped cart `event_code` via `getOrderEventLabel` â†’ English title-case + CSS uppercase â†’ â€žCART RELEASEDâ€ť.
- SSOT FE: `getEventDisplayLabel` (`eventDisplayLabels.ts`); unknown â†’ â€žZdarzenie systemoweâ€ť.
- SSOT BE: `title_pl` / `compose_informative_message` on presentation (no history migration).
- Fallback: no English `.title()` humanize for unknown WMS ops / material needs / workflow.
- Rule: `.cursor/rules/user-facing-polish.mdc`. Tests: FE vitest + `test_event_display_polish.py`. No push.

## 2026-07-20 â€” Trusted capacity vs computational fallback (putaway UX)

- Split: runtime 1Ă—1Ă—1/0 kg stays computational; operator numbers require trusted inputs.
- `capacity_trust.py`: geometry_source REAL_DATA|FALLBACK, capacity_numeric_trusted, planning probe=1.
- Presentation: POJEMNOĹšÄ†: NIEOKREĹšLONA (no ~63000); one discreet banner on putaway.
- Ranking ignores synthetic max_fit; weight-only bounds still score/limit.
- Distribution: unknown geometry â†’ probe 1, never allocate 500 from fake capacity.
- Packing: GEOMETRY_SOURCE_FALLBACK; never EXACT on synthetic dims.
- Tests: `test_capacity_trust_ux.py` Aâ€“G + suites green (88). No push.

## 2026-07-20 â€” Missing logistics: technical defaults + provenance

- SSOT: `normalize_product_logistics` â€” runtime 1Ă—1Ă—1 / 0 kg; never auto-write master.
- Provenance: provided = master field presence (real 1Ă—1Ă—1 â‰  default).
- Receiving validation: NULL/missing fails when required; technical defaults do NOT pass.
- Capacity/packing/putaway: `used_defaults` + ESTIMATED confidence; FE szacunkowe labels.
- Tests: `test_product_logistics_defaults.py` (M1â€“M10 / receiving / P12â€“P13) + 75 fit suite green.
- No push. SAFE TO PUSH: NO (multi-carton persist GAP + smoke).

## 2026-07-20 â€” PRODUCT INTEGRATION Phase 1 + core Phase 2

- Capacity contract: `ProductLocationCapacityRead` + GET product/location + POST batch (â‰¤80).
- Putaway: capacity fields on suggestions; UI cards; distribution plan PLAN-only + revalidate rebuild.
- Product edit: batch capacity list for inventory locations.
- Packing: fit recommendation panel, alts/reject labels, override confirm, plan[] read-only.
- Multi-carton persistence still SINGLE selected_carton_id (explicit GAP).
- Tests: `test_fit_engine_product_integration.py` + existing fit suites green.
- No push.

## 2026-07-20 â€” FIT ENGINE production gaps closed (post deep audit)


- Internal/usable carton dims: `internal_*_cm`, `max_payload_kg`; fit uses internal; fallback + `USABLE_DIMENSIONS_NOT_DEFINED`.
- Product logistic validator SSOT + `Product.fragile` (â‰  NO_STACK); FE ProductEdit + CartonDetail settings.
- AABB placement hard gate; free-space prune; Smart cannot primary when eligible empty.
- Packaging ranking WHY_SELECTED; multi-carton HEURISTIC/ESTIMATED + bounded improve; packing plan contract.
- Invariants Aâ€“O + O2. Tests: 54 fit + 8 slotting OK. No commit/push.

## 2026-07-20 â€” FIT ENGINE deep audit + critical fixes

- BUG: Smart Matching + finalize_primary mogĹ‚o wybraÄ‡ karton z `Odrzucony:` (volume cost) mimo fail geometrycznego â†’ FIXED (merge + primary_pool).
- BUG: compression stosowana po rotacji na niewĹ‚aĹ›ciwej osi â†’ FIXED (tylko gdy vertical == product.height).
- SEMANTIC: same-SKU occupancy bez placement map â†’ confidence ESTIMATED w location_capacity_solver.
- Regressions: `test_fit_engine_audit_regressions.py`. No commit/push. SAFE TO PUSH: NO (pozostaĹ‚e GAPY).

## 2026-07-20 â€” Shared FIT / CAPACITY ENGINE (SSOT)

- NEW: `backend/services/fit_engine/` â€” geometry XYZ, orientations, stacking, compression, weight, placement.
- Location: `capacity_service` + `location_capacity_solver` â†’ shared core (nie volume-only).
- Packaging: `cartonization_solver` + `three_d_matching` â†’ prawdziwy geometric fit (nie SUM volume).
- Product: `max_stack_count` / `carton_max_stack_count` (limit jednego stosu).
- Tests: CORE 1â€“14, LOCATION 1â€“6, PACK 1â€“15 (`test_fit_engine_matrix.py`).
- FE Magazyn `calculatePackingLayout` = tylko wizualizacja designera; operational SSOT = backend.
- No commit / no push.

## 2026-07-20 â€” Pakowanie: skan EAN z listy nie pomija widoku zamĂłwienia

- ROOT: `packingScanBootstrap` â†’ `applyPackingResult` przy `fully_packed` (np. 1Ă—1) od razu `awaitingPostPackCarton` â†’ modal â€žWybierz opakowanieâ€ť.
- FIX: bootstrap z listy deferuje karton/finalizacjÄ™; pokazuje PackingView + CTA â€žWybierz opakowanieâ€ť. Skan nadal zaliczony raz (API resolve-ean/scan).
- Helper `decideListScanBootstrapUi` + testy. No push.

## 2026-07-20 â€” ZatwierdĹş i wrĂłÄ‡: confirm remaining across locations

- Was: button only navigated back (no picks).
- Now: `POST /wms/picking/confirm-remaining` plans remaining qty on routing location priority (pick-type â†’ name â†’ id), writes draft Picks via `record_wms_quick_pick` / cartless; atomic on insufficient stock; no global Inventory mutation until finalize.
- FE: detail footer calls API then returns to list.
- Tests: `test_wms_confirm_remaining_picks.py`. No push.

## 2026-07-20 â€” ANULUJ ZBIERANIE: full MULTI session rollback

- SSOT: `Inventory` = location stock; global = SUM(Inventory). Cancel never creates PZ/PW/WZ / global stock mutation.
- Draft Pick (`picked_at IS NULL`): delete record only; location qty unchanged; informational `put_back_required`.
- Finalized Pick (defensive): restore qty at exact `Pick.location_id` (no FIFO).
- Shortage: delete only `FE_MISSING` with `metadata.cart_id` / `picking_session_id`.
- Cart/baskets/operator/session cleared; order status from session snapshot; rich `PICKING_CANCELLED` audit.
- SAVEPOINT around optional tables so lean DBs cannot poison cancel txn.
- Tests: `test_wms_cancel_picking_rollback.py` (+ lifecycle SSOT green). Commit, no push.

## 2026-07-20 â€” FIX 500 report-shortage-bulk (Postgres FOR UPDATE + joinedload)

- ROOT: bulk locked OrderItem with `joinedload(product)+with_for_update` â†’ Postgres ProgrammingError â†’ uncaught 500.
- FIX: lock without joinedload; validate cart/tenant/product; map domain errors to 409 codes; SQLAlchemy â†’ 409 PL.
- Orchestrates same `report_wms_picking_product_shortage`. Tests CASE 1â€“9 + lock regression. No push.

## 2026-07-20 â€” MULTI shortage UI audit/regression PASS

- allocations[] = order_item.wms_picking_line_missing_qty + Order.basket (no FIFO, no product_idâ†’basket).
- Cart READY only when unresolved=0 & shortage=0; else NIEROZLICZONE / NIEKOMPLETNE.
- Counter always `Braki: N szt.` (braki_szt). Write paths untouched.
- Tests: allocation regression + FE presentation. Commit, no push.

## 2026-07-20 â€” MULTI shortage UI: per order_item / basket (not SKU-only)

- ROOT: BE had order_item shortage SSOT; product-lines list exposed only product aggregate; FE showed `BRAK 1/9` + â€žZamĂłwienie niekompletneâ€ť on whole SKU.
- FIX projection: `allocations[]` on product-lines (required/picked/shortage/unresolved per order_item + basket); session `braki_szt` / `zamowienia_z_brakami`; cart assigned orders + basket cells show NIEKOMPLETNE / GOTOWE from line missing qty.
- FE: list card + detail header name order/basket; counter â€žBraki: N szt.â€ť; Rozliczenie per koszyk labels BRAK/NIEKOMPLETNE/GOTOWE.
- Shortage write SSOT unchanged (`order_item_id`). No push.

## 2026-07-19 â€” Legacy draft Pick recovery (per Pick.id)

- `GET /wms/picking/product-picks` + `POST /wms/picking/picks/{id}/undo` (Inventory=0, shortage=0).
- Finalize 409: code `PICK_LOCATION_STOCK_MISMATCH` + `failing_pick` + operator message; FE CTA â€žPrzejdĹş do pobraniaâ€ť.
- MULTI panel: Historia pobraĹ„ per koszyk + cofnij konkretny draft.
- Tests: `test_wms_undo_pick_by_id.py`. No push / no auto-migrate cart_id=2.

## 2026-07-19 â€” LIVE finalize still 409: LEGACY vs WRITE PATH separation

- Classification: **LEGACY BAD PICKS** on cart_id=2 most likely; new write path **hard-gated** (cannot create qty=5 when effective=1).
- LIVE `wymagane 5 / dostÄ™pne 1` reproduced: Pick1 LOC-A=3 then Pick2 LOC-A=5 on stock=4; in-txn after Pick1 available=1; rollback restores stock + `picked_at=NULL`.
- Diagnostics only (no finalize logic change): `FINALIZE_PICK_TRACE` / `FINALIZE_PICK_FAILED` + `failing_pick` in 409 detail.
- Undo = LIFO draft Picks per product (optional location); does not take MULTI `order_item_id` from FE â€” recovery possible but not precise split. No auto FIFO reassign. No push.

## 2026-07-19 â€” WRITE PATH location provenance (LIVE finalize 409 class)

- ROOT CONFIRMED: MULTI quantity put used FE `locations[0]` without source scan; modal max = line remaining only; BE did not check location stock / pending picks â†’ Pick qty=5 @ loc with stock 1 â†’ finalize 409.
- FIX (write path only; finalize untouched): `PICK_LOCATION_REQUIRED`, `QUANTITY_EXCEEDS_LOCATION_STOCK`, `effective_pickable = Inventory â’ pending Pick`; FE blocks multi-loc basket without `activeLocationId`; location scan before basket; modal max = min(line, loc).
- Tests: `test_wms_basket_put_location_provenance.py`. No push.

## 2026-07-19 â€” LIVE finalize-cart 409 audit (product 192 / cart 2) â€” NO FIX YET

- ERROR: `wymagane 5.0, dostÄ™pne 1.0` from `consume_inventory_fifo_slices` via `_decrement_inventory_for_wms_pick` on pending `Pick` (`picked_at IS NULL`).
- WHY 5: `qty = float(Pick.quantity)` of the failing pending row â€” **not** requiredâ’shortage, **not** product aggregate 9.
- Stock on QUANTITY_CONFIRM: **NO** (`picked_at=None`). Stock on FINALIZE: **YES**. Double deduction: **NO**. Shortage never enters inventory consume.
- Finalize preserves `Pick.location_id` (no cross-location re-FIFO). Live Pick/Inventory dump unavailable locally (`warehouse.db` empty, no `.env`).
- Suspected write-time provenance: MULTI basket confirm can fall back to `locations[0]` when `activeLocationId` unset â€” stamps all picks on one loc while stock is split. **STOP before changing finalize/quantity/shortage SSOT.**

## 2026-07-19 â€” MULTI: quantity put + shortage per allocation (no FIFO close)

- STATE MACHINE: SELECT_PRODUCT â†’ SELECT_BASKET â†’ ENTER_QUANTITY â†’ CONFIRM â†’ next basket / finish.
- SHORTAGE SSOT: `report_wms_picking_product_shortage` requires `order_item_id` on baskets carts; MULTI caps declarable to remaining (no pickâ†’shortage convert).
- FE: per-basket panel + MultiAllocationShortageModal; quantityMode suppresses EAN+1/series; post-partial â€žoznacz pozostaĹ‚e jako brakâ€ť.
- Tests: `test_wms_multi_basket_allocation_scenario.py` (20-qty CASE 6); FE allocation + scan route. No push.

## 2026-07-19 â€” DEFAULT QUANTITY MODE + fix BASKET_PRODUCT_MISMATCH

- ROOT MISMATCH: leftover `active_series` for foreign SKU blocked product-context basket resolve (`BASKET_PRODUCT_MISMATCH` on S-1-2 while UI showed eligible).
- FIX: clear foreign series when detail `product_id` provided; unify `resolve_allocation_for_basket_scan` with detail SSOT.
- NEW FLOW: EAN/CLICK = select product; basket = QUANTITY_REQUIRED (Pick=0); confirm quantity = Pick +N (live revalidate).
- FE: `BasketPutQuantityModal` (receiving-style Â±); list MULTI EAN navigates without pending.
- Tests: `test_wms_basket_put_quantity_mode.py` CASE 1â€“12. No push.



- ROOT: `pending=false+series=false` â†’ EXPECTED_PRODUCT_SCAN blocked eligible basket on detail even though product_id was known from route.
- NEW MODEL: selected product (click|EAN|route) vs physical pending qty. Basket+context â†’ SERIES_ACTIVATED qty=0; basket+pending â†’ Pick+1; EAN+series â†’ Pick+1.
- Backend: `confirm_basket_put(product_id, location_id)`; API body fields; FE route `select_destination`; UI â€žWybierz koszykâ€ť.
- Tests: CASE 1â€“10 in `test_wms_basket_put_product_context_destination.py` (12 pass). No push.



- ROOT: Jedyny URL `/wms/picking/products/:id` idzie przez `goDetail`. Live `DETAIL_MOUNT has_seed=false navigation_source=click_or_other` = navigate **bez** seed/token â‡’ nie lista PRODUCT_SCAN. Brak `PRODUCT_SCAN_REQUEST_START` / `GLOBAL_SCAN` EAN przed mount â‡’ entry byĹ‚ **click** (lub bare goDetail), nie fizyczny skan. Label `click_or_other` mylÄ…cy â€” brak seed = â€žnie physical_scanâ€ť.
- FIX: jawne `navigationSource` (physical_scan|click|pending_resume|other); HARD block physical_scan bez quick-pick+pending; `preparePickingProductDetailNavigation` + Scanner Helper dispatch harness; DETAIL_MOUNT czyta source z routera.
- Tests: `wmsScanDispatch.integration.test.ts` via `performScannerHelperScan` (nie bezpoĹ›redni list handler).
- No confirm-basket-put / allocation changes. No push until live retest.



- ROOT: Fizyczny skan EAN w Scanner Helper odpalaĹ‚ `products/search` + `returns/lookup` (catalog query z inputu), a workflow mĂłgĹ‚ nie mieÄ‡ `consumed`. Detail po wejĹ›ciu miaĹ‚ `pending=false` â†’ basket `EXPECTED_PRODUCT_SCAN`.
- FIX: `handleScan` awaits handler + `{consumed}`; picking path suppresses helper lookups; list returns SCAN_CONSUMED + PRODUCT_SCAN before navigate + traces; detail keeps seed/handler during load.
- Tests: `wmsScanDispatch.integration.test.ts` (dispatcher entry, not backend helper alone).
- No push.

## 2026-07-19 â€” REAL MULTI: list EAN = PRODUCT_SCAN â†’ detail STATE B (no second EAN)

- ROOT: List could navigate without pending visible on detail (STATE A â†’ basket EXPECTED_PRODUCT_SCAN). Valid EAN without selectedLocation â†’ UNKNOWN_SCAN_CODE.
- FIX: list PRODUCT_SCAN before navigate + pending seed; detail effectivePending; UI â€žPRODUKT ZESKANOWANY â€” ZESKANUJ KOSZYKâ€ť; get_basket_put_ui_state via find_open_picking_session; re-attach pending after detail touch; location fallback for product EAN.
- Tests: `test_wms_basket_put_list_scan_pending_survives_detail.py`.
- No push.

## 2026-07-19 â€” PRE-PUSH AUDIT ab1f70a8: scan lock + non-MULTI gate + session FOR UPDATE

- BLOCKERS fixed: FE scan gate (detail+list); list `requiresBasketPut` from API not `Boolean(cartId)`; pending before bundle; session `FOR UPDATE` on put mutations.
- Regression: same SKU S-1-2 complete â†’ unbound â†’ S-1-1; FE catalog/popup contract + non-MULTI fallthrough.
- No push.

## 2026-07-19 â€” STRICT MULTI scan state machine + operator error popups

- CLASSIFY â†’ STATE â†’ VALIDATE: invalid scan consumed, ZERO mutation.
- Codes: EXPECTED_BASKET_SCAN, EXPECTED_PRODUCT_SCAN, BASKET_EMPTY, BASKET_OTHER_CART, OVERPICK_BLOCKED, â€¦
- FE: `wmsScanErrorCatalog` + fullscreen `WmsScanFeedbackOverlay` + error beep.
- Tests: `test_wms_basket_put_scan_state_machine.py` + FE route/catalog.

## 2026-07-19 â€” REAL runtime: state A UI + silent basket scan (brck1-B0x)

- ROOT: Screen â€žKOSZYKI WYMAGAJÄ„CEâ€¦ Zeskanuj EAN, potem koszykâ€ť = pending=NULL (state A). Detail handler ignored brck1-B0x (silent). List with pending blocked basket instead of confirm. classifyWmsScanCode treated brck1-B01 as location_like.
- FIX: multiPickingScanRoute (A/B/C); detail/list route basket â†’ confirm; clear state A copy; basket_like classify; MULTI_SCAN_TRACE; brck1 runtime tests.
- SSOT unchanged: EANâ†’pendingâ†’basketâ†’Pick.

## 2026-07-19 â€” SERIES LINE PROGRESS: live line_remaining â‰  product aggregate

- ROOT: series banner used product aggregate `remaining` (e.g. 17) instead of allocation rem (8).
- FIX: `project_active_series_with_live_remaining` on UI/API series; FE banner + toast use `active_series.line_remaining` only. Aggregate widget unchanged.
- Tests: `test_wms_basket_put_series_line_progress.py` CASE 1â€“5.

## 2026-07-19 â€” FINAL INTEGRATION AUDIT MULTI basket put (42cfee48â€¦788ebff8)

- HEAD `788ebff8`; all 4 commits present; 38 basket-put tests PASS; no code changes; no push.
- Hard gates PASS: no FIFO destination before basket scan; no Pick before confirm; no cross-SKU series on detail; no double EAN required.
- Residual BUG (non hard-gate): series banner â€žPozostaĹ‚oâ€ť uses aggregate product `remaining`, not series line_remaining (pending path is correct per basket).
- SAFE TO PUSH: YES (hard gates); fix series-line progress before treating UI as fully SSOT-clean.

## 2026-07-19 â€” MULTI 409 on S-1-2: foreign/stale series on product detail

- ROOT: `get_basket_put_ui_state` exposed `active_series` for *any* product_id. Detail SKU X showed SERIA S-1-1 from leftover series of SKU Y; progress 0/N for X; basket scan S-1-2 â†’ series switch with `series.product_id=Y` â†’ `BASKET_PRODUCT_MISMATCH` 409.
- FIX: product-scoped series/pending on detail; sanitize invalid series; pending forces no destination label; clearer mismatch when switch product â‰  basket need.
- Tests: `test_wms_basket_put_multi_sku_s12_regression.py` CASE 1â€“7.

## 2026-07-19 â€” Pending basket-put list UX + cancel

- List shows banner for `basket_put_pending` only (series â‰  pending).
- Resume detail / same-SKU scan opens existing pending; other SKU blocked.
- `POST /picking/cancel-pending-basket-put` clears pending only (no Pick/stock/series).
- Tests: `test_wms_basket_put_pending_list_ux.py` CASE 1â€“9.

## 2026-07-19 â€” PRE-PUSH AUDIT MULTI basket put (42cfee48 â†’ follow-up)

- BLOCKER found: series switch invented pending qty=1 and wrote Pick; API rejected confirm when pending=None (switch dead in prod).
- FIX: `SERIES_DESTINATION_SWITCHED` retargets series with quantity_put=0; API allows confirm when series active; `picked` = qty>0.
- eligible_baskets = UI hint; confirm always `resolve_allocation_for_basket_scan` live DB.
- Tests: +stale eligible, switch no increment, basket without pending, product change, 20-qty overpick.

## 2026-07-19 â€” MULTI basket put: free basket choice + list EAN as PRODUCT_SCAN

- ROOT: `resolve_next_basket_allocation` FIFO bound `order_item_id`/`expected_basket_id` into pending at product scan â†’ forced â€žKOSZYK DOCELOWY: S-1-1â€ť; list EAN only navigated â†’ detail demanded second EAN.
- FIX SSOT: product scan â†’ product-level pending + `eligible_baskets` (no Pick); basket scan â†’ `resolve_allocation_for_basket_scan` â†’ Pick + series for that basket/line. Mid-series other-basket scan switches destination.
- FE: list scan calls quick-pick then detail with one-shot `listProductScanToken`; UI lists all eligible baskets (no single destination).
- Errors: `BASKET_PRODUCT_MISMATCH`, `BASKET_PRODUCT_ALREADY_COMPLETE`; `scope_order_id` on quick-pick (no recovery gate).
- Tests: `test_wms_basket_put_confirmation.py` CASE 1â€“11 (+ extras).

## 2026-07-19 â€” POST /orders 500: phantom offer_id (ProductSalesOffer)

- ROOT: `GET /products/{id}/sales-offers` â†’ `ensure_default_offer` + flush, **no commit**; `get_db` closes â†’ rollback. FE stored ephemeral offer.id â†’ POST `offer_not_found` â†’ 500.
- NOT product.id-as-offer_id (FE used real offer.id from list); IDs were never persisted.
- FIX: list endpoint `db.commit()` after ensure; FE auto-add uses `product_id` (offer_id only on explicit multi-offer pick); create maps `ProductSalesOfferError` â†’ 400 `OFFER_NOT_FOUND`.
- Tests: `test_order_create_offer_contract.py`.

## 2026-07-19 â€” Packing BASKET ghost count (entry 1, scan 404)

- ROOT: `packing_mode_distribution` / `_packing_orders_base_query` liczyĹ‚y `picking_handoff_mode=BASKET` bez live custody; po finish custody cleared, handoff zostaje (provenance) â†’ COUNT=1, GET basket â†’ EMPTY.
- FIX: SSOT eligibility + scope â€” BASKET wymaga `Order.basket_id` + `CartBasket.order_id==Order.id`; exclude `wms_packing_automation_finished_at`; PACKING_QUEUE_TRACE przy ghost.
- NIE czyszczono `picking_handoff_mode`.
- Tests: `test_packing_active_queue_ssot.py` CASE 1â€“7.

## 2026-07-19 â€” POST /orders 500: diagnostics-only (no root-cause fix yet)

- Deployed `6b70515e` contains `ORDER_CREATE_ERROR` (from parent `2aa7114b`) but only `logger.error` (no traceback) + commit `6b70515e` itself is pycache-only.
- Startup `columns_added=0` â‡’ do not assume missing `picking_handoff_mode`.
- Upgrade: `ORDER_CREATE_TRACE` stages + `logger.exception` + stderr print + `flushed/committed/order_id` + payload fingerprint; wrap unexpected â†’ safe HTTP 500 after rollback.
- Suspects to verify on next deploy log: `product_sales_offers` (resolve lines), `tenant_fulfillment_configurations` (POST_FLUSH_ASSIGN), item offer FK â€” not handoff alone.
- Tests: `test_order_create_diagnostics.py`.

## 2026-07-19 â€” Orphan PACKING cart after last pack (cart id=2 pattern)

- ROOT: `finish_packing` cleared custody only when `order.cart_id` set; remaining used session-heal (`list_orders_on_cart`). Path: cart_id already NULL + `picking_session_id`/`current_session_id` â†’ remaining>0 â†’ event `order_packed` â†’ stuck PACKING; UI later 0 orders (cart_id-only).
- cancel-session 409 `InvalidCartTransition` READY/PACKING = correct (CASE A â‰  CASE C). Magazynâ†’WĂłzki must use admin-release heal, not cancel-session.
- FIX: always clear packed-order custody; remaining = `Order.cart_id` only; `release_empty_orphan_cart` SSOT; admin-release allows empty READY/PACKING orphan; UI copy for orphan â€žZwolnij wĂłzekâ€ť.
- Tests: lifecycle ssot orphan / last-pack / cancel still blocked.

## 2026-07-19 â€” POST /orders 500: missing picking_handoff_mode

- ROOT: ORM INSERT always includes `picking_handoff_mode`; prod schema without column â†’ OperationalError â†’ HTTP 500.
- PG tier0 previously skipped dedicated order ensures (sqlite-only steps); sync can fail silently.
- FIX: `ensure_orders_create_schema` before create; PG tier0 explicit handoff ensure; `ORDER_CREATE_ERROR` log + rollback; list schema includes handoff.
- Tests: `test_order_create_schema.py`.

## 2026-07-19 â€” AUDIT: picking dashboard 0 vs panel 1 (#1233) + cancel 409

- Dashboard 0 = PRELIMINARY eligibility (cart_id NULL + picking_finished_at NULL + open fulfillment) â€” **correct**, nie bug licznika.
- Cancel cart_id=2 â†’ 409 READY_FOR_PACKING/PACKING = **correct**; UI nadal oferuje â€žAnuluj zbieranieâ€ť bez gate na cart status.
- Reopen Picking: **nie istnieje** (tylko tekst bĹ‚Ä™du); status panel â†’ picking source bez guarda (`apply_order_panel_ui_status` / bulk).
- PROD row #1233: nie odczytano (brak DB); rekonstrukcja z 409 + predicates.
- NEEDS: status guard + kanoniczny Reopen + UI cancel gate. NIE counter fix.

## 2026-07-19 â€” Packing finish preflight audit (AVAILABLE)

- AVAILABLE + aktywne `order.cart_id` â‰  legalny flow (lifecycle breach; `finish_packing` no-op bez detach).
- Preflight: tylko PACKING | READY_FOR_PACKING; AVAILABLE+custody â†’ `CART_LIFECYCLE_INCONSISTENT` przed pipeline.
- Tests: AVAILABLE custody fail + local 4xx before pipeline.

## 2026-07-19 â€” Packing finish HTTP 400 (mode=baskets / basket-first)

- ROOT: `packing_finish_order` rzucaĹ‚ `CART_NOT_IN_PACKING` gdy cart = `READY_FOR_PACKING` **po** post-pack pipeline; basket-first nie woĹ‚a `startPacking`. `finish_packing` juĹĽ akceptowaĹ‚ READY.
- FIX: preflight cart przed mutacjami; READY_FOR_PACKING OK; usuniÄ™ty hard-raise; `PACKING_FINISH_TRACE`; idempotentny retry po `automation_finished_at`.
- Tests: `test_packing_finish_baskets.py` CASE 1â€“10.
- ORDER-ISSUE-TASKS 500: UNRELATED.

## 2026-07-19 â€” FINAL PRE-PUSH AUDIT (afc6843a + packing) â€” fixes

- BUG: cartless finalize used relative import `.picking_handoff_service` â†’ ModuleNotFoundError (CARTLESS handoff never wrote). Fixed â†’ `..picking_handoff_service`.
- BUG: `finish_packing` partial MULTI left `CartBasket.order_id` set. Fixed: clear basket slot like detach.
- GAP (open): `PATCH /orders/{id}/select-carton` tenant-only, no packing handoff/cart scope.
- GAP (open): recovery/consolidation â†’ READY_TO_PACK can leave `picking_handoff_mode=NULL` (not cart/cartless finalize paths).
- PERF WARN: soft reconcile on every `GET /packing/modes` loads packing-ready orders + completed null-cart sessions.
- HEAD at audit: `136fed44` (memory+pycache only after afc6843a). 24863af + afc6843a ancestors OK; first-scan helpers intact.
- Tests matrix: 80 passed (handoff/packing/lifecycle/cartless/finalize); FE packingHelpers 4 passed. Postgres schema: NOT TESTED.

## 2026-07-19 â€” Pickâ†’pack handoff provenance + scoped packing

- SSOT: `orders.picking_handoff_mode` = CART|BASKET|CARTLESS (immutable execution snapshot).
- Live `cart_id`/`basket_id` = custody until pack finish (CartLifecycle unchanged).
- Packing queue/EAN scoped; basket-first warehouse-global; no global FIFO; no NULLâ†’CARTLESS.
- Entry counts from real cohorts; 24863af pack-once preserved with required scope.
- Tests: `test_picking_packing_handoff.py`.

## 2026-07-19 â€” WMS Packing: first list scan + fake FINALIZED

- ROOT: list EAN â†’ resolve-only navigate (no pack); `isPackingSessionFinished` = `packed_at`; AutoActions hardcoded âś“âś“; list qty without `order_item_required_pack_qty`.
- AFTER: `POST /wms/packing/resolve-ean/scan` (FIFO + +1); FINALIZED = `wms_packing_automation_finished_at` + packed complete; list `pack_qty_from_required`; pipeline real states; lines_packed_complete requires `total_required_qty > 0`.
- Tests: `test_wms_packing_scan_flow.py`, `packingHelpers.test.ts`.
- ORDER-ISSUE-TASKS 500: UNRELATED.

## 2026-07-19 â€” Baskets put confirmation (PRODUCTâ†’BASKET)

- ROOT: quick-pick incrementowaĹ‚ qty bez skanu koszyka; UI tylko â€žOdĹ‚ĂłĹĽ doâ€¦â€ť.
- AFTER: SSOT `wms_basket_put` w `WmsOperationSession.metadata_json`; pending put + series per (product, order_item, basket).
- API: gate w `POST /picking/quick-pick`; `POST /picking/confirm-basket-put`.
- FE: duĹĽy ekran potwierdzenia koszyka; seria bez ponownego skanu.
- Tests: `test_wms_basket_put_confirmation.py` CASE 1â€“11.

## 2026-07-19 â€” Modal â€žEdycja trybu zbieraniaâ€ť: wĹ‚asny sticky footer

- ROOT: modal bez Zapisz/Anuluj; UX kierowaĹ‚ na globalny sticky bar (z-40) widoczny pod overlayem.
- AFTER: modal z-5000, sticky header/footer; Zapisz = commit do `savedConfigs` (bez API); Anuluj/X/ESC = restore `editBackup`; globalny pasek = API.
- Commit: `ca32f29` (bez push).

## 2026-07-19 â€” GET /order-issue-tasks 500: missing archived_at on request path

- ROOT (reproduced): request-path `ensure_order_issue_task_lifecycle_schema` added priority_* but **not** `archived_at`/`archived_by_user_id`; ORM SELECT still requires them â†’ `OperationalError`/`UndefinedColumn` after previous priority-only fix.
- FIX: call `ensure_order_issue_tasks_archive_columns` in request-path ensure; `ORDER_ISSUE_TASKS_ERROR` structured logging (no traceback to FE).
- Tests: `test_order_issue_tasks_archive_request_path.py` (legacy schema â†’ ensure â†’ list Ă—3).
- PROD SCHEMA VERIFIED: NO (no Railway/DB access); PG runtime test: NOT AVAILABLE.

## 2026-07-19 â€” CARTLESS PICKING (bulk / cart_no_scan)

- ROOT: `cart_no_scan` byĹ‚ AUTO_SELECT_PHYSICAL_CART via `GET /picking/default-cart` â†’ first BULK cart â†’ claim.
- AFTER: `start_cartless_picking` â€” `WmsOperationSession.cart_id=NULL`, `Order.cart_id=NULL`, scope=`picking_session_id`.
- API: `/picking/start-cartless`, `finalize-cartless`, `cancel-cartless-session`, `heartbeat-cartless`; product-lines + quick-pick + shortage z `picking_session_id`.
- FE: brak default-cart dla cart_no_scan; label â€žZbieranie bez identyfikacji wĂłzkaâ€ť; header sesji bez CART-xxxx.
- Timeout: `release_stale_cartless_sessions` w `run_cart_lifecycle_maintenance`.
- Tests: `test_wms_cartless_picking_ssot.py` (9). Bez migracji schematu / bez auto-heal legacy.

## 2026-07-19 â€” UX PRELIMINARY count + zero-assignment message

- Tile: tooltip + aria â€žzamĂłwieĹ„ oczekujÄ…cychâ€ť (bez zmiany nazwy statusu).
- Gate 8/8 â†’ `operator_message` z bootstrap (nie zaleĹĽny od count po FAIL status); FE modal + empty state products.
- Bez gate na configured-statuses; bez claim; CART AVAILABLE.

## 2026-07-19 â€” FINAL AUDIT: WĂłzki tile vs assignment (PRELIMINARY SSOT)

- Dashboard â‰  FULL assignment SSOT: count = eligibility + free `cart_id` only; scan still runs `gate_orders_before_capacity` â†’ real scenario tile>0 / assign=0 (stock/location FAIL).
- Intentional: no heavy validation on every configured-statuses GET.
- Zero-after-gate cart: already `_heal_empty_assigned("gate_rejected_all")` â†’ AVAILABLE (no claim). CASE 5 regression added.
- Docstrings corrected: PRELIMINARY SSOT, not â€žSSOT z assignmentâ€ť.

## 2026-07-19 â€” WĂłzki:8 vs empty CART assignment (PICK_ASSIGN_TRACE)

- ROOT: (1) kafel `configured-statuses.order_count` = surowy COUNT po `order_ui_status_id` (A); assignment = eligibility (`picking_finished_at`, fulfillment PICKING/PARTIAL/blank, consolidationâ€¦) + `cart_id IS NULL` + WMS validation gate (B) â†’ semantic drift; shortage/MISSING + `picking_finished_at` po finalize nadal w A. (2) `bootstrap_start_picking_if_needed` przy 0 candidates woĹ‚aĹ‚ `claim_cart` â†’ CART ASSIGNED/PRZYPISANY z orders=0.
- FIX: `count_assignable_orders_for_picking_statuses` w kafelku; eligibility traktuje blank fulfillment jak open + `deleted_at`; brak claim przy 0 â€” `release_cart` gdy ASSIGNED; log `PICK_ASSIGN_TRACE` per order z REJECTION_REASON.
- Tests: `test_wms_picking_assign_cart_empty_ssot.py` CASE 1â€“4.

## 2026-07-19 â€” GET /order-issue-tasks 500 + stale â€žDo zebraniaâ€ť

- ROOT list 500: (1) `ensure_order_issue_task_items_table` used SQLite-only DDL on PG allowlist path; (2) sync failure left session dirty â†’ `db.commit()` â†’ PendingRollback/500; (3) repair without savepoint poisoned PG txn; (4) `ensure_picking_shortage_support` SQLite-gated so `disable_auto_detach` ALTER skipped on Railway.
- Fix: ORM dialect-aware CREATE; rollback after sync fail; `begin_nested` around repair; PG-safe `ensure_wms_picking_shortage_settings_columns` on allowlist; clamp `ge=0` DTO fields; eager-load fallback.
- Semantics: shortage YES â†’ 1 active OrderIssueTask per order (upsert idempotent) on report + finalize.
- Stale â€žDo zebrania: 2â€ť: cart scan painted status-level `hubPickStats`; now refetch product-lines for scanned cart_id before navigate; products page does not show hub stats while loading.
- Tests: `test_order_issue_tasks_after_shortage_finalize.py`.

## 2026-07-19 â€” Finalize shortage detach: setting + heal READY_FOR_PACKING


- ROOT: checkbox `disableAutoDetachMissingOrdersFromCarts` was **localStorage-only** (backend never read it). Stuck carts in `READY_FOR_PACKING` early-returned without detach.
- Fix: DB field `disable_auto_detach_missing_orders_from_carts` on `wms_picking_shortage_settings`; helper `is_shortage_auto_detach_enabled` (= not disable); finalize reads it.
- Detach via `detach_order_from_cart(..., allow_shortage_finalize=True)`; heal path for READY_FOR_PACKING shortage; `release_cart` clears leftover order.cart_id.
- Trace logs: `FINALIZE_TRACE *`. Tests: real DB + fresh session + boolean ON/OFF.

## 2026-07-19 â€” Finalize shortage cart detach + activity log UX

- ROOT finalize: `finish_picking` always â†’ READY_FOR_PACKING with ALL orders still on cart (`clear_cart=False`). Shortage never detached.
- Fix: `finish_picking_after_wms_finalize` â€” detach shortage via CartLifecycle; all-shortage â†’ release; mixed â†’ packing-bound stay.
- Logs: OrderActivityLog.operator_user_id; LOGI CZYNNOĹšCI + ActivityLogTable columns CZAS|UĹ»YTKOWNIK|ZDARZENIE|KOMUNIKAT; NEWEST first; shortage single ActivityEvent (order+cart links, no duplicate).
- Tests: `test_wms_picking_finalize_shortage_cart_detach.py`.
- Audit: [Audit finalize shortage cart](54d3471c-7c00-4a93-b94a-2f97ad3eba17) confirmed keep-cart + `finish_picking` clobber.

# Change log

## 2026-07-19 â€” Railway boot: wms_order_validation imports

- Broken: `from ..auth_deps` / `from ..warehouse_context` (modules do not exist).
- Fixed: `from ..auth.deps import get_optional_current_user`, `from ..auth.warehouse_deps import require_operable_warehouse`.
- Gate: `python -c "import backend.main"` â†’ BACKEND IMPORT OK (exit 0). Commit `f3668ad`.

# Change log

## 2026-07-19 â€” Prod bugs: shortage list race + banner + finalize FK

- **P1 shortage 2Ă—entry:** FE `createRequestDeduper` joined pre-mutation `GET product-lines` after POST â†’ stale ACTIVE. Fix: `force` bypass; list refresh after shortage forces new GET; POST shortage returns `product_line` snapshot (same builder).
- **P2:** Removed top â€žZamĂłwienia niekompletneâ€ť banner (+ `cohortMissingByOrder`); row SHORTAGE UI kept.
- **P3 finalize FK:** orphan `orders.shipping_method_id` breaks UPDATE; sanitize before apply; safe operator message + `request_id`; audit script `audit_orphan_shipping_method_fk`; import assert FK assignable.
- **P4:** Finalize still classifies per-order (`all_picked`â†’PACKING, `all_missing`â†’MISSING, else NEEDS_DECISION) â€” not bulk PACKING; safe errors + rollback on failure.
- Tests: BE shortage product-lines / finalize orphan+classify; FE dedupe force + error UX.

## 2026-07-19 â€” SHORTAGE hardening verification (final)

- Flush SSOT: **flush-before-aggregate** in `sum_line_events` / `sum_missing` / `sum_pick` (nie globalny flush w `append_event`).
- Concurrent PG: `FOR UPDATE` na candidate `OrderItem`; test `ConcurrentShortagePostgresTests` (SHORTAGE_PG_URL).
- Legacy: audit raw vs effective; runtime clamp; bez MagicMock w produkcji.
- Logi: order + cart dual-write z `#order` / EAN / 1/1 / operator / CART.
- Related regression: 131 BE + 22 FE. Production deploy/repro: NOT VERIFIED.

## 2026-07-19 â€” SHORTAGE hardening (flush SSOT + concurrent + legacy clamp)

- SSOT: `append_event` flush + `sum_line_events`/`sum_missing`/`sum_pick` flush; safe scalar coerce (no `float(MagicMock)`â†’1).
- Concurrent: `SELECT â€¦ FOR UPDATE` on candidate OrderItems before declarable/write.
- Legacy: display/report clamp `missing â‰¤ requiredâ’picked`; read-only `audit_fe_missing_duplicates`.
- Atomicity: report-shortage endpoint rolls back on any unexpected Exception before commit.
- Tests: `test_wms_picking_shortage_hardening.py`.

## 2026-07-18 â€” ZGĹOĹš BRAK: first-submit wipe + idempotency + red UI

- ROOT: `SessionLocal(autoflush=False)` â†’ `sync_declared` / `recompute` SUM(MISSING) nie widziaĹ‚y pending `FE_MISSING` â†’ zerowaĹ‚y `wms_picking_line_missing_qty` mimo Activity eventu; drugie klikniÄ™cie â€žnaprawiaĹ‚oâ€ť UI i dublowaĹ‚o log.
- Fix: `db.flush()` po append + w sync/recompute; idempotent `already_resolved` NO-OP; order-aware Activity + `operator_user_id`; SHORTAGE â‰  zebrane (`braki`); czerwony wiersz; badge zamĂłwieĹ„ niekompletnych; defensive revalidate nie odĹ‚Ä…cza przy shortage.
- Tests: `test_wms_picking_shortage_first_submit.py` + FE `wmsPickingUiGates`.

## 2026-07-18 â€” CartLifecycle invariant: panel status + clear_cart

- `office_order_ui` patch status â†’ `apply_order_panel_ui_status` â†’ `detach_order_from_cart` (no raw clear).
- `cart_service.clear_cart` â†’ `admin_release_cart`; `clear_basket` â†’ `detach_order_from_cart`.
- `apply_fulfillment_state(clear_cart=True)` raises â€” cart clear only via lifecycle.
- Tests: `test_office_order_ui_cart_detach.py`.

## 2026-07-18 â€” WMS Validation hardening (detach SSOT + tests)

- `detach_order_from_cart(..., operator_user_id=None)` = System actor; gate no longer uses `clear_order_picking_session_context` bypass.
- Technical `ERROR`/`ORDER_NOT_FOUND` separated from product issues (no fake WMS_VALIDATION_FAILED).
- Integration: race G, active session H, multi-tenant J, activity L, perf (1 routing / batch).
- DEV audit test.db: 0 active cart orders would_fail.

## 2026-07-18 â€” WMS Order Validation SSOT (pre-Capacity)

- Package `backend/services/wms_order_validation/` â€” routing shortfalls â†’ PASS/FAIL + issues/reason_label.
- Settings: `wms_validation_failed_order_ui_status_id` (NULL = gate without status mutate).
- Gates: bootstrap + start_picking before Capacity; defensive revalidate on cart (no picks â†’ detach).
- Activity: one `WMS_VALIDATION_FAILED` / `PASSED` event; no PASS spam on auto gate.
- Revalidate: previous UI status in order metadata; order detail panel + API.
- Legacy: `audit_active_cart_orders_validation_failures` read-only.
- Tests: `test_wms_order_validation.py` (10).

## 2026-07-18 â€” shortage multi-order / remaining-first audit

- Audyt: FE wysyĹ‚aĹ‚o `order_item_id` FIFO â†’ shortage tylko na 1 linii; alokacja budgetem zjadaĹ‚a `declarable` (konwersja pickĂłw) przed remaining.
- Fix: product-level shortage bez `order_item_id` (tylko recovery); Orders `order_by(id)`; pass1=remaining, pass2=pickâ†’shortage; PARTIAL gdy rem>0 i (picked|miss)>0.
- Tests: `test_wms_picking_shortage_multi_order.py`.

## 2026-07-18 â€” shortage resolved â‰  DO POBRANIA / â‰  ZEBRANO

- ROOT: lista FE liczyĹ‚a `remaining = total â’ picked` (ignorujÄ…c `missing`); `completed` renderowane zawsze jako zielone ZEBRANO; powrĂłt z detail bez refresh â†’ stale â€žDO POBRANIAâ€ť + â€žBRAK LOKALIZACJIâ€ť.
- SSOT: `resolution_status` ACTIVE|PARTIAL|COMPLETED_PICK|SHORTAGE na product-lines/detail; remaining = req â’ picked â’ miss (juĹĽ w builderze).
- FE: SHORTAGE â†’ â€žZGĹOSZONO BRAKâ€ť; sort ACTIVEâ†’PARTIALâ†’COMPLETED_PICKâ†’SHORTAGE; detail bez CTA skanu przy peĹ‚nym shortage; refresh listy po powrocie.
- Finalize: bez zmian â€” nadal `all_picked` vs `all_missing`/`some_missing`.
- Tests: `test_wms_picking_shortage_resolution_status.py`, `wmsPickingUiGates.test.ts`.

## 2026-07-18 â€” empty location DOCUMENTS_ONLY + location-aware undo audit

- DOCUMENTS_ONLY: always accept empty-location report; pending CONTROL inventory + `InventoryLocationLock` (block_picking) â€” no illegal stock write; routing excludes location.
- HYBRID: unchanged RK zeroing.
- Undo/empty-location: Pick.location_id filter confirmed; regression A/B multi-loc undo.

## 2026-07-18 â€” picking corrections: undo pick + empty location + shortage after completed

- Audit: draft Pick does not touch Inventory; stock only at finalize.
- `POST /wms/picking/undo-pick` â€” LIFO delete/reduce draft picks + audit `PICK_UNDONE`.
- Shortage after 1/1: `declarable = ordered â’ missing`; undoes picks as needed before `FE_MISSING`.
- `POST /wms/picking/confirm-empty-location` â€” RK via `apply_manual_stock_correction`, concurrency `observed_stock_qty`, LOCATION vs PRODUCT shortage.
- Detail UI: corrective CTAs when completed; problem modal (empty / qty mismatch / product shortage).

## 2026-07-18 â€” picking session keeps completed products on list

- ROOT: backend `build_wms_picking_product_lines` filtered via `_picking_product_line_still_active` (remainingâ‰0 dropped).
- SSOT: with `cart_id` return full demand snapshot + `completed`; hub without cart still filters active-only.
- FE: partial multi-qty label; completed shows âś“ ZEBRANO + â€žPobrano z â€¦â€ť; sort unfinishedâ†’completed (already in `sortWmsPickingProductLinesPickFlow`).
- Tests: `test_wms_picking_session_keeps_completed_products.py` (SCANâ†’still 5â†’completed last).

## 2026-07-18 â€” product-lines/detail TypeError `_safe_touch_picking_session`

- Production: `TypeError: takes 0 positional arguments but 1 was given` at detail ~L915.
- Helper is `def _safe_touch_picking_session(**kwargs)`; 4 call-sites passed positional `db`.
- Fixed all to `db=db` (product-lines recovery, detail, quick-pick, shortage).
- E2E regression: `test_wms_picking_detail_safe_touch_session.py` (router + authenticated user).

## 2026-07-18 â€” bundle_component_index: canonical normalize (detail 500 fix)

- Root cause: `or 0` in tree builder â†’ `WmsPickingBundleComponentStatus(ge=1)` ValidationError at detail L1867.
- Semantics: index is projected (not DB column); NULL = unassigned; valid = unique â‰Ą1 among siblings.
- Canonical: `backend/services/bundles/bundle_component_index.py` + reindex in UX index / trees / scan.
- Skip non-components (`is_bundle_component=False`); never map all NULLâ†’1; safe sort; per-bundle try/except.
- `DEBUG_HTTP_500` body opt-in only (no APP_ENV auto-leak). Logs keep full traceback + request_id.
- Tests: `test_bundle_component_index_normalize.py`, detail endpoint 200 with NULL/0 meta.

## 2026-07-18 â€” HTTP 500 diagnostics + product-lines/detail root cause

- Canonical `wms.exceptions` log always includes `exception_type`, message, traceback, `file`/`function`/`line` under `request_id`.
- Added `ResponseValidationError` handler; HTTP 5xx keeps `__cause__` (`from e`); `exception_origin` prefers `backend/` frames.
- Local PG repro: detail 500 = `ValidationError` at `wms_picking_product_list_service.py` `build_wms_picking_product_detail` **L1867** (`bundle_component_index=0`).
- Reports: `memory/wms-http-500-diagnostics-audit.md`. No business fix yet.

## 2026-07-18 â€” Cart details UX (ERP layout)

- Layout: Podsumowanie KPI â†’ tabela zamĂłwieĹ„ â†’ Historia doboru (collapsed) â†’ Historia czynnoĹ›ci (table).
- Shared `ActivityLogTable` (Data | Operator | Akcja); `ActivityLogPanel` wraps it.
- Report: `memory/cart-details-ux-redesign.md`.

## 2026-07-18 â€” Activity Log final UX (no dupes, complete detach history)

- Capacity Analytics: collapsed by default; shows last-run date + analyzed/assigned/stop reason (historical).
- Activity: action without embedded #; numbers only when `show_order_numbers`; no metadata expand.
- Timeout / idle / cancel / admin release: explicit â€žOdĹ‚Ä…czono wszystkie zamĂłwienia.â€ť + # list.
- Report: `memory/activity-log-final-ux-report.md`.

## 2026-07-18 â€” Activity Log UX simplify + Capacity summary only

- ActivityLogPanel: only When / Who / What (+ optional #orders line); no expand/details.
- Assign/detach activity text: short sentences; numbers in metadata line.
- Capacity Analytics UI: last-run summary only (analyzed/assigned/stop reason); removed reject lists, 24h stats, order Capacity history panel.
- Report: `memory/activity-log-ux-simplify-report.md`.

## 2026-07-18 â€” Activity Log Framework (unified panel standard)

- Audit: `memory/activity-log-audit.md`.
- Backend ready fields: `occurred_at_display`, `operator_display`, `action`, `details`, `order_numbers`.
- FE `ActivityLogPanel`: DATA â†’ OPERATOR â†’ AKCJA + expand (no client translation).
- Dual-write WMS order activity â†’ `activity_events`; cart assign/detach full sentences with `#orders`.
- Capacity Analytics untouched. Report: `memory/activity-log-framework-report.md`.

## 2026-07-18 â€” SSOT Panel â†” WMS picking (capacity truncate regression)

- Root cause: WMS product-lines/count used status cohort while Panel used `list_orders_on_cart`.
- Added `resolve_wms_picking_order_ids` â€” with `cart_id` always SSOT; hub without cart stays cohort.
- Wired: product lines, detail, quick pick, shortage, finalize, bundle scan.
- Tests: `test_wms_picking_cart_ssot.py`; audit+report in `memory/ssot-panel-wms-orders-*.md`.

## 2026-07-18 â€” Capacity Analytics (diag layer)

- Activity Log: tylko wynik operacji (bez basket_assigned / skipĂłw); meta numerĂłw capped.
- Nowy magazyn: `capacity_analytics_runs` + reason aggs + details (lazy).
- API `/capacity-analytics/*`; admin sekcja â€žAnaliza Capacityâ€ť; historia Capacity na zamĂłwieniu.
- Report: `memory/capacity-analytics.md`.

## 2026-07-18 â€” Carts: detach one order + tooltips + Activity Log UX

- Lifecycle: `detach_order_from_cart` + `POST /carts/{id}/orders/{order_id}/detach` (blocked after picks / READY|PACKING).
- Assigned orders DTO: customer, products/EAN/SKU, weight, `can_detach`.
- FE tooltips on number + Pozycje; Activity Log expandable with inline order list.
- Report: `memory/carts-detach-tooltips-activity.md`.

## 2026-07-18 â€” Carts consistency audit (close-out)

- Full SSOT audit: all live order counts via `list_orders_on_cart` (volume refresh, clear_cart/basket, finish_packing remaining, pick progress).
- Activity descriptions include `#order_numbers` (no bare â€žPrzypisano N zamĂłwieĹ„â€ť).
- UI: Activity Log `refreshKey` + soft poll after admin release / timeout.
- Scenarios Aâ€“E: `backend/tests/test_cart_orders_consistency_scenarios.py` (PASSED).
- Report: `memory/carts-consistency-audit.md`.

## 2026-07-18 â€” Carts: assigned orders SSOT + admin UI

- SSOT: `list_orders_on_cart` for admin, WMS stats, Capacity Engine (BULK), lifecycle, WMS entry count.
- Admin expand: `AssignedOrdersSection` (number/status/items/volume/open + stub detach).
- Activity Log: `order_numbers` on assign/detach/timeout/admin release/start-finish-cancel picking.
- Capacity UI: single strip (collapsed card only).
- Report: `memory/cart-orders-ssot-report.md`.

## 2026-07-18 â€” Database Schema Health Check

- Tool: `python -m backend.scripts.schema_health_check` (+ `memory/schema-health-check.md`).
- PG allowlist: `ensure_wms_audit_tables`, packing automation, order WMS timeline, picks, carts code, esp scan.
- `ensure_wms_audit_tables` dialect-safe for PostgreSQL; capacity legacy DROP hardened.
- Local SQLite heal: carts capacity/lifecycle columns + `activity_event_links`; KRYTYCZNE focus â†’ 0.

## 2026-07-18 â€” Event Log: retire legacy `event_type`

- Root cause 500 admin-release: PG `cart_lifecycle_events.event_type NOT NULL` while ORM/writers use only `event_code`.
- `ensure_cart_lifecycle_events_table`: backfill `event_code` â† `event_type`, then `DROP COLUMN event_type` (+ commit so DDL sticks).
- Idempotent: live column check (`PRAGMA` / `information_schema`), 2nd/3rd run = no-op.
- Audit: 0 consumer/runtime refs to `event_type` for cart Event Log; SSOT = `event_code`.
- Regression: `backend/tests/test_cart_lifecycle_event_type_migration.py` (incl. 3Ă— ensure).

## 2026-07-18 â€” WMS stabilization health check (critical fixes)

- Fix: duplicate ORM index `ix_activity_events_category` crashed `create_all` on boot.
- Fix: activity log indexes always `CREATE INDEX IF NOT EXISTS` (even if table pre-existed).
- Fix: PostgreSQL allowlist runs cart lifecycle / capacity / cartstatus ensures (was SQLite-only no-op).

## 2026-07-18 â€” Admin force-release cart (OMS)

- `admin_release_cart` w CartLifecycleService (ASSIGNED/PICKING; blokada READY/PACKING).
- API `POST /carts/{id}/admin-release/` + perm `warehouse.carts.admin_release`.
- FE: `AdminReleaseCartButton` + modal potwierdzenia w `CartFleetDetailPanel`.
- Eventy: `admin_cart_released` / `admin_orders_detached` / `admin_picking_cancelled`.

## 2026-07-18 â€” Panel Activity Log (OMS)

- SSOT: `activity_events` + `activity_event_links` (jedno zdarzenie â†’ wiele obiektĂłw).
- API `GET /activity-log`; writer `record_activity` + bridge z CartLifecycle.
- FE: `ActivityLogPanel` (oĹ› czasu, zwijany) na zamĂłwieniach, wĂłzkach, regaĹ‚ach.
- SzczegĂłĹ‚y: `memory/activity-log-architecture.md`.

## 2026-07-18 â€” WMS user messages + Event Log PL

- Katalog `WmsUserMessage` (code/severity/title/message/details/suggested_action) â€” PL, bez HTTP/exception w UI.
- Picking claim/start/cancel â†’ komunikaty biznesowe; FE `WmsMessageModal` + Provider.
- Event Log: bogatsze opisy PL + `orders_assigned` / `basket_assigned` przy starcie zbierania.

## 2026-07-18 â€” Capacity Engine (target architecture)

- Nowy SSOT: `backend/services/cart_capacity/` (strategie LIMIT_ORDERS / LIMIT_VOLUME / HYBRID_* / BASKETS).
- Lifecycle `Cart.status` nietkniÄ™ty; occupancy (`OccupancyState`) tylko wyliczane.
- Model: `capacity_strategy` / `capacity_orders` / `capacity_volume`; drop `capacity_mode` / `max_orders`.
- UsuniÄ™to `cart_capacity_service.py`; `_apply_capacity_slice` â†’ engine; optimizer/basket best-fit â†’ engine.
- FE: StatusPill = lifecycle; CartCapacitySection = pojemnoĹ›Ä‡; edytory strategii.

## 2026-07-18 â€” Capacity Engine architecture (design)

- Status wĂłzka = wyĹ‚Ä…cznie lifecycle; zapeĹ‚nienie = osobna logika strategii.
- Docelowo jeden Capacity Engine: LIMIT_ORDERS / LIMIT_VOLUME / HYBRID (+ BASKETS dla MULTI).
- SzczegĂłĹ‚y: `memory/capacity-engine-architecture.md`.

## 2026-07-18 â€” Frontend cart capacity UI

- Fleet list/card/detail/editors: `capacity_strategy` + `CapacitySnapshot`; `StatusPill` (lifecycle) + `CartCapacitySection` (occupancy).
- Removed `CapacityModeFields.tsx`; `capacityStrategyLabel` in `labels.ts`.

## 2026-07-18 â€” CartStatus variant B (clean enum rebuild)

- Docelowy enum: AVAILABLE | ASSIGNED | PICKING | READY_FOR_PACKING | PACKING.
- PG: `migrate_cartstatus_enum_clean` â€” nowy typ â†’ remap â†’ swap kolumny â†’ drop starego â†’ rename (bez ADD VALUE).
- ORM: `CartStatus` tylko 5 czĹ‚onkĂłw; legacy tylko w `CARTSTATUS_LEGACY_TO_CANONICAL` / `normalize_cart_status_value`.
- FE: `types/cartStatus.ts`, StatusPill, fleet summary, locale keys bez FULL/PEĹNY.
- UsuniÄ™to TEMP `START_PICKING STEP` diagnostykÄ™ (po ustaleniu root cause enum).

## 2026-07-18 â€” Fix cartstatus PG enum (PICKING missing)

- Root cause: `InvalidTextRepresentation: invalid input value for enum cartstatus: "PICKING"`.
- Kod uĹĽywa lifecycle: AVAILABLE/ASSIGNED/PICKING/READY_FOR_PACKING/PACKING; stary enum miaĹ‚ PL lub IN_PROGRESS.
- **Superseded by variant B** (clean rebuild instead of ADD VALUE).

## 2026-07-17 â€” Fix Cart FOR UPDATE + joinedload (PostgreSQL)

- Przyczyna 500 picking/start: `FeatureNotSupported: FOR UPDATE cannot be applied to the nullable side of an outer join`.
- `_lock_cart` / `cancel_picking` / timeout workers: najpierw `SELECT carts FOR UPDATE`, potem `selectinload(Cart.baskets)` â€” bez OUTER JOIN na tym samym statement.

## 2026-07-17 â€” Fix silent HTTP 500 (log in exception handler)

- Root cause: handler zwracaĹ‚ `request_id`, ale tylko `attach_http_500_exception`; middleware (`BaseHTTPMiddleware`) nie widzi `request.state` â†’ brak tracebacku w Deploy Logs.
- Fix: `record_error` / `global_exception_handler` woĹ‚a `log_request_server_error` **przed** JSON 500; `exc_info=exc` (nie `format_exc()`).

## 2026-07-17 â€” Log flood control + HTTP 500 middleware

- `schema.reconcile`: jeden summary `FK cycles detected: N` + fallback (bez per-`fk_cycle_break`).
- Per-column/index/FK sync â†’ DEBUG; jeden INFO summary reconcile.
- `postgres_sequence_sync`: fix odczytu `is_called` + fallback `pg_sequences.last_value`; tylko summary (+ max 5 error samples).
- Middleware `outer_request_logger`: kaĹĽdy HTTP 500 â†’ ERROR z request_id/method/path/user/tenant/warehouse/file/line/traceback/duration (handler tylko attach exc).

## 2026-07-17 â€” Startup fixes + global 500 traceback

- `postgres_sequence_sync`: `is_called` z relacji sekwencji (nie z `pg_sequences`).
- `z_pz_schema._migrate_z_pz_series_padding`: SQL uĹĽywa kolumny `"type"` (ORM `series_type`); guard gdy brak kolumny.
- Exception logging: `format_exception_traceback(exc)` zamiast `traceback.format_exc()` w handlerze (usuwa faĹ‚szywe `NoneType: None`); log z request_id / method / path / file / line; HTTP 5xx z `HTTPException` teĹĽ logowane.

## 2026-07-17 â€” Fix postgres_sequence_sync `is_called`

- BĹ‚Ä…d: `SELECT last_value, is_called FROM pg_catalog.pg_sequences` â€” `pg_sequences` (PG 10+) **nigdy** nie miaĹ‚o `is_called`.
- `is_called` jest potrzebne do `next_sequence_value` / `setval` semantics â€” odczyt z relacji sekwencji: `SELECT last_value, is_called FROM "schema"."seq"`.
- Logika sync bez zmian; testy sequence sync: 9 passed.

## 2026-07-17 â€” Event Log: event_code + severity

- `event_code` (system) oddzielony od `description` (PL UI); logika tylko po kodzie.
- `severity`: INFO / SUCCESS / WARNING / ERROR / AUDIT (katalog).
- Analiza uogĂłlnienia `audit_events`: odĹ‚oĹĽona â€” `memory/audit-events-generalization-analysis.md`.

## 2026-07-17 â€” Event Log (PL) + Active Picking

- Tabela `cart_lifecycle_events` â€” dziennik biznesowy po polsku; writer tylko CartLifecycleService.
- API: `GET /wms/carts/{id}/events`; Active Picking: `/active-picking` (+ alias current-task).
- Eventy: rezerwacja, start/koniec kompletacji, pierwszy produkt, pakowanie, zwolnienie, timeout, auto-release, podwĂłjny claimâ€¦
- `notify_first_product_confirmed` z quick-pick; test peĹ‚nego cyklu PL.

## 2026-07-17 â€” Architecture Health Check (CartLifecycleService)

- FOR UPDATE na wszystkich mutacjach; heal bez wewnÄ™trznego commit.
- Atomic AVAILABLEâ†’PICKING (1 historia); idempotencja cancel/finish/release/start.
- `assert_cart_lifecycle_invariants` + `_after_mutation`.
- `ARCHITECTURE.md` + docstring ownership; raport: `memory/cart-lifecycle-architecture-health-check.md`.
- Testy: 16 passed (historia, idempotencja).

## 2026-07-17 â€” Cart lifecycle: claim opcjonalny, timeout, heartbeat, auto-release

- Claim opcjonalny: AVAILABLEâ†’start = atomowy claim+start; ASSIGNED bez orders/session.
- `CartAlreadyClaimed` (409); `claimed_at`; timeout ASSIGNED (`CART_ASSIGNED_TIMEOUT_MINUTES`).
- Auto-release PICKING przy 0 Pick (`CART_PICKING_IDLE_NO_PICKS_MINUTES`); â‰Ą1 pick â†’ zabronione.
- Worker: `backend/workers/cart_lifecycle_worker.py` (startup + maintenance).
- Heartbeat: `POST /wms/picking/heartbeat` â†’ tylko `last_activity_at` (+ refresh current_task).
- Current Task: `picked_count` / `remaining_count`; capacity tylko w `startPicking`.
- Legacy assign (`_assign_bulk`/`_assign_multi`/`mark_cart_*`) â†’ raise; writerzy lifecycle tylko w CartLifecycleService.
- Testy: atomic start, claim conflict, timeout, auto-release, current_task fields.

## 2026-07-17 â€” Cart Current Task + Lifecycle History

- `carts.current_task_json` + `apply_cart_transition` w CartLifecycleService.
- Tabela `cart_lifecycle_history` (from/to status, operator, reason, task_id).
- API: stats z `current_task`, `GET .../current-task`, `GET .../lifecycle-history`.
- Zapisy historii wyĹ‚Ä…cznie przez lifecycle.

## 2026-07-17 â€” Cart lifecycle SSOT (nowy model biznesowy)

- ZamĂłwienia **nie** sÄ… przypisywane przed skanem wĂłzka.
- `ASSIGNED` = wybĂłr wĂłzka (bez orders/session); `start_picking` (skan) = sesja + cart_id + capacity + PICKING.
- SSOT: `cart_picking_lifecycle_service.py`; API: `POST /picking/claim-cart`, `/picking/start`, `/packing/start-cart`.
- `touch` nigdy nie tworzy sesji (409 SessionNotFound).
- Assignment / simulation / optimizer: bez zapisu lifecycle.
- READY_FOR_PACKING: cart_id + assigned_user zostajÄ…; PACKING przy skanie pakowacza (`packing_user`).
- Testy: `test_cart_picking_lifecycle_ssot.py`.

## 2026-07-17 â€” Fix: cart AVAILABLE mimo aktywnej picking_session

- Root cause: sesja tworzona (`touch` / ensure), wĂłzek bez `current_session_id` / statusâ‰ PICKING.
- `bind_cart_to_picking_session`: status=PICKING, current_session_id, assigned_user_id, started_at.
- `assert_cart_ready_for_quick_pick` + quick-pick bootstrap: self-heal AVAILABLE+sesja â†’ PICKING.
- Startup: `heal_carts_with_orphaned_picking_sessions`.
- Stats: zamĂłwienia teĹĽ po `picking_session_id` aktywnej sesji (gdy current_session_id NULL).

## 2026-07-17 â€” Capacity ORDERS: enforce na wszystkich assign paths

- SSOT: `enforce_cart_orders_capacity(db, cart, new_orders=N)` â†’ 409 `{code, current_orders, max_orders, attempted}`.
- WpiÄ™te: simulation, picking assignment, ensure_order_basket, ensure_picking_session,
  quick-pick (`record_wms_quick_pick`), optimizer `_apply_fleet`.
- Bez polegania na FE.

## 2026-07-17 â€” quick-pick 409: log + message/debug

- Przed kaĹĽdym 409: `logger.warning("quick_pick rejected", extra={code, cart_*, session_*, order_count, â€¦})`.
- Body: `{ code, message, debug: { cart_id, cart_status, session_id, current_session_id } }`.
- FE: `formatFastApiErrorDetail` / `extractApiErrorMessage` czytajÄ… `message`; toast bez â€žRequest failed with status code 409â€ť.

## 2026-07-17 â€” Cart stats SSOT: GET /wms/carts/{id}/stats

- Jedno ĹşrĂłdĹ‚o prawdy: `orders.cart_id` + `orders.picking_session_id` (`cart_stats_service`).
- Endpoint: `GET /wms/carts/{id}/stats` â†’ orders/products/sections/occupied/volume/percent.
- Lista/detail cartĂłw uĹĽywa tego samego agregatu (bez picks / ORM-only fallback).
- FE: CartCard, CartFleetDetailPanel, CartDetails, BulkCartEditor â†’ `fetchWmsCartStats`.
- Test: `backend/tests/test_cart_stats_ssot.py`.

## 2026-07-17 â€” Cart capacity ORDERS: 409 CART_CAPACITY_EXCEEDED

- SSOT: `cart_capacity_service.assert_cart_orders_capacity` â€” przy `capacity_mode=orders`:
  `current_orders + incoming_orders <= max_orders`.
- Przekroczenie â†’ HTTP 409 `{ code, current_orders, max_orders, attempted_orders }`.
- WpiÄ™te: `simulation_service.assign_orders_to_cart`, `PickingAssignmentService`, WMS basket attach.
- FE CartCard: toast â€žWĂłzek moĹĽe pomieĹ›ciÄ‡ maksymalnie X zamĂłwieĹ„.â€ť
- Test: `backend/tests/test_cart_orders_capacity.py`.

## 2026-07-17 â€” quick-pick: 409 zamiast 503 + logi SSOT

- Przyczyna 503: `SQLAlchemyError` przy zapisie `cart.status=PICKING` do starego PG ENUM (PL) / brak `current_session_id`.
- Fix: statusâ†’VARCHAR w `ensure_carts_picking_lifecycle_columns`; walidacja SSOT â†’ 409 `SessionNotFound` / `InvalidCartState`.
- `POST /wms/picking/quick-pick`: `logger.exception` z tenant/warehouse/source_status/barcode/session/cart/user_id; brak nieobsĹ‚uĹĽonych wyjÄ…tkĂłw.

## 2026-07-17 â€” Cart/picking SSOT lifecycle

- Backend SSOT: `cart_picking_lifecycle_service` â€” AVAILABLEâ†’ASSIGNEDâ†’PICKINGâ†’READY_FOR_PACKINGâ†’PACKINGâ†’AVAILABLE.
- Assign: `picking_session` + `order.cart_id` / `picking_session_id` + `PICKING_IN_PROGRESS`.
- Finalize: **nie** odĹ‚Ä…cza wĂłzka; `cart=READY_FOR_PACKING`, `order=PACKING`; zwolnienie po ostatnim pack.
- Cancel: `POST /wms/picking/cancel-session` â€” restore status + free cart.
- FE: liczniki z `session_stats` API; modal wyjĹ›cia Kontynuuj / Anuluj zbieranie.
- Test: `backend/tests/test_cart_picking_lifecycle_ssot.py`.

## 2026-07-17 â€” Scanner Helper: pomocnik kodĂłw magazynowych

- Przebudowa Emulatora skanera (FE only): usuniÄ™to przycisk ENTER; Enter/Skanuj = skan, WyczyĹ›Ä‡ zostaje.
- Kategorie z licznikami, wyszukiwanie nazwa/kod/EAN/SKU, ulubione â­, szybki dostÄ™p (ostatni wĂłzek/koszyk/lokacja/produkt).
- Relacje wĂłzek â†” koszyki (drzewo, kopiuj kod, ponowny skan) na istniejÄ…cych `/carts/`, lokalizacjach, produktach, lookup zamĂłwieĹ„.
- Mobile: poziomy scroll kategorii, wiÄ™ksze kafelki (`useIsHandheldDevice`).
- ModuĹ‚: `frontend/src/components/wms/dev-scanner/*` + `useDevScannerCatalog`.

## 2026-07-17 â€” Warehouse policy v2: OperationContext + OMS/WMS split

- FE: `getOperationPolicy` / `OperationContext` w `warehouseOperationPolicy.ts`.
- BE: `warehouse_operation_policy.py` (lustrzana polityka + `assert_warehouse_if_required`).
- â€žWszystkie z filtraâ€ť â‰  wymĂłg magazynu dla workflow (status, priorytet, notatki, â€¦).
- `order.delete_orders` = OMS (bez WH); delete lokalizacji/zbiorĂłw/rezerwacji = WMS.
- Bulk status/patch/delete: WH opcjonalny; soft-skip statusĂłw cross-warehouse.
- Raport: `memory/warehouse-operation-policy-report.md`.

## 2026-07-17 â€” Warehouse gate: workflow zamĂłwieĹ„ bez wymogu magazynu

- Problem: `requireFulfillmentWarehouseForBulk` blokowaĹ‚ zmianÄ™ statusu panelu (i inne ops OMS) bez filtra magazynu.
- Policy: `frontend/src/lib/warehouseOperationPolicy.ts` â†’ `requiresWarehouse(operationType)`.
- OrderList: bramka per akcja; explicit IDs + workflow bez blokady; delete / filtered_all nadal potrzebujÄ… WH.
- Backend: optional `warehouse_id` na bulk-status / bulk-patch (explicit) i PATCH ui-status.
- Audyt: `memory/warehouse-requirement-audit.md`.

## 2026-07-17 â€” WMS home: wiÄ™ksze karty, bez â€žOtwĂłrzâ€ť, belka

- Karty desktop ~148px, wiÄ™ksze ikony/nazwy; caĹ‚a karta klikalna â€” usuniÄ™to â€žOtwĂłrz â†’â€ť.
- KPI: duĹĽe liczby w kolorze tonu, cieĹ„/border, nie jak inputy.
- Belka: biaĹ‚a, wiÄ™ksze ikony, gap, aktywny = `#f5f8ff` + border primary; bez truncate nazw.
- Hint: â€žEnter â€” wybierzâ€ť; sekcje wyraĹşniejsze; grid `minmax(280px,1fr)`.
- Preview: `/dev/wms-home-preview`.

## 2026-07-17 â€” WMS home: dopracowanie UI (ewolucja)

- Belka: 56px, `#ffffff`, border `#e9edf5`; aktywny moduĹ‚ `#f5f8ff` + primary, bez szarych filli / GripVertical.
- KPI: karty liczbaâ†’etykieta (h~76), desktop 5 kolumn, mobile scroll poziomy.
- Kafelki: min-h 120, max-w 280, hover `translateY(-2px)`; nazwy 2 linie (bez ellipsis).
- KrĂłtsze `shortDescription`; kontener `max-w 1800`; grid `minmax(260px,1fr)`; sekcje ciaĹ›niej.
- Kolektor: wiersz ~70px, wiÄ™ksze ikony/badge, wiÄ™kszy odstÄ™p sekcji.
- Preview: `/dev/wms-home-preview`.

## 2026-07-17 â€” WMS home: sekcje desktop + lista kolektor

- `/wms/menu`: `WmsHomePage` â€” `useIsHandheldDevice` â†’ `WmsDesktopHome` | `WmsCollectorHome` (wspĂłlne tiles/KPI/API).
- Desktop: KPI strip, wyszukiwarka + â€žSkrĂłty: 1-9 â€˘ Enter - otwĂłrzâ€ť, sekcje Operacje / Kontrola / PozostaĹ‚e, kafelki ~320Ă—140.
- Kolektor: listy DO ZROBIENIA / POZOSTAĹE (~72px), bez duĹĽych kart.
- TĹ‚o WMS shell + home: `#ffffff`, obramowania `#e9edf5` (bez szarych powierzchni).
- PodglÄ…d UI: `/dev/wms-home-preview` (mock KPI, desktop + kolektor obok siebie).

## 2026-07-17 â€” Fix login HTTP 500 (app_users protection columns)

- Przyczyna: ORM mapuje `is_system_user|is_owner|is_deletable|is_role_changeable`, a na PG kolumny mogĹ‚y nie powstaÄ‡ â€” `ensure_app_users_bootstrap_columns` dodawaĹ‚ je w tej samej transakcji co `CREATE TABLE app_user_warehouses (... AUTOINCREMENT)` (skĹ‚adnia SQLite) â†’ wyjÄ…tek + rollback ALTER â†’ SELECT przy loginie = 500.
- Fix: `ensure_app_users_protection_columns` w osobnej transakcji; DDL junction dialect-aware; wywoĹ‚anie w Tier 0 bootstrap + self-heal w `/auth/login`.
- Migracja ops: `025_app_users_protection_columns.sql` (brak Alembic w repo).
- Auth endpoints: `logger.exception` + detail z `error`/`code` zamiast cichego 500.
- Role w DB: `super_admin` (nie `SUPER_ADMIN`).

## 2026-07-16 â€” SUPER_ADMIN + sĹ‚ownik aplikacji (system_labels)

- `app_users`: `is_system_user`, `is_owner`, `is_deletable`, `is_role_changeable` (+ schema upgrade / migracja `024`).
- SUPER_ADMIN: nieusuwalny, bez zmiany roli, bez dezaktywacji; pierwszy ADMIN â†’ `is_owner` (lock delete/role).
- Tabela `system_labels` + API `/api/system/labels/*`; seed katalogu (nav/system).
- Frontend: `getLabel(key, fallback)` + cache localStorage + Support mode; panel **System â†’ SĹ‚ownik aplikacji** (tylko SUPER_ADMIN).
- `UI_STRINGS` przez Proxy â†’ `getLabel` (centralne etykiety); dalsza migracja hardcoded stringĂłw poza `UI_STRINGS` przyrostowo.

## 2026-07-16 â€” Modal â€žNowy tryb zbieraniaâ€ť: layout + Select statusĂłw

- Tryb zbierania | KolejnoĹ›Ä‡ zamĂłwieĹ„ w 2 kolumnach; w â€žPo produktachâ€ť kolejnoĹ›Ä‡ widoczna, disabled z opisem.
- Sekcje A/B zawsze widoczne; nieobsĹ‚ugiwane opcje/pola disabled z powodem (bez ukrywania).
- KrĂłtsze etykiety pojemnikĂłw (WĂłzek skan/bez, Pick & Pack, RegaĹ‚â€¦); opisy pod opcjami.
- Statusy: `PickingStatusSelect` (szukaj, badge koloru, grupy, max-h 300px, sticky search); etykieta â€žStatus po zakoĹ„czeniu zbieraniaâ€ť.
- Tylko UI â€” bez zmian API / enum / zapisu.

## 2026-07-16 â€” Zbieranie: nazewnictwo Sellasist 1:1 (UI)

- Nav: Konfiguracja statusĂłw, ZarzÄ…dzanie zbiorami, Ustawienia wspĂłlne, Metody zbierania, Braki przy zbieraniu, Magazyny, â€¦
- Etykiety pĂłl/checkboxĂłw/przycisku dodawania wg briefu; opcje trybĂłw 1:1.
- Sekcja `wms-pick-workflow` usuniÄ™ta z nav â€” treĹ›Ä‡ przeniesiona (bez zmian API).
- Raport: `memory/wms-picking-naming-deploy-report.md`.

## 2026-07-16 â€” Konfigurator zbierania: modal 1400px + nazwy Sellasist 1:1

- Drawer â†’ `PickingSettingsModal` (max-width 1400px), sekcje pionowe / gÄ™ste, A|B obok siebie na XL.
- Etykiety opcji: â€žDo wĂłzka z/bez wymuszenia skanowaniaâ€¦â€ť, â€žDo wĂłzkĂłw z koszykamiâ€ť, â€žWĂłzkiem mobilnymâ€¦â€ť, kolejnoĹ›Ä‡ daty/kurierĂłw jak w Sellasist.
- Bez zmian API / wartoĹ›ci enum / zapisu.

## 2026-07-16 â€” Zbieranie settings UX: mniej scrolla, 2 kolumny

- UsuniÄ™to prawy sticky â€žPodglÄ…d konfiguracjiâ€ť (`PickingConfigPreviewPanel` deleted).
- Shell: `sticky menu | content`, lewa nawigacja `lg:sticky lg:top-4`.
- Scroll-spy: `IntersectionObserver` w `WmsSettingsSectionRegistryContext` (+ scroll dla wysokich sekcji).
- NagĹ‚Ăłwek uproszczony do â€žZbieranieâ€ť; karty kompaktowe bez badge Aktywny/Nieaktywny (brak pojÄ™cia default w API).

## 2026-07-16 â€” Ustawienia zbierania: audit brakujÄ…cych helperĂłw po refaktorze

- PrzywrĂłcono lokalne helpery w `WmsPickingSettingsPanel.tsx`: `flattenOrderUiStatusOptions`, limity `BULK_ORDER_*` + `parseBulkOrderLimitInput`, `fieldHintClass`, `configBlockTitleClass`.
- Przyczyna: usuniÄ™cie przy czyszczeniu `WmsSettingsPage` bez przeniesienia do panelu.
- `npm run build` OK.

## 2026-07-16 â€” Ustawienia WMS â†’ Zbieranie: redesign UX (3 kolumny)

- Tylko UI: bez zmian API / pĂłl / zapisu (configs API + shortage API + localStorage extended).
- ModuĹ‚: `frontend/src/modules/wmsSettings/picking/` â€” shell 3-kolumnowy, lewa nawigacja IA, sticky podglÄ…d, drawer edycji trybu.
- Karty trybĂłw (status â†’ sposĂłb â†’ 1-poz./multi â†’ po zakoĹ„czeniu â†’ Edytuj/UsuĹ„); sekcje: tryby, workflow, kolejka, skan, wĂłzki, braki, magazyny, automatyzacja, widok, zaawansowane.
- `WmsSettingsPage` oczyszczony z martwego kodu po ekstrakcji panelu.

## 2026-07-16 â€” WMS settings UI standardization

- Shared: `WmsSettingsLayout` (hide aside â‰¤1 section), `WmsSettingsSection`, `WmsSettingCard`, `WmsSettingsFooter`.
- Coming soon tabs (Reklamacje, Crossdocking, Rozlokowania, PrzesuniÄ™cia): no dashed empty boxes.
- Canonical section labels: OgĂłlne / Workflow / Widok / Automatyzacja / Integracje / Drukowanie / Zaawansowane.
- Global sticky save bar via `WmsSettingsFooter` for dirty packing/picking/direct sales.

## 2026-07-16 â€” Settings: merge Uprawnienia into UĹĽytkownicy

- Removed fly-out item â€žUprawnieniaâ€ť (was a duplicate entry to groups).
- Users module tabs: UĹĽytkownicy Â· Role i uprawnienia Â· Grupy uĹĽytkownikĂłw (+ audit/costs/workforce).
- Restored status-access matrix at `/settings/administrators/roles` as â€žRole i uprawnieniaâ€ť.

## 2026-07-16 â€” Restore Ustawienia WMS in ERP sidebar

- Re-added top-level sidebar item ``Ustawienia WMS`` (`Settings2`) â†’ `/settings/wms`.
- Placed after ``Ustawienia``, above ``PrzejdĹş do WMS`` (not inside Settings fly-out).
- Page/route were intact; only nav entry was missing after sidebar refactor.

## 2026-07-16 â€” Global WMS scanner emulator restored

- `DevScannerPanel` always on under WMS (unless `VITE_ENABLE_DEV_SCANNER=false`).
- FAB â€žSkanerâ€ť, drawer: Skanuj / Enter / WyczyĹ›Ä‡, last 20 scans, active receiver footer.
- Ctrl+Shift+S; localStorage open + history. Same `handleScan` path as physical scanner.
- Keyboard wedge only in DEV or when flag explicitly `true`.

## 2026-07-16 â€” Cart list: assignment badge (who uses the cart)

- API list/detail: `assigned_user_id`, `assigned_user_name`, `assignment_type` (`packing` | `collecting` | null), `assignment_since`.
- Source: open `WmsPackingSession` via `order.cart_id` (priority) â†’ open picking `WmsOperationSession` â†’ unassigned. No new tables.
- UI: badge on each cart row (gray / blue / green) + hover tooltip (assignee, mode, since).

## 2026-07-16 â€” Cart orders hover preview

- API `orders_preview` on cart list/detail (eager: customer, ui status, items+product).
- Expand panel: hover on order count â†’ Floating UI popover (scroll, max 500px); click â†’ `/orders/:id`.

## 2026-07-16 â€” WĂłzki: white page background

- `CartsModuleLayout`: `omitCard` + `bg-white` fill (no slate canvas around nested card).
- Expand panel content on white; row hover highlight kept light.

## 2026-07-16 â€” Remove intermediate module h1 (breadcrumb â†’ tabs)

- Dropped duplicate page titles between breadcrumb and tabs in module shells.
- `ModuleListBreadcrumb` margin `mb-6` â†’ `mb-2` (tabs sit directly under nav).

## 2026-07-16 â€” WĂłzki: breadcrumb/title follow active tab

- `CartsModuleLayout`: Magazyn > {active tab} + h1 = tab label (not always â€žWĂłzkiâ€ť).

## 2026-07-16 â€” Cart content: expand under row (no Drawer)

- WĂłzki / WĂłzki z koszykami: content preview expands under the cart row (full width), not right Drawer.
- One open cart at a time (`expandedCartId` in `CartsFleetList`); 200ms grid-rows animation.
- `CartBasketEditDrawer` / edit flows unchanged.

## 2026-07-16 â€” WĂłzki: single module header

- `CartsModuleLayout` alone owns Magazyn > WĂłzki + title + tabs (incl. NoĹ›niki list).
- Tab pages keep description/actions/KPI only â€” no duplicate PageHeader/breadcrumb/title.
- Carriers list no longer self-hosts tabs.

## 2026-07-16 â€” Product link from location/carrier â†’ full edit card

- `LocationPreviewCarrierContents` + `CarrierItemsTable`: navigate to `/products/:id/edit` (catalog card), not simplified `/products/:id`.
- Pass `tenantId` in location state when available.

## 2026-07-16 â€” NoĹ›niki header rebuild

- KPI: Wszystkie / ZajÄ™te / Puste (occupied = sku_count|total_qty > 0); removed â€žGrupyâ€ť.
- Page owns breadcrumb + title + tabs (no duplicate â€žMagazyn > WĂłzkiâ€ť from CartsModuleLayout).
- Compact spacing (`space-y-2`/`space-y-4`, compact KPI) for large monitors.

## 2026-07-16 â€” Location preview UX fixes

- Slot hover: Floating UI only (`LocationSlotHoverCard`) â€” no native `title` tooltip; flip/shift so popup stays on screen.
- Occupancy: `used_volume` from ÎŁ(LĂ—WĂ—HĂ—qty) in dmÂł; if product dims missing â†’ `â€” %` + â€žBrak danych o objÄ™toĹ›ci produktĂłwâ€ť (no fake 0%).
- Carrier product cards: whole card clickable â†’ `/products/:id`, hover cursor + â€žOtwĂłrz kartÄ™ produktuâ€ť.

## 2026-07-16 â€” Location preview modal rebuild

- Modal wider (`max-w` ~1760px), 3-column layout for 27â€“32" screens.
- Occupancy: volume/weight/slots only when max known; else `â€” %` + â€žBrak danych o pojemnoĹ›ci noĹ›nikaâ€ť (no fake 0%).
- Rack front: all levels/positions, color legend (primary/reserve/active/blocked/empty), hover tip (kod/typ/noĹ›nik/SKU/iloĹ›Ä‡).
- Floor plan: highlight rack + aisle + location; carrier contents show photo/name/SKU/EAN/qty.
- API `visual-context`: `ean`, capacity fields, enriched `rack_bins` / `rack_grid.aisle`.

## 2026-07-16 â€” Szablony / Gotowe szablony card polish

- Cards: white `#FFFFFF`, border `#E5E7EB`, radius 16px, soft shadow + hover lift; removed grey preview backgrounds.
- Ready filter tabs: wrap + horizontal scroll, never clipped.
- Dimensions via `formatMm` / `formatLabelSizeMm` (max 1 decimal); no DPI / raw type ids in card meta â€” Polish labels (`Lokalizacja â€˘ 93 Ă— 67 mm â€˘ Edytowanoâ€¦`).

## 2026-07-15 â€” Szablony list UI rebuild

- `LabelTemplatesList`: single inner rail (260â€“280px) for typ etykiety + grupy; full-width right content.
- Row cards (`TemplateListRow`): checkbox, thumbnail, name/type/size/date/uses, actions; click selects; Lista/Karty toggle kept.
- Split into `templatesList/*`; no SASIST sidebar/navbar/tab changes; same APIs.

## 2026-07-15 â€” CSV mapping modal live label preview

- `CsvMappingModal`: two-column layout with right panel â€žPodglÄ…d etykietyâ€ť (`CsvMappingPreviewPanel`).
- Live `LabelPreviewCard` from draft mapping + in-memory CSV; record nav, single/grid (6), field values with orange â€žBrak mapowaniaâ€ť.
- Mapping table column â€žPrzykĹ‚ad (1. rekord)â€ť: `Kolumna â†’ Pole â†’ wartoĹ›Ä‡`. No PDF/backend.

## 2026-07-15 â€” Print queue unified 3-column layout

- All print modes (Lokalizacje, RegaĹ‚y, Pasek, WĂłzki, Import PDF, Import CSV) share `PrintQueueWorkspaceShell`: `380px | minmax(700px,1fr) | 320px`.
- Removed vertical stack + `max-w-[1500px]`; CSV keeps fullscreen `CsvMappingModal`; deleted `CsvImportQueueShell`.
- Handlers/API unchanged â€” UI shell only.

## 2026-07-15 â€” CSV mapping fullscreen modal

- Import CSV: mapping moved from left column into `CsvMappingModal` (backdrop blur, badges, table, auto/clear/save).
- Removed artificial `max-w-[1800px]` from CSV shell.

## 2026-07-15 â€” CSV import template picker UX

- Import CSV only: friendly print-kind chips filter templates; `CsvTemplatePicker` (search + thumbnails); no raw `(location)` labels.
- Mapping dropdown = template used variables only (no type-catalog dump).

## 2026-07-15 â€” Ready templates library UI

- `LabelReadyTemplatesPage`: Figma/Canva-style library â€” orange filter tabs, grouped sections, preview-first cards (`LabelGalleryThumbnail`), outline Edytuj/UĹĽyj + â‹® menu.
- New `readyTemplates/*`; presets stay client-side; â€žWĹ‚asneâ€ť from existing `GET /label-templates/`.

## 2026-07-15 â€” Label CSV print queue 3-column wizard

- Import CSV: wizard steps + left accordions (320px) + paginated preview + sticky summary (320px).
- New `printQueue/CsvImportQueueShell`, `PrintQueueStepWizard`, `PrintQueueAccordion`, `PrintQueueThreeColumnLayout`, `PrintQueueLabelPreviewPane`, `PrintQueueSummaryPanel`.
- No API/print logic changes â€” UI shell only for `printMode === "csv_import"`.

## 2026-07-15 â€” Label CSV mapping UX

- Dropdown no longer lists full `LABEL_VARIABLE_CATEGORIES`; scoped to `available_variables` / bindings / type fallback.
- New `csvMapping/*`: grouped searchable combobox, template field checklist, Wymagane/Opcjonalne/Nie znaleziono status.

## 2026-07-15 â€” Sidebar IA + new Sasist logo

- Removed MAGAZYN section and System/WMS menu rows; Magazyn + Ustawienia open right flyouts under OPERACJE.
- Footer CTA â€žPrzejdĹş do WMSâ€ť (56px, rounded-16, white border).
- New assets: `frontend/src/assets/logo/sasist-{mark,logo}.svg` (+ public/favicon sync); HeaderLogo / login / printer modal.

## 2026-07-15 â€” ERP shell polish (blue active + Magazyn flyout)

- Sidebar 260px: hamburger + logo in rail; active `bg-blue-50` + `w-1 bg-blue-600`; larger icons/gaps.
- Top bar: search + bell + warehouse (â‰Ą220px) + avatar only (no logo).
- Magazyn: side flyout 300px `rounded-r-3xl shadow-2xl` (click/hover, not accordion).

## 2026-07-15 â€” ERP AppTopBar rebuild

- New `components/layout/topbar/*`: HeaderLogo, GlobalSearch, NotificationBell, WarehouseSwitcher, UserMenu, AppTopBar.
- Removed KPI pills and secondary header icons; white 70px bar; Ctrl+K search (`erpTopbar` variant).
- Hamburger toggles sidebar via `ErpSidebarUiContext`; removed mobile overlay drawer (desktop-first).

## 2026-07-15 â€” ERP left sidebar UX rebuild

- New `ErpSidebar`: sections SPRZEDAĹ» / OPERACJE / MAGAZYN, WMS sticky bottom, profile footer, collapse 76px, mobile drawer.
- Orange active item (`bg-orange-50`, `border-l-[3px] border-orange-500`), white surface, 24px icons.
- Grouping via `NAV_SIDEBAR_SECTIONS` in `mainNavConfig.tsx`.

## 2026-07-15 â€” Purchasing product images

- Root cause: API returns relative `/uploads/...`; purchasing thumbs used raw URL â†’ 404 on SPA origin.
- Added `getProductImage` / `toAbsoluteProductImageUrl` (candidate fields + semicolon first + backend origin).
- Wired into `PurchasingProductThumbnail` and `purchasingProductDisplayMeta`.
- Dashboard critical/suggested rows now include `image_url`.

## 2026-07-12 â€” Sasist Printer Agent v1.0.4 pre-release audit

- `WindowRegistry` â€” singleton okien Status/Config/Logs; `TrayApp` reuĹĽywa instancji.
- `agent/ui/host.py` â€” jeden hidden root, non-daemon UI thread, Toplevel only (tray).
- `agent/ui_smoke_test.py` + `--ui-smoke-test` + `scripts/verify_agent_ui_smoke.ps1`.
- `verify_agent_exe.py` â€” icon SHA256 + moduĹ‚y `host/dialogs/window_registry`.
- `verify-release.ps1` â€” icon, built_at, build_info.json; manifest `icon_sha256`.
- `installer.iss` â€” `[InstallDelete]` legacy skrĂłtĂłw; jeden skrĂłt pulpitu.
- `install.ps1` â€” usuwa legacy skrĂłty przy upgrade; `verify_agent_upgrade.ps1`.
- VERSION â†’ 1.0.4.

## 2026-07-12 â€” Sasist Printer Agent desktop UI audit

- WspĂłlny wÄ…tek UI (`agent/ui/host.py`), Toplevel zamiast wielu `tk.Tk()` na wÄ…tkach daemon.
- Ujednolicony nagĹ‚Ăłwek (`app_header`), theme, karty, badge, filtry chip w Log Viewer.
- Setup Wizard 4-krokowy; Config/Status/Logi bez `messagebox` / `LabelFrame`.
- Instalator: jeden skrĂłt pulpitu z `{app}\assets\icon.ico`; usuniÄ™te skrĂłty Logs/Config.

## 2026-07-12 â€” Sasist Printer Agent release validation

- `installer/build.ps1`: po PyInstaller walidacja PYZ (UI modules + VERSION); po Inno Setup walidacja nazwy instalatora i EXE wyciÄ…gniÄ™tego z setupu; exit 1 przy braku moduĹ‚Ăłw UI.
- `scripts/verify_agent_exe.py`: weryfikacja moduĹ‚Ăłw `agent.ui.*` i spĂłjnoĹ›ci VERSION (utf-8-sig).
- `scripts/verify-release.ps1`: SHA256 manifest vs lokalny build vs GitHub asset, UI modules, wynik PASS/FAIL.
- CI: `verify-release.ps1 -SkipGithub` przed uploadem; peĹ‚na weryfikacja GitHub po publikacji tagu.

## 2026-07-11 â€” Integracja drukowania Sasist (frontend + orchestracja backend)

- Backend: `POST /api/printing/jobs/queue` â€” generuje PDF server-side, zapisuje plik, tworzy PrintJob z `pdf_url` â†’ `/jobs/{id}/file`.
- Backend: `GET /api/printing/jobs/{id}/file` â€” pobranie PDF przez agenta (Bearer).
- Frontend: `printingApi.ts`, `useQueuePrint`, moduĹ‚ Ustawienia â†’ Drukarki (agenci / drukarki / domyĹ›lne / legacy QZ).
- Integracja â€žDrukujâ€ť: dokumenty magazynowe, sprzedaĹĽowe, kolejka etykiet â†’ kolejka drukowania + toast sukcesu.

## 2026-07-11 â€” Sasist Printer Agent Windows MVP (Faza 2Aâ€“2F)

- Nowy projekt: `sasist-printer-agent/` â€” Python 3.12, requests, pywin32, pystray, PyInstaller.
- ModuĹ‚y: config, api, auth, printers, heartbeat, jobs, printing, tray, app.
- Config/logs: `%ProgramData%\Sasist\PrinterAgent\`.
- Testy: `sasist-printer-agent/tests/` (6 passed).

## 2026-07-11 â€” Printing MVP Faza 1Bâ€“1D (API + serwisy + testy)

- Serwisy: `backend/services/printing/` â€” auth token `spt_*`, rejestracja/heartbeat agentĂłw, sync drukarek, job lifecycle (atomowy claim), defaults.
- API: `/api/printing/*` â€” agents, printers, jobs, defaults (`backend/api/printing/`).
- Auth agenta: `get_current_agent()` â€” Bearer `spt_*`, bez JWT.
- Testy: `backend/tests/printing/test_printing_api.py` â€” 16 testĂłw, wszystkie przechodzÄ….
- **NastÄ™pny krok:** Faza 2 â€” agent Windows.

## 2026-07-11 â€” Printing MVP Faza 1A (modele + migracje + schemas)

- Nowe tabele ORM: `printer_agents`, `agent_printers`, `print_jobs`, `printing_defaults` (`backend/models/printing/`).
- Pydantic schemas: `backend/schemas/printing/` (agent, printer, job, defaults).
- Tier 1 ensure: `backend/db/printing_schema.py` + wpis w `schema_tiers.py`.
- SQL referencyjny: `backend/migrations/018_printing_mvp.sql`.
- Legacy `printers` (QZ) bez zmian; nowy model `AgentPrinter` â†’ tabela `agent_printers`.
- **NastÄ™pny krok:** Faza 1Bâ€“1D (serwisy + API `/api/printing/*`).

## 2026-06-08 â€” UsuniÄ™cie segmentacji ABC/XYZ (Zakupy i planowanie)

- UsuniÄ™to endpoint `GET /purchasing/segments`, serwis `purchasing_segments_service`, strony/komponenty heatmapy i priorytetĂłw.
- Plan zakupĂłw: `PlanCategoryStrip` (Hity sprzedaĹĽy, Niski zapas, Martwy stock, Ryzyko braku, Wysoka wartoĹ›Ä‡ magazynu) zamiast AXâ€“CZ.
- Auto-reorder i replenishment bez filtrĂłw `segment_abc` / `only_segments`.
- Opcjonalna migracja SQL: `backend/db/migrations/optional/2026-06-08_drop_abc_xyz_purchasing.sql`.
- Raport: `docs/abc-xyz-removal-report.md`.

## 2026-06-08 â€” Sidebar ERP + dashboardy: gÄ™stoĹ›Ä‡ informacji (design tokens)

- `erpDensityTokens.ts` â€” globalne tokeny: `sidebarItemHeight`, `sidebarItemGap`, `dashboardCardPadding`, `dashboardSectionGap`, `kpiCardHeight` + klasy Tailwind.
- `dashboardDensityPrimitives.ts` â€” wspĂłlne klasy kart/sekcji dashboardĂłw.
- Lewy sidebar (`ErpShellLayout`, `NavFlyoutPanel`): wiersze 36px, `px-3 py-1.5`, ikony 17px, ciaĹ›niejszy fly-out.
- WMS w menu jako normalna kategoria (miÄ™dzy Etykietami a Dokumentami) â€” bez separatora na dole; routing `/wms/menu` bez zmian.
- Dashboardy: gĹ‚Ăłwny (`Dashboard.tsx`), zakupy (`PurchasingKpi*`, `PlanningDashboard` shell), analityka, WMS supervisor, flota wĂłzkĂłw, magazyn, dokumenty KPI â€” mniejsze paddingi i odstÄ™py.
- Backend / routing / logika / uprawnienia bez zmian.

## 2026-06-08 â€” Listy floty (wĂłzki, noĹ›niki, regaĹ‚y): kompaktowe wiersze 68px

- WspĂłlny moduĹ‚ `modules/fleetResource/` â€” wiersz 68px, pasek zapeĹ‚nienia 6px, akcje 32Ă—32 poziomo, drawer szczegĂłĹ‚Ăłw.
- `CartCard` â€” widok zwiniÄ™ty (jeden rzÄ…d); szczegĂłĹ‚y w `CartFleetDetailPanel` (drawer z prawej).
- `CarriersGroupTable`, `ConsolidationRacksListTable` â€” ta sama wysokoĹ›Ä‡ wiersza i poziome akcje.
- Backend bez zmian.

## 2026-06-08 â€” Faza 0 layoutĂłw + migracja Projektanta Magazynu

- Nowa infrastruktura: `frontend/src/components/layout/app/*` (`AppPageLayout`, `AppContentLayout`, `AppSplitView`, `AppRightPanel`, `AppSectionCard`) + `appLayoutTokens.ts`.
- Shell: `ErpShellLayout`, `WmsOperationalLayout`, `WmsTopBar` â€” jedno tĹ‚o `bg-slate-50`, border-only (bez shadow / overlay).
- Projektant: `WarehouseDesigner` â†’ `AppPageLayout` + `AppSplitView`; prawy panel regaĹ‚u/elewacji in-flow (`WarehouseMainView`, `ElevationSidePanel`, `RackPropertiesSidebar`); usuniÄ™to `fixed right-0` z `WarehouseModals`.
- Backend bez zmian.

## 2026-06-08 â€” Purchasing API: schema sync PostgreSQL + orders N+1

- `ensure_purchasing_orm_schema` â€” cross-dialect sync Supplier / PurchaseOrder ORM (Railway Postgres).
- `ensure_supplier_purchasing_columns`, `ensure_purchase_order_tax_invoice_columns` â€” dziaĹ‚ajÄ… teĹĽ na PostgreSQL (wczeĹ›niej sqlite-only â†’ potencjalne HTTP 500).
- `list_purchase_orders` â€” `joinedload(supplier)` + batch `item_count` (eliminacja N+1).
- `purchasing_segments_service` â€” agregacja tygodniowa w SQL (ISO year/week) zamiast GROUP BY dzieĹ„.

## 2026-06-08 â€” Plan zakupĂłw: split layout + panel produktu

- `/purchasing/plan` â€” lewa: KPI, mini heatmapa segmentĂłw (AXâ€“CZ), liczniki alertĂłw + szybkie filtry, tabela; prawa (max 420px): szczegĂłĹ‚y po klikniÄ™ciu wiersza (prognoza, segment, alerty, historia sprzedaĹĽy, rekomendacja).
- UsuniÄ™to osadzanie peĹ‚nych stron Alerty/Segmenty/Prognoza w sidebarze; `PlanSidePanel` / `?panel=` wycofane.
- Backend bez zmian.

## 2026-06-08 â€” Zakupy i planowanie: refaktor UX (4 zakĹ‚adki)

- Menu: Pulpit | Plan zakupĂłw | ZamĂłwienia | Dostawcy (zamiast 10 zakĹ‚adek).
- `/purchasing/plan` â€” centrum pracy (tabela + panele prognozy/segmentĂłw/alertĂłw); legacy redirecty z generatora, prognozy, segmentĂłw, alertĂłw, auto-reorder.
- `/purchasing/suppliers/{ocena,historia,oszczednosci}` â€” hub dostawcĂłw w module ZakupĂłw; redirecty ze starych tras i `/suppliers/ocena|historia`.
- Backend bez zmian.

## 2026-06-08 â€” Dokumenty magazynowe: kompaktowy widok szczegĂłĹ‚Ăłw (UX/UI)

- Modal PZ/WZ/MM/PW/RW: nagĹ‚Ăłwek ~250px, dwie karty info, pasek finansĂłw inline.
- Tabela pozycji: `flex-1`, scroll wewnÄ™trzny, gÄ™stsze komĂłrki.
- Podsumowanie: jeden wiersz Netto | VAT | Brutto (+ iloĹ›ci).
- Stopka: akcje pomocnicze lewo, operacyjne prawo, tokeny `listSellasist`.
- Z-PZ: ten sam ukĹ‚ad kompaktowy + fix importu `documentCreatedByLabel`.


- `LabelGalleryThumbnail` â€” renderuje prawdziwy podglÄ…d SVG (`renderLabel` + `buildPreviewRecord`), cache per preset.
- Karty: miniatury 140px, proporcje zachowane, wybĂłr slate-900 + âś“, hover translate/shadow 150ms.
- Modal: segmented control (`tabsNavSegmentedItemClassName`), stopka z licznikiem + `listSellasistToolbarToggleBtn` / `labelDesignerToolbarPrimaryBtnClass`.
- UsuniÄ™to ikony zastÄ™pcze i kolory cyan z galerii.


- Typ etykiety: wyĹ‚Ä…cznie typy magazynowe (`LABEL_DESIGNER_TYPE_OPTIONS`), bez dokumentĂłw ERP.
- Pasek: `LabelDesignerToolbarSelect`, pola liczbowe bez spinbuttonĂłw, `h-10` na wszystkich kontrolkach.
- Menu â€žWiÄ™cejâ€ť: import/eksport, zapisz jako, duplikuj, reset, ustawienia projektu (`LabelDesignerMoreMenu`).
- Przycisk â€žZapiszâ€ť: tokeny jak PrimaryButton w listach ERP (`labelDesignerToolbarTokens`).
- Ustawienia projektu: modal z custom selectem grupy (`LabelDesignerProjectSettingsModal`).

## 2026-06-08 â€” DTE edytor: UX IDE (12 poprawek, frontend only)

- Lewy panel: persist zakĹ‚adka + rozwiniÄ™te sekcje zmiennych (`useLeftPanelPersistence`).
- UĹĽycia: klikalne badge â†’ `AssignmentConfigModal`; funkcje pogrupowane (`HelperCatalogPanel`).
- Prawy panel: przypiÄ™ty / odĹ‚Ä…czony (`DetachedInspectorPanel`); podglÄ…d bez auto-refresh przy pisaniu; scroll iframe.
- Monaco: minimap (localStorage), breadcrumbs TWIG, status bar VS Code, dark theme; responsywnoĹ›Ä‡ &lt;1600 / &gt;2200 px.

## 2026-06-08 â€” DTE ERP: fix picking-list 503 + masowy druk

- **503 picking-list:** `order_provider` woĹ‚aĹ‚ `map_sale_document(doc=None)` â†’ `AttributeError` w `_resolve_payment`; naprawa: `map_order_for_print()` + guard `doc is not None` w mapperze.
- **Masowy druk DTE:** `ErpBulkPrintModal` â€” zamĂłwienia (Multiakcje â†’ Drukuj), produkty (bulk bar), magazyn (`DocumentsWarehousePage`), sprzedaĹĽ (`DocumentsSalesPage` â€” checkboxy + Drukuj).
- **Frontend build:** exit 0 po integracji.

## 2026-06-08 â€” MRP komercyjny: strategie prognozy, MOQ, symulacja

- **Strategy Pattern:** `DemandForecastStrategy` â€” 6 strategii (Ĺ›rednia, waĹĽona, dzieĹ„ tygodnia, mediana, max, AI placeholder).
- **Ustawienia:** Produkcja â†’ Prognozowanie (`production_forecast_json` per magazyn).
- **Produkt:** `max_total_stock`, `production_moq`, `production_batch_multiple`, `production_lead_time_days` (+ istniejÄ…ce `min_total_stock`).
- **Serwisy:** `PlanningService`, `MaterialAvailabilityService`, `ProductionRecommendationService`, `PriorityEngine`, `LeadTimeService`, `SimulationService`, `InventoryCoverageService`.
- **API:** `POST /production/planning/simulate`, `POST /production/planning/simulate/create-batches`.
- **UI:** KPI dashboard, kolumna â€žDlaczego?â€ť, wykres osi czasu, modal symulacji.

## 2026-06-08 â€” Planowanie zapotrzebowania MRP (ProductionPlanningService)

- Backend: `backend/services/production_planning/` â€” order demand, velocity, pipeline, priority, `demand_engine_service`.
- API: `GET /production/planning/demand?warehouse_id=&coverage_days=&sales_lookback_days=`.
- UI: sekcja Planowanie zapotrzebowania na `/production/planning` â€” 3 karty + tabela; CreateBatchModal z pre-fill z MRP.

## 2026-06-08 â€” Produkcja WMS: jeden ekran zbierania + WmsProductTaskCard + PW draft

- **Zbieranie:** nagĹ‚Ăłwek z produktem koĹ„cowym (partia/MO, zdjÄ™cie, SKU, iloĹ›Ä‡); wszystkie pĂłĹ‚produkty na jednym ekranie; accordion â€” aktywna karta rozwiniÄ™ta, po potwierdzeniu auto-rozwija nastÄ™pnÄ…; `CollectionJobHeaderRead` w API.
- **Komponenty:** `WmsProductTaskCard` (wrapper na `WmsProductCard`) â€” Produkcja/Zbieranie; PrzyjÄ™cie/Rozlokowanie nadal na wĹ‚asnych kartach (ReceivingLineCard, PutawayLineCard) â€” migracja w toku.
- **PW:** status `draft` + `receiving_status=DONE` + `putaway_status=NOT_STARTED` (jak PZ po PrzyjÄ™ciu) â€” ta sama brama Rozlokowania.
- **Railway 404 settings:** `/api/wms/settings/production` i `product-validation` â†’ 404 na produkcji; `/api/wms/settings/packing` â†’ 401 (trasa istnieje). Wniosek: Railway uruchamia commit **sprzed** `4438ab9` (trasy dodane w v3) â€” nie brak routera lokalnie, lecz stary deploy.

## 2026-06-08 â€” Produkcja WMS: zbieranie z wyborem lokalizacji + fixy PW/settings

- Zbieranie: jedno zadanie na pĂłĹ‚produkt, lista lokalizacji z badge WMS, LOT/partia/waĹĽnoĹ›Ä‡/S/N, wybĂłr lokalizacji przez operatora.
- DostÄ™pne: iloĹ›Ä‡ na wybranej lokalizacji + suma magazynowa `(X szt. w magazynie)`.
- ZdjÄ™cia wyrobu: kolejka WMS, pasek aktywnego zadania, karty zadaĹ„, ERP BatchCard (product_image_url z API).
- PW: `recompute_putaway_status_for_document` po utworzeniu; po zakoĹ„czeniu produkcji nawigacja do `/wms/putaway/{pwId}`.
- WMS Settings: `_wms_settings_wh_dep` respektuje `warehouse_id` z query; log montowania tras przy starcie.

## 2026-06-08 â€” Produkcja WMS: PW â†’ standardowe Rozlokowanie + ustawienia terminala

- **Workflow:** zakoĹ„czenie produkcji tworzy dokument PW (`creation_source=PRODUCTION`) i wrzuca go do kolejki `/wms/putaway` â€” bez osobnego terminala â€žOdĹ‚oĹĽenie wyrobĂłwâ€ť.
- **Backend:** `pw_putaway_handoff.py`, `finish_production` / `finish_order_production` â†’ `completed` + PW; fazy terminala: tylko `collecting` | `execute`.
- **Ustawienia:** Ustawienia â†’ WMS â†’ Produkcja â€” widok terminala + wymagane dane (`GET/PUT /wms/settings/production`).
- **Zbieranie:** karty zadaĹ„ jak inne terminale WMS (zdjÄ™cie, SKU, EAN, lokalizacja, iloĹ›ci); `CollectionTaskRead` rozszerzony o EAN/stan/jednostkÄ™.
- **ERP:** miniatury produktĂłw na szczegĂłle partii i MO (wyroby + skĹ‚adniki).
- **Frontend:** usuniÄ™to zakĹ‚adkÄ™ putaway z terminala produkcji; redirect legacy URL â†’ `/wms/putaway`.

## 2026-06-08 â€” WMS: globalna walidacja produktĂłw + override per SKU

- **Globalne ustawienia:** `wms_settings.validation_require_*` â€” konfiguracja w Ustawienia â†’ WMS â†’ PrzyjÄ™cia â†’ Walidacja produktĂłw.
- **Override produktu:** `products.validation_skip_*` â€” wyĹ‚Ä…czenie globalnej reguĹ‚y dla konkretnego SKU.
- **SSOT:** `product_validation_policy.resolve_effective_receiving_requirements()` â€” effective = global && !skip (legacy per-product flags do migracji).
- **Migracja:** `ensure_wms_product_validation_schema` â€” OR flag produktĂłw â†’ global, skip = NOT legacy per produkt.
- **UI:** karta produktu = tylko wyĹ‚Ä…czenia; `ProductReceivingRequirementsSection` przeniesiony do ustawieĹ„ WMS.

## 2026-06-08 â€” Produkcja UX: layout receptury + fix React #130

- **React #130:** `AppEmptyState` wymaga `icon: LucideIcon`; brak `icon` na `ProductionOrdersPage` (i innych listach) powodowaĹ‚ render `<Icon />` z `undefined` â†’ crash przy pustej liĹ›cie zleceĹ„ po utworzeniu MO.
- Naprawiono: `ProductionOrdersPage`, `BatchesListPage`, `ProductionHistoryPage`, `ProductionAnalyticsPage` â€” dodano ikony.
- **Formularz receptury:** `PRODUCTION_NUMBER_INPUT` ukrywa natywne spinnery w polach number (wydajnoĹ›Ä‡, iloĹ›Ä‡, odpad); wersja pozostaje polem tekstowym.
- **Layout `ProductManufacturingPanel`:** grid 65/35 â€” lewa: dane receptury, edytor skĹ‚adnikĂłw, podglÄ…d BOM, RW/PW; prawa (sticky): zuĹĽycie materiaĹ‚Ăłw + historia produkcji.
- **`CompositionVisualEditor`:** skĹ‚adniki i podglÄ…d BOM w jednej kolumnie (nie obok siebie).

## 2026-06-08 â€” Produkcja Faza 3: ERP monitoring-only (execution â†’ WMS)

- `ProductionOrderDetailPage` / `BatchDetailPage` â€” monitoring + timeline, CTA: Wydaj do WMS / OtwĂłrz terminal / Anuluj
- `ProductionMonitoringPanel`, `ProductionExecutionTimeline`, `productionExecutionTimeline.ts`
- OdĹ‚Ä…czono `ProductionOrderExecutionPanel` i `ProductionBatchExecutionPanel` od UI
- `ProductionPage`, `BatchCard` â€” bez akcji wykonawczych ERP
- Legacy API/endpoints oznaczone `@deprecated` (Phase 4 cleanup)

## 2026-06-08 â€” Produkcja Faza 2: unified WMS terminal (frontend)

- Kolejki terminala przez `GET /production/wms-queue` (partie + MO w jednej liĹ›cie)
- Hook `useProductionExecutionJob` â€” ukrywa rĂłĹĽnice batch/order API
- Routing kanoniczny: `/wms/production/{collecting|execute|putaway}/:kind/:id` + redirecty legacy
- `WmsProductionJobQueueCard` z badge Partia/MO; strony Collecting/Execute/Putaway przebudowane
- ERP panele execution oznaczone `@deprecated` (Phase 3)

## 2026-06-08 â€” Produkcja Faza 1: unified WMS execution (MO + partia)

- **Model MO:** `collection_state_json`, `released_to_wms_at`, `released_by_user_id`, fazy `collecting_completed_at` / `production_completed_at`; statusy `collecting` / `putaway`
- **Pakiet `production_execution/`:** `order_execution_service`, `wms_queue_service`, `job_projection_service`, `constants`, `status_migration`
- **Kontrakt:** `ProductionExecutionJobRead` + `GET /production/wms-queue?phase=collecting|execute|putaway`
- **MO WMS API:** release-to-wms, start-collecting, collection, finish-collecting, production-progress, finish-production, finish-putaway
- **Migracja:** `migrate_legacy_order_execution_statuses` w `ensure_production_schema_evolution`
- **Frontend (minimal):** `releaseOrderToWms`, statusy MO, â€žWydaj do WMSâ€ť na liĹ›cie zleceĹ„ dla MO
- **Testy:** `backend/tests/test_production_execution.py`

## 2026-06-08 â€” Produkcja: fundamenty architektury (receptury, MO, handoff WMS)

- **Receptury:** MO tworzone przez `composition_id` (`ProductComposition`); `clone_composition_version` + `POST /compositions/{id}/clone`; lista receptur uĹĽywa `compositionApi` (activate/clone)
- **MO:** ekran `/production/orders/:orderId` (`ProductionOrderDetailPage`) + `ProductionOrderExecutionPanel` (start/complete/cancel, RW/PW)
- **Handoff WMS:** `released_to_wms_at` na partii, `POST /production/batches/{id}/release-to-wms`; kolejka WMS tylko partie wydane; `start-collecting` wymaga wydania
- **Integracja zestawĂłw:** `BundleProductionPanel` â†’ `composition_id` przy tworzeniu MO

## 2026-06-08 â€” Globalny system widokĂłw list (listView) â€” faza 2

- UI: split button `[Filtruj â–Ľ]` w `FilterApplyActions` (menu: Filtruj / Zapisz / Wczytaj / ZarzÄ…dzaj / Resetuj) â€” bez osobnego przycisku â€žWidokiâ€ť
- Enter w polach filtrĂłw â†’ submit formularza (`FilterPanelBodyWithActions`) â€” jeden request
- WspĂłlna fabryka adapterĂłw `listViewAdapterFactory.ts` + adaptery per ekran
- Migracja wszystkich gĹ‚Ăłwnych list z filtrami (14+ screenId) â€” patrz wpis fazy 1 + lista w PR/komunikacie
- UsuniÄ™to `ListViewPresetsMenu` z toolbarĂłw ZamĂłwienia/Produkty

## 2026-06-08 â€” Globalny system widokĂłw list (listView) â€” faza 1

- Backend: tabela `user_list_views`, REST `/api/ui/list-views/{screen_key}` (autosave + presety publiczne/prywatne)
- Frontend: moduĹ‚ `preferences/listView/` â€” `useListViewState`, `ListViewPresetsMenu`, adaptery per ekran
- Pilot: ZamĂłwienia (`orders.list`) + Produkty (`products.list`)
- Stare hooki `useFilterFieldOrder` / `useProductsListColumnOrder` â€” tryb `controlled` (cienkie wrappery)

## 2026-06-08 â€” Produkcja: obsĹ‚uga 409 przy start-collecting

- WspĂłlne helpery w `productionUi.ts`: `formatStartCollectingError`, `batchHasMaterialShortages`, lista brakĂłw w toaĹ›cie
- `BatchDetailPage` + `CollectingPage`: try/catch â†’ `toast.error` (bez uncaught AxiosError)
- Blokada UX: przycisk/karta zablokowane gdy `has_shortages` (tooltip `START_COLLECTING_BLOCKED_TOOLTIP`)

## 2026-06-08 â€” Ustawienia â†’ Firma: redesign UX (design system)

- ModuĹ‚ `companySettings`: layout full-width, `TabsNav` (pomaraĹ„czowa linia), trasy `/settings/company/*`
- ZakĹ‚adki konfiguracyjne bez KPI i bez powielonych nagĹ‚ĂłwkĂłw (tylko PageHeader w layoutcie)
- WspĂłlne komponenty: `PurchasingPageShell`, `PurchasingKpiGrid`, `PurchasingTableSection`, `AppButton`, tokeny formularzy
- Backend: `PATCH tenant-warehouses` obsĹ‚uguje `is_default` (ustaw magazyn domyĹ›lny)
- UsuniÄ™to monolityczny `CompanySettingsPage.tsx` (~1160 linii)

## 2026-06-08 â€” Zakupy: ujednolicone miniatury produktĂłw + inspektor

- `PurchasingProductThumbnail` / `PurchasingProductCell` â€” 40Ă—40 px, `object-fit: contain`, hover preview (150 ms, preload, portal)
- `PurchasingProductInspectorDrawer` â€” klik sĹ‚upka Top rotacja â†’ drawer (zdjÄ™cie, SKU, dostawca, sprzedaĹĽ, stan, sugerowane zamĂłwienie)
- `PurchasingForecastBarTooltip` â€” karta produktu w tooltipie wykresu (miniatura 56 px, sprzedaĹĽ 30d, Ĺ›rednia dzienna, stan, w drodze)
- Migracja: Generator, Prognoza, PO detail, Segmenty, Alerty, Auto-uzupeĹ‚nianie, Okazje cenowe, dashboard planowania

## 2026-06-08 â€” Produkcja / Receptury: redesign listy + miniatury

- `ProductThumb` bez ramek i szarego tĹ‚a (Produkcja, OMS panel, WMS inwentaryzacja)
- Receptury: ikony akcji zamiast menu â€žâ€¦â€ť, drawer skĹ‚adnikĂłw, `PurchasingTableSection`
- `ProductionRowIconActions`, `RecipeIngredientsDrawer`

## 2026-06-08 â€” BDO: peĹ‚ny redesign UX/UI

- Layout jak Produkcja/Magazyn: breadcrumb Asortyment â†’ BDO â†’ zakĹ‚adka, tytuĹ‚ + opis, TabsNav
- WspĂłlne komponenty: `BdoKpiGrid`, `BdoReportKpiGrid` (5 KPI), `BdoFilterBar`, `AppButton`, `AppCard`
- Wszystkie zakĹ‚adki: PurchasingTableSection, AppEmptyState, filtry w pasku, formularze max-w 900â€“1200px

## 2026-06-08 â€” Produkcja: ujednolicenie siatki KPI

- `ProductionKpiGrid` (4 kolumny desktop) + `ProductionKpiCard` (`density="compact"`)
- Analiza kosztĂłw: ukĹ‚ad 4+3 zamiast 3+3+1; efektywnoĹ›Ä‡ zawsze widoczna (â€” gdy brak danych)
- Pulpit, Planowanie, Historia â€” migracja na wspĂłlne komponenty KPI

## 2026-06-08 â€” Planer floty: redesign UX + nawigacja moduĹ‚u WĂłzki

- Trasa `/carts/optimizer` w shellu WĂłzki (breadcrumb, zakĹ‚adki); redirect z `/optimizer`
- KPI: 4Ă— `PurchasingKpiCard` (NEW, pojemnoĹ›Ä‡, sekcyjne, standardowe) + podsumowanie operacyjne po obliczeniu
- Akcje: Primary â€žObliczâ€ť, Secondary â€žZatwierdĹşâ€ť (disabled bez wyniku)
- Wynik: 3 sekcje (flota, pojemnoĹ›Ä‡ z progress bar, zamĂłwienia z pokryciem %)

## 2026-06-08 â€” Zakupy i planowanie: redesign UX/UI (design system)

- WspĂłlne tokeny: `purchasingButtonTokens` (PRIMARY/SECONDARY/GHOST/LINK), `purchasingTableTokens`, `PurchasingInfoNotice`, `PurchasingSummaryStrip`
- KPI: ujednolicony `PurchasingKpiCard` (min-h 88px, ikony 8Ă—8, uppercase label)
- NagĹ‚Ăłwki tabel: jednolite tĹ‚o `bg-slate-50`, `purchasingTableThClass`
- `AppEmptyState` density `inline` â€” zwarte puste stany w sekcjach tabel
- Auto-uzupeĹ‚nianie: komunikat harmonogramu poza KPI (`PurchasingInfoNotice`)
- Alerty: akcje w `quickActions`, nie w sekcji analizy
- Historia wspĂłĹ‚pracy: `PurchasingSummaryStrip` zamiast duĹĽych kart
- Priorytety: mniejsza heatmapa (bez dĹ‚ugich opisĂłw w kafelkach)
- ZamĂłwienia PO: `PurchasingPageShell` + `PurchasingTableSection`

## 2026-06-08 â€” Zakupy i planowanie: kompaktowy UX/UI (10 zakĹ‚adek)

- WspĂłlne komponenty moduĹ‚u: mniejsze KPI (`PurchasingKpiCard` bez min-height, p-4, text-2xl), gÄ™stsze odstÄ™py (`PurchasingContentArea`, `PurchasingPageShell`, `PurchasingFilterBar`, `PurchasingAnalysisSection`)
- `PurchasingDataPanel`: usuniÄ™to `flex-grow` â€” sekcje dopasowujÄ… wysokoĹ›Ä‡ do treĹ›ci
- Pulpit, Generator, PO, Prognoza, Priorytety, Alerty, Auto-uzupeĹ‚nianie, OszczÄ™dnoĹ›ci, Historia wspĂłĹ‚pracy: `AppEmptyState` zamiast pustych kontenerĂłw z duĹĽym paddingiem
- Prognoza: wykresy 220/240px, czytelniejsze etykiety osi Y (truncate + szersza oĹ›)
- Priorytety: kompaktowa heatmapa (mniejsze kafle, line-clamp opisĂłw)
- Historia wspĂłĹ‚pracy: jedna sekcja podsumowania zamiast dwĂłch pustych kart

## 2026-06-08 â€” Produkcja ERP: kolumna Akcje na koĹ„cu tabel

- Wszystkie listy moduĹ‚u: Zlecenia, Planowanie (BatchesListPage), Receptury, Historia, Analiza kosztĂłw â€” kolumna Akcje sticky right (tokens `productsListActions*`), ostatnia kolumna
- Pulpit: nagĹ‚Ăłwek â€žAkcjeâ€ť w ostatniej kolumnie tabeli partii gotowych

## 2026-06-08 â€” Produkcja ERP (ZarzÄ…dzanie produkcjÄ…): standard UI systemowy

- `ProductionErpModuleLayout`: `TabsNav` + breadcrumb (jak Dostawcy / Inwentaryzacja); peĹ‚noekranowe szczegĂłĹ‚y partii/receptury bez tabĂłw
- Pulpit: 8Ă— `PurchasingKpiCard`, alert brakĂłw z CTA â€žPrzejdĹş do brakĂłwâ€ť, sekcja WMS jako `PurchasingTableSection` + `AppEmptyState`
- Zlecenia: filtry (status, operator, produkt, daty, priorytet), licznik wynikĂłw, tabela moduĹ‚owa, menu akcji
- Planowanie: KPI nad tabelÄ… partii (postÄ™p, materiaĹ‚y, operator, termin)
- Receptury / Historia / Analiza kosztĂłw: filtry, KPI, sortowanie (analiza), menu akcji zamiast linkĂłw â€žOtwĂłrzâ€ť
- Badge statusĂłw i priorytetĂłw: `operationalSemanticBadges` (fiolet/niebieski/zielony/pomaraĹ„czowy/czerwony)

## 2026-06-08 â€” Inwentaryzacja (ERP): poprawki layoutu i menu akcji

- Dokumenty: kolumna Akcje przeniesiona na koniec tabeli (sticky right, jak Produkty)
- Menu akcji wiersza: portal + `position: fixed` (z-index 10050) â€” bez obcinania pod sidebar / overflow tabeli
- Kreator: przywrĂłcony shell moduĹ‚u (breadcrumb, tytuĹ‚, zakĹ‚adki Pulpit/Dokumenty/Nowa/Raporty); kroki kreatora wewnÄ…trz zakĹ‚adki; peĹ‚na szerokoĹ›Ä‡ contentu

## 2026-06-08 â€” Inwentaryzacja (ERP): przebudowa UI na standard systemowy

- `InventoryLayout`: `TabsNav` + breadcrumb (jak Dostawcy / MateriaĹ‚y magazynowe); pomaraĹ„czowy CTA â€žNowa inwentaryzacjaâ€ť
- Pulpit: `PurchasingKpiGrid` Ă— 6 + sekcje `PurchasingTableSection` (aktywne / do zatwierdzenia / zakoĹ„czone)
- Dokumenty: licznik wynikĂłw, filtry (szukaj / status / typ), tabela moduĹ‚owa, dropdown akcji (OtwĂłrz / Edytuj / Duplikuj / Eksportuj / UsuĹ„)
- Kreator: layout 2-kolumnowy (formularz + panel podsumowania), karty typu z pomaraĹ„czowym zaznaczeniem
- Raporty: karty raportĂłw z badge statusu i eksportem PDF/XLSX
- Badge statusĂłw: `inventoryDocumentStatusBadgeClass` (operational semantics)

## 2026-06-08 â€” WĂłzki / WĂłzki z koszykami: ujednolicony layout WMS

- WspĂłlny `CartsFleetList` (BULK + MULTI): `ListPageHeader`, KPI (`PurchasingKpiGrid`), sekcje grup peĹ‚nej szerokoĹ›ci
- `CartsFleetGroupActions`: Dodaj wĂłzek (pomaraĹ„czowy), Edytuj (neutralny), UsuĹ„ grupÄ™ (czerwony)
- `CartCard`: ten sam ukĹ‚ad flex + ikony akcji (`OperationalActionColumn`)
- Globalne zapeĹ‚nienie w karcie zgodnej z design system

## 2026-06-08 â€” RegaĹ‚y (WMS): standard UI jak NoĹ›niki / Produkty

- `ConsolidationRacksListPage`: `ListPageHeader` (breadcrumb Magazyn â†’ WMS â†’ RegaĹ‚y), KPI (`PurchasingKpiGrid` Ă— 5), przycisk â€žNowy regaĹ‚ kompletacyjnyâ€ť
- Tabela proporcjonalna: `ConsolidationRacksListTable` â€” kolumna Akcje 120px sticky, ikony PodglÄ…d / Edycja / UsuĹ„ (`OperationalActionColumn`)
- Pakiet: `frontend/src/components/consolidationRacks/rackList/*`

## 2026-06-08 â€” NoĹ›niki (WĂłzki): pĹ‚aski layout moduĹ‚u + KPI + tabela standard

- `CartsModuleLayout`: breadcrumb â†’ tytuĹ‚ â†’ `TabsNav` â†’ treĹ›Ä‡ (jak MateriaĹ‚y magazynowe); bypass peĹ‚noekranowy dla szczegĂłĹ‚u noĹ›nika / edycji regaĹ‚u
- `WarehouseCarriersPage`: `ListPageHeader`, kafelki KPI (`PurchasingKpiGrid`), akcje w toolbarze, sekcje grup bez zagnieĹĽdĹĽonych ramek
- `CarrierGroupCard`: pĹ‚aska sekcja (nagĹ‚Ăłwek + tabela), przycisk â€žDodaj noĹ›nikâ€ť
- `CarriersGroupTable`: proporcjonalna tabela moduĹ‚u, kolumna Akcje 120px sticky, `OperationalActionColumn`

## 2026-06-08 â€” Zestawy: standard UI jak Produkty / Producenci / Dostawcy

- `BundlesPage`: `ListPageHeader` z licznikiem wynikĂłw i opisem sekcji; toolbar (Filtry, Widoczne pola, Eksport)
- Filtry: `ListFilterEmbeddedShell` + `FilterPanelBodyWithActions` (WyczyĹ›Ä‡ / pomaraĹ„czowy Filtruj) â€” bez `ModuleListFiltersCard`
- Tabela proporcjonalna: checkbox 56px, zdjÄ™cie 80px (`ProductListPhotoCell`), nazwa 2fr, akcje 120px sticky; akcje wiersza: PodglÄ…d / Edycja / UsuĹ„
- Multiakcje: `ModuleBulkActionsToolbar` przez `BundlesListBulkBar` (Zaznaczâ€¦ / Multiakcje / Eksport / Odznacz)
- Pusty stan: `AppEmptyState` z przyciskiem â€žDodaj pierwszy zestawâ€ť
- Pakiet: `frontend/src/components/bundles/bundleList/*`

## 2026-06-08 â€” MateriaĹ‚y magazynowe: nagĹ‚Ăłwek moduĹ‚u jak Dostawcy

- `WarehouseMaterialsLayout`: breadcrumb â†’ tytuĹ‚ â†’ `TabsNav` â†’ treĹ›Ä‡ (bez `WmsModuleLayout` / karty tabĂłw)
- Listy kartonĂłw i materiaĹ‚Ăłw pakowych: usuniÄ™ty zduplikowany `ListPageHeader`; toolbar jak na liĹ›cie DostawcĂłw
- Formularze edycji: breadcrumb `Asortyment > MateriaĹ‚y magazynowe > â€¦`

## 2026-06-08 â€” Produkty (lista): standard tabel + bulk bar jak ZamĂłwienia

- Pasek masowych akcji: `ModuleBulkActionsToolbar` przez `ProductsListBulkBar` (Wybierz akcjÄ™ / Multiakcje / Drukuj / E-mail / Eksport / Odznacz)
- Tabela proporcjonalna: checkbox 56px, zdjÄ™cie 80px, nazwa 2fr max 500px, akcje 120px; konfigurator kolumn (`FilterVisibilityModal`)
- Filtry: licznik w przycisku â€žFiltry (N)â€ť, `ListPageHeader`, `TableProperties`
- Pakiet: `frontend/src/components/products/productList/*`

## 2026-06-08 â€” MateriaĹ‚y magazynowe: wzorzec formularza produktu + tabele list

- Formularze kartonĂłw i materiaĹ‚Ăłw pakowych: `WarehouseMaterialEditLayout` + `ProductLikePageLayout` (breadcrumb, hero 80px, zakĹ‚adki z ikonami, Zapisz/UsuĹ„/Duplikuj)
- Sekcje w kartach (`WmFormSectionCard`); edycja bez zakĹ‚adek moduĹ‚u (jak Produkty)
- Listy: proporcjonalne tabele z checkboxem, `ProductListPhotoCell`, konfigurator kolumn, filtry z licznikiem

## 2026-06-08 â€” RentownoĹ›Ä‡ produktĂłw: standard tabel + KPI zakupowe

- Tabela proporcjonalna (Akcje 80px, ZdjÄ™cie 80px, Produkt 2fr max 500px), konfigurator kolumn pod ikonÄ… tabeli
- Miniatury: wspĂłlny `ProductListPhotoCell` (identyczny jak Asortyment â†’ Produkty)
- Filtry: przycisk â€žFiltryâ€ť z licznikiem, panel `PurchasingFilterBar`, draft/applied
- KPI: `PurchasingKpiGrid` Ă— 6 + `PurchasingKpiCard` z ikonami (jak Pulpit zakupĂłw); filtry: `ListFilterEmbeddedShell` + pomaraĹ„czowy â€žFiltrujâ€ť

## 2026-06-08 â€” ZamĂłwienia towaru: peĹ‚na strona edycji + tabela Akcje/Poz.

- Edycja PO: `/goods-orders/:id`, `/goods-orders/:id/:tab` (Podstawowe, Produkty) â€” shell jak Klienci/Dostawcy
- Nowe zamĂłwienie: `/goods-orders/new` â†’ szkic + redirect na stronÄ™ edycji
- Lista: bez modala; legacy `?edit=` â†’ redirect
- Tabela: kolumna Poz. staĹ‚a 52px; Akcje staĹ‚a 176px, `flex-nowrap`, sticky prawo
- `proportionalTableColumns`: opcja `extraFixedColumnsPx` dla kolumn poza pulÄ… fr

## 2026-06-08 â€” Producenci i Dostawcy: peĹ‚ne strony edycji (wzorzec Klienci)

- Producenci: `/manufacturers/new`, `/manufacturers/:id`, `/manufacturers/:id/:tab` â€” breadcrumb, zakĹ‚adki, shell `AssortmentEntityPageShell`
- Dostawcy: `/suppliers/new`, `/suppliers/:id`, `/suppliers/:id/:tab` â€” poza `SuppliersLayout` (bez podwĂłjnego shella moduĹ‚u)
- ZakĹ‚adki dostawcy: Podstawowe (z adresem), Kontakt, Produkty, Warunki handlowe, Statystyki, Historia
- Listy: nawigacja zamiast popupĂłw; legacy `?edit=` â†’ redirect na stronÄ™ encji
- `SupplierEditModal` / `ManufacturerEditModal`: cienkie re-exporty (deprecated)

## 2026-06-08 â€” ZamĂłwienia towaru: punktacja, KPI, filtry, tabela

- Nazewnictwo: Scoring â†’ Punktacja (lista, KPI, modal, badge)
- KPI: `PurchasingKpiGrid` + `PurchasingKpiCard` (6 kafelkĂłw jak Pulpit/Ocena)
- Filtry: `PurchasingFilterBar`, siatka 6 pĂłl, przyciski WyczyĹ›Ä‡/Filtruj
- Tabela: proporcjonalne kolumny (Nazwa 2fr), Akcje 120px sticky, badge punktacji 90/70/50/0

## 2026-06-08 â€” Dostawcy: pĹ‚aski shell moduĹ‚u (wzorzec Zwroty)

- `SuppliersLayout`: breadcrumb â†’ tytuĹ‚ â†’ `TabsNav` (bez karty wokĂłĹ‚ tabĂłw) â†’ outlet; jeden `PageLayout`
- UsuniÄ™to `WmsModuleLayout` (podwĂłjna karta + ramka wokĂłĹ‚ tabĂłw)
- `SuppliersPage`: bez wewnÄ™trznego `PageLayout` i duplikatu breadcrumb/nagĹ‚Ăłwka
- Ocena / Historia: bez `PurchasingContentArea` i nagĹ‚Ăłwka strony w kontekĹ›cie `/suppliers/*`

## 2026-06-08 â€” Dostawcy: Ocena i Historia w stylu Pulpitu zakupĂłw

- KPI: `PurchasingKpiCard` + `PurchasingKpiGrid` (4 / 5 kolumn), ikony, ukĹ‚ad liczba + opis jak dashboard
- Ocena: karta â€žRanking dostawcĂłwâ€ť z nagĹ‚Ăłwkiem/opisem; tabela ze stylami dashboardu
- Historia: 5 KPI w jednym rzÄ™dzie, filtr dostawcy pod KPI, sekcje analityczne 2-kolumnowe, karta â€žOstatnie dokumentyâ€ť
- `PurchasingKpiGrid`: nowa opcja `columns={5}`; obsĹ‚uga `supplier_id` z URL na Historii

## 2026-06-08 â€” Lista dostawcĂłw: nowy standard tabel

- Tabela jak Producenci/Klienci: checkbox, Nazwa (system), kolumny konfigurowalne, Akcje 120px sticky
- Konfigurator kolumn (Widoczne pola), filtry rozszerzone, licznik `Filtry (N)`
- Proporcjonalny ukĹ‚ad bez logo: Nazwa 2fr (250â€“500px), pozostaĹ‚e 1fr
- API: `product_count`, filtry kraj/miasto/e-mail/telefon/waluta/MOQ/dostawa/min. produkty/zamĂłwienia

## 2026-06-08 â€” Konfiguratory kolumn/filtrĂłw: kierunkowe strzaĹ‚ki

- `FilterVisibilityModal` + `ColumnSelectorModal`: â† przed nazwÄ… (DostÄ™pne), â†’ po wierszu (Widoczne), ukĹ‚ad â‹®â‹® â†‘ â†“ â†’
- Tooltipy: â€žDodaj do widocznychâ€ť / â€žUsuĹ„ z widocznychâ€ť â€” wszystkie listy korzystajÄ…ce ze wspĂłlnych komponentĂłw

## 2026-06-08 â€” Lista producentĂłw: nowy standard tabel

- Tabela jak Klienci/Pola dodatkowe: checkbox, kolumny konfigurowalne (localStorage), akcje 36Ă—36
- Filtry: Tenant, Nazwa, Kraj, Status, NIP, Miasto, E-mail, Telefon, Dostawca; licznik `Filtry (N)` w nagĹ‚Ăłwku
- Logo: max 40Ă—40, `ImageOff` bez ramek; kolumna Nazwa 3-liniowa; produkty jako link gdy >0
- API listy: filtry NIP/miasto/e-mail/telefon/dostawca + `supplier_count` w odpowiedzi

## 2026-06-08 â€” Akcje automatyczne: warunki multi-value + historia diff

- Warunki pĂłl wyboru wielokrotnego: `value: string[]`, operatory â€žjest jednym zâ€ť / â€žnie jest jednym zâ€ť, `FilterMultiSelect` w modalu warunku
- Historia zmian konfiguracji: model `{ type, field, before, after, userId, createdAt }` w localStorage; diff przy zapisie reguĹ‚y
- Edytor: zakĹ‚adki **Historia zmian** / **Historia wykonaĹ„** (`AutomationRuleHistoryPanel`); moduĹ‚ logs = tylko wykonania

## 2026-06-08 â€” Konfigurator zwrotĂłw: uproszczenie UX (analiza + refaktor)

- **Statusy RMZ** â†’ zwiniÄ™ta sekcja â€žWorkflow magazynowyâ€ť z opisem 3 pojÄ™Ä‡ (etykiety / decyzje / etapy dokumentu)
- **Decyzje:** usuniÄ™to â€žWidoczna dla magazynieraâ€ť z UI (pole zachowane w danych); aktywnoĹ›Ä‡ na liĹ›cie; karty pokazujÄ… skutek biznesowy
- **Modal decyzji:** tylko nazwa, kategoria, â€žProdukt wraca na magazynâ€ť; bez code/sort_order
- **Integracje i API** zamiast â€žZaawansowaneâ€ť (RMZ, uszkodzenia, etykiety â€” kolejnoĹ›Ä‡)

## 2026-06-08 â€” Konfigurator statusĂłw zwrotĂłw: eksperymentalna przebudowa UX

- 4 sekcje kartami: Etykiety listy, Decyzje produktowe, Statusy RMZ (proces), Uszkodzenia
- Ukryto tabele techniczne, skrĂłty WMS/Z-PZ, kody klas B/C na liĹ›cie gĹ‚Ăłwnej
- Pola techniczne (code, transition_key, typ workflow, sort_order) â†’ â€žUstawienia zaawansowaneâ€ť w modalach
- RMZ workflow wĹ‚Ä…czone do konfiguratora (wczeĹ›niej osobna strona `/workflow-statuses`)
- Screenshoty mock: `/dev/returns-statuses-configurator-screenshots`, PNG w `returnsStatusesConfigurator/mockups/`

## 2026-06-08 â€” SĹ‚owniki zwrotĂłw: przebudowa UX

- PeĹ‚na szerokoĹ›Ä‡ â€” usuniÄ™to panel â€žPodglÄ…d formularza klientaâ€ť
- Rodzaje zwrotĂłw: bez emoji; ĹşrĂłdĹ‚a: logotypy marketplace (`OrderSourceLogo` + SVG w `public/assets/marketplaces/`)
- AktywnoĹ›Ä‡: checkbox inline w wierszu + auto-zapis (`persistConfig` w `ReturnsModuleSettingsPanel`)
- KolejnoĹ›Ä‡: drag & drop (`@dnd-kit`); bez pola kolejnoĹ›ci i sekcji â€žZaawansowaneâ€ť w modalach
- Modal rodzaju: tylko nazwa; modal ĹşrĂłdĹ‚a: marketplace + nazwa + aktywny
- `slugDictionaryCode()` generuje identyfikator systemowy automatycznie

## 2026-06-08 â€” SĹ‚owniki zwrotĂłw (UI)

- PoĹ‚Ä…czono zakĹ‚adki â€žRodzaje zwrotĂłwâ€ť + â€žĹąrĂłdĹ‚aâ€ť â†’ **SĹ‚owniki zwrotĂłw** (`/orders/returns/dictionaries`)
- UkĹ‚ad 2-kolumnowy: karty rodzajĂłw/ĹşrĂłdeĹ‚ + podglÄ…d formularza klienta (radio na ĹĽywo)
- Edycja przez modale; legacy URL `/return-types`, `/sources` â†’ przekierowanie

## 2026-06-08 â€” Konfigurator statusĂłw zwrotĂłw (UI)

- `/orders/returns/statuses`: ukĹ‚ad 2-kolumnowy (grupy statusĂłw + podglÄ…d listy), tabela decyzji produktowych, modale edycji
- `/orders/returns/panel-statuses` â†’ przekierowanie na `/orders/returns/statuses`
- Klasy/powody uszkodzeĹ„ w zwiniÄ™tej sekcji zaawansowanej (bez zmian API)

## 2026-06-08 â€” Zwroty: wspĂłlny shell breadcrumb + zakĹ‚adki

- `ReturnsModuleLayout`: jeden `ModuleListBreadcrumb` (đźŹ  > ZamĂłwienia > Zwroty) + `ReturnsModuleTabsStrip` dla wszystkich zakĹ‚adek moduĹ‚u
- UsuniÄ™to lokalne duplikaty z `ReturnsListPanel`, `ReturnsModuleSettingsTabPage`, `ReturnStatusesPage`, `ReturnPanelUiStatusesSettingsPage`
- SzczegĂłĹ‚ RMZ (`/orders/returns/:id`) bez zmian â€” wĹ‚asna Ĺ›cieĹĽka nawigacji w widoku szczegĂłĹ‚u

## 2026-06-08 â€” Module list: Orders vs Returns UX (wiersze)

- `ReturnsListProductCell`: klikalne rozwijanie `+X poz. â–Ľ` / `ZwiĹ„ â–˛` (stan lokalny, `stopPropagation`)
- `OrderListDenseTable`: akcje jako ostatnia kolumna, `OperationalActionColumn layout="stack"` (pionowy stos 40Ă—40 jak zwroty)
- Kolumny zamĂłwieĹ„: `ZamĂłwienie | Status | Produkty | â€¦ | Akcje`; backend `items_display_lines` = peĹ‚na lista pozycji
- Dev/screenshot: `/dev/module-list-orders-vs-returns`, PNG w `moduleList/mockups/module-list-orders-vs-returns.png`

## 2026-06-08 â€” Zakupy Faza 3: operacyjny pulpit + unified KPI

- `PlanningDashboard`: copy operacyjne, 5 Quick Actions (Dostawcy, OszczÄ™dnoĹ›ci), nawigacja z tabel, poprawione nazwy sekcji PZ
- `PurchasingKpiCard`: styl â€žBalancedâ€ť (rounded-2xl, ikona po prawej, opcjonalny badge trendu)
- `PurchasingKpiGrid`: gap-6 â€” propagacja na wszystkie zakĹ‚adki moduĹ‚u

## 2026-06-08 â€” Zakupy Faza 2.5: cleanup UI po unifikacji

- UsuniÄ™to z barrel `ui/index.ts`: `purchasingFilterLabelClass`, `PurchasingSectionHeader` (komponent zostaje wewnÄ™trzny w `PurchasingDataPanel`)
- `PurchasingTableHeader`: usuniÄ™to prop `compact`; domyĹ›lny padding nagĹ‚Ăłwka `px-3 py-3`; Pulpit + PO zachowujÄ… `px-6 py-4` przez wariant `children`
- Przeszukanie `modules/purchasing/**`: brak dodatkowych martwych helperĂłw / nieuĹĽywanych importĂłw do usuniÄ™cia

## 2026-06-08 â€” Zakupy Faza 2: Alerty + Generator UX

- `PurchasingAlertsPage`: usuniÄ™to lokalne `KpiCard`/`SectionCard` â†’ `PageShell` + wspĂłlne KPI/Filter/Table/Analysis
- `PurchasingReplenishmentPage`: chipy KPI â†’ `KpiGrid`, filtry â†’ `FilterBar`, tabela â†’ `TableSection` + sticky `TableHeader`
- `PurchasingTableHeader`: rozszerzony o `children`, `sticky`, `className`; naprawione klasy align (bez dynamic Tailwind)
- Wszystkie strony list zakupĂłw: inline `<thead>` â†’ `PurchasingTableHeader` (oprĂłcz PO detail / modal preview)
- Zero zmian API / logiki biznesowej

## 2026-06-08 â€” Zakupy Faza 1: UX Consistency Pass

- WspĂłlne komponenty: `PurchasingKpiGrid`, `PurchasingFilterBar`, `PurchasingTableSection`, `PurchasingAnalysisSection`, `PurchasingPageShell`, `PurchasingQuickActions`
- `PurchasingKpiCard`: opcjonalna nawigacja (`to`) â€” klikalne KPI na Pulpicie
- Pulpit: Quick Actions â†’ Generator / Alerty / PO; KPI linkujÄ… do replenishment, orders, suppliers/analytics
- Ujednolicony ukĹ‚ad (Header â†’ KPI â†’ Filtry â†’ Analiza â†’ Tabela) na: Prognoza, Ocena dostawcĂłw, Historia, Priorytety, Auto-uzupeĹ‚nianie, OszczÄ™dnoĹ›ci
- Zero zmian API, routingu, logiki biznesowej, struktury zakĹ‚adek

## 2026-06-08 â€” PZ: UX akceptacji rĂłĹĽnicy dostawy (bez backendu)

- Menu â‹Ż: â€žZaakceptuj rĂłĹĽnicÄ™ dostawyâ€ť gdy `ordered > received` (lokalny stan sesji)
- Badge â€žNiedobĂłr zaakceptowanyâ€ť / â€žRĂłĹĽnica zaakceptowanaâ€ť w tabeli i szczegĂłĹ‚ach
- SzczegĂłĹ‚y pozycji: ZamĂłwiono / PrzyjÄ™to / Brak
- Ukryta â€žDodaj blokadÄ™ sprzedaĹĽyâ€ť przy `received <= 0`
- Zero zmian API, modelu, inventory, sales_block

## 2026-06-08 â€” Zakupy i planowanie: UI refactor (prototyp)

- Nowy shell: `PurchasingModuleLayout` â€” sticky zakĹ‚adki w ramce, podmiot + odĹ›wieĹĽ w pasku
- WspĂłlne komponenty UI: `modules/purchasing/ui/*` (KPI, tabele, panele, statusy)
- Widoki lazy-loaded: `PlanningDashboard`, `PurchaseGeneratorView`, â€¦ `SavingsView`
- Kontekst: `PurchasingModuleContext` + `usePurchasingTenant` (tenant z URL, global refresh)
- Pulpit przepisany na nowy design z ikonami lucide; generator/PO zaktualizowane wizualnie
- Zero zmian API / logiki biznesowej


- `backend/db/postgres_sequence_sync.py` â€” idempotent sync all integer PK sequences vs MAX(id)
- Tier 0 startup + `migrate_sqlite_to_postgres` post-step
- SQL: `backend/migrations/postgres_sync_all_sequences.sql`
- Fixes bundle STOCK shadow `products_pkey` after import/migration desync

## 2026-06-08 â€” B1 bundle STOCK EAN validation fix

- `_validate_identifier_uniqueness`: product EAN check mirrors `uq_product_tenant_ean` (includes soft-deleted rows)
- PUT/POST bundle â†’ HTTP 400 `"EAN jest juĹĽ uĹĽywany przez inny produkt."` zamiast 500
- Safety net: `map_product_integrity_error` w routerze (adapter + commit)
- Testy: `test_bundle_stock_identifier_validation.py`

## 2026-06-08 â€” P2.1A Warehouse Context UX Fix

- `useActiveWarehouseContext()` + banner â€žWybierz aktywny magazyn.â€ť
- Formularze tworzÄ…ce encje magazynowe: `warehouse_id` z aktywnego kontekstu topbar
- Raport: `memory/p2.1a-warehouse-context-ux-report.md`

## 2026-06-08 â€” P2.1 Multi Warehouse Hardening

- PO: `warehouse_id` wymagane w generatorze i alertach (`ERR_PO_WAREHOUSE_REQUIRED`)
- UsuniÄ™to auto-assign PZ (`maybe_auto_assign_single_warehouse_on_pz`) i single-WH fallback w resolve/receiving-target
- Frontend: usuniÄ™te hardcoded WH w reklamacjach, inwentaryzacji, import zamĂłwieĹ„, regaĹ‚ach, create order
- Skrypt legacy: `backend/scripts/report_deliveries_missing_warehouse.py`
- Testy: `test_purchase_order_warehouse_hardening.py`, `test_multi_warehouse_hardening.py` (10 passed)
- Raport: `memory/p2.1-multi-warehouse-hardening-report.md`

## 2026-06-08 â€” P4.18 Bundle Warehouse Intelligence

- Serwisy read-only: analytics, slotting, replenishment, capacity (`backend/services/bundles/intelligence/`)
- API `/bundles/intelligence/*` â€” dashboard, slotting, replenishment, capacity
- Frontend: `/analytics/bundle-intelligence` (4 zakĹ‚adki raportu)
- Testy: `test_bundle_intelligence.py` (25+)
- Raport: `bundle-warehouse-intelligence-report.md` â€” rekomendacje only, bez automatyzacji

## 2026-06-08 â€” P4.17A Bundle Scanner UX Integration

- Picking/packing/returns/bulk scan â€” integracja `bundleScannerIntegration` z globalnym skanerem WMS
- Komponenty: `BundlePickingScanCard`, `BundleVerifiedBadge`, `BundleTraceabilityStrip`, RK/RMZ/reklamacje
- Ekran `WmsBundleBulkScanPage` (`/wms/picking/bundle-bulk-scan`)
- Testy frontend: 22 w `bundleScanFlow.test.ts`
- Raport: `bundle-scanner-ux-report.md` â€” **READY FOR P4.18**

## 2026-06-08 â€” P4.17 Bundle Logistic Unit & EAN Automation

- `resolve_bundle_barcode()` â€” EAN produktu/bundle, SKU, kod wewnÄ™trzny
- Scan orchestration: pick/pack/returns/complaints (ON_DEMAND vs STOCK)
- Model `BundleLogisticUnit` + migracja `bundle_logistic_units`
- API `/bundles/logistics/*`; bulk STOCK scan; RK view; wave aggregation helpers
- Frontend: `bundlesLogisticsApi.ts`
- Testy: 42 w `test_bundle_logistics.py`; pakiet bundle 178 passed
- Raport: `bundle-logistic-unit-report.md` â€” **READY FOR P4.18**

## 2026-06-08 â€” P4.16 Bundle Traceability & Lot Tracking

- Model `order_line_bundle_component_lots` + migracja schema
- `bundle_lot_snapshot_service` â€” persist po finalize pick / WZ issue
- Traceability API Aâ€“D, recall report, lot-trace + bundle-lots reports
- Rozszerzenie drzew zwrotĂłw/reklamacji o `lots[]`; UI partii w RMZ panelu
- Testy: 25 w `test_bundle_traceability.py`; raport `bundle-traceability-report.md`

## 2026-06-08 â€” P4.15B Bundle Operational UX Layer

- Projekcje UX: `bundle_operational_ux_service`, rozszerzone `picking_lines()` metadata
- Picking API: `bundle_breakdown`, `order_bundle_trees`, bundle fields on order rows
- Packing API: `bundle_trees` + line bundle fields
- UI: drzewo bundle w pickingu i pakowaniu; breakdown SKU multi-order
- Single/multi filter + cart volume fix (operational lines only)
- Testy: `test_bundle_operational_ux.py`; raport `bundle-operational-ux-report.md` â€” **READY FOR TRACEABILITY**

## 2026-06-08 â€” P4.15A Bundle operational execution review

- PrzeglÄ…d WMS: picking, EAN, regaĹ‚y, noĹ›niki, pakowanie, cross-dock, multi-order/fala
- Werdykt: **CHANGES REQUIRED** â€” raport `bundle-operational-readiness-report.md`
- Proponowany P4.15B (UX pick/pack + agregacja) przed P4.16 lot snapshot
- Bez implementacji lot snapshot / recall / EAN bundle

## 2026-06-08 â€” P4.15 Bundle returns, complaints & corrections

- Model `return_line_bundle_components`; RMZ `bundle_return_scenario` / `bundle_return_status`
- Refund engine ze snapshotu; PZ per skĹ‚adnik (ON_DEMAND) / SKU (STOCK)
- API: `/orders/{id}/bundle-return-tree`, PUT bundle-components, raporty
- UI: `BundleReturnLinePanel` (checkboxy skĹ‚adnikĂłw, preview refundu)
- Testy: 38 w `test_bundle_returns_complaints.py`; raport `bundle-returns-complaints-report.md`
- Poza scope: EAN bundle scan, lot snapshot, recall, OrderCancellationService

## 2026-06-08 â€” P4.14A Bundle warehouse documents layer

- `warehouse_document_lines()` / `warehouse_receipt_lines()` â€” projekcje COMMERCIAL vs WAREHOUSE
- `bundle_warehouse_document_service` â€” SSOT linii dokumentĂłw dla zamĂłwieĹ„ z bundle
- Integracja: `stock_document_service`, walidacja WZ w `direct_sale/wz_service`
- Testy: 20 + raport `bundle-warehouse-documents-report.md`

## 2026-06-08 â€” P4.14 BundleLineResolver (SSOT)

- Pakiet `backend/services/bundles/`: `BundleLineContext`, `BundleLineResolver`, projekcje (commercial, picking, reservation, warehouse_issue, margin, return, complaint)
- Snapshot: `order_id`, `unit_price_net_snapshot` na `order_line_bundle_components` + migracja P414
- MarĹĽa OMS order read â†’ `margin_from_context()` z resolvera
- Eksplozja ON_DEMAND wzbogaca snapshot o ceny skĹ‚adnikĂłw
- Testy: `test_bundle_line_resolver.py` (23); raport: `bundle-line-resolver-report.md`
- Bez: RMZ/reklamacje/korekty bundle UI, nowych endpointĂłw HTTP

## 2026-06-08 â€” P4.13B Bundle P0 stabilization (preâ€“BundleLineResolver)

- **SSOT:** `bundle_order_item_ops.sqlalchemy_operational_picking_order_item_clause()` â€” zastÄ…pienie lokalnych `is_bundle_parent=False` w falach, dashboardach, konsolidacji, symulacji, routingu, recovery
- **STOCK_PRODUCTION:** parent traktowany jak normalny SKU; **ON_DEMAND:** pick/braki tylko na skĹ‚adnikach
- **Footprint:** `order_footprint_service` liczy wyĹ‚Ä…cznie linie operacyjne
- **Testy:** `test_bundle_p0_stabilization.py` (14 passed z architekturÄ…)
- **Docs:** `bundle-stabilization-report.md`, `bundle-order-cancellation-analysis.md`, `bundle-traceability-audit.md`
- **Werdykt:** READY FOR BUNDLELINERESOLVER

## 2026-06-08 â€” User warehouse assignments + active warehouse context

- **Model:** `user_warehouse_assignments` (backfill z `app_user_warehouses`); `user_wms_profiles.active_warehouse_id`
- **API:** `GET /auth/me/warehouse-context`, `PUT /auth/me/active-warehouse`; login ustawia domyĹ›lny magazyn
- **Frontend:** `WarehouseContext` z kontekstu serwera; globalny przeĹ‚Ä…cznik â€žMagazyn:â€ť w headerze
- **Backward compat:** brak przypisaĹ„ â†’ dostÄ™p do wszystkich magazynĂłw (jak dotÄ…d); 1 magazyn â†’ bez selektora

## 2026-06-08 â€” Offer Stock Pools MVP (Availability Sources)

- **Model:** `offer_stock_pools`, `offer_stock_pool_warehouses`, `product_sales_offers.stock_pool_id`
- **Serwis:** `offer_stock_availability_service.offer_pool_available_qty` â€” suma `offer_available_qty` po magazynach puli (filter `participates_in_network_stock`)
- **API:** CRUD pul `/offer-stock-pools`; oferty: `stock_pool_id` w PATCH, `available_qty` z puli
- **UI:** Ustawienia â†’ SprzedaĹĽ â†’ Pule stanĂłw; dropdown â€žĹąrĂłdĹ‚o stanuâ€ť w ofercie produktu
- **Testy:** Pool A (W+P)=50, B (G)=40, C (all)=90

## 2026-06-08 â€” Z-PZ UI komplet + numeracja globalna bez zer

- **Numeracja:** domyĹ›lne `padding_length=0` (model, schema, API); repair serii WAREHOUSE; RMZ bez `:05d`
- **Kafelek aktywnego Z-PZ:** tylko `/wms/returns`, max-w-sm, RMZ/pozycje/sztuki/data + Zamknij
- **SzczegĂłĹ‚y Z-PZ:** peĹ‚ny ekran `/documents/warehouse/z-pz?id=` (Sellasist: nagĹ‚Ăłwek, podsumowanie, tabela + RMZ)
- **Menu dokumentĂłw:** dedupe po etykiecie + stock_type w katalogu API (fix duplikat PZ)

## 2026-06-08 â€” Numeracja magazynowa bez paddingu + widok Z-PZ (Sellasist)

- **Numeracja:** wszystkie serie WAREHOUSE (PZ, MM, WZ, RW, PW, ZD, Z-PZ) + RMZ bez wiodÄ…cych zer; migracja `padding_length=0`; `_next_rmz_number` â†’ `RMZ-2026-1`
- **API read Z-PZ:** pozycje z `return_decision_label` (A/B/C), `source_rmz_id`, `source_rmz_number`; nagĹ‚Ăłwek `closed_at` przy CLOSED
- **Frontend:** dedykowany `WarehouseZPzDocumentDetail` w modalu dokumentĂłw magazynowych (nagĹ‚Ăłwek + tabela pozycji + link do RMZ)

## 2026-06-08 â€” Z-PZ poprawki: panel, numeracja, lista, auto-druk

- **Panel WMS:** kompaktowy kafelek (numer, AKTYWNY, pozycje/sztuki, data, Zamknij)
- **Ustawienia WMS â†’ Zwroty:** checkbox auto-druk + wybĂłr szablonu etykiety; `POST /labels/print/z-pz`
- **Numeracja:** brak paddingu domyĹ›lnie (`Z-PZ-2026-1`); seria Z_PZ `padding_length=0`
- **Dokumenty magazynowe:** `Z_PZ` w katalogu/menu (dedupe segmentĂłw, kolejnoĹ›Ä‡ MMâ†’Z-PZ); lista OTWARTY/ZAMKNIÄTY

## 2026-06-08 â€” Z-PZ zbiorczy: OPEN do rÄ™cznego zamkniÄ™cia (noĹ›nik zwrotĂłw)

- **Backend:** status `OPEN` / `CLOSED`; wyszukiwanie aktywnego Z-PZ bez filtra daty (`collective_z_pz_service.py`)
- **API:** `GET/POST /api/wms/returns/active-z-pz` (+ `/close`) â€” zamkniÄ™cie â†’ `relocation_status=OPEN`, kolejka rozlokowania
- **Migracja:** `draft`â†’`OPEN` dla starych zbiorczych; indeks `ux_stock_documents_collective_z_pz_open`
- **Frontend:** panel â€žAktywny dokument zwrotĂłwâ€ť na `/wms/returns`; etykieta druku (QR + kod kreskowy)
- **Seria dokumentĂłw:** opis checkboxa â€žzbiorczy Z-PZâ€ť â€” operator zamyka noĹ›nik, nie dzieĹ„ kalendarzowy

## 2026-06-08 â€” Z-PZ schema sync (fix 500 orders/stock-documents)

- **`backend/db/z_pz_schema.py`**: `ensure_z_pz_schema()` â€” jawna, idempotentna migracja kolumn Z-PZ (PG + SQLite)
- Startup: `require_z_pz_schema_or_raise()` przed tier0/API; log `[Z_PZ_SCHEMA] â€¦=OK|MISSING`
- `main.py`: rozdzielone try/except migracji stock_documents; Z-PZ przed `migrate_wms_pz_workflow_statuses`
- Tier0 SQL probes: kolumny Z-PZ w `stock_documents` / `stock_document_items`
- Test: `backend/tests/returns/test_z_pz_schema_startup.py`

## 2026-06-08 â€” WMS zwroty (RMZ/RMA): transakcyjny commit + upload zdjÄ™Ä‡

- **Upload 422:** axios usuwa `Content-Type` dla `FormData`; log `[returns.damage.upload]`
- **Backend:** `commit_workflow=false` (domyĹ›lnie) na `split-process` / `process` â€” bez sync OMS; nowy `POST â€¦/commit-wms`
- **Frontend:** decyzje lokalne bez natychmiastowego API; **ZAPISZ** gdy wszystkie linie rozstrzygniÄ™te; confirm przy DAMAGED bez zdjÄ™Ä‡; upload fail nie blokuje decyzji

## 2026-06-08 â€” Snapshot operacji magazynowych: fix 500 po zwrocie RMZ

- **Przyczyna:** alert rozlokowania uĹĽywaĹ‚ `category="Rozlokowanie PZ"` poza enumem Pydantic â†’ 500 gdy po RMZ/PZ_RT pojawiaĹ‚ siÄ™ towar do rozlokowania
- **Fix:** kategoria `"Rozlokowanie"` + `_normalize_alert_category()` jako fallback
- **OdpornoĹ›Ä‡:** kaĹĽda sekcja snapshotu w `try/except` z `[warehouse.snapshot] section=â€¦`; endpoint zwraca pusty snapshot zamiast 500 przy total failure
- **Frontend:** `getWarehouseOperationsSnapshot` zwraca `null` zamiast rzucaÄ‡ â€” nie blokuje workflow zwrotĂłw

## 2026-06-08 â€” PodglÄ…d lokalizacji: fix pustej mapy + wiÄ™kszy shelf view

- **Mapa:** jawna wysokoĹ›Ä‡ kontenera (`min(52vh,520px)`), `useDesignerCanvas(null)`, auto-fit na aktywny regaĹ‚ â€” naprawia pusty lewy panel (flex `h-full` = 0px)
- **RegaĹ‚:** `RackSideViewGrid` `embeddedPreview` â€” wiÄ™ksze sloty, etykiety, subtelny highlight; dane zajÄ™toĹ›ci dla aktywnego slota
- **UI:** biaĹ‚e tĹ‚a zamiast szarych placeholderĂłw w modalu i liĹ›cie produktĂłw

## 2026-06-08 â€” PodglÄ…d lokalizacji: powrĂłt do design systemu + projektant magazynu

- **UsuniÄ™to** ciemny/neonowy custom map (digital twin, cyberpunk HUD)
- **Mapa:** `WarehouseLayoutRenderer` (read) + ten sam layout co projektant magazynu (`GET /warehouse/layout`)
- **RegaĹ‚:** `RackSideViewGrid` â€” nomenklatura systemowa (`A1-A-1` via `resolveWarehouseLocation`)
- **Modal:** jasny enterprise (white/slate), spĂłjny z `ProductLocationMapModal`

## 2026-06-08 â€” PodglÄ…d lokalizacji: industrial digital twin (v2) â€” **COOFNIÄTE**

- Ciemna posadzka hali (tekstura, vignette, siatka techniczna) zamiast szarego wireframe
- RegaĹ‚y: metalowe sĹ‚upy, segmenty, belki, cieĹ„ na podĹ‚odze â€” nie kafelki/buttony
- Alejki wyliczane z pozycji regaĹ‚Ăłw: pasy ruchu, strzaĹ‚ki, numeracja A-/V-
- Strefy: subtelne wash + etykiety (Kompletacja, PrzyjÄ™cie, SkĹ‚adowanieâ€¦)
- Modal = warehouse navigation center (dark HUD); regaĹ‚ front z konstrukcjÄ… i glow TU

## 2026-06-08 â€” PodglÄ…d lokalizacji WMS: layout magazyn-first

- Modal: **72% plan magazynu** (mapa + regaĹ‚ fizyczny), **28% info + zawartoĹ›Ä‡**
- UsuniÄ™to mini-mapkÄ™ z kolorowymi kwadratami; plan z alejkami, strefami, skalÄ…, cieniami
- RegaĹ‚: konstrukcja pionowa, poziomy, sloty, glow + badge TU
- Panel info skrĂłcony (wiÄ™cej pod rozwijanym linkiem); karty produktĂłw wiÄ™ksze

## 2026-06-08 â€” NoĹ›niki: wizualny podglÄ…d lokalizacji (LocationPreviewModal)

- Klik badge lokalizacji â†’ modal z mapÄ… regaĹ‚Ăłw, widokiem pionowym regaĹ‚u, zawartoĹ›ciÄ… noĹ›nika
- API: `GET /api/wms/locations/{id}/visual-context`
- Komponenty: `LocationPreviewModal`, `LocationPreviewWarehouseGrid`, `LocationPreviewRackView`

## 2026-06-08 â€” Klienci CRM: typ / kanaĹ‚ / flagi (architektura ERP)

- **`customer_type`:** tylko `retail`, `company`, `wholesale` (usuniÄ™to `marketplace`, `b2b` z enum)
- **Nowe `sales_channel`:** store, ecommerce, allegro, amazon, phone, b2b_portal, marketplace_other
- **`flags_json`:** + `requires_invoice`, `marketplace` (VIP/blokada/priorytet osobno)
- **Migracja idempotentna:** `b2b`â†’`wholesale`+`b2b_portal`, `marketplace`â†’`retail`+flag+`marketplace_other`
- **Frontend:** select typu (3 opcje), kanaĹ‚ sprzedaĹĽy, badge VIP/Zablokowany/Marketplace/Priorytet, filtry i kolumny listy

## 2026-06-08 â€” Schema sync: NOT NULL ADD COLUMN na PostgreSQL (customers CRM)

- **Przyczyna:** reconcile robiĹ‚ `ADD COLUMN â€¦ NOT NULL` na tabeli z danymi â†’ `NotNullViolation` na Railway
- **Fix (`schema_introspection.py`):** nullable ADD â†’ `UPDATE` backfill (`customer_type=retail`, `customer_status=active`) â†’ `ALTER COLUMN SET NOT NULL`
- **Guards:** indeksy/FK pomijane gdy kolumna indeksu nie istnieje w DB; `failed_columns` przy bĹ‚Ä™dzie ADD
- **Testy:** `backend/tests/test_customer_crm_schema_sync.py`

## 2026-06-08 â€” Klienci + zamĂłwienia: 500 (schema CRM + logging)

- **Przyczyna:** brak kolumn CRM na `customers` w PostgreSQL â†’ `OperationalError: no such column: customers.customer_type`
- **Order detail:** ten sam bĹ‚Ä…d przy `db.query(Customer)` gdy zamĂłwienie ma `customer_id`
- **Fix:** `ensure_customer_crm_schema` + `verify_customer_schema_columns` w **blocking** `_bootstrap_tier0_platform_schema` (przed HTTP)
- **Logging:** `[customers.list] failed`, `[orders.detail] failed`, `[orders.detail] customer brief failed`
- **Safe fallback:** agregaty `customer_sales_stats` / `summary_out` â€” lista nie pada gdy analytics niedostÄ™pne
- **Order customer brief:** try/except â€” zamĂłwienie zwraca 200 bez `customer` gdy query klienta pada (z logiem)

## 2026-06-08 â€” Klienci: naprawa GET /api/customers (500)
- **Przyczyna:** ORM miaĹ‚ kolumny CRM (`customer_type`, `customer_status`, `flags_json`, â€¦) bez migracji DB â†’ `OperationalError: no such column`
- **`backend/db/customer_schema.py`:** `ensure_customer_crm_schema()` â€” ADD COLUMN + CREATE TABLE (`customer_notes`, `customer_crm_events`) via `ensure_model_schema_sync`
- **`main.py`:** sync przy imporcie + w `upgrade_schema_background`
- **`customers.py`:** `logger.exception("[customers.list] failed tenant_id=%s")`
- Frontend: skeleton Ĺ‚adowania + retry przy bĹ‚Ä™dzie listy
- Testy: `backend/tests/test_customers_list_api.py`

## 2026-06-08 â€” WĂłzki / noĹ›niki: UI operacyjny WMS (frontend only)
- WĂłzki standardowe (`BulkCartEditor`): usuniÄ™te taby, jeden widok (dane, wymiary, pojemnoĹ›Ä‡, operacje, zdjÄ™cie)
- Tokeny moduĹ‚u: wiÄ™ksze fonty (15â€“16px), badge, koszyki w edytorze wĂłzkĂłw z koszykami
- NoĹ›niki: `CarrierIdentity` (kod + nazwa + opis, bez duplikatu barcode), `CarrierContentPreview` (popover zawartoĹ›ci), `CarrierLocationLink` (badge lokalizacji)
- Lista noĹ›nikĂłw: tabela desktop + kafle mobile; statusy PL w modalach; prefiksy PAL/BOX/BIN z kolorem i typem
- SzczegĂłĹ‚y noĹ›nika: kompaktowy header operacyjny, produkty + historia + ostatnia operacja bez tabĂłw ProductLike
- Etykiety: PUTAWAY â†’ â€žOdkĹ‚adanieâ€ť, ARCHIVED â†’ â€žArchiwalnyâ€ť

## 2026-06-08 â€” Klienci: CRM profile (typ, status, flagi, VIP/blokada, agregaty)
- Model `customers`: `customer_type`, `customer_status`, `flags_json`, pola hurtowe (limit, termin, opiekun)
- Tabela `customer_crm_events` â€” timeline (VIP, blokada, zmiana typu/statusu)
- API: `PATCH /customers/{id}/crm`, `POST /customers/{id}/crm/actions` (mark_vip, block, â€¦)
- Lista klientĂłw: typ, status, flagi, `order_count`, `total_gross` (batch stats)
- Detail: `summary` z KPI; self-heal agregatĂłw gdy `order_count=0` ale sÄ… zamĂłwienia
- Stats: pomijanie anulowanych/draftĂłw; refresh po complete direct sale
- Blokada: guard w `set_session_customer` â†’ 403 â€žKlient jest zablokowanyâ€ť
- Frontend: header CRM (back inline, badge VIP/Blokada, tylko menu â€žWiÄ™cejâ€ť), summary strip, picker z KPI, form hurtowy

## 2026-06-08 â€” Direct sales: naprawa DELETE pozycji koszyka (500)
- Nowy `line_delete_service.py`: lookup linii z DB, bezpieczne zwolnienie rezerwacji, activity event non-blocking
- Endpoint `DELETE .../lines/{line_id}`: commit â†’ `get_session` (fresh lines) â†’ `_session_to_read`; peĹ‚ny `logger.exception` przy 500
- `_session_to_read` / `enrich_session_lines`: pomijanie linii bez `product_id`, per-line try/except na financials
- PATCH qty=0: ten sam reload sesji po commit
- Frontend: `removingLineId` (loading tylko na usuwanej pozycji), toast przy bĹ‚Ä™dzie
- Testy: `backend/tests/test_direct_sale_line_delete.py` (5 cases)

## 2026-06-08 â€” Klienci: CRM-lite etap 1â€“2 (order-link, aktywnoĹ›Ä‡, notatki)
- Backend: `customer_order_link_service` â€” podglÄ…d/utworzenie/poĹ‚Ä…czenie klienta z zamĂłwienia + wykrywanie duplikatĂłw (email, telefon, NIP, nazwa)
- Endpointy: `GET/POST /api/customers/order-link/{preview,create,link}`
- Backend: `customer_notes`, `customer_activity_service`, `customer_note_service` â€” timeline (zamĂłwienia + notatki), CRUD notatek (pin, soft delete)
- Endpointy: `/api/customers/{id}/activity`, `/api/customers/{id}/notes`
- Historia zakupĂłw KPI: obrĂłt 30/90/365 dni, najwiÄ™ksze zamĂłwienie (`purchase_history_service`)
- Frontend: `OrderCustomerLinkPanel` w `OrderDetailPage` (badge â€žKlient niezapisanyâ€ť), `getCustomerDisplayName` na linku klienta
- Frontend: zakĹ‚adka â€žAktywnoĹ›Ä‡â€ť, `CustomerNotesSection`, `CustomerQuickActions`, rozszerzone KPI historii
- **NastÄ™pne etapy:** tagi/segmenty, merge duplikatĂłw, wiele adresĂłw, peĹ‚niejszy timeline (FV, zwroty, GUS)

## 2026-06-08 â€” Klienci: spĂłjna nazwa + direct sales refresh
- `getCustomerDisplayName()` â€” lista, detail, historia, direct sales (FV)
- Direct sales: peĹ‚na sesja z `set-customer`, eager fetch klienta, auto-uzupeĹ‚nianie formularza FV
- Naprawa UI: przypisany klient widoczny od razu (bez bĹ‚Ä™dnego `customer_is_retail` w stanie)

## 2026-06-08 â€” Schema reconciliation: startup crash fix
- `log_schema_tier()` â€” kwargs-safe (`columns_added`, `indexes_added`, `foreign_keys_added`, â€¦)
- Reconcile fazowy: tabele â†’ kolumny â†’ indeksy â†’ FK (ostatni etap)
- Orphan FK: NULL przed ADD CONSTRAINT (np. `direct_sale_sessions.customer_id`)
- Topological sort fallback przy cyklach FK (zamiast `sorted_tables` crash/warn)

## 2026-06-08 â€” Klienci: utwardzenie GUS/BIR + VAT MF/VIES
- Backend: `customers_gus.py`, cache PostgreSQL `gus_lookup_cache` (TTL 24h), timeout/retry/circuit breaker BIR
- VAT badge tylko z MF (`rejestr_vat`) i VIES â€” rozdzielone od danych firmy GUS
- Normalizacja adresĂłw (title case PL, kod pocztowy, ulica/nr)
- Frontend: `customersGusApi.ts`, brak auto-fetch przy wejĹ›ciu na klienta; debounce 900 ms + przycisk â€žPobierz z GUSâ€ť
- Admin: â€žNadpisz istniejÄ…ceâ€ť z potwierdzeniem; panel: `fetched_label`, ĹşrĂłdĹ‚o danych
- Logi strukturalne: nip, tenant_id, cache hit/miss, czas, source (bez peĹ‚nych danych firmy)

## 2026-06-08 â€” Klienci: naprawa routerĂłw + layout
- Purchase history + GUS scalone w `customers_router` (jeden mount `/api/customers`)
- GUS: `POST /api/customers/gus-lookup` (usuniÄ™to `/clients`)
- Frontend: `CustomerDetailPageShell` (PageLayout + PageHeader jak lista klientĂłw)
- KPI historii: kompaktowy skeleton + empty state bez duĹĽych pustych kart

## 2026-06-08 â€” Klienci: integracja GUS (NIP)
- Backend: `POST /api/customers/gus-lookup` â€” proxy BIR1 GUS + MF VAT, cache 24h
- Frontend: pole NIP z â€žPobierz z GUSâ€ť, debounce 900 ms, panel podglÄ…du, â€žUzupeĹ‚nij daneâ€ť (tylko puste pola)
- Badge: Zweryfikowano w GUS, Aktywny VAT, VAT UE
- Env: `GUS_API_KEY`, opcjonalnie `GUS_USE_TEST=true` (Ĺ›rodowisko testowe GUS)

## 2026-06-08 â€” Klienci: historia zakupĂłw (CRM dashboard)
- Backend: tabele `customer_sales_stats`, `customer_product_stats`; lazy refresh (TTL 60 min)
- Endpointy: `/customers/{id}/purchase-history/{summary,documents,top-products,trend}` + filtry/paginacja
- Frontend: tab â€žHistoria zakupĂłwâ€ť (`/customers/:id/historia-zakupow`), KPI AppStatCard, filtry AppFilterPanel, tabela dokumentĂłw, top produkty, wykres Recharts

## 2026-06-08 â€” PostgreSQL schema reconciliation (ORM startup sync)
- `schema_reconciliation.py`: peĹ‚na rekonsyliacja ORM vs DB (CREATE TABLE, ADD COLUMN, INDEX, FK)
- `sync_model_schema` / `ensure_model_schema_sync`: indeksy IF NOT EXISTS + brakujÄ…ce FK
- Tier 0 bootstrap: `reconcile_startup_schema` na PostgreSQL i SQLite (nie tylko create_all)
- Tier 1 background: drugi przebieg reconcile po ensure_* operacyjnych
- `ensure_workforce_operational_tables` / `ensure_workforce_user_groups_schema`: ORM sync (naprawa `user_activity_logs.warehouse_id` na PG)
- main.py: workforce ensures w allowliĹ›cie PostgreSQL

## 2026-06-08 â€” WĂłzki z koszykami: uproszczony UX edytora
- CartEditor: usuniÄ™to taby Podstawowe/PojemnoĹ›Ä‡/PowiÄ…zania; meta w headerze + zwijane info techniczne
- CartSectionGrid: karty koszykĂłw bez szarych teĹ‚; edycja w drawerze bocznym
- CartRowAddToolbar: kompaktowy pasek dodawania caĹ‚ego rzÄ™du
- ProductLikePageLayout: `hideTabs`, `hideModeLabel` dla widokĂłw jednoekranowych
- Logika API/zapisu bez zmian (capacity_mode nadal z payloadu istniejÄ…cego wĂłzka)

## 2026-06-08 â€” Dokumenty magazynowe: nowy widok szczegĂłĹ‚u (PZ/PW/RW/WZ/ZW/ZD)
- Wydzielono `WarehouseDocumentLinesSection`, `warehouseDocumentLineUi`, `WarehouseDocumentDetailFooter`
- Tabela pozycji: lekkie miniatury, skrĂłty typu (LP/KART/MAT), badge statusĂłw i LocationBadge
- Kolumny VAT %, cena/wartoĹ›Ä‡ brutto dla wszystkich typĂłw dokumentĂłw
- Podsumowanie: siatka AppStatCard (pozycje, iloĹ›ci, rĂłĹĽnica, netto/VAT/brutto)
- Footer: hierarchy z primary â€žZaksiÄ™gujâ€ť, secondary akcje po lewej
- DocumentTypeBadge w nagĹ‚Ăłwku i karcie dokumentu (PW/ZD/ZW w palecie)

## 2026-06-08 â€” Struktura magazynu: layout jak karta produktu
- `modules/warehouse-structure/`: etykiety PL, CapacityModeFields, WarehouseEntityPageShell
- BulkCartEditor + CartEditor â†’ ProductLikePageLayout (taby: Podstawowe, PojemnoĹ›Ä‡/Sekcje, Operacje, PowiÄ…zania)
- CartSectionGrid: wizualny ukĹ‚ad sekcji moduĹ‚owych
- OrderProductPreviewModal: biaĹ‚y panel, linki do zamĂłwienia/produktu
- WarehouseCarrierDetailPage â†’ ProductLikePageLayout (Podstawowe, ZawartoĹ›Ä‡, Historia)
- CarrierStatusBadge: polskie statusy (Aktywny zamiast ACTIVE)

## 2026-06-08 â€” WĂłzki / RegaĹ‚y / Strefy / NoĹ›niki: UI spĂłjne z ERP
- `CartsModuleLayout`: jedna biaĹ‚a powierzchnia + systemowe taby (jak Dokumenty)
- `modules/carts/cartsModuleTokens.ts`: dense inputs/buttons/tables
- Listy wĂłzkĂłw: AppStatCard KPI, CartsListPageHeader, kompaktowe grupy
- Edytory bulk/multi: formularze ERP (bez rounded-2xl / gradientĂłw)
- RegaĹ‚y/strefy: AppSection-style konfiguratory + AppEmptyState
- NoĹ›niki: tabela dokumentĂłw, prostsze badge, CarrierGroupCard dopasowany do grup wĂłzkĂłw

## 2026-06-08 â€” ProductLikePageLayout: wspĂłlny shell produkt + zestaw
- `components/catalog/`: ProductLikePageLayout, CatalogEntityPageShell, ProductLikeSection, tokens
- ProductEditModal + BundleEditModal na tym samym layoutcie (header, taby, rail, footer)
- ProductNewPage/EditPage + BundleNewPage/EditPage â†’ CatalogEntityPageShell

## 2026-06-08 â€” Zestawy: peĹ‚na strona edycji + design system app-shell
- Trasy: `/bundles/new`, `/bundles/:id/edit` (bez modala tworzenia/edycji)
- `BundleEditModal variant="page"`: taby Podstawowe/Produkty/Magazyn/Historia/Logi/PowiÄ…zania
- `components/app-shell/`: AppFilterPanel, AppPageHeader, AppEmptyState, AppSection, AppStatCard, AppToolbar
- Filtry: akcje Filtruj/WyczyĹ›Ä‡ zawsze na dole panelu (ModuleListFiltersCard â†’ AppFilterPanel)

## 2026-06-08 â€” Czas pracy: telemetria operacyjna caĹ‚ego systemu
- `track_user_activity()` + `session_id` / `warehouse_id` na `user_activity_logs` (gap 15 min)
- Middleware API: automatyczne logowanie mutacji + sensownych GET (mapowanie moduĹ‚Ăłw)
- Analytics: heatmapa godzin, top moduĹ‚y, aktywnoĹ›Ä‡ dzienna, sesje, timeline, throughput
- API: `GET /workforce/analytics`; UI: przebudowany dashboard + strona aktywnoĹ›ci
- Testy: `test_workforce_activity.py`

## 2026-06-08 â€” Inwentaryzacja ERP: WMS shell polish
- Layout: breadcrumb Magazyn/Inwentaryzacja, + zamiast duĹĽego CTA, bez subtitle
- Tabela przebiegu: bez duplikatĂłw Oczek./Policz./RĂłĹĽn., kolumny Operator/Czas, dense rows
- theme.ts: gÄ™stsze paddingi, lĹĽejsze bordery, slate tabs

- `resolve_line_unit_cost_net`: obsĹ‚uga `line=None` (orphan RW), fallback ceny z kartoteki
- `_line_target_quantity`: uĹĽywa zaakceptowanego wyniku supervisora zamiast pomijaÄ‡ liniÄ™
- `reconcile_line_counted_from_operators`: nie zeruje qty po rÄ™cznym rozwiÄ…zaniu konfliktu
- Testy: `test_posting_preview.py` (6 scenariuszy)
- UI: przycisk â€žWyĹ›lij do zatwierdzeniaâ€ť â†’ â€žZatwierdĹşâ€ť

- Backend conflicts API: `ean`, `product_image_url` w `_build_conflict_item`
- Panel: karty zamiast tabeli ERP; miniatura 56Ă—56, EAN, SKU; operator/iloĹ›Ä‡/akcje z hierarchiÄ…
- Status vs akcja: badge â€žOczekuje ponownego liczeniaâ€ť; button â€žZleÄ‡ ponowne liczenieâ€ť (1Ă— na konflikt, tylko gdy `conflict_open`)

- `wmsLayoutTokens`: `WMS_TERMINAL_SHELL`, `WMS_TERMINAL_INNER`, `WMS_TASK_GRID`, `WMS_TASK_CARD`
- Braki: `WmsOrderIssuesHub` â€” left-aligned, grid 1/2/3, `BrakiOrderIssueCard` (accent strip, badges, CTA)
- Produkcja: layout + Collecting/Execute/Putaway â€” grid kolejki, kompaktowy `WmsTerminalEmptyState`, `WmsProductionActiveBatchBar`
- WspĂłlne: bez centrowania, bez wÄ…skich wrapperĂłw i kolorowych borderĂłw caĹ‚ej karty

## 2026-06-09 â€” Dokumenty magazynowe: config-driven kolumny + RW/PW wartoĹ›ci
- Frontend: `warehouseDocumentConfigs.ts`, `WarehouseDocumentsTable.tsx` â€” osobne kolumny per PZ/PW/RW/WZ/MM/ZD/ZW; usuniÄ™te kolumny pĹ‚atnoĹ›ci
- Backend: `series` object, `resolve_document_financial_totals` dla RW/PW; persist totals przy posting inwentaryzacji
- Detail: ukryty dostawca gdy brak; sekcja â€žĹąrĂłdĹ‚o dokumentuâ€ť dla RW/PW; kompaktowe menu boczne

## 2026-06-09 â€” Konflikty inwentaryzacji: grouped API + accept bez recount
- Backend: `counts[]` z `count_id`, `conflict_status`, `quantity_diff_label`; `POST .../conflicts/accept` (supervisor wybiera istniejÄ…cy wpis)
- `conflict_resolution_service`: metadata `operator_conflict_resolution` â€” konflikt znika bez tworzenia recount
- Frontend: tabela 1 wiersz = produkt+lokalizacja; operatorzy/iloĹ›ci/czasy stacked; approve po `count_id`; recount tylko â€žWymuĹ› ponowne liczenieâ€ť
- Testy: `test_conflict_accept.py`, rozszerzenie `test_conflicts_endpoint.py`

## 2026-06-09 â€” Fix: peĹ‚na inwentaryzacja zeruje niepoliczone stany (FULL + update_stock)
- `full_inventory_posting_service.py`: plan ksiÄ™gowania target â’ live stock; zero dla uncounted/orphan scope
- PARTIAL/CYCLE/CONTROL bez zmian â€” tylko policzone linie
- Testy: `test_full_inventory_zeroing.py` (CASE 1â€“3)

## 2026-06-09 â€” WMS shell polish: topbar tabs, launcher command center, DnD
- Topbar: glass (`backdrop-blur`, `bg-white/90`), underline active tab (Linear-style), DnD reorder pinned
- Launcher: search + `/` shortcut, keyboard nav, pinned tiles drag-reorder (mobile: strzaĹ‚ki)
- Kafelki: subtelniejszy hover, mniejsze badge, ciaĹ›niejszy spacing, `React.memo`

## 2026-06-09 â€” Fix: GET /inventory-count/documents/{id}/conflicts â†’ 500
- Przyczyna: brak importu `list_document_conflicts` w `inventory_count.py` â†’ NameError
- `conflict_detail_service`: batch load (lines/products/locations/carriers/recounts/operators), `_safe_float`, per-item try/except, logi skip/partial
- API: `logger.exception` + structured 500 detail; testy `test_conflicts_endpoint.py`
- Frontend: `conflictsError` + retry w panelu konfliktĂłw (nie blokuje widoku dokumentu)

## 2026-06-09 â€” WMS launcher + topbar: przypinanie, biaĹ‚y UI
- Launcher: bez hero, bg-white, kafel z pinezkÄ… (pin/unpin), reorder â†/â†’ dla przypiÄ™tych
- Topbar: h-11, white, pills przypiÄ™tych moduĹ‚Ăłw (Ĺ›rodek), grid menu + magazyn (lewo)
- `finalTabs` = tylko pinned (localStorage per user); brak fallbacku na caĹ‚y katalog
- Shell WMS: `bg-white` zamiast slate-100

## 2026-06-09 â€” Fix: inventory posting StockDocument(notes=â€¦) TypeError
- Przyczyna: `adjustment_service` przekazywaĹ‚ `notes=` do `StockDocument` â€” pole nie istnieje w modelu
- Nowy `stock_document_factory.create_stock_document()` â€” walidacja kolumn ORM + log `STOCK_DOCUMENT_INVALID_KWARGS`
- Testy: `test_stock_document_factory.py`, `test_inventory_posting_integration.py` (PW, status, idempotency)

## 2026-06-08 â€” WMS launcher: enterprise module grid (rebuild)
- UsuniÄ™ty terminal shell (`WmsHeader`, footer CE); launcher uĹĽywa standardowego `WmsTopBar` jak reszta WMS
- DuĹĽe kafle (min ~185px): ikona, tytuĹ‚, opis, chipy statystyk (konflikty, aktywne, oczekujÄ…ce)
- Grid 1/2/3/4 kolumn, max-width 1600px, slate-50 + white cards, hover elevation
- `useWmsLauncherBadges` â†’ `metrics` per moduĹ‚ (inwentaryzacja: konflikty + aktywne docs)

## 2026-06-08 â€” WMS inwentaryzacja: lista dokumentĂłw jak PZ / Rozlokowanie
- `WmsInventoryDocumentList`: usuniÄ™ty hero; peĹ‚na szerokoĹ›Ä‡; scanner + grid jak PrzyjÄ™cie/Rozlokowanie PZ
- Karta: lewa (ikona, nr, status, operatorzy, konflikty, data), prawa (pokrycie, policzone), dĂłĹ‚ (progress bar)
- Skan/filtr dokumentu; integracja `useWmsScanner` + `useWmsPageScanHandler`

## 2026-06-08 â€” Fix: HTTP 500 przy ksiÄ™gowaniu RW/PW inwentaryzacji
- `posting_validation_service.py`: walidacja przed postem â€” reconcile operatorĂłw (nigdy suma), snapshot linii `[POST INVENTORY] line snapshot` (cartons/carton_capacity/pieces/computed_total/delta), blokada absurdalnych qty, preflight stock RW
- `adjustment_service.py`: per-line try/except â†’ `InventoryPostingFailedError` (FIFO ValueError zamiast surowego 500)
- API `POST .../post`: `posting_failed` â†’ HTTP 422 ze szczegĂłĹ‚ami; nieoczekiwane bĹ‚Ä™dy â†’ traceback w `detail`
- Testy: `test_posting_validation.py`

## 2026-06-08 â€” WMS launcher: terminal operacyjny (kafelki moduĹ‚Ăłw)
- Nowy widok `/wms/menu`: `WmsLauncherPage`, `WmsModuleTile`, `WmsHeader`
- Industrial UI: granatowy header, duĹĽe kafelki (â‰Ą140px), bez pinĂłw/hover SaaS
- Badge z API: Braki, Zbieranie, Pakowanie, PrzyjÄ™cie, Rozlokowanie, Inwentaryzacja
- Nawigacja klawiaturÄ… (strzaĹ‚ki, Enter), focus dla skanerĂłw/kolektorĂłw

## 2026-06-08 â€” Fix: eksplozja iloĹ›ci WMS (multi-browser / stale state)
- Przyczyna: optimistic update + frontend liczyĹ‚ `quantity` (absolute) z lokalnej bazy; stale `packaging.loaded` w closure; effect re-dekomponowaĹ‚ total przy kaĹĽdej zmianie `counted_quantity`
- Skany: backend SSOT przez `delta` (+1 szt / +pack karton); UI aktualizuje siÄ™ dopiero z `my_counted_quantity` z API
- RÄ™czna korekta: `quantity` (absolute) tylko po zapisie â€” bez optimistic
- WyĹ‚Ä…czono optimistic; `applyServerQuantity` jako jedyny hydrator UI; `savingQty` blokuje double-submit
- Czyszczenie `localStorage` sesji lokalizacji po zakoĹ„czeniu (`clearLocationSessionForTask`)
- Logi `[COUNT DEBUG]` frontend (console) + backend (`count_entry_service`)

## 2026-06-08 â€” Fix: stale lock przy ksiÄ™gowaniu inwentaryzacji (409 posting_in_progress)
- Lock w DB (`posting_in_progress`), nie Redis; brak cleanup po bĹ‚Ä™dzie zostawiaĹ‚ dokument zablokowany
- Backend: `SELECT FOR UPDATE`, auto-clear orphan lock (`posting_in_progress=1` w DB = failed cleanup), `finally` + force unlock w osobnej transakcji
- Logi `[POST INVENTORY]`: start, acquire lock, transaction, rw/pw, commit, rollback, release lock
- Idempotency key ustawiany dopiero przed commitem (nie przy acquire lock)
- Frontend: ref guard double-submit, UUID idempotency key, loading na przycisku modala

## 2026-06-08 â€” Fix: eksplozja iloĹ›ci kartonĂłw (WMS inwentaryzacja)
- Przyczyna: total w szt. dekomponowany przy pack=1, potem ponownie mnoĹĽony po zaĹ‚adowaniu unitsPerCarton
- SSOT: cartons + pieces w UI; total tylko computed; API wysyĹ‚a wyĹ‚Ä…cznie `quantity` (absolute pieces)
- Resync stanu po zaĹ‚adowaniu opakowania; refs zamiast stale closures
- Backend conflicts: skip lines bez product_id, NaN guard na quantity

## 2026-06-08 â€” Nowoczesny ekran logowania Sasist (SaaS)
- Split layout: ciemny branding + jasny formularz (`LoginBrandingPanel`, `LoginFormPanel`)
- `ProtectedRoute` â€” globalna ochrona tras; public: `/login`, `/wms-upload/*`
- Sesja: remember me (localStorage vs sessionStorage), last path redirect, auto refresh token, `auth:session-expired` event
- UX: show/hide password, caps lock, last email, inline errors, API status footer

## 2026-06-08 â€” Inventory counting UX: terminal + ERP progress
- WMS: optymistyczny licznik po skanie (`applyScanQty` przed API); baza qty z `my_counted_quantity`, nie globalnej sumy
- WMS: header produktu â€” wiÄ™ksze zdjÄ™cie, badge lokalizacji/noĹ›nika (bez duplikatu w belce); konflikt tylko dla kierownika/superadmin
- WMS: kompaktowe liczniki; dolny pasek: Nieznany (warning), Wada (danger), ZakoĹ„cz (primary)
- ERP tab â€žPrzebieg liczeniaâ€ť: osobny wiersz per operator przy konflikcie (`expandOperatorRows`)

## 2026-06-08 â€” ERP inventory: uproszczony przebieg liczenia (UI only)
- UsuniÄ™to kolumnÄ™ â€žĹąrĂłdĹ‚o stanuâ€ť; noĹ›nik pod lokalizacjÄ… (`InventoryLocationStack`)
- Produkt: wiÄ™ksze zdjÄ™cie, nazwa/EAN/SKU; bez noĹ›nika pod produktem
- Konflikty: POLICZ. pokazuje operatorĂłw osobno (nie suma); badge â€žKonflikt liczeniaâ€ť; akcje zatwierdĹş/recount (istniejÄ…ce endpointy)
- UsuniÄ™to listÄ™ â€žPoliczone w lokalizacjiâ€ť â†’ **Ostatnio policzone przeze mnie** (max 2 pozycje)
- Hero produktu: duĹĽe zdjÄ™cie (bez ramek) â†’ nazwa â†’ EAN â†’ lokalizacja â†’ noĹ›nik â†’ kartony/sztuki/suma
- NoĹ›nik przypisywany w kontekĹ›cie produktu (nie w belce lokalizacji)
- Wada przeniesiona do dolnego paska: `[ Nieznany ] [ Wada ] [ ZakoĹ„cz ]`
- Backend: liczenia operatorĂłw **nie sumujÄ… siÄ™** (27 + 8 â‰  35); konflikt â†’ `line.counted_quantity = null`, wpisy per operator w `inventory_count_entries`
- API WMS: `scope=mine` na liniach, `my_counted_quantity` / `operator_count_conflict` na skanie

## 2026-06-08 â€” WMS inventory terminal UI (mockup-aligned)
- Presentation-only restyle of operator flow: document cards, location scan, product scan, qty modal
- New/updated `ui/wms/` components: `WmsInventoryLandingView`, `WmsInventoryProductDetailPanel`, mockup theme tokens
- Hooks, API, scan handlers, counting logic unchanged; ERP admin inventory untouched

## 2026-06-08 â€” Inventory UX: portal dropdown + draft delete
- Reports document picker renders via portal (`z-index: 10050`) â€” no clipping under sticky ERP chrome
- Draft documents deletable from list (trash action + confirm modal); `DELETE /inventory-count/documents/{id}` with status/session validation

## 2026-06-08 â€” ERP inventory layout unified with panel shell
- Replaced custom inventory shell (`max-w-[1600px]`, white full-page) with standard `PageLayout` + `SettingsModuleStack` (same as Producenci / Administratorzy)
- Module header: breadcrumbs, title, `TopTabsNavigation`, primary action in header
- Views use `moduleListPageShellClass`, `erpSurfaceCard`, `panelListDense*` table tokens

## 2026-06-08 â€” ERP inventory admin UI (mockup-aligned, presentation only)
- `ui/erp/theme.ts` â€” shared tokens: KPI cards, tables, indigo tabs, wizard steps, selection cards, scope box
- `InventoryLayout` â€” `PageLayout` + indigo tab nav (Pulpit / Dokumenty / Kreator / Raporty)
- Dashboard, documents list, wizard, reports â€” mockup layout on existing hooks/API
- `InventoryDocumentDetailView` â€” KPI grid, indigo detail tabs, table shell; approval/conflict/unknown panels unchanged logically
- `InventoryDocumentPicker` â€” optional `id` + `triggerClassName` for reports selector styling
- WMS inventory terminal untouched; no backend/API/hook changes

## 2026-06-08 â€” Inventory frontend UI architecture cleanup
- `docs/inventory-architecture.md` â€” flow maps, routes, persistence, risk files, orphaned legacy
- New `modules/inventoryCount/ui/erp/` + `ui/wms/` presentation layer (themes separated)
- God page split: `useInventoryDocumentDetail` + `InventoryDocumentDetailView`; `useWmsInventoryTerminalPage` + `WmsInventoryTerminalView`
- API split: `inventoryDocumentsApi`, `inventoryApprovalApi`, `inventoryConflictsApi`, `inventoryReportsApi`, `inventoryWmsApi`; barrel `inventoryCountApi.ts`
- Legacy WMS execution files archived to `frontend/_archive/inventory-count-legacy/`
- Deprecated shims at old `erp/components/` and `components/` paths for incremental import migration

## 2026-06-08 â€” WMS inventory document-scoped entry flow
- WMS `/wms/inventory-count` landing: active docs only (`in_progress`, `awaiting_approval`); drafts/approved/cancelled hidden
- Document cards: number, title, type, scope, progress, operators, conflicts, movement policy, last activity
- Routes: `/d/:documentId` (location scan), `/d/:documentId/count/:taskId` (terminal); legacy `/count/:taskId` redirects
- Sticky header switcher (`WmsInventoryDocumentSwitcher`); sessionStorage per warehouse for active document
- Empty state â€žBrak aktywnych inwentaryzacjiâ€ť; â€žUtwĂłrz dokumentâ€ť gated by `inventory.submit`
- Backend: `GET /wms/inventory-count/active-documents` + `wms_active_documents_service`

## 2026-06-08 â€” Inventory start stability + movement enforcement + wizard UX
- **500 on start fixed**: missing `log_inventory_audit` import in `location_lock_service` (triggered when movement policy â‰  allow)
- Start returns structured errors: `scope_not_configured`, `scope_not_materialized`, `inventory_start_failed` (+ 500 fallback with code/details)
- `inventory_movement_guard_service`: real enforcement â€” picking complete, putaway, replenishment, pick routing suggestions
- Wizard: collapsible product/location pickers, tag chips, product thumbnails, zones hidden, richer summary + full server persist before start
- Partial scope operational impact copy; `formatInventoryRequestError` for start failures

## 2026-06-08 â€” Inventory operational polish (supervisor + WMS ergonomics)
- Approval safety modal: shortages/surpluses, unknown count, locations, RW/PW preview before submit/approve/post
- `posting_preview_service` + `GET .../posting-preview`; unresolved conflicts in preview
- Dedicated conflict panel: operators, qty, timestamps, carrier, recount state (`GET .../conflicts`)
- Unknown product supervisor resolution: map to catalog product or reject (`GET/POST unknown-products`)
- ERP detail: ops metadata bar (type, policies, warehouse, operators, started/last activity)
- Line table â€žĹąrĂłdĹ‚o stanuâ€ť: Na pĂłĹ‚ce vs W noĹ›niku
- WMS sticky context bar: LOKALIZACJA â†’ NOĹšNIK â†’ PRODUKT always visible during counting
- Filter/tab state persisted in sessionStorage across Przebieg/RĂłĹĽnice/Kontrola
- KPI valuation tooltips (purchase net / snapshot / FIFO foundation)
- Wizard scope operational presets (bez EAN, ABC A, brak ruchu, noĹ›niki, â€¦)

## 2026-06-08 â€” Inventory UX production cleanup
- Submit-for-approval: only blocks empty doc, wrong status, operator recount conflicts (not partial count, differences, open WMS tasks)
- KPI: â€žKonflikty liczeniaâ€ť + wartoĹ›Ä‡ nadwyĹĽek/brakĂłw PLN (removed dead â€žWpĹ‚yw nettoâ€ť)
- ERP tabs: filter toolbar on Przebieg / RĂłĹĽnice / Kontrola
- WMS: carrier hierarchy card (LOCATION â†’ CARRIER â†’ PRODUCTS)
- Editable document title + notes; scope preview API + wizard location/product pickers
- Wizard: 4 steps (removed fake Zadania step)

## 2026-06-08 â€” Inventory strategy simplification (operator-first config)
- Replaced snapshot/soft/hard with movement policies: allow_operations | block_picking | block_all
- Result policy: update_stock | count_only | report_only â€” post skips RW/PW for non-update modes
- Partial scope modes in wizard: zones, locations, products, categories, carriers, dynamic filters
- Materialization respects scope_mode + expanded filters; legacy lock_mode values normalized
- Wizard redesigned: Typ â†’ Zakres â†’ Ustawienia â†’ Podsumowanie; removed recount_required checkbox
- Detail page shows operator settings; conditional â€žZakoĹ„cz bez korektâ€ť vs â€žKsiÄ™guj RW/PWâ€ť

## 2026-06-08 â€” Recount vs inventory variance (domain fix)
- RĂłĹĽnice expectedâ‰ counted â†’ supervisor_review, NIE mandatory recount
- `recount_conflict_service`: recount tylko przy konflikcie operatorĂłw (ten sam produkt/lokalizacja, rĂłĹĽne iloĹ›ci)
- `recount_state`: none | required | resolved na liniach; approval blokuje tylko nierozwiÄ…zane konflikty
- UI: â€žRĂłĹĽnicaâ€ť vs â€žWymaga ponownego liczeniaâ€ť vs â€žZweryfikowanoâ€ť

## 2026-06-08 â€” WMS inwentaryzacja: location â†’ carrier â†’ product
- `wmsInventoryExecutionContext.ts` â€” locationContext, carrierContext, grouping, PAL-/BOX- detection
- Hook: auto-aktywacja lokalizacji po zaĹ‚adowaniu taska; carrier przez API; scan z carrier_id
- Backend: linie liczone per (location Ă— product Ă— carrier); `resolve-carrier`; task lines z carrier_code
- UI: `WmsInventoryActiveContextBar`, grupowana lista â€žPoliczone w lokalizacjiâ€ť

## 2026-06-08 â€” Submit approval: scoped inventory + Polish errors
- `approval_service`: PARTIAL/CYCLE/CONTROL skip full coverage; smarter WMS task blocking (only incomplete locations); projected recount gate; Polish block messages; rollback on recount failure
- Frontend: `formatInventoryRequestError`, toast + reload doc after failed submit; scoped types in `canSubmitInventoryDocument`

## 2026-06-08 â€” ERP inwentaryzacja: oĹ› czasu Kontrola
- `inventoryAuditEventLabels.ts` â€” mapowanie zdarzeĹ„ audytu na polskie etykiety operacyjne + `buildInventoryAuditTimeline`
- `InventoryAuditPanel` â€” gÄ™sta tabela ERP (operator, czas, operacja, produkt/EAN/miniatura, delta iloĹ›ci); bez surowego JSON/kluczy
- Backend `audit_log_service` â€” wzbogacenie o `user_name`, `line_context`, `location_name`
- UsuniÄ™to redundantny link â€žâ† Lista dokumentĂłwâ€ť z widoku szczegĂłĹ‚Ăłw dokumentu

## 2026-06-04 â€” WMS production execution UI shell alignment
- `/wms/production/*` renders inside shared `WmsOperationalLayout` + `WmsTopBar` (removed hideProductionTopBar)
- Removed duplicate header from `WmsProductionExecutionLayout` (icon, TERMINAL WMS, mode title, Menu WMS)
- Removed extra amber â€žProd. WMSâ€ť button from topbar â€” single â€žProdukcja â€” wykonanieâ€ť in module nav
- Workflow tabs only (Zbieranie / Wykonanie / OdĹ‚oĹĽenie) + `WMS_OPERATIONAL_CONTAINER` spacing
- Centered empty states via `WmsProductionTerminalEmptyState`

## 2026-06-04 â€” Production schema platform integrity
- Fail-fast `run_production_schema_startup_gate` (import + tier0); blocks on missing tables/columns/types + required batch columns
- `GET /health/schema` â€” dialect, generation `12`, drift fields (Railway/CI/support)
- Startup logs: `PRODUCTION_SCHEMA_VERSION=12`, `[production.schema.audit.summary]`
- Workers guarded via `schema_guard.require_production_schema_valid`; background upgrade aborts workers on gate failure
- PostgreSQL no-op wrapper logs `SCHEMA_HELPER_SKIPPED_POSTGRES` + allowlist warning (production helpers exempt)
- Tests: `test_production_schema_platform.py` (27 production schema tests passing)

## 2026-06-04 â€” Composition Engine + Batch/Wave Production
- `product_compositions` + `product_composition_lines` (bundle | manufacturing modes, no product_type)
- `production_batches` + `production_batch_lines`; aggregated component demand + shortages
- Migration from `production_recipes`; recipe service syncs compositions; stock docs link batch_id
- API: `/compositions`, `/production/batches`; frontend Kompozycje tab + batch Produkcja UI
- Tests: `test_composition_batch.py` (aggregation engine)

## 2026-06-04 â€” Manufacturing / Production module (WMS)
- PostgreSQL-safe migration `ensure_production_tables` (recipes, orders, line snapshots)
- Recipe service + production order service (FIFO consume, RW/PW docs, valuation on complete)
- API router `/production`; no `product_type` enum
- Frontend: Produkcja nav + list/detail UI; product tab with recipe editor and component usage
- Tests: recipe calculations, schema, self-reference guard

## 2026-06-04 â€” Direct Sales PDF + Dokumenty print templates
- Root-cause fix: sale PDF 500 (`map_sale_document` keyword-only call)
- Central `document_print_service` with logging, builtin/custom template fallback, PDF validation
- Auto-seed Paragon/FV/WZ/Korekta A4 templates (stable slugs) in label template Dokumenty category
- Frontend PDF fetch validates `%PDF` bytes; print errors surface backend `detail`

## 2026-06-04 â€” WZ warehouse document cleanup
- `wz_service`: finalize WZ as `completed` with line net/VAT pricing and document totals
- Stock document list/read: order number, series prefix, customer, financial totals for WZ
- `DocumentsWarehousePage` WZ tab: removed payment columns; ZREALIZOWANA status; warehouse-oriented line table

## 2026-06-04 â€” Retail/POS workflow (Direct Sales)
- Auto retail customer (`Klient detaliczny`) on every new session
- Document-first flow: PA = retail badge; FV = NIP lookup + invoice customer upsert
- Line + order discounts with backend canonical totals (`session_financials_service`)
- Discount settings + admin panel section; server-side max-% validation
- Complete pipeline reads session `document_subtype`; `httpx` for MF NIP API

## 2026-06-04 â€” Direct-sale NET price pipeline fix
- Session `unit_price` is catalog NET; backend no longer treats it as gross
- `netto_line_to_gross_fields`, updated `compute_direct_sale_session_total` with per-product VAT
- Receipts/documents: 5.00 net / 1.15 VAT / 6.15 gross (was wrongly 4.07/0.93/5.00)

## 2026-06-04 â€” Financial consistency pass
- Unified order line financials on `sale_document_financials.compute_order_line_financials_with_margin`
- Fixed order-level margin: null when `sum_purchase_active` is zero (no more false 100%)
- Frontend order detail: display-only `line_gross_total` / `unit_price_gross` (fixes 5.01 brutto bug)
- Direct-sale completion traceability: load issue movements from WZ / `source_movement_id`
- PA series padding repair at seed (`padding_length=0`)
- Operational debug panel gated to Vite DEV only

## 2026-06-04 â€” POS UX polish
- PDF print endpoints wired; formatMoneyPl; stationary-sale labels; linked documents UI

## 2026-07-29 â€” Agent 1.5.0 release process + E2E print

- Auto versioning: VERSION + Directory.Build.props + publish-release bump; clean-reinstall-admin.ps1
- Installed 1.5.0 on E-HANDEL; shortcut Sasist Agent on desktop
- E2E ERP batch 9: Pobierz PDF, Drukuj przez przeglÄ…darkÄ™ (blob open bez noopener), Stanowisko 1 job 18 PDFiumâ†’GDI
- Fix route order: /agents/self/test-page before {agent_id}
- Update metadata: ignore legacy SasistPrinterAgent-Setup; default release 1.5.0

## 2026-07-29 â€” Template usage impact report

- Replaced small UĹĽycia modal with right drawer + full usage report
- Backend usage endpoint returns summary counts and sectioned entries with erp_link deep links
- Editor Przypisania/UĹĽycia tab shows the same report body
## 2026-08-12 â€” Phase 6: production â†’ packing handoff
- Config: after_production_action STATUS_ONLY|OPEN_PACKING; status_after uniqueness/cross-rules
- Fulfillment: CARTLESS + READY_TO_PACK; packing_handoff on progress response; FE toast/auto-open
- Pack finish: consume buffer inventory; badge Z produkcji
- Tests: test_production_packing_handoff.py (+ config/fg regression)

