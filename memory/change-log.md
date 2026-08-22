## 2026-08-22 — Harden message template variables + supported_contexts

- Renderer reports `missing_variables` / `unknown_variables` (unknown tokens kept in text)
- Preview warning in editor; gaps logged without PII on enqueue/reply/preview
- `entity_scope` storage → canonical CSV multi-context; API SSOT `supported_contexts[]`
- Checkbox round-trip ORDER+RETURN preserved; shared filter for Poczta + Automation

## 2026-08-22 — Message templates Sellasist-like UX + variable SSOT

- Registry SSOT: `backend/services/messaging/template_vars/` (`{key}` + legacy `{{key}}`)
- Shared `render_template` used by automation outbox, Poczta reply, preview API
- FE: TipTap editor + variables panel; list table at `/templates/messages`; Poczta apply via preview
- Tests: messaging vars + automation email + FE panel/IA; `npm run build` PASS

## 2026-08-22 — Fix Poczta React #130 render crash

- Root cause: `MailAccountsPage` `AppEmptyState` missing required `icon` prop → `<undefined />` after API load
- Added `pocztaRenderCrash.test.tsx` (RTL mount: sidebar, flyout, korespondencja, konta, szablony)
- Minor: `pocztaTabs` import path, `ErpSidebar` LucideIcon from lucide-react, sidebar meta row class

## 2026-08-21 — Interactive returns report + export

- Live tab Raport zwrotów; SSOT row = RMZLine; CSV/XLSX export of filtered set
- GET /api/returns/report (+ summary); date field created|warehouse_commit|refund

## 2026-08-21 — Correction economic ledger (no duplicate product deltas)

- `source_sale_document_item_id` on SaleDocumentItem; new_delta = target − already
- false→true shipping: KOR2 shipping-only; scope reduction blocked; SHIPPING_ALREADY_CORRECTED removed

## 2026-08-21 — RETURN correction optional shipping cost

- `include_shipping_cost` on `issue_sale_correction_for_return` + `generate_sale_correction` config
- Shipping delta from source SaleDocument SHIPPING snapshot only; legacy fail `source_shipping_not_available`
- Scope hash + SHIPPING_ALREADY_CORRECTED; nested UI under Korekta (no separate matrix column)

## 2026-08-21 — generate_sale_correction Automation effect

- Thin adapter `generate_sale_correction` → `issue_sale_correction_for_return` (no domain rebuild)
- RETURN STATUS_ACTION: Magazyn | Korekta | emails; order validation warehouse before correction
- Main editor: RETURN-only catalog entry „Wystaw korektę faktury”

## 2026-08-21 — Return status actions inline matrix

- Full-width matrix per subgroup: Status | Magazyn | E-mail klient | E-mail wewn. | Akcje
- Inline checkbox toggles â PUT status-actions (managed/unmanaged merge preserved)
- Email popover for template (+ internal user); overview batch returns enabled+config map
- Removed under-name âBrak automatycznych akcjiâ text projection

## 2026-08-21 â Return status list STATUS_ACTION overview UX

- Compact StatusActionsPanel (property checkboxes; email config only when ON; warehouse_commit tooltip)
- Batch GET `/automations/status-actions/overview` â status_id â business action labels
- ListLabelsSection shows â actions per status; SSOT remains AutomationRule (no ReturnUiStatus booleans)

## 2026-08-21 â Fix STATUS_ACTION Sellasist semantics (no change_status in panel)

- StatusActionsPanel: edited status = trigger; checkboxes = side-effects only
- Removed change_status from ORDER/RETURN/COMPLAINT panel; no seed on save
- upsert_status_action_bundle: managed merge (emails + warehouse_commit) preserves unmanaged (legacy change_status)
- rule.enabled = any enabled effect after merge; advanced hint in panel
- add_tag / preflight / main Automation Editor untouched

## 2026-08-21 â Complete real email delivery pipeline for automations

- Outbox lifecycle PENDINGâSENDINGâSENT|FAILED; enqueue never fake SENT
- Pluggable EmailProvider (SMTP ENV / memory tests); unconfigured â FAILED
- email_delivery_worker on operational_loop; automation effect = enqueue PENDING
- Template CRUD API + MessageTemplatesModule; shared MessageTemplatePicker

## 2026-08-21 â Add email effect to backend automations

- MessageTemplate + OutboundEmailMessage outbox (idempotency ae:execution:effect)
- send_email effect adapter for ORDER/RETURN/COMPLAINT; CUSTOMER recipient
- StatusActionsPanel + main editor; legacy send_message â send_email
- Preflight treats send_email as supported; (superseded: no fake outbox SENT)

## 2026-08-21 â Block unsupported automation runtime conditions

- Preflight `validate_automation_runtime`: unsupported/invalid condition or effect â EXEC_BLOCKED, 0 effects
- Removed skip semantics for unevaluable conditions; API `runtime_ready` + `validation_issues`
- FE: Gotowa / Wymaga poprawy badges; editor issues; unsupported catalog fields/effects hidden from picker
- Legacy import preserves conditions; runtime_ready=false until migrated

## 2026-08-21 â Order Automations â backend SSOT cutover

- Extended AutomationRule: group, conditions, metadata; run_kind on executions
- Backend condition evaluator (order_status/warehouse_id/order_number + domain status fields)
- FE editor/list/packing use API; legacy import idempotent; executeOrderAutomationEffects retired
- Order StatusActionsPanel; STATUS_ACTION badge on main list

## 2026-08-21 â Automation Engine Phase 2 (Return/Complaint STATUS_ACTION)

- Triggers on ReturnUiStatus / ComplaintUiStatus enter only (not RMZ workflow)
- `change_status` for ORDER|RETURN|COMPLAINT via domain services
- STATUS_ACTION source + status-actions projection API; delete status disables rules
- FE shared StatusActionsPanel; automation list shows backend STATUS_ACTION badge
- No refund/stock/email/SMS; tests AâQ style + vitest + build PASS

## 2026-08-21 â 3D Matching decision history

- `WmsThreeDMatchingEvent` + schema upgrade; write only on real 3D engine run
- Lazy SMART_THEN_3D; strategy semantics AâE; snapshots for carton/strategy/filler
- `GET /wms/3d-matching/history`; FE Historia doboru under 3D Matching settings
- Tests AâT style suite PASS; rebuild regression PASS

## 2026-08-20 â Smart Matching v2 COMPOSITION EXTEND

- pattern_type SINGLE_PRODUCT | COMPOSITION on ObservationV2 + RuleV2
- Exact normalized multi-SKU learning/resolve/break/conflict; product disable applies to composition
- History-events + learning-series support composition_items; empty-state copy updated
- No new v1 rules; legacy v1 readonly fallback kept

## 2026-08-20 â Smart Matching v2 Phase 5A (history-events)

- `broken_by_observation_id` on RuleV2; set only at AUTO break tip observation
- GET `/wms/smart-matching/history-events` + `/learning-series`; FE decision table + popover
- Removed dead `SmartMatchingHistorySeriesTable`; legacy `/history-series` API kept
- Tests AâU history-events + suites PASS; build/startup/schema OK

## 2026-08-20 â Smart Matching v2 Phase 4 (manual / lock / product UI)

- Product settings SSOT + MANUAL/lock APIs; FE panel replaces localStorage atrapa
- Tests K/L/M PASS

## 2026-08-20 â Smart Matching v2 Phase 3 (strategy resolver)

- `strategy_resolver.py` SSOT; engine wires SmartResult|ThreeDResult (no soft merge primary)
- `evaluate_smart_matching_v2`; legacy_v1_fallback disable; packages[] on ThreeDResult
- Tests RâU/Z PASS

## 2026-08-20 â Smart Matching v2 Phase 2 (break / conflict / shipping)

- override_streak + BROKEN; skip streak when qty > rule.min_qty; competing series â AMBIGUOUS
- Hard CartonâShippingMethod filter on suggest; no soft shipping bonus
- Tests J/N/O/P/Q (+ J2 learning conflict) PASS

## 2026-08-20 â Smart Matching v2 Phase 1 (data model + min_qty)

- Models: ObservationV2, RuleV2 (min_qty/source/status/lock), ProductSettings stub, strategy + legacy_v1 flags
- Package `smart_matching_v2/`: eligibility, learning (MIN qty), breakpoint resolver, observations
- Finish packing writes v2 obs+learn; no new v1 rules; suggest: v2 then legacy v1 if enabled
- Tests AâI/G + legacy cutover PASS; startup OK

## 2026-08-20 â Smart Matching history series redesign

- `created_from_history_id` + `created_threshold` on rule INSERT only; no legacy backfill
- GET `/history-series` projection; FE compact table + popover; merged active rules into series status

## 2026-08-20 â Smart Matching settings cleanup CLOSED (`d128ea59`)

- Accepted: OgÃ³lne + Historia; no Widok/Zaawansowane/fake metrics; dead panel + gate prop gone
- Runtime KEPT (settings, recommended_cartons, history/reset semantics); gate REKOM. separate
- Deferred: SMâgate wiring, real analytics, 3D errors placeholder removal â do not reopen cleanup scope

## 2026-08-20 â Putaway lot identity + remove dead carton toggle

- Lot key / hard-delete: line identity via `dock_lot_keys_for_pz_line` (not live settings / `product.track_*`)
- Deleted `toggle_master_carton_pack`; stopped bulk/API writes of `require_recv_master_carton`
- Regressions AâF; vite build PASS

## 2026-08-20 â PrzyjÄcia â OgÃ³lne: clarify validation settings / remove dead carton flag

- 9 live settings in 3 UI blocks; dropped misleading `require_master_carton` (scan uses product `bulk_ean`)
- Weight completeness `> 0`; carton master-data rules unified; no new hard finish gate
- Effective policy wired for mark_damaged + office accept; GET `require_master_carton=false`, PUT ignores
- Gate tests AâO + FE settings vitest; vite build PASS

## 2026-08-20 â Returns: remove dead transition helpers (post-4dfa5a17)

- Deleted unused API transition helpers + noop `commit_workflow` query/FE plumbing
- Deleted unused `refund_stage_transition_key`; kept `qc_complete` / returns_mode compat
- 138 returns+activity tests PASS; vite build PASS

## 2026-08-19 â Direct Sales enabled rollout (ds_enabled_v1 fail-open)

- Stamp on PUT only; unstamped â enabled_effective=true regardless of stored enabled=false
- Stamped â honor checkbox; expansion gate (qty increase) + completion mode FE
- 102 BE + 7 FE tests PASS; vite build PASS

## 2026-08-18 â Direct Sales OgÃ³lne FINAL GATE: BLOCKED (no commit)

- `enabled` default/missing â false; pre-gate runtime ignored the checkbox â deploy can 403 working sales
- No prod DB access; local sqlite 0 settings rows; STOP per gate rule
- Proposed rollout: stamp `extensions.ds_enabled_v1`; until stamped, fail-open when feature flag ON
- Other gates (SSOT, legacy keys, UI, A/B/C merge, tests, vite build) would PASS; tsc -b FAIL elsewhere (changed files not in error list)

## 2026-08-18 â Direct Sales OgÃ³lne: dead workflow statuses + enable gate + status SSOT

- UI: one status picker, document type, auto new session, enabled checkbox; no workflow block
- Runtime: `apply_order_panel_ui_status` for DS complete; skip production/picking/smart-matching for DIRECT_SALE
- `enabled` gates create/scan/add/search (403); feature flag still 404; existing sessions not deleted
- Legacy `*_order_status_id` keys echoed on save, not in live schema/UI

## 2026-08-18 â WMS Zbieranie â Zaawansowane: drop dead localStorage section

- Removed section + keys: supplierAvailabilityCheck, legacyMode, debugMode, advancedRoutingMode
- No runtime/API/DB change; graph/ATP/CartLifecycle/legacy_assign_forbidden stay SSOT

## 2026-08-18 â Audit: WMS Zbieranie â Zaawansowane (no code)

- 4 checkboxes localStorage-only; no runtime readers; graph/ATP/CartLifecycle unchanged
- Recommend delete entire Zaawansowane section

## 2026-08-18 â Fix: FastAPI 0.141 global routing diagnostics

- Shared `is_route_registered` / `url_path_for` + OpenAPI; removed flat `app.routes.path` and `_WMS_SETTINGS_PATHS` duplicate
- Startup: `route_nodes`, inventory-count via helper; no remount; Returns diagnostic unchanged

## 2026-08-18 â Audit: FastAPI 0.141 global routing diagnostics (no code)

- Same root cause as Returns: top-level `app.routes` is `_IncludedRouter` tree, not flat `APIRoute.path`
- False CRITICAL still printed for WMS settings + production/planning/demand; HTTP/OpenAPI prove mounted
- No runtime remount left; only log-only helpers in `backend/main.py` to fix later

## 2026-08-18 â WMS Automatyzacja: drop dead localStorage section

- Removed section Automatyzacja + keys: autoStartNextOrder, autoOpenScanner, autoMarkPickedLines, autoMoveToPackingStatus, autoPrintTransferLabels
- No runtime/API/DB change; next batch / scan / line close / packing status / print stay on existing SSOT

## 2026-08-18 â WMS Returns routing diagnostic (FastAPI 0.141)

- Replaced flat `app.routes.path` check / REMOUNT / promote with read-only `url_path_for`
- Pin `fastapi>=0.141.0,<0.142.0`; lookup/static/id still mounted once in that order
- No returns business-logic change

## 2026-08-18 â WMS Metody zbierania: remove dead extended-UI cache

- Removed section + localStorage keys: defaultPickingContainerType, requireCartScanStart, requireBasketScanStart, autoSuggestCart, autoSuggestRoute
- No runtime/API/DB change; picking_config modes remain SSOT
- default-cart leftover left as GAP

## 2026-08-17 â WMS Lista zleceÅ: dead cache cleanup + after_batch_complete_action

- Removed dead Lista zleceÅ fields from `WmsPickingExtendedUi` / localStorage / form
- SSOT batches: `picking_config` + `Cart.capacity_*` (not duplicated in Lista zleceÅ)
- `after_batch_complete_action` on picking-terminal (tenant+warehouse); default `back_to_list`
- Finalize: back_to_list â order-type; stay_here â success screen; assign_new_batch â reuse start flow
- Shortages: after-action only after modal OK; recovery still â Braki
- Sort SSOT: `resolve_order_sort_for_flow` (cartless / start_picking / product list)

## 2026-08-17 â WMS Lista zbierania: help + API SSOT for list_display

- Help: `SettingInfoButton` on Widok â Lista zbierania; 6 option hints via shared `hint` â `(i)`
- API/DB is SSOT for 6 `list_display` flags; localStorage no longer seeds, overrides, or POSTs them
- GET fail: checkboxes locked, no automatic POST of stale cache
- Consumer unchanged: list cards only (`PickingProductListCard`); detail/qty panel not wired

## 2026-08-16 â ETAP 2 regression + SALEABLE ATP hardening

- Commits: `82c21dd3` purchasing/picking SALEABLE; `dee4ea27` product_id+OUTLET_B; `23714d28` SERVICE_Câ422; `273811df` Magazyn A|B|C matrix
- Live UAT #143 A1-A-2: A=99 B=1 Razem=100; offers 99/1; outlet order sd=OUTLET_B; SERVICE_C HTTP 422; B on normal locs #46/#340
- Junk UAT orders ~#1280â1285 â cancel manually if needed

## 2026-08-16 â OMS RMZ disassembly = WMS SSOT (no commit)

- Panel `ReturnsReturnDetailPage` embeds ManufacturedRecoveryIntakePanel + BundleReturnLinePanel
- Finalize merges recovery draft; no second disassembly engine
- Component A/B/C per recovery row = GAP (WMS accepted/scrap only)


- P0: planning A-only; picking gate/readiness disposition-aware; warehouse_reserved_qty scoped to pool
- P1: outlet/service available in disposition snapshot; product list A/B/C; location matrix on card
- Legacy on_hand/available kept as physical total; commercial/offers remain A or explicit pool
- Tests: test_etap2_abc_stock_model + related PASS


- Commit+push; Railway healthz/readyz 200; Vercel 200
- Live UAT: RMZ-2026-28 â Z-PZ-2026-3 (#140) per-RMZ; SALEABLE+OUTLET_B; rejected skipped; putaway A1-A-2; no double inv
- Series Zwroty tenant=1: `collective_return_receipt=false`; no global trueâfalse migration
- Tests: 17 PASS mix + migration safety


- ROOT: collective Z-PZ default hid "new" putaway docs after finalize (append to OPEN)
- FIX: collective=false default + migrate Z_PZ series; damage JSON fallback to qty cols; disposition preserved on direct putaway write
- Tests: `test_rmz_mix_z_pz_dispositions` + existing Z-PZ suite PASS
- A/B/C inventory architecture: audit only (no global available rebuild)


- ROOT: preset JSON istniaÅ, ale nie byÅ w `labelPresets` / Ready Templates; UI grupowaÅo `carrier` pod âOperatorâ; istniejÄce szablony w DB z `template_type=location` poprawnie pokazywaÅy Lokalizacja (bez maskowania)
- FIX: `CARRIER_LABEL_HORIZONTAL` z `template_type=carrier`; grupa UI âNoÅnikâ; CSV mapping carrier; etykiety zmiennych PL
- Tests: `labelDesignerCarrierType.test.ts` 6 PASS; BE `test_carrier_label_template` 2 PASS; tsc+build PASS

## 2026-08-16 â Fix QR PDF + transparent fill (label engine)

- ReportLab 4.x: QR via `ImageReader` (`_draw_qr_image_on_canvas`); `qrMargin` quiet zone
- `fill=transparent` no longer paints black over labels; `strokeWidth=0` respected
- Preset carrier 100Ã50 refined (autoFit code, QR 27 mm)
- Tests: `test_label_engine_qr_pdf` (QR/Code128/transparent border)

## 2026-08-16 â Carrier ESP:carrier:{id} + template_type=carrier

- Canonical scan: `ESP:carrier:{id}` (computed); `code`/`barcode` unchanged (legacy PAL-/BOX-/â¦)
- SSOT: `esp_scan_codes` + `find_carrier_by_scan_code` (ESP-first) + FE `classifyWmsScanCode`
- Labels: `template_type=carrier`, bindings `carrier_*` / `barcode_data=scan_code`; print via `POST /labels/carrier` + `CarrierLabelPrintModal`
- Preset: `frontend/src/labelSystem/presets/carrierLabelHorizontal100x50.json`
- No DB migration

## 2026-08-16 â Carrier label template_json (100Ã50)

- Plik: `Downloads/nosnik_label_100x50_kolor_import.json` (eksport `label_templates_â¦41.json` nie zawieraÅ tego szablonu)
- `{loc_name}` font 62â41; QR 33.5â28 mm; usuniÄta czarna ramka QR (`borderColor` #e2e8f0); krÃ³tsze celowniki; panel 40% + separator 1 mm
- Bez zmian importu/renderera

## 2026-08-16 â Paper produce UX (qty form + FG policy)

- FE: `PaperProduceLineCard` â plan/done/remaining, input default=remaining, CTA ZatwierdÅº; +1/+5 secondary
- Shared `productionFgIdentity` (+ RegisterProductionModal reuse); progress single vs multi; finish only allProduced fallback
- BE read-only: `production_trace_require_*` na BAT line / MO serialize (SSOT policy); lifecycle/PW bez zmian
- vitest 16 + Production 83 PASS; tsc/build PASS

## 2026-08-16 â Fix multi-LOT collection discrepancy (bez commit/push)

- `append_collection_location_pick`: `system_qty` + write-down scoped do LOT/expiry/SN
- Partial pick wybranej partii gdy `remaining > system_qty` â brak write-down reszty slice
- API/FE: `expiry_date`; UI LOT picker przy multi-LOT
- Testy AâG PASS; RW split bez zmian; gotowe do re-UAT A

## 2026-08-16 â Koszt produkcji = receipt FIFO (+ product fallback)

- Audyt: RW braÅ katalog `get_product_current_cost`, nie warstwy PZ
- `material_cost_layers.py` + enrich przy consume; freeze `material_cost_json`; ISSUE `unit_price_net`
- UI: rzeczywisty koszt materiaÅÃ³w / szt. + hint fallback; Â§20 TRYB_PRODUKCJI
- Testy AâJ PASS; bez commit/push

## 2026-08-16 â FINAL UAT Produkcja v1 STOP (A)

- STOP: dual-lot pick FAIL â discrepancy w `collection_pick_commit_service.append_collection_location_pick` konsumuje resztÄ suggested bez LOT
- RW split (diag one-shot): PASS â `RW/2026/08/27` 2 linie LOT-A/6 + LOT-B/4
- Scenariusze BâF nie ruszane; PRODUCTION V1 â  PASS E2E

## 2026-08-16 â Â§26 Produkcja v1 backlog (bez commit/push)

- Cleanup UI: lokalizacja docelowa, terminal_required, path zamiennikÃ³w
- RW LOT split PRODUCTÃLOTÃexpiry (MO+BAT); SN poza StockDocumentItem
- Planning: combined = orders+targetâstockâpipeline; realized sales history
- Lista pobrania: CTA + DTE + queue print
- TRYB_PRODUKCJI zaktualizowany; pozostaÅy GAP: peÅny workflow zamiennikÃ³w (poza v1)

## 2026-08-16 â Prognoza: tylko 3 strategie (BE+FE)

- UsuniÄto MEDIAN / MAX_DAILY / AI_SMART z enumÃ³w, rejestru, FE i testÃ³w
- UI: Standardowa / UwzglÄdniaj trend / WedÅug dni tygodnia; bez legacy
- Nieznany klucz w JSON â PERIOD_AVERAGE; lokalne sqlite bez starych wartoÅci
- Commit + push

## 2026-08-16 â Specyfikacja biznesowa TRYB PRODUKCJI (no commit)

- PeÅny audyt moduÅu Produkcja â dokument `docs/production/TRYB_PRODUKCJI.md`
- Forma jak projekt przed wdroÅ¼eniem; klasyfikacja ISTNIEJE / CZÄÅCIOWO / GAP / PLANOWANE
- Bez implementacji / commit / push

## 2026-08-16 â FE: jeden toast auto-pack po produkcji

- Root: `useProductionExecutionJob.registerProductionQty` woÅaÅ `handleProductionPackingHandoff` po progress i po finish
- Fix: `selectPackingHandoffCarrier` (prefer progress); session fingerprint idempotency; bez drugiego toastu bufora przy auto_pack
- Pliki: `handleProductionPackingHandoff.ts`, `useProductionExecutionJob.ts`, testy
- vitest 6 PASS; tsc PASS; npm build PASS; BE bez zmian

## 2026-08-16 â Auto-pack respektuje print_label (no commit)

- UsuniÄto BE inject print_label przy system_auto; handoff nie zawyÅ¼a waybill_print_count z samego istnienia labela
- FE: printLabelEnabled = auto_actions.print_label (jak packing UI); toast tylko z waybill_print_count
- Regresje OFF/ON: pytest 13 PASS; vitest 2 PASS; build PASS
- Live UAT A + BâG: czekajÄ na deploy

## 2026-08-16 â UAT A auto-pack single label (PASS, no code)

- Order #1257 (1271) / MO/2026/0025 / label doc#1; status ProdukcjaâSpakowane; PA/2026/08/1
- Toast auto-pack; no packing UI; activity 1Ã each auto event; idempotent replay
- BâG not started

## 2026-08-16 â Auto-pack po produkcji gdy listy przewozowe istniejÄ (no commit)

- SSOT label: order_shipping_label_service.has_shipping_label (OrderDocument LIST_PRZEWOZOWY + file_url)
- Handoff ORDERS: 	ry_auto_pack_newly_ready_orders â pack-all + packing_finish_order(system_auto, commit=False) all-or-nothing
- Fail-safe = standardowy ekran pakowania; FE toast + 
unPackingPostFinishClientActions bez navigate
- Testy AâI: 	est_production_auto_pack_shipping_labels 11 PASS; FE build PASS

ï»¿## 2026-08-16 â WMS Produkcja: WyglÄd terminala egzekwowany (no commit)

- SSOT `terminal_display` via `useWmsProductionSettings`; shared `productionTerminalDisplay` + `WmsProductionProductIdentity`
- Queue / collect / execute / modal / headers respektujÄ flags; image OFF bez placeholderu
- BE: `product_barcode` + identity na queue/header/MO/BAT (bez migracji DB)
- GAP: `show_target_location` (brak target w collect/execute API); stock FG tylko gdy API ma wartoÅÄ (collect: warehouse_total)
- vitest 8 PASS; `tsc --noEmit` PASS; `npm run build` PASS

## 2026-08-16 â Status wejÅciowy produkcji: zajÄte grayed (jak zbieranie)

- Shared `OrderUiStatusPicker`/`OrderUiStatusField`: prop `disabledStatusIds` (widoczne, wyszarzane)
- Produkcja: `disabledStatusIds` = ÅºrÃ³dÅa innych cfg produkcji + zbierania; wÅasny status przy edycji OK
- Zbieranie: ten sam mechanizm (zamiast ukrywania zajÄtych); eligibility helper bez zmian semantyki walidacji
- Backend: bez zmian logiki (juÅ¼ unikalnoÅÄ `source_status_id`); test kolizji prodâpicking
- Testy: `test_production_config_ssot` 6 passed; vitest eligibility; `npm run build` PASS

## 2026-08-16 â Pomoc kontekstowa (i) w ustawieniach Produkcji (no commit)

- Canonical copy: `productionSettingsHelp.tsx`; UI: `SettingInfoButton` / `hint` na wierszach WMS
- Strategia prognozy + alokacji: dropdown z (i) przy kaÅ¼dej opcji; AI_SMART disabled
- Konfigurator / dokumenty: uzupeÅnione brakujÄce (i); usuniÄty dÅugi opis pod âAutomatyczne przeliczanieâ
- `npm run build` PASS

## 2026-08-16 â Konfiguracja produkcji UX (no commit)

- Lista: Status wejÅciowy | Realizacja; usuniÄto NazwÄ, badge Aktywna, opisy i przeÅÄcznik aktywnoÅci
- Status wejÅciowy edytowalny przez `OrderUiStatusField`; PUT z `source_status_id`
- Labelki flow: WMS / ZmieÅ status / PrzejdÅº do pakowania (enumy bez zmian: `WMS`, `STATUS_ONLY`, `OPEN_PACKING`)
- Backend: `ProductionConfigUpdate.source_status_id` + update service; bez migracji `is_active`
- Testy: `test_production_config_ssot` 5 passed; `npm run build` PASS

## 2026-08-16 â Produkcja Activity Log + WMS audit LOT (no commit)

- Reuse `activity_events` / links / `record_domain_activity` â bez trzeciego systemu logÃ³w
- Nowe eventy `PRODUCTION_*` (create, shortage, output delta, putaway, cancel, Phase 8, â¦)
- Formatter BE `production_activity_format` + enrich path; FE labels + link MO/BAT
- Writers w create/cancel/planning/batch/reservations/material_validation/fg_output/putaway/picking-entry
- WMS: `record_production_rw/pw_*_audit` przekazuje `batch_number` + `expiry_date`
- Testy: `test_production_activity_log` PASS; FG register PASS; `npm run build` PASS

## 2026-08-16 â Partial FG + multi-LOT per delta (no commit)

- Domain: `register_produced_quantity` (`fg_output_register_service`) for BAT lines + MO
- Ledger: `production_fg_outputs`; PW-per-delta for BAT/PLANNING/MANUAL; ORDERS buffer kept
- Traceability: per-delta LOT/SN; `fg_traceability_json` v2 genealogy (no permanent LOT lock)
- Putaway: early delta can be putaway while MO/BAT still producing; complete when plan+all PWs DONE
- FE: removed ORDERS-only partial gate; modal works for all sources
- Tests: `test_production_fg_output_register` + regressions; FE build PASS

## 2026-08-15 â Planowanie: rekomendacja â zlecenie + partia materiaÅy per linia (no commit)

- CTA rekomendacji: âUtwÃ³rz zlecenieâ; backend MO/BAT bez zmian (nadal CreateBatchModal / preview)
- WejÅcie z 1 produktu: focused kreator (bez katalogu), qty + skÅad + âZmieÅ produktâ
- Per-line âMateriaÅy: DostÄpne / Brak Xâ z jednego SSOT `preview.aggregated_components` + BOM structure
- WspÃ³lne komponenty: proporcjonalna atrybucja `missing`; create nadal dozwolone przy brakach
- Testy: `batchLineMaterialStatus`, `createBatchModalEntry`; `npm run build` PASS

## 2026-08-15 â WMS Produkcja: 2 kolejki + rejestracja (no commit)

- FE: tabs collecting/execute only; putaway redirects to `/wms/putaway`
- Execute: `RegisterProductionModal` (default remaining qty); auto-finish when plan met
- GAP closed by 2026-08-16 partial FG / multi-LOT work (above)
- Backend lifecycle untouched in WMS-tab change; tsc + build + traceability tests PASS

## 2026-08-15 â Produkcja: polskie URL + detail/braki UX (no commit)

- FE routes: `/produkcja/...`; legacy `/production/...` redirects; API `/production` unchanged
- Detail actions: Printer / FileText / XCircle; compact Kontynuuj; back ArrowLeft only
- Braki: Zlecenia wymagajÄce materiaÅu; PackagePlus â zamÃ³wienie towaru; UtwÃ³rz zapotrzebowanie
- Layout FULL_PAGE_DETAIL fixed for `/produkcja/serie|receptury`; tsc + build PASS

## 2026-08-15 â Production traceability MVP frontend (no commit)

- Added independent production traceability settings and product-level INHERIT/REQUIRE/OFF overrides.
- Collection terminals consume backend LOT/SN requirement flags; serial picks are quantity 1.
- Active WMS/PAPER production flows send FG batch, expiry, and serial identity payloads.
- Backend unchanged; build and `git diff --check` passed. Repository-wide typecheck remains blocked by pre-existing errors.

## 2026-08-15 â Production qty display â formatProductionQuantity (no commit)

- Frontend-only: stock/qty displays floor via `formatProductionQuantity` (presentation only)
- Local fmtQty/formatQty/toFixed(2) qty helpers delegated; money/forecast/API inputs untouched

## 2026-08-15 â Production create wizard + integer qty (no commit)

- Operator assign: brak API â UI âDowolny operatorâ + SettingInfoButton (bez fake select)
- `formatProductionQuantity` SSOT display; kreator: skÅad live, rekomendacje bez pustych kart
- Backend untouched; tsc + build OK

## 2026-08-15 â Production UX: SettingInfoButton + Do zamÃ³wieÅ (no commit)

- Reuse `SettingInfoButton` (WMS Settings) na Pulpicie i Planowaniu â bez lokalnych tooltipÃ³w
- Karty Pulpitu: ukryte instructional businessLabel dublujÄce CTA
- ORDERS label: `Do zamÃ³wieÅ`; `tsc` + build OK; backend untouched

## 2026-08-15 â Production language/UX polish (frontend only, no commit)

- Enumy w UI â etykiety biznesowe (`Na zamÃ³wienia` / `Na magazyn` / `RÄczne` / `Partia`)
- Receptura: usuniÄte fikcyjne warianty + MarÅ¼a (hint); BOM â âStruktura recepturyâ; ikony akcji Sasist
- Planowanie: polskie parametry, 1 rzÄd CTA, rekomendacje bez alarmowego bloku
- Pulpit: â tooltips sekcji; bez `planned_date` w UI
- `tsc` + `npm run build` OK; backend untouched; bez commit/push

## 2026-08-15 â Production ERP UX rebuild (frontend only)

- Ekrany: Pulpit, Zlecenia (rejestr), Planowanie (compact), Receptury, MateriaÅy/braki, Historia, Analiza kosztÃ³w
- Shared: `ProductionProgressCell`, `ProductionSourceTypeBadge`; dense KPI/queue variants
- Bez backendu / lifecycle / commit / push; fake KPI usuniÄte; 1 primary CTA + `â¦` w wierszach
- Build: `tsc --noEmit` OK, `npm run build` OK

## 2026-08-15 â Produkcja v1 zamkniÄta PASS E2E + follow-upy v1.1

- Lifecycle Produkcji nie ruszaÄ bez osobnego powodu
- Follow-upy (bez implementacji): `memory/production-v1.1-followups.md`
  1. BAT CTA deep-link vs `start-collecting` / `openJob`
  2. BAT completed â copy âMateriaÅy nie sÄ jeszcze zarezerwowaneâ

## 2026-08-15 â UAT BAT control PASS E2E / Produkcja v1 PASS E2E

- BAT/2026/0017: createâreleaseâcollectâRW#98âproduceâPW#99âWMS putawayâcompleted/history
- Bez packing/duplikatÃ³w; bez kodu/commit

## 2026-08-15 â UAT PLANNING auto-replenishment PASS E2E

- Auto ON + coverage 1d + hourly; scheduler â MO/2026/0022 PLANNINGÃ0.03 (75894)
- Idempotencja 2./3. run; RW#96 / PW#97; standard WMS putaway A1-A-1; completed; no packing/BAT
- Bez kodu / commit / push; forecast auto zostaje ON

## 2026-08-15 â UAT PRINT PASS E2E

- MO/2026/0021 ORDERS: preview/start/RWÃ1/reprint/progress/finish/buffer DOCK-IN/Pakowanie/scan/idempotencja
- Config #9 PRINT tylko na czas UAT â restored WMS
- Bez kodu / commit / PLANNING / BAT

## 2026-08-15 â UAT A clean Phase 8 PASS E2E (po 97321395)

- Cleanup leftovers 1266/1267/1269 via status withdraw; fresh #1256/1270 source#22
- DOCK-only PASS; putaway A1-A-1Ã2 â reserved + PRODUCTION_ORDER#82Ã2 + AUTO_RESUMEDÃ1
- Idempotencja PASS; #1255 sklasyfikowany ENV CONTAMINATED (nie FAIL kodu)

## 2026-08-15 â UAT A po 97321395 STOP (KROK 2)

- #1255/1269 + PZ#89: DOCK-only PASS; putawayÃ2 â available=2 vs MO demand 4 (leftover sources #19/#20)
- res PRODUCTION_ORDER #76Ã2 zjadÅa ATP; order nadal BRAKI; brak AUTO_RESUMED
- Bez kodu / commit / PRINT â wynik KROK2 = NOT VALID / ENV CONTAMINATED

## 2026-08-15 â UjednoliÄ dostÄpnoÅÄ materiaÅÃ³w i retry produkcji

- `production_allocatable_qty` SSOT z allocate (DOCK out przy putaway)
- source `reserved` dopiero po sukcesie PRODUCTION_ORDER reservation
- AUTO_RESUMED wymaga `materials_reserved=true`
- Testy DOCKâputaway / foreign hold / idempotencja

## 2026-08-15 â UAT A Phase 8 retest (958fdb19) STOP

- #1253/1267: BRAKI + source#20 reattach/AUTO_RESUMED OK; FAIL `materials_reserved=false` (brak PRODUCTION_ORDER ST-003Ã2)
- Bez PRINT / PLANNING / BAT

## 2026-08-15 â Fix Phase 8 vs gate: BRAKI wins + reattach shortage source

- Gate: po ALL_SHORTAGE nie nadpisuje `status_awaiting` (BRAKI wygrywa)
- `_attach_or_reactivate_source`: reattach shortage z cancelled MO â jeden demand
- Phase 8: leftover shortage â cancelled gdy juÅ¼ active; AUTO_RESUMED message
- Testy: `test_picking_entry_gate_phase8_component_collision.py` (UAT #1266)

## 2026-08-15 â UAT AâF: legacy #1251 / overbook cleanup / fresh started-MO

- #1251 = legacy (nie regresja detacha); allocator SAFE (`shortage` poza fulfillable)
- SO overbook cleanup: release #65 (B3-C-2), #54 (B3-B-3) via reservation service â true overbook=0
- Fresh #1252 + MO/6 po fa704be5: detach SOURCE_DETACHED_STARTED_MO; finish MO â free FG; no double fulfill
- Fazy 1â3 readiness/production fallback = PASS E2E (bez nowego kodu / commit)

## 2026-08-15 â Fix P0/P1 rezerwacje WMS + detach started MO

- P0.1: `exclude_production_order_id` w ATP/consume/pick-plan/collection UI
- P0.2: free capacity (all holds) dla nowej SALES_ORDER; ATP order nadal z exclude
- P1: full external cover na started MO â SourceItem cancelled (bez shrink planned/mats)
- allocate_produced_delta: remaining order demand + skip covered/packed
- MO finish collecting: committed slices (jak BAT)
- Testy: `test_wms_reservation_uat_phase3_fixes.py` + phase1/3/fulfillment/collection

## 2026-08-15 â UAT started MO (partial)

- #1251 + MO/4 `collecting`: external FG putaway â **no shrink** (planned/src/mats locked).
- Order â WÃ³zki (external FG); source shortage remains on started MO.
- Finish MO BLOCKED (ST-003 serial / collection available=0).
- Idempotency: ponowny putaway â MO/source/mats unchanged; excess free @ B3-A-4.
- Note: B3-C-2 qty=1 res=2 (overbook side-effect przy multi awaiting).

## 2026-08-15 â UAT partial shrink 2â1 PASS (#1249)

- Clean case (nie #1248): source shortage req=2, res=0, freeATP=0, awaiting.
- Event: putaway +1 ST-001 DOCKâB3-C-2 â SALES_ORDER #62 qty1; req 2â1; status stays shortage.
- planned MO=5 bez zmian (ACTIVE only; shortage poza planned); DEMAND_REDUCED (activity #505).
- #1248 reclass: FULL COVER RECONCILIATION PASS (nie fail partial).

## 2026-08-15 â UAT Faza 3 podstawowy PASS (#1245)

- Observation-only: MM putaway +1 ST-001 (nie z MO) â auto retry â WÃ³zki â picking multi.
- MO/2026/0004 planned 4â3; SourceItem #1245 cancelled; reservation ST-001 Ã1 (id 43).
- Idempotent re-notify; reservations #1243/#1244 (7+3) nietkniÄte.

## 2026-08-15 â Logi: szczegÃ³Åy blokady produkcyjnej (Faza 2 UAT)

- Root cause: `enrich_activity_item` zostawiaÅ `action` = sam nagÅÃ³wek; FE bez `whitespace-pre-line`
- SSOT: `picking_entry_activity_format.py` â `enrich_activity_item` (Logi + Historia)
- MO demand: minimalne `product_name`/`sku` w metadata; FE pokazuje body INFO w kolumnie efektu
- Testy: `test_picking_entry_activity_format.py`; FE build OK; bez zmian gate/rezerwacji/MO

## 2026-08-14 â Faza 2: aktywny gate produkcji przy wejÅciu do zbierania

- `FEATURE_PICKING_ENTRY_READINESS_MODE=off|dry_run|active`
- Active gate: full-order readiness â SALES_ORDER reserve â MO missing-only â awaiting status
- `status_awaiting_production_id` na ProductionConfig + UI Konfigurator produkcji
- Snapshot `return_picking_status_id` w `import_metadata_json`
- Activity: red BLOCKED + INFO MO demand; correlation_id idempotency
- Cancel/qty: release + withdraw / partial sync
- Testy: `test_picking_entry_gate_phase2.py`

## 2026-08-14 â Faza 1: readiness + most SALES_ORDER â picking

- SSOT ATP: `wms_picking_atp.py` â pickable on_hand â obce rezerwacje (exclude own `order_id`)
- Bridge: `sales_order_fg_reservation_service` (reserve/release/partial/consume, bez TTL)
- `PickingRoutingService` + `validate_orders_for_picking` + FEFO + FIFO consume respektujÄ rezerwacje
- Pick finalize: consume reservation przy decrement inventory (bez double decrement)
- Readiness dry-run: `picking_entry_readiness_service` + flag `FEATURE_PICKING_ENTRY_READINESS_DRY_RUN`
- Hook po wejÅciu na `PickingConfig.source_status` (nie production) â tylko log, bez MO/status
- Testy: `test_picking_entry_readiness_phase1.py` (14 scenariuszy; PG concurrency opcjonalnie)

## 2026-08-14 â Konfigurator produkcji w Ustawieniach WMS

- SSOT: `production_config_query` / `production_config_service` + API `/wms/settings/production-configs`
- Storage nadal `picking_config` (`is_production_mode=True`) â FK MO bez migracji; `name` + `is_active`
- Zbieranie: replace nie kasuje produkcji; UI bez âTryb produkcjiâ
- FE: Ustawienia WMS â Produkcja â Konfigurator produkcji
- Testy: `test_production_config_ssot.py` + zaktualizowane packing/production mode

## 2026-08-14 â FE: Konfigurator produkcji WMS

- `frontend/src/api/wmsProductionConfigApi.ts` â list/create/update/disable/delete
- `frontend/src/modules/wmsSettings/production/` â panel + modal (reuse PickingSettingsModal)
- `WmsProductionSettingsPanel` â sekcja âKonfigurator produkcjiâ pierwsza; przeorganizowana nawigacja
- `WmsPickingSettingsPanel` â usuniÄto tryb produkcji; filtrowanie `is_production_mode` przy mapowaniu API
- FE build OK

## 2026-08-14 â Ujednolicona historia produkcji i zwrotÃ³w (Activity Log)

- Helper `record_domain_activity` (1 event + linki order/return/product/document/production)
- Idempotencja `correlation_id`; actor z requestu / SYSTEM
- Zwroty: CREATEâ¦FINALIZED; Produkcja milestones RELEASEDâ¦COMPLETED
- FE: RMZ Dziennik â Activity Log; MO detail timeline
- Testy: `test_domain_activity_returns_production.py` + returns suite; FE build OK

## 2026-08-14 â FIX: Z-PZ dla STOCK bundle DISASSEMBLE (FG=0)

- Root cause: `_any_planned_lines` nie uwzglÄdniaÅo accepted `ReturnLineBundleComponent` â `ensure` zwracaÅ None
- Finalize / commit-wms / refund zamykaÅy RMZ mimo braku wymaganego Z-PZ
- Fix: `line_has_pending_bundle_component_receipt` w gate; `ensure_required_rmz_return_receipt_document` + assert pozycji
- Refund: receipt przed transition success
- Testy: `test_stock_bundle_disassemble_z_pz.py` AâE; returns 125 passed

## 2026-08-14 â STOCK bundle disassemble on return

- Tree: `can_stock_disassemble` + `snapshot_components` (OrderLineBundleComponent SSOT)
- Intake FG | DISASSEMBLE | MIXED on existing RMZ columns; Z-PZ via existing `append_accepted_component_lines`
- Legacy parent qty=0: `physical_bundle_qty_for_parent` for RMZ create/add
- Mfg must not clear bundle intake columns; precedence unchanged
- FE: BundleReturnLinePanel intake choice
- Tests: `test_stock_bundle_disassemble_return.py`; returns 77 passed; FE build OK

## 2026-08-14 â WspÃ³lna emisja Z-PZ dla odzysku komponentÃ³w (bundle + mfg)

- Kontrakt `ComponentReturnRecoveryLine` + `component_return_recovery_service`
- Adaptery bundle / manufacturing â wspÃ³lne `append_accepted_component_lines`
- Precedencja bundle bez zmian; modele/refund/API bez migracji
- Testy: returns suite 104 passed

## 2026-08-14 â DomkniÄcie P1 produkcji (przeglÄd)

- KPI Pulpit `batches_with_shortages` â SSOT `count_jobs_with_material_shortages` (ta sama kolejka co MateriaÅyâBraki); label âZlecenia z brakamiâ
- Etap vs flaga: delayed nie nadpisuje etapu (âPrzekaÅ¼ do realizacjiâ + `isDelayed`); Zlecenia przekazujÄ `plannedDate`
- Planowanie: expand rozrÃ³Å¼nia order_demand (brutto) vs order_production_needed + linia wyliczenia z silnika
- MateriaÅy: wÄÅ¼sza tabela (reszta w expand); Pulpit: kompaktowa pusta âDo wykonaniaâ, see-all tylko przy overflow
- Testy: BE shortages 5; FE production P1 + operational 38; npm build OK

## 2026-08-13 â Fix: bom_preview name/sku w RMZ (odzysk komponentÃ³w KROK 3)

- `_rmz_line_to_read` przekazuje `component_name` / `component_sku` z `bom_preview_for_product` (wczeÅniej drop)
- FE: nazwa + SKU meta; fallback âKomponent #IDâ tylko awaryjnie
- Test: `test_bom_preview_includes_component_name_and_sku`; returns 53 passed

## 2026-08-13 â FE+API wiring: manufactured component recovery

- API serialize + split/finalize apply; bundle precedence; return-level recovery mode
- Settings panel âProdukty produkowaneâ; WmsReturns intake panel + payload
- Tests returns/ 52 passed

## 2026-08-13 â Backend: odzysk komponentÃ³w z FG przy zwrocie (Z-PZ)

- Settings: `manufactured_component_recovery_mode` / `manufactured_recovery_receipt_mode` / `manufactured_recovery_location_id`
- RMZLine: `stock_intake_mode`, `fg_intake_qty`, `disassembly_qty` + tabela `rmz_line_component_recoveries`
- Service `manufactured_component_recovery_service` + wiring Z-PZ (`rmz_return_receipt_service`); scrap = audit only
- API: returns-mode PUT + line read/split-process/finalize payload
- Testy: `backend/tests/returns/test_manufactured_component_recovery.py` (24 passed)

## 2026-08-13 â Fix: completed MO ORDERS nie wiszÄ jako âGotowe do pakowaniaâ

- Root cause: FE traktowaÅ `completed` + `source_fulfilled_order_count>0` jako READY_TO_PACK (fulfilled = FG, nie packing)
- BE: `source_awaiting_packing_order_count` w serialize MO; helper `order_awaits_packing_after_orders_production` (DONE/Spakowane/SHIPPED/PACKED â false)
- FE: operational state + aktywna lista + CTA packing tylko przy awaiting > 0
- Testy AâD w `productionOperationalState.test.ts` + `test_orders_mo_awaiting_packing_projection.py`; FE build OK

## 2026-08-13 â Fix: FOR UPDATE + joinedload blokuje MO ORDERS (UAT #1092)

- Root cause: `_find_aggregable_mo` / withdraw / `_find_aggregable_planning_mo` â `joinedload` + `with_for_update` â PG `FeatureNotSupported` (LEFT OUTER JOIN)
- Fix: SELECT MO z `FOR UPDATE` bez eager join; `line_snapshots` / `order_sources` przez `selectinload` po locku
- Soft-fail savepoint zostawiaÅ status Produkcja bez MO â po deploy re-entry NoweâProdukcja lub ponowny trigger na #1092
- Testy: `test_find_aggregable_mo_for_update_without_outer_join`, `test_uat_qty1_status_production_creates_exactly_one_orders_mo`; 69 passed (trigger + material + sources + replenishment)

## 2026-08-13 â Fix UAT3: production status hook savepoint + orphan shipping FK

- Root cause PATCH ui-status 500: NO_BOM â shortage status UPDATE hit orphan `orders.shipping_method_id` FK â session PendingRollbackError (hook bez savepoint)
- Soft-fail: `_run_production_status_hook` = `begin_nested` jak smart-matching; trigger re-raise po logu (savepoint rollback)
- Sanitize orphan shipping FK przed mutacjÄ statusu + przed move-to-shortage; `_log_order` nie czyta expired attrs po flush fail
- Testy: IntegrityError w hooku nie truuje commit; NO_BOM â shortage bez 500; sanitize orphan
- UAT #1158: `shipping_method_id` juÅ¼ NULL (label DHL); produkt 350 **bez** aktywnego manufacturing BOM â osobny blocker UAT

## 2026-08-13 â Fix: martwy âZobacz szczegÃ³Åyâ na zakoÅczonym BAT/MO

- Przyczyna: na detailu completed CTA `view_details` wskazywaÅo ten sam URL â Link noop
- Fix: `isOnEntityDetailPage` (pathname === detail href) â `primaryAction.kind=none`; poza detailem href BAT vs MO poprawny
- ORDERS READY_TO_PACK bez zmian; testy `productionOperationalState.test.ts` (22)

## 2026-08-13 â ProductionBatch: jedno PW dla caÅej partii (multi-FG)

- Root cause: `create_batch_pw_documents_for_putaway` tworzyÅ osobny PW w pÄtli po produktach koÅcowych
- Fix: jeden nagÅÃ³wek PW (`production_batch_id`) + N pozycji; wszystkie `ProductionBatchLine.pw_stock_document_id` â ten sam dokument
- Idempotencja: ponowne wywoÅanie nie tworzy drugiego PW / nie duplikuje pozycji; legacy multi-PW bez migracji
- Putaway standardowy (per pozycja); BAT `completed` dopiero gdy PW DONE
- FE: Dokumenty deduplikujÄ PW; âDo rozlokowania pozostaÅo N produktÃ³wâ liczy produkty
- Testy: `test_production_batch_single_pw.py` (1 PW, 2 linie, partial putaway, idempotencja)

## 2026-08-13 â WMS collection multi-location + discrepancy

- Pobranie per lokalizacja (`pick_events`); `collected_qty` = suma; GOTOWE dopiero przy sumie â¥ required
- IloÅÄ edytowalna: default min(remaining, stan lokalizacji); discrepancy = suggested â confirmed (+ write-down ghost stock)
- Brak pokrycia remaining â `pending_shortage` + modal WMS (inna lokalizacja / zgÅoÅ brak / wrÃ³Ä)
- finish-collecting: RW z sumy lokalizacji / slices; brak double-consume
- Testy: `test_production_collection_multi_location.py` AâE + report shortage

## 2026-08-13 â Fix: WMS collection confirm commits stock; finish-collecting no re-pick

- Root cause: confirm only wrote `collection_state_json`; finish re-validated/consumed against live inventory â 409 âwymagane 28 / dostÄpne 24â after UI GOTOWE
- WMS confirm â `collection_pick_commit_service` consumes inventory + stores `picked_slices`; finish posts RW from slices (no second consume)
- Legacy JSON-only GOTOWE healed on GET collection (not shown as done); ERP paper path unchanged (reserve + consume on finish)
- FE: production mutation 4xx â WmsMessageModal (not toast); toast kept for successes
- Tests: `test_production_batch_finish_collecting_multi_fg.py` (committed pick + inventory drift; reject insufficient on confirm)

## 2026-08-13 â UAT Produkcja: ryzyka A/C/D (lista packing, braki, release copy)

- Lista: completed ORDERS z fulfilled > 0 zostaje jako READY_TO_PACK; MANUAL/PLANNING completed ukryte
- Braki: `shortageHintFromOrderLines` â âBrakuje N szt. â Nazwa + M kolejnychâ (lines API, bez nowego BE)
- Planned: przed release âPrzekaÅ¼ do realizacjiâ / po release âPobierz komponentyâ; collecting bez zmian
- E zweryfikowane (bez fix): brak FK BATâMO; UI merge dashboard batches + list MO moÅ¼e pokazaÄ obie niezaleÅ¼ne encje
- Testy: `productionOperationalState.test.ts` (18); FE build OK

## 2026-08-13 â UX pass Produkcja: jedna gÅÃ³wna akcja âCo dalej?â

- SSOT `productionNextAction.ts`: status â komunikat + jedno CTA; druk/anuluj/papier w menu ââ¦â
- Pulpit: âWymaga Twojej uwagiâ + âProdukcja w tokuâ na gÃ³rze; KPI/aktywnoÅÄ niÅ¼ej
- Lista/detail MO + batch: bez konkurujÄcych âWydaj do WMSâ / âRozpocznij produkcjÄâ
- Nawigacja: MateriaÅy = Braki | Rezerwacje | Analiza (`/production/materials/*` + redirecty)
- JÄzyk: Na zamÃ³wienia / Na magazyn / Terminal WMS; timeline z Wykonane / Aktualny / NastÄpny
- Testy: `productionNextAction.test.ts`; FE build OK

## 2026-08-13 â Faza 9: realne automatyczne uzupeÅnianie zapasu

- WspÃ³lna pÄtla `operational_workers_loop` (daemon thread w procesie Railway) + worker produkcji
- `stock_replenishment_interval` + `last_replenishment_run_at` w `production_forecast_json`
- Job â `run_production_stock_replenishment` (ORDERS retry/soft-hold przed PLANNING); unique index PLANNING
- UI: kafelki przeliczania; info na planowaniu; testy `test_auto_stock_replenishment.py`

## 2026-08-13 â Faza 8: automatyczne wznawianie shortage po dostÄpnoÅci komponentÃ³w

- `availability_retry_service.on_component_availability_increased` + wspÃ³lny `retry_order_driven_production_shortages(component_product_ids=â¦)`
- Eventy: release reservation (coalesce), PZ dock ATP, putaway, korekta +, cancel MO (po `cancelled`, bez pÄtli ALL_SHORTAGE)
- Kandydaci przez BOM snapshot; partial/priority bez nowego sortu; status przez SSOT `apply_order_panel_ui_status`
- Testy: `test_production_shortage_availability_retry.py`

## 2026-08-13 â Pipeline free-stock + fulfilled re-entry + soft-hold

- `pipeline_service`: order-driven vs free-stock; `stock_replenishment_needed` uÅ¼ywa tylko free-stock pipeline
- Trigger: `RESULT_ALREADY_FULFILLED`; outstanding = qty â sum(fulfilled); cancelled/shortage bez regresji
- Soft-hold: `component_soft_hold_qty(need â reserved)`; PLANNING nie zjada hold mapy

## 2026-08-13 â Krytyczne regresje UX produkcji (audyt B.1/B.2/C.1)

- Terminal: `formatProductionMutationError` + `withMutationLock` (ref); catch na progress/finish collecting/finish
- ORDERS finish: `ordersMoSkipsPutaway(source_type)` â toast bufora, bez `/putaway`
- API: `source_reserved_quantity_total` / `source_shortage_quantity_total`; UI nie miesza count zamÃ³wieÅ ze sztukami

## 2026-08-12 â UX produkcji i planowania

- Lista MO: ÅºrÃ³dÅo / WMS|Wydruk / gotowoÅÄ materiaÅÃ³w / progress X/Y; bez enumÃ³w ORDERS/PLANNING
- Detail MO: sekcje Produkt, Komponenty, ZamÃ³wienia, Dokumenty, Historia; PRINT âProdukcja rozpoczÄtaâ
- Planowanie: Stan/SprzedaÅ¼/Cel/pipeline; Przelicz zapotrzebowanie vs UtwÃ³rz zlecenia; coverage kafelki
- Konfigurator zbierania: sekcja Tryb produkcji + (i) + walidacja bufora; terminal tabs Pobierz komponenty

## 2026-08-12 â Nadprodukcja / uzupeÅnianie zapasu (faza 7)

- Ustawienia: `auto_stock_replenishment` + `stock_replenishment_coverage_days` â {1,3,7,14} w `production_forecast_json`
- `run_production_stock_replenishment` â MO `source_type=PLANNING` (agregacja draft/planned; bez FG buffer ORDERS)
- ORDERS materials first (rezerwacje + soft-hold); min/max stock respektowane; UI badge ZamÃ³wienia / UzupeÅnienie
- Endpoint `POST /production/planning/stock-replenishment/run`; testy `test_stock_replenishment.py`

## 2026-08-12 â Produkcja â pakowanie (faza 6)

- fter_production_action STATUS_ONLY|OPEN_PACKING; walidacja status_after (unikalnoÅÄ, â  source/picking)
- Fulfill: READY_TO_PACK + CARTLESS; packing_handoff w progress; FE toast/auto-open; badge Z produkcji
- Pack finish: zuÅ¼ycie stocku bufora; bez nowego moduÅu pakowania / kuriera
## 2026-08-12 Ã¢â¬â Realizacja produkcji przez wydruk zlecenia (faza 5)

- `picking_config.production_execution_method` WMS|PRINT (per status produkcyjny)
- Preview PDF bez skutkÄÅw magazynowych; `start-print-execution` Ã¢â â lock + RW (idempotent)
- PDF: alokacje lokalizacji, zamÄÅwienia Ä¹ÅrÄÅdÄ¹âowe + pÄ¹âomieÄ¹â, kod MO; resolve-scan + skaner terminala
- UI: badge Wydruk / Terminal WMS; PodglÃâ¦d vs Wydrukuj i rozpocznij + modal RW

## 2026-08-12 Ã¢â¬â Produkcja z buforem i pakowaniem (faza 4)

- Progress: alokacja sztuk do source (priority) + status_after przez SSOT; ORDERS PW na lokalizacjÃâ¢ buforowÃâ¦ (putaway DONE)
- Finish ORDERS Ã¢â â `completed` bez kolejki Rozlokowanie; packing widzi stock bufora + production fulfilled qty
- UI detail/lista: wyprodukowano / gotowe / oczekujÃâ¦ce / braki

## 2026-08-12 Ã¢â¬â Rezerwacje i braki w produkcji z zamÄÅwieÄ¹â (faza 3)

- Walidacja materiaÄ¹âowa po attach: `analyze_composition_quantity` Ã¢â â max producible + podziaÄ¹â source (priority/oldest)
- Rezerwacje przez istniejÃâ¦cy `create_production_order_reservations`; shortage Ã¢â â status brakÄÅw
- `retry_order_driven_production_shortages`; UI counts reserved/shortage w detail MO
- Bez statusu po produkcji / PW bufora / pakowania (kolejna faza)

## 2026-08-12 Ã¢â¬â Automatyczne zlecenia produkcji z zamÄÅwieÄ¹â (faza 2)

- Trigger SSOT po zmianie statusu panelu Ã¢â â create/aggregate MO `ORDERS` (idempotent source items)
- Agregacja tylko `draft`/`planned` + ta sama composition i `picking_config_id`; wycofanie przed startem
- Partial unique indexes + advisory lock; testy `test_production_order_trigger.py`
- Bez rezerwacji materiaÄ¹âÄÅw / statusu po produkcji (faza 3)

## 2026-08-12 Ã¢â¬â Fundament produkcji z zamÄÅwieÄ¹â (faza 1)

- `ProductionOrder.source_type` (MANUAL|PLANNING|ORDERS) + tabela `production_order_source_items`
- Konfigurator zbierania: `is_production_mode` + statusy po produkcji / brakach + lokalizacja buforowa
- Helper aktywnej composition manufacturing; UI badge Ã¢â¬Å¾Z zamÄÅwieÄ¹âÃ¢â¬Å¥ + sekcja Ä¹ÅrÄÅdeÄ¹â w detail MO
- Bez auto-MO, bez zmian lifecycle RW/PW/collecting

## 2026-08-11 Ã¢â¬â Walidacja zbierania (skany / lokalizacje / EAN)

- UI: Terminal Ã¢â â Ã¢â¬Å¾Walidacja zbieraniaÃ¢â¬Å¥; Ã¢â¬Å¾Produkty bez kodu EANÃ¢â¬Å¥ + tooltips
- WspÄÅlny resolver FE/BE; `location_scan_confirmed` + `allow_products_without_ean`
- Egzekwowanie na quick-pick / cartless / confirm-remaining; rezerwa bez auto-poboru

## 2026-08-11 Ã¢â¬â Widok listy zbierania (ustawienia Ã¢â â kafelki)

- `list_display_json` na `wms_picking_terminal_settings` + API `list_display`
- Lista produktÄÅw czyta flagi i ukrywa zdjÃâ¢cie/EAN/SKU/nr kat./stan/lokalizacjÃâ¢
- Copy Ustawienia WMS Ã¢â â Zbieranie Ã¢â â Widok: Ã¢â¬Å¾Lista zbieraniaÃ¢â¬Å¥ bez zbÃâ¢dnych opisÄÅw

## 2026-08-11 Ã¢â¬â Konfiguracja Ã¢â¬Å¾Wszystkie zamÄÅwieniaÃ¢â¬Å¥ w zbieraniu

- Osobne `all_mode` / `all_order_sort` / `max_all_orders` (nullable; runtime default bez kopii single/multi)
- UI: trzeci blok + kolumna Ã¢â¬Å¾WszystkieÃ¢â¬Å¥; metody = intersection (bulk/scanned/baskets)
- Flow: wybÄÅr `all` uÄ¹Ä½ywa wyÄ¹âÃâ¦cznie configu `all` (cart + sort)

## 2026-08-11 Ã¢â¬â Ekran iloÄ¹âºci zbierania 1:1 (belka + bez ILOÄ¹Å¡Ãâ )

- `PickingQtyPanel`: [Ã¢â Â]+belka lokalizacji (h-10), zdjÃâ¢cieÃ¢â ânazwaÃ¢â âEANÃ¢â âÃ¢Ââ/+Ã¢â âZatwierdÄ¹Å
- UsuniÃâ¢ty label Ã¢â¬Å¾ILOÄ¹Å¡Ãâ Ã¢â¬Å¥; EAN bez prefiksu Ã¢â¬Å¾EAN:Ã¢â¬Å¥; lokalizacja tylko w belce
- Label lokalizacji: `manualLocId ?? activeLocationId ??` single-loc auto

## 2026-08-11 Ã¢â¬â Napraw Ä¹âadowanie fontu Inter

- UsuniÃâ¢ty `@import` Google Fonts z `index.css` (404 na fonts.gstatic.com/*.woff2)
- Inter 400/500/600/700 z `@fontsource/inter` (self-hosted w bundle)
- `font-family: Inter` + Tailwind `sans` bez zmian rozmiarÄÅw WMS

## 2026-08-11 Ã¢â¬â Lokalizacja Ä¹ÅrÄÅdÄ¹âowa w widoku iloÄ¹âºci zbierania

- Tylko `PickingQtyPanel`: belka `[Ã¢â Â] [lokalizacja]` u gÄÅry (peÄ¹âna szerokoÄ¹âºÃâ¡)
- Label z `manualLocId ?? activeLocationId` (kontekst pobrania), nie `locations[0]`
- Lokalizacja nie w kafelku produktu; Ã¢â Â wraca do detail bez anulowania sesji

## 2026-08-11 Ã¢â¬â PrzywrÄÅÃâ¡ wybÄÅr rodzaju zamÄÅwieÄ¹â przed zbieraniem

- Nowa tura zawsze: status Ã¢â â order-type Ã¢â â (cart) Ã¢â â products
- UsuniÃâ¢te pomijanie order-type przez cartId / require_cart / domyÄ¹âºlne `all`
- Wznowienie tylko z jawnym order_type + cart/cartless
- Karty: Ã¢â¬Å¾Produkty do zebraniaÃ¢â¬Å¥ / Ã¢â¬Å¾Produkty: zebrano X / YÃ¢â¬Å¥

## 2026-08-11 Ã¢â¬â Napraw flow szczegÄÅÄ¹âÄÅw produktu i autoryzacjÃâ¢ zbierania

- UsuniÃâ¢ty auto-open qty (regresja z 97b1271f); detail obowiÃâ¦zkowy
- PrzywrÄÅcone: Zebrane, lokalizacja na kafelku, sekcja ZamÄÅwienia + BRAK badge
- Qty Ã¢â Â wraca do detail; skan produktu/lokalizacji Ã¢â â qty (nie auto-confirm)
- 401: shared axios paths; POST picking-terminal z auth; bez maskowania bÄ¹âÃâ¢dÄÅw auth

## 2026-08-11 Ã¢â¬â KolejnoÄ¹âºÃâ¡ dostaw: CTA z rzeczywistego workflow PZ

- Membership przez `derive_warehouse_workflow_status` (P2.5A), nie Ã¢â¬Å¾Ã¢â°Â  CLOSEDÃ¢â¬Å¥
- W kolejce: NEW, COUNTING, COUNTED, PUTAWAY_IN_PROGRESS
- Poza: PUTAWAY_COMPLETED, CLOSED (+ cancelled)
- CTA: Rozpocznij/Kontynuuj przyjÃâ¢cie | Rozpocznij/Kontynuuj rozlokowanie
- Sort tylko `delivery_queue_sort` (+ created_at); priority niezaleÄ¹Ä½ny od statusu/sortu

## 2026-08-11 Ã¢â¬â KolejnoÄ¹âºÃâ¡ dostaw: kolejka z otwartych PZ (nie Supply Flow)

- Root: ekran czytaÄ¹â `supply-flow/plan` / InboundDelivery; PZ NOWE nie byÄ¹ây Ä¹ÅrÄÅdÄ¹âem kolejki
- Nowy SSOT: `GET /wms/delivery-work-queue` z PZ wymagajÃâ¦cych przyjÃâ¢cia/rozlokowania
- Persystencja: `stock_documents.delivery_queue_sort` + `delivery_queue_priority`
- FE KolejnoscDostawPage: lista PZ, priorytet, Ã¢â âÃ¢â â kolejnoÄ¹âºÃâ¡, CTA do receiving/putaway

## 2026-08-11 Ã¢â¬â Hierarchia lista vs produkt (lokalizacja + Ã¢â Â)

- Lista: lokalizacja tylko w kafelku (compact, prawy gÄÅrny rÄÅg) Ã¢â¬â nie belka/nagÄ¹âÄÅwek
- Produkt/liczenie: lokalizacja tylko jako belka obok Ã¢â Â (`variant="bar"`)
- `PackingLocationPill.fullWidth` Ã¢â¬â lista bez `w-full` (nie rozciÃâ¦ga badgeÃ¢â¬â¢a jak belka)
- Ã¢â Â z produktu/qty Ã¢â â zawsze lista produktÄÅw (z zachowaniem cartId)

## 2026-08-11 Ã¢â¬â Flow zbierania 1:1 (status Ã¢â â rodzaj Ã¢â â popup wÄÅzka Ã¢â â lista Ã¢â â produkt)

- Status (UI bez zmian): klik bez sesji Ã¢â â zawsze order-type (nie skan na statusach)
- Order-type: kafelki Ã¢â¬Å¾Liczba produktÄÅw zebranychÃ¢â¬Å¥ + `0/8`; po kliku Ã¢â â cart lub produkty
- Cart: modal Ã¢â¬Å¾Zeskanuj wÄÅzekÃ¢â¬Â¦Ã¢â¬Å¥; wolny wÄÅzek startuje sesjÃâ¢ (backend-first, bez faÄ¹âszywego ACTIVE)
- Lista: `Ã¢â Â Do zebrania: X/Y`; EAN badge; lokalizacja; Zebrano/BRAK
- Produkt: belka lokalizacji + qty panel `[-][n][+]` + ZatwierdÄ¹Å; auto-open gdy 1 loc

## 2026-08-11 Ã¢â¬â UX statusÄÅw + naprawa 409 skanu wolnego wÄÅzka

- Root: orphan ASSIGNED bez sesji Ã¢â â resolve-cart 409 + FE snapshot Ã¢â¬Å¾masz sesjÃâ¢Ã¢â¬Å¥
- BE heal orphan; active-session tylko przy otwartej sesji; resolve-cart code ACTIVE_PICKING_SESSION
- FE: skan backend-first; clearPickingCart bez sesji; empty state + hierarchia kart

## 2026-08-10 Ã¢â¬â SpÄÅjny przepÄ¹âyw zbierania (status Ã¢â â sesja Ã¢â â produkty Ã¢â â cancel)

- UsuniÃâ¢ty in-card CTA i czerwony banner; centralny prompt + skaner SSOT
- Skan wÄ¹âasnego wÄÅzka otwiera/kontynuuje sesjÃâ¢ (bez Ã¢â¬Å¾masz juÄ¹Ä½Ã¢â¬Â¦Ã¢â¬Å¥, bez resolve-cart)
- BE: brak fallbacku sesji na obcy typ kafelka; FE merge active-session po typie
- Cancel: cart Ã¢â â cancel-session; products/detail cichy skan wÄ¹âasnego wÄÅzka
- Meta: badge wÄÅzka + Do zebrania; tile bez przycisku skanu

## 2026-08-10 Ã¢â¬â Prezentacja Ã¢â¬Å¾Zeskanuj wÄÅzekÃ¢â¬Å¥ na statusach

- UsuniÃâ¢ty czerwony banner peÄ¹ânej szerokoÄ¹âºci
- Po wyborze statusu wymagajÃâ¦cego wÄÅzka: wyÄ¹âºrodkowany lekki komunikat + przycisk (BULK vs BASKETS)
- Karty statusÄÅw bez CTA skanu; logika assign/scan bez zmian

## 2026-08-10 Ã¢â¬â UporzÃâ¦dkuj obsÄ¹âugÃâ¢ aktywnych sesji zbierania

- Skan wÄ¹âasnego wÄÅzka na liÄ¹âºcie statusÄÅw Ã¢â â otwiera sesjÃâ¢ (products), nie toast
- Progres produktÄÅw tylko na karcie z mojÃâ¦ sesjÃâ¦; CTA ukryte przy globalnej sesji wÄÅzkowej
- Nazwa statusu 19px/bold; BE active-session + products_picked/total

## 2026-08-10 Ã¢â¬â Napraw sesje i skanowanie wÄÅzkÄÅw w zbieraniu

- Statusy: always-on scan handler; active-session SSOT; CTA niemoÄ¹Ä½liwe przy aktywnej sesji
- Products: CART-* zawsze consumed (bez resolve-cart / consumed=false)
- BE: fallback bind sesji gdy source_status_id meta nie pasuje do kafelkÄÅw

## 2026-08-10 Ã¢â¬â Napraw obsÄ¹âugÃâ¢ aktywnego wÄÅzka w zbieraniu

- FE statusy: brak fallbacku skanu na obcy `expected_cart_type`; CTA tylko bez aktywnej sesji
- BE: SSOT `wms_picking_active_session` + pole `has_operator_active_session` / `session_source_status_id`
- Sesja przypisana tylko do swojego `source_status_id` Ã¢â¬â nie doklejaj wÄÅzka do innych kafelkÄÅw
- resolve-cart odrzuca skan gdy wÄÅzek juÄ¹Ä½ w sesji operatora; mixed modes Ã¢â â BULK

## 2026-08-10 Ã¢â¬â Napraw spÄÅjnoÄ¹âºÃâ¡ sesji zbierania

- Root cause: sesja wÄÅzkowa ma `picking_session_id` + `cart_id`; FE traktowaÄ¹â to jak cartless
- Fix FE: `isCartlessPickingSession` / merge; cancel po cart_id; skan wÄÅzka na products = consumed ignore
- Fix BE: product-lines remap sessionÃ¢â âcart; cancel-cartlessÃ¢â âcancel_picking; tile mixedÃ¢â âBULK
- Projekcja Ä¹âºcisÄ¹âa po `source_status_id` z meta sesji

## 2026-08-10 Ã¢â¬â UspÄÅjnij wznowienie sesji zbierania

- Skan wÄÅzka = tylko start nowej sesji; aktywna sesja Ã¢â â od razu lista produktÄÅw
- BE: nie waliduj typu wÄÅzka przy PICKING / ASSIGNED z otwartÃâ¦ sesjÃâ¦ (Ä¹ÅrÄÅdÄ¹âo Ã¢â¬Å¾NiewÄ¹âaÄ¹âºciwy wÄÅzekÃ¢â¬Å¥)
- FE: `resolveAfterStatusWithConfig` resume by `cartId`; cart-scan redirect; brak confirm-scan
- Status: CTA skanu tylko bez `active_cart_id`; po skanie start Ã¢â â navigate products

## 2026-08-10 Ã¢â¬â UspÄÅjnij sesjÃâ¢ zbierania i przypisanie wÄÅzka

- BE: `wms_picking_session_projection` Ã¢â¬â produkty sesji jak na liÄ¹âºcie produktÄÅw (nie wolna kolejka)
- API statusÄÅw: `session_products_picked/total`, `active_session_id`; hub order-type session-aware
- FE: karta statusu pokazuje produkty sesji; CTA skanu tylko bez aktywnej sesji/wÄÅzka
- Skan: Ã¢â¬Å¾PotwierdÄ¹Å przypisany wÄÅzekÃ¢â¬Å¥ gdy sesja zna cartId; odrzut innego wÄÅzka z PL msg
- Produkty: brak default-cart gdy tryb wymaga skanu; subtitle `WÄÅzek: Ã¢â¬Â¦`
- Anulowanie: bez nowego silnika Ã¢â¬â `cancel_picking` + rollback Inventory lokalizacji

## 2026-08-10 Ã¢â¬â Badge uÄ¹Ä½ywanego wÄÅzka na statusach zbierania

- Kafelki z trybem skanu / koszykÄÅw: `WÄÅzek: {nazwa|kod}` gdy operator ma przypisany wÄÅzek
- API: `active_cart_code` / `active_cart_name` na `GET /wms/picking/configured-statuses`
- FE: fallback do snapshotu skanu; bez pustego badge

## 2026-07-24 Ã¢â¬â 5 poziomÄÅw wielkoÄ¹âºci czcionki WMS (OgÄÅlne)

- Dozwolone: 12 / 14 / 16 / 18 / 20 px; domyÄ¹âºlna 16 (byÄ¹âo 16|18|21, domyÄ¹âºlna 18)
- BE + FE + panel Ã¢â¬Å¾PrzywrÄÅÃâ¡ domyÄ¹âºlneÃ¢â¬Å¥; nieprawidÄ¹âowe (np. 21) Ã¢â â normalizacja do 16
- Bez nowego systemu ustawieÄ¹â Ã¢â¬â ten sam SSOT `wms_general_settings`

## 2026-08-10 Ã¢â¬â Zbieranie: czysty biaÄ¹ây UI (Sellasist layout, Sasist badges)

- Lista/detal: minimalistyczne karty, `Do zebrania: X/Y`, sticky Ã¢â¬Å¾ZebraneÃ¢â¬Å¥ + menu Ã¢â¹Â® (Opcje)
- Badge lokalizacji = istniejÃâ¦cy `PackingLocationPill` (Sasist)
- Order-type + cart-scan uproszczone wizualnie; logika skanu/finalize bez zmian
- Kit UI: `frontend/src/components/wms/picking/Picking*`

## 2026-08-10 Ã¢â¬â Ustawienia WMS Ã¢â¬Å¾OgÄÅlneÃ¢â¬Å¥: wielkoÄ¹âºÃâ¡ czcionki

- Nowa zakÄ¹âadka Ã¢â¬Å¾OgÄÅlneÃ¢â¬Å¥ (wspÄÅÄ¹âdzielone ustawienia trybÄÅw)
- Trzy selecty 16/18/21 px: bazowa, lokalizacja, iloÄ¹âºÃâ¡ (domyÄ¹âºlnie 18)
- Persist: `wms_general_settings` + `/wms/settings/general`
- Operator shell: CSS vars `--wms-font-*`; packing/picking nowe widoki przez `wmsTypoClass`
- Bez osobnych ustawieÄ¹â mobile i bez auto-zmniejszania czcionki na kolektorze

## 2026-08-10 Ã¢â¬â Start zbierania: ekran Ã¢â¬Å¾WybierzÃ¢â¬Å¥ + skan wg konfiguracji

- Po statusie zawsze `/picking/order-type` (kafelki single/multi/all wg trybÄÅw konfiguracji)
- Ã¢â¬Å¾WszystkieÃ¢â¬Å¥ tylko gdy obie Ä¹âºcieÄ¹Ä½ki majÃâ¦ tÃâ¢ samÃâ¦ bramkÃâ¢ skanu wÄÅzka
- `GET /wms/picking/order-type-hub` Ã¢â¬â zamÄÅwienia + produkty X/Y per typ
- Po wyborze: skan wÄÅzka / cartless / default-cart wg `single_mode`/`multi_mode`

## 2026-08-10 Ã¢â¬â Kafelki statusÄÅw zbierania: Realizowane przez innych/Ciebie

- `GET /wms/picking/configured-statuses`: `order_count` + `in_progress_by_me` + `in_progress_by_others`
- SSOT: wolne (`cart_id`+`picking_session_id` NULL); aktywne = wÄÅzek PICKING / otwarta sesja cartless
- FE: `WmsFlowStatusTileButton` work + `showRealizationCounts` (zera widoczne)

## 2026-08-10 Ã¢â¬â Terminal zbierania end-to-end + kompaktowe Ã¢â¬Å¾Wykorzystane statusyÃ¢â¬Å¥

- BadgeÃ¢â¬â¢e wykorzystanych statusÄÅw: kompaktowe `h-9` / `w-fit` (bez rozciÃâ¦gania)
- Ustawienia Terminal: SSOT `wms_picking_terminal_settings` + GET/POST `/wms/settings/picking-terminal`
- Egzekwowanie w quick-pick / cartless / confirm-remaining: skan produktu, lokalizacji (FE policy), rezerwy
- Tooltipy Ã¢â¬Å¾iÃ¢â¬Å¥ przy opcjach; komunikaty operatora w katalogu skanÄÅw (PL)

## 2026-08-09 Ã¢â¬â Konfigurator zbierania: wybÄÅr i filtr statusÄÅw

- Przyczyna: `OrderUiStatusField` portal `z-[130]` pod modalem `z-[5000]` Ã¢â¬â lista nieklikalna
- Fix: `floatingZIndexClass` + Escape nie zamyka modala gdy picker otwarty
- Eligibility: Ä¹ÅrÄÅdÄ¹âo = aktywne NEW/IN_PROGRESS (bez zajÃâ¢tych Ä¹ÅrÄÅdeÄ¹â); cel = aktywne IN_PROGRESS + starty pakowania z API
- Walidacja zapisu/edycji z komunikatami PL; helper `pickingConfigStatusEligibility.ts` + testy

## 2026-08-09 Ã¢â¬â Packing Ã¢â¬Å¾AkcjaÃ¢â¬Å¥ activators execute real automation

- Extracted `frontend/src/utils/orderAutomationRun.ts` (visibility + execute + exclusive gate)
- Packing buttons call runner; success toast / red scanner error; busy spinner
- Tests: `orderAutomationRun.test.ts`
- Updated packing help for `show_automation_buttons`

## 2026-08-09 Ã¢â¬â Pakowanie: lista tylko ze skonfigurowanego statusu Ä¹ÅrÄÅdÄ¹âowego

- **Przyczyna:** `_packing_queue_status_ids` dokÄ¹âadÄ¹âo wszystkie IN_PROGRESS z Ã¢â¬Å¾pakÃ¢â¬Å¥/Ã¢â¬Å¾packÃ¢â¬Å¥ w nazwie; eligibility dopuszczaÄ¹âo `READY_TO_PACK`/`PACKING` bez filtra `order_ui_status_id`
- **Fix:** kolejka = wyÄ¹âÃâ¦cznie wybrany `status_id`; zawsze `order_ui_status_id IN (status_ids)`; liczniki FE rozÄ¹âÃâ¦czne z tej samej listy; overlay zielony na w peÄ¹âni spakowanych kartach produktu
- Test: `test_packing_queue_single_source_status.py` + `ordersListStats.test.ts`

## 2026-08-09 Ã¢â¬â Packing finish #1249: otwarte zbieranie vs fake complete

- **Przyczyna 400:** 2Äâ Cat x3 niezebrane Ã¢â â `has_recovery_work`; komunikat mylÃâ¦co o Ã¢â¬Å¾dogrywceÃ¢â¬Å¥; UI/`PACKING_FINISHED` mogÄ¹ây udawaÃâ¡ komplet po samych pickach
- **Fix:** `required_pack_qty` = min(after_shortage, picked); `lines_packed_complete` wymaga braku recovery/OMS/relocation; `picked_quantity_final` nie dopycha 0Ã¢â âfulfillable; czytelny komunikat PL
- Test: `test_order_1249_partial_pick_recovery_blocks_finish_and_fake_complete`

## 2026-08-09 Ã¢â¬â Pakowanie: kompaktowy wybÄÅr opakowania

- Przebudowa `PackingCartonGateModal` (ten sam flow): biaÄ¹âe tÄ¹âo, kompaktowy nagÄ¹âÄÅwek (szablon / tytuÄ¹â / wybrane), grid do 5 kolumn
- Karty: zdjÃâ¢cie, nazwa, wymiary, badge REKOM. (`is_best`), prawdziwy CODE128 (JsBarcode) z EAN/SKU/id
- Skan kodu = ten sam `onSelectCarton` co klik; `ScannerHandler` nie czyÄ¹âºci handlera przy `enabled=false`
- Backend (minimal): `barcode`/`ean` w `WmsPackingRecommendedCarton` + mapowanie w `_carton_row_to_recommended`

## 2026-08-09 Ã¢â¬â Zestaw STOCK: HTTP 500 przy tworzeniu zlecenia produkcyjnego

- **Przyczyna:** `production_orders.recipe_id` w DB = NOT NULL (legacy CREATE); BOM zestawu (`product_compositions`) nie ma `source_recipe_id` Ã¢â â INSERT z `recipe_id=NULL` Ã¢â â IntegrityError Ã¢â â 500
- **Fix:** `ensure_production_orders_recipe_id_nullable` (PG DROP NOT NULL / SQLite rebuild); CREATE TABLE nullable; migracja schema `2026.08.09.1`
- Test: `test_bundle_stock_production_order.py` (Dezodorant x3 Äâ Coccine Äâ 3, qty=1)

## 2026-08-09 Ã¢â¬â Packing finish 404 (`mode=no_cart`) + bÄ¹âÃâ¦d jako popup

- **Przyczyna 404:** `POST Ã¢â¬Â¦/finish` Ä¹âadowaÄ¹â zamÄÅwienie wyÄ¹âÃâ¦cznie z aktywnej kolejki; po spakowaniu linii (detail poza kolejkÃâ¦ / drift fulfillment / bÄ¹âÃâ¢dne `no_cart` z listy `all`) Ã¢â â `ORDER_NOT_IN_QUEUE` / HTTP 404.
- **Backend:** `_load_order_for_packing_finish` Ã¢â¬â fallback dla w peÄ¹âni spakowanych przy zgodnym trybie; polskie `message` w `PackingScanError`; skan EAN z `mode=all` + NULL handoff nie wymyÄ¹âºla CARTLESS.
- **FE:** lista `all` nie forsowaÄ¹âa `no_cart` bez wÄÅzka/koszyka; bÄ¹âÃâ¦d finish Ã¢â â `WmsScanFeedbackOverlay` (czerwony popup); bez wielkiego czerwonego tekstu w panelu finalizacji; Ã¢â¬Å¾PonÄÅw finalizacjÃâ¢Ã¢â¬Å¥ zostaje.
- Testy: `test_packing_finish_no_cart.py` + `packingHelpers` copy.

## 2026-08-09 Ã¢â¬â Pakowanie: lokalizacja + podglÃâ¦d aktywatorÄÅw w ustawieniach

- Lokalizacja na karcie: tylko Ã¢â¬Å¾Prawy gÄÅrny rÄÅgÃ¢â¬Å¥ (`top_right`) / Ã¢â¬Å¾W szczegÄÅÄ¹âach produktuÃ¢â¬Å¥ (`in_details`); legacy rogi Ã¢â â `top_right`
- DziaÄ¹âa w runtime (Default/Active/Done + `LineDetailsBlock`), nie tylko w config
- PodglÃâ¦dy w ustawieniach Widok: prawdziwe karty produktÄÅw + belka aktywatorÄÅw gÄÅra/dÄÅÄ¹â
- UsuniÃâ¢to badge Ã¢â¬Å¾BRAK FUNKCJONALNOÄ¹Å¡CIÃ¢â¬Å¥; dodano Ã¢âÂ help dla obu ustawieÄ¹â

## 2026-08-09 Ã¢â¬â Metody dostawy: NS_BINDING_ABORTED (prawdziwa przyczyna)

- **Werdykt:** `ShippingMethodLogo` / wiersz listy byÄ¹â **odmontowywany** (nie Ã¢â¬Å¾zepsute plikiÃ¢â¬Å¥).
- **DEV:** `React.StrictMode` w `main.tsx` remountowaÄ¹â kaÄ¹Ä½dy komponent przy pierwszym mountcie Ã¢â â `<img src="/uploads/...">` odÄ¹âÃâ¦czany mid-flight Ã¢â â Firefox `NS_BINDING_ABORTED` (czÃâ¢Ä¹âºÃâ¡ zdÃâ¦Ä¹Ä½yÄ¹âa 200).
- **WtÄÅrne:** `onError` po abortcie + globalny `failedCustomLogoKeys` zmieniaÄ¹â `src` customÃ¢â âheuristic (kolejne aborty); `useEffect([load])` bez cleanup Ã¢â â podwÄÅjny fetch/`setRows`.
- **Fix:** bez StrictMode; load z `cancelled` cleanup; `mergeShippingMethodsRows` (bail-out ref); `onError` tylko gdy mounted; brak module cache fail; stabilne `key={id}` + memo row.
- Test: `shippingMethodLogoUrl.test.ts` (lifecycle remount regression).

## 2026-08-09 Ã¢â¬â Pakowanie: chrome UI (ikona pack-all, sztuki, badge)

- Ã¢â¬Å¾Spakuj wszystkoÃ¢â¬Å¥ Ã¢â â `PackingPackAllIconButton` (PackageCheck)
- Przy #order: `packed_quantity/total_quantity` (sztuki), nie queue_index
- WÄÅzek/Koszyk: `PackingCartBasketBadges` (Icon cart/basket + mono)
- Lokalizacja: `(97)` zamiast `(x97)`; EAN done: biaÄ¹ây badge + ciemny tekst

## 2026-08-09 Ã¢â¬â Metody dostawy: pÃâ¢tla requestÄÅw logo

- Przyczyna: `onError` ustawiaÄ¹â `failedSrc` na SVG; potem `preferred` (custom `/uploads`) Ã¢â°Â  `failedSrc` Ã¢â â znowu custom Ã¢â â nieskoÄ¹âczona pÃâ¢tla + NS_BINDING_ABORTED/ORB
- Fix: jednokierunkowy `pickShippingMethodLogoSrc` (custom Ã¢â â heuristic Ã¢â â none); flagi `customFailed`/`heuristicFailed`; bez `key={src}`
- Test: `shippingMethodLogoUrl.test.ts` (5 passed)

## 2026-08-09 Ã¢â¬â Metody dostawy: znikajÃâ¦ce logo

- Przyczyna (nie save wipe): `logo_url` w DB zostaje; pliki `/uploads` ginÃâ¦ (efemeryczny dysk Railway) Ã¢â â 404/ORB; custom URL blokowaÄ¹â heurystykÃâ¢ SVG
- `NS_BINDING_ABORTED` = anulowane requesty przy rerenderze, nie root cause
- Fix: PUT `model_fields_set` (omit=zachowaj); FE nie wysyÄ¹âa `logo_url` bez zmiany; `onError` Ã¢â â carrier SVG; testy `test_shipping_method_logo_persist.py`
- Brak GC Ã¢â¬Å¾nieuÄ¹Ä½ywanychÃ¢â¬Å¥ uploadÄÅw dla logo metod; `clear_dev_artifacts` czyÄ¹âºci caÄ¹ây katalog uploads (dev)

## 2026-08-09 Ã¢â¬â Packing finish 400: int(UUID) serii RW

- Objaw: `POST Ã¢â¬Â¦/finish` Ã¢â â 400 `invalid literal for int()Ã¢â¬Â¦ 'd26516c5-Ã¢â¬Â¦'`
- Przyczyna: `create_packing_packaging_rw` robiÄ¹âo `document_series_id=int(series.id)` przy `DocumentSeries.id` = UUID (`String(36)`)
- Fix: `str(series.id)`; cart_id=3 nie byÄ¹â winny Ã¢â¬â UUID to seria dokumentÄÅw RW

## 2026-08-09 Ã¢â¬â Finish pakowania: brak stanu opakowaÄ¹â nie blokuje

- Pipeline: `create_packing_packaging_rw(..., allow_negative=True)` + soft-fail bez `raise`
- OstrzeÄ¹Ä½enie log `PACKING_PACKAGING_RW_STOCK_SHORTAGE`; status/dokumenty idÃâ¦ dalej
- FE finalizacja: Ã¢â¬Å¾Ã¢â Â PowrÄÅt do zamÄÅwieniaÃ¢â¬Å¥ + Ã¢â¬Å¾Ã¢â Â Lista zamÄÅwieÄ¹âÃ¢â¬Å¥
- Regresja: `test_packing_finish_packaging_stock.py`

## 2026-08-09 Ã¢â¬â /wms/packing: GLOBAL_SCAN handler (wÄÅzek/koszyk)

- Przyczyna: `WmsPackingStatusPage` rejestrowaÄ¹â `registerScanHandler(null)` Ã¢â â `GLOBAL_SCAN_NO_HANDLER`
- Fix: ten sam wzorzec co inne strony WMS Ã¢â¬â handler Ã¢â â `resolvePackingHandoffScan` + `applyPackingHandoffScanResult` (preferowany status Pakowanie)
- WejÄ¹âºcie bez skanu: kafelki statusÄÅw Ã¢â â lista `mode=all` (bez forced scan UI)

## 2026-08-09 Ã¢â¬â Packing finish 400: UUID serii RW Ã¢â â int()

- Przyczyna: `create_packing_packaging_rw` robiÄ¹âo `document_series_id=int(series.id)`; `document_series.id` i `stock_documents.document_series_id` to String(36) UUID
- Objaw: HTTP 400 `invalid literal for int() with base 10: 'd26516c5-Ã¢â¬Â¦'` przy `POST Ã¢â¬Â¦/packing/orders/{id}/finish`
- Fix: przekazywaÃâ¡ `str(series.id)`; regresja `test_packing_packaging_rw_series_uuid.py`
- `cart_id` (int) byÄ¹â poprawny Ã¢â¬â UUID to seria dokumentÄÅw RW magazynu, nie wÄÅzek

## 2026-08-09 Ã¢â¬â Pakowanie: skan wÄÅzka jako lookup na liÄ¹âºcie (nie osobny etap)

- Wycofano forced UI Ã¢â¬Å¾Skanuj wÄÅzek / koszykÃ¢â¬Å¥ ze statusu / trybu
- WejÄ¹âºcie w status Ã¢â â `mode=all` Ã¢â â normalna lista zamÄÅwieÄ¹â (niezaleÄ¹Ä½nie od konfiguracji zbierania)
- Globalny skaner na liÄ¹âºcie: `resolvePackingHandoffScan` (wÄÅzek / MULTI / koszyk) Ã¢â â filtr lub otwarcie zamÄÅwienia
- Backend: `mode=all` w scope kolejki + inferencja handoff przy resolve-ean/scan
- UsuniÃâ¢to `PackingHandoffScanModal`

## 2026-08-09 Ã¢â¬â Pakowanie: skan wÄÅzka/koszyka ze statusu Pakowanie (WYCOFANE)

- Pierwsza wersja z CTA / osobnym etapem skanu Ã¢â¬â bÄ¹âÃâ¢dny kierunek; zastÃâ¦pione powyÄ¹Ä½szym

## 2026-08-09 Ã¢â¬â WyczyÄ¹âºÃâ¡ wÄÅzek: peÄ¹âny reset takÄ¹Ä½e w PACKING

- Przyczyna: `CartService.clear_cart` Ã¢â â `admin_release_cart` (celowo blokuje PACKING z custody) + 500 bez mapowania + FE `code=null` Ã¢â â Ã¢â¬Å¾NIEZNANY KODÃ¢â¬Å¥
- Fix: `force_clear_cart` (SSOT) dla ASSIGNED/PICKING/READY/PACKING; `admin_release` bez zmian; clear Ã¢â â 409 + WmsUserMessage; FE `showWmsError` + katalog kodÄÅw

## 2026-08-09 Ã¢â¬â Magazyn Ã¢â â WÄÅzki: scroll strony po rozwiniÃâ¢ciu wÄÅzka

- Przyczyna: `CartsModuleLayout` zawsze `fillHeight` Ã¢â â `PageContainer` `h-full` + `overflow-hidden` ucinaÄ¹â treÄ¹âºÃâ¡
- Fix: `fillHeight` tylko dla edytora/podglÃâ¦du `/carts/racks/...`; flota scrolluje w `<main>`
- Accordion detail: `max-content` + `overflow-visible` gdy open (bez wewnÃâ¢trznego scrollera)

## 2026-08-09 Ã¢â¬â Ponowne wejÄ¹âºcie do spakowanego zamÄÅwienia (lista pakowania)

- Gate przy pierwszym wczytaniu detail: modal Ã¢â¬Å¾juÄ¹Ä½ spakowaneÃ¢â¬Å¥, linie Done, bez aktywnego produktu / AutoActions
- `POST /wms/packing/orders/{id}/acknowledge-reopen` Ã¢â â `PACKING_REOPEN_ACKNOWLEDGED` (+ activity log)
- X zamyka bez logu; Accept zapisuje log; WrÄÅÃâ¡ Ã¢â â lista
- Detail poza kolejkÃâ¦ dla zamÄÅwieÄ¹â packed/finalized; `packed_by_label` w detail

## 2026-08-09 Ã¢â¬â PodglÃâ¦dy ukÄ¹âadu/produktÄÅw: realne karty + bez Ã¢â¬Å¾Ã¢â¬âÃ¢â¬Å¥

- `PackingLayoutModePreview`: prawdziwy sidebar + karty Default/Done (skala), nie szkielety
- WspÄÅlne sample lines; brak wartoÄ¹âºci = ukryte pole w `LineDetailsBlock`
- Lokalizacja: ten sam `PackingLocationPill`; pusty badge niewidoczny

## 2026-08-09 Ã¢â¬â Ustawienia widoku: zwijane podglÃâ¦dy ukÄ¹âadu

- WspÄÅlny `PackingSettingsPreviewCollapse` (domyÄ¹âºlnie zwiniÃâ¢ty)
- PodglÃâ¦dy: ukÄ¹âad (sidebar/peÄ¹âna), komentarze, dokument sprzedaÄ¹Ä½y, produkty Lista/Siatka
- Siatka kart: zdjÃâ¢cie wyÄ¹âºrodkowane pod nagÄ¹âÄÅwkiem (jak mockup)

## 2026-08-09 Ã¢â¬â Karty pakowania: mockup Siatka/Lista

- StaÄ¹âe wymiary: siatka 20Äâ19.5rem; lista peÄ¹âna szerokoÄ¹âºÃâ¡ + staÄ¹âa wysokoÄ¹âºÃâ¡ wiersza
- Layout: zdjÃâ¢cie | dane | SPAKOWANO | LOKALIZACJA | Ã¢â¬Â¦ (lista); nagÄ¹âÄÅwek + ciaÄ¹âo (siatka)
- Done: pÄÅÄ¹âprzezroczyste zielone tÄ¹âo caÄ¹âej karty, grayscale zdjÃâ¢cia/danych, czytelny status/X
- EAN: delikatny badge; bez biaÄ¹âego tÄ¹âa pod zdjÃâ¢ciem; bez Ã¢â¬Å¾1xÃ¢â¬Å¥ w nazwie

## 2026-08-09 Ã¢â¬â PodglÃâ¦d ukÄ¹âadu produktÄÅw (Lista/Siatka)

- `ProductDisplayModePreview`: staÄ¹âa szerokoÄ¹âºÃâ¡ kart (`allowShrink: false` / `lockCardSize`), wrap zamiast Ä¹âºciskania
- `DefaultCard` lista: kolumny [zdjÃâ¢cie|nazwa+meta] | [SPAKOWANO|LOKALIZACJA|Ã¢â¬Â¦] Ã¢â¬â bez nachodzenia elementÄÅw

## 2026-08-09 Ã¢â¬â Fix zmiany statusu zamÄÅwienia (panel UI)

- Przyczyna: przy zamÄÅwieniu na wÄÅzku z zablokowanym detach (picki / READY_FOR_PACKING) `apply_order_panel_ui_status` rzucaÄ¹â 409 i rollbackowaÄ¹â zapis statusu
- Fix: `order_ui_status_id` zawsze zapisywany; detach tylko gdy dozwolony
- UI: toast przy bÄ¹âÃâ¢dzie API; po sukcesie `reloadOrderById`; `build_order_read` czyta status z FK (nie stale relationship)
- Test: `test_panel_status_saves_when_detach_blocked_by_picks`

## 2026-08-09 Ã¢â¬â WyglÃâ¦d produktÄÅw: Lista / Siatka

- `productDisplayMode` podpiÃâ¢ty do kart Active/Default/Done + siatki w PackingView
- Lista = karty poziome; Siatka = pionowe z duÄ¹Ä½ym zdjÃâ¢ciem; auto-fit na caÄ¹âÃâ¦ szerokoÄ¹âºÃâ¡
- PodglÃâ¦d w ustawieniach Widok (jak lista zamÄÅwieÄ¹â); usuniÃâ¢te CAP_NONE

## 2026-08-09 Ã¢â¬â Fix full-width packing layout

- Osobna gaÄ¹âÃâ¦Ä¹Å layoutu w `PackingView` (bez sidebara); pas info + opakowania na caÄ¹âÃâ¦ szerokoÄ¹âºÃâ¡
- Siatka produktÄÅw: `auto-fit minmax(15.5rem, 1fr)` Ã¢â¬â karty wypeÄ¹âniajÃâ¦ rzÃâ¦d, bez pustej prawej kolumny
- Info: dokument, logo, wysyÄ¹âka, telefon/wartoÄ¹âºÃâ¡/adres, uwagi; opakowania `align=start`

## 2026-08-09 Ã¢â¬â Widok pakowania: telefon / wartoÄ¹âºÃâ¡ / adres

- Extended UI: `showOrderPhone`, `showOrderValue`, `showShippingAddress` (domyÄ¹âºlnie ON)
- Sidebar + full-width: telefon i wartoÄ¹âºÃâ¡; adres w bloku kupujÃâ¦cego (dokument peÄ¹âny)
- Checkboxy + (i) w Widok; bez CAP_NONE

## 2026-08-09 Ã¢â¬â Widok pakowania: ukÄ¹âad + kolejnoÄ¹âºÃâ¡ spakowanych

- Ustawienie ukÄ¹âadu: `Z sidebarem` / `PeÄ¹âna szerokoÄ¹âºÃâ¡` (zamiast PeÄ¹âna szerokoÄ¹âºÃâ¡ / WyÄ¹âºrodkowany)
- Full-width: ten sam `PackingView`, bez sidebara, pas info + siatka na caÄ¹âÃâ¦ szerokoÄ¹âºÃâ¡
- `movePackedToBottom` faktycznie sortuje linie; usuniÃâ¢te CAP_NONE + teksty Ã¢â¬Å¾brak funkcjonalnoÄ¹âºciÃ¢â¬Å¥
- Info (i) dla obu opcji; `npm run build` OK

## 2026-08-09 Ã¢â¬â Lista zamÄÅwieÄ¹â: korekta layoutu (3 warianty)

- UsuniÃâ¢te szare tÄ¹âo za zdjÃâ¢ciami produktÄÅw
- NagÄ¹âÄÅwek karty zwarty (flex w-max): nr | SPAKOWANO | logo Ã¢â¬â bez space-between / 1fr
- Standardowy: staÄ¹âa szerokoÄ¹âºÃâ¡ karty (~280px) + flex-wrap zamiast rozciÃâ¦ganego gridu
- `npm run build` OK; bez commit/push

## 2026-08-09 Ã¢â¬â Lista zamÄÅwieÄ¹â: Rozbudowany (Pionowy)

- `expanded_vertical` Ã¢â â UI Ã¢â¬Å¾Rozbudowany (Pionowy)Ã¢â¬Å¥; biaÄ¹âe tÄ¹âo; karty full-width jedna pod drugÃâ¦
- NagÄ¹âÄÅwek karty: NR | SPAKOWANO | logo; produkty w poziomie z separatorami; `+N innych`
- Spakowane: wyszarzenie + Ã¢Åâ + X; podglÃâ¦d w ustawieniach; `npm run build` OK; bez commit/push

## 2026-08-09 Ã¢â¬â Lista zamÄÅwieÄ¹â: Rozbudowany (Poziomy)

- Opcja `cards` Ã¢â â UI Ã¢â¬Å¾Rozbudowany (Poziomy)Ã¢â¬Å¥ (rename z Karty); wartoÄ¹âºÃâ¡ `cards` bez zmian
- Poziomy scroll: karty ~300px z produktami (miniatura, qtyÄânazwa, EAN, kolor), logo po prawej SPAKOWANO
- Stany: czerwona ramka + badge Brak; linia Spakowane Ã¢Åâ/X; karta zakoÄ¹âczona opacity; +N innych
- PeÄ¹âny podglÃâ¦d w ustawieniach Widok; `npm run build` OK; bez commit/push

## 2026-08-09 Ã¢â¬â Lista zamÄÅwieÄ¹â pakowania: ukÄ¹âad Standardowy

- `ordersListLayout: compact` Ã¢â â UI Ã¢â¬Å¾StandardowyÃ¢â¬Å¥ (rename z Kompaktowy); wartoÄ¹âºÃâ¡ `compact` bez zmian
- Siatka 4 kart/rzÃâ¦d; karta 3 kolumny: nr+Fa+klient | SPAKOWANO | logo przewoÄ¹Ånika (bez wrap logo pod licznik)
- Stan spakowany: Ã¢Åâ + Spakowane n/n, czerwony X, wyszarzenie; nagÄ¹âÄÅwek jak referencja Sellasist
- PodglÃâ¦d ukÄ¹âadu w ustawieniach Widok; `npm run build` OK; bez commit/push

## 2026-08-08 Ã¢â¬â Smart Matching (WMS settings + learning)

- TrwaÄ¹âe ustawienia (enable, prÄÅg 2/3/5, status inicjujÃâ¦cy, multi auto-label) zamiast localStorage
- Nauka z historii pakowania Ã¢â â reguÄ¹ây auto; przerwane serie; reset tylko reguÄ¹â auto
- Hook finish + zmiana statusu panelu; propozycje w pakowaniu (ten sam model kartonu)
- UI Sellasist-like: OrderUiStatusPicker/Field, historia, Ã¢â¬Å¾!Ã¢â¬Å¥, SettingsSubsection
- Testy `test_wms_smart_matching.py`; `npm run build`; bez commit/push

## 2026-08-08 Ã¢â¬â Etykieta zastÃâ¢pcza (pakowanie WMS)

- Nowy typ szablonu `order_replacement` (Ã¢â¬Å¾Etykieta zastÃâ¢pczaÃ¢â¬Å¥, rodzina ZamÄÅwienia) Ã¢â¬â constants/API/settings/UI designer
- Tabela `wms_packing_replacement_labels` + serwis: snapshot pakowania, PDF, barcode `RPL-*`, retry courier
- Finish pipeline: brak listu Ã¢â â `offer_replacement_label`; popup + delay; create/print; skan na liÄ¹âºcie/ekranie zamÄÅwienia
- Ustawienie szablonu filtruje tylko `order_replacement`; opÄÅÄ¹Ånienie zachowane
- Testy backend (create/snapshot/scan/retry/fail) + `npm run build`; bez commit/push

## 2026-08-08 Ã¢â¬â Ustawienia WMS: Ä¹âºrÄÅdsekcje SettingsSubsection

- Nowy lekki kontener: tÄ¹âo slate-50, cienka obwÄÅdka, zaokrÃâ¦glenie, tytuÄ¹â + opcjonalny opis, wiÃâ¢kszy gap (`space-y-5`)
- Packing `Subsection`, picking `SubsectionPicking`, DS workflow statuses Ã¢â â ten sam komponent
- Wiersze ustawieÄ¹â bez dodatkowych ramek; `npm run build`; bez commit/push

## 2026-08-08 Ã¢â¬â Ustawienia WMS: Ã¢â¬Å¾iÃ¢â¬Å¥ w pierwszym wierszu tytuÄ¹âu

- `SettingRow` z powrotem 2 kolumny LABEL|CONTROL; `.option-title` = flex (tekst + Ã¢â¬Å¾iÃ¢â¬Å¥ `items-start`)
- Ikona przy pierwszej linii nazwy, nie obok caÄ¹âego wieloliniowego bloku
- `hint` nadal Ã¢â â Ã¢â¬Å¾iÃ¢â¬Å¥ (bez tekstu pod opcjÃâ¦); kontrolka top-aligned; bez commit/push

## 2026-08-08 Ã¢â¬â Ustawienia WMS: ukÄ¹âad LABEL | [i] | CONTROL

- `SettingRow`: 3 kolumny; `hint` nie renderuje siÃâ¢ pod nazwÃâ¦ Ã¢â¬â treÄ¹âºÃâ¡ trafia do Ä¹âºrodkowej ikony Ã¢â¬Å¾iÃ¢â¬Å¥
- Packing: `info` prop zamiast ikony w labelu; badge/capability bez zmian
- Globalnie: picking / direct sales / returns / silniki Ã¢â¬â istniejÃâ¦ce `hint`/`help` Ã¢â â Ã¢â¬Å¾iÃ¢â¬Å¥
- Logika ustawieÄ¹â bez zmian; `npm run build`; bez commit/push

## 2026-08-08 Ã¢â¬â Ustawienia WMS: faÄ¹âszywy dirty przy zmianie grupy

- Root cause: baseline draft liczony przed migracjÃâ¦ localStorage `allowed_start_status_ids` + niespÄÅjny fingerprint
- Fix: `packingDraftFingerprint` / `packingExtendedFingerprint` (normalize + kanoniczne pola); baseline = stan po load/migrate; clear baseline podczas load; idempotent `setAllowedStartStatusIds`
- OstrzeÄ¹Ä½enie nawigacji nadal tylko przy prawdziwej zmianie ustawieÄ¹â; bez commit/push

## 2026-08-08 Ã¢â¬â Pakowanie: dokumenty, listy, wielopaczkowoÄ¹âºÃâ¡

- `preferred_document_type` API: FROM_ORDER | INVOICE | PARAGON (UI: Paragon/Faktura/Pobrane z zamÄÅwienia)
- Kopia dokumentu sprzedaÄ¹Ä½y (ten sam PDF 2Äâ); popup liczby listÄÅw; ConfirmModal przed generate_shipment
- WielopaczkowoÄ¹âºÃâ¡: okno paczek przed finish/auto; `packaging_carton_ids` Ã¢â â packing_consumables_json
- Testy packing auto-actions + finish baskets; `npm run build` OK; bez commit/push

## 2026-08-08 Ã¢â¬â Pakowanie: Automatyzacja / PrzesyÄ¹âki i dokumenty

- `change_order_status` off Ã¢â â bez zmiany statusu; on Ã¢â â `packed_status_id`
- List przewozowy: `LIST_PRZEWOZOWY` / pole SHIPPING_LABEL; brak = soft-skip (nie pusty PDF)
- Po dokumencie sprzedaÄ¹Ä½y / liÄ¹âºcie: tylko Wydrukuj|Pobierz; przy Wydrukuj listu + companion Ã¢â¬Å¾Dokument sprzedaÄ¹Ä½yÃ¢â¬Å¥
- Aktywatory w PackingView: filtr `visibleOnWmsPacking` + `showAutomationButtons`
- Testy `test_wms_packing_post_pack_auto_actions` (7) + finish baskets; `npm run build` OK; bez commit/push

## 2026-08-08 Ã¢â¬â Pakowanie: statusy startowe (wiele)

- API `allowed_start_status_ids` (JSON w `wms_packing_settings`) + walidacja UI statusÄÅw
- `list_packing_target_statuses` Ä¹âÃâ¦czy picking targets + `start_status_id` + multi-start
- UI: multi `OrderUiStatusField` (badge NOWE/W TOKU/ZAKOÄ¹ÂCZONE), ikona (i), bez BRAK FUNKCJONALNOÄ¹Å¡CI
- Migracja z localStorage `allowedStartStatusIds`; logika Zbierania bez zmian
- Testy unit + `npm run build` OK; bez commit/push

## 2026-08-08 Ã¢â¬â Ustawienia WMS: layout Sellasist LABEL|CONTROL

- WspÄÅlny `SettingRow` (`wmsSettingRow.tsx`): kolumny ~20rem|15rem, `items-start`, max-width pary (kontrolki nie na krawÃâ¢dzi ekranu)
- DÄ¹âugie nazwy zawijajÃâ¦ siÃâ¢; badge/hint/(i) w kolumnie LABEL; checkbox/select w CONTROL przy 1. linii
- Outliery: stacked labelÃ¢â âinput w Zbieraniu, Info/Printers stanowisk Ã¢â â `WmsControlSettingRow` / `WmsBoolSettingRow`
- Logika/API bez zmian; `npm run build` OK; bez commit/push

## 2026-08-08 Ã¢â¬â Pakowanie: efekt po akcjach automatycznych (3 opcje)

- UsuniÃâ¢ty checkbox Ã¢â¬Å¾Po spakowaniuÃ¢â¬Â¦ nastÃâ¢pnegoÃ¢â¬Â¦Ã¢â¬Å¥ i badge CZÃÂÄ¹Å¡CIOWO WDROÄ¹Â»ONE
- `packing_after_finish_action`: `STAY` | `GO_TO_LIST` | `NEXT_ORDER` (persist API)
- Finish: pipeline auto Ã¢â â potem nawigacja; NEXT_ORDER = FIFO z kolejki trybu (`next_order_id`)
- `npm run build` OK; bez commit/push

## 2026-08-08 Ã¢â¬â Pakowanie: start status, braki, jedno-/wieloelementowe

- UsuniÃâ¢ty tekst CAP o zbieraniu przy `start_status_id`; status startowy wchodzi teÄ¹Ä½ do `list_packing_target_statuses` (bez mieszania z reguÄ¹âami zbierania)
- `missing_status_id` Ã¢â â akcja Ã¢â¬Å¾Oznacz jako brakÃ¢â¬Å¥ na kafelku + popup + `POST Ã¢â¬Â¦/mark-shortage` + powrÄÅt jak Ã¢â¬Å¾PrzerwijÃ¢â¬Å¥
- Checkbox jedno-/wieloelementowe Ã¢â â kafelki na ekranie trybu; filtr `order_type` na liÄ¹âºcie (jak zbieranie)
- Testy packing/shortage + `npm run build`; bez commit/push

## 2026-08-08 Ã¢â¬â OrderUiStatusField: grupowanie wybranych statusÄÅw

- `OrderUiStatusSelectedGroups` Ã¢â¬â NOWE / W TOKU / ZAKOÄ¹ÂCZONE na liÄ¹âºcie juÄ¹Ä½ wybranych (puste grupy ukryte)
- Nazwa statusu bez sufiksu grupy; kolory z brief SSOT
- `OrderUiStatusField` (Pakowanie + Akcje automatyczne) + `AutomationConditionSummary` (Ã¢â¬Å¾jest jednym zÃ¢â¬Â¦Ã¢â¬Å¥)
- Logika zapisu bez zmian; `npm run build` OK; bez commit/push

## 2026-08-08 Ã¢â¬â Ustawienia WMS: wspÄÅlny standard UI (nie tylko Pakowanie)

- Barrel `wmsSettingsUi` + wiersze `WmsBoolSettingRow` / `WmsControlSettingRow` (kolumny 34rem|26rem, kontrolki nie na krawÃâ¢dzi)
- Migracja: Zbieranie, SprzedaÄ¹Ä½ bezpoÄ¹âºrednia, Zwroty, PrzyjÃâ¢cia, Produkcja, Smart/3D Matching, Stanowiska (grid wierszy)
- Statusy Ã¢â â `OrderUiStatusField` + subgroups; capability badge / info (i) wspÄÅlne
- Logika biznesowa bez zmian; placeholdery Coming Soon bez usuwania zakÄ¹âadek
- `npm run build` OK; bez commit/push

## 2026-08-08 Ã¢â¬â Zbieranie: layout Sellasist + OrderUiStatusField

- `WmsPickingSettingsPanel`: `WmsBoolSettingRow` / `WmsControlSettingRow` / `wmsSettingsRowsStackClass`
- Statusy (braki API, extended, konfigurator trybu) Ã¢â â `OrderUiStatusField` + `getOrderPanelSubgroups`
- UsuniÃâ¢ty `PickingStatusSelect` z panelu; payloady / znaczenie status id bez zmian

## 2026-08-08 Ã¢â¬â WspÄÅlny OrderUiStatusPicker (NOWE / W TOKU / ZAKOÄ¹ÂCZONE)

- Kanoniczny `OrderUiStatusPicker` + `OrderUiStatusField` (Pakowanie + Akcje automatyczne)
- Popup: 3 grupy zwijane (domyÄ¹âºlnie otwarte), wyszukiwarka, single/multi, kolorowe badge
- Wybrany status = sama nazwa (bez sufiksu grupy); aliasy `AutomationStatus*` zachowane

## 2026-08-08 Ã¢â¬â Pakowanie: layout Sellasist (kontrole nie na prawej krawÃâ¢dzi)

- `wmsSettingRow`: kolumny `[max 34rem | 26rem]` wyrÄÅwnane do lewej Ã¢â¬â kontrolki zaraz obok etykiety
- Puste miejsce po prawej OK; bez `1fr` wypychajÃâ¦cego select/checkbox na skraj ekranu

## 2026-08-08 Ã¢â¬â WspÄÅlne kolorowe badge statusÄÅw WMS

- `OrderUiStatusBadge` / `OrderUiStatusBadgeList` Ã¢â â SSOT via `panelSidebarSubRowStyleRich` (kolory z rejestru statusÄÅw)
- Akcje automatyczne (warunki/efekty/lista) + `AutomationStatusField` (Pakowanie) + picker: kolorowe chipy, nazwa bez grupy
- `+N` overflow zachowany; `buildOrderUiStatusBriefById` jako mapa id Ã¢â â brief

## 2026-08-08 Ã¢â¬â Pakowanie: status field + layout full-width

- WspÄÅlny `AutomationStatusField`: trigger z chipami Ã¢â â popover z `AutomationStatusPicker` (Pakowanie + Akcje automatyczne)
- Etykieta statusu = sama nazwa (`Spakowane`), bez sufiksu grupy; `buildOrderUiStatusNameById`
- Formularz pakowania: `w-full` (bez `mx-auto` / wÃâ¦skiego max-width); prawa kolumna `16Ã¢â¬â22rem` wyrÄÅwnana w osi

## 2026-08-08 Ã¢â¬â Pakowanie: wspÄÅlny picker statusÄÅw

- Ustawienia procesu pakowania uÄ¹Ä½ywajÃâ¦ `AutomationStatusPicker` (jak akcje automatyczne)
- Single + multi; badge Ã¢â¬Å¾Nazwa Ã¢â¬â GrupaÃ¢â¬Å¥; `allowClear` = Ã¢â¬Å¾Ã¢â¬â brak Ã¢â¬âÃ¢â¬Å¥
- Alias: `OrderPanelStatusPicker`; zapis statusÄÅw bez zmian modelu

## 2026-08-08 Ã¢â¬â WMS settings: label left, control right

- WspÄÅlne `wmsSettingRow` (`WmsBoolSettingRow` / `WmsControlSettingRow`)
- Pakowanie, zbieranie (CustomCheckbox), sprzedaÄ¹Ä½ bezpoÄ¹âºrednia, produkcja, zwroty, Smart/3D Matching, walidacja przyjÃâ¢cia
- Zasada: nazwa opcji (+ Ã¢âÂ) z lewej, checkbox/select/input z prawej

## 2026-08-08 Ã¢â¬â GÄ¹âÄÅwny magazyn do pakowania (funkcjonalny)

- UI: select magazynÄÅw tenanta (ID), bez badge BRAK; zapis przez `PATCH /company/fulfillment-configuration` Ã¢â â `consolidation_warehouse_id`
- Runtime: istniejÃâ¦cy `resolve_preferred_consolidation_target_id` + soft validation jeÄ¹âºli WH usuniÃâ¢ty/nie-eligible
- Testy: `test_main_packing_warehouse.py` (unset / set / single-WH / other-tenant / clear / invalid fallback)

## 2026-08-08 Ã¢â¬â Pakowanie: Ã¢âÂ jak w Sellasist

- Niebieskie (i) inline przy nazwie opcji (`BoolRow` / `SelectField` / magazyn)
- Modal: tytuÄ¹â + X, Ã¢â¬Å¾Jak dziaÄ¹âa ta opcja:Ã¢â¬Å¥, opcjonalnie Ã¢â¬Å¾WskazÄÅwka:Ã¢â¬Å¥ Ã¢â¬â bez Ä¹âapek pomocnoÄ¹âºci
- `PACKING_SETTING_HELP` jako `{ description, tip? }`

## 2026-08-08 Ã¢â¬â ETAP 3A PPWR foundation

- Kontrakt: SALES / TRANSPORT / ECOMMERCE / AUXILIARY / FILLER / OUT_OF_SCOPE
- Carton + PackagingMaterial: ppwr_function/format/recyclable/recycled/reusable/status (bez duplikacji BDO)
- Nowa tabela `product_sales_packaging` + CRUD `/products/{id}/sales-packaging`
- FE: zakÄ¹âadka produktu Ã¢â¬Å¾Opakowanie produktuÃ¢â¬Å¥; WM PPWR projection; zakÄ¹âadka PPWR na karcie kartonu/materiaÄ¹âu
- Migracja `ensure_ppwr_stage_3a_schema` (allowlist PG); testy `test_ppwr_stage_3a.py`; `npm run build` OK
- Poza zakresem: composition, void, consumables, hub

## 2026-08-08 Ã¢â¬â ETAP 1+2 MateriaÄ¹ây opakowaniowe (IA + Inventory SSOT)

- ZakÄ¹âadki: Kartony | Pakowe | PPWR (projekcja) | Historia (StockDocument/StockOperation)
- UsuniÃâ¢to legacy scalar bump przy delivery `received` (metadata-only); stan tylko przez Inventory/PZ
- BDO movements = ta sama projekcja dokumentÄÅw (bez ledgeru)
- Bez: consumables packing, void snapshots, peÄ¹âne PPWR fields

## 2026-08-08 Ã¢â¬â IA: jeden katalog MateriaÄ¹ây opakowaniowe

- Jedyny katalog CRUD: Asortyment Ã¢â â MateriaÄ¹ây opakowaniowe (`/warehouse-materials` Ã¢â¬â Kartony | MateriaÄ¹ây pakowe)
- UsuniÃâ¢to zakÄ¹âadkÃâ¢ BDO Ã¢â¬Å¾MateriaÄ¹ây opakowanioweÃ¢â¬Å¥ + `BdoMaterialsPage`; `/warehouse/bdo/materials` Ã¢â â redirect do katalogu
- BDO zostaje report/config; flagi kg/`include_in_bdo` edytowalne na karcie materiaÄ¹âu (zakÄ¹âadka BDO)
- Modele/API Carton + PackagingMaterial bez zmian

## 2026-08-08 Ã¢â¬â Prod hotfix: BDO build + order_issue_tasks.status

- FE: restore `resolveBdoTabMeta` in `bdoTabMeta.ts` (current report-only tabs + breadcrumb) Ã¢â¬â Vercel Rollup import fix
- BE: widen `order_issue_tasks.status` String(16)Ã¢â âString(32) + `ensure_order_issue_tasks_status_column_width` (PG ALTER; READY_FOR_PACKING=17)
- BE: `_recover_session_after_failed_flush` in WMS issue-tasks list after nested repair failure (avoid PendingRollbackError mask)

## 2026-08-07 Ã¢â¬â MateriaÄ¹ây opakowaniowe + BDO report-only (backend foundation)

- Stockable bridge: `Product.stock_item_kind` + `Carton/PackagingMaterial.product_id` Ã¢â â Inventory SSOT
- `wm_catalog_stock_service` posts Inventory (not scalar stock)
- Packing finish Ã¢â â `create_packing_packaging_rw` (RW ISSUE)
- BDO API rewrite: dashboard/catalog/settings/monthly from documents; purchases/corrections/stock-counts Ã¢â â 410
- Dropped BDO ledger tables in migration; FE redirects + deleted purchase/correction/stock-count pages
- Rename UI: MateriaÄ¹ây opakowaniowe
- Remaining: packing consumables UI, movements projection, full FE polish, product-list filters excluding packaging stockables

## 2026-08-07 Ã¢â¬â Magazyn: uproszczenie urzÃâ¦dzeÄ¹â (WÄÅzki + Strefa sortujÃâ¦ca)

- ZakÄ¹âadki: WÄÅzki | Strefa sortujÃâ¦ca | Planer floty | NoÄ¹âºniki (`cartsTabs.ts`)
- WÄÅzki: jeden ekran (`CartsFleetPage`) + filtr ALL/BULK/MULTI + modal typu przy Ã¢â¬Å¾+ Dodaj wÄÅzekÃ¢â¬Å¥; badge typu na karcie
- Redirect `/carts/baskets` Ã¢â â `/carts/bulk?type=multi`; `/carts/zones` Ã¢â â `/carts/bulk`
- UsuniÃâ¢to FE: CartsBulk/Baskets/Zones, ZonesTab, ZoneConfigurator
- UsuniÃâ¢to BE: `picking_zone` API/service/schema (model + M2M order zostaje dla WMS)
- Nav Magazyn: WÄÅzki, Strefa sortujÃâ¦ca (bez Stref); Planer floty
- `npm run build` + vitest carts/IA OK

## 2026-08-07 Ã¢â¬â Shell: header nad sidebarem + usuniÃâ¢cie martwych moduÄ¹âÄÅw

- Layout: wspÄÅlny header na caÄ¹âÃâ¦ szerokoÄ¹âºÃâ¡; sidebar dopiero pod belkÃâ¦
- Logo SASIST zawsze w headerze; hamburger usuniÃâ¢ty
- Zwijanie menu: pozycja w menu uÄ¹Ä½ytkownika (Administracja Ã¢â â Firma Ã¢â â ZwiÄ¹â/RozwiÄ¹â Ã¢â â Wyloguj)
- UsuniÃâ¢to FE: Pule stanÄÅw, caÄ¹ây `/system/*` UI, SÄ¹âownik aplikacji (admin)
- BE: wyrejestrowano/usuniÃâ¢to `offer_stock_pool` router; zostawiono health + labels/resolved
- `npm run build` OK

## 2026-08-07 Ã¢â¬â Globalna wyszukiwarka ustawieÄ¹â WMS

- `settingsSearch/`: catalog + combobox + navigate (tab/section/focus/flash 2s)
- Header chrome: VS Code-style search across all WMS tabs (Ã¢â°Ä3 znaki, klawiatura)
- Anchory: `data-wms-setting-id` / `WmsSettingField` (Pakowanie Widok + kluczowe pola)
- UsuniÃâ¢to lokalnÃâ¦ wyszukiwarkÃâ¢ z `WmsSettingsTabFrame`
- `npm run build` OK

## 2026-08-07 Ã¢â¬â WMS settings: left nav switches section (no scroll)

- Registry: `selectSection` + `?section=` query; removed IntersectionObserver / scroll-spy
- `WmsSettingsSection` mounts only the active subsection
- Nav / Packing / Picking / DS / etc. unchanged visually; save logic untouched
- Deleted `wmsSettingsSectionDom.ts`
- `npm run build` OK

## 2026-08-07 Ã¢â¬â Order Multiakcje + shared multiActions shell

- Extracted generic `frontend/src/components/multiActions/` (MultiActionsModal, MultiModulePicker, createRegistry, types).
- Products: ProductMultiActionsModal Ã¢â â thin wrapper; ModuleCardProps uses `cardContext.tenantId`.
- Orders: `orderMultiActions/` Ã¢â¬â 13 modules; live: status, payment, note, shipping, document, custom_field; stubs: operator, tags, warehouse, source; host: packing_queue, export, delete.
- Removed dropdown `OrderListMultiActionsMenu`, old `OrderBulkMultiActionModal`, dead `OrderBulkCustomFieldModal`.
- OrderList + OrdersListBulkBar: Zap button Ã¢â â full creator modal; `executeOrderBulkActions` + `payment_status`.
- `npm run build` OK

## 2026-08-07 Ã¢â¬â Ustawienia WMS: wspÄÅlny wzorzec UI (Pakowanie)

- `WmsSettingsTabFrame`: tytuÄ¹â, opis, wyszukiwarka, PrzywrÄÅÃâ¡ / Zapisz
- Lewa nawigacja z ikonami (aktywny orange), mobile disclosure
- Sekcje zwijane z ikonÃâ¦ (`WmsSettingsSection`)
- PodpiÃâ¢te: Pakowanie, Zbieranie, Zwroty, PrzyjÃâ¢cia, Produkcja, DS, Smart/3D, Coming soon
- Logika/API bez zmian; sticky footer nadal dla dirty w hostcie
- `npm run build` OK

## 2026-08-07 Ã¢â¬â Asortyment Ã¢â â Ustawienia (Stany magazynowe)

- Nowa pozycja menu Asortyment Ã¢â â Ustawienia (`/assortment/settings`)
- ZakÄ¹âadka Stany magazynowe przeniesiona z Konfiguracji WMS (bez zmian API)
- WMS: usuniÃâ¢to tab `common`; default Pakowanie; `?tab=common` Ã¢â â redirect
- Shell zakÄ¹âadek gotowy na kolejne sekcje produktÄÅw
- `npm run build` OK

## 2026-08-07 Ã¢â¬â Lista produktÄÅw + Multiakcje: wyrÄÅwnanie UX

- Formularze Multiakcji: jednolity wiersz `checkbox/radio | etykieta | pole` (`PmaFieldRow`, `PatchFieldsEditor`)
- UzupeÄ¹ânienia WMS: etykiety Ã¢â¬Å¾Minimalna/Maksymalna iloÄ¹âºÃâ¡ PICK/ZAPASÃ¢â¬Å¥
- Toolbar produktÄÅw: bez Strona/CzÃâ¢Ä¹âºciowo/wykonaj, maila, UsuÄ¹â, Odznacz; eksport = ikona Upload
- Nowy moduÄ¹â Ã¢â¬Å¾Generowanie EANÃ¢â¬Å¥ (pomiÄ¹â/nadpisz) + BE `generate_fake_ean`
- `npm run build` OK

## 2026-08-07 Ã¢â¬â Multiakcje produktÄÅw: UX kreatora

- Naprawa UTF-8 w kartach/moduÄ¹âach
- Command-palette picker zamiast `<select>`; ikony + grupy
- Ã¢â¬Å¾Parametry skÄ¹âadowaniaÃ¢â¬Å¥: sekcje Produkt/Karton, kompaktowa lista pÄÅl
- GhostButton Ã¢â âÃ¢â âÄâ; badge podsumowania produktÄÅw/moduÄ¹âÄÅw
- `npm run build` OK

## 2026-08-07 Ã¢â¬â Multiakcje produktÄÅw: kreator z pluginami (Etap 1)

- UsuniÃâ¢to dropdown Ã¢â¬Å¾Wybierz akcjÃâ¢Ã¢â¬Å¥; jeden przycisk Multiakcje + UsuÄ¹â
- Pakiet `productMultiActions`: shell, registry, execute; 15 kart-moduÄ¹âÄÅw
- BE: set_categories / set_product_family / set_tags / set_custom_field_values / set_product_status
- `npm run build` OK

## 2026-08-07 Ã¢â¬â Dodatkowe pola produktÄÅw: akcje, typografia, grupy

- Kolumna Akcje: min. `5rem`, right-align, rÄÅwne ikony `h-8 w-8`
- Nazwa pola: `adminListNameClass` (`text-sm font-medium`) Ã¢â¬â bez bold
- Grupowanie (jak Akcje automatyczne): tworzenie/rename/reorder/collapse; membership w `settings_json.group`; registry localStorage; Ã¢â¬Å¾Bez grupyÃ¢â¬Å¥
- Edycja: select grupy (+ nowa); usuniÃâ¢te techniczne opisy; order CF: usuniÃâ¢te Ã¢â¬Å¾AkceptowaneÃ¢â¬Â¦Ã¢â¬Å¥ / Ã¢â¬Å¾OpcjonalnieÃ¢â¬Â¦Ã¢â¬Å¥
- `npm run build` OK

## 2026-08-07 Ã¢â¬â Fix product custom fields list (AdminDataTable)

- Bug: `hidden` + `block` w AdminDataTable Ã¢â â tabela niewidoczna (Tailwind conflict)
- Product page: PageLayout fullBleed + ProductCustomFieldsTable jak OrderCustomFieldsTable
- Ten sam toolbar/search/DnD/bulk; kolumny: Typ, Rodzaj, Aktywne
- `npm run build` OK

## 2026-08-07 Ã¢â¬â Standard list administracyjnych (AdminDataTable)

- Nowy `components/admin/AdminDataTable` + tokeny (drag, checkbox, ID, name, columns, icon actions)
- `OrderCustomFieldsTable` przepiÃâ¢ty na AdminDataTable; stare tokeny = re-export
- `ProductCustomFieldsPage` UI jak pola zamÄÅwieÄ¹â (wyszukiwarka, DnD, bulk delete, ikony Edytuj/UsuÄ¹â)
- API FE: `bulkDeleteProductCustomFields`
- `npm run build` OK

## 2026-08-07 Ã¢â¬â Rodzina produktÄÅw: spÄÅjnoÄ¹âºÃâ¡ przyciskÄÅw DS

- Jeden toolbar (Generator Secondary, Zapisz Primary, UsuÄ¹â danger outline + Trash)
- UsuniÃâ¢to zduplikowane akcje ze stripa i link Ã¢â¬Å¾WrÄÅÃâ¡ do listyÃ¢â¬Å¥
- Dodaj cechÃâ¢/wartoÄ¹âºÃâ¡ Ã¢â â SecondaryButton; otwÄÅrz produkt Ã¢â â IconButton + ExternalLink
- `npm run build` OK

## 2026-08-07 Ã¢â¬â ZakÄ¹âadka Rodzina na karcie produktu (assign + preview)

- 3 karty PIM: przynaleÄ¹Ä½noÄ¹âºÃâ¡ (select + zapisz dirty), podglÃâ¦d KPI, cechy jako chipy
- Bez zarzÃâ¦dzania cechami / generatorem / czÄ¹âonkami
- `npm run build` OK

## 2026-08-07 Ã¢â¬â Dashboard edycji Rodziny produktÄÅw

- Kartowy UX: nagÄ¹âÄÅwek (status, KPI, Generator/Zapisz), Informacje, Cechy (osobne karty), tabela ProduktÄÅw, panel Generatora
- Komponenty: `FamilyEditInfoCard`, `FamilyEditAttributesSection`, `FamilyEditMembersCard`, `familyEditDraft.ts`
- UsuniÃâ¢to stopkÃâ¢ Ã¢â¬Å¾Rodzina jest opcjonalnaÃ¢â¬Â¦Ã¢â¬Å¥
- `npm run build` OK

## 2026-08-07 Ã¢â¬â UsuniÃâ¢cie panelu Ã¢â¬Å¾ToÄ¹Ä½samoÄ¹âºÃâ¡ produktuÃ¢â¬Å¥

- `ProductEditIdentityHeader` usuniÃâ¢ty Ã¢â¬â nie renderuje siÃâ¢ juÄ¹Ä½ nad zakÄ¹âadkami
- SKU / numer katalogowy przywrÄÅcone w `ProductEditBasicTab`
- ZakÄ¹âadka Rodzina uproszczona do membership + cechy produktu; usuniÃâ¢to karty `productFamily/*` z karty produktu
- `npm run build` OK

## 2026-08-06 Ã¢â¬â ZakÄ¹âadka Rodzina na karcie produktu (etapy 1Ã¢â¬â6)

- Tab `family` w railu; panel w `pages/Products/productFamily/`
- UsuniÃâ¢to rodzinÃâ¢ z identity / Podstawowych
- Members: sale_price + stock_quantity w payloadzie czÄ¹âonkÄÅw
- Generator osadzony + Generuj SKU/katalogowe (`product_codes` allocate + PUT)
- Dziedziczenie: UI-only checkboxy; powiÃâ¦zania z produktu bazowego
- Historia: activity log `product_family` (attach/detach/generate)

## 2026-08-06 Ã¢â¬â Product Management ecosystem (etapy 0Ã¢â¬â7)

- Plan zaakceptowany: `memory/plan-product-management-ecosystem.md`
- 0 nav + size-tables stub ÃÂ· 1 Kategorie polish ÃÂ· 3 Rodziny UX ÃÂ· 4 generator allocate SKU/katalog ÃÂ· 5 lista group-by family ÃÂ· 6 identity header ÃÂ· 7 PIM UX tokens (`pimUi.ts`)
- Lista produktÄÅw: `product_family_id/name` w API; toggle Lista pÄ¹âaska | Grupuj po rodzinie
- Karta: blok ToÄ¹Ä½samoÄ¹âºÃâ¡ (rodzina, kategoria, SKU, katalog, status); mid-page Family uproszczony

## 2026-08-06 Ã¢â¬â Product Family (7 commits) Ã¢â¬â ADR + implementacja

- ADR: `memory/adr-product-family.md` (opcjonalna rodzina, base product, generator A/B, etapowe usuniÃâ¢cie Variant)
- C1 modele ÃÂ· C2 CRUD `/product-families` ÃÂ· C3 UI Rodziny ÃÂ· C4 blok na karcie ÃÂ· C5 generator ÃÂ· C6 migracja ÃÂ· C7 usuniÃâ¢cie Variant
- Produkty bez rodziny bez zmian; brak `exclude_variant_children`; lista nadal pokazuje wszystkie produkty
- Follow-up: grupowanie listy produktÄÅw po rodzinie (UX), gÄ¹âÃâ¢bsze kopiowanie SEO/GPSR w generatorze

## 2026-08-06 Ã¢â¬â Product Family Commit 1 (modele)

- ADR zaakceptowany: `memory/adr-product-family.md` (opcjonalna rodzina, base product, generator A/B, etapowe usuniÃâ¢cie Variant)
- Modele: `product_families`, `family_attributes`, `family_attribute_values`, `product_attribute_values`
- `products.product_family_id`; schema `ensure_product_families_schema`
- Variant stack bez zmian (usuniÃâ¢cie w Commit 7)

## 2026-08-05 Ã¢â¬â Pola dodatkowe produktÄÅw (jak zamÄÅwienia, typy jak Sellasist)

- Definicje: Asortyment Ã¢â â Pola dodatkowe (tekst, liczba, pliki, lista 1/n, GPSR, zaÄ¹âÃâ¦czniki z typem)
- WartoÄ¹âºci na karcie produktu Ã¢â â Podstawowe, nad historiÃâ¦
- Osobny stack od order custom fields (tenant-scoped, bez warehouse)

## 2026-08-05 Ã¢â¬â Warianty produktÄÅw (lepiej niÄ¹Ä½ Sellasist)

- SÄ¹âownik grup: osie + wartoÄ¹âºci (karty, nie gÃâ¢sta tabela); nav Asortyment Ã¢â â Warianty
- Produkt: zakÄ¹âadka Warianty Ã¢â¬â przypisz grupÃâ¢, generuj brakujÃâ¦ce kombinacje jako osobne SKU
- SKU dzieci ukryte na liÄ¹âºcie produktÄÅw (`exclude_variant_children`); stan/EAN/cena per SKU
- Ä¹Å¡wiadomie bez marketplace / Ã¢â¬Å¾produkty zaleÄ¹Ä½neÃ¢â¬Å¥ / Ã¢â¬Å¾opcjeÃ¢â¬Å¥ z Sellasist (v1 = czysty katalog)

## 2026-08-05 Ã¢â¬â PrzeksztaÄ¹âÃâ¡ produkt Ã¢â â zestaw (jak Sellasist)

- BE: `assortment_convert_service` Ã¢â¬â soft-delete Ä¹ÅrÄÅdÄ¹âa, przeniesienie EAN/cen/wymiarÄÅw; pusty BOM przy productÃ¢â âbundle
- API: `POST /products/{id}/convert-to-bundle`, `POST /bundles/{id}/convert-to-product`
- FE: przycisk Shapes w nagÄ¹âÄÅwku karty produktu/zestawu + confirm + nawigacja do nowej karty

## 2026-08-05 Ã¢â¬â Centralne generowanie SKU / numeru katalogowego

- Kategorie: kod + szablon SKU/katalog; liczniki per `sequence_key`
- API preview/allocate; UI Generuj na Podstawowe z podglÃâ¦dem i reguÄ¹âami UX
- Silnik szablonÄÅw gotowy pod przyszÄ¹âe tokeny ({YEAR}, {MANUFACTURER}, Ã¢â¬Â¦)

## 2026-08-05 Ã¢â¬â ModuÄ¹â Kategorie produktÄÅw (od zera)

- BE: `product_categories` tree + `product_category_links` + `primary_category_id`; API `/product-categories` + assignment
- FE: Asortyment `/categories` (drzewo + CRUD), `/size-tables` placeholder, zakÄ¹âadka Kategorie na karcie produktu
- Model gotowy pod przyszÄ¹âe generatory SKU/katalog, VAT, etykiety, atrybuty, marketplace

## 2026-08-05 Ã¢â¬â ZdjÃâ¢cia: zawsze biaÄ¹âe tÄ¹âo + Oferty jak Sellasist

- Galeria / nagÄ¹âÄÅwek / miniatury: `bg-white` pod zdjÃâ¢ciem produktu (zakaz szarego tÄ¹âa)
- Oferty: chrome Sellasist (sekcje kanaÄ¹âÄÅw + tabela ID/Konto/Nazwa/Stan/Cena/Status)

## 2026-08-05 Ã¢â¬â Edycja produktu: Generuj kody + cleanup tabÄÅw + wspÄÅlna Historia

- Generuj: dodatkowy EAN, Symbol, Numer katalogowy; persist `catalog_number`
- Historia czynnoÄ¹âºci: wspÄÅlny panel pod kaÄ¹Ä½dÃâ¦ zakÄ¹âadkÃâ¦ (`objectType=product`)
- Produkcja/Magazyn: usuniÃâ¢te zbÃâ¢dne teksty techniczne / angielskie dopiski

## 2026-08-05 Ã¢â¬â Etykieta: przywrÄÅÃâ¡ RetailLabel + spolszczone pola w podglÃâ¦dzie szablonu

- Gotowa etykieta: z powrotem `RetailLabel` (finalny wydruk produktu)
- PodglÃâ¦d szablonu: ten sam ukÄ¹âad, wartoÄ¹âºci = polskie nazwy pÄÅl (bez `{{}}` i bez tekstÄÅw technicznych)

## 2026-08-05 Ã¢â¬â Edycja produktu: multi-EAN + Drukuj (Podstawowe)

- UI: wiele EAN (+ Dodaj / UsuÄ¹â), Drukuj przy EAN produktu i EAN kartonu, bez Metryczne/Imperialne
- BE: `extra_barcodes` sync na create/update; `ean_override` w `/labels/product`
- Print modal: etykieta z nadpisanym EAN dla wybranego kodu

## 2026-08-05 Ã¢â¬â Edycja produktu: Ceny final (bez banera TEST)

- `ProductEditPricesTab` dopiÃâ¢ty do `ceny karta produktu.html` (bez probe banera)
- Hierarchia: Kalkulacja | Dostawcy / Ostatni zakup / Podsumowanie; handlery bez zmian

## 2026-08-04 Ã¢â¬â Edycja produktu: Oferty 1:1 z HTML (FE only)

- `ProductSalesOffersSection` wg `oferrty karta produktu.html` (karta marketplace, ZwiÄ¹â/RozwiÄ¹â, tabela)
- Handlery/API ofert sprzedaÄ¹Ä½owych (outlet, pool, cena) bez zmian; bez DataTable

## 2026-08-04 Ã¢â¬â Edycja produktu: ZdjÃâ¢cia 1:1 z HTML (FE only)

- Nowy `ProductEditImagesTab` wg `zdjecia karta produktu.html`
- Dodaj URL + Wgraj z pliku; lista rekordÄÅw (miniatura, URL, GÄ¹âÄÅwne / W gÄÅrÃâ¢ / W dÄÅÄ¹â / UsuÄ¹â)
- Wire w ProductEditModal; handlery/API bez zmian

## 2026-08-04 Ã¢â¬â Edycja produktu: Produkcja 1:1 z HTML (FE only)

- `ProductManufacturingPanel` + `CompositionVisualEditor` wg `produkcja karta produktu.html`
- Banner, receptura (skÄ¹âadniki grid, BOM), sidebar: zuÄ¹Ä½ycie / historia / koszt / wersje
- Bez DataTable; SASIST Input/Checkbox/Button/Badge; API/logika bez zmian

## 2026-08-04 Ã¢â¬â Edycja produktu: Magazyn 1:1 z HTML (FE only)

- Nowy `ProductEditWarehouseTab` wg `magazyn karta produktu.html` (sekcje Stan i lokalizacje + Parametry logistyczne)
- Kafle lokalizacji (kolor typu + zajÃâ¢toÄ¹âºÃâ¡/progress); kolumna magazynÄÅw; Korekta stanu
- Wire w ProductEditModal; handlery/API/model bez zmian

## 2026-08-04 Ã¢â¬â Edycja produktu: Ceny 1:1 z `ceny karta produktu.html` (FE only)

- `ProductEditPricesTab`: ukÄ¹âad 2/3+1/3, tabela HTML dostawcÄÅw, Ostatni zakup, Podsumowanie (szary footer Zysk/RentownoÄ¹âºÃâ¡)
- SASIST Input/MoneyInput/Textarea/Select/Button/Radio; bez DataTable/MetricCard/sticky
- Handlery / API / model danych bez zmian

## 2026-08-04 Ã¢â¬â Edycja produktu: Podstawowe v2 z HTML (FE only)

- `ProductEditBasicTab` Ã¢â â layout 1:1 z `podstawowy karta produckut v2.html` (grid 7/5)
- Producent / GPSR rozdzielone; walidacja ProduktÃÂ·PartieÃÂ·Opakowanie; szablon z gated search
- Historia = `ActivityLogPanel` (jak zamÄÅwienia); Gabaryty jednostkowe; bez zmian API/handlerÄÅw

## 2026-08-04 Ã¢â¬â Edycja produktu: Podstawowe DOM 1:1 z HTML (FE only)

- Nowy `ProductEditBasicTab`: section/div jak `podstawowe karta produktu.html` (bez ProductLikeSection)
- SASIST Input/Select w slotach; handlery/API bez zmian
- Historia: chrome HTML + `ActivityLogPanel`; Producent/GPSR + Walidacja poza mockiem (zachowane)
- Bez commita

## 2026-08-04 Ã¢â¬â Edycja produktu: zakÄ¹âadka Ceny (FE only)

- 65/35: Kalkulacja cenowa (MoneyInput) ÃÂ· Dostawcy (DataTable) ÃÂ· Ostatni zakup ÃÂ· sticky Podsumowanie
- MetricCard (zysk) + StatusBadge (marÄ¹Ä½a %); bez zmian API / walidacji / hookÄÅw
- Dodano cienkie DS: `MoneyInput`, wspÄÅlny `DataTable`

## 2026-08-04 Ã¢â¬â Edycja produktu: UX jak mock HTML (FE only)

- Header: breadcrumb + nazwa + ZamÄÅw / Drukuj / Kopiuj+WiÃâ¢cej / Zapisz
- Hero: zdjÃâ¢cie, tenant, ID, SKU, EAN + 3 duÄ¹Ä½e statystyki (stan / cena / marÄ¹Ä½a)
- Tabs: brand TabsNav (pomaraÄ¹âczowy underline); basic = Cards 65%/35%
- Historia czynnoÄ¹âºci = `ActivityLogPanel` objectType=product (jak ZamÄÅwienia)
- Backend / API / routing / walidacja / hooki Ã¢â¬â bez zmian

## 2026-08-04 Ã¢â¬â Pulpit: TabsNav zamiast accordionÄÅw

- UsuniÃâ¢te PulpitSection (accordion); zakÄ¹âadki Decyzja/Alerty/Operatorzy/Kolejki/Dostawy/Historia via istniejÃâ¦cy TabsNav
- Route `pulpit/*`; treÄ¹âºÃâ¡ Centrum tylko dla aktywnej zakÄ¹âadki
- Backend / API / hooki Ã¢â¬â bez zmian

## 2026-08-04 Ã¢â¬â Rename ZarzÃâ¦dzanie/Magazyn + Pulpit jak Produkcja

- Sidebar: ZarzÃâ¦dzanie (Pulpit/KolejnoÄ¹âºÃâ¡/Raporty/Plan) + Magazyn (LayoutÃ¢â¬Â¦ProtokoÄ¹ây); bez WÄÅzkÄÅw/Inwentaryzacji w flyoucie
- Pulpit: DS PageHeader + MetricCard + Card (wzorzec ProductionDashboard) Ã¢â¬â bez hero/landing
- Backend / routing Ã¢â¬â bez zmian

## 2026-08-04 Ã¢â¬â UX Magazyn: ujednolicenie do Layout System 2.0

- UsuniÃâ¢te lewe menu RaportÄÅw i Planu zmian Ã¢â â `TabsNav` (jak Zakupy/Produkcja)
- Pulpit / KolejnoÄ¹âºÃâ¡ / PrzeglÃâ¦d: `PageHeader`, karty DS, tabela, filtry, bez `font-black` / `max-w-2xl`
- IA / routing / backend / funkcjonalnoÄ¹âºÃâ¡ Ã¢â¬â bez zmian

## 2026-08-04 Ã¢â¬â IA Magazyn: flyout Magazyn + Administracja + Pulpit sekcje

- Sidebar: Ã¢â¬Å¾MagazynÃ¢â¬Å¥ (Pulpit ÃÂ· KolejnoÄ¹âºÃâ¡ ÃÂ· Raporty ÃÂ· Plan); Ã¢â¬Å¾Administracja magazynemÃ¢â¬Å¥ (peÄ¹âna lista + WÄÅzki + Inwentaryzacja ERP; bez szablonÄÅw etykiet)
- Pulpit: ShiftConductor + zwijane sekcje z embed Centrum (Alerty / Operatorzy / Kolejki / Dostawy / Historia)
- Raporty: index = AnalysisDashboard (PrzeglÃâ¦d); wszystkie raporty podÄ¹âÃâ¦czone
- Backend / API / Engine Ã¢â¬â bez zmian

## 2026-08-03 Ã¢â¬â Pulpit jako przebieg zmiany (nie dashboard)

- ShiftConductor: status Ã¢â â decyzja Ã¢â â efekt Ã¢â â CTA Ã¢â â potem; kontekst schowany
- UsuniÃâ¢te widgety sekcji (alerts/status/crew/secondary jako osobne bloki)
- Tabs Raporty/Plan niewidoczne na Pulpicie
- Backend / Engine / API Ã¢â¬â bez zmian

## 2026-08-03 Ã¢â¬â Pulpit jako strona gÄ¹âÄÅwna ZarzÃâ¦dzania

- UsuniÃâ¢ty landing (3 kafle) i tab Ã¢â¬Å¾PrzeglÃâ¦dÃ¢â¬Å¥; `/zarzadzanie-magazynem` Ã¢â â `/pulpit`
- Pulpit przebudowany produktowo: decyzje Ã¢â â stan Ã¢â â alerty Ã¢â â obciÃâ¦Ä¹Ä½enie Ã¢â â stopka
- OdÄ¹âÃâ¦czone embed Centrum Operacyjnego; bez Ä¹âºciany KPI
- Backend / Engine / API Ã¢â¬â bez zmian

## 2026-08-03 Ã¢â¬â IA: hub ZarzÃâ¦dzanie + Administracja L1

- FE only: `/zarzadzanie-magazynem` (hub Ã¢â â pulpit / raporty / plan-zmian)
- Administracja: `/administracja-magazynem` jako L1 (nie flyout); usuniÃâ¢ty osobny wiersz Ustawienia WMS
- Decyzje = sekcja Pulpitu (Ã¢â¬Å¾Co zrobiÃâ¡ terazÃ¢â¬Å¥); bez `#decyzje`
- Redirecty: SF / operations / centrum / stary pulpit Ã¢â â `/zarzadzanie-magazynem/pulpit`; analytics Ã¢â â raporty; optymalizacja Ã¢â â plan-zmian
- WMS: usuniÃâ¢te wpisy supply_flow + operations z rejestru moduÄ¹âÄÅw
- Backend / Engine / API Ã¢â¬â bez zmian

## 2026-08-03 Ã¢â¬â IA: trzy stanowiska Magazyn

- FE only: menu/routing/nazwy; Pulpit kierownika wchÄ¹âania Centrum + Decyzje (SF UI)
- UsuniÃâ¢te z WMS Home: PrzepÄ¹âyw dostaw, Operacje
- Redirecty starych URL Ã¢â â `/pulpit-kierownika`
- Backend / Supply Flow Engine Ã¢â¬â bez zmian

## 2026-08-03 Ã¢â¬â PrzepÄ¹âyw dostaw: UX prowadzenia zmiany (audyt)

- Pierwszy viewport: alert + 1 karta uwagi + CTA; Dlaczego w karcie (Ã¢â°Â¤2)
- Co dalej Ã¢â°Â¤3 + Ã¢â¬Å¾+ jeszcze XÃ¢â¬Å¥; plan ukryty w Ã¢â¬Å¾SzczegÄÅÄ¹ây planuÃ¢â¬Å¥; stan = 1 wiersz
- Jedno Ã¢â¬Å¾OdÄ¹âºwieÄ¹Ä½Ã¢â¬Å¥; jÃâ¢zyk magazynowy; powrÄÅt z WMS = zakoÄ¹âczone + nastÃâ¢pne
- Backend / Engine / API Ã¢â¬â bez zmian

## 2026-08-03 Ã¢â¬â PrzepÄ¹âyw dostaw: przebudowa UX kierownika

- WyÄ¹âÃâ¦cznie FE: hierarchia Alerty Ã¢â â Uwaga Ã¢â â Co dalej Ã¢â â Dlaczego Ã¢â â Plan pracy Ã¢â â Stan magazynu
- Mapper `shiftBoard.ts` tÄ¹âumaczy plan API na jÃâ¢zyk magazynu (bez score / polityk / klas)
- UsuniÃâ¢te stare panele architektury (Execution board, config, raw priorities)
- Backend / Engine / Event Pipeline / API Ã¢â¬â bez zmian

## 2026-08-03 Ã¢â¬â Supply Flow UX (Living Plan)

- API: GET/POST plan+recompute, GET/PATCH config (`/api/wms/supply-flow`)
- FE: `/wms/supply-flow` Ã¢â¬â CTA, Execution board+monitor, Explainable, dostawy, config
- ModuÄ¹â WMS `supply_flow` w menu / home (daily)
- Bez przebudowy Engine / Event / Priority / Explainable / Planner / Monitor

## 2026-08-03 Ã¢â¬â Capability Pack 4: Execution Monitor

- Pakiet `execution_monitor/`: ExecutionStatus, ExecutionState, ExecutionMonitor
- Overlay na ExecutionPlan (seq); Ä¹ÅrÄÅdÄ¹âo: zdarzenia WMS (start/finish unload/putaway, cancel, fail)
- Dispatcher syncuje stan po batchu; start/cancel/fail bez recompute Engine
- Testy: 33 passed

## 2026-08-03 Ã¢â¬â Capability Pack 3: Execution Planner

- `ExecutionPlanner` + `ExecutionPlan` / `ExecutionStep` (status PLANNED)
- PorzÃâ¦dkuje Recommendation 1:1 (seq, goal, delivery_groups, recommendation_ref)
- Plan: `projection.execution_plan`; bez zmiany decyzji Engine
- Testy CP3 + suite supply_flow

## 2026-08-03 Ã¢â¬â Capability Pack 2: Explainable Decision

- `ExplainableDecisionBuilder` + model `ExplainableDecision` (projekcja only)
- Konsumuje Recommendation, `priority_contributions` (z PriorityResolver), BusinessEffect
- Plan: `explainable_decisions` + `recommendation.explanation`
- Bez confidence / why_not / konfliktÄÅw / kolejek / Cross Dock / symulacji
- Testy: 25 passed

## 2026-08-03 Ã¢â¬â PriorityResolver Ã¢â â PriorityPolicy architecture

- Pakiet `pipeline/priority/`: Context, Contribution, Policy protocol, aggregator
- Policies: Phase, ETA, Demand, Recovery, Capacity, Slotting (CP1 math 1:1)
- `PriorityResolver` tylko buduje Context i sumuje Contribution
- Alias `DeliveryPriorityFactors` = `PriorityContext`; testy CP1 zielone (22 passed)
- Bez Explainable / confidence / why_not

## 2026-08-03 Ã¢â¬â Supply Flow Capability Pack 1: dynamic priority

- `PriorityResolver`: multi-factor (phase/ETA/wait/open PZ/unlockable Recovery orders/capacity/slotting)
- READ: delivery `product_ids`, recovery `shortage_links`, slotting `slotted_product_ids`
- `BusinessEffectBuilder` czyta PriorityResolution (unlock estimate + top priority)
- CandidateActionBuilder bez zmian logiki priorytetÄÅw
- Testy CP1 + suite supply_flow

## 2026-08-03 Ã¢â¬â Supply Flow ETAP 3C: decision pipeline

- Pakiet `services/supply_flow/pipeline/`: CandidateAction / Priority / BusinessEffect / CTA / Recommendation builders + runner
- Engine tylko: gather_input Ã¢â â DecisionPipeline.run Ã¢â â upsert plan
- RecommendationBuilder = czysta projekcja ranked actions (bez ifÄÅw biznesowych)
- Testy: 19 passed

## 2026-08-03 Ã¢â¬â Supply Flow ETAP 3B: Engine v1 (prosta logika)

- `engine_input.py` + `analysis.py`: rekomendacje fazowe, priorytet deterministyczny, business_effect jakoÄ¹âºciowy
- READ: inventory/recovery/slotting/capacity(DOCK)/putaway open PZ Ã¢â¬â agregaty SSOT
- Plan `stage=v1_simple`; CTA Ã¢â â istniejÃâ¦ce Ä¹âºcieÄ¹Ä½ki WMS
- Testy: 16 passed; bez ML / explainable / kolejek

## 2026-08-03 Ã¢â¬â Supply Flow ETAP 3A: Event Pipeline

- Pakiet `services/supply_flow/events/`: types, buffer, publisher, dispatcher, handlers
- WMS publikuje wyÄ¹âÃâ¦cznie `publish_supply_flow_event` (receiving/putaway/delivery)
- Dispatcher: dedupe, group(warehouse), debounce (flush window), priority Ã¢â â 1Äâ recompute
- Testy: 13 passed; bez algorytmÄÅw

## 2026-08-03 Ã¢â¬â Supply Flow ETAP 2: wiring WMS

- Hooki: `finish_wms_receiving_pz`, `finalize_wms_relocation_pz`, `create_delivery`, `update_delivery`
- `orchestration.advance_toward_phase` (graf + macierz, bez sync osi zakupowej)
- Soft CTA/next Ã¢â â `/wms/receiving`, `/wms/putaway`, `/goods-orders`
- Putaway READ: SQL agregaty statusÄÅw PZ; Engine stage=`wiring`
- Testy: 8 passed; bez UI / algorytmÄÅw

## 2026-08-03 Ã¢â¬â Supply Flow ETAP 1 zaakceptowany

- Po fixie config + macierz uÄ¹Ä½ytkownik zaakceptowaÄ¹â zamkniÃâ¢cie ETAPU 1
- ETAP 2 nie rozpoczÃâ¢ty

## 2026-08-03 Ã¢â¬â Supply Flow ETAP 1: fix audytu (config + macierz)

- `SupplyFlowWarehouseConfig` (tenant+warehouse): `optimization_goal`, `planning_horizon_hours`
- UsuniÃâ¢to goal/horizon z `SupplyFlowPlan`; Engine czyta config, plan = wynik
- `PURCHASE_OPERATIONAL_PHASE_MATRIX` Ã¢â¬â walidacja kombinacji, bez nadpisywania osi
- Schema: bez seed sync statusÃ¢â âphase; migracja legacy kolumn planu Ã¢â â config
- Testy: 5 passed

## 2026-08-03 Ã¢â¬â Supply Flow ETAP 1: fundament backendu

- `operational_phase` + historia na dostawie; Living `SupplyFlowPlan` (projekcja)
- Pakiet `services/supply_flow`: Engine szkielet, recompute triggers (TODO hooks), adaptery READ/WRITE
- Schema: `ensure_supply_flow_schema`; bez UI / algorytmÄÅw

## 2026-08-02 Ã¢â¬â Audyt wizualny Analizy (przeglÃâ¦darka)

- PrzejÄ¹âºcie caÄ¹âego hubu w UI; znaleziono 14 widocznych EN fraz
- Centrum: pick-face/stock/OMS/putaway/replenishment/priority_* Ã¢â â PL (API + render)
- Raporty: Unknown Product Ã¢â â Nieznany produkt
- Re-check w przeglÃâ¦darce: 0 EN w treÄ¹âºci Analizy

## 2026-08-02 Ã¢â¬â PL UI: Centrum operacyjne + Analysis leftovers

- CentrumOperacyjnePage: DeadlineÃ¢â âTermin, TimelineÃ¢â âOÄ¹âº czasu, StockÃ¢â âStan
- PickingStrategyPage: CART/BASKET/ZONE/HYBRID Ã¢â â WÄÅzek/Koszyki/Strefy/Hybryda; vsÃ¢â âwzglÃâ¢dem
- BundleIntelligence PriorityBadge: Wysoki/Ä¹Å¡redni/Niski; InventoryValue: backendemÃ¢â âsystemem
- SalesForecast NOT_ENOUGH_MSG i PickingAnalysis: juÄ¹Ä½ PL, bez zmian

## 2026-08-02 Ã¢â¬â PeÄ¹âna polonizacja UI hubu Analizy

- UsuniÃâ¢to EN z Centrum/RaportÄÅw/Optymalizacji (Idle/Score/Scan, vs, CARTÃ¢â¬Â¦, Plan/Ranking Ã¢â â harmonogram/klasyfikacja)
- Prognoza: mapowanie EN message z API; zestawy: polishRecommendation (bundle/pick-face)
- Audyt skryptowy UI stringÄÅw: 0 pozostaÄ¹âych EN z listy zakazanej
- Backend bez zmian

## 2026-08-02 Ã¢â¬â warehouse_id: wspÄÅlny scope Analizy/Optymalizacja

- Mechanizm: `useWarehouseApiScope` / `buildWarehouseParams` / `AnalizyWarehouseSelect`
- Naprawione m.in. Bundle Intelligence (brakowaÄ¹âo `warehouse_id` Ã¢â â 422) + walking-cost, hot-locations, pick-density, picking-analysis, slotting, strategy, sales-forecast, pick-route/orders
- Ä¹ÄrÄÅdÄ¹âo: aktywny magazyn z `WarehouseContext` (bez lokalnych `/warehouses/` na ekranach WH-scoped)
- Backend bez zmian

## 2026-08-02 Ã¢â¬â Analizy P0/P1: produkcyjna spÄÅjnoÄ¹âºÃâ¡ UI

- Polonizacja (Centrum, kompletacja, ukÄ¹âad, placeholdery)
- CTA/nagÄ¹âÄÅwki/KPI/side-nav: tokeny `analizyUi` + brand orange
- Loading z nagÄ¹âÄÅwkiem; empty Plan/Ranking z CTA czasownikami
- Mapa magazynu: `AnalysisDecisionHeader` + CTA

## 2026-08-02 Ã¢â¬â Audyt jakoÄ¹âºci hubu Analizy (pre-release)

Werdykt: **nie gotowy do wydania** bez poprawy EN w UI + Manifest na Mapie magazynu + ujednolicenia CTA/headerÄÅw.
SzczegÄÅÄ¹ây w raporcie sesji (Ã¢Åâ¦/Ã¢Å¡Â /Ã¢Å¥Å). Legacy stubÄÅw brak; thin re-exporty analyticsÃ¢â âAnalysis nadal uÄ¹Ä½ywane.

## 2026-08-02 Ã¢â¬â IA v2: PrzeglÃâ¦d / Raporty (bez Ã¢â¬Å¾Analizy Ã¢â â AnalizyÃ¢â¬Å¥)

- ZakÄ¹âadki hubu: PrzeglÃâ¦d ÃÂ· Centrum operacyjne ÃÂ· Raporty ÃÂ· Optymalizacja
- Mapa magazynu w bocznym menu RaportÄÅw; usuniÃâ¢te martwe wrappery (batch/rotation/density/walking-cost)
- PL w UI (ukÄ¹âad towaru, zestawy, rotacja); breadcrumbs Centrum uproszczone

## 2026-08-02 Ã¢â¬â IA: jeden hub Analizy w sidebarze

- UsuniÃâ¢to osobne pozycje sidebaru: Centrum operacyjne, Optymalizacja
- Jedna pozycja: **Analizy** Ã¢â â `/analytics` (Pulpit startowy)
- `AnalizyModuleLayout` + sekcje: Pulpit ÃÂ· Centrum operacyjne ÃÂ· Analizy ÃÂ· Optymalizacja
- Routing i logika biznesowa bez zmian; tylko Information Architecture

## 2026-08-02 Ã¢â¬â Faza 4 zaakceptowana

- ZamkniÃâ¢cie pÃâ¢tli: Realizacja Ã¢â â Ocena Ã¢â â Historia
- Produkt kompletny jako cykl zarzÃâ¦dzania magazynem (nie Enterprise)

## 2026-08-02 Ã¢â¬â Faza 4: Realizacja + ocena + historia zmian

- Status Ã¢â¬Å¾ZweryfikowanaÃ¢â¬Å¥; cykl Ä¹Ä½ycia zamkniÃâ¢ty
- Historia zmian magazynu (`/optymalizacja/historia`) Ã¢â¬â decyzje biznesowe
- Ocena PRZED/PO/RÄÅÄ¹Ä½nica z realnych odczytÄÅw (walking-cost); inaczej Ã¢â¬Å¾Oczekuje na daneÃ¢â¬Å¥
- Ranking skutecznoÄ¹âºci (`/optymalizacja/ranking`) Ã¢â¬â tylko zweryfikowane z deltÃâ¦
- Bez nowych analiz/KPI/wykresÄÅw

## 2026-08-02 Ã¢â¬â Plan zmian: statusy, Ä¹ÅrÄÅdÄ¹âo, realizacja

- Statusy: Nowa / Zaplanowana / W realizacji / WdroÄ¹Ä½ona / Odrzucona
- Ä¹ÄrÄÅdÄ¹âo rekomendacji (originLabel) + efekt (metryka lub Wysoki/Ä¹Å¡redni/Niski wpÄ¹âyw)
- Ã¢â¬Å¾Wybierz sposÄÅb realizacjiÃ¢â¬Å¥ Ã¢â â Projektant / MM / Strategia / Centrum / WMS
- Migracja planu FE v1 Ã¢â â v2

## 2026-08-02 Ã¢â¬â Optymalizacja: jeden Plan zmian magazynu

- WspÄÅlny plan FE (`warehouseChangePlanStore`) Ã¢â¬â rekomendacje z 3 analiz
- Landing = pulpit planu (ile czeka / wpÄ¹âyw / co pierwsze)
- CTA: Ã¢â¬Å¾Dodaj do planu zmianÃ¢â¬Å¥ / Ã¢â¬Å¾Dodaj strategiÃâ¢ do planuÃ¢â¬Å¥
- Strona `/optymalizacja/plan` Ã¢â¬â lista, priorytet, wpÄ¹âyw, usuÄ¹â, Ä¹ÅrÄÅdÄ¹âo, wdroÄ¹Ä½enie

## 2026-08-02 Ã¢â¬â Optymalizacja Faza 3 v1

- Landing `/optymalizacja` (ukÄ¹âad / strategia / trasy+dystans)
- `OptimizationToolHeader` + `OptimizationPlanPanel` Ã¢â¬â kaÄ¹Ä½de narzÃâ¢dzie koÄ¹âczy siÃâ¢ planem
- Walking cost Ã¢â â Optymalizacja (scalenie z trasami); usuniÃâ¢te z nav Analiz
- Slotting: plan przesuniÃâ¢Ãâ¡ A; Strategia: zapis rekomendacji; Trasy: plan skrÄÅcenia drogi

## 2026-08-02 Ã¢â¬â Analizy Faza 2: Manifest (pytanie Ã¢â â decyzja Ã¢â â CTA)

- Dashboard Analiz = landing decyzyjny (max 7 kart, bez backend health)
- `AnalysisDecisionHeader` na raportach + bezpoÄ¹âºrednie CTA
- Scalenie: product-rotation / batch-picking Ã¢â â hot-products; pick-density Ã¢â â hot-locations
- Sub-nav Analizy skrÄÅcony do 9 pozycji hubowych

## 2026-08-02 Ã¢â¬â Analizy Faza 1: Split Centrum

- Centrum operacyjne Ã¢â â `/centrum-operacyjne` (top-level, poza Analizami)
- Analizy: Dashboard = landing `/analytics` (bez peer-tab)
- Optymalizacja Ã¢â â `/optymalizacja` (slotting, strategia, trasy)
- Mapy usuniÃâ¢te z menu; logika mapy zachowana
- PL etykiety UI (bez zmiany nazw technicznych API/plikÄÅw)

## 2026-08-02 Ã¢â¬â Analizy Faza 0: Hygiene

- UsuniÃâ¢to z menu/nav 6 stubÄÅw (dzieÄ¹â, czas, ruch, layout, throughput, problemy kompletacji)
- Stare URL Ã¢â â redirect do dziaÄ¹âajÃâ¦cych powierzchni
- UsuniÃâ¢to orphan AnalysisLayout + analysisTabs + pliki stubÄÅw
- Batch pick-route: FE Ã¢â â prawdziwy silnik (`order_ids`); legacy `/batch/` deleguje zamiast licznikÄÅw debug

## 2026-08-02 Ã¢â¬â WMS: tryby operacyjne vs uprawnienia moduÄ¹âÄÅw

- UsuniÃâ¢to z trybÄÅw: Operacje, WÄÅzki, QC, Dokumenty, Analiza, Zakupy, Szablony etykiet
- Nowe liÄ¹âºcie uprawnieÄ¹â: `warehouse.carts`, `warehouse.qc`, `documents.view`, `analytics.view`, `purchasing.view` (+ reuse `warehouse.operations`, `workforce.ops.label_templates`)
- Migracja JSON trybÄÅw Ã¢â â `user_permissions`; Operacje gated przez `requiredPermission`
- Guard: profile tylko z hubami legacy nie sÃâ¦ zerowane do `[]` (to otwieraÄ¹âoby wszystkie tryby floor)

## 2026-08-02 Ã¢â¬â Document logo: data-URI embed + company.logo

- Przyczyna: branding zapisuje `/uploads/...`, ale preview/PDF nie osadzaÄ¹ây pliku (relative src + `file://` w Puppeteer)
- Fix: `upload_media_embed` Ã¢â â data URI; `company.logo` w global context; `document_header` czyta teÄ¹Ä½ `branding.logo_url`
- Tymczasowe logi `[doc.logo]`

## 2026-08-01 Ã¢â¬â RMZ: inline Uszkodzone/Odrzucone

- Zamiast drawera: rozwijany panel w karcie produktu (height+opacity ~220ms)
- Accordion: tylko jedna karta naraz; badge decyzji po zapisie
- Klasa A/B/C + checklist typÄÅw; odrzucenie: kategoria Ã¢â â powody

## 2026-08-01 Ã¢â¬â RMZ detail: spÄÅjnoÄ¹âºÃâ¡ z Panelem ZamÄÅwienia

- UsuniÃâ¢ty widget + CTA Ã¢â¬Å¾Terminal WMSÃ¢â¬Å¥; dostÃâ¢p tylko z menu Ã¢â¹Â® gdy WMS aktywny
- UsuniÃâ¢ty badge Ã¢â¬Å¾W trakcieÃ¢â¬Å¥; etykieta listy = `PanelBulkStatusPickerDropdown` / `PanelTreeStatusItem`
- Decyzje produktu: samodzielne segmented buttons (bez szarego kontenera)
- Prawa kolumna: etykieta Ã¢â â notatki Ã¢â â postÃâ¢p Ã¢â â dziennik Ã¢â â dokumenty; kompaktowe karty produktÄÅw

## 2026-08-01 Ã¢â¬â Lista zwrotÄÅw: status panelu + kolumny

- Kolumna Status = `PanelTreeStatusItem` (ten sam co sidebar); bez szarych kapsuÄ¹â
- UsuniÃâ¢ty przycisk/akcja WMS z listy; wybÄÅr kolumn DnD + autosave + PrzywrÄÅÃâ¡ domyÄ¹âºlne

## 2026-08-01 Ã¢â¬â Zwroty: redesign widgetÄÅw detail

- Karty SaaS (`ReturnDetailWidgetShell`), produkty jako karty + segmented decyzje
- Status badge, progress bar, timeline dziennik, KPI podsumowanie/stats
- Terminal WMS ukrywany przy `inventory_management_mode=DOCUMENTS_ONLY`
- Konfigurator bez zmian

## 2026-08-01 Ã¢â¬â Formularz zwrotu klienta: nowy layout

- Osobna strona 70/30, karty produktÄÅw, sticky podsumowanie; bez tabel
- Ã¢â¬Å¾Dodaj do zwrotuÃ¢â¬Å¥ Ã¢â â zielony stan + pola; IBAN dopiero przy przelewie
- Operator `OrderCaseCreateView` nietkniÃâ¢ty

## 2026-08-01 Ã¢â¬â Panel statusÄÅw: wyrÄÅwnanie lewej krawÃâ¢dzi

- Mniejszy lewy padding powÄ¹âoki (`pl-0.5`); bez wciÃâ¢Ãâ¡ `pl` na listach/podgrupach
- WspÄÅlna linia: Wszystkie / grupy / podgrupy / kafelki; ciaÄ¹âºniejszy mt grupaÃ¢â âstatus

## 2026-08-01 Ã¢â¬â Zwroty/reklamacje UX polish + formularz klienta

- Dropdown bez pustego stanu / WMS; Formularz zwrotu Ã¢â â ekran klienta
- Messages/docs bez Ã¢â¬Å¾PrzejdÄ¹Å doÃ¢â¬Â¦Ã¢â¬Å¥; scroll do wiadomoÄ¹âºci w Komunikacji
- `displayCustomerComment` odcina logi systemowe z komentarza klienta

## 2026-08-01 Ã¢â¬â Zwroty/reklamacje: tworzenie w Panelu ZamÄÅwienia

- Nowy zwrot/reklamacja w `OrderCaseCreateView` (produkty + summary), nie redirect WMS
- Header bez Spakuj; menu Dokumenty tylko wystawione + wystaw sprzedaÄ¹Ä½owy/magazynowy
- Po create: karta w Panelu; RMZ nadal w module WMS

## 2026-08-01 Ã¢â¬â Modal ZamieÄ¹â produkt: redesign wizualny

- Bez ramek przy zdjÃâ¢ciach; filtry segmentowe; lÄ¹Ä½ejsze badge; zwarta lista
- Kafelki Ã¢â¬Å¾Najlepsze dopasowaniaÃ¢â¬Å¥ + scroll; footer: Zamieniany produkt + checkbox
- Logika search/filtrÄÅw bez zmian

## 2026-08-01 Ã¢â¬â Order header: Sellasist popover UX

- Ikony Ã¢â â dropdown (nie modal); modal tylko przy wprowadzaniu danych
- Returns/messages/docs/link/copy/print przebudowane na context menu
- Link: lista + Ã¢â¬Å¾PoÄ¹âÃâ¦cz noweÃ¢â¬Â¦Ã¢â¬Å¥ Ã¢â â modal; Copy: 3 opcje Ã¢â â formularz

## 2026-07-24 Ã¢â¬â Panel statusÄÅw: wyciszone liczniki

- UsuniÃâ¢te kolorowe pastylki; maÄ¹âe okrÃâ¦gÄ¹âe badge ~26px (biaÄ¹âe + ramka)
- Tint badge tylko dla aktywnego wiersza; kolor kategorii na pasku/kropce
- Grupy: ten sam spokojny badge (nie solid); nazwa > licznik, hover = tÄ¹âo wiersza

## 2026-07-24 Ã¢â¬â Order header actions toolbar (mockup)

- 6 ikon 36Äâ36: zwroty, wiadomoÄ¹âºci, dokumenty, poÄ¹âÃâ¦cz, kopiuj, drukuj
- Panele/modale w `headerActions/`; badge zgÄ¹âoszeÄ¹â + wiadomoÄ¹âºci
- Link lokalny (localStorage); copy UI gotowe pod API
- Zachowane: pin, bookmark, Spakuj

## 2026-07-24 Ã¢â¬â Panel statusÄÅw: UI pod mockup (tylko prezentacja)

- Grupy: kropka + uppercase + solid badge + lock + chevron; wiÃâ¢ksze odstÃâ¢py
- Statusy: kafelki z ramkÃâ¦/hover/active + soft badge; podgrupy uppercase
- Search pill; collapsed: kropka/pasek + badge bez nazw
- Bez zmian filtrowania / licznikÄÅw / API

## 2026-07-24 Ã¢â¬â Fix Ã¢â¬Å¾Oznacz jako czekaÃ¢â¬Å¥ (no auto-pick)

- `compute_line_missing_qty`: waiting nie zeruje braku; `line_shortage_display_kind` Ã¢â â `waiting` first
- Packing: nie inflate `picked_quantity_final` przy `oms_waiting_for_stock`
- Audit: `emit_oms_decision_wait` z `operator_user_id` + komunikat produktu; patch endpoint przekazuje usera
- UI: badge CZEKA/OCZEKUJE (karta produktu, workflow pick, Braki detail)

## 2026-07-24 Ã¢â¬â Dokumenty i pliki: polish pod mockup

- Karty Dokumenty/ZaÄ¹âÃâ¦czniki/LP: gÃâ¢stsza tabela, badge statusÄÅw, ujednolicone akcje
- Toolbar zaznaczania + CTA Dodaj plik; bez zmian logiki dokumentÄÅw/API

## 2026-07-24 Ã¢â¬â Komunikacja: centrum komunikacji pod mockup

- 8/4: compose + historia korespondencji | AI + klient + notatki/komentarz
- Bubble UI z istniejÃâ¦cych `orderNotes`; kanaÄ¹ây/szablony/Sugestia AI lokalnie; bez zmian API wysyÄ¹âki

## 2026-07-24 Ã¢â¬â Logi: journal UX pod mockup

- Lekka tabela (czas+status, wykonawca, zdarzenie, efekt); sort newest/oldest; paginacja
- Szukaj + Filtruj (severity/daty przez istniejÃâ¦ce parametry API); bez zmian backend/logiki

## 2026-07-24 Ã¢â¬â Produkty i magazyn: karty 1:1 mockup (UX only)

- Lista Ã¢â â osobne karty (thumb contain, meta, metryki, wartoÄ¹âºÃâ¡, kebab); zestawy Ã¢â¬Å¾Zestaw zawieraÃ¢â¬Å¥
- Braki / zamienniki / usuniÃâ¢te jak mockup; footer WMS z lokalizacjÃâ¦ + badge + operator
- Sticky prawa kolumna (KPI + timeline); opakowania: galeria rekomendacja+alternatywy
- Bez zmian API / modeli / logiki WMS; peÄ¹âna funkcjonalnoÄ¹âºÃâ¡ zachowana

## 2026-07-31 Ã¢â¬â Podsumowanie: final commercial polish

- Zwarte 4 kolumny kontekstu; produkty `text-3xl`; prawa kolumna jako jeden panel
- Kompaktowe empty: Wideo / listy; notatki 2 linie + auto-grow; cichszy Safe Order
- Ship/pay ZapiszÃ¢â¬âAnuluj tylko dirty; bez usuwania funkcji; bez ponownych logÄÅw

## 2026-07-31 Ã¢â¬â Dopasowane opakowanie: kompaktowa karta rekomendacji

- Jeden nagÄ¹âÄÅwek sekcji; bez diagnostyki Smart Matching na wierzchu (SzczegÄÅÄ¹ây)
- 2 kolumny: rekomendacja + placeholder/wybÄÅr; badge REKOMENDOWANY / Hybryda / PewnoÄ¹âºÃâ¡ / WypeÄ¹ânienie / Tryb
- Miniatury produktÄÅw i kartonÄÅw: `object-contain`, bez ramek/tÄ¹âa/cieni

## 2026-07-31 Ã¢â¬â Karta ZamÄÅwienia: przywrÄÅcenie peÄ¹ânej funkcjonalnoÄ¹âºci

- CofniÃâ¢to nadmierne uproszczenia density pass: peÄ¹âne opakowania, Safe Order, chipy WMS, Listy przewozowe, Wideo WMS, WiadomoÄ¹âºÃâ¡ do klienta, peÄ¹âny chrome kart
- Przyciski Spakuj / Dodaj produkt / Dodaj zestaw na Podsumowaniu (te same modale co zakÄ¹âadka Produkty)
- SposÄÅb wysyÄ¹âki / pÄ¹âatnoÄ¹âºÃâ¡: Zapisz+Anuluj tylko przy dirty draft
- Bez kasowania moÄ¹Ä½liwoÄ¹âºci; mockup = tylko hierarchia/kompozycja

## 2026-07-30 Ã¢â¬â Karta ZamÄÅwienia: final product UX pass

- UsuniÃâ¢to stuby (puste Wideo, faÄ¹âszywy composer wiadomoÄ¹âºci Ã¢â â link do Komunikacji)
- Opakowania tylko gdy jest treÄ¹âºÃâ¡; sticky panel finansowy; max-w 1680
- GÃâ¢stszy info strip, produkty jako pas centralny, kompaktowe empty/CTA
- Bez zmian API/logiki

## 2026-07-30 Ã¢â¬â Karta ZamÄÅwienia: UX density / hierarchia (summary)

- Status peÄ¹âny (bez truncate), jak makieta; jedna etykieta grupy
- Produkty jako pas centralny; mniej ramek; niÄ¹Ä½sze wiersze; wrap meta
- Prawa kolumna = jeden panel (`aside`) zamiast stosu kart
- Opakowania `operatorQuiet` (bez silnik/pewnoÄ¹âºÃâ¡); puste sekcje kompaktowe
- ZacieÄ¹âºnione paddingi/gapy; `max-w-[1440px]`; bez zmian API/logiki

## 2026-07-30 Ã¢â¬â Karta ZamÄÅwienia: przebudowa UX wg makiety (summary)

- Tokeny + `OrderDetailInfoColumn` / `OrderDetailProcessStatusRow`
- NagÄ¹âÄÅwek (numer dashed) + status/proces + stepper z istniejÃâ¦cego WMS pick/pack
- Podsumowanie: 4 kolumny info, tabela produktÄÅw (compact), siatka 8/4, notatki/logi
- Bez zmian backend/API/logiki

## 2026-07-30 Ã¢â¬â Automatyzacje: wspÄÅlne summary na liÄ¹âºcie + historii

- Extract: `AutomationConditionSummary`, `AutomationEffectSummary` (edytor + lista + historia)
- Lista: max 3 warunki/efekty, `+N kolejnychÃ¢â¬Â¦`, expand jednego wiersza, bez ORAZ/LUB
- Historia: `groupChangeLogEntries` (ruleId+userId+sekunda/Ã¢â°Â¤2s) Ã¢â â jedna karta / save; badge + tone diff
- Bez zmian API / `computeRuleChangeLogEntries`

## 2026-07-30 Ã¢â¬â Edytor automatyzacji: exclusive Auto/RÃâ¢cznie + layout SaaS

- Kafelki przeÄ¹âÃâ¦czajÃâ¦ fokus UI Ã¢â¬â pokazywana tylko konfiguracja wybranego trybu
- Auto: 2 kolumny (opÄÅÄ¹Ånienie/tryb | dni+harmonogram), wiersze dni z dividerami
- RÃâ¢cznie: wyglÃâ¦d+podglÃâ¦d 2 kol., widocznoÄ¹âºÃâ¡ w siatce, skrÄÅt i Ã¢â¬Å¾Sprawdzaj warunkiÃ¢â¬Å¥ jako osobne karty
- Badge JEÄ¹Å¡LI = orange jak TO

## 2026-07-30 Ã¢â¬â Edytor automatyzacji: layout 1:1 (v2)

- Jedna karta Ã¢â¬Å¾Ustawienia wykonaniaÃ¢â¬Å¥: kafle + 2 kolumny (tryb | dni/godziny)
- Dni PnÃ¢â¬âNd: rÄÅwna szerokoÄ¹âºÃâ¡, selected = brand orange
- JEÄ¹Å¡LI/TO: wiersze jak select/operator/wartoÄ¹âºÃâ¡ + menu Ã¢â¹Â® (IconButton); edycja nadal modal
- Dolny pasek: tylko Anuluj; Zapisz w nagÄ¹âÄÅwku; UsuÄ¹â przy historii

## 2026-07-29 Ã¢â¬â Edytor automatyzacji: UI 1:1 z projektem

- NagÄ¹âÄÅwek w karcie: Nazwa / Grupa / toggle Aktywna (emerald) / Test / Zapisz
- Kafelki Automatycznie / RÃâ¢cznie (Przycisk) z brand orange selected
- Harmonogram: CiÃâ¦gÄ¹ây / godziny / dni+godziny; karty per dzieÄ¹â (wspÄÅlne windowFrom/To w modelu)
- JEÄ¹Å¡LI / TO: badgeÃ¢â¬â¢e, dashed CTA, okrÃâ¦gÄ¹âa strzaÄ¹âka; bez zmian logiki/modali edycji

## 2026-07-29 Ã¢â¬â Profile wydruku na stanowisku

- SSOT: `backend/printing_profiles/` (`DOCUMENT_TYPE_TO_PRINT_PROFILE`, profile codes)
- Stanowisko mapuje drukarkÃâ¢ Ã¢â â profil (nie dokument / moduÄ¹â WMS)
- Migracja `print_profiles_v1`: legacy `labels|shipping_label|invoice|order|other` Ã¢â â profile; collapse DOCUMENTS
- FE `PrintersTab`: tylko 4 profile; `resolvePrintRoute` przez `profilesForPrinterKind`
- Resolution kolejki: `printer_resolution_service` Ã¢â â `document_type_to_print_profile`

## 2026-07-29 Ã¢â¬â Browser PDF open + Agent GDI deploy

- `openPdfBlobInPrintViewer`: otwiera natywny blob PDF (bez HTML embed / bez noopener)
- Agent 1.4.0 zainstalowany in-place na E-HANDEL: `PdfShellPrint=False`, `WindowsGdiDocumentPrinter=True`, `PDFtoImage`+`pdfium` w Program Files; Host PID start 20:16:59
- DowÄÅd pipeline: `pdf-driver.log` Ã¢â â `pipeline=PDFium->GDI`

## 2026-07-29 Ã¢â¬â PodglÃâ¦d szablonÄÅw wydrukÄÅw = render (jak etykiety)

- WspÄÅlny `TemplatePreviewShellModal`; etykiety i dokumenty uÄ¹Ä½ywajÃâ¦ tego samego chrome
- Lista wydrukÄÅw: Ã¢â¬Å¾PodglÃâ¦dÃ¢â¬Å¥ Ã¢â â PDF z silnika (`preview/pdf`), Ã¢â¬Å¾UÄ¹Ä½yciaÃ¢â¬Å¥ osobno; usuniÃâ¢to OtwÄÅrzÃ¢â âFirma z usage modal
- Karty: klik miniatury = podglÃâ¦d, body = edytor

## 2026-07-29 Ã¢â¬â Agent: PDF przez renderer, nie RAW

- `PdfPrintDriver`: PDFium (`PDFtoImage`) Ã¢â â bitmap Ã¢â â GDI `PrintDocument` (STA); **bez** `WindowsRawSpooler`
- `WindowsRawSpooler` tylko ZPL/EPL/ESC-POS/PCL/PostScript/raw (`RawPrintDriver`)
- `DriverFactory` (alias `PrintDriverResolver`): switch format Ã¢â â `IPrintDriver`; dodano Image + native language tokens
- Lokalny Ã¢â¬Å¾Druk testowyÃ¢â¬Å¥ tray nadal `PrintDocument` (GDI) Ã¢â¬â ta sama klasa Ä¹âºcieÄ¹Ä½ki co PDF po renderze

## 2026-07-29 Ã¢â¬â Print dialog: szablon + miejsce wydruku

- Nowy `PrintDocumentDialog`: szablon (DTE), stanowisko (drukarka + Online/Offline), alternatywy PDF/przeglÃâ¦darka
- Prefs `sasist_print_document_prefs_v1` per typ dokumentu
- `default_printer_name` na liÄ¹âºcie stanowisk; `template_version_id` w queue (stock/sale/production)
- UsuniÃâ¢to z UX sÄ¹âowa Agent / kolejka / mapowanie

## 2026-07-29 Ã¢â¬â Print UX: packing session Ã¢â°Â  wszystkie wydruki

- `resolvePrintWorkstation` + `usePrintMethodFlow`: sesja pakowania **lub** available-for-me (1=auto, N=picker Online/Offline)
- DomyÄ¹âºlnie Agent (bez pierwszego ekranu Agent/PrzeglÃâ¦darka/PDF); alternatywy dopiero Ã¢â¬Å¾Inna metodaÃ¢â¬Å¥ / offline / brak Agent
- Callery: dokumenty magazynowe/sprzedaÄ¹Ä½, produkcja, zwroty, Z-PZ, LabelPrintQueue
- Test print stanowiska bez zmian (workstation_id z edycji)
- UsuniÃâ¢to Ã¢â¬Å¾Rozpocznij pakowanieÃ¢â¬Â¦Ã¢â¬Å¥ z Ä¹âºcieÄ¹Ä½ek poza gate pakowania

## 2026-07-29 Ã¢â¬â Print pipeline: packing session SSOT only

- Print FE (`usePrintMethodFlow`, `useQueuePrint`, `resolvePrintRoute`) reads only `packingSessionWorkstationId()` Ã¢â¬â no auth/me
- Without session Ã¢â â Ã¢â¬Å¾Rozpocznij pakowanie i wybierz stanowisko.Ã¢â¬Å¥
- Test page Ã¢â â WorkstationPrinterMapping (no PrintingDefaults); PrintJob.workstation_id set
- HistoryTab Ã¢â â PrintJobs by workstation_id
- device_count skips EdgeDevice with legacy_printer_id (align with DevicesTab)

## 2026-07-29 Ã¢â¬â Stanowisko SSOT + Pakowanie (final architecture)

- UsuniÃâ¢to Settings Ã¢â â UrzÃâ¦dzenia/Drukarki (menu + strony); redirect `/settings/printers|devices|/setup/printers` Ã¢â â Stanowiska
- `user_wms_workstation_access` + `workstation_ids` w profilu WMS; admin checkboxy w AdministratorEditPage
- Gate tylko `/wms/packing/*` (`WmsPackingWorkstationGate`); sesja v3 = SSOT `workstationId`; `packing_station_id` = last-used
- Queue/capability: workstation mapping only (`NO_WORKSTATION` / `NO_WORKSTATION_MAPPING`); PrintJob: `workstation_id` + `created_by_user_id`
- Bez auto-fallback QZ/browser w `executePdfLabelPrint` / `resolvePrintRoute`

## 2026-07-29 Ã¢â¬â Printing cleanup po Sasist Agent

- `cloud-capability` Ã¢â â Stanowisko + Agent online + mapowanie (bez `PrintingDefault`); query `workstation_id`
- FE: `usePrintMethodFlow` bierze `packing_station_id`; QZ tylko w `import.meta.env.DEV`
- `/settings/printers/*` Ã¢â â redirect do Ustawienia WMS Ã¢â â Stanowiska; usuniÃâ¢to tab Ã¢â¬Å¾Druk (kolejka)Ã¢â¬Å¥ z UrzÃâ¦dzeÄ¹â

## 2026-07-29 Ã¢â¬â Fix DTE Jinja loader for extends/include (production-card.pdf)

- Root: `_render_plain` / incomplete resolved sets used Environment(loader=None) or DictLoader without `base_document`
- Fix: `resolve_plain_twig` + `_ensure_system_dependencies` load filesystem BASE/PARTIALS into DictLoader
- Files: `_engine_backend.py`, `template_resolution_service.py`, `system_starter_library.py`

## 2026-07-29 Ã¢â¬â production-card.pdf HTTP 500 root cause


- Cause: DTE starter `production_card` uses `{% extends "base_document" %}` but `resolve_plain_twig` Ã¢â â `_render_plain` (no Jinja loader) Ã¢â â `TypeError: no loader for this environment specified` Ã¢â â unhandled 500
- Fix: `document_engine_available` returns False for plain extends starters (legacy Jinja path); full `logger.exception` on PDF/HTML path + API re-raise after log
- File/line: `backend/document_templates/render/_engine_backend.py` `_render_plain` ~L85

## 2026-07-29 Ã¢â¬â Stanowiska = zakÄ¹âadka UstawieÄ¹â WMS (FE UX only)


- Shared `WmsSettingsChrome` + `WMS_SETTINGS_TABS` (Stanowiska as last tab Ã¢â â `/settings/wms/workstations`)
- Removed header CTA Ã¢â¬Å¾StanowiskaÃ¢â¬Å¥; breadcrumbs: Ustawienia WMS Ã¢â â Stanowiska Ã¢â â [nazwa]
- Dropped `max-w-3xl` / private PageLayout shells; list rows + `WmsSettingsSection` / tokens
- Detail full-width; Agent status panel; Devices category cards + compact empty; Printers settings rows; History timeline + icons
- `useWmsSettingsSectionAnchor` no-op outside registry (sections usable without side nav)

## 2026-07-29 Ã¢â¬â Stanowiska UX + nawigacja (FE)


- Shared shell: `WorkstationTabShell`, `WorkstationCard`, `DeviceCard`, `WsStatusBadge`, `WorkstationDescList` (`max-w-3xl`)
- Tabs rebuilt: Agent description cards; Devices device cards; Printers mapping cards + Skonfigurowano badges; History timeline cards
- Nav: removed Stanowiska from DevicesSettingsModule tabs; devices index Ã¢â â inventory (not workstations); tests assert WMS category active, Settings/UrzÃâ¦dzenia inactive

## 2026-07-29 Ã¢â¬â Stanowiska: Drukarki empty state vs UrzÃâ¦dzenia

- Root cause: Devices = EdgeDevice; Printers mapping = AgentPrinter only (empty after token-only pair)
- Fix: edge sync + GET devices/printers materialize AgentPrinter + legacy_printer_id; empty state only when zero discovered printers
- FE: mapping form copy; placeholder Ã¢â¬Å¾wybierz drukarkÃâ¢Ã¢â¬Å¥
- Test: `test_printers_tab_uses_edge_discovered_printers`

## 2026-07-29 Ã¢â¬â Pairing blocker: Host crashed on spent pairing code

- Root cause: Tray persisted pairing code as `agent_api_key`; Host `EnsureRegisteredAsync` re-claimed it Ã¢â â 401 Ã¢â â no heartbeat
- Fix: Tray does not store pairing code; Host clears pairing-shaped ApiKey and skips register when token present
- Proven: register skip + heartbeat 200 + online + 4 devices against Railway
- TEMP diag logs (no secrets) on Agent/Backend/FE

## 2026-07-29 Ã¢â¬â Sasist Agent Tray UI/UX (SaaS desktop)

- Visual-only: Theme radii/typography/shadows, header (logo+name+badge+version), sidebar without brand block, PageShell centered max 960, Pairing onboarding card + SasistTextField 48px, soft status pills
- Build: Tray Release OK

## 2026-07-28 Ã¢â¬â Onboarding E2E: pairing code visible + flow


- Root cause: naive `expires_at` Ã¢â â FE local parse Ã¢â â immediate expire; poll cleared code; POST /pair then GET refetch race
- Fix: UTC-aware expires_at; FE parseApiUtcMs + sessionStorage code; no destructive refresh after pair; poll grace; default Agent tab; post-pair Ã¢â â Devices Ã¢â â Printers + test print
- Tests: pairing expires_at timezone assertion

## 2026-07-28 Ã¢â¬â WMS Stanowiska RC1 (Red Team blockers)


- RC1-1: no auto-pick workstation; `workstation_id` via `useQueuePrint` / session `packing_station_id` / label router; mapping then PrintingDefault
- RC1-2: removed Restart Agent UI + FE API client (`restartWorkstationAgent`)
- RC1-3: tenant stays panel SSOT (`DAMAGE_TENANT_ID` / `panelTenant`) Ã¢â¬â FE not inventing tenant truth beyond app pattern

## 2026-07-28 Ã¢â¬â WMS Stanowiska Medium/Low + Final audit (~92% PR)


- M1: batch serialize, history offset, pairing-status poll, visibility pause, event index
- M2/M3: FE split + Empty/Error states; warehouse filter; no tab double-fetch
- M4: business logs; no secrets; GET agents DEBUG
- M5/M6/Low: API cleanup, AddComputerModal removed, ApiKeys dead branches, Agents deprecation
- Deferred: is_default partial unique, settings.users permission pattern, Agents ops page
- Canvas final audit updated

## 2026-07-28 Ã¢â¬â WMS Stanowiska High Priority H1Ã¢â¬âH7

- H1: AgentTab poll 2.5s + TTL expire + auto Ã¢â¬Å¾PoÄ¹âÃâ¦czonoÃ¢â¬Å¥
- H2: `claim_pairing_code` CAS single-use, rate-limit IP, audit issue/claim/fail
- H3: system keys hidden from API Keys; mutate blocked; workstation revoke/regen with allow flag
- H4: `assert_tenant_warehouse_scope` + tenant/warehouse checks on attach/claim
- H5: restart-agent Ã¢â â 501 bez eventu historii
- H6: re-pair disconnect-first; `pairing_active` z hash+TTL
- H7: empty state + download + status/PC/OS/version/IP/uptime/sync
- Tests: 12 passed (`backend.tests.wms_workstations`)
- Audyt #2: High 7/7 closed; Prod readiness ~75%; Medium/Low open

## 2026-07-28 Ã¢â¬â WMS Stanowiska C1Ã¢â¬âC3 production blockers

- C1: `resolve_queue_printer_id` Ã¢â â WorkstationPrinterMapping (SSOT) then PrintingDefault fallback; `workstation_id` on QueuePrintRequest
- C2: `register_agent_with_api_key` no longer commits; register+attach+events one transaction
- C3: one-shot `wms_data_migrations`; no keyÃ¢â âempty-WS hijack
- Tests: 15 passed (workstations + print resolution)

## 2026-07-28 Ã¢â¬â WMS Stanowiska (miejsce pracy Ã¢â°Â  komputer)

- Model: `wms_workstations` + printer_mappings + events; 1 Agent max na stanowisko
- API: `/api/wms/workstations*` (pair/disconnect/devices/printers/history)
- Pair: kod `XXXX-XXXX-XXXX` 15 min Ã¢â â register Agenta bez zmian protokoÄ¹âu
- FE: lista + 5 zakÄ¹âadek; jÃâ¢zyk biznesowy; API Keys bez tworzenia printer_agent
- Redirect: Devices/agents, AddComputer, setup/printers Ã¢â â Stanowiska
- Migracja idempotentna agentÄÅw/kluczy Ã¢â â stanowiska (Tier1 schema)
- Testy: `backend/tests/wms_workstations/` Ã¢â¬â 5 passed

## 2026-07-28 Ã¢â¬â Release: restore self-contained (no .NET Runtime)

- Root cause: `bin\Release` (FDD) was copied over install; runtimeconfig had `frameworks[]`
- Pipeline OK: `publish-release.ps1` uses `--self-contained true -r win-x64`; Inno sources `publish\win-x64`
- Added Assert-SelfContained gate (refuse ship if `frameworks[]` / missing coreclr)
- Fresh setup: `dist\SasistAgentSetup.exe` (~50 MB); publish ~163 MB; installed Tray has `includedFrameworks`

## 2026-07-28 Ã¢â¬â Sasist Agent Design System

- Central Theme tokens (colors, Space 4Ã¢â¬â48, Type scale DisplayÃ¢â âHint)
- Component kit in `DesignSystem/`; all pages wired to DS (no local styles)
- Empty states on Devices/Jobs/Logs; Motion pulse for loading
- Layout smoke PASS 100Ã¢â¬â200%; shots in `dist/ui-shots/`
- MVP/poll/backend untouched

## 2026-07-28 Ã¢â¬â Sasist Agent UI quality: MVP + no flicker

- Root cause of flicker: timer called full page rebuild (`Controls.Clear`) every poll
- Fix: `ShellPresenter` / `IPageView` Ã¢â¬â structure once; poll updates labels/cards in place only
- Sidebar: `TableLayoutPanel` AutoSize rows; width from longest nav label
- Layout smoke PASS 100Ã¢â¬â200% (incl. 175%); stability 60s: rebuilds=0
- Cosmetics still frozen until UI stays stable

## 2026-07-27 Ã¢â¬â Sasist Agent layout foundation (DPI freeze)

- Fixed: PerMonitorV2 + AutoScaleMode.None; removed Absolute/Location layouts; AutoSize labels; card PreferredSize
- `--layout-smoke` audits clip/overlap at simulated 100/125/150/200% Ã¢â¬â all PASS
- Visual redesign paused until layout stays green

## 2026-07-27 Ã¢â¬â Sasist Agent 1.2.0 UI from scratch (Sasist DS)

- Discarded prior WinForms polish; new shell (top bar + 320px sidebar + pages)
- Tokens from FE design-system; custom cards/buttons/nav/toggles; PerMonitorV2, AutoScale none
- Pages: Status 6 cards, Devices printer cards, History list, Logs filters, Diagnostics sections, Test checklist, Settings rows+toggles, Updates card
- Screenshots: `sasist-agent/dist/ui-shots/`

## 2026-07-27 Ã¢â¬â Sasist Agent 1.1.1 modern UI redesign

- Theme system (light/dark), Fluent icons, rounded cards, modern nav
- Pages: Status cards, Devices cards + test print, Jobs timeline, color Logs, sectioned Diagnostics, Test suite, Settings, Updates
- No architecture/backend/protocol changes

## 2026-07-27 Ã¢â¬â Sasist Agent 1.1.0 desktop product window

- MainForm management center (Status / Devices+test / Jobs / Logs / Diagnostics / pairing)
- Installer: PrepareToInstall stop+taskkill before copy; version 1.1.0; CloseApplications=force
- Verified upgrade 1.0.0Ã¢â â1.1.0 silent: exit 0, no DeleteFile code 5; service Auto+Running; Tray MainWindowTitle=Sasist Agent

## 2026-07-27 Ã¢â¬â Sasist Agent customer UX (Tray)

- Status / UrzÃâ¦dzenia / Diagnostyka as separate windows; no tech IDs on main screen
- Pairing: Ã¢â¬Å¾PoÄ¹âÃâ¦cz z SasistÃ¢â¬Å¥ + Ã¢â¬Å¾Kod poÄ¹âÃâ¦czeniaÃ¢â¬Å¥ only; tray menu simplified (PoÄ¹âÃâ¦czono, not Online)
- Friendly errors; updates copy: Ã¢â¬Å¾Masz zainstalowanÃâ¦ najnowszÃâ¦ wersjÃâ¢.Ã¢â¬Å¥
- INSTALACJA.md rewritten for warehouse owners

## 2026-07-27 Ã¢â¬â Stage 5 Final Cutover (Agent product)

- Official path only: `sasist-agent` Ã¢â â `SasistAgentSetup.exe`
- Root build/release/CI retargeted; Python agent Ã¢â â `legacy/sasist-printer-agent`
- Backend download default `SasistAgentSetup*` (+ legacy prefix compat)
- Report: `docs/sasist-agent/STAGE5-CUTOVER-REPORT.md`

## 2026-07-27 Ã¢â¬â Sasist Agent UX pairing (pre-release)

- UsuniÃâ¢to Server URL z UI; API wbudowane (`https://api.sasist.pl`, Dev: env / appsettings.Development)
- Ekran Ã¢â¬Å¾Kod parowaniaÃ¢â¬Å¥ + Tray: Online, firma, urzÃâ¦dzenia, OdÄ¹âÃâ¦cz, branding (logo/ico)
- Przyjazne bÄ¹âÃâ¢dy; `company_name` w odpowiedzi register; `status.json` dla Tray
- Docs: INSTALACJA.md uproszczona pod klienta

## 2026-07-27 Ã¢â¬â E2E install test + ship fixes

- Full client-path E2E on Windows; report: `sasist-agent/dist/E2E-REPORT.md`
- Fixes: ProgramData ACL, plugin parameterless ctor, re-register printers, HttpClient BaseAddress, PDF spooler under LocalSystem, Host wait-for-config
- Final `SasistAgentSetup.exe` rebuilt after fixes

## 2026-07-27 Ã¢â¬â Sasist Agent Windows installer (ship)

- Tray (`Sasist.Agent.Tray`): Online/Offline, logi, diagnostyka, restart usÄ¹âugi, setup URL+API Key Ã¢â â DPAPI + register
- `scripts/publish-release.ps1` Ã¢â â `publish/win-x64` + `dist/SasistAgentSetup.exe` (Inno Setup)
- Instalator: usÄ¹âuga `SasistAgent`, ProgramData, config.default, Menu Start, start usÄ¹âugi
- Docs: `sasist-agent/INSTALACJA.md`

## 2026-07-27 Ã¢â¬â Architecture RC v1.0

- Core purged of Printing; `IAgentTransport` + ModuleRegistry + plugin loader
- Host `CompatPrintingTransport`; DPAPI secrets; ACL/replay/rate-limit; no legacy register
- Docs: ARCHITECTURE/RC-1.0/security/FREEZE aligned; WS marked Planned
- Designation: SASIST AGENT ARCHITECTURE v1.0 RELEASE CANDIDATE

## 2026-07-27 Ã¢â¬â Architecture audit (pre-1.0)

- Read-only validation: Core still holds printing compat + hardcoded job routing Ã¢â â not v1.0 Ready
- Scores & blockers in session report; docs overclaim WS/`/api/agent/v1`
- Plugin drop-in false until Host/runtime generic; registry/EventBus OK

## 2026-07-27 Ã¢â¬â Edge Computing Core: Device Registry + delta sync

- SDK/Core: config, healthScore, DeviceEventBus, differential sync, remote actions (Refresh/Diagnostics/Logs)
- Backend: `edge_devices*` tables + `/agent/devices/sync|actions|events`
- FE: `/settings/devices` hierarchy; scaffolds Scanner/Scale/Camera/RFID
- ADR-007; printing compat retained

## 2026-07-27 Ã¢â¬â Edge Device Management foundation

- SDK: `EdgeDevice`, `CapabilityDescriptor`, operational status, remote action contracts
- Core: `DeviceManager` + `RefreshDevices`; Printing uses `WindowsPrinterDeviceProvider`
- Backend parallel: `/api/agent/devices`, `/device/{id}`, `/modules` (projection from printers)
- FE: `frontend/src/devices/*`; Settings Ã¢â¬Å¾UrzÃâ¦dzeniaÃ¢â¬Å¥ + type filters; `/printing` kept
- Docs: device.md, ARCHITECTURE, OpenAPI, ADR-006

## 2026-07-27 Ã¢â¬â Label cutover: PrintingRouter + prefer_sasist_agent

- Central `frontend/src/printing/router` (resolve, execute PDF labels, telemetry)
- Z-PZ / Return Labels / LabelPrintQueue routed via flag + zpl gate; QZ kept as fallback
- PrintMethodDialog: Sasist Agent first; QZ Legacy behind Ã¢â¬Å¾PokaÄ¹Ä½ metody awaryjneÃ¢â¬Å¥
- Smoke: `docs/sasist-agent/smoke-cutover-labels.md`

## 2026-07-27 Ã¢â¬â Sasist Agent Etap 1: drivers + capabilities + QZ map

- `IPrintDriver` Pdf/Zpl/Raw/Html; RAW spooler; PrintResult + logging
- Heartbeat `supported_formats` Ã¢â â `capabilities_json`; queue rejects unsupported formats
- `prefer_sasist_agent` (warehouse settings API + UI); `docs/sasist-agent/qz-migration-map.md` + TODOs (bez przepiÃâ¢cia)

## 2026-07-27 Ã¢â¬â Sasist Agent Etap 1: scaffold .NET

- `sasist-agent/`: Sdk + Core + Printing + Host (Windows Service worker)
- Compat `/api/printing` (PDF poll); diagnostics CLI; 4 unit tests
- Build Release OK; ZPL/RAW + installer + tray = kolejne incrementy

## 2026-07-27 Ã¢â¬â Sasist Agent: freeze protocol v1

- Decyzja uÄ¹Ä½ytkownika: `freeze v1`
- `docs/sasist-agent/FREEZE-v1.md`; Stage 0 w migration.md zamkniÃâ¢ty
- Etap 1 (.NET Host) odblokowany

## 2026-07-27 Ã¢â¬â Sasist Agent Etap 0: peÄ¹âny DoD dokumentÄÅw

- Pakiet `docs/sasist-agent/`: ARCHITECTURE, OpenAPI, WS protocol, plugin SDK, device, diagnostics, update, security, versioning, ADR-001..005, migration, README
- Gate: freeze protocol v1 przed Etapem 1 (.NET Host)

## 2026-07-27 Ã¢â¬â Sasist Agent: Etap 0 w planie + ARCHITECTURE.md

- Plan zaakceptowany z **Etapem 0 (Architektura)** przed kodem Host
- SSOT: `docs/sasist-agent/ARCHITECTURE.md` Ã¢â¬â Core, IAgentModule, agents/devices, protocol v1, API/WS, Module Bus
- Etapy: 0 Architektura Ã¢â â 1 Agent Ã¢â â 2 Backend Ã¢â â 3 FE Ã¢â â 4 Migracja Ã¢â â 5 Cleanup
- Tech: **.NET 8**; tabele extend w E2, rename w E5; poll = protocol 0 compat

## 2026-07-27 Ã¢â¬â Sasist Agent: architektura + plan migracji (analiza)

- Analiza `printing` + `sasist-printer-agent` + QZ; rekomendacja **.NET 8**
- Cel: uniwersalny edge agent (druk = moduÄ¹â); rename Sellasist/Cloud Print Ã¢â â Sasist Agent
- Plan: Agent Ã¢â â Backend Ã¢â â FE Ã¢â â migracja Ã¢â â usuniÃâ¢cie QZ/Sellasist (bez peÄ¹ânej implementacji w tej sesji)

## 2026-07-27 Ã¢â¬â Cloud Print: repair/queue bez Ä¹âºlepych 400/409

- `repair`: brak aktywnego agenta Ã¢â â 200 `{ success:false, reason:"NO_ACTIVE_AGENT" }` (bez 400)
- `GET /printing/cloud-capability` Ã¢â¬â ready tylko przy default + online agent
- FE `usePrintMethodFlow`: offline default Ã¢â â dialog, nie auto-queue; Cloud tile disabled
- Queue 409 z `code` (AGENT_OFFLINE / PRINTER_INACTIVE) jako fallback

## 2026-07-26 Ã¢â¬â StarterTemplateFlow (wspÄÅlny model starterÄÅw)

- `components/templates/starterFlow`: dialog + hook + staÄ¹âe CTA
- Starter immutable; CTA Ã¢â¬Å¾UÄ¹Ä½yj starteraÃ¢â¬Å¥; kreator kopii Ã¢â â edytor uÄ¹Ä½ytkownika
- Etykiety (presety) + wydruki (galeria/detail); ReadyTemplateCard `mode="starter"|"owned"`

## 2026-07-26 Ã¢â¬â PrintMethodDialog (systemowy wybÄÅr wydruku)

- WspÄÅlny dialog: `components/printing/PrintMethodDialog` + `usePrintMethodFlow`
- Gdy jest domyÄ¹âºlna drukarka Cloud (`/printing/defaults` A4) Ã¢â â od razu Cloud Print, bez okna
- W przeciwnym razie kafle: Drukuj / Sasist Cloud Print / Pobierz PDF
- PodpiÃâ¢te: karty produkcyjne + dokumenty magazynowe (lista/detail)
- Cloud queue: `production_batch_card`, `production_order_card`

## 2026-07-26 Ã¢â¬â Layout Master: wydruki = kompozycja Systemu Etykiet

- SSOT: `templatesListLayout.ts`, `readyTemplatesLayout.ts`
- Lista wydrukÄÅw: ten sam root/rail/toolbar/rows/grid co etykiety
- Gotowe/Startery: ten sam page/CTA/filter tabs/sections/grid/empty
- UsuniÃâ¢to lokalny Sellasist filter panel z wydrukÄÅw; CTA z PageHeader Ã¢â â in-page

## 2026-07-26 Ã¢â¬â Szablony = kategoria flyout (nie hub)

- UsuniÃâ¢to `TemplatesHubLayout` / tabs miÃâ¢dzy moduÄ¹âami
- Sidebar: Szablony (`opensSideFlyout`) Ã¢â â etykiety / wydruki / wiadomoÄ¹âºci / eksporty
- KaÄ¹Ä½dy moduÄ¹â: wÄ¹âasny PageHeader + wÄ¹âasne zakÄ¹âadki; `/templates` Ã¢â â redirect labels
- Docs IA + testy `settingsNavIa` / `phaseBIa` zaktualizowane

## 2026-07-26 Ã¢â¬â Szablony wydrukÄÅw = te same komponenty co etykiety

- UsuniÃâ¢to lokalne `DocumentStarterCard` / `DocumentTemplateListCard`
- Import: `ReadyTemplateCard`, `TemplateListRow`, `READY_TEMPLATES_GRID_CLASS` z LabelSystem
- UogÄÅlnione sloty `thumbnail` (bez drugiej wersji UI)

## 2026-07-26 Ã¢â¬â IA hub Szablony (superseded Ã¢â¬â flyout category)

- Historycznie: jeden wpis `/templates` z tabs miÃâ¢dzy sekcjami
- ZastÃâ¦pione: kategoria flyout bez hub screen (patrz wpis powyÄ¹Ä½ej)

## 2026-07-26 Ã¢â¬â Szablony wydrukÄÅw: powrÄÅt do ERP Design System

- Filtry: `ListFilterEmbeddedShell` + Filtruj/WyczyÄ¹âºÃâ¡/Ukryj (jak Produkty) Ã¢â¬â usuniÃâ¢to LightFilters
- Toolbar: `SuccessButton` Eksportuj + `PrimaryButton` Nowy szablon (bez Ã¢â¬Å¾WiÃâ¢cejÃ¢â¬Å¥)
- Lista: `ListTile` + `StatusBadge` + `SecondaryButton` (wzorzec Produkcja)
- Startery: layout Ready Templates (300px, gap-5, max 5 kolumn)

## 2026-07-26 Ã¢â¬â Szablony wydrukÄÅw UX polish (pass 2)

- Karty listy: hierarchia nazwaÃ¢â âtypÃ¢â âstatusÃ¢â âuÄ¹Ä½ywany jako/wÃ¢â âedycja; StatusBadge DS; Edytuj + menu WiÃâ¢cej
- Filtry: domyÄ¹âºlnie Szukaj/Typ/Status; reszta w Ã¢â¬Å¾WiÃâ¢cej filtrÄÅwÃ¢â¬Å¥
- Startery: produktowa hierarchia, staÄ¹âa miniatura 132px, siatka jak Label Ready
- Bez zmian API/logiki

## 2026-07-26 Ã¢â¬â Szablony wydrukÄÅw UI Ã¢â°Â System Etykiet

- Lista: karty zamiast tabeli ERP; lekkie filtry (Szukaj/Typ/Kategoria/Status/Ä¹ÄrÄÅdÄ¹âo + WiÃâ¢cej)
- Startery: kompaktowe karty (miniatura + SzczegÄÅÄ¹ây/UÄ¹Ä½yj); usuniÃâ¢te zbÃâ¢dne H1/podtytuÄ¹ây
- Primary CTA `brandPrimaryButtonClass`; spÄÅjnoÄ¹âºÃâ¡ spacing/radius/hover z Label System
- Bez zmian API / logiki biznesowej

## 2026-07-26 Ã¢â¬â Dokumentacja IA

- Dodano `docs/INFORMATION_ARCHITECTURE.md` (zasady, menu, kanony, legacy, przyszÄ¹âoÄ¹âºÃâ¡)
- Audyt IA uznany za zamkniÃâ¢ty w dokumentacji
- Bez zmian kodu aplikacji

## 2026-07-26 Ã¢â¬â IA final cleanup audit (bez kasowania)

- IA uznana za zakoÄ¹âczonÃâ¦; menu/routing spÄÅjne
- Kandydaci osobnego PR: BarcodeManagement, PickingWaves, PlanningPlaceholder, App BatchesListPage import, WmsProductionPutawayRedirect
- Canvas: `ia-final-cleanup.canvas.tsx`

## 2026-07-26 Ã¢â¬â IA Faza B: orphans / stuby

- Magazyn flyout: Szkody, ProtokoÄ¹ây szkÄÅd (`/office/damages*`) Ã¢â¬â bez nowego moduÄ¹âu Office
- Redirect: `/waves`Ã¢â â`/wms/picking`, `/planning/*`Ã¢â â`/purchasing/dashboard`, doc CFÃ¢â âorders, ksefÃ¢â âseries
- Legacy: `/inventory`; tech: `report/*` bez zmian; Barcode = DELETE_CANDIDATE (plik zostaje)
- Pliki stubÄÅw zachowane z komentarzami; testy phaseBIa + settingsNavIa OK

## 2026-07-26 Ã¢â¬â Kwalifikacja orphan routes (pre Faza B)

- Office Damages: produkcyjny (scaliÃâ¡/menu); report/*: tech Puppeteer
- Martwe UI: Barcode, Waves stub, Planning, KSeF, Doc custom-fields
- Legacy: /inventory; BE waves/inventory nie kasowaÃâ¡
- Bez zmian kodu Ã¢â¬â decyzja produktowa

## 2026-07-26 Ã¢â¬â KoÄ¹âcowy audyt IA (pre Faza B)

- Brak nowych dual-entry do tego samego ekranu po kanonie /labels
- Orphans/stuby: waves, planning, barcode, office, /inventory, /report/*
- Werdykt: globalne menu zamkniÃâ¢te; Faza B = lokalne Magazyn

## 2026-07-26 Ã¢â¬â IA: jeden System Etykiet (/labels)

- UsuniÃâ¢to Ustawienia Ã¢â â Szablony etykiet (duplikat)
- Redirect: `/admin/print-templates/*`, `/system-etykiet/*` (+ legacy prints) Ã¢â â `/labels/*`
- Bez zmian LabelSystem / API ÃÂ· testy settingsNavIa OK

## 2026-07-26 Ã¢â¬â IA Faza A: Ustawienia menu

- PrzywrÄÅcono: Import, Pule stanÄÅw, Drukarki, Szablony etykiet/dokumentÄÅw/wiadomoÄ¹âºci
- Rename: Ã¢â¬Å¾Szablony wydrukÄÅwÃ¢â¬Å¥ Ã¢â â Ã¢â¬Å¾Szablony etykietÃ¢â¬Å¥ (print-templates)
- Tylko mainNavConfig + navActive + test ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Audyt IA / nawigacji (raport)

- PeÄ¹âny przeglÃâ¦d App.tsx + mainNavConfig + pages; bez zmian kodu
- GÄ¹âÄÅwne luki UstawieÄ¹â po redesignie sidebara: drukarki, document-templates, import, message-templates, stock-pools
- Canvas raportu: `ia-navigation-audit.canvas.tsx`

## 2026-07-26 Ã¢â¬â Ustawienia: Szablony wydrukÄÅw w menu

- PrzywrÄÅcono pozycjÃâ¢ w flyoucie Ustawienia Ã¢â â `/admin/print-templates`
- Tylko nawigacja; test `settingsNavIa` zaktualizowany

## 2026-07-26 Ã¢â¬â Realizacja: produkcja + rozlokowanie UX

- Produkuj +1/+5 Ã¢â â ZakoÄ¹âcz produkcjÃâ¢; bez Ã¢â¬Å¾UzupeÄ¹ânij planÃ¢â¬Å¥
- Rozpocznij rozlokowanie (1 PW direct); usuniÃâ¢te Rozlokuj w wierszu
- Bez zmian API ÃÂ· tsc OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Realizacja papierowa: UX magazyniera

- NagÄ¹âÄÅwek: numer + status + postÃâ¢p; bez ERP/fioletu
- Karty lokalizacji (orange active); lot bez dropdown gdy 1
- Primary full-width PotwierdÄ¹Å pobranie ÃÂ· ProgressBar size lg
- Bez zmian API ÃÂ· tsc OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Nowe zlecenie: kafelki rekomendacji MRP

- Tiles DzisiajÃ¢â¬Â¦30 dni + Maksimum; qty sync; KPI bez opisÄÅw
- Dane z istniejÃâ¦cego demand planning + max_producible
- Bez zmian API create ÃÂ· tsc OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Zlecenia: UX kart + globalne tony statusÄÅw

- Filtry: Ã¢â¬Å¾WszystkieÃ¢â¬Å¥; bez Operator w toolbarze
- Karta bez Operatora; progress niebieski/zielony; Braki = warning
- `executionStatusTone` / `productionProgressTone` + tone `primary` (orange)
- Bez API/logiki ÃÂ· tsc OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Symulacja planu: UX empty state

- EmptyState z CTA; ukryte KPI/Create przy lines=0; zielony tylko przy produktach
- Bez zmian backend/MRP ÃÂ· tsc OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Symulacja planu: diagnostyka pustego wyniku

- `diagnostics` w odpowiedzi simulate (codes, skip_counts, empty_reason_*)
- Logi INPUT + SKIP/ACCEPT; UI pokazuje powÄÅd z API
- Bez zmiany filtrÄÅw MRP ÃÂ· testy OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Symulacja planu: empty/success UI

- Bug: pusty `materials[]` Ã¢â â komunikat Ã¢â¬Å¾Surowce wystarczajÃâ¦Ã¢â¬Å¥ + zera w KPI
- Empty state przy 0 produktach; Create disabled; loading bez zer
- Request simulate moÄ¹Ä½e dostaÃâ¡ `lines` z rekomendacji UI (bez zmiany MRP)
- **No push.**

## 2026-07-26 Ã¢â¬â SzczegÄÅÄ¹ây partii: UX jak dokument ERP

- PageHeader, StatusBadge, Card; bez fioletu / Ã¢â¬Å¾Interfejs ERPÃ¢â¬Å¥ / Ä¹Ä½ÄÅÄ¹âtego boxa
- Akcje: Rozpocznij produkcjÃâ¢, PrzejdÄ¹Å do realizacji, Drukuj kartÃâ¢, Anuluj
- Informacje 2-kol, wiÃâ¢kszy ProgressBar (orange), kompaktowy timeline
- Bez zmian API/routingu/stanÄÅw ÃÂ· `npm run build` OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Modal Ã¢â¬Å¾Nowa partia masowaÃ¢â¬Å¥ Ã¢â â Sasist UI Kit

- Dialog (xl, 85vh), Stepper, ListTile, Card, Primary/Secondary; bez fioletu
- UkÄ¹âad 1-kolumnowy; checkbox w Podsumowaniu; stopka Anuluj | UtwÄÅrz partiÃâ¢
- Bez zmian API/walidacji/krokÄÅw ÃÂ· `npm run build` OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Planowanie: ekran decyzyjny (UX)

- KPI Äâ4; rekomendacje = Card/produkt + 1Äâ UtwÄÅrz partiÃâ¢; usuniÃâ¢te 3 karty zbiorcze
- Tabela slim (bez osi czasu / Dlaczego / Rekom. / MoÄ¹Ä½na); pod aktywnymi partiami
- Aktywne partie: bez Operatora, StatusBadge, wyÄ¹Ä½sze wiersze; bez KPI embedded
- Symuluj/OdÄ¹âºwieÄ¹Ä½ w Toolbar; bez zmian API/MRP ÃÂ· `npm run build` OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â NagÄ¹âÄÅwki: ujednolicony vertical rhythm

- DS PageHeader: separator + items-center + toolbar mt-4 + children mt-4/5
- DocumentsSectionShell Ã¢â â DS PageHeader; layout PageHeader Ã¢â â typography.h1
- Produkcja ERP: treÄ¹âºÃâ¡ w children; usuniÃâ¢te `!space-y-*` / lokalne gap-y
- SettingsModuleStack: bez lokalnego border-t pod tytuÄ¹âem
- Bez API/logiki/routingu ÃÂ· `npm run build` OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â NagÄ¹âÄÅwki: jeden standard (Produkcja + audit)

- Produkcja ERP tabs: PageHeader Title+Actions; usuniÃâ¢te marketing opisy; CTA `comfortable`
- SecondaryButton default density Ã¢â â `comfortable` (jak Primary)
- Strip fluff: Dokumenty, Asortyment (zestawy/producenci), RentownoÄ¹âºÃâ¡, Settings, Analiza placeholders
- Empty states zostawione; bez API/logiki/routingu ÃÂ· `npm run build` OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Pulpit Produkcji: podglÃâ¦d, nie hub nawigacji

- UsuniÃâ¢to Terminal WMS / szybkie akcje / linki do terminali; listy peÄ¹ânej szerokoÄ¹âºci (max 5)
- KPI bez linkÄÅw; empty states uproszczone ÃÂ· `npm run build` OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Typografia Produkcji = standard DokumentÄÅw

- UI Kit `typography.ts`: h1/h2/section/label/caption/pageDesc/metric/body/tableHead wg Documents
- StatusBadge + density compact: floor `text-xs` (bez 10px); Production layout tokens + bump micro type
- Bez zmian layoutu/funkcji ÃÂ· `npm run build` OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Kreator zlecenia produkcyjnego (UX)

- `/production/orders/new`: Stepper + 3 sekcje; preview/create batch (istniejÃâ¦ce API)
- Planowanie = Symulacja MRP; create CTA osobno; highlight na liÄ¹âºcie zleceÄ¹â
- UI Kit: Stepper (nowy), Card, SearchInput, MetricCard, ProgressBar, StatusBadge
- `npm run build` OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Zlecenia produkcyjne: lista robocza (UI)

- `ProductionOrdersPage`: ListTile zamiast tabeli; Toolbar + SearchInput/Select; StatusBadge; ProgressBar gdy dostÃâ¢pny
- Mapowanie `progressPercent` z istniejÃâ¦cego `progress_percent`; menu akcji `align=end`
- Bez zmian API/routingu/logiki ÃÂ· `npm run build` OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Pulpit Produkcji: UX centrum operacyjnego

- `ProductionDashboardPage` + `ProductionDashboardBatchGrid`: biaÄ¹âe karty, KPI MetricCard, ProgressBar (+ ton `info`)
- Sekcje: Do rozlokowania / W produkcji / Gotowe do WMS / Uwaga + aktywnoÄ¹âºÃâ¡ / zakoÄ¹âczenia / szybkie akcje
- UI Kit only; bez zmian API/routingu/logiki ÃÂ· `npm run build` OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Szkody: lekki polish (bez przebudowy)

- Modal Magazyn uproszczony; Raporty = lista + Pobierz PDF
- Biuro: tabela + StatusBadge + badge decyzji + szukaj/filtr
- `npm run build` OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â UX Polish: Szkody (PL + UI Kit)

- `DamageReportsPanel` + Office damages/reports: peÄ¹âne spolszczenie UI
- WspÄÅlne `damageUiLabels.ts`; bez zmian API/logiki
- `npm run build` OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Magazyn: katalog tylko w widoku regaÄ¹âu

- PrzywrÄÅcono rail 360px w gÄ¹âÄÅwnym Magazynie (przed siatkÃâ¦ z 06da2001)
- `presentation="catalog"` wyÄ¹âÃâ¦cznie po dwukliku regaÄ¹âu
- `npm run build` OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â UX Polish: komunikaty Magazyn

- KrÄÅtkie dialogi/toasty/placeholdery/przyciski (Magazyn + projektowanie + trasy)
- UsuniÃâ¢to instrukcje typu Ã¢â¬Å¾KliknijÃ¢â¬Â¦ / MoÄ¹Ä½eszÃ¢â¬Â¦Ã¢â¬Å¥; bez zmian logiki/API
- `npm run build` OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â WarehouseModuleLayout + wspÄÅlny LeftRail

- `WarehouseModuleLayout` / `WarehouseLeftRail` / `WarehouseRailSection`
- Taby Magazyn | Projektowanie | Trasy; Eksport na belce; Trasy content w lewym railu
- Panele bez wÄ¹âasnego chrome; build OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Designer: regresje UI po migracji do UI Kit

- PrzywrÄÅcono widocznoÄ¹âºÃâ¡ Magazyn/Sklepowy oraz Drzwi/Brama (flex `min-w-0` zamiast dual `fullWidth`)
- Rail: biaÄ¹âe `surface.page`; active `ring-inset`; SegmentedControl gap + nowrap
- Generuj ukÄ¹âad Ã¢â â `SuccessButton`; build OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Etap 4: Warehouse Designer Ã¢â â Sasist UI Kit

- Migracja toolbar/rails/routing/modals/canvas tools na design-system
- UsuniÃâ¢to `warehouseUiSkin` Ã¢â â `warehouseChrome`; Primary `intent=warning`
- Residual: MainView editors + TemplateCreator + ciÃâ¢Ä¹Ä½kie modale
- Raport: `memory/ui-kit-designer-migration-report.md` ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Sasist UI Kit Etap 3 (hardening)

- ESLint `sasist-ui-kit`: blok magicznych klas / nowych wysp tokenÄÅw
- Density na komponentach; playground `/design-system`; README button rules
- UsuniÃâ¢to `WarehouseCardButton`; metryki `npm run ui-kit:metrics` ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Sasist UI Kit (Etap 1Ã¢â¬â2)

- `design-system/tokens/*` + komponenty (Button suite, Card, Input, Status, SegmentedControl, Toolbar, PageHeader, Ã¢â¬Â¦)
- Lokalne wyspy Ã¢â â fasady kit; Magazyn `CardButton` z design-system
- Raport: `memory/ui-kit-migration-report.md` ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â UI: ujednolicenie CardButton w Projektowaniu

- `WarehouseCardButton` Ã¢â¬â wspÄÅlny styl card (radius ~11, border, cieÄ¹â)
- Pasek: status tekstowy Ã¢â â select h-10 Ã¢â â Zapisz; bez badge
- PodpiÃâ¢te: Generuj/Nowy szablon, Magazyn/Sklep, Drzwi/Brama, Raporty/Szkody ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Domain: warehouse_special_placements

- Nowa tabela map markers (role + x/y); `locations` = toÄ¹Ä½samoÄ¹âºÃâ¡ operacyjna
- Migracja START/PACK/DOCK z locations Ã¢â â placements; clear special geometry
- DELETE/POST/PUT special-location Ã¢â â placements only; dokumenty nienaruszone
- `get_special_locations_xy` z placements ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â DELETE special-location: 409 zamiast RestrictViolation 500

- Pre-check `stock_documents.location_id`; uÄ¹Ä½ywane Ã¢â â rollback + HTTP 409 (PL msg)
- `IntegrityError` / `RestrictViolation` Ã¢â â 409 (nigdy 500); to samo przy replace PICK_START
- FE: snackbar przy 409; testy jednostkowe delete
- Architektura: preferowane odpiÃâ¢cie od layoutu zamiast hard DELETE gdy rekord jest w historii ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Skin: Projektowanie UI = Magazyn chrome

- WspÄÅlne `warehouseUiSkin.ts`; rails `#f7f8fa`, search ring/orange, karty `rounded-xl/2xl`
- Hall mapy + surround w layout mode; tool groups white+ring
- Bez zmian narzÃâ¢dzi / workflow / occupancy Magazynu w Projektowaniu ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â UX regaÄ¹âu: karta KPI (scanability)

- Inline detail: duÄ¹Ä½y % zajÃâ¢toÄ¹âºci + Ã¢â¬Å¾N z M lokalizacji zajÃâ¢tychÃ¢â¬Å¥; bez wierszy Wolne/Razem
- ObjÃâ¢toÄ¹âºÃâ¡ jako osobna sekcja meta; tylko prezentacja ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â UX regaÄ¹âu: szczegÄÅÄ¹ây in-place zamiast tooltipa

- UsuniÃâ¢ty ciemny hover popup obok regaÄ¹âu
- Zaznaczony regaÄ¹â pokazuje dane wewnÃâ¦trz kafelka (occupancy SSOT); hover tylko rozjaÄ¹âºnia
- Pasek zajÃâ¢toÄ¹âºci bez zmian; tsc OK ÃÂ· **No push.**

## 2026-07-24 Ã¢â¬â Unify Magazyn Ã¢â â Projektowanie UI (v1)

- Shared: `WarehouseModeContext`, `WarehouseShell`, `WarehouseZoomControls`, `warehouseMapHall`, `features/registry`
- Designer owiniÃâ¢ty w Provider + Shell; Canvas: wspÄÅlne biaÄ¹âe tÄ¹âo/`p-0`/floating zoom; edit toolbar tylko Reset
- Bez zmian logiki DnD/zoom physics/API/routing; bez top-level `mode=routing`
- tsc OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Projektant Magazynu: globalny spacing Layout 2.0

- `SettingsModuleStack` + tokeny `pageModuleTabsOffsetClass` / `pageModuleContentOffsetClass`
- UsuniÃâ¢te lokalne mt-2/mt-3/mt-4 miÃâ¢dzy breadcrumb Ã¢â â tabs Ã¢â â content
- Workspace pills (Projektowanie/Trasy) przeniesione pod gÄ¹âÄÅwne taby
- Audyt: `memory/erp-page-layout-audit.md`
- tsc OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Magazyn: SSOT lokalizacji produktÄÅw + zajÃâ¢toÄ¹âºÃâ¡ regaÄ¹âu

- Nowy indeks: `productLocationIndex.ts` (inventory Ã¢ÂÅ assigned, layout UUID only)
- Ujednolicono: search, map highlight, sidebary, klik regaÄ¹âu, side-view occupancy
- Pasek zajÃâ¢toÄ¹âºci na regale + hover tooltip (bez duÄ¹Ä½ych kart)
- tsc + build OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â AppOverlayPortal migration (ErpShell overlays)

- Migrated inline `fixed inset-0` drawers/sheets/modals under ErpShell Ã¢â â `AppOverlayPortal` (Pattern A)
- z-index bumped to Ã¢â°Ä250 (drawers) / Ã¢â°Ä280 (center sheets) so overlays sit above NavFlyout (z-200)
- PurchasingRightDrawer: already `createPortal`; z bumped to 250/251 + `APP_OVERLAY_Z`
- Skipped: ConfirmModal / other already-portaled, WMS terminal intentional shells, tiny menu catchers
- `npx tsc --noEmit` OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â AppOverlayPortal: Drawers/Sheets nad sidebarem

- Przyczyna: ErpShell content `z-0` vs sidebar `z-30` (stacking context)
- SSOT: `components/overlay/AppOverlayPortal.tsx` Ã¢â â `document.body`
- Zmigrowano ~146 overlayÄÅw (m.in. Raporty/Szkody Magazyn, drawers ERP, modale designer, WMS)
- `WarehouseDocumentOverlayPortal` = alias AppOverlayPortal
- tsc + build OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Projektant Magazynu: cleanup nagÄ¹âÄÅwkÄÅw UI


- UsuniÃâ¢ty tytuÄ¹â Ã¢â¬Å¾Projektowanie magazynuÃ¢â¬Å¥ (breadcrumb + actions w jednym rzÃâ¢dzie)
- UsuniÃâ¢te Ã¢â¬Å¾Dopasuj do ekranuÃ¢â¬Å¥ z zoomu mapy (zostaje Ã¢Ââ / % / +)
- Lewy panel: bez Ã¢â¬Å¾PulpitÃ¢â¬Å¥ / Ã¢â¬Å¾MagazynÃ¢â¬Å¥ Ã¢â¬â od razu Raporty / Szkody
- Bez zmian logiki / geometrii / paneli
- **No push.**

## 2026-07-26 Ã¢â¬â Projektant Magazynu: UX polish (bez geometrii)

- UsuniÃâ¢te szare placeholdery lokalizacji (RackSideViewGrid + MapLocationVisualizationLayer)
- Panel Produkty: biaÄ¹âe karty/miniatury (object-contain)
- NagÄ¹âÄÅwek: Ã¢â¬Å¾Projektowanie magazynuÃ¢â¬Å¥; dropdown magazynu po prawej bez Ã¢â¬Å¾Magazyn:Ã¢â¬Å¥
- ZajÃâ¢te/Wolne: lokalizacje z qty>0 (`isBinOccupiedByQuantity`); total z API `*_location_count`
- Viz ZajÃâ¢te/Wolne: tint caÄ¹âych lokalizacji, bez szarego dimmingu
- tsc + build OK ÃÂ· **No push.**

## 2026-07-26 Ã¢â¬â Primary Button Design System (enforcement complete)

- Jeden Primary: `PrimaryButton` + `brandPrimaryButtonClass` (wzorzec Ã¢â¬Å¾Dodaj uÄ¹Ä½ytkownikaÃ¢â¬Å¥)
- Migracja ERP CTA (Settings/Orders/Documents/Assortment/Production/Analysis/Warehouse/Complaints/Carts/Ã¢â¬Â¦) z blue/slate/cyan/violet Ã¢â â orange DS
- Shared: `ProductLikePageLayout`, `ListPageCreateLink`, `cartsDarkCtaClass`, tokeny purchasing/filter/printQueue Ã¢â â alias do SSOT
- `npx tsc --noEmit` OK ÃÂ· `npm run build` OK
- **No push.**

## 2026-07-26 Ã¢â¬â PrimaryButton DS wave (slate-900/800 CTAs)

- Migrated remaining ERP solid slate Primary CTAs Ã¢â â `PrimaryButton` / `primaryButtonClassName`
- Confirmed list + scan extras (orders modals, purchasing, ops filters/alerts, auth, ErrorBoundary, labels color apply)
- Left: WMS/damage, nav pills, badges/toasts/pagination, icon boxes
- **No push.**

## 2026-07-26 Ã¢â¬â PrimaryButton DS wave (remaining CTAs)

- Migrated remaining solid blue/violet/cyan/indigo Primary CTAs Ã¢â â `PrimaryButton` / `brandPrimaryButtonClass` / `primaryButtonClassName`
- Includes: consolidation segment modal, customers notes/GUS, inventory traceability, complaints ops/wizard/shipments, direct sales customer+discount, production shortages/composition/monitoring, assortment labels, LocationPicker, fulfillment warehouse, Products filter, label import/print, WarehouseModals undo, ProductLikePageLayout header save, GenerateWarehouseLayout Generuj
- Skipped: WMS/damage, tabs/chips/toggles/badges/charts as listed
- **No push.**

## 2026-07-26 Ã¢â¬â ERP Primary CTAs Ã¢â â design-system orange (clusters)

- Migrated listed Assortment / Products / Production / Analysis / Warehouse / Settings / Orders / Customers / Complaints / WarehouseMaterials / Carts / documents / System / analytics / errors primary CTAs Ã¢â â `PrimaryButton` / `brandPrimaryButtonClass`
- Skipped: WMS terminal, Login, destructive, toggles/tabs/badges, filterToolbarBtnApply, non-CTA segmented controls
- No `"brandPrimaryButtonClass"` string-literal bugs
- **No push.**

## 2026-07-26 Ã¢â¬â ERP Primary CTAs Ã¢â â design-system orange (no push)

- High-priority Settings/exports/returns/import/orders/documents pages: `bg-blue/cyan/sky/slate-900` primary fills Ã¢â â `brandPrimaryButtonClass`
- WarehouseDrawers: removed unused `purchasingBtnPrimary` import (primary AppButton already uses DS)
- Skipped: ApiKeys `<pre>`, Import segmented tabs, WMS operator buttons

## 2026-07-25 Ã¢â¬â Magazyn: kamery per-warehouse + tryby wizualizacji (no push)

- Camera: `warehouse_map_camera_v1_{warehouseId}` (zoom, panX/Y, scroll); auto-fit tylko przy pierwszym wejÄ¹âºciu; Ã¢â¬Å¾Dopasuj do ekranuÃ¢â¬Å¥
- Visualization: `mapVisualization/` registry (all/occupied/free + przyszÄ¹âe); overlay opacity, bez filtrowania danych
- `tsc` + `build` OK
- **No push.**

## 2026-07-25 Ã¢â¬â Projektant Magazynu Ã¢â â Layout System 2.0 (no push)

- UsuniÃâ¢to `AppPageLayout` + `AppContentLayout` + osobny `TabsContainer` card-stack
- Shell: `PageLayout` (= `PageContainer`) + `PageHeader` + bare tabs (`pageShellDividerClass`)
- Lewy panel Magazyn: bez osobnego `bg-white` + shadow (border-r w tej samej karcie)
- Logika / mapa / panele biznesowe bez zmian
- `tsc` + `build` OK
- **No push.**

## 2026-07-25 Ã¢â¬â GLOBAL LAYOUT SYSTEM 2.0 (no push)

- SSOT: `PageContainer`/`PageLayout` + `design-system/pageLayout.ts` (jeden border, `p-6`)
- Tabs: `TabsContainer` divider-only; `TopTabsNavigation` default `bare`
- Migracja: Purchasing, Carts, Assortment shells, Company `companyCardClass`, PrintingDataTable, listy (Asortyment/Klienci/MateriaÄ¹ây/UÄ¹Ä½ytkownicy/Workforce/Ã¢â¬Â¦), WmsSettings, Catalog/Warehouse entity shells
- WyjÃâ¦tki: Login, Designer, WMS terminal, bÄ¹âÃâ¢dy, modale
- `npx tsc --noEmit` + `npm run build` OK
- **No push.**

## 2026-07-25 Ã¢â¬â Magazyn UX polish (bez zmiany geometrii) (no push)

- BiaÄ¹âe tÄ¹âo mapy + delikatny cieÄ¹â kontenera
- NakÄ¹âadka zielonej trasy preview wzdÄ¹âuÄ¹Ä½ istniejÃâ¦cych alejek (bez nowej geometrii)
- Miniatury: object-contain + bg-neutral-100; EAN pod SKU
- Raporty = zielony; sekcja Lokalizacje ZajÃâ¢te/Wolne
- **No push.**

## 2026-07-25 Ã¢â¬â Design System: brand sidebar nav (no push)

- Tokeny: `brandSidebarNavItemClassName`, `brandSidebarNavActiveBarClassName`, icon/chevron
- ErpSidebar + NavFlyoutPanel: aktywny = orange text/icon + lewy pasek (bez niebieskiego)
- TeÄ¹Ä½: TemplatesListSidebar, OperationsSidebar, PickingSettingsSectionNav
- Status sidebary zamÄÅwieÄ¹â (BRAKI itd.) bez zmian
- **No push.**

## 2026-07-25 Ã¢â¬â Brand Enforcement: final Design System cleanup (no push)

- UsuniÃâ¢to aliasy Primary CTA (`cartsOrangeCtaClass`, `companyOrangeCtaClass`, `PrintingPrimaryButton`)
- UsuniÃâ¢to martwe `appTabActiveClass` / `printingTheme.primary`
- Soft/outline/link brand Ã¢â â tokeny w `brandUi.ts`; look bez zmian
- Badge / status / severity / segmented / heatmap Ã¢â¬â bez zmian (wyjÃâ¦tki)
- **No push.**

## 2026-07-25 Ã¢â¬â Magazyn UI: peÄ¹âny redesign widoku operacyjnego (no push)

- Kompozycja: mapa jako bohater (powierzchnia hali), lewy pulpit jako jeden rail, prawa lista produktÄÅw light/nowoczesna
- Przejazdy/alejki jak drogi (hatch + kierunek), bez napisÄÅw/ramek Ã¢â¬Å¾PRZEJAZDÃ¢â¬Å¥
- Geometria regaÄ¹âÄÅw, logika i API bez zmian
- **No push.**

## 2026-07-25 Ã¢â¬â Etap 3.3 Routing Graph Architecture Cleanup

- UsuniÃâ¢to martwy `domain/simulation/route_engine.py` (Euclidean visit order)
- UsuniÃâ¢to nieuÄ¹Ä½ywane `LocationCapacityProfile.pick_sequence` (+ copy w capacity_service)
- Komentarze/docstringi/docs: Runtime Graph jako SSOT; bez Ã¢â¬Å¾pick_sequence wyznacza trasÃâ¢Ã¢â¬Å¥
- Zachowano: kolumna DB `pick_sequence`, migracja `006`, model Location, bootstrap ALTER
- **No push.**

## 2026-07-25 Ã¢â¬â Etap 3.2 Putaway Graph Adoption

- NEAREST_AVAILABLE + WMS fallback: `putaway_hop_cost_m` (Reader), nie `pick_sequence`
- Candidate order: hop (NEAREST) lub `Location.id`
- Tests: `test_stage3_2_putaway_graph.py` + slotting/putaway PASS

## 2026-07-25 Ã¢â¬â Etap 3.1 Finalizacja SSOT Routing Graph (no push)

- Analytics: `order_location_ids_by_graph` Ã¢â â `chain_distance_m`
- Product list: `route_sort_key` = `visit_index_map`
- Allocation / zone / product_view / incomplete / recovery groups Ã¢â â Graph Reader
- Public `__init__`: tylko Runtime Graph Reader (+ CRUD Designer); Euclidean eksport usuniÃâ¢ty
- Doc: Routing Surrogates. Tests: `test_stage3_1_ssot_finalization.py`. **No push.**

## 2026-07-25 Ã¢â¬â Architecture Review Etap 3 Routing Graph (no push)

- Audyt backendu pod SSOT; doc `docs/architecture/routing_graph_runtime.md`
- Werdykt: reader **nie** jest jeszcze jedynym SSOT (luki w raporcie sesji)
- **No push.**

## 2026-07-25 Ã¢â¬â Routing Graph Etap 3: runtime WMS Ã¢â â Authored Graph (no push)

- `runtime_graph_reader.py` Ã¢â¬â jedyny reader WMS (order/hop/chain)
- PickingRoutingService: kolejnoÄ¹âºÃâ¡ `pick_list` z grafu
- wave `compute_wave_metrics`: bez `_distance_between` / label coords
- `_pick_helpers.compute_route_for_pick_nodes`: NN z grafu (bez Euclidean)
- Tests: `test_stage3_runtime_wms.py` 12 PASS. **No push.**

## 2026-07-25 Ã¢â¬â Projektant: jeden panel wÄ¹âaÄ¹âºciwoÄ¹âºci (no push)

- UsuniÃâ¢to panel/przycisk Ã¢â¬Å¾Widok z bokuÃ¢â¬Å¥; karty lokalizacji w `RackPropertiesSidebar`
- Sekcje: Informacje / Przejazd / Statystyki / Lokalizacje; akcje: UkÄ¹âad / Zapisz / UsuÄ¹â
- Bez Ã¢â¬Å¾Dodaj produktÃ¢â¬Å¥ w Projektancie (WMS only). **No push.**

## 2026-07-25 Ã¢â¬â Internal Layout: przejazd jako piÃâ¢tra + UsuÄ¹â przejazd (no push)

- Void: N osobnych poziomÄÅw konstrukcyjnych z slotami-duchami (ile lokacji zabraÄ¹â)
- Ã¢â¬Å¾UsuÄ¹â przejazdÃ¢â¬Å¥: przywraca poziomy magazynowe; zapis `clearPassages` Ã¢â â `enabled: false`
- **No push.**

## 2026-07-25 Ã¢â¬â Internal Layout sync with template + passage (no push)

- `getInitialLevels`: storageCount = structural Ã¢Ââ void; ignore stale full/mismatched `internal_structure`
- Labels: construction level (createBins + modal save); no storage renumber in UI
- `applyInternalLayoutSave`: merge storage into full construction `levelConfig` when void > 0
- `structureDiffersFromTemplate`: compare storage levels vs template after void
- Tests: passageStorage (+ business) PASS. **No push.**

## 2026-07-25 Ã¢â¬â Template editor: front passage + width axis (no push)

- TemplatePassageOverlay: widok od przodu (nie z gÄÅry); along = `width_cm`
- Walidacja: start/szerokoÄ¹âºÃâ¡ wzglÃâ¢dem szerokoÄ¹âºci regaÄ¹âu (nie gÄ¹âÃâ¢bokoÄ¹âºci)
- PodglÃâ¦d: etykiety po poziomie konstrukcyjnym (bez renumeracji); void = PRZEJAZD per poziom
- Bez push.

## 2026-07-25 Ã¢â¬â Hard: one enabled passage per rack (no push)

- Shared message: `RegaÄ¹â moÄ¹Ä½e posiadaÃâ¡ tylko jeden przejazd pod regaÄ¹âem.`
- BE: `single_passage.assert_at_most_one_enabled_passage` Ã¢â¬â sync, void, template JSON, Pydantic RackSchema + WarehouseTemplatePayload
- FE: `assertAtMostOneEnabledPassage` Ã¢â¬â storage/void, materialize/rematerialize, upsert, layout save payload, entity integrity, TemplateCreator
- No first-pick / ignore / auto-repair. Tests: BE single_enabled + void + template; FE passageStorage + rackPassageGeometry. **No push.**

## 2026-07-25 Ã¢â¬â Passage architecture P0 closeout (no push)

- BE: `warehouse_layout/passage_void.py` void validation Ã¢â â 409; active ops gate; audit hook no-op
- FE: single `structureRebuildOrchestrator` for layout save + template instances; no `trimInternalStructureForVoid`
- Z: `_bin_coords_cm` uses full construction heights
- Preflight: `POST /warehouse/layout/rebuild-preflight`
- Tests: passage_void_gates 8 PASS; FE passage 17 PASS; tsc OK. **No push.**

## 2026-07-25 Ã¢â¬â Passage UX polish (no push)

- Labels: Ã¢â¬Å¾Poziom konstrukcyjnyÃ¢â¬Å¥ vs Ã¢â¬Å¾Lokalizacja / Adres magazynowyÃ¢â¬Å¥
- Void viz: double beams + hatch (PassageVoidBand), not solid gray
- Fields: PoczÃâ¦tek / SzerokoÄ¹âºÃâ¡ / WysokoÄ¹âºÃâ¡ wolnej przestrzeni + hints
- Miniature: start/width/end numeric readout + dimension lines
- Rebuild dialog: Stare/Nowe counts+capacity, +/Ã¢Ââ lists, stock product/qty/unit/value
- Validation: red highlight on offending height/width/passage geometry fields
- PL copy cleanup (no qty=, Level load, CAD jargon). Tests 19 PASS. **No push.**

## 2026-07-25 Ã¢â¬â P0 UkÄ¹âad wewnÃâ¢trzny / numeracja / dialogi (no push)

- Internal Layout: peÄ¹âna szerokoÄ¹âºÃâ¡ + scroll (bez FitToContainer / miniatury)
- Numeracja: poziom konstrukcyjny vs adres magazynowy (level_index strukturalny; etykieta 1..N)
- Pole: Ã¢â¬Å¾PoczÃâ¦tek przejazdu od lewej krawÃâ¢dzi (cm)Ã¢â¬Å¥
- Miniatura przejazdu: start / szerokoÄ¹âºÃâ¡ / koniec
- Dialogi: X + Anuluj + ESC; zapis dopiero po decyzji (template instances + rebuild)
- Tests: passageStorage + business PASS. **No push.**

## 2026-07-25 Ã¢â¬â Passage storage: one structural + stock block (no push)

- Void height = first enabled passage only (no max); UI limit 1 passage/rack
- Rebuild with stock: FE dialog blocks confirm; BE save Ã¢â â 409
- Business vitest: 5Ã¢â â5, +80Ã¢â â3, +120Ã¢â â2, numbering, capacity, active-only WMS filter
- **No push.**

## 2026-07-25 Ã¢â¬â Passage under rack Ã¢â â storage model (variant A, no push)

- Generator: `createBinsForRack` + `passageStorage` skip void levels; labels 1..N storage-only
- Capacity from existing bins; Internal Layout / side view / template preview show PRZEJAZD
- Save: `prepareLayoutBinsForSave` + confirm dialog (addresses + stock) before soft-remove
- Clearance height editable in TemplateCreator + PassageInspector (LOCAL); required for void
- No `affects_storage`, no materialization table, no separate Apply action
- Tests: passageStorage vitest PASS; tsc OK. **No push.**

## 2026-07-25 Ã¢â¬â Pre-push UX: P0 regressions + Ã¢â¬Å¾Projektowanie magazynuÃ¢â¬Å¥

- Template preview scale-to-fit; ElevationSidePanel uuid match; routing htmlOverlay pointer trap
- PL passage labels; tab rename Projektant Layoutu Ã¢â â Projektowanie magazynu
- Passage/locations generator: deferred (no change this round)
- Local commit only. No push.

## 2026-07-25 Ã¢â¬â PassageInspector wired (pre-push fix, uncommitted)

- `PassageInspector` replaces `PassageQuickEditor` on Layout canvas
- INHERITED: banner + Ã¢â¬Å¾OtwÄÅrz szablonÃ¢â¬Å¥ Ã¢â â `setEditingTemplateId(rack.templateId)`
- LOCAL: corridor width/delete/enabled; QuickEditor = thin alias
- tsc + designer vitest 78 + build OK. No push.

## 2026-07-25 Ã¢â¬â C3 gap-fix commit (inspectors + endpoint drag)

- Extract `NodeInspector` / `EdgeInspector`; panel is container only
- Canvas endpoint drag: handles, snap, ghost, rewire + normalizeAfterEdit via command
- Select rewire = fallback; vitest/tsc/build OK
- **No amend** of `ee6c7cef`. No push. Bez Etapu 3.

## 2026-07-25 Ã¢â¬â C3 gap-fix (inspectors + endpoint drag, uncommitted)

- Extract `NodeInspector` / `EdgeInspector`; `RoutingRoutesPanel` composes only
- Canvas endpoint drag in Edit: handles, node snap highlight, ghost, rewire + normalizeAfterEdit; select = fallback
- `routingEndpointDrag` + tests; vitest routing 53, tsc, build OK
- **No commit yet** Ã¢â¬â awaiting C3 acceptance. No push. Bez Etapu 3.

## 2026-07-25 Ã¢â¬â Layout+Routing UX rev. 3.1 (4 local commits, no push)

- C1: template `default_passages` + passage `INHERITED|LOCAL` + update dialog
- C2: TemplateCreator responsive + top-down passage mini-CAD
- C3: Routing Edit vs Select; selection clear on workspace switch; quick toolbar; merge/rewire
- C4: command bus foundation (no Undo UI)
- tsc+build OK; targeted vitest/pytest PASS. **No push. Bez Etapu 3.**

## 2026-07-25 Ã¢â¬â Layout UX C1: template passages + INHERITED/LOCAL

- `default_passages` on WarehouseTemplate; `passage_source` on WarehouseRackPassage
- Place/stamp/generate materialize INHERITED; legacy missing Ã¢â â LOCAL
- Template save: dialog Aktualizuj instancje vs Tylko zapisz (rematerialize INHERITED only)
- Tests: template_passage_defaults + FE rematerialize; no push

## 2026-07-25 Ã¢â¬â ETAP 2 controlled save WH1 (S1 provenance repair)

- 1Äâ save_layout WH1 Ã¢â â S1 FRONT+180 LEGACY Ã¢â â FRONT+90 AUTO_REPAIR (NORTH only)
- A23Äâ3: approach 4.56Ã¢â â0.1 m; P on packing edge y=490; collision clear
- Other racks unchanged; graph/passages/rev unchanged; 2nd save idempotent
- Bez Etapu 3

## 2026-07-25 Ã¢â¬â ETAP 1 deploy provenance (no WH1 save)

- Push `9292c0d2` + `32993af7` Ã¢â â origin/main `32993af7`
- Railway + Vercel success; healthz/readyz OK
- PROD read: all racks `LEGACY_DEFAULT`; S1 still FRONT+180; A23 RESOLVED ~4.56 m (stary zÄ¹ây face); Graph 14/14 rev18; passages 0
- **STOP przed Etapem 2** (controlled save)

## 2026-07-25 Ã¢â¬â Service Face Provenance finalization (committed, no push)

- `ServiceFaceOrigin` str Enum (BE model + FE const); repair gates EXPLICIT immutable.
- Schema ensure DEFAULT LEGACY_DEFAULT; FE/BE round-trip; warehouse_routing 150 PASS.
- Commit on top of `9292c0d2`. **No push / PROD / Etap 3.**

## 2026-07-24 Ã¢â¬â SERVICE FACE PROVENANCE (no push)

- Model: `Rack.service_face_origin` LEGACY_DEFAULT | AUTO_REPAIR | EXPLICIT; schema ensure DEFAULT LEGACY.
- Gates: EXPLICIT never repaired; AUTO recomputes; LEGACY FRONT+0 + narrow diagonal-EAST fingerprint.
- Open clearance: unbounded Ã¢â°Â  0; deterministic remis.
- FE/BE round-trip origin; generators conscious face Ã¢â â EXPLICIT.
- Tests AÃ¢â¬âH + warehouse_routing 150 PASS; tsc/build/startup OK. **No push. Bez PROD. Bez Etapu 3.**

## 2026-07-24 Ã¢â¬â Routing Designer UX + S1 store face (no push)

- Store S1: repair face z aisle geometry (FRONT+90 NORTH); bez `if store => RESOLVED`.
- UsuniÃâ¢ty box Ã¢â¬Å¾Konfiguracja sieciÃ¢â¬Å¥; MISSING Start/Packing Ã¢â â warning.
- UI point types: 5 typÄÅw + SVG ikony; legacy typy zachowane w DB.
- Location Access: Ã¢â¬Å¾Bez dostÃâ¢puÃ¢â¬Å¥ / wykluczenie START+DOCK z NO_RACK counts.
- Tests: warehouse_routing 131; FE routing 47; tsc+build OK. **No push. Bez Etapu 3.**

## 2026-07-24 Ã¢â¬â FINAL PRE-PUSH AUDIT + push (corridor UX)

- TSC vs origin/main `b17b8d72`: **NEW ERRORS = 0** (po fix `LayoutState` w corridor test).
- Persistence/collision audit tests PASS; warehouse_routing 130 PASS; FE routing/passage 58 PASS; build PASS.
- Push `93b16293` Ã¢â â origin/main. PROD healthz/readyz 200; LA summary unchanged (read-only).
- Bez Etapu 3. Bez zapisu passages na PROD WH1.

## 2026-07-24 Ã¢â¬â UX closures: problem locations + passage corridor group

- **A:** Interaktywna diagnostyka LA (lista + locate + Ã¢â¬Å¾PokaÄ¹Ä½ wszystkie problemyÃ¢â¬Å¥); bez 279 linii.
- **B:** `corridor_uuid` (FE+BE+schema); multi-rack create/move/resize/delete as one; RackSchema.passages (fix strip).
- PROD WH1 verify: 274 RESOLVED / 3Äâ S1 BLOCKED (A23-A-1..3) / 2Äâ NO_RACK (DOCK-IN, START).
- Tests: corridor FE + collision B4/C4 + sync corridor_uuid. Build OK. **No push. Bez Etapu 3.**

## 2026-07-24 Ã¢â¬â Stage B passage canvas UX (FE, uncommitted)

- `LayoutMode.DRAW_PASSAGE` + toolbar Ã¢â¬Å¾Dodaj przejazdÃ¢â¬Å¥ (J); drag corridor Ã¢â â `worldCorridorToPassages` multi-rack.
- Passage preview ghost; PROJEKTOWANIE: select/drag/width/delete overlay; TRASY: subtle non-interactive.
- Save payload passages array unchanged; vitest `rackPassageGeometry.test.ts`.

## 2026-07-24 Ã¢â¬â Etap A+B Physical Routing fixes (no commit/push)

- **A:** SSOT `rack_service_face` (0/90/180/270); FE horizontal rows set face; `service_face_repair` from row_containers on layout save; store skipped.
- **B:** `DRAW_PASSAGE` multi-rack corridor UX; canvas select/move/width/delete; TRASY subtle.
- Tests: service_face_ssot, abc_faces_passage_regression; FE passage geometry 7; warehouse_routing 110; tsc+build OK.
- Bez Etapu 3. Bez push.

## 2026-07-24 Ã¢â¬â MANUAL UX+FUNCTIONAL AUDIT (Passage / Access) Ã¢â¬â no code

- Prod WH1: passage UI PARTIAL (sidebar only); B4+C4 need **two** passages; Test BEFORE 43.10 m / AFTER ~32.48 m.
- Access: 49 RESOLVED / 217 AMBIGUOUS / 11 BLOCKED / 2 NO_RACK; root cause FRONT+rot0 (normal left) vs ÃÂ±Y aisles.
- Bez implementacji / commit / push / Etapu 3.

## 2026-07-24 Ã¢â¬â Physical Routing / Rack Passage Foundation

- Model `WarehouseRackPassage` (osobna tabela, UUID); geometria lokalna wzglÃâ¢dem Rack.
- SSOT `physical_collision.py`: obstacle = footprint Ã¢Ââ enabled passages; eps=2cm; soft boundary.
- Soft Ã¢â¬Å¾SprawdÄ¹Å sieÃâ¡Ã¢â¬Å¥: `EDGES_THROUGH_OBSTACLES` (warning); save graph nie blokuje; FE highlight odcinkÄÅw.
- Location Access: approach SÃ¢â âP + wykluczenie invalid edges; MANUAL_OVERRIDE nietkniÃâ¢ty.
- FE: Ã¢â¬Å¾Dodaj przejazd pod regaÄ¹âemÃ¢â¬Å¥; orthogonal prefer + Shift free-angle.
- Tests: collision/passage/routing soft/access/draw. **No push. Bez Etapu 3.**

## 2026-07-24 Ã¢â¬â FINAL AUDIT Location Access Foundation

- P0 fix: migracja AP tylko gdy brak wiersza access (nie nadpisuje restore AUTO).
- P0 fix: MANUAL po usuniÃâ¢ciu edge Ã¢â â `OVERRIDE_BROKEN`.
- P1 fix: one-way same-edge respektuje kolejnoÄ¹âºÃâ¡ `t`; disabled edges wykluczone z virtual entry.
- Statusy: RESOLVED / AMBIGUOUS / UNREACHABLE / BLOCKED / OVERRIDE_BROKEN.
- Stage-2 consumers nadal OLD AP; NEW tylko Designer/API foundation (Ä¹âºwiadomy dual-store do Etapu 3).
- Tests: 21 foundation + 87 routing/startup; FE routing 41; tsc+build OK. **No push.**

## 2026-07-24 Ã¢â¬â Location Access Foundation (AUTO, bez Etapu 3)

- **LocationÃ¢â âRack SSOT:** `location_uuid`Ã¢â â`Bin.rack_id`Ã¢â â`Rack` (nie `rack_name`); brak ryzykownej migracji.
- Persist `Rack.service_side` + `rotation_degrees`; world normal z orientation+rotation.
- Tabela `warehouse_routing_location_access`; AUTO resolver (face edge, half-plane, reach, approach_m).
- Virtual entry runtime + approach w koszcie; authored graph bez pollution.
- Recompute po layout/graph save; AP Ã¢â â MANUAL_OVERRIDE (Stage-2 AP nadal Ä¹Ä½yje).
- FE: walidacja dostÃâ¢p/review/bez drogi; diagnostyka overlay OFF; rÃâ¢czne AP = wyjÃâ¦tek.
- Tests: 13 foundation + full warehouse_routing 74 PASS; FE build OK. **No push. Bez Etapu 3.**

## 2026-07-24 Ã¢â¬â TRASY: draw-time skrzyÄ¹Ä½owania + prostszy panel odcinka

- ROOT: przeciÃâ¢cia dopiero na BE save (`materialize_intersections`); FE tylko split po klikniÃâ¢ciu w odcinek Ã¢â â wizualny X bez topologii.
- FIX: `applyDrawStep` + `routingDrawNormalize` (cross / T / collinear) przy rysowaniu; snap POINT>EDGE>empty.
- UI: ukryty mnoÄ¹Ä½nik kosztu; panel odcinka uproszczony; Ã¢â¬Å¾Punkt trasyÃ¢â¬Å¥/Ã¢â¬Å¾SkrzyÄ¹Ä½owanieÃ¢â¬Å¥ zamiast Punkt N.
- Tests: routingDrawNormalize 10 + routing suite 32 PASS. **No push. Bez Etapu 3.**

## 2026-07-24 Ã¢â¬â HOTFIX: Railway /healthz 503 (dangling Stage2 import)

- ROOT: `slotting_service` Ã¢â â `from ..domain.simulation import get_special_locations_xy, distance_point_to_point_cm` po usuniÃâ¢ciu `warehouse_graph_service` w 0ae9e47d.
- FIX: helpery w `backend/domain/layout_geometry.py` (Location + Euclidean; zero WarehouseNode/Edge).
- Audit dangling Stage2: tylko te 2 symbole Ä¹Ä½yÄ¹ây w runtime; FE deleted modules bez dangling imports.
- Smoke: `import backend.main` OK; `run_server.py` Ã¢â â GET /healthz HTTP 200; 130/130 router modules import OK.
- Regression: `backend/tests/test_backend_startup_import.py`. **No push. Bez Etapu 3.**

## 2026-07-23 Ã¢â¬â Routing Graph: fix rysowania odcinkÄÅw + sticky Wybierz (audit)

- ROOT draw: stale React state w addEdge Ã¢â â `appendDrawClick` atomowo.
- engine.py: **wycofane** (tylko FE humanize wystarczy; bez zmiany logiki routingu).
- Sticky Wybierz, split przeciÃâ¢cia, test map-first, orphan cleanup.
- FINAL AUDIT tests PASS. Lokalny commit; **no push. Bez Etapu 3.**

## 2026-07-23 Ã¢â¬â Routing Graph: UX polish + delete bugfix (bez Etapu 3)

- Delete punktu: widoczny CTA Ã¢â¬Å¾UsuÄ¹â punktÃ¢â¬Å¥, Delete/Backspace, dirty+save+reload persistence test.
- Walidacja: agregacja orphanÄÅw (bez UUID / Ã¢â¬Å¾edgesÃ¢â¬Å¥ / Ã¢â¬Å¾wÃâ¢zeÄ¹âÃ¢â¬Å¥); Ã¢â¬Å¾UsuÄ¹â niepoÄ¹âÃâ¦czoneÃ¢â¬Å¥ + podÄ¹âºwietlenie.
- Panel kontekstowy (sieÃâ¡ / punkt / odcinek / test); Ã¢â¬Å¾ObsÄ¹âugiwane lokalizacjeÃ¢â¬Å¥; Typ punktu zamiast roli/wÃâ¢zÄ¹âa.
- Architektura Routing Graph SSOT nienaruszona. **No push. Bez Etapu 3.**

## 2026-07-23 Ã¢â¬â Routing Graph Etap 2: cleanup legacy Planuj trasÃâ¢

- Designer: usuniÃâ¢to legacy route UX (`isRouteActive` / `routeRackIds` / `fetchRoutePath` / client aisle+grid engines). PathLayer props = null.
- Toolbar: brak przycisku Ã¢â¬Å¾Planuj trasÃâ¢Ã¢â¬Å¥. Sidebar: usuniÃâ¢to sekcjÃâ¢ Ã¢â¬Å¾Trasa kompletacjiÃ¢â¬Å¥.
- DELETE: `aisleGraphRoute.ts`, `aisleRouteOrder.ts`, `gridRoutePathfinding.ts`, `routeApi.ts`.
- WalkingCostPage: N/A gdy `total_distance` null. TRASY workspace nienaruszony. **No push. Bez Etapu 3.**

## 2026-07-23 Ã¢â¬â Routing Graph Etap 2 (migracja READ-ONLY)

- SSOT AP: `access_resolution.py` (location 1..N Ã¢â â best AÄâB).
- `/route/path` = compatibility adapter Ã¢â â Routing Engine (bez legacy fallback).
- walking-cost / pick-route / strategy simulations Ã¢â â authored graph.
- UsuniÃâ¢to: Planuj trasÃâ¢, aisle*/gridRoute*, routeApi, WarehouseGraphService, graph_location, domain warehouse_graph_service, save_layout rebuild.
- `/warehouse-graph` nodes/edges = projekcja authored; generate Ã¢â â 410.
- Tests: stage2 + updated smoke; 55 warehouse_routing PASS. **No push. No Etap 3.**

## 2026-07-23 Ã¢â¬â Routing Graph Etap 1: domkniÃâ¢cie UX TRASY


- Drag punktu trasy na canvasie (snap 10 cm, CTM zoom-safe, bez auto-merge, panÃ¢â°Â drag).
- CiÃâ¦gÄ¹âe Ã¢â¬Å¾Rysuj trasÃâ¢Ã¢â¬Å¥, edytor odcinka PL, AP 1..N UX, unsaved (tabs/warehouse/nav/beforeunload).
- Schema `routing.3` bez drop Ã¢â¬Å¾starego unique APÃ¢â¬Å¥; testy diamond/drag/legacy smoke.
- Osobny commit wzglÃâ¢dem `993f6a9f`. **No push. Bez Etapu 2.**

## 2026-07-23 Ã¢â¬â Routing Graph Etap 1 (authored SSOT)


- Nowe modele: `WarehouseRoutingNode` / `Edge` / `AccessPoint` (stabilne UUID).
- Engine AÃ¢â âB (kierunek, enabled, process, transport, cost_multiplier) Ã¢â¬â **bez** fallbacku do WarehouseNode.
- API `/warehouse-routing/{id}/graph|route|validate`; `save_layout` nie rebuilduje nowego grafu.
- Designer: workspace **Projektowanie | Trasy**; Testuj trasÃâ¢ / SprawdÄ¹Å sieÃâ¡.
- Tests: `backend/tests/warehouse_routing/test_stage1_routing_graph.py` (15). **No push.**

## 2026-07-23 Ã¢â¬â NoÄ¹âºniki: globalny fiolet (CARRIER_VISUAL)

- SSOT: `CARRIER_VISUAL` + `carrierVisualClasses`; wszystkie prefixy PAL/BOX/BIN/CRT/MIX fioletowe.
- `CarrierBadge` / `CarrierIdentity`; karty wyboru PZ, paski aktywnego noÄ¹âºnika, putaway/relocation.
- Lokalizacje bez zmian (niebieski). Tests: `carrierConstants.test.ts`. **No push.**

## 2026-07-23 Ã¢â¬â WÄÅzki: KupujÃâ¦cy w przypisanych zamÄÅwieniach

- Root cause: cart `_order_customer_name` czytaÄ¹â tylko EN `first_name`/`last_name` (shipping-first); karta zamÄÅwienia uÄ¹Ä½ywa `_customer_names_from_order` (PL ImiÃâ¢/Nazwisko w billing).
- Fix: `_order_display_customer` Ã¢â â SSOT `_customer_names_for_order_display` (+ CRM fallback). Pole `customer_name` / `order_customer_name` bez N+1.
- Tests: `test_bulk_cart_fleet_semantics.py` (PL keys). **No push.**

## 2026-07-23 Ã¢â¬â Jedna kanoniczna karta produktu (Asortyment)

- UsuniÃâ¢to slim `ProductDetail`; `/products/:id` Ã¢â â `ProductDetailRedirect` Ã¢â â `/products/:id/edit`.
- Helper `getProductDetailsPath` + migracja linkÄÅw (WMS/magazyn, wÄÅzki, zamÄÅwienia, zakupy, produkcja, scan).
- Ã¢â¬Å¾ZamÄÅw u dostawcyÃ¢â¬Å¥ na `ProductEditModal`. Test: `productPaths.test.ts`. **No push.**

## 2026-07-23 Ã¢â¬â Magazyn Ã¢â â WÄÅzki: semantyka BULK vs MULTI + hover zamÄÅwieÄ¹â

- BULK: `total_baskets=0`, brak sekcji w header/KPI; MULTI bez regresji.
- PostÃâ¢p kompletacji = zamkniÃâ¢te linie operacyjne (`compute_pick_progress` + `pick_progress` API).
- KupujÃâ¦cy: imiÃâ¢+nazwisko Ã¢â â firma; produkty z `product_id`/`image_url` bez N+1.
- Rich hover numer/pozycje + nawigacja do `/products/:id`.
- Tests: `test_bulk_cart_fleet_semantics.py`, `bulkCartSemantics.test.ts`. **No push.**

## 2026-07-22 Ã¢â¬â Magazyn UI 1:1 (WÄÅzki Ã¢â â NoÄ¹âºniki)

- WspÄÅlny shell: breadcrumb Magazyn > tab, bare tabs + trailing CTA (`CartsTabActionsContext`).
- WÄÅzki/koszyki: CTA na tabach, ConfirmModal destrukcji, KPI/zapeÄ¹ânienie z API; sekcje KPI tylko dla MULTI.
- RegaÄ¹ây: 4 KPI, pomaraÄ¹âczowy Ã¢â¬Å¾+ Nowy regaÄ¹âÃ¢â¬Å¥, tabs na edycji; Strefy: jeden formularz + focus z CTA; Planer/NoÄ¹âºniki parity.
- Tests: `cartsFleetSummary.test.ts`. Build PASS. **No push.**

## 2026-07-22 Ã¢â¬â Ustawienia: Klucze API i Eksport jako osobne pozycje menu

- Flyout: Integracje Ã¢â°Â  Klucze API Ã¢â°Â  Eksport; canonical `/settings/api-keys` + redirect legacy.
- Hub `/settings/integrations`; breadcrumbs Ustawienia Ã¢â â Klucze API / Eksport.
- Tests: `settingsNavIa.test.ts`. **No push.**

## 2026-07-22 Ã¢â¬â Ustawienia Ã¢â â Firma: UI 1:1 (4 zakÄ¹âadki)

- Shell bare tabs + orange CTA; Dane firmy / Magazyny / Firmy / Branding pod screeny.
- Logika bez zmian: company_profile, warehouses, fulfillment strategy, COMPANY template scope, logo SSOT.
- Tests: `companySettingsTabs.test.ts`. **No push.**

## 2026-07-22 Ã¢â¬â UÄ¹Ä½ytkownicy: sesja vs konto, WMS badges, role/statusy, czas pracy PL

- Presence SSOT: `UserSession.expires_at > now` Ã¢â â `has_active_session` na liÄ¹âºcie (Zalogowany/Niezalogowany).
- Kolumna WMS = effective operational modes (launcher parity); HoverPopover na Ã¢â¬Å¾+X innychÃ¢â¬Å¥.
- Role: rename Ã¢â¬Å¾Role i dostÃâ¢p do statusÄÅwÃ¢â¬Å¥; Ã¢â¬Å¾MoÄ¹Ä½e pracowaÃâ¡Ã¢â¬Å¥; `StatusAccessCheckbox` shared z edycjÃâ¦.
- Czas pracy: ThroughputÃ¢â âAktywnoÄ¹âºci na godzinÃâ¢; heatmap/dni w Europe/Warsaw; API historyczne humanize.
- Tests: `test_user_session_presence`, `effectiveWmsModes.test.ts`, tabs. **No push.**

## 2026-07-22 Ã¢â¬â Edycja uÄ¹Ä½ytkownika 1:1 + kod logowania w systemie etykiet

- UI edycji: orange tabs, lewa kolumna, dirty bar, hasÄ¹âo tylko Ã¢â¬Å¾noweÃ¢â¬Å¥ (puste).
- Zapis spÄÅjny wszystkich dirty fields; beforeunload; Anuluj = restore.
- Kod logowania: Generuj + szablon etykiety + podglÃâ¦d/druk; lista Ã¢â¬Å¾Ã¢â¬Â¦Ã¢â¬Å¥ Ã¢â â Drukuj kod logowania.
- Label SSOT: template_type `user_login`, zmienna `{barcode_login_code}` (tekst/barcode fallback PDF).
- DB: `user_wms_profiles.login_code_label_template_id`; unikalnoÄ¹âºÃâ¡ `barcode_login_code`.
- Tests: `test_user_login_code.py`, `userLoginCodeLabel.test.ts`. **No push.**

## 2026-07-22 Ã¢â¬â Ustawienia Ã¢â â UÄ¹Ä½ytkownicy: UI 1:1 + telemetria operacyjna

- Chrome: bare tabs (orange underline), CTA Ã¢â¬Å¾+ Dodaj uÄ¹Ä½ytkownikaÃ¢â¬Å¥ pomaraÄ¹âczowe przy liÄ¹âºcie; bez duÄ¹Ä½ego H1 nad tabami.
- Lista: dziaÄ¹âajÃâ¦ce wyszukiwanie + Filtruj (status/rola/magazyn); menu Ã¢â¬Â¦ z ikonami; chipy permisji zielone/czerwone.
- Koszty: 4 KPI jak na screenie; Historia: pagination Ã¢â¬Å¾ZaÄ¹âaduj wiÃâ¢cejÃ¢â¬Å¥; Czas pracy: expandable operatorzy + filtry.
- Backend: GET/unmapped API poza telemetriÃâ¦; `filter_operational_activity` w dashboard/analytics/activity-logs.
- Tests: `test_workforce_activity`, `test_workforce_operational_filter`, `administratorsTabs.test.ts`. Build PASS. **No push.**

## 2026-07-22 Ã¢â¬â FE: stale Vite chunk recovery (PlanningDashboard)

- Prod: `PlanningDashboard-DvvOppzR.js` Ã¢â â 200 `text/html` (SPA rewrite); aktualny index wskazuje `PlanningDashboard-BqfS5N4m.js`.
- Root cause: stary main bundle po deployu (nie broken import, API 200).
- Centralnie: `lazyWithStaleChunkRecovery`, one-shot reload (sessionStorage), ErpPanelRouteErrorPage + ErrorBoundary; purchasing lazyViews + ProductList.
- Tests: `staleChunkRecovery.test.ts`. Build PASS. **No push.**

## 2026-07-22 Ã¢â¬â WMS cross-module 500: requires_putaway schema drift

- Root cause: ORM kolumny `requires_putaway` / `default_requires_putaway` (ba0dc357); ensure z `BOOLEAN DEFAULT 1` (nie-PG) + ensure w batch try/except Ã¢â â kolumny mogÃâ¦ nie powstaÃâ¡ na PROD.
- Objaw: GET receiving/pz, putaway/pz, returns/active-z-pz Ã¢â â 500; warehouse-operations snapshot Ã¢â â 200 (COUNT bez peÄ¹ânego SELECT).
- Fix: dialect-aware default, izolowany startup ensure, request-path heal na listach; test `test_requires_putaway_schema_drift_lists.py`.
- Lifecycle PROGRESSÃ¢â°Â DONE i scanner SSOT bez zmian. **No push.**

## 2026-07-22 Ã¢â¬â SprzedaÄ¹Ä½ bezpoÄ¹âºrednia: widoczny Przelew + cleanup UI

- Root cause: zapisane `payment_methods.transfer=false` (stary default) + filtr w `PaymentTerminalPanel` ukrywaÄ¹â TRANSFER mimo backendu TRANSFER/BANK.
- Migracja resolve/normalize: legacy falseÃ¢â âtrue; po save `extensions.ds_payment_methods_v2` chroni Ä¹âºwiadome wyÄ¹âÃâ¦czenie; cache settings `v2`.
- UI: 2Äâ2 GotÄÅwka|Karta|BLIK|Przelew; cash panel tylko CASH; usuniÃâ¢te teksty Ã¢â¬Å¾Paragon Ã¢â¬â klientÃ¢â¬Â¦Ã¢â¬Å¥ i Ã¢â¬Å¾Wydanie od rÃâ¢kiÃ¢â¬Â¦Ã¢â¬Å¥.
- Tests: `test_direct_sales_settings_transfer.py`, `directSalesFulfillment.test.ts`. **No push.**

## 2026-07-22 Ã¢â¬â SprzedaÄ¹Ä½ bezpoÄ¹âºrednia: stock, wysyÄ¹âka, przelew, UX sum

- Stock SSOT: `build_location_stock` Ã¢â â `available_qty_hint` + badge Ã¢â¬Å¾DostÃâ¢pne: X szt.Ã¢â¬Å¥; Lokalizacja = rozbicie location-stock.
- Fulfillment w `session.metadata_json` + PATCH `/fulfillment`; DELIVERY Ã¢â â Order.addresses_json + shipping_method_id (bez nowej integracji kuriera).
- Przelew + termin z `Customer.payment_terms_days` (IMMEDIATE settle / DEFERRED PENDING).
- Prawa kolumna: Suma Ã¢â â Rabat Ã¢â â Do zapÄ¹âaty (PLN `6,15 zÄ¹â`); cash UI tylko dla GotÄÅwka.
- Tests: `test_fulfillment_service.py`, `directSalesFulfillment.test.ts`. **No push.**

## 2026-07-22 Ã¢â¬â SprzedaÄ¹Ä½ bezpoÄ¹âºrednia: add-product 500 + auth probes

- **500 root cause:** `OperationalError: no such column: stock_document_items.requires_putaway` w `commercial_availability_service._purchase_lines_for_products` (stock check przed insert linii). Self-heal + mapowanie Ã¢â â 503/`{code,message}`; brak stock Ã¢â â 400 `offer_stock_unavailable`.
- **401 unrelated:** `/operational/features` i `/wms/settings/direct-sales` uÄ¹Ä½ywajÃâ¦ tego samego Bearer/`get_current_user` (settings: `require_operable_warehouse`). FE nie stosuje juÄ¹Ä½ fallbacku flag przy 401 (`unavailableReason=auth`).
- **Scanner:** terminal Direct Sales Ã¢â â `useWmsPageScanHandler` Ã¢â â `scanDirectSaleSession` (ten sam backend co klik/`add-product`).
- Tests: `backend/tests/direct_sales/test_add_product_api.py`, `operationalFeatureGuard.test.ts`. **No push.**

## 2026-07-22 Ã¢â¬â Inwentaryzacja: podÄ¹âÃâ¦czenie do globalnego skanera WMS

- Root cause: `handleScan` tylko w lokalnym `useInventoryScanInput` Ã¢â¬â brak `registerScanHandler` Ã¢â â Helper: Ã¢â¬Å¾Brak aktywnego odbiorcyÃ¢â¬Å¥ / Ã¢â¬Å¾Ta strona nie obsÄ¹âuguje jeszcze skanera.Ã¢â¬Å¥
- Fix: entry + terminal Ã¢â â `useWmsPageScanHandler`; krok lokalizacji odrzuca EAN; na liczeniu `location_like` Ã¢â â switch lokalizacji (fallback produkt).
- Mode/label: `inventory-count` / Ã¢â¬Å¾InwentaryzacjaÃ¢â¬Å¥. Tests AÃ¢â¬âL: `inventoryScanRouting.test.ts`. **No push.**

## 2026-07-22 Ã¢â¬â Rozlokowanie PZ: 100% Ã¢â°Â  zamkniÃâ¢cie (explicit finalize)

- Root cause: `recalculate_wms_document_completion` auto-ustawiaÄ¹â `relocation_status=DONE` (+ czÃâ¢sto `status=zakonczone`) przy `receiving_closed && full_put`; `recompute_putaway_status_for_document` ustawiaÄ¹â `putaway_status=DONE` przy catch-up 100% + receiving DONE.
- Fix: progress remaining=0 Ã¢â â tylko IN_PROGRESS; DONE wyÄ¹âÃâ¦cznie po `finalize_wms_relocation_pz` (receiving=DONE Ã¢ÂÂ§ remaining=0), z rewalidacjÃâ¦ transakcyjnÃâ¦.
- UI: przycisk Ã¢â¬Å¾ZakoÄ¹âcz rozlokowanieÃ¢â¬Å¥ widoczny przy otwartym relocation; disabled + powÄÅd; catch-up banner slate; DONE = emerald (bez czerwonego alertu).
- Lista aktywna: filtr `relocation_status != DONE` (nie po remaining=0).
- Tests AÃ¢â¬âJ: `test_wms_putaway_explicit_finalize.py`. **No push.**

## 2026-07-21 Ã¢â¬â Skan noÄ¹âºnika PAL-5 w PrzyjÃâ¢ciach: SSOT code|barcode

- Root cause: Scanner Helper pokazywaÄ¹â syntetyczny Ã¢â¬Å¾NoÄ¹âºnik / SSCCÃ¢â¬Å¥ bez DB; `/carriers/scan` zwraca zawsze 200, a lookup matchowaÄ¹â tylko `barcode` (nie `code`).
- SSOT: `find_carrier_by_scan_code` (code OR barcode); inventory-count uÄ¹Ä½ywa tej samej funkcji.
- Helper katalog: lista noÄ¹âºnikÄÅw z DB zamiast faÄ¹âszywego PAL-N; MULTI_SCAN_TRACE w receiving.
- Tests AÃ¢â¬âJ: `test_wms_carrier_scan_ssot.py`. **No push.**

## 2026-07-21 Ã¢â¬â Bez rozlokowania (crossdock) + anulowanie obowiÃâ¦zku putaway


- SSOT: `requires_putaway` na linii + `default_requires_putaway` na dokumencie; rozszerzony `stock_document_item_requires_putaway`.
- NO_PUTAWAY: brak DOCK inventory / brak karty w kolejce; qty doc==actual NIE wyÄ¹âÃâ¦cza putaway.
- Anuluj 0/X Ã¢â â mark NO_PUTAWAY + withdraw DOCK; partial Ã¢â â `PUTAWAY_ALREADY_STARTED`.
- UI: pasek trybu w przyjÃâ¢ciu; kebab Anuluj na liÄ¹âºcie Rozlokowanie PZ.
- Tests PÃ¢â¬âX: `test_wms_putaway_no_putaway_handling.py`. **No push.**

## 2026-07-21 Ã¢â¬â PrzyjÃâ¢cia: korekta iloÄ¹âºci + WADA + usuwanie pozycji


- Korekta: tryb Ã¢â¬Å¾Korekta iloÄ¹âºciÃ¢â¬Å¥ (Ã¢ÂâX); floor `received >= putaway`; DOCK upsert obsÄ¹âuguje delta Ã¢Ââ.
- WADA: podpiÃâ¢ty `ReceivingDamageModal` (wczeÄ¹âºniej brak renderu); mark-damaged tylko z DOCK-IN; putaway badge PeÄ¹ânowartoÄ¹âºciowy / WADA.
- Delete EXTRA: A received=0; B withdraw DOCK+audit+delete; C putaway>0 Ã¢â â PL reject.
- Tests AÃ¢â¬âI: `test_wms_receiving_correction_defect_delete.py`. **No push.**

## 2026-07-21 Ã¢â¬â WMS PrzyjÃâ¢cia: blind floor UX + status receiving


- Lista: peÄ¹âny numer bez ellipsis; badge tylko Otwarte/W trakcie/ZakoÄ¹âczone (bez Dostawa/WMS/FV/Rozlokowane).
- Ekran + modal: zawsze blind (brak qty dokumentu / rÄÅÄ¹Ä½nicy / cen); delta Ã¢â¬Å¾Przyjmujesz terazÃ¢â¬Å¥; ZatwierdÄ¹Å zamyka modal + focus skanera.
- Historia czynnoÄ¹âºci ukryta w WMS (audit SSOT bez zmian). Backoffice PZ bez zmian.
- Tests: `wmsReceivingListStatus`, blind receiving. **No push.**

## 2026-07-21 Ã¢â¬â PZ: ukryj OCZEKUJE FV + lokalizacje putaway 1:N

- FV: `purchase_workflow_status=PENDING_INVOICE` to martwy default bez encji/UI faktury Ã¢â¬â `showPurchaseWorkflowStatus` Ã¢â â false (kolumna DB zostaje).
- Lokalizacja linii: SSOT = `StockOperation` type PUTAWAY (`document_line_id` Äâ `location_id`); usuniÃâ¢ty fallback Inventory lot (bleed pre-stock).
- UI: `receiptLinePlacementRows` + qty + compact `+N lokalizacje` / HoverPopover ROZLOKOWANIE; DOCK-IN remaining.
- Tests: `test_pz_putaway_provenance_display.py`, FE placement + badge. **No push.**

## 2026-07-21 Ã¢â¬â WMS Dashboard/Topbar SSOT + order-issue-tasks heal

- Registry: `wmsTabConfig.ts` (accent, category, canPin, operationalMode) Ã¢â â dashboard + topbar.
- Topbar pins: `user_wms_profiles.wms_topbar_pins_json` + `PUT /auth/me/wms-topbar-pins`; default receiving/putaway/picking/packing/issues.
- RBAC: rozszerzony `wms_operational_modes`; gate `WmsOperationalModeGate`; brak bypass Ã¢â¬Å¾mandatory productionÃ¢â¬Å¥.
- Launcher: usuniÃâ¢te numery 1Ã¢â¬â9 i teksty SkrÄÅty/WskazÄÅwka; KPI Braki = liczba aktywnych tasks (bÄ¹âÃâ¦d Ã¢â°Â  0).
- order-issue-tasks: ensure Order ORM columns + heal/retry w `_fetch_orders_by_id`.
- Tests: `wmsNavTabs.test.ts`, `test_wms_topbar_pins.py`, handoff 500. **No push.**

## 2026-07-21 Ã¢â¬â RÃâ¢czne PZ: ostatnia cena zakupu + VAT snapshot + audyt PL

- Cena: `resolve_suggested_purchase_price_net_for_pz` (supplier PZ Ã¢â â global PZ Ã¢â â supplier_products Ã¢â â product.purchase_price); brak historii = `None` (nie 0).
- VAT: snapshot z `product_vat_rate_percent` na linii; rescan nie nadpisuje rÃâ¢cznych zmian.
- Audyt: `activity_log` (object_type=document) + istniejÃâ¦cy `ReceivingScanLog`; UI Ã¢â¬Å¾Historia czynnoÄ¹âºciÃ¢â¬Å¥; delty qty / OLDÃ¢â âNEW cena/VAT / wady / cofniÃâ¢cie.
- Endpointy: `PATCH Ã¢â¬Â¦/commercial`, `PATCH Ã¢â¬Â¦/supplier`, `DELETE Ã¢â¬Â¦/items/{id}`; qty signed delta.
- Tests: `test_wms_pz_price_vat_audit.py`. **No push.**

## 2026-07-21 Ã¢â¬â Nowa dostawa: wybÄÅr istniejÃâ¦cego dostawcy (bez auto-create)

- Modal searchable combobox Ã¢â â `GET /suppliers/` (name/NIP); jawne Ã¢â¬Å¾+ UtwÄÅrz nowego dostawcÃâ¢Ã¢â¬Å¥.
- Backend: `create_supplier` flag; bez `supplier_id` i bez flagi Ã¢â â 400 (nie tworzy rekordu).
- Duplicate: exact name Ã¢â â reuse. **No push.**

## 2026-07-21 Ã¢â¬â PrzyjÃâ¢cia: document/actual/rÄÅÄ¹Ä½nica + bez auto-DONE na expected

- EXISTING SSOT restored in WMS UI: `ordered_quantity` / `received_quantity` / `difference` / wady (`REJECTED_STOCK`).
- Auto-DONE removed: only explicit Ã¢â¬Å¾ZakoÄ¹âcz przyjÃâ¢cieÃ¢â¬Å¥; surplus over ordered allowed.
- Manual ordered=0 Ã¢â â UI shows Ã¢â¬Å¾Ã¢â¬âÃ¢â¬Å¥ for document/rÄÅÄ¹Ä½nica (not fake +N).
- Tests: lifecycle + presentation + workflow. **No push.**

## 2026-07-21 Ã¢â¬â PrzyjÃâ¢cia PZ: nie zamykaj rÃâ¢cznego PZ po 1 szt.

- ROOT 400 + znikniÃâ¢cie z listy: `compute_line_receiving_progress` traktowaÄ¹â `ordered=0` + received>0 jako `received` Ã¢â â `recalculate` Ã¢â â `DONE` Ã¢â â lista `receiving_status != DONE` + PATCH `_assert_receiving_session_open`.
- FIX: open-ended / manual lines Ã¢â â zawsze `in_progress` do jawnego Ã¢â¬Å¾ZakoÄ¹âcz przyjÃâ¢cieÃ¢â¬Å¥; ensure auto+1 teÄ¹Ä½ pisze DOCK-IN.
- UI: usuniÃâ¢ty banner DOCK-IN z listy PrzyjÃâ¢Ãâ¡; Ã¢â¬Å¾RozbicieÃ¢â¬Å¥Ã¢â âÃ¢â¬Å¾SposÄÅb przyjÃâ¢ciaÃ¢â¬Å¥/ukryte przy samych sztukach; Przyjmujesz teraz / Po zatwierdzeniu; statusy PL.
- Tests: `test_manual_pz_receiving_lifecycle.py`. **No push.**

## 2026-07-21 Ã¢â¬â LIVE NO_PENDING_SOURCE_LOCATION: UI location vs source_lock

- ROOT: FE treated `activeLocationId=276` as ready-for-basket; after PUT lock cleared, preserve kept UI id without server re-accept.
- FIX: `ensureServerSourceForBasket` before confirm; continuous re-accept via `lastOperatorAcceptedLocationRef`; never bare activeLocationId; detail `source_accepted` contract; MULTI_SCAN_TRACE SOURCE_* events.
- Tests: live same-location second basket + FE `multiPickingSourceAcceptance`. No push.

## 2026-07-21 Ã¢â¬â Fix GET /order-issue-tasks 500 (orders.picking_handoff_mode)

- EXACT: `OperationalError` / `UndefinedColumn` Ã¢â¬â `no such column: orders.picking_handoff_mode`
- Failing SQL: ORM SELECT Order in `_fetch_orders_by_id` (after OPEN tasks exist)
- Cause: ORM maps handoff (afc6843a); Braki request-path ensured only `order_issue_tasks.*`
- Fix: `ensure_order_issue_task_lifecycle_schema` Ã¢â â `ensure_orders_picking_handoff_mode_column` (SSOT)
- NOT from picking commits 2de7345a / f5e881be
- Tests AÃ¢â¬âI: `test_order_issue_tasks_handoff_column_500.py`. No push.

## 2026-07-21 Ã¢â¬â MULTI quantity-mode server-side source_lock

- Gap after route-skip: client could still send any WH `location_id` with stock.
- SSOT: `basket_put.source_lock` in session metadata (accept Ã¢â â confirm Ã¢â â clear on success).
- API: `POST /wms/picking/accept-source-location`; confirm resolves lock first; body location mismatch Ã¢â â SOURCE_LOCATION_MISMATCH.
- Detail refetch keeps lock (no longer `clear_basket_put_state` on quantity detail).
- FE: accept on location select; restore from `detail.source_lock`.
- Tests AÃ¢â¬âO + exact LIVE in `test_wms_multi_basket_source_provenance.py`. No push.

## 2026-07-21 Ã¢â¬â MULTI basket put: source provenance vs greedy route

- LIVE: brck1-B02 recognized but record_wms_quick_pick rejected A23 (Ã¢â¬Ånie naleÄ¹Ä½y do trasyÃ¢â¬Å¥); FE Ã¢â â UNKNOWN_SCAN_CODE.
- Cause: greedy route on physical Inventory (draft picks ignored) + stale series location in _do_record.
- Fix: skip_route on basket-bound pick; request location_id SSOT; structured SOURCE_LOCATION_* errors.
- Tests: `test_wms_multi_basket_source_provenance.py`. No push.

## 2026-07-21 Ã¢â¬â WMS receiving: effective validation + scan gate (ST-003)

- ROOT overrides: PZ `track_*` / receive-serial used legacy `Product.track_*`, ignored `validation_skip_*`.
- ROOT scan: serial awaiting could treat next product EAN as serial / block without opening product; now resolveÃ¢â âmodal, EANÃ¢â°Â serial, Polish conflict copy.
- SSOT: `resolve_effective_receiving_requirements`; scan `validation_requirements`; lot_keys + document lines use effective.
- Tests: `test_receiving_validation_effective_policy.py`. No push.

## 2026-07-21 Ã¢â¬â LIVE BASKET_PRODUCT_MISMATCH empty eligible (stale picked status)

- ROOT: `_line_eligible` skipped `wms_picking_line_status in (picked, missing)` while detail rem ignored status Ã¢â â UI unresolved=1, write eligible=[], Ã¢â¬Å¾Oczekiwane: Ã¢â¬âÃ¢â¬Å¥.
- FIX: eligibility = rem>0 + basket on active cart; heal stale `picked`; resolve accepts only eligible; rich 409 diagnostics.
- Tests: `test_wms_multi_basket_live_mismatch.py` (exact flow AÃ¢â¬âH). No push.

## 2026-07-21 Ã¢â¬â MULTI final audit: basket destination SSOT

- Proven mismatch: UI `orders[].basket_slot` could show S-1-2 from foreign-cart basket; confirm of local brck1-B02 Ã¢â â BASKET_PRODUCT_MISMATCH.
- Fix: `eligible_basket_destinations` on detail = list_eligible (+ barcode); FE destination list uses only that; postPutFollowUp from live eligible; scan resolve prefers barcode then primary label.
- 409 extra: scanned_basket_id/barcode + eligible rows for next LIVE repro.
- Tests: `test_wms_multi_picking_final_audit.py` (stock flow, parallel, foreign label, local OK, alias). No push.

## 2026-07-21 Ã¢â¬â MULTI picking effective stock + active location

- ROOT: detail showed raw Inventory; `useEffect([detail])` cleared activeLocationId after confirm refetch.
- SSOT: `location_pick_stock_projection_map` Ã¢â â detail `stock_quantity`=effective; write path unchanged.
- Active loc preserved when effective>0; cleared on product change / zero stock; no FIFO fallback.
- Basket UI labels unified to `primary_basket_label` (S-1-2 Ã¢â â brck1-B02).
- Tests: `test_wms_picking_location_effective_stock.py` + FE `multiPickingActiveLocation.test.ts`.
- No push.

## 2026-07-21 Ã¢â¬â Replenishment need audit + Polish UI (no push)

- SSOT confirmed fill-to-min: need = min_pick Ã¢Ââ pick; demand/max only in priority.
- Operator UX: PrzenieÄ¹âº N / Z / DO; partial fill note; no raw enums in Centrum operacyjne.
- Labels: `replenishmentUiLabels.ts` (+ severity/alert level); BUFFER removed from alert copy.
- Tests: CASE 1Ã¢â¬â3/6 policy + FE label maps. Formula unchanged (CORRECT for SSOT).
- SAFE TO PUSH: NO (user hold; demand-fill is product GAP if desired).

## 2026-07-20 Ã¢â¬â User-facing events always Polish (Historia czynnoÄ¹âºci)

- Root cause: ActivityLogTable mapped cart `event_code` via `getOrderEventLabel` Ã¢â â English title-case + CSS uppercase Ã¢â â Ã¢â¬Å¾CART RELEASEDÃ¢â¬Å¥.
- SSOT FE: `getEventDisplayLabel` (`eventDisplayLabels.ts`); unknown Ã¢â â Ã¢â¬Å¾Zdarzenie systemoweÃ¢â¬Å¥.
- SSOT BE: `title_pl` / `compose_informative_message` on presentation (no history migration).
- Fallback: no English `.title()` humanize for unknown WMS ops / material needs / workflow.
- Rule: `.cursor/rules/user-facing-polish.mdc`. Tests: FE vitest + `test_event_display_polish.py`. No push.

## 2026-07-20 Ã¢â¬â Trusted capacity vs computational fallback (putaway UX)

- Split: runtime 1Äâ1Äâ1/0 kg stays computational; operator numbers require trusted inputs.
- `capacity_trust.py`: geometry_source REAL_DATA|FALLBACK, capacity_numeric_trusted, planning probe=1.
- Presentation: POJEMNOÄ¹Å¡Ãâ : NIEOKREÄ¹Å¡LONA (no ~63000); one discreet banner on putaway.
- Ranking ignores synthetic max_fit; weight-only bounds still score/limit.
- Distribution: unknown geometry Ã¢â â probe 1, never allocate 500 from fake capacity.
- Packing: GEOMETRY_SOURCE_FALLBACK; never EXACT on synthetic dims.
- Tests: `test_capacity_trust_ux.py` AÃ¢â¬âG + suites green (88). No push.

## 2026-07-20 Ã¢â¬â Missing logistics: technical defaults + provenance

- SSOT: `normalize_product_logistics` Ã¢â¬â runtime 1Äâ1Äâ1 / 0 kg; never auto-write master.
- Provenance: provided = master field presence (real 1Äâ1Äâ1 Ã¢â°Â  default).
- Receiving validation: NULL/missing fails when required; technical defaults do NOT pass.
- Capacity/packing/putaway: `used_defaults` + ESTIMATED confidence; FE szacunkowe labels.
- Tests: `test_product_logistics_defaults.py` (M1Ã¢â¬âM10 / receiving / P12Ã¢â¬âP13) + 75 fit suite green.
- No push. SAFE TO PUSH: NO (multi-carton persist GAP + smoke).

## 2026-07-20 Ã¢â¬â PRODUCT INTEGRATION Phase 1 + core Phase 2

- Capacity contract: `ProductLocationCapacityRead` + GET product/location + POST batch (Ã¢â°Â¤80).
- Putaway: capacity fields on suggestions; UI cards; distribution plan PLAN-only + revalidate rebuild.
- Product edit: batch capacity list for inventory locations.
- Packing: fit recommendation panel, alts/reject labels, override confirm, plan[] read-only.
- Multi-carton persistence still SINGLE selected_carton_id (explicit GAP).
- Tests: `test_fit_engine_product_integration.py` + existing fit suites green.
- No push.

## 2026-07-20 Ã¢â¬â FIT ENGINE production gaps closed (post deep audit)


- Internal/usable carton dims: `internal_*_cm`, `max_payload_kg`; fit uses internal; fallback + `USABLE_DIMENSIONS_NOT_DEFINED`.
- Product logistic validator SSOT + `Product.fragile` (Ã¢â°Â  NO_STACK); FE ProductEdit + CartonDetail settings.
- AABB placement hard gate; free-space prune; Smart cannot primary when eligible empty.
- Packaging ranking WHY_SELECTED; multi-carton HEURISTIC/ESTIMATED + bounded improve; packing plan contract.
- Invariants AÃ¢â¬âO + O2. Tests: 54 fit + 8 slotting OK. No commit/push.

## 2026-07-20 Ã¢â¬â FIT ENGINE deep audit + critical fixes

- BUG: Smart Matching + finalize_primary mogÄ¹âo wybraÃâ¡ karton z `Odrzucony:` (volume cost) mimo fail geometrycznego Ã¢â â FIXED (merge + primary_pool).
- BUG: compression stosowana po rotacji na niewÄ¹âaÄ¹âºciwej osi Ã¢â â FIXED (tylko gdy vertical == product.height).
- SEMANTIC: same-SKU occupancy bez placement map Ã¢â â confidence ESTIMATED w location_capacity_solver.
- Regressions: `test_fit_engine_audit_regressions.py`. No commit/push. SAFE TO PUSH: NO (pozostaÄ¹âe GAPY).

## 2026-07-20 Ã¢â¬â Shared FIT / CAPACITY ENGINE (SSOT)

- NEW: `backend/services/fit_engine/` Ã¢â¬â geometry XYZ, orientations, stacking, compression, weight, placement.
- Location: `capacity_service` + `location_capacity_solver` Ã¢â â shared core (nie volume-only).
- Packaging: `cartonization_solver` + `three_d_matching` Ã¢â â prawdziwy geometric fit (nie SUM volume).
- Product: `max_stack_count` / `carton_max_stack_count` (limit jednego stosu).
- Tests: CORE 1Ã¢â¬â14, LOCATION 1Ã¢â¬â6, PACK 1Ã¢â¬â15 (`test_fit_engine_matrix.py`).
- FE Magazyn `calculatePackingLayout` = tylko wizualizacja designera; operational SSOT = backend.
- No commit / no push.

## 2026-07-20 Ã¢â¬â Pakowanie: skan EAN z listy nie pomija widoku zamÄÅwienia

- ROOT: `packingScanBootstrap` Ã¢â â `applyPackingResult` przy `fully_packed` (np. 1Äâ1) od razu `awaitingPostPackCarton` Ã¢â â modal Ã¢â¬Å¾Wybierz opakowanieÃ¢â¬Å¥.
- FIX: bootstrap z listy deferuje karton/finalizacjÃâ¢; pokazuje PackingView + CTA Ã¢â¬Å¾Wybierz opakowanieÃ¢â¬Å¥. Skan nadal zaliczony raz (API resolve-ean/scan).
- Helper `decideListScanBootstrapUi` + testy. No push.

## 2026-07-20 Ã¢â¬â ZatwierdÄ¹Å i wrÄÅÃâ¡: confirm remaining across locations

- Was: button only navigated back (no picks).
- Now: `POST /wms/picking/confirm-remaining` plans remaining qty on routing location priority (pick-type Ã¢â â name Ã¢â â id), writes draft Picks via `record_wms_quick_pick` / cartless; atomic on insufficient stock; no global Inventory mutation until finalize.
- FE: detail footer calls API then returns to list.
- Tests: `test_wms_confirm_remaining_picks.py`. No push.

## 2026-07-20 Ã¢â¬â ANULUJ ZBIERANIE: full MULTI session rollback

- SSOT: `Inventory` = location stock; global = SUM(Inventory). Cancel never creates PZ/PW/WZ / global stock mutation.
- Draft Pick (`picked_at IS NULL`): delete record only; location qty unchanged; informational `put_back_required`.
- Finalized Pick (defensive): restore qty at exact `Pick.location_id` (no FIFO).
- Shortage: delete only `FE_MISSING` with `metadata.cart_id` / `picking_session_id`.
- Cart/baskets/operator/session cleared; order status from session snapshot; rich `PICKING_CANCELLED` audit.
- SAVEPOINT around optional tables so lean DBs cannot poison cancel txn.
- Tests: `test_wms_cancel_picking_rollback.py` (+ lifecycle SSOT green). Commit, no push.

## 2026-07-20 Ã¢â¬â FIX 500 report-shortage-bulk (Postgres FOR UPDATE + joinedload)

- ROOT: bulk locked OrderItem with `joinedload(product)+with_for_update` Ã¢â â Postgres ProgrammingError Ã¢â â uncaught 500.
- FIX: lock without joinedload; validate cart/tenant/product; map domain errors to 409 codes; SQLAlchemy Ã¢â â 409 PL.
- Orchestrates same `report_wms_picking_product_shortage`. Tests CASE 1Ã¢â¬â9 + lock regression. No push.

## 2026-07-20 Ã¢â¬â MULTI shortage UI audit/regression PASS

- allocations[] = order_item.wms_picking_line_missing_qty + Order.basket (no FIFO, no product_idÃ¢â âbasket).
- Cart READY only when unresolved=0 & shortage=0; else NIEROZLICZONE / NIEKOMPLETNE.
- Counter always `Braki: N szt.` (braki_szt). Write paths untouched.
- Tests: allocation regression + FE presentation. Commit, no push.

## 2026-07-20 Ã¢â¬â MULTI shortage UI: per order_item / basket (not SKU-only)

- ROOT: BE had order_item shortage SSOT; product-lines list exposed only product aggregate; FE showed `BRAK 1/9` + Ã¢â¬Å¾ZamÄÅwienie niekompletneÃ¢â¬Å¥ on whole SKU.
- FIX projection: `allocations[]` on product-lines (required/picked/shortage/unresolved per order_item + basket); session `braki_szt` / `zamowienia_z_brakami`; cart assigned orders + basket cells show NIEKOMPLETNE / GOTOWE from line missing qty.
- FE: list card + detail header name order/basket; counter Ã¢â¬Å¾Braki: N szt.Ã¢â¬Å¥; Rozliczenie per koszyk labels BRAK/NIEKOMPLETNE/GOTOWE.
- Shortage write SSOT unchanged (`order_item_id`). No push.

## 2026-07-19 Ã¢â¬â Legacy draft Pick recovery (per Pick.id)

- `GET /wms/picking/product-picks` + `POST /wms/picking/picks/{id}/undo` (Inventory=0, shortage=0).
- Finalize 409: code `PICK_LOCATION_STOCK_MISMATCH` + `failing_pick` + operator message; FE CTA Ã¢â¬Å¾PrzejdÄ¹Å do pobraniaÃ¢â¬Å¥.
- MULTI panel: Historia pobraÄ¹â per koszyk + cofnij konkretny draft.
- Tests: `test_wms_undo_pick_by_id.py`. No push / no auto-migrate cart_id=2.

## 2026-07-19 Ã¢â¬â LIVE finalize still 409: LEGACY vs WRITE PATH separation

- Classification: **LEGACY BAD PICKS** on cart_id=2 most likely; new write path **hard-gated** (cannot create qty=5 when effective=1).
- LIVE `wymagane 5 / dostÃâ¢pne 1` reproduced: Pick1 LOC-A=3 then Pick2 LOC-A=5 on stock=4; in-txn after Pick1 available=1; rollback restores stock + `picked_at=NULL`.
- Diagnostics only (no finalize logic change): `FINALIZE_PICK_TRACE` / `FINALIZE_PICK_FAILED` + `failing_pick` in 409 detail.
- Undo = LIFO draft Picks per product (optional location); does not take MULTI `order_item_id` from FE Ã¢â¬â recovery possible but not precise split. No auto FIFO reassign. No push.

## 2026-07-19 Ã¢â¬â WRITE PATH location provenance (LIVE finalize 409 class)

- ROOT CONFIRMED: MULTI quantity put used FE `locations[0]` without source scan; modal max = line remaining only; BE did not check location stock / pending picks Ã¢â â Pick qty=5 @ loc with stock 1 Ã¢â â finalize 409.
- FIX (write path only; finalize untouched): `PICK_LOCATION_REQUIRED`, `QUANTITY_EXCEEDS_LOCATION_STOCK`, `effective_pickable = Inventory Ã¢Ââ pending Pick`; FE blocks multi-loc basket without `activeLocationId`; location scan before basket; modal max = min(line, loc).
- Tests: `test_wms_basket_put_location_provenance.py`. No push.

## 2026-07-19 Ã¢â¬â LIVE finalize-cart 409 audit (product 192 / cart 2) Ã¢â¬â NO FIX YET

- ERROR: `wymagane 5.0, dostÃâ¢pne 1.0` from `consume_inventory_fifo_slices` via `_decrement_inventory_for_wms_pick` on pending `Pick` (`picked_at IS NULL`).
- WHY 5: `qty = float(Pick.quantity)` of the failing pending row Ã¢â¬â **not** requiredÃ¢Ââshortage, **not** product aggregate 9.
- Stock on QUANTITY_CONFIRM: **NO** (`picked_at=None`). Stock on FINALIZE: **YES**. Double deduction: **NO**. Shortage never enters inventory consume.
- Finalize preserves `Pick.location_id` (no cross-location re-FIFO). Live Pick/Inventory dump unavailable locally (`warehouse.db` empty, no `.env`).
- Suspected write-time provenance: MULTI basket confirm can fall back to `locations[0]` when `activeLocationId` unset Ã¢â¬â stamps all picks on one loc while stock is split. **STOP before changing finalize/quantity/shortage SSOT.**

## 2026-07-19 Ã¢â¬â MULTI: quantity put + shortage per allocation (no FIFO close)

- STATE MACHINE: SELECT_PRODUCT Ã¢â â SELECT_BASKET Ã¢â â ENTER_QUANTITY Ã¢â â CONFIRM Ã¢â â next basket / finish.
- SHORTAGE SSOT: `report_wms_picking_product_shortage` requires `order_item_id` on baskets carts; MULTI caps declarable to remaining (no pickÃ¢â âshortage convert).
- FE: per-basket panel + MultiAllocationShortageModal; quantityMode suppresses EAN+1/series; post-partial Ã¢â¬Å¾oznacz pozostaÄ¹âe jako brakÃ¢â¬Å¥.
- Tests: `test_wms_multi_basket_allocation_scenario.py` (20-qty CASE 6); FE allocation + scan route. No push.

## 2026-07-19 Ã¢â¬â DEFAULT QUANTITY MODE + fix BASKET_PRODUCT_MISMATCH

- ROOT MISMATCH: leftover `active_series` for foreign SKU blocked product-context basket resolve (`BASKET_PRODUCT_MISMATCH` on S-1-2 while UI showed eligible).
- FIX: clear foreign series when detail `product_id` provided; unify `resolve_allocation_for_basket_scan` with detail SSOT.
- NEW FLOW: EAN/CLICK = select product; basket = QUANTITY_REQUIRED (Pick=0); confirm quantity = Pick +N (live revalidate).
- FE: `BasketPutQuantityModal` (receiving-style ÃÂ±); list MULTI EAN navigates without pending.
- Tests: `test_wms_basket_put_quantity_mode.py` CASE 1Ã¢â¬â12. No push.



- ROOT: `pending=false+series=false` Ã¢â â EXPECTED_PRODUCT_SCAN blocked eligible basket on detail even though product_id was known from route.
- NEW MODEL: selected product (click|EAN|route) vs physical pending qty. Basket+context Ã¢â â SERIES_ACTIVATED qty=0; basket+pending Ã¢â â Pick+1; EAN+series Ã¢â â Pick+1.
- Backend: `confirm_basket_put(product_id, location_id)`; API body fields; FE route `select_destination`; UI Ã¢â¬Å¾Wybierz koszykÃ¢â¬Å¥.
- Tests: CASE 1Ã¢â¬â10 in `test_wms_basket_put_product_context_destination.py` (12 pass). No push.



- ROOT: Jedyny URL `/wms/picking/products/:id` idzie przez `goDetail`. Live `DETAIL_MOUNT has_seed=false navigation_source=click_or_other` = navigate **bez** seed/token Ã¢â¡â nie lista PRODUCT_SCAN. Brak `PRODUCT_SCAN_REQUEST_START` / `GLOBAL_SCAN` EAN przed mount Ã¢â¡â entry byÄ¹â **click** (lub bare goDetail), nie fizyczny skan. Label `click_or_other` mylÃâ¦cy Ã¢â¬â brak seed = Ã¢â¬Å¾nie physical_scanÃ¢â¬Å¥.
- FIX: jawne `navigationSource` (physical_scan|click|pending_resume|other); HARD block physical_scan bez quick-pick+pending; `preparePickingProductDetailNavigation` + Scanner Helper dispatch harness; DETAIL_MOUNT czyta source z routera.
- Tests: `wmsScanDispatch.integration.test.ts` via `performScannerHelperScan` (nie bezpoÄ¹âºredni list handler).
- No confirm-basket-put / allocation changes. No push until live retest.



- ROOT: Fizyczny skan EAN w Scanner Helper odpalaÄ¹â `products/search` + `returns/lookup` (catalog query z inputu), a workflow mÄÅgÄ¹â nie mieÃâ¡ `consumed`. Detail po wejÄ¹âºciu miaÄ¹â `pending=false` Ã¢â â basket `EXPECTED_PRODUCT_SCAN`.
- FIX: `handleScan` awaits handler + `{consumed}`; picking path suppresses helper lookups; list returns SCAN_CONSUMED + PRODUCT_SCAN before navigate + traces; detail keeps seed/handler during load.
- Tests: `wmsScanDispatch.integration.test.ts` (dispatcher entry, not backend helper alone).
- No push.

## 2026-07-19 Ã¢â¬â REAL MULTI: list EAN = PRODUCT_SCAN Ã¢â â detail STATE B (no second EAN)

- ROOT: List could navigate without pending visible on detail (STATE A Ã¢â â basket EXPECTED_PRODUCT_SCAN). Valid EAN without selectedLocation Ã¢â â UNKNOWN_SCAN_CODE.
- FIX: list PRODUCT_SCAN before navigate + pending seed; detail effectivePending; UI Ã¢â¬Å¾PRODUKT ZESKANOWANY Ã¢â¬â ZESKANUJ KOSZYKÃ¢â¬Å¥; get_basket_put_ui_state via find_open_picking_session; re-attach pending after detail touch; location fallback for product EAN.
- Tests: `test_wms_basket_put_list_scan_pending_survives_detail.py`.
- No push.

## 2026-07-19 Ã¢â¬â PRE-PUSH AUDIT ab1f70a8: scan lock + non-MULTI gate + session FOR UPDATE

- BLOCKERS fixed: FE scan gate (detail+list); list `requiresBasketPut` from API not `Boolean(cartId)`; pending before bundle; session `FOR UPDATE` on put mutations.
- Regression: same SKU S-1-2 complete Ã¢â â unbound Ã¢â â S-1-1; FE catalog/popup contract + non-MULTI fallthrough.
- No push.

## 2026-07-19 Ã¢â¬â STRICT MULTI scan state machine + operator error popups

- CLASSIFY Ã¢â â STATE Ã¢â â VALIDATE: invalid scan consumed, ZERO mutation.
- Codes: EXPECTED_BASKET_SCAN, EXPECTED_PRODUCT_SCAN, BASKET_EMPTY, BASKET_OTHER_CART, OVERPICK_BLOCKED, Ã¢â¬Â¦
- FE: `wmsScanErrorCatalog` + fullscreen `WmsScanFeedbackOverlay` + error beep.
- Tests: `test_wms_basket_put_scan_state_machine.py` + FE route/catalog.

## 2026-07-19 Ã¢â¬â REAL runtime: state A UI + silent basket scan (brck1-B0x)

- ROOT: Screen Ã¢â¬Å¾KOSZYKI WYMAGAJÃâCEÃ¢â¬Â¦ Zeskanuj EAN, potem koszykÃ¢â¬Å¥ = pending=NULL (state A). Detail handler ignored brck1-B0x (silent). List with pending blocked basket instead of confirm. classifyWmsScanCode treated brck1-B01 as location_like.
- FIX: multiPickingScanRoute (A/B/C); detail/list route basket Ã¢â â confirm; clear state A copy; basket_like classify; MULTI_SCAN_TRACE; brck1 runtime tests.
- SSOT unchanged: EANÃ¢â âpendingÃ¢â âbasketÃ¢â âPick.

## 2026-07-19 Ã¢â¬â SERIES LINE PROGRESS: live line_remaining Ã¢â°Â  product aggregate

- ROOT: series banner used product aggregate `remaining` (e.g. 17) instead of allocation rem (8).
- FIX: `project_active_series_with_live_remaining` on UI/API series; FE banner + toast use `active_series.line_remaining` only. Aggregate widget unchanged.
- Tests: `test_wms_basket_put_series_line_progress.py` CASE 1Ã¢â¬â5.

## 2026-07-19 Ã¢â¬â FINAL INTEGRATION AUDIT MULTI basket put (42cfee48Ã¢â¬Â¦788ebff8)

- HEAD `788ebff8`; all 4 commits present; 38 basket-put tests PASS; no code changes; no push.
- Hard gates PASS: no FIFO destination before basket scan; no Pick before confirm; no cross-SKU series on detail; no double EAN required.
- Residual BUG (non hard-gate): series banner Ã¢â¬Å¾PozostaÄ¹âoÃ¢â¬Å¥ uses aggregate product `remaining`, not series line_remaining (pending path is correct per basket).
- SAFE TO PUSH: YES (hard gates); fix series-line progress before treating UI as fully SSOT-clean.

## 2026-07-19 Ã¢â¬â MULTI 409 on S-1-2: foreign/stale series on product detail

- ROOT: `get_basket_put_ui_state` exposed `active_series` for *any* product_id. Detail SKU X showed SERIA S-1-1 from leftover series of SKU Y; progress 0/N for X; basket scan S-1-2 Ã¢â â series switch with `series.product_id=Y` Ã¢â â `BASKET_PRODUCT_MISMATCH` 409.
- FIX: product-scoped series/pending on detail; sanitize invalid series; pending forces no destination label; clearer mismatch when switch product Ã¢â°Â  basket need.
- Tests: `test_wms_basket_put_multi_sku_s12_regression.py` CASE 1Ã¢â¬â7.

## 2026-07-19 Ã¢â¬â Pending basket-put list UX + cancel

- List shows banner for `basket_put_pending` only (series Ã¢â°Â  pending).
- Resume detail / same-SKU scan opens existing pending; other SKU blocked.
- `POST /picking/cancel-pending-basket-put` clears pending only (no Pick/stock/series).
- Tests: `test_wms_basket_put_pending_list_ux.py` CASE 1Ã¢â¬â9.

## 2026-07-19 Ã¢â¬â PRE-PUSH AUDIT MULTI basket put (42cfee48 Ã¢â â follow-up)

- BLOCKER found: series switch invented pending qty=1 and wrote Pick; API rejected confirm when pending=None (switch dead in prod).
- FIX: `SERIES_DESTINATION_SWITCHED` retargets series with quantity_put=0; API allows confirm when series active; `picked` = qty>0.
- eligible_baskets = UI hint; confirm always `resolve_allocation_for_basket_scan` live DB.
- Tests: +stale eligible, switch no increment, basket without pending, product change, 20-qty overpick.

## 2026-07-19 Ã¢â¬â MULTI basket put: free basket choice + list EAN as PRODUCT_SCAN

- ROOT: `resolve_next_basket_allocation` FIFO bound `order_item_id`/`expected_basket_id` into pending at product scan Ã¢â â forced Ã¢â¬Å¾KOSZYK DOCELOWY: S-1-1Ã¢â¬Å¥; list EAN only navigated Ã¢â â detail demanded second EAN.
- FIX SSOT: product scan Ã¢â â product-level pending + `eligible_baskets` (no Pick); basket scan Ã¢â â `resolve_allocation_for_basket_scan` Ã¢â â Pick + series for that basket/line. Mid-series other-basket scan switches destination.
- FE: list scan calls quick-pick then detail with one-shot `listProductScanToken`; UI lists all eligible baskets (no single destination).
- Errors: `BASKET_PRODUCT_MISMATCH`, `BASKET_PRODUCT_ALREADY_COMPLETE`; `scope_order_id` on quick-pick (no recovery gate).
- Tests: `test_wms_basket_put_confirmation.py` CASE 1Ã¢â¬â11 (+ extras).

## 2026-07-19 Ã¢â¬â POST /orders 500: phantom offer_id (ProductSalesOffer)

- ROOT: `GET /products/{id}/sales-offers` Ã¢â â `ensure_default_offer` + flush, **no commit**; `get_db` closes Ã¢â â rollback. FE stored ephemeral offer.id Ã¢â â POST `offer_not_found` Ã¢â â 500.
- NOT product.id-as-offer_id (FE used real offer.id from list); IDs were never persisted.
- FIX: list endpoint `db.commit()` after ensure; FE auto-add uses `product_id` (offer_id only on explicit multi-offer pick); create maps `ProductSalesOfferError` Ã¢â â 400 `OFFER_NOT_FOUND`.
- Tests: `test_order_create_offer_contract.py`.

## 2026-07-19 Ã¢â¬â Packing BASKET ghost count (entry 1, scan 404)

- ROOT: `packing_mode_distribution` / `_packing_orders_base_query` liczyÄ¹ây `picking_handoff_mode=BASKET` bez live custody; po finish custody cleared, handoff zostaje (provenance) Ã¢â â COUNT=1, GET basket Ã¢â â EMPTY.
- FIX: SSOT eligibility + scope Ã¢â¬â BASKET wymaga `Order.basket_id` + `CartBasket.order_id==Order.id`; exclude `wms_packing_automation_finished_at`; PACKING_QUEUE_TRACE przy ghost.
- NIE czyszczono `picking_handoff_mode`.
- Tests: `test_packing_active_queue_ssot.py` CASE 1Ã¢â¬â7.

## 2026-07-19 Ã¢â¬â POST /orders 500: diagnostics-only (no root-cause fix yet)

- Deployed `6b70515e` contains `ORDER_CREATE_ERROR` (from parent `2aa7114b`) but only `logger.error` (no traceback) + commit `6b70515e` itself is pycache-only.
- Startup `columns_added=0` Ã¢â¡â do not assume missing `picking_handoff_mode`.
- Upgrade: `ORDER_CREATE_TRACE` stages + `logger.exception` + stderr print + `flushed/committed/order_id` + payload fingerprint; wrap unexpected Ã¢â â safe HTTP 500 after rollback.
- Suspects to verify on next deploy log: `product_sales_offers` (resolve lines), `tenant_fulfillment_configurations` (POST_FLUSH_ASSIGN), item offer FK Ã¢â¬â not handoff alone.
- Tests: `test_order_create_diagnostics.py`.

## 2026-07-19 Ã¢â¬â Orphan PACKING cart after last pack (cart id=2 pattern)

- ROOT: `finish_packing` cleared custody only when `order.cart_id` set; remaining used session-heal (`list_orders_on_cart`). Path: cart_id already NULL + `picking_session_id`/`current_session_id` Ã¢â â remaining>0 Ã¢â â event `order_packed` Ã¢â â stuck PACKING; UI later 0 orders (cart_id-only).
- cancel-session 409 `InvalidCartTransition` READY/PACKING = correct (CASE A Ã¢â°Â  CASE C). MagazynÃ¢â âWÄÅzki must use admin-release heal, not cancel-session.
- FIX: always clear packed-order custody; remaining = `Order.cart_id` only; `release_empty_orphan_cart` SSOT; admin-release allows empty READY/PACKING orphan; UI copy for orphan Ã¢â¬Å¾Zwolnij wÄÅzekÃ¢â¬Å¥.
- Tests: lifecycle ssot orphan / last-pack / cancel still blocked.

## 2026-07-19 Ã¢â¬â POST /orders 500: missing picking_handoff_mode

- ROOT: ORM INSERT always includes `picking_handoff_mode`; prod schema without column Ã¢â â OperationalError Ã¢â â HTTP 500.
- PG tier0 previously skipped dedicated order ensures (sqlite-only steps); sync can fail silently.
- FIX: `ensure_orders_create_schema` before create; PG tier0 explicit handoff ensure; `ORDER_CREATE_ERROR` log + rollback; list schema includes handoff.
- Tests: `test_order_create_schema.py`.

## 2026-07-19 Ã¢â¬â AUDIT: picking dashboard 0 vs panel 1 (#1233) + cancel 409

- Dashboard 0 = PRELIMINARY eligibility (cart_id NULL + picking_finished_at NULL + open fulfillment) Ã¢â¬â **correct**, nie bug licznika.
- Cancel cart_id=2 Ã¢â â 409 READY_FOR_PACKING/PACKING = **correct**; UI nadal oferuje Ã¢â¬Å¾Anuluj zbieranieÃ¢â¬Å¥ bez gate na cart status.
- Reopen Picking: **nie istnieje** (tylko tekst bÄ¹âÃâ¢du); status panel Ã¢â â picking source bez guarda (`apply_order_panel_ui_status` / bulk).
- PROD row #1233: nie odczytano (brak DB); rekonstrukcja z 409 + predicates.
- NEEDS: status guard + kanoniczny Reopen + UI cancel gate. NIE counter fix.

## 2026-07-19 Ã¢â¬â Packing finish preflight audit (AVAILABLE)

- AVAILABLE + aktywne `order.cart_id` Ã¢â°Â  legalny flow (lifecycle breach; `finish_packing` no-op bez detach).
- Preflight: tylko PACKING | READY_FOR_PACKING; AVAILABLE+custody Ã¢â â `CART_LIFECYCLE_INCONSISTENT` przed pipeline.
- Tests: AVAILABLE custody fail + local 4xx before pipeline.

## 2026-07-19 Ã¢â¬â Packing finish HTTP 400 (mode=baskets / basket-first)

- ROOT: `packing_finish_order` rzucaÄ¹â `CART_NOT_IN_PACKING` gdy cart = `READY_FOR_PACKING` **po** post-pack pipeline; basket-first nie woÄ¹âa `startPacking`. `finish_packing` juÄ¹Ä½ akceptowaÄ¹â READY.
- FIX: preflight cart przed mutacjami; READY_FOR_PACKING OK; usuniÃâ¢ty hard-raise; `PACKING_FINISH_TRACE`; idempotentny retry po `automation_finished_at`.
- Tests: `test_packing_finish_baskets.py` CASE 1Ã¢â¬â10.
- ORDER-ISSUE-TASKS 500: UNRELATED.

## 2026-07-19 Ã¢â¬â FINAL PRE-PUSH AUDIT (afc6843a + packing) Ã¢â¬â fixes

- BUG: cartless finalize used relative import `.picking_handoff_service` Ã¢â â ModuleNotFoundError (CARTLESS handoff never wrote). Fixed Ã¢â â `..picking_handoff_service`.
- BUG: `finish_packing` partial MULTI left `CartBasket.order_id` set. Fixed: clear basket slot like detach.
- GAP (open): `PATCH /orders/{id}/select-carton` tenant-only, no packing handoff/cart scope.
- GAP (open): recovery/consolidation Ã¢â â READY_TO_PACK can leave `picking_handoff_mode=NULL` (not cart/cartless finalize paths).
- PERF WARN: soft reconcile on every `GET /packing/modes` loads packing-ready orders + completed null-cart sessions.
- HEAD at audit: `136fed44` (memory+pycache only after afc6843a). 24863af + afc6843a ancestors OK; first-scan helpers intact.
- Tests matrix: 80 passed (handoff/packing/lifecycle/cartless/finalize); FE packingHelpers 4 passed. Postgres schema: NOT TESTED.

## 2026-07-19 Ã¢â¬â PickÃ¢â âpack handoff provenance + scoped packing

- SSOT: `orders.picking_handoff_mode` = CART|BASKET|CARTLESS (immutable execution snapshot).
- Live `cart_id`/`basket_id` = custody until pack finish (CartLifecycle unchanged).
- Packing queue/EAN scoped; basket-first warehouse-global; no global FIFO; no NULLÃ¢â âCARTLESS.
- Entry counts from real cohorts; 24863af pack-once preserved with required scope.
- Tests: `test_picking_packing_handoff.py`.

## 2026-07-19 Ã¢â¬â WMS Packing: first list scan + fake FINALIZED

- ROOT: list EAN Ã¢â â resolve-only navigate (no pack); `isPackingSessionFinished` = `packed_at`; AutoActions hardcoded Ã¢ÅâÃ¢Åâ; list qty without `order_item_required_pack_qty`.
- AFTER: `POST /wms/packing/resolve-ean/scan` (FIFO + +1); FINALIZED = `wms_packing_automation_finished_at` + packed complete; list `pack_qty_from_required`; pipeline real states; lines_packed_complete requires `total_required_qty > 0`.
- Tests: `test_wms_packing_scan_flow.py`, `packingHelpers.test.ts`.
- ORDER-ISSUE-TASKS 500: UNRELATED.

## 2026-07-19 Ã¢â¬â Baskets put confirmation (PRODUCTÃ¢â âBASKET)

- ROOT: quick-pick incrementowaÄ¹â qty bez skanu koszyka; UI tylko Ã¢â¬Å¾OdÄ¹âÄÅÄ¹Ä½ doÃ¢â¬Â¦Ã¢â¬Å¥.
- AFTER: SSOT `wms_basket_put` w `WmsOperationSession.metadata_json`; pending put + series per (product, order_item, basket).
- API: gate w `POST /picking/quick-pick`; `POST /picking/confirm-basket-put`.
- FE: duÄ¹Ä½y ekran potwierdzenia koszyka; seria bez ponownego skanu.
- Tests: `test_wms_basket_put_confirmation.py` CASE 1Ã¢â¬â11.

## 2026-07-19 Ã¢â¬â Modal Ã¢â¬Å¾Edycja trybu zbieraniaÃ¢â¬Å¥: wÄ¹âasny sticky footer

- ROOT: modal bez Zapisz/Anuluj; UX kierowaÄ¹â na globalny sticky bar (z-40) widoczny pod overlayem.
- AFTER: modal z-5000, sticky header/footer; Zapisz = commit do `savedConfigs` (bez API); Anuluj/X/ESC = restore `editBackup`; globalny pasek = API.
- Commit: `ca32f29` (bez push).

## 2026-07-19 Ã¢â¬â GET /order-issue-tasks 500: missing archived_at on request path

- ROOT (reproduced): request-path `ensure_order_issue_task_lifecycle_schema` added priority_* but **not** `archived_at`/`archived_by_user_id`; ORM SELECT still requires them Ã¢â â `OperationalError`/`UndefinedColumn` after previous priority-only fix.
- FIX: call `ensure_order_issue_tasks_archive_columns` in request-path ensure; `ORDER_ISSUE_TASKS_ERROR` structured logging (no traceback to FE).
- Tests: `test_order_issue_tasks_archive_request_path.py` (legacy schema Ã¢â â ensure Ã¢â â list Äâ3).
- PROD SCHEMA VERIFIED: NO (no Railway/DB access); PG runtime test: NOT AVAILABLE.

## 2026-07-19 Ã¢â¬â CARTLESS PICKING (bulk / cart_no_scan)

- ROOT: `cart_no_scan` byÄ¹â AUTO_SELECT_PHYSICAL_CART via `GET /picking/default-cart` Ã¢â â first BULK cart Ã¢â â claim.
- AFTER: `start_cartless_picking` Ã¢â¬â `WmsOperationSession.cart_id=NULL`, `Order.cart_id=NULL`, scope=`picking_session_id`.
- API: `/picking/start-cartless`, `finalize-cartless`, `cancel-cartless-session`, `heartbeat-cartless`; product-lines + quick-pick + shortage z `picking_session_id`.
- FE: brak default-cart dla cart_no_scan; label Ã¢â¬Å¾Zbieranie bez identyfikacji wÄÅzkaÃ¢â¬Å¥; header sesji bez CART-xxxx.
- Timeout: `release_stale_cartless_sessions` w `run_cart_lifecycle_maintenance`.
- Tests: `test_wms_cartless_picking_ssot.py` (9). Bez migracji schematu / bez auto-heal legacy.

## 2026-07-19 Ã¢â¬â UX PRELIMINARY count + zero-assignment message

- Tile: tooltip + aria Ã¢â¬Å¾zamÄÅwieÄ¹â oczekujÃâ¦cychÃ¢â¬Å¥ (bez zmiany nazwy statusu).
- Gate 8/8 Ã¢â â `operator_message` z bootstrap (nie zaleÄ¹Ä½ny od count po FAIL status); FE modal + empty state products.
- Bez gate na configured-statuses; bez claim; CART AVAILABLE.

## 2026-07-19 Ã¢â¬â FINAL AUDIT: WÄÅzki tile vs assignment (PRELIMINARY SSOT)

- Dashboard Ã¢â°Â  FULL assignment SSOT: count = eligibility + free `cart_id` only; scan still runs `gate_orders_before_capacity` Ã¢â â real scenario tile>0 / assign=0 (stock/location FAIL).
- Intentional: no heavy validation on every configured-statuses GET.
- Zero-after-gate cart: already `_heal_empty_assigned("gate_rejected_all")` Ã¢â â AVAILABLE (no claim). CASE 5 regression added.
- Docstrings corrected: PRELIMINARY SSOT, not Ã¢â¬Å¾SSOT z assignmentÃ¢â¬Å¥.

## 2026-07-19 Ã¢â¬â WÄÅzki:8 vs empty CART assignment (PICK_ASSIGN_TRACE)

- ROOT: (1) kafel `configured-statuses.order_count` = surowy COUNT po `order_ui_status_id` (A); assignment = eligibility (`picking_finished_at`, fulfillment PICKING/PARTIAL/blank, consolidationÃ¢â¬Â¦) + `cart_id IS NULL` + WMS validation gate (B) Ã¢â â semantic drift; shortage/MISSING + `picking_finished_at` po finalize nadal w A. (2) `bootstrap_start_picking_if_needed` przy 0 candidates woÄ¹âaÄ¹â `claim_cart` Ã¢â â CART ASSIGNED/PRZYPISANY z orders=0.
- FIX: `count_assignable_orders_for_picking_statuses` w kafelku; eligibility traktuje blank fulfillment jak open + `deleted_at`; brak claim przy 0 Ã¢â¬â `release_cart` gdy ASSIGNED; log `PICK_ASSIGN_TRACE` per order z REJECTION_REASON.
- Tests: `test_wms_picking_assign_cart_empty_ssot.py` CASE 1Ã¢â¬â4.

## 2026-07-19 Ã¢â¬â GET /order-issue-tasks 500 + stale Ã¢â¬Å¾Do zebraniaÃ¢â¬Å¥

- ROOT list 500: (1) `ensure_order_issue_task_items_table` used SQLite-only DDL on PG allowlist path; (2) sync failure left session dirty Ã¢â â `db.commit()` Ã¢â â PendingRollback/500; (3) repair without savepoint poisoned PG txn; (4) `ensure_picking_shortage_support` SQLite-gated so `disable_auto_detach` ALTER skipped on Railway.
- Fix: ORM dialect-aware CREATE; rollback after sync fail; `begin_nested` around repair; PG-safe `ensure_wms_picking_shortage_settings_columns` on allowlist; clamp `ge=0` DTO fields; eager-load fallback.
- Semantics: shortage YES Ã¢â â 1 active OrderIssueTask per order (upsert idempotent) on report + finalize.
- Stale Ã¢â¬Å¾Do zebrania: 2Ã¢â¬Å¥: cart scan painted status-level `hubPickStats`; now refetch product-lines for scanned cart_id before navigate; products page does not show hub stats while loading.
- Tests: `test_order_issue_tasks_after_shortage_finalize.py`.

## 2026-07-19 Ã¢â¬â Finalize shortage detach: setting + heal READY_FOR_PACKING


- ROOT: checkbox `disableAutoDetachMissingOrdersFromCarts` was **localStorage-only** (backend never read it). Stuck carts in `READY_FOR_PACKING` early-returned without detach.
- Fix: DB field `disable_auto_detach_missing_orders_from_carts` on `wms_picking_shortage_settings`; helper `is_shortage_auto_detach_enabled` (= not disable); finalize reads it.
- Detach via `detach_order_from_cart(..., allow_shortage_finalize=True)`; heal path for READY_FOR_PACKING shortage; `release_cart` clears leftover order.cart_id.
- Trace logs: `FINALIZE_TRACE *`. Tests: real DB + fresh session + boolean ON/OFF.

## 2026-07-19 Ã¢â¬â Finalize shortage cart detach + activity log UX

- ROOT finalize: `finish_picking` always Ã¢â â READY_FOR_PACKING with ALL orders still on cart (`clear_cart=False`). Shortage never detached.
- Fix: `finish_picking_after_wms_finalize` Ã¢â¬â detach shortage via CartLifecycle; all-shortage Ã¢â â release; mixed Ã¢â â packing-bound stay.
- Logs: OrderActivityLog.operator_user_id; LOGI CZYNNOÄ¹Å¡CI + ActivityLogTable columns CZAS|UÄ¹Â»YTKOWNIK|ZDARZENIE|KOMUNIKAT; NEWEST first; shortage single ActivityEvent (order+cart links, no duplicate).
- Tests: `test_wms_picking_finalize_shortage_cart_detach.py`.
- Audit: [Audit finalize shortage cart](54d3471c-7c00-4a93-b94a-2f97ad3eba17) confirmed keep-cart + `finish_picking` clobber.

# Change log

## 2026-07-19 Ã¢â¬â Railway boot: wms_order_validation imports

- Broken: `from ..auth_deps` / `from ..warehouse_context` (modules do not exist).
- Fixed: `from ..auth.deps import get_optional_current_user`, `from ..auth.warehouse_deps import require_operable_warehouse`.
- Gate: `python -c "import backend.main"` Ã¢â â BACKEND IMPORT OK (exit 0). Commit `f3668ad`.

# Change log

## 2026-07-19 Ã¢â¬â Prod bugs: shortage list race + banner + finalize FK

- **P1 shortage 2Äâentry:** FE `createRequestDeduper` joined pre-mutation `GET product-lines` after POST Ã¢â â stale ACTIVE. Fix: `force` bypass; list refresh after shortage forces new GET; POST shortage returns `product_line` snapshot (same builder).
- **P2:** Removed top Ã¢â¬Å¾ZamÄÅwienia niekompletneÃ¢â¬Å¥ banner (+ `cohortMissingByOrder`); row SHORTAGE UI kept.
- **P3 finalize FK:** orphan `orders.shipping_method_id` breaks UPDATE; sanitize before apply; safe operator message + `request_id`; audit script `audit_orphan_shipping_method_fk`; import assert FK assignable.
- **P4:** Finalize still classifies per-order (`all_picked`Ã¢â âPACKING, `all_missing`Ã¢â âMISSING, else NEEDS_DECISION) Ã¢â¬â not bulk PACKING; safe errors + rollback on failure.
- Tests: BE shortage product-lines / finalize orphan+classify; FE dedupe force + error UX.

## 2026-07-19 Ã¢â¬â SHORTAGE hardening verification (final)

- Flush SSOT: **flush-before-aggregate** in `sum_line_events` / `sum_missing` / `sum_pick` (nie globalny flush w `append_event`).
- Concurrent PG: `FOR UPDATE` na candidate `OrderItem`; test `ConcurrentShortagePostgresTests` (SHORTAGE_PG_URL).
- Legacy: audit raw vs effective; runtime clamp; bez MagicMock w produkcji.
- Logi: order + cart dual-write z `#order` / EAN / 1/1 / operator / CART.
- Related regression: 131 BE + 22 FE. Production deploy/repro: NOT VERIFIED.

## 2026-07-19 Ã¢â¬â SHORTAGE hardening (flush SSOT + concurrent + legacy clamp)

- SSOT: `append_event` flush + `sum_line_events`/`sum_missing`/`sum_pick` flush; safe scalar coerce (no `float(MagicMock)`Ã¢â â1).
- Concurrent: `SELECT Ã¢â¬Â¦ FOR UPDATE` on candidate OrderItems before declarable/write.
- Legacy: display/report clamp `missing Ã¢â°Â¤ requiredÃ¢Ââpicked`; read-only `audit_fe_missing_duplicates`.
- Atomicity: report-shortage endpoint rolls back on any unexpected Exception before commit.
- Tests: `test_wms_picking_shortage_hardening.py`.

## 2026-07-18 Ã¢â¬â ZGÄ¹ÂOÄ¹Å¡ BRAK: first-submit wipe + idempotency + red UI

- ROOT: `SessionLocal(autoflush=False)` Ã¢â â `sync_declared` / `recompute` SUM(MISSING) nie widziaÄ¹ây pending `FE_MISSING` Ã¢â â zerowaÄ¹ây `wms_picking_line_missing_qty` mimo Activity eventu; drugie klikniÃâ¢cie Ã¢â¬Å¾naprawiaÄ¹âoÃ¢â¬Å¥ UI i dublowaÄ¹âo log.
- Fix: `db.flush()` po append + w sync/recompute; idempotent `already_resolved` NO-OP; order-aware Activity + `operator_user_id`; SHORTAGE Ã¢â°Â  zebrane (`braki`); czerwony wiersz; badge zamÄÅwieÄ¹â niekompletnych; defensive revalidate nie odÄ¹âÃâ¦cza przy shortage.
- Tests: `test_wms_picking_shortage_first_submit.py` + FE `wmsPickingUiGates`.

## 2026-07-18 Ã¢â¬â CartLifecycle invariant: panel status + clear_cart

- `office_order_ui` patch status Ã¢â â `apply_order_panel_ui_status` Ã¢â â `detach_order_from_cart` (no raw clear).
- `cart_service.clear_cart` Ã¢â â `admin_release_cart`; `clear_basket` Ã¢â â `detach_order_from_cart`.
- `apply_fulfillment_state(clear_cart=True)` raises Ã¢â¬â cart clear only via lifecycle.
- Tests: `test_office_order_ui_cart_detach.py`.

## 2026-07-18 Ã¢â¬â WMS Validation hardening (detach SSOT + tests)

- `detach_order_from_cart(..., operator_user_id=None)` = System actor; gate no longer uses `clear_order_picking_session_context` bypass.
- Technical `ERROR`/`ORDER_NOT_FOUND` separated from product issues (no fake WMS_VALIDATION_FAILED).
- Integration: race G, active session H, multi-tenant J, activity L, perf (1 routing / batch).
- DEV audit test.db: 0 active cart orders would_fail.

## 2026-07-18 Ã¢â¬â WMS Order Validation SSOT (pre-Capacity)

- Package `backend/services/wms_order_validation/` Ã¢â¬â routing shortfalls Ã¢â â PASS/FAIL + issues/reason_label.
- Settings: `wms_validation_failed_order_ui_status_id` (NULL = gate without status mutate).
- Gates: bootstrap + start_picking before Capacity; defensive revalidate on cart (no picks Ã¢â â detach).
- Activity: one `WMS_VALIDATION_FAILED` / `PASSED` event; no PASS spam on auto gate.
- Revalidate: previous UI status in order metadata; order detail panel + API.
- Legacy: `audit_active_cart_orders_validation_failures` read-only.
- Tests: `test_wms_order_validation.py` (10).

## 2026-07-18 Ã¢â¬â shortage multi-order / remaining-first audit

- Audyt: FE wysyÄ¹âaÄ¹âo `order_item_id` FIFO Ã¢â â shortage tylko na 1 linii; alokacja budgetem zjadaÄ¹âa `declarable` (konwersja pickÄÅw) przed remaining.
- Fix: product-level shortage bez `order_item_id` (tylko recovery); Orders `order_by(id)`; pass1=remaining, pass2=pickÃ¢â âshortage; PARTIAL gdy rem>0 i (picked|miss)>0.
- Tests: `test_wms_picking_shortage_multi_order.py`.

## 2026-07-18 Ã¢â¬â shortage resolved Ã¢â°Â  DO POBRANIA / Ã¢â°Â  ZEBRANO

- ROOT: lista FE liczyÄ¹âa `remaining = total Ã¢Ââ picked` (ignorujÃâ¦c `missing`); `completed` renderowane zawsze jako zielone ZEBRANO; powrÄÅt z detail bez refresh Ã¢â â stale Ã¢â¬Å¾DO POBRANIAÃ¢â¬Å¥ + Ã¢â¬Å¾BRAK LOKALIZACJIÃ¢â¬Å¥.
- SSOT: `resolution_status` ACTIVE|PARTIAL|COMPLETED_PICK|SHORTAGE na product-lines/detail; remaining = req Ã¢Ââ picked Ã¢Ââ miss (juÄ¹Ä½ w builderze).
- FE: SHORTAGE Ã¢â â Ã¢â¬Å¾ZGÄ¹ÂOSZONO BRAKÃ¢â¬Å¥; sort ACTIVEÃ¢â âPARTIALÃ¢â âCOMPLETED_PICKÃ¢â âSHORTAGE; detail bez CTA skanu przy peÄ¹ânym shortage; refresh listy po powrocie.
- Finalize: bez zmian Ã¢â¬â nadal `all_picked` vs `all_missing`/`some_missing`.
- Tests: `test_wms_picking_shortage_resolution_status.py`, `wmsPickingUiGates.test.ts`.

## 2026-07-18 Ã¢â¬â empty location DOCUMENTS_ONLY + location-aware undo audit

- DOCUMENTS_ONLY: always accept empty-location report; pending CONTROL inventory + `InventoryLocationLock` (block_picking) Ã¢â¬â no illegal stock write; routing excludes location.
- HYBRID: unchanged RK zeroing.
- Undo/empty-location: Pick.location_id filter confirmed; regression A/B multi-loc undo.

## 2026-07-18 Ã¢â¬â picking corrections: undo pick + empty location + shortage after completed

- Audit: draft Pick does not touch Inventory; stock only at finalize.
- `POST /wms/picking/undo-pick` Ã¢â¬â LIFO delete/reduce draft picks + audit `PICK_UNDONE`.
- Shortage after 1/1: `declarable = ordered Ã¢Ââ missing`; undoes picks as needed before `FE_MISSING`.
- `POST /wms/picking/confirm-empty-location` Ã¢â¬â RK via `apply_manual_stock_correction`, concurrency `observed_stock_qty`, LOCATION vs PRODUCT shortage.
- Detail UI: corrective CTAs when completed; problem modal (empty / qty mismatch / product shortage).

## 2026-07-18 Ã¢â¬â picking session keeps completed products on list

- ROOT: backend `build_wms_picking_product_lines` filtered via `_picking_product_line_still_active` (remainingÃ¢â°Â0 dropped).
- SSOT: with `cart_id` return full demand snapshot + `completed`; hub without cart still filters active-only.
- FE: partial multi-qty label; completed shows Ã¢Åâ ZEBRANO + Ã¢â¬Å¾Pobrano z Ã¢â¬Â¦Ã¢â¬Å¥; sort unfinishedÃ¢â âcompleted (already in `sortWmsPickingProductLinesPickFlow`).
- Tests: `test_wms_picking_session_keeps_completed_products.py` (SCANÃ¢â âstill 5Ã¢â âcompleted last).

## 2026-07-18 Ã¢â¬â product-lines/detail TypeError `_safe_touch_picking_session`

- Production: `TypeError: takes 0 positional arguments but 1 was given` at detail ~L915.
- Helper is `def _safe_touch_picking_session(**kwargs)`; 4 call-sites passed positional `db`.
- Fixed all to `db=db` (product-lines recovery, detail, quick-pick, shortage).
- E2E regression: `test_wms_picking_detail_safe_touch_session.py` (router + authenticated user).

## 2026-07-18 Ã¢â¬â bundle_component_index: canonical normalize (detail 500 fix)

- Root cause: `or 0` in tree builder Ã¢â â `WmsPickingBundleComponentStatus(ge=1)` ValidationError at detail L1867.
- Semantics: index is projected (not DB column); NULL = unassigned; valid = unique Ã¢â°Ä1 among siblings.
- Canonical: `backend/services/bundles/bundle_component_index.py` + reindex in UX index / trees / scan.
- Skip non-components (`is_bundle_component=False`); never map all NULLÃ¢â â1; safe sort; per-bundle try/except.
- `DEBUG_HTTP_500` body opt-in only (no APP_ENV auto-leak). Logs keep full traceback + request_id.
- Tests: `test_bundle_component_index_normalize.py`, detail endpoint 200 with NULL/0 meta.

## 2026-07-18 Ã¢â¬â HTTP 500 diagnostics + product-lines/detail root cause

- Canonical `wms.exceptions` log always includes `exception_type`, message, traceback, `file`/`function`/`line` under `request_id`.
- Added `ResponseValidationError` handler; HTTP 5xx keeps `__cause__` (`from e`); `exception_origin` prefers `backend/` frames.
- Local PG repro: detail 500 = `ValidationError` at `wms_picking_product_list_service.py` `build_wms_picking_product_detail` **L1867** (`bundle_component_index=0`).
- Reports: `memory/wms-http-500-diagnostics-audit.md`. No business fix yet.

## 2026-07-18 Ã¢â¬â Cart details UX (ERP layout)

- Layout: Podsumowanie KPI Ã¢â â tabela zamÄÅwieÄ¹â Ã¢â â Historia doboru (collapsed) Ã¢â â Historia czynnoÄ¹âºci (table).
- Shared `ActivityLogTable` (Data | Operator | Akcja); `ActivityLogPanel` wraps it.
- Report: `memory/cart-details-ux-redesign.md`.

## 2026-07-18 Ã¢â¬â Activity Log final UX (no dupes, complete detach history)

- Capacity Analytics: collapsed by default; shows last-run date + analyzed/assigned/stop reason (historical).
- Activity: action without embedded #; numbers only when `show_order_numbers`; no metadata expand.
- Timeout / idle / cancel / admin release: explicit Ã¢â¬Å¾OdÄ¹âÃâ¦czono wszystkie zamÄÅwienia.Ã¢â¬Å¥ + # list.
- Report: `memory/activity-log-final-ux-report.md`.

## 2026-07-18 Ã¢â¬â Activity Log UX simplify + Capacity summary only

- ActivityLogPanel: only When / Who / What (+ optional #orders line); no expand/details.
- Assign/detach activity text: short sentences; numbers in metadata line.
- Capacity Analytics UI: last-run summary only (analyzed/assigned/stop reason); removed reject lists, 24h stats, order Capacity history panel.
- Report: `memory/activity-log-ux-simplify-report.md`.

## 2026-07-18 Ã¢â¬â Activity Log Framework (unified panel standard)

- Audit: `memory/activity-log-audit.md`.
- Backend ready fields: `occurred_at_display`, `operator_display`, `action`, `details`, `order_numbers`.
- FE `ActivityLogPanel`: DATA Ã¢â â OPERATOR Ã¢â â AKCJA + expand (no client translation).
- Dual-write WMS order activity Ã¢â â `activity_events`; cart assign/detach full sentences with `#orders`.
- Capacity Analytics untouched. Report: `memory/activity-log-framework-report.md`.

## 2026-07-18 Ã¢â¬â SSOT Panel Ã¢â â WMS picking (capacity truncate regression)

- Root cause: WMS product-lines/count used status cohort while Panel used `list_orders_on_cart`.
- Added `resolve_wms_picking_order_ids` Ã¢â¬â with `cart_id` always SSOT; hub without cart stays cohort.
- Wired: product lines, detail, quick pick, shortage, finalize, bundle scan.
- Tests: `test_wms_picking_cart_ssot.py`; audit+report in `memory/ssot-panel-wms-orders-*.md`.

## 2026-07-18 Ã¢â¬â Capacity Analytics (diag layer)

- Activity Log: tylko wynik operacji (bez basket_assigned / skipÄÅw); meta numerÄÅw capped.
- Nowy magazyn: `capacity_analytics_runs` + reason aggs + details (lazy).
- API `/capacity-analytics/*`; admin sekcja Ã¢â¬Å¾Analiza CapacityÃ¢â¬Å¥; historia Capacity na zamÄÅwieniu.
- Report: `memory/capacity-analytics.md`.

## 2026-07-18 Ã¢â¬â Carts: detach one order + tooltips + Activity Log UX

- Lifecycle: `detach_order_from_cart` + `POST /carts/{id}/orders/{order_id}/detach` (blocked after picks / READY|PACKING).
- Assigned orders DTO: customer, products/EAN/SKU, weight, `can_detach`.
- FE tooltips on number + Pozycje; Activity Log expandable with inline order list.
- Report: `memory/carts-detach-tooltips-activity.md`.

## 2026-07-18 Ã¢â¬â Carts consistency audit (close-out)

- Full SSOT audit: all live order counts via `list_orders_on_cart` (volume refresh, clear_cart/basket, finish_packing remaining, pick progress).
- Activity descriptions include `#order_numbers` (no bare Ã¢â¬Å¾Przypisano N zamÄÅwieÄ¹âÃ¢â¬Å¥).
- UI: Activity Log `refreshKey` + soft poll after admin release / timeout.
- Scenarios AÃ¢â¬âE: `backend/tests/test_cart_orders_consistency_scenarios.py` (PASSED).
- Report: `memory/carts-consistency-audit.md`.

## 2026-07-18 Ã¢â¬â Carts: assigned orders SSOT + admin UI

- SSOT: `list_orders_on_cart` for admin, WMS stats, Capacity Engine (BULK), lifecycle, WMS entry count.
- Admin expand: `AssignedOrdersSection` (number/status/items/volume/open + stub detach).
- Activity Log: `order_numbers` on assign/detach/timeout/admin release/start-finish-cancel picking.
- Capacity UI: single strip (collapsed card only).
- Report: `memory/cart-orders-ssot-report.md`.

## 2026-07-18 Ã¢â¬â Database Schema Health Check

- Tool: `python -m backend.scripts.schema_health_check` (+ `memory/schema-health-check.md`).
- PG allowlist: `ensure_wms_audit_tables`, packing automation, order WMS timeline, picks, carts code, esp scan.
- `ensure_wms_audit_tables` dialect-safe for PostgreSQL; capacity legacy DROP hardened.
- Local SQLite heal: carts capacity/lifecycle columns + `activity_event_links`; KRYTYCZNE focus Ã¢â â 0.

## 2026-07-18 Ã¢â¬â Event Log: retire legacy `event_type`

- Root cause 500 admin-release: PG `cart_lifecycle_events.event_type NOT NULL` while ORM/writers use only `event_code`.
- `ensure_cart_lifecycle_events_table`: backfill `event_code` Ã¢â Â `event_type`, then `DROP COLUMN event_type` (+ commit so DDL sticks).
- Idempotent: live column check (`PRAGMA` / `information_schema`), 2nd/3rd run = no-op.
- Audit: 0 consumer/runtime refs to `event_type` for cart Event Log; SSOT = `event_code`.
- Regression: `backend/tests/test_cart_lifecycle_event_type_migration.py` (incl. 3Äâ ensure).

## 2026-07-18 Ã¢â¬â WMS stabilization health check (critical fixes)

- Fix: duplicate ORM index `ix_activity_events_category` crashed `create_all` on boot.
- Fix: activity log indexes always `CREATE INDEX IF NOT EXISTS` (even if table pre-existed).
- Fix: PostgreSQL allowlist runs cart lifecycle / capacity / cartstatus ensures (was SQLite-only no-op).

## 2026-07-18 Ã¢â¬â Admin force-release cart (OMS)

- `admin_release_cart` w CartLifecycleService (ASSIGNED/PICKING; blokada READY/PACKING).
- API `POST /carts/{id}/admin-release/` + perm `warehouse.carts.admin_release`.
- FE: `AdminReleaseCartButton` + modal potwierdzenia w `CartFleetDetailPanel`.
- Eventy: `admin_cart_released` / `admin_orders_detached` / `admin_picking_cancelled`.

## 2026-07-18 Ã¢â¬â Panel Activity Log (OMS)

- SSOT: `activity_events` + `activity_event_links` (jedno zdarzenie Ã¢â â wiele obiektÄÅw).
- API `GET /activity-log`; writer `record_activity` + bridge z CartLifecycle.
- FE: `ActivityLogPanel` (oÄ¹âº czasu, zwijany) na zamÄÅwieniach, wÄÅzkach, regaÄ¹âach.
- SzczegÄÅÄ¹ây: `memory/activity-log-architecture.md`.

## 2026-07-18 Ã¢â¬â WMS user messages + Event Log PL

- Katalog `WmsUserMessage` (code/severity/title/message/details/suggested_action) Ã¢â¬â PL, bez HTTP/exception w UI.
- Picking claim/start/cancel Ã¢â â komunikaty biznesowe; FE `WmsMessageModal` + Provider.
- Event Log: bogatsze opisy PL + `orders_assigned` / `basket_assigned` przy starcie zbierania.

## 2026-07-18 Ã¢â¬â Capacity Engine (target architecture)

- Nowy SSOT: `backend/services/cart_capacity/` (strategie LIMIT_ORDERS / LIMIT_VOLUME / HYBRID_* / BASKETS).
- Lifecycle `Cart.status` nietkniÃâ¢ty; occupancy (`OccupancyState`) tylko wyliczane.
- Model: `capacity_strategy` / `capacity_orders` / `capacity_volume`; drop `capacity_mode` / `max_orders`.
- UsuniÃâ¢to `cart_capacity_service.py`; `_apply_capacity_slice` Ã¢â â engine; optimizer/basket best-fit Ã¢â â engine.
- FE: StatusPill = lifecycle; CartCapacitySection = pojemnoÄ¹âºÃâ¡; edytory strategii.

## 2026-07-18 Ã¢â¬â Capacity Engine architecture (design)

- Status wÄÅzka = wyÄ¹âÃâ¦cznie lifecycle; zapeÄ¹ânienie = osobna logika strategii.
- Docelowo jeden Capacity Engine: LIMIT_ORDERS / LIMIT_VOLUME / HYBRID (+ BASKETS dla MULTI).
- SzczegÄÅÄ¹ây: `memory/capacity-engine-architecture.md`.

## 2026-07-18 Ã¢â¬â Frontend cart capacity UI

- Fleet list/card/detail/editors: `capacity_strategy` + `CapacitySnapshot`; `StatusPill` (lifecycle) + `CartCapacitySection` (occupancy).
- Removed `CapacityModeFields.tsx`; `capacityStrategyLabel` in `labels.ts`.

## 2026-07-18 Ã¢â¬â CartStatus variant B (clean enum rebuild)

- Docelowy enum: AVAILABLE | ASSIGNED | PICKING | READY_FOR_PACKING | PACKING.
- PG: `migrate_cartstatus_enum_clean` Ã¢â¬â nowy typ Ã¢â â remap Ã¢â â swap kolumny Ã¢â â drop starego Ã¢â â rename (bez ADD VALUE).
- ORM: `CartStatus` tylko 5 czÄ¹âonkÄÅw; legacy tylko w `CARTSTATUS_LEGACY_TO_CANONICAL` / `normalize_cart_status_value`.
- FE: `types/cartStatus.ts`, StatusPill, fleet summary, locale keys bez FULL/PEÄ¹ÂNY.
- UsuniÃâ¢to TEMP `START_PICKING STEP` diagnostykÃâ¢ (po ustaleniu root cause enum).

## 2026-07-18 Ã¢â¬â Fix cartstatus PG enum (PICKING missing)

- Root cause: `InvalidTextRepresentation: invalid input value for enum cartstatus: "PICKING"`.
- Kod uÄ¹Ä½ywa lifecycle: AVAILABLE/ASSIGNED/PICKING/READY_FOR_PACKING/PACKING; stary enum miaÄ¹â PL lub IN_PROGRESS.
- **Superseded by variant B** (clean rebuild instead of ADD VALUE).

## 2026-07-17 Ã¢â¬â Fix Cart FOR UPDATE + joinedload (PostgreSQL)

- Przyczyna 500 picking/start: `FeatureNotSupported: FOR UPDATE cannot be applied to the nullable side of an outer join`.
- `_lock_cart` / `cancel_picking` / timeout workers: najpierw `SELECT carts FOR UPDATE`, potem `selectinload(Cart.baskets)` Ã¢â¬â bez OUTER JOIN na tym samym statement.

## 2026-07-17 Ã¢â¬â Fix silent HTTP 500 (log in exception handler)

- Root cause: handler zwracaÄ¹â `request_id`, ale tylko `attach_http_500_exception`; middleware (`BaseHTTPMiddleware`) nie widzi `request.state` Ã¢â â brak tracebacku w Deploy Logs.
- Fix: `record_error` / `global_exception_handler` woÄ¹âa `log_request_server_error` **przed** JSON 500; `exc_info=exc` (nie `format_exc()`).

## 2026-07-17 Ã¢â¬â Log flood control + HTTP 500 middleware

- `schema.reconcile`: jeden summary `FK cycles detected: N` + fallback (bez per-`fk_cycle_break`).
- Per-column/index/FK sync Ã¢â â DEBUG; jeden INFO summary reconcile.
- `postgres_sequence_sync`: fix odczytu `is_called` + fallback `pg_sequences.last_value`; tylko summary (+ max 5 error samples).
- Middleware `outer_request_logger`: kaÄ¹Ä½dy HTTP 500 Ã¢â â ERROR z request_id/method/path/user/tenant/warehouse/file/line/traceback/duration (handler tylko attach exc).

## 2026-07-17 Ã¢â¬â Startup fixes + global 500 traceback

- `postgres_sequence_sync`: `is_called` z relacji sekwencji (nie z `pg_sequences`).
- `z_pz_schema._migrate_z_pz_series_padding`: SQL uÄ¹Ä½ywa kolumny `"type"` (ORM `series_type`); guard gdy brak kolumny.
- Exception logging: `format_exception_traceback(exc)` zamiast `traceback.format_exc()` w handlerze (usuwa faÄ¹âszywe `NoneType: None`); log z request_id / method / path / file / line; HTTP 5xx z `HTTPException` teÄ¹Ä½ logowane.

## 2026-07-17 Ã¢â¬â Fix postgres_sequence_sync `is_called`

- BÄ¹âÃâ¦d: `SELECT last_value, is_called FROM pg_catalog.pg_sequences` Ã¢â¬â `pg_sequences` (PG 10+) **nigdy** nie miaÄ¹âo `is_called`.
- `is_called` jest potrzebne do `next_sequence_value` / `setval` semantics Ã¢â¬â odczyt z relacji sekwencji: `SELECT last_value, is_called FROM "schema"."seq"`.
- Logika sync bez zmian; testy sequence sync: 9 passed.

## 2026-07-17 Ã¢â¬â Event Log: event_code + severity

- `event_code` (system) oddzielony od `description` (PL UI); logika tylko po kodzie.
- `severity`: INFO / SUCCESS / WARNING / ERROR / AUDIT (katalog).
- Analiza uogÄÅlnienia `audit_events`: odÄ¹âoÄ¹Ä½ona Ã¢â¬â `memory/audit-events-generalization-analysis.md`.

## 2026-07-17 Ã¢â¬â Event Log (PL) + Active Picking

- Tabela `cart_lifecycle_events` Ã¢â¬â dziennik biznesowy po polsku; writer tylko CartLifecycleService.
- API: `GET /wms/carts/{id}/events`; Active Picking: `/active-picking` (+ alias current-task).
- Eventy: rezerwacja, start/koniec kompletacji, pierwszy produkt, pakowanie, zwolnienie, timeout, auto-release, podwÄÅjny claimÃ¢â¬Â¦
- `notify_first_product_confirmed` z quick-pick; test peÄ¹ânego cyklu PL.

## 2026-07-17 Ã¢â¬â Architecture Health Check (CartLifecycleService)

- FOR UPDATE na wszystkich mutacjach; heal bez wewnÃâ¢trznego commit.
- Atomic AVAILABLEÃ¢â âPICKING (1 historia); idempotencja cancel/finish/release/start.
- `assert_cart_lifecycle_invariants` + `_after_mutation`.
- `ARCHITECTURE.md` + docstring ownership; raport: `memory/cart-lifecycle-architecture-health-check.md`.
- Testy: 16 passed (historia, idempotencja).

## 2026-07-17 Ã¢â¬â Cart lifecycle: claim opcjonalny, timeout, heartbeat, auto-release

- Claim opcjonalny: AVAILABLEÃ¢â âstart = atomowy claim+start; ASSIGNED bez orders/session.
- `CartAlreadyClaimed` (409); `claimed_at`; timeout ASSIGNED (`CART_ASSIGNED_TIMEOUT_MINUTES`).
- Auto-release PICKING przy 0 Pick (`CART_PICKING_IDLE_NO_PICKS_MINUTES`); Ã¢â°Ä1 pick Ã¢â â zabronione.
- Worker: `backend/workers/cart_lifecycle_worker.py` (startup + maintenance).
- Heartbeat: `POST /wms/picking/heartbeat` Ã¢â â tylko `last_activity_at` (+ refresh current_task).
- Current Task: `picked_count` / `remaining_count`; capacity tylko w `startPicking`.
- Legacy assign (`_assign_bulk`/`_assign_multi`/`mark_cart_*`) Ã¢â â raise; writerzy lifecycle tylko w CartLifecycleService.
- Testy: atomic start, claim conflict, timeout, auto-release, current_task fields.

## 2026-07-17 Ã¢â¬â Cart Current Task + Lifecycle History

- `carts.current_task_json` + `apply_cart_transition` w CartLifecycleService.
- Tabela `cart_lifecycle_history` (from/to status, operator, reason, task_id).
- API: stats z `current_task`, `GET .../current-task`, `GET .../lifecycle-history`.
- Zapisy historii wyÄ¹âÃâ¦cznie przez lifecycle.

## 2026-07-17 Ã¢â¬â Cart lifecycle SSOT (nowy model biznesowy)

- ZamÄÅwienia **nie** sÃâ¦ przypisywane przed skanem wÄÅzka.
- `ASSIGNED` = wybÄÅr wÄÅzka (bez orders/session); `start_picking` (skan) = sesja + cart_id + capacity + PICKING.
- SSOT: `cart_picking_lifecycle_service.py`; API: `POST /picking/claim-cart`, `/picking/start`, `/packing/start-cart`.
- `touch` nigdy nie tworzy sesji (409 SessionNotFound).
- Assignment / simulation / optimizer: bez zapisu lifecycle.
- READY_FOR_PACKING: cart_id + assigned_user zostajÃâ¦; PACKING przy skanie pakowacza (`packing_user`).
- Testy: `test_cart_picking_lifecycle_ssot.py`.

## 2026-07-17 Ã¢â¬â Fix: cart AVAILABLE mimo aktywnej picking_session

- Root cause: sesja tworzona (`touch` / ensure), wÄÅzek bez `current_session_id` / statusÃ¢â°Â PICKING.
- `bind_cart_to_picking_session`: status=PICKING, current_session_id, assigned_user_id, started_at.
- `assert_cart_ready_for_quick_pick` + quick-pick bootstrap: self-heal AVAILABLE+sesja Ã¢â â PICKING.
- Startup: `heal_carts_with_orphaned_picking_sessions`.
- Stats: zamÄÅwienia teÄ¹Ä½ po `picking_session_id` aktywnej sesji (gdy current_session_id NULL).

## 2026-07-17 Ã¢â¬â Capacity ORDERS: enforce na wszystkich assign paths

- SSOT: `enforce_cart_orders_capacity(db, cart, new_orders=N)` Ã¢â â 409 `{code, current_orders, max_orders, attempted}`.
- WpiÃâ¢te: simulation, picking assignment, ensure_order_basket, ensure_picking_session,
  quick-pick (`record_wms_quick_pick`), optimizer `_apply_fleet`.
- Bez polegania na FE.

## 2026-07-17 Ã¢â¬â quick-pick 409: log + message/debug

- Przed kaÄ¹Ä½dym 409: `logger.warning("quick_pick rejected", extra={code, cart_*, session_*, order_count, Ã¢â¬Â¦})`.
- Body: `{ code, message, debug: { cart_id, cart_status, session_id, current_session_id } }`.
- FE: `formatFastApiErrorDetail` / `extractApiErrorMessage` czytajÃâ¦ `message`; toast bez Ã¢â¬Å¾Request failed with status code 409Ã¢â¬Å¥.

## 2026-07-17 Ã¢â¬â Cart stats SSOT: GET /wms/carts/{id}/stats

- Jedno Ä¹ÅrÄÅdÄ¹âo prawdy: `orders.cart_id` + `orders.picking_session_id` (`cart_stats_service`).
- Endpoint: `GET /wms/carts/{id}/stats` Ã¢â â orders/products/sections/occupied/volume/percent.
- Lista/detail cartÄÅw uÄ¹Ä½ywa tego samego agregatu (bez picks / ORM-only fallback).
- FE: CartCard, CartFleetDetailPanel, CartDetails, BulkCartEditor Ã¢â â `fetchWmsCartStats`.
- Test: `backend/tests/test_cart_stats_ssot.py`.

## 2026-07-17 Ã¢â¬â Cart capacity ORDERS: 409 CART_CAPACITY_EXCEEDED

- SSOT: `cart_capacity_service.assert_cart_orders_capacity` Ã¢â¬â przy `capacity_mode=orders`:
  `current_orders + incoming_orders <= max_orders`.
- Przekroczenie Ã¢â â HTTP 409 `{ code, current_orders, max_orders, attempted_orders }`.
- WpiÃâ¢te: `simulation_service.assign_orders_to_cart`, `PickingAssignmentService`, WMS basket attach.
- FE CartCard: toast Ã¢â¬Å¾WÄÅzek moÄ¹Ä½e pomieÄ¹âºciÃâ¡ maksymalnie X zamÄÅwieÄ¹â.Ã¢â¬Å¥
- Test: `backend/tests/test_cart_orders_capacity.py`.

## 2026-07-17 Ã¢â¬â quick-pick: 409 zamiast 503 + logi SSOT

- Przyczyna 503: `SQLAlchemyError` przy zapisie `cart.status=PICKING` do starego PG ENUM (PL) / brak `current_session_id`.
- Fix: statusÃ¢â âVARCHAR w `ensure_carts_picking_lifecycle_columns`; walidacja SSOT Ã¢â â 409 `SessionNotFound` / `InvalidCartState`.
- `POST /wms/picking/quick-pick`: `logger.exception` z tenant/warehouse/source_status/barcode/session/cart/user_id; brak nieobsÄ¹âuÄ¹Ä½onych wyjÃâ¦tkÄÅw.

## 2026-07-17 Ã¢â¬â Cart/picking SSOT lifecycle

- Backend SSOT: `cart_picking_lifecycle_service` Ã¢â¬â AVAILABLEÃ¢â âASSIGNEDÃ¢â âPICKINGÃ¢â âREADY_FOR_PACKINGÃ¢â âPACKINGÃ¢â âAVAILABLE.
- Assign: `picking_session` + `order.cart_id` / `picking_session_id` + `PICKING_IN_PROGRESS`.
- Finalize: **nie** odÄ¹âÃâ¦cza wÄÅzka; `cart=READY_FOR_PACKING`, `order=PACKING`; zwolnienie po ostatnim pack.
- Cancel: `POST /wms/picking/cancel-session` Ã¢â¬â restore status + free cart.
- FE: liczniki z `session_stats` API; modal wyjÄ¹âºcia Kontynuuj / Anuluj zbieranie.
- Test: `backend/tests/test_cart_picking_lifecycle_ssot.py`.

## 2026-07-17 Ã¢â¬â Scanner Helper: pomocnik kodÄÅw magazynowych

- Przebudowa Emulatora skanera (FE only): usuniÃâ¢to przycisk ENTER; Enter/Skanuj = skan, WyczyÄ¹âºÃâ¡ zostaje.
- Kategorie z licznikami, wyszukiwanie nazwa/kod/EAN/SKU, ulubione Ã¢Â­Â, szybki dostÃâ¢p (ostatni wÄÅzek/koszyk/lokacja/produkt).
- Relacje wÄÅzek Ã¢â â koszyki (drzewo, kopiuj kod, ponowny skan) na istniejÃâ¦cych `/carts/`, lokalizacjach, produktach, lookup zamÄÅwieÄ¹â.
- Mobile: poziomy scroll kategorii, wiÃâ¢ksze kafelki (`useIsHandheldDevice`).
- ModuÄ¹â: `frontend/src/components/wms/dev-scanner/*` + `useDevScannerCatalog`.

## 2026-07-17 Ã¢â¬â Warehouse policy v2: OperationContext + OMS/WMS split

- FE: `getOperationPolicy` / `OperationContext` w `warehouseOperationPolicy.ts`.
- BE: `warehouse_operation_policy.py` (lustrzana polityka + `assert_warehouse_if_required`).
- Ã¢â¬Å¾Wszystkie z filtraÃ¢â¬Å¥ Ã¢â°Â  wymÄÅg magazynu dla workflow (status, priorytet, notatki, Ã¢â¬Â¦).
- `order.delete_orders` = OMS (bez WH); delete lokalizacji/zbiorÄÅw/rezerwacji = WMS.
- Bulk status/patch/delete: WH opcjonalny; soft-skip statusÄÅw cross-warehouse.
- Raport: `memory/warehouse-operation-policy-report.md`.

## 2026-07-17 Ã¢â¬â Warehouse gate: workflow zamÄÅwieÄ¹â bez wymogu magazynu

- Problem: `requireFulfillmentWarehouseForBulk` blokowaÄ¹â zmianÃâ¢ statusu panelu (i inne ops OMS) bez filtra magazynu.
- Policy: `frontend/src/lib/warehouseOperationPolicy.ts` Ã¢â â `requiresWarehouse(operationType)`.
- OrderList: bramka per akcja; explicit IDs + workflow bez blokady; delete / filtered_all nadal potrzebujÃâ¦ WH.
- Backend: optional `warehouse_id` na bulk-status / bulk-patch (explicit) i PATCH ui-status.
- Audyt: `memory/warehouse-requirement-audit.md`.

## 2026-07-17 Ã¢â¬â WMS home: wiÃâ¢ksze karty, bez Ã¢â¬Å¾OtwÄÅrzÃ¢â¬Å¥, belka

- Karty desktop ~148px, wiÃâ¢ksze ikony/nazwy; caÄ¹âa karta klikalna Ã¢â¬â usuniÃâ¢to Ã¢â¬Å¾OtwÄÅrz Ã¢â âÃ¢â¬Å¥.
- KPI: duÄ¹Ä½e liczby w kolorze tonu, cieÄ¹â/border, nie jak inputy.
- Belka: biaÄ¹âa, wiÃâ¢ksze ikony, gap, aktywny = `#f5f8ff` + border primary; bez truncate nazw.
- Hint: Ã¢â¬Å¾Enter Ã¢â¬â wybierzÃ¢â¬Å¥; sekcje wyraÄ¹Åniejsze; grid `minmax(280px,1fr)`.
- Preview: `/dev/wms-home-preview`.

## 2026-07-17 Ã¢â¬â WMS home: dopracowanie UI (ewolucja)

- Belka: 56px, `#ffffff`, border `#e9edf5`; aktywny moduÄ¹â `#f5f8ff` + primary, bez szarych filli / GripVertical.
- KPI: karty liczbaÃ¢â âetykieta (h~76), desktop 5 kolumn, mobile scroll poziomy.
- Kafelki: min-h 120, max-w 280, hover `translateY(-2px)`; nazwy 2 linie (bez ellipsis).
- KrÄÅtsze `shortDescription`; kontener `max-w 1800`; grid `minmax(260px,1fr)`; sekcje ciaÄ¹âºniej.
- Kolektor: wiersz ~70px, wiÃâ¢ksze ikony/badge, wiÃâ¢kszy odstÃâ¢p sekcji.
- Preview: `/dev/wms-home-preview`.

## 2026-07-17 Ã¢â¬â WMS home: sekcje desktop + lista kolektor

- `/wms/menu`: `WmsHomePage` Ã¢â¬â `useIsHandheldDevice` Ã¢â â `WmsDesktopHome` | `WmsCollectorHome` (wspÄÅlne tiles/KPI/API).
- Desktop: KPI strip, wyszukiwarka + Ã¢â¬Å¾SkrÄÅty: 1-9 Ã¢â¬Ë Enter - otwÄÅrzÃ¢â¬Å¥, sekcje Operacje / Kontrola / PozostaÄ¹âe, kafelki ~320Äâ140.
- Kolektor: listy DO ZROBIENIA / POZOSTAÄ¹ÂE (~72px), bez duÄ¹Ä½ych kart.
- TÄ¹âo WMS shell + home: `#ffffff`, obramowania `#e9edf5` (bez szarych powierzchni).
- PodglÃâ¦d UI: `/dev/wms-home-preview` (mock KPI, desktop + kolektor obok siebie).

## 2026-07-17 Ã¢â¬â Fix login HTTP 500 (app_users protection columns)

- Przyczyna: ORM mapuje `is_system_user|is_owner|is_deletable|is_role_changeable`, a na PG kolumny mogÄ¹ây nie powstaÃâ¡ Ã¢â¬â `ensure_app_users_bootstrap_columns` dodawaÄ¹â je w tej samej transakcji co `CREATE TABLE app_user_warehouses (... AUTOINCREMENT)` (skÄ¹âadnia SQLite) Ã¢â â wyjÃâ¦tek + rollback ALTER Ã¢â â SELECT przy loginie = 500.
- Fix: `ensure_app_users_protection_columns` w osobnej transakcji; DDL junction dialect-aware; wywoÄ¹âanie w Tier 0 bootstrap + self-heal w `/auth/login`.
- Migracja ops: `025_app_users_protection_columns.sql` (brak Alembic w repo).
- Auth endpoints: `logger.exception` + detail z `error`/`code` zamiast cichego 500.
- Role w DB: `super_admin` (nie `SUPER_ADMIN`).

## 2026-07-16 Ã¢â¬â SUPER_ADMIN + sÄ¹âownik aplikacji (system_labels)

- `app_users`: `is_system_user`, `is_owner`, `is_deletable`, `is_role_changeable` (+ schema upgrade / migracja `024`).
- SUPER_ADMIN: nieusuwalny, bez zmiany roli, bez dezaktywacji; pierwszy ADMIN Ã¢â â `is_owner` (lock delete/role).
- Tabela `system_labels` + API `/api/system/labels/*`; seed katalogu (nav/system).
- Frontend: `getLabel(key, fallback)` + cache localStorage + Support mode; panel **System Ã¢â â SÄ¹âownik aplikacji** (tylko SUPER_ADMIN).
- `UI_STRINGS` przez Proxy Ã¢â â `getLabel` (centralne etykiety); dalsza migracja hardcoded stringÄÅw poza `UI_STRINGS` przyrostowo.

## 2026-07-16 Ã¢â¬â Modal Ã¢â¬Å¾Nowy tryb zbieraniaÃ¢â¬Å¥: layout + Select statusÄÅw

- Tryb zbierania | KolejnoÄ¹âºÃâ¡ zamÄÅwieÄ¹â w 2 kolumnach; w Ã¢â¬Å¾Po produktachÃ¢â¬Å¥ kolejnoÄ¹âºÃâ¡ widoczna, disabled z opisem.
- Sekcje A/B zawsze widoczne; nieobsÄ¹âugiwane opcje/pola disabled z powodem (bez ukrywania).
- KrÄÅtsze etykiety pojemnikÄÅw (WÄÅzek skan/bez, Pick & Pack, RegaÄ¹âÃ¢â¬Â¦); opisy pod opcjami.
- Statusy: `PickingStatusSelect` (szukaj, badge koloru, grupy, max-h 300px, sticky search); etykieta Ã¢â¬Å¾Status po zakoÄ¹âczeniu zbieraniaÃ¢â¬Å¥.
- Tylko UI Ã¢â¬â bez zmian API / enum / zapisu.

## 2026-07-16 Ã¢â¬â Zbieranie: nazewnictwo Sellasist 1:1 (UI)

- Nav: Konfiguracja statusÄÅw, ZarzÃâ¦dzanie zbiorami, Ustawienia wspÄÅlne, Metody zbierania, Braki przy zbieraniu, Magazyny, Ã¢â¬Â¦
- Etykiety pÄÅl/checkboxÄÅw/przycisku dodawania wg briefu; opcje trybÄÅw 1:1.
- Sekcja `wms-pick-workflow` usuniÃâ¢ta z nav Ã¢â¬â treÄ¹âºÃâ¡ przeniesiona (bez zmian API).
- Raport: `memory/wms-picking-naming-deploy-report.md`.

## 2026-07-16 Ã¢â¬â Konfigurator zbierania: modal 1400px + nazwy Sellasist 1:1

- Drawer Ã¢â â `PickingSettingsModal` (max-width 1400px), sekcje pionowe / gÃâ¢ste, A|B obok siebie na XL.
- Etykiety opcji: Ã¢â¬Å¾Do wÄÅzka z/bez wymuszenia skanowaniaÃ¢â¬Â¦Ã¢â¬Å¥, Ã¢â¬Å¾Do wÄÅzkÄÅw z koszykamiÃ¢â¬Å¥, Ã¢â¬Å¾WÄÅzkiem mobilnymÃ¢â¬Â¦Ã¢â¬Å¥, kolejnoÄ¹âºÃâ¡ daty/kurierÄÅw jak w Sellasist.
- Bez zmian API / wartoÄ¹âºci enum / zapisu.

## 2026-07-16 Ã¢â¬â Zbieranie settings UX: mniej scrolla, 2 kolumny

- UsuniÃâ¢to prawy sticky Ã¢â¬Å¾PodglÃâ¦d konfiguracjiÃ¢â¬Å¥ (`PickingConfigPreviewPanel` deleted).
- Shell: `sticky menu | content`, lewa nawigacja `lg:sticky lg:top-4`.
- Scroll-spy: `IntersectionObserver` w `WmsSettingsSectionRegistryContext` (+ scroll dla wysokich sekcji).
- NagÄ¹âÄÅwek uproszczony do Ã¢â¬Å¾ZbieranieÃ¢â¬Å¥; karty kompaktowe bez badge Aktywny/Nieaktywny (brak pojÃâ¢cia default w API).

## 2026-07-16 Ã¢â¬â Ustawienia zbierania: audit brakujÃâ¦cych helperÄÅw po refaktorze

- PrzywrÄÅcono lokalne helpery w `WmsPickingSettingsPanel.tsx`: `flattenOrderUiStatusOptions`, limity `BULK_ORDER_*` + `parseBulkOrderLimitInput`, `fieldHintClass`, `configBlockTitleClass`.
- Przyczyna: usuniÃâ¢cie przy czyszczeniu `WmsSettingsPage` bez przeniesienia do panelu.
- `npm run build` OK.

## 2026-07-16 Ã¢â¬â Ustawienia WMS Ã¢â â Zbieranie: redesign UX (3 kolumny)

- Tylko UI: bez zmian API / pÄÅl / zapisu (configs API + shortage API + localStorage extended).
- ModuÄ¹â: `frontend/src/modules/wmsSettings/picking/` Ã¢â¬â shell 3-kolumnowy, lewa nawigacja IA, sticky podglÃâ¦d, drawer edycji trybu.
- Karty trybÄÅw (status Ã¢â â sposÄÅb Ã¢â â 1-poz./multi Ã¢â â po zakoÄ¹âczeniu Ã¢â â Edytuj/UsuÄ¹â); sekcje: tryby, workflow, kolejka, skan, wÄÅzki, braki, magazyny, automatyzacja, widok, zaawansowane.
- `WmsSettingsPage` oczyszczony z martwego kodu po ekstrakcji panelu.

## 2026-07-16 Ã¢â¬â WMS settings UI standardization

- Shared: `WmsSettingsLayout` (hide aside Ã¢â°Â¤1 section), `WmsSettingsSection`, `WmsSettingCard`, `WmsSettingsFooter`.
- Coming soon tabs (Reklamacje, Crossdocking, Rozlokowania, PrzesuniÃâ¢cia): no dashed empty boxes.
- Canonical section labels: OgÄÅlne / Workflow / Widok / Automatyzacja / Integracje / Drukowanie / Zaawansowane.
- Global sticky save bar via `WmsSettingsFooter` for dirty packing/picking/direct sales.

## 2026-07-16 Ã¢â¬â Settings: merge Uprawnienia into UÄ¹Ä½ytkownicy

- Removed fly-out item Ã¢â¬Å¾UprawnieniaÃ¢â¬Å¥ (was a duplicate entry to groups).
- Users module tabs: UÄ¹Ä½ytkownicy ÃÂ· Role i uprawnienia ÃÂ· Grupy uÄ¹Ä½ytkownikÄÅw (+ audit/costs/workforce).
- Restored status-access matrix at `/settings/administrators/roles` as Ã¢â¬Å¾Role i uprawnieniaÃ¢â¬Å¥.

## 2026-07-16 Ã¢â¬â Restore Ustawienia WMS in ERP sidebar

- Re-added top-level sidebar item ``Ustawienia WMS`` (`Settings2`) Ã¢â â `/settings/wms`.
- Placed after ``Ustawienia``, above ``PrzejdÄ¹Å do WMS`` (not inside Settings fly-out).
- Page/route were intact; only nav entry was missing after sidebar refactor.

## 2026-07-16 Ã¢â¬â Global WMS scanner emulator restored

- `DevScannerPanel` always on under WMS (unless `VITE_ENABLE_DEV_SCANNER=false`).
- FAB Ã¢â¬Å¾SkanerÃ¢â¬Å¥, drawer: Skanuj / Enter / WyczyÄ¹âºÃâ¡, last 20 scans, active receiver footer.
- Ctrl+Shift+S; localStorage open + history. Same `handleScan` path as physical scanner.
- Keyboard wedge only in DEV or when flag explicitly `true`.

## 2026-07-16 Ã¢â¬â Cart list: assignment badge (who uses the cart)

- API list/detail: `assigned_user_id`, `assigned_user_name`, `assignment_type` (`packing` | `collecting` | null), `assignment_since`.
- Source: open `WmsPackingSession` via `order.cart_id` (priority) Ã¢â â open picking `WmsOperationSession` Ã¢â â unassigned. No new tables.
- UI: badge on each cart row (gray / blue / green) + hover tooltip (assignee, mode, since).

## 2026-07-16 Ã¢â¬â Cart orders hover preview

- API `orders_preview` on cart list/detail (eager: customer, ui status, items+product).
- Expand panel: hover on order count Ã¢â â Floating UI popover (scroll, max 500px); click Ã¢â â `/orders/:id`.

## 2026-07-16 Ã¢â¬â WÄÅzki: white page background

- `CartsModuleLayout`: `omitCard` + `bg-white` fill (no slate canvas around nested card).
- Expand panel content on white; row hover highlight kept light.

## 2026-07-16 Ã¢â¬â Remove intermediate module h1 (breadcrumb Ã¢â â tabs)

- Dropped duplicate page titles between breadcrumb and tabs in module shells.
- `ModuleListBreadcrumb` margin `mb-6` Ã¢â â `mb-2` (tabs sit directly under nav).

## 2026-07-16 Ã¢â¬â WÄÅzki: breadcrumb/title follow active tab

- `CartsModuleLayout`: Magazyn > {active tab} + h1 = tab label (not always Ã¢â¬Å¾WÄÅzkiÃ¢â¬Å¥).

## 2026-07-16 Ã¢â¬â Cart content: expand under row (no Drawer)

- WÄÅzki / WÄÅzki z koszykami: content preview expands under the cart row (full width), not right Drawer.
- One open cart at a time (`expandedCartId` in `CartsFleetList`); 200ms grid-rows animation.
- `CartBasketEditDrawer` / edit flows unchanged.

## 2026-07-16 Ã¢â¬â WÄÅzki: single module header

- `CartsModuleLayout` alone owns Magazyn > WÄÅzki + title + tabs (incl. NoÄ¹âºniki list).
- Tab pages keep description/actions/KPI only Ã¢â¬â no duplicate PageHeader/breadcrumb/title.
- Carriers list no longer self-hosts tabs.

## 2026-07-16 Ã¢â¬â Product link from location/carrier Ã¢â â full edit card

- `LocationPreviewCarrierContents` + `CarrierItemsTable`: navigate to `/products/:id/edit` (catalog card), not simplified `/products/:id`.
- Pass `tenantId` in location state when available.

## 2026-07-16 Ã¢â¬â NoÄ¹âºniki header rebuild

- KPI: Wszystkie / ZajÃâ¢te / Puste (occupied = sku_count|total_qty > 0); removed Ã¢â¬Å¾GrupyÃ¢â¬Å¥.
- Page owns breadcrumb + title + tabs (no duplicate Ã¢â¬Å¾Magazyn > WÄÅzkiÃ¢â¬Å¥ from CartsModuleLayout).
- Compact spacing (`space-y-2`/`space-y-4`, compact KPI) for large monitors.

## 2026-07-16 Ã¢â¬â Location preview UX fixes

- Slot hover: Floating UI only (`LocationSlotHoverCard`) Ã¢â¬â no native `title` tooltip; flip/shift so popup stays on screen.
- Occupancy: `used_volume` from ÃÅ(LÄâWÄâHÄâqty) in dmÃÅ; if product dims missing Ã¢â â `Ã¢â¬â %` + Ã¢â¬Å¾Brak danych o objÃâ¢toÄ¹âºci produktÄÅwÃ¢â¬Å¥ (no fake 0%).
- Carrier product cards: whole card clickable Ã¢â â `/products/:id`, hover cursor + Ã¢â¬Å¾OtwÄÅrz kartÃâ¢ produktuÃ¢â¬Å¥.

## 2026-07-16 Ã¢â¬â Location preview modal rebuild

- Modal wider (`max-w` ~1760px), 3-column layout for 27Ã¢â¬â32" screens.
- Occupancy: volume/weight/slots only when max known; else `Ã¢â¬â %` + Ã¢â¬Å¾Brak danych o pojemnoÄ¹âºci noÄ¹âºnikaÃ¢â¬Å¥ (no fake 0%).
- Rack front: all levels/positions, color legend (primary/reserve/active/blocked/empty), hover tip (kod/typ/noÄ¹âºnik/SKU/iloÄ¹âºÃâ¡).
- Floor plan: highlight rack + aisle + location; carrier contents show photo/name/SKU/EAN/qty.
- API `visual-context`: `ean`, capacity fields, enriched `rack_bins` / `rack_grid.aisle`.

## 2026-07-16 Ã¢â¬â Szablony / Gotowe szablony card polish

- Cards: white `#FFFFFF`, border `#E5E7EB`, radius 16px, soft shadow + hover lift; removed grey preview backgrounds.
- Ready filter tabs: wrap + horizontal scroll, never clipped.
- Dimensions via `formatMm` / `formatLabelSizeMm` (max 1 decimal); no DPI / raw type ids in card meta Ã¢â¬â Polish labels (`Lokalizacja Ã¢â¬Ë 93 Äâ 67 mm Ã¢â¬Ë EdytowanoÃ¢â¬Â¦`).

## 2026-07-15 Ã¢â¬â Szablony list UI rebuild

- `LabelTemplatesList`: single inner rail (260Ã¢â¬â280px) for typ etykiety + grupy; full-width right content.
- Row cards (`TemplateListRow`): checkbox, thumbnail, name/type/size/date/uses, actions; click selects; Lista/Karty toggle kept.
- Split into `templatesList/*`; no SASIST sidebar/navbar/tab changes; same APIs.

## 2026-07-15 Ã¢â¬â CSV mapping modal live label preview

- `CsvMappingModal`: two-column layout with right panel Ã¢â¬Å¾PodglÃâ¦d etykietyÃ¢â¬Å¥ (`CsvMappingPreviewPanel`).
- Live `LabelPreviewCard` from draft mapping + in-memory CSV; record nav, single/grid (6), field values with orange Ã¢â¬Å¾Brak mapowaniaÃ¢â¬Å¥.
- Mapping table column Ã¢â¬Å¾PrzykÄ¹âad (1. rekord)Ã¢â¬Å¥: `Kolumna Ã¢â â Pole Ã¢â â wartoÄ¹âºÃâ¡`. No PDF/backend.

## 2026-07-15 Ã¢â¬â Print queue unified 3-column layout

- All print modes (Lokalizacje, RegaÄ¹ây, Pasek, WÄÅzki, Import PDF, Import CSV) share `PrintQueueWorkspaceShell`: `380px | minmax(700px,1fr) | 320px`.
- Removed vertical stack + `max-w-[1500px]`; CSV keeps fullscreen `CsvMappingModal`; deleted `CsvImportQueueShell`.
- Handlers/API unchanged Ã¢â¬â UI shell only.

## 2026-07-15 Ã¢â¬â CSV mapping fullscreen modal

- Import CSV: mapping moved from left column into `CsvMappingModal` (backdrop blur, badges, table, auto/clear/save).
- Removed artificial `max-w-[1800px]` from CSV shell.

## 2026-07-15 Ã¢â¬â CSV import template picker UX

- Import CSV only: friendly print-kind chips filter templates; `CsvTemplatePicker` (search + thumbnails); no raw `(location)` labels.
- Mapping dropdown = template used variables only (no type-catalog dump).

## 2026-07-15 Ã¢â¬â Ready templates library UI

- `LabelReadyTemplatesPage`: Figma/Canva-style library Ã¢â¬â orange filter tabs, grouped sections, preview-first cards (`LabelGalleryThumbnail`), outline Edytuj/UÄ¹Ä½yj + Ã¢â¹Â® menu.
- New `readyTemplates/*`; presets stay client-side; Ã¢â¬Å¾WÄ¹âasneÃ¢â¬Å¥ from existing `GET /label-templates/`.

## 2026-07-15 Ã¢â¬â Label CSV print queue 3-column wizard

- Import CSV: wizard steps + left accordions (320px) + paginated preview + sticky summary (320px).
- New `printQueue/CsvImportQueueShell`, `PrintQueueStepWizard`, `PrintQueueAccordion`, `PrintQueueThreeColumnLayout`, `PrintQueueLabelPreviewPane`, `PrintQueueSummaryPanel`.
- No API/print logic changes Ã¢â¬â UI shell only for `printMode === "csv_import"`.

## 2026-07-15 Ã¢â¬â Label CSV mapping UX

- Dropdown no longer lists full `LABEL_VARIABLE_CATEGORIES`; scoped to `available_variables` / bindings / type fallback.
- New `csvMapping/*`: grouped searchable combobox, template field checklist, Wymagane/Opcjonalne/Nie znaleziono status.

## 2026-07-15 Ã¢â¬â Sidebar IA + new Sasist logo

- Removed MAGAZYN section and System/WMS menu rows; Magazyn + Ustawienia open right flyouts under OPERACJE.
- Footer CTA Ã¢â¬Å¾PrzejdÄ¹Å do WMSÃ¢â¬Å¥ (56px, rounded-16, white border).
- New assets: `frontend/src/assets/logo/sasist-{mark,logo}.svg` (+ public/favicon sync); HeaderLogo / login / printer modal.

## 2026-07-15 Ã¢â¬â ERP shell polish (blue active + Magazyn flyout)

- Sidebar 260px: hamburger + logo in rail; active `bg-blue-50` + `w-1 bg-blue-600`; larger icons/gaps.
- Top bar: search + bell + warehouse (Ã¢â°Ä220px) + avatar only (no logo).
- Magazyn: side flyout 300px `rounded-r-3xl shadow-2xl` (click/hover, not accordion).

## 2026-07-15 Ã¢â¬â ERP AppTopBar rebuild

- New `components/layout/topbar/*`: HeaderLogo, GlobalSearch, NotificationBell, WarehouseSwitcher, UserMenu, AppTopBar.
- Removed KPI pills and secondary header icons; white 70px bar; Ctrl+K search (`erpTopbar` variant).
- Hamburger toggles sidebar via `ErpSidebarUiContext`; removed mobile overlay drawer (desktop-first).

## 2026-07-15 Ã¢â¬â ERP left sidebar UX rebuild

- New `ErpSidebar`: sections SPRZEDAÄ¹Â» / OPERACJE / MAGAZYN, WMS sticky bottom, profile footer, collapse 76px, mobile drawer.
- Orange active item (`bg-orange-50`, `border-l-[3px] border-orange-500`), white surface, 24px icons.
- Grouping via `NAV_SIDEBAR_SECTIONS` in `mainNavConfig.tsx`.

## 2026-07-15 Ã¢â¬â Purchasing product images

- Root cause: API returns relative `/uploads/...`; purchasing thumbs used raw URL Ã¢â â 404 on SPA origin.
- Added `getProductImage` / `toAbsoluteProductImageUrl` (candidate fields + semicolon first + backend origin).
- Wired into `PurchasingProductThumbnail` and `purchasingProductDisplayMeta`.
- Dashboard critical/suggested rows now include `image_url`.

## 2026-07-12 Ã¢â¬â Sasist Printer Agent v1.0.4 pre-release audit

- `WindowRegistry` Ã¢â¬â singleton okien Status/Config/Logs; `TrayApp` reuÄ¹Ä½ywa instancji.
- `agent/ui/host.py` Ã¢â¬â jeden hidden root, non-daemon UI thread, Toplevel only (tray).
- `agent/ui_smoke_test.py` + `--ui-smoke-test` + `scripts/verify_agent_ui_smoke.ps1`.
- `verify_agent_exe.py` Ã¢â¬â icon SHA256 + moduÄ¹ây `host/dialogs/window_registry`.
- `verify-release.ps1` Ã¢â¬â icon, built_at, build_info.json; manifest `icon_sha256`.
- `installer.iss` Ã¢â¬â `[InstallDelete]` legacy skrÄÅtÄÅw; jeden skrÄÅt pulpitu.
- `install.ps1` Ã¢â¬â usuwa legacy skrÄÅty przy upgrade; `verify_agent_upgrade.ps1`.
- VERSION Ã¢â â 1.0.4.

## 2026-07-12 Ã¢â¬â Sasist Printer Agent desktop UI audit

- WspÄÅlny wÃâ¦tek UI (`agent/ui/host.py`), Toplevel zamiast wielu `tk.Tk()` na wÃâ¦tkach daemon.
- Ujednolicony nagÄ¹âÄÅwek (`app_header`), theme, karty, badge, filtry chip w Log Viewer.
- Setup Wizard 4-krokowy; Config/Status/Logi bez `messagebox` / `LabelFrame`.
- Instalator: jeden skrÄÅt pulpitu z `{app}\assets\icon.ico`; usuniÃâ¢te skrÄÅty Logs/Config.

## 2026-07-12 Ã¢â¬â Sasist Printer Agent release validation

- `installer/build.ps1`: po PyInstaller walidacja PYZ (UI modules + VERSION); po Inno Setup walidacja nazwy instalatora i EXE wyciÃâ¦gniÃâ¢tego z setupu; exit 1 przy braku moduÄ¹âÄÅw UI.
- `scripts/verify_agent_exe.py`: weryfikacja moduÄ¹âÄÅw `agent.ui.*` i spÄÅjnoÄ¹âºci VERSION (utf-8-sig).
- `scripts/verify-release.ps1`: SHA256 manifest vs lokalny build vs GitHub asset, UI modules, wynik PASS/FAIL.
- CI: `verify-release.ps1 -SkipGithub` przed uploadem; peÄ¹âna weryfikacja GitHub po publikacji tagu.

## 2026-07-11 Ã¢â¬â Integracja drukowania Sasist (frontend + orchestracja backend)

- Backend: `POST /api/printing/jobs/queue` Ã¢â¬â generuje PDF server-side, zapisuje plik, tworzy PrintJob z `pdf_url` Ã¢â â `/jobs/{id}/file`.
- Backend: `GET /api/printing/jobs/{id}/file` Ã¢â¬â pobranie PDF przez agenta (Bearer).
- Frontend: `printingApi.ts`, `useQueuePrint`, moduÄ¹â Ustawienia Ã¢â â Drukarki (agenci / drukarki / domyÄ¹âºlne / legacy QZ).
- Integracja Ã¢â¬Å¾DrukujÃ¢â¬Å¥: dokumenty magazynowe, sprzedaÄ¹Ä½owe, kolejka etykiet Ã¢â â kolejka drukowania + toast sukcesu.

## 2026-07-11 Ã¢â¬â Sasist Printer Agent Windows MVP (Faza 2AÃ¢â¬â2F)

- Nowy projekt: `sasist-printer-agent/` Ã¢â¬â Python 3.12, requests, pywin32, pystray, PyInstaller.
- ModuÄ¹ây: config, api, auth, printers, heartbeat, jobs, printing, tray, app.
- Config/logs: `%ProgramData%\Sasist\PrinterAgent\`.
- Testy: `sasist-printer-agent/tests/` (6 passed).

## 2026-07-11 Ã¢â¬â Printing MVP Faza 1BÃ¢â¬â1D (API + serwisy + testy)

- Serwisy: `backend/services/printing/` Ã¢â¬â auth token `spt_*`, rejestracja/heartbeat agentÄÅw, sync drukarek, job lifecycle (atomowy claim), defaults.
- API: `/api/printing/*` Ã¢â¬â agents, printers, jobs, defaults (`backend/api/printing/`).
- Auth agenta: `get_current_agent()` Ã¢â¬â Bearer `spt_*`, bez JWT.
- Testy: `backend/tests/printing/test_printing_api.py` Ã¢â¬â 16 testÄÅw, wszystkie przechodzÃâ¦.
- **NastÃâ¢pny krok:** Faza 2 Ã¢â¬â agent Windows.

## 2026-07-11 Ã¢â¬â Printing MVP Faza 1A (modele + migracje + schemas)

- Nowe tabele ORM: `printer_agents`, `agent_printers`, `print_jobs`, `printing_defaults` (`backend/models/printing/`).
- Pydantic schemas: `backend/schemas/printing/` (agent, printer, job, defaults).
- Tier 1 ensure: `backend/db/printing_schema.py` + wpis w `schema_tiers.py`.
- SQL referencyjny: `backend/migrations/018_printing_mvp.sql`.
- Legacy `printers` (QZ) bez zmian; nowy model `AgentPrinter` Ã¢â â tabela `agent_printers`.
- **NastÃâ¢pny krok:** Faza 1BÃ¢â¬â1D (serwisy + API `/api/printing/*`).

## 2026-06-08 Ã¢â¬â UsuniÃâ¢cie segmentacji ABC/XYZ (Zakupy i planowanie)

- UsuniÃâ¢to endpoint `GET /purchasing/segments`, serwis `purchasing_segments_service`, strony/komponenty heatmapy i priorytetÄÅw.
- Plan zakupÄÅw: `PlanCategoryStrip` (Hity sprzedaÄ¹Ä½y, Niski zapas, Martwy stock, Ryzyko braku, Wysoka wartoÄ¹âºÃâ¡ magazynu) zamiast AXÃ¢â¬âCZ.
- Auto-reorder i replenishment bez filtrÄÅw `segment_abc` / `only_segments`.
- Opcjonalna migracja SQL: `backend/db/migrations/optional/2026-06-08_drop_abc_xyz_purchasing.sql`.
- Raport: `docs/abc-xyz-removal-report.md`.

## 2026-06-08 Ã¢â¬â Sidebar ERP + dashboardy: gÃâ¢stoÄ¹âºÃâ¡ informacji (design tokens)

- `erpDensityTokens.ts` Ã¢â¬â globalne tokeny: `sidebarItemHeight`, `sidebarItemGap`, `dashboardCardPadding`, `dashboardSectionGap`, `kpiCardHeight` + klasy Tailwind.
- `dashboardDensityPrimitives.ts` Ã¢â¬â wspÄÅlne klasy kart/sekcji dashboardÄÅw.
- Lewy sidebar (`ErpShellLayout`, `NavFlyoutPanel`): wiersze 36px, `px-3 py-1.5`, ikony 17px, ciaÄ¹âºniejszy fly-out.
- WMS w menu jako normalna kategoria (miÃâ¢dzy Etykietami a Dokumentami) Ã¢â¬â bez separatora na dole; routing `/wms/menu` bez zmian.
- Dashboardy: gÄ¹âÄÅwny (`Dashboard.tsx`), zakupy (`PurchasingKpi*`, `PlanningDashboard` shell), analityka, WMS supervisor, flota wÄÅzkÄÅw, magazyn, dokumenty KPI Ã¢â¬â mniejsze paddingi i odstÃâ¢py.
- Backend / routing / logika / uprawnienia bez zmian.

## 2026-06-08 Ã¢â¬â Listy floty (wÄÅzki, noÄ¹âºniki, regaÄ¹ây): kompaktowe wiersze 68px

- WspÄÅlny moduÄ¹â `modules/fleetResource/` Ã¢â¬â wiersz 68px, pasek zapeÄ¹ânienia 6px, akcje 32Äâ32 poziomo, drawer szczegÄÅÄ¹âÄÅw.
- `CartCard` Ã¢â¬â widok zwiniÃâ¢ty (jeden rzÃâ¦d); szczegÄÅÄ¹ây w `CartFleetDetailPanel` (drawer z prawej).
- `CarriersGroupTable`, `ConsolidationRacksListTable` Ã¢â¬â ta sama wysokoÄ¹âºÃâ¡ wiersza i poziome akcje.
- Backend bez zmian.

## 2026-06-08 Ã¢â¬â Faza 0 layoutÄÅw + migracja Projektanta Magazynu

- Nowa infrastruktura: `frontend/src/components/layout/app/*` (`AppPageLayout`, `AppContentLayout`, `AppSplitView`, `AppRightPanel`, `AppSectionCard`) + `appLayoutTokens.ts`.
- Shell: `ErpShellLayout`, `WmsOperationalLayout`, `WmsTopBar` Ã¢â¬â jedno tÄ¹âo `bg-slate-50`, border-only (bez shadow / overlay).
- Projektant: `WarehouseDesigner` Ã¢â â `AppPageLayout` + `AppSplitView`; prawy panel regaÄ¹âu/elewacji in-flow (`WarehouseMainView`, `ElevationSidePanel`, `RackPropertiesSidebar`); usuniÃâ¢to `fixed right-0` z `WarehouseModals`.
- Backend bez zmian.

## 2026-06-08 Ã¢â¬â Purchasing API: schema sync PostgreSQL + orders N+1

- `ensure_purchasing_orm_schema` Ã¢â¬â cross-dialect sync Supplier / PurchaseOrder ORM (Railway Postgres).
- `ensure_supplier_purchasing_columns`, `ensure_purchase_order_tax_invoice_columns` Ã¢â¬â dziaÄ¹âajÃâ¦ teÄ¹Ä½ na PostgreSQL (wczeÄ¹âºniej sqlite-only Ã¢â â potencjalne HTTP 500).
- `list_purchase_orders` Ã¢â¬â `joinedload(supplier)` + batch `item_count` (eliminacja N+1).
- `purchasing_segments_service` Ã¢â¬â agregacja tygodniowa w SQL (ISO year/week) zamiast GROUP BY dzieÄ¹â.

## 2026-06-08 Ã¢â¬â Plan zakupÄÅw: split layout + panel produktu

- `/purchasing/plan` Ã¢â¬â lewa: KPI, mini heatmapa segmentÄÅw (AXÃ¢â¬âCZ), liczniki alertÄÅw + szybkie filtry, tabela; prawa (max 420px): szczegÄÅÄ¹ây po klikniÃâ¢ciu wiersza (prognoza, segment, alerty, historia sprzedaÄ¹Ä½y, rekomendacja).
- UsuniÃâ¢to osadzanie peÄ¹ânych stron Alerty/Segmenty/Prognoza w sidebarze; `PlanSidePanel` / `?panel=` wycofane.
- Backend bez zmian.

## 2026-06-08 Ã¢â¬â Zakupy i planowanie: refaktor UX (4 zakÄ¹âadki)

- Menu: Pulpit | Plan zakupÄÅw | ZamÄÅwienia | Dostawcy (zamiast 10 zakÄ¹âadek).
- `/purchasing/plan` Ã¢â¬â centrum pracy (tabela + panele prognozy/segmentÄÅw/alertÄÅw); legacy redirecty z generatora, prognozy, segmentÄÅw, alertÄÅw, auto-reorder.
- `/purchasing/suppliers/{ocena,historia,oszczednosci}` Ã¢â¬â hub dostawcÄÅw w module ZakupÄÅw; redirecty ze starych tras i `/suppliers/ocena|historia`.
- Backend bez zmian.

## 2026-06-08 Ã¢â¬â Dokumenty magazynowe: kompaktowy widok szczegÄÅÄ¹âÄÅw (UX/UI)

- Modal PZ/WZ/MM/PW/RW: nagÄ¹âÄÅwek ~250px, dwie karty info, pasek finansÄÅw inline.
- Tabela pozycji: `flex-1`, scroll wewnÃâ¢trzny, gÃâ¢stsze komÄÅrki.
- Podsumowanie: jeden wiersz Netto | VAT | Brutto (+ iloÄ¹âºci).
- Stopka: akcje pomocnicze lewo, operacyjne prawo, tokeny `listSellasist`.
- Z-PZ: ten sam ukÄ¹âad kompaktowy + fix importu `documentCreatedByLabel`.


- `LabelGalleryThumbnail` Ã¢â¬â renderuje prawdziwy podglÃâ¦d SVG (`renderLabel` + `buildPreviewRecord`), cache per preset.
- Karty: miniatury 140px, proporcje zachowane, wybÄÅr slate-900 + Ã¢Åâ, hover translate/shadow 150ms.
- Modal: segmented control (`tabsNavSegmentedItemClassName`), stopka z licznikiem + `listSellasistToolbarToggleBtn` / `labelDesignerToolbarPrimaryBtnClass`.
- UsuniÃâ¢to ikony zastÃâ¢pcze i kolory cyan z galerii.


- Typ etykiety: wyÄ¹âÃâ¦cznie typy magazynowe (`LABEL_DESIGNER_TYPE_OPTIONS`), bez dokumentÄÅw ERP.
- Pasek: `LabelDesignerToolbarSelect`, pola liczbowe bez spinbuttonÄÅw, `h-10` na wszystkich kontrolkach.
- Menu Ã¢â¬Å¾WiÃâ¢cejÃ¢â¬Å¥: import/eksport, zapisz jako, duplikuj, reset, ustawienia projektu (`LabelDesignerMoreMenu`).
- Przycisk Ã¢â¬Å¾ZapiszÃ¢â¬Å¥: tokeny jak PrimaryButton w listach ERP (`labelDesignerToolbarTokens`).
- Ustawienia projektu: modal z custom selectem grupy (`LabelDesignerProjectSettingsModal`).

## 2026-06-08 Ã¢â¬â DTE edytor: UX IDE (12 poprawek, frontend only)

- Lewy panel: persist zakÄ¹âadka + rozwiniÃâ¢te sekcje zmiennych (`useLeftPanelPersistence`).
- UÄ¹Ä½ycia: klikalne badge Ã¢â â `AssignmentConfigModal`; funkcje pogrupowane (`HelperCatalogPanel`).
- Prawy panel: przypiÃâ¢ty / odÄ¹âÃâ¦czony (`DetachedInspectorPanel`); podglÃâ¦d bez auto-refresh przy pisaniu; scroll iframe.
- Monaco: minimap (localStorage), breadcrumbs TWIG, status bar VS Code, dark theme; responsywnoÄ¹âºÃâ¡ &lt;1600 / &gt;2200 px.

## 2026-06-08 Ã¢â¬â DTE ERP: fix picking-list 503 + masowy druk

- **503 picking-list:** `order_provider` woÄ¹âaÄ¹â `map_sale_document(doc=None)` Ã¢â â `AttributeError` w `_resolve_payment`; naprawa: `map_order_for_print()` + guard `doc is not None` w mapperze.
- **Masowy druk DTE:** `ErpBulkPrintModal` Ã¢â¬â zamÄÅwienia (Multiakcje Ã¢â â Drukuj), produkty (bulk bar), magazyn (`DocumentsWarehousePage`), sprzedaÄ¹Ä½ (`DocumentsSalesPage` Ã¢â¬â checkboxy + Drukuj).
- **Frontend build:** exit 0 po integracji.

## 2026-06-08 Ã¢â¬â MRP komercyjny: strategie prognozy, MOQ, symulacja

- **Strategy Pattern:** `DemandForecastStrategy` Ã¢â¬â 6 strategii (Ä¹âºrednia, waÄ¹Ä½ona, dzieÄ¹â tygodnia, mediana, max, AI placeholder).
- **Ustawienia:** Produkcja Ã¢â â Prognozowanie (`production_forecast_json` per magazyn).
- **Produkt:** `max_total_stock`, `production_moq`, `production_batch_multiple`, `production_lead_time_days` (+ istniejÃâ¦ce `min_total_stock`).
- **Serwisy:** `PlanningService`, `MaterialAvailabilityService`, `ProductionRecommendationService`, `PriorityEngine`, `LeadTimeService`, `SimulationService`, `InventoryCoverageService`.
- **API:** `POST /production/planning/simulate`, `POST /production/planning/simulate/create-batches`.
- **UI:** KPI dashboard, kolumna Ã¢â¬Å¾Dlaczego?Ã¢â¬Å¥, wykres osi czasu, modal symulacji.

## 2026-06-08 Ã¢â¬â Planowanie zapotrzebowania MRP (ProductionPlanningService)

- Backend: `backend/services/production_planning/` Ã¢â¬â order demand, velocity, pipeline, priority, `demand_engine_service`.
- API: `GET /production/planning/demand?warehouse_id=&coverage_days=&sales_lookback_days=`.
- UI: sekcja Planowanie zapotrzebowania na `/production/planning` Ã¢â¬â 3 karty + tabela; CreateBatchModal z pre-fill z MRP.

## 2026-06-08 Ã¢â¬â Produkcja WMS: jeden ekran zbierania + WmsProductTaskCard + PW draft

- **Zbieranie:** nagÄ¹âÄÅwek z produktem koÄ¹âcowym (partia/MO, zdjÃâ¢cie, SKU, iloÄ¹âºÃâ¡); wszystkie pÄÅÄ¹âprodukty na jednym ekranie; accordion Ã¢â¬â aktywna karta rozwiniÃâ¢ta, po potwierdzeniu auto-rozwija nastÃâ¢pnÃâ¦; `CollectionJobHeaderRead` w API.
- **Komponenty:** `WmsProductTaskCard` (wrapper na `WmsProductCard`) Ã¢â¬â Produkcja/Zbieranie; PrzyjÃâ¢cie/Rozlokowanie nadal na wÄ¹âasnych kartach (ReceivingLineCard, PutawayLineCard) Ã¢â¬â migracja w toku.
- **PW:** status `draft` + `receiving_status=DONE` + `putaway_status=NOT_STARTED` (jak PZ po PrzyjÃâ¢ciu) Ã¢â¬â ta sama brama Rozlokowania.
- **Railway 404 settings:** `/api/wms/settings/production` i `product-validation` Ã¢â â 404 na produkcji; `/api/wms/settings/packing` Ã¢â â 401 (trasa istnieje). Wniosek: Railway uruchamia commit **sprzed** `4438ab9` (trasy dodane w v3) Ã¢â¬â nie brak routera lokalnie, lecz stary deploy.

## 2026-06-08 Ã¢â¬â Produkcja WMS: zbieranie z wyborem lokalizacji + fixy PW/settings

- Zbieranie: jedno zadanie na pÄÅÄ¹âprodukt, lista lokalizacji z badge WMS, LOT/partia/waÄ¹Ä½noÄ¹âºÃâ¡/S/N, wybÄÅr lokalizacji przez operatora.
- DostÃâ¢pne: iloÄ¹âºÃâ¡ na wybranej lokalizacji + suma magazynowa `(X szt. w magazynie)`.
- ZdjÃâ¢cia wyrobu: kolejka WMS, pasek aktywnego zadania, karty zadaÄ¹â, ERP BatchCard (product_image_url z API).
- PW: `recompute_putaway_status_for_document` po utworzeniu; po zakoÄ¹âczeniu produkcji nawigacja do `/wms/putaway/{pwId}`.
- WMS Settings: `_wms_settings_wh_dep` respektuje `warehouse_id` z query; log montowania tras przy starcie.

## 2026-06-08 Ã¢â¬â Produkcja WMS: PW Ã¢â â standardowe Rozlokowanie + ustawienia terminala

- **Workflow:** zakoÄ¹âczenie produkcji tworzy dokument PW (`creation_source=PRODUCTION`) i wrzuca go do kolejki `/wms/putaway` Ã¢â¬â bez osobnego terminala Ã¢â¬Å¾OdÄ¹âoÄ¹Ä½enie wyrobÄÅwÃ¢â¬Å¥.
- **Backend:** `pw_putaway_handoff.py`, `finish_production` / `finish_order_production` Ã¢â â `completed` + PW; fazy terminala: tylko `collecting` | `execute`.
- **Ustawienia:** Ustawienia Ã¢â â WMS Ã¢â â Produkcja Ã¢â¬â widok terminala + wymagane dane (`GET/PUT /wms/settings/production`).
- **Zbieranie:** karty zadaÄ¹â jak inne terminale WMS (zdjÃâ¢cie, SKU, EAN, lokalizacja, iloÄ¹âºci); `CollectionTaskRead` rozszerzony o EAN/stan/jednostkÃâ¢.
- **ERP:** miniatury produktÄÅw na szczegÄÅle partii i MO (wyroby + skÄ¹âadniki).
- **Frontend:** usuniÃâ¢to zakÄ¹âadkÃâ¢ putaway z terminala produkcji; redirect legacy URL Ã¢â â `/wms/putaway`.

## 2026-06-08 Ã¢â¬â WMS: globalna walidacja produktÄÅw + override per SKU

- **Globalne ustawienia:** `wms_settings.validation_require_*` Ã¢â¬â konfiguracja w Ustawienia Ã¢â â WMS Ã¢â â PrzyjÃâ¢cia Ã¢â â Walidacja produktÄÅw.
- **Override produktu:** `products.validation_skip_*` Ã¢â¬â wyÄ¹âÃâ¦czenie globalnej reguÄ¹ây dla konkretnego SKU.
- **SSOT:** `product_validation_policy.resolve_effective_receiving_requirements()` Ã¢â¬â effective = global && !skip (legacy per-product flags do migracji).
- **Migracja:** `ensure_wms_product_validation_schema` Ã¢â¬â OR flag produktÄÅw Ã¢â â global, skip = NOT legacy per produkt.
- **UI:** karta produktu = tylko wyÄ¹âÃâ¦czenia; `ProductReceivingRequirementsSection` przeniesiony do ustawieÄ¹â WMS.

## 2026-06-08 Ã¢â¬â Produkcja UX: layout receptury + fix React #130

- **React #130:** `AppEmptyState` wymaga `icon: LucideIcon`; brak `icon` na `ProductionOrdersPage` (i innych listach) powodowaÄ¹â render `<Icon />` z `undefined` Ã¢â â crash przy pustej liÄ¹âºcie zleceÄ¹â po utworzeniu MO.
- Naprawiono: `ProductionOrdersPage`, `BatchesListPage`, `ProductionHistoryPage`, `ProductionAnalyticsPage` Ã¢â¬â dodano ikony.
- **Formularz receptury:** `PRODUCTION_NUMBER_INPUT` ukrywa natywne spinnery w polach number (wydajnoÄ¹âºÃâ¡, iloÄ¹âºÃâ¡, odpad); wersja pozostaje polem tekstowym.
- **Layout `ProductManufacturingPanel`:** grid 65/35 Ã¢â¬â lewa: dane receptury, edytor skÄ¹âadnikÄÅw, podglÃâ¦d BOM, RW/PW; prawa (sticky): zuÄ¹Ä½ycie materiaÄ¹âÄÅw + historia produkcji.
- **`CompositionVisualEditor`:** skÄ¹âadniki i podglÃâ¦d BOM w jednej kolumnie (nie obok siebie).

## 2026-06-08 Ã¢â¬â Produkcja Faza 3: ERP monitoring-only (execution Ã¢â â WMS)

- `ProductionOrderDetailPage` / `BatchDetailPage` Ã¢â¬â monitoring + timeline, CTA: Wydaj do WMS / OtwÄÅrz terminal / Anuluj
- `ProductionMonitoringPanel`, `ProductionExecutionTimeline`, `productionExecutionTimeline.ts`
- OdÄ¹âÃâ¦czono `ProductionOrderExecutionPanel` i `ProductionBatchExecutionPanel` od UI
- `ProductionPage`, `BatchCard` Ã¢â¬â bez akcji wykonawczych ERP
- Legacy API/endpoints oznaczone `@deprecated` (Phase 4 cleanup)

## 2026-06-08 Ã¢â¬â Produkcja Faza 2: unified WMS terminal (frontend)

- Kolejki terminala przez `GET /production/wms-queue` (partie + MO w jednej liÄ¹âºcie)
- Hook `useProductionExecutionJob` Ã¢â¬â ukrywa rÄÅÄ¹Ä½nice batch/order API
- Routing kanoniczny: `/wms/production/{collecting|execute|putaway}/:kind/:id` + redirecty legacy
- `WmsProductionJobQueueCard` z badge Partia/MO; strony Collecting/Execute/Putaway przebudowane
- ERP panele execution oznaczone `@deprecated` (Phase 3)

## 2026-06-08 Ã¢â¬â Produkcja Faza 1: unified WMS execution (MO + partia)

- **Model MO:** `collection_state_json`, `released_to_wms_at`, `released_by_user_id`, fazy `collecting_completed_at` / `production_completed_at`; statusy `collecting` / `putaway`
- **Pakiet `production_execution/`:** `order_execution_service`, `wms_queue_service`, `job_projection_service`, `constants`, `status_migration`
- **Kontrakt:** `ProductionExecutionJobRead` + `GET /production/wms-queue?phase=collecting|execute|putaway`
- **MO WMS API:** release-to-wms, start-collecting, collection, finish-collecting, production-progress, finish-production, finish-putaway
- **Migracja:** `migrate_legacy_order_execution_statuses` w `ensure_production_schema_evolution`
- **Frontend (minimal):** `releaseOrderToWms`, statusy MO, Ã¢â¬Å¾Wydaj do WMSÃ¢â¬Å¥ na liÄ¹âºcie zleceÄ¹â dla MO
- **Testy:** `backend/tests/test_production_execution.py`

## 2026-06-08 Ã¢â¬â Produkcja: fundamenty architektury (receptury, MO, handoff WMS)

- **Receptury:** MO tworzone przez `composition_id` (`ProductComposition`); `clone_composition_version` + `POST /compositions/{id}/clone`; lista receptur uÄ¹Ä½ywa `compositionApi` (activate/clone)
- **MO:** ekran `/production/orders/:orderId` (`ProductionOrderDetailPage`) + `ProductionOrderExecutionPanel` (start/complete/cancel, RW/PW)
- **Handoff WMS:** `released_to_wms_at` na partii, `POST /production/batches/{id}/release-to-wms`; kolejka WMS tylko partie wydane; `start-collecting` wymaga wydania
- **Integracja zestawÄÅw:** `BundleProductionPanel` Ã¢â â `composition_id` przy tworzeniu MO

## 2026-06-08 Ã¢â¬â Globalny system widokÄÅw list (listView) Ã¢â¬â faza 2

- UI: split button `[Filtruj Ã¢âÄ½]` w `FilterApplyActions` (menu: Filtruj / Zapisz / Wczytaj / ZarzÃâ¦dzaj / Resetuj) Ã¢â¬â bez osobnego przycisku Ã¢â¬Å¾WidokiÃ¢â¬Å¥
- Enter w polach filtrÄÅw Ã¢â â submit formularza (`FilterPanelBodyWithActions`) Ã¢â¬â jeden request
- WspÄÅlna fabryka adapterÄÅw `listViewAdapterFactory.ts` + adaptery per ekran
- Migracja wszystkich gÄ¹âÄÅwnych list z filtrami (14+ screenId) Ã¢â¬â patrz wpis fazy 1 + lista w PR/komunikacie
- UsuniÃâ¢to `ListViewPresetsMenu` z toolbarÄÅw ZamÄÅwienia/Produkty

## 2026-06-08 Ã¢â¬â Globalny system widokÄÅw list (listView) Ã¢â¬â faza 1

- Backend: tabela `user_list_views`, REST `/api/ui/list-views/{screen_key}` (autosave + presety publiczne/prywatne)
- Frontend: moduÄ¹â `preferences/listView/` Ã¢â¬â `useListViewState`, `ListViewPresetsMenu`, adaptery per ekran
- Pilot: ZamÄÅwienia (`orders.list`) + Produkty (`products.list`)
- Stare hooki `useFilterFieldOrder` / `useProductsListColumnOrder` Ã¢â¬â tryb `controlled` (cienkie wrappery)

## 2026-06-08 Ã¢â¬â Produkcja: obsÄ¹âuga 409 przy start-collecting

- WspÄÅlne helpery w `productionUi.ts`: `formatStartCollectingError`, `batchHasMaterialShortages`, lista brakÄÅw w toaÄ¹âºcie
- `BatchDetailPage` + `CollectingPage`: try/catch Ã¢â â `toast.error` (bez uncaught AxiosError)
- Blokada UX: przycisk/karta zablokowane gdy `has_shortages` (tooltip `START_COLLECTING_BLOCKED_TOOLTIP`)

## 2026-06-08 Ã¢â¬â Ustawienia Ã¢â â Firma: redesign UX (design system)

- ModuÄ¹â `companySettings`: layout full-width, `TabsNav` (pomaraÄ¹âczowa linia), trasy `/settings/company/*`
- ZakÄ¹âadki konfiguracyjne bez KPI i bez powielonych nagÄ¹âÄÅwkÄÅw (tylko PageHeader w layoutcie)
- WspÄÅlne komponenty: `PurchasingPageShell`, `PurchasingKpiGrid`, `PurchasingTableSection`, `AppButton`, tokeny formularzy
- Backend: `PATCH tenant-warehouses` obsÄ¹âuguje `is_default` (ustaw magazyn domyÄ¹âºlny)
- UsuniÃâ¢to monolityczny `CompanySettingsPage.tsx` (~1160 linii)

## 2026-06-08 Ã¢â¬â Zakupy: ujednolicone miniatury produktÄÅw + inspektor

- `PurchasingProductThumbnail` / `PurchasingProductCell` Ã¢â¬â 40Äâ40 px, `object-fit: contain`, hover preview (150 ms, preload, portal)
- `PurchasingProductInspectorDrawer` Ã¢â¬â klik sÄ¹âupka Top rotacja Ã¢â â drawer (zdjÃâ¢cie, SKU, dostawca, sprzedaÄ¹Ä½, stan, sugerowane zamÄÅwienie)
- `PurchasingForecastBarTooltip` Ã¢â¬â karta produktu w tooltipie wykresu (miniatura 56 px, sprzedaÄ¹Ä½ 30d, Ä¹âºrednia dzienna, stan, w drodze)
- Migracja: Generator, Prognoza, PO detail, Segmenty, Alerty, Auto-uzupeÄ¹ânianie, Okazje cenowe, dashboard planowania

## 2026-06-08 Ã¢â¬â Produkcja / Receptury: redesign listy + miniatury

- `ProductThumb` bez ramek i szarego tÄ¹âa (Produkcja, OMS panel, WMS inwentaryzacja)
- Receptury: ikony akcji zamiast menu Ã¢â¬Å¾Ã¢â¬Â¦Ã¢â¬Å¥, drawer skÄ¹âadnikÄÅw, `PurchasingTableSection`
- `ProductionRowIconActions`, `RecipeIngredientsDrawer`

## 2026-06-08 Ã¢â¬â BDO: peÄ¹âny redesign UX/UI

- Layout jak Produkcja/Magazyn: breadcrumb Asortyment Ã¢â â BDO Ã¢â â zakÄ¹âadka, tytuÄ¹â + opis, TabsNav
- WspÄÅlne komponenty: `BdoKpiGrid`, `BdoReportKpiGrid` (5 KPI), `BdoFilterBar`, `AppButton`, `AppCard`
- Wszystkie zakÄ¹âadki: PurchasingTableSection, AppEmptyState, filtry w pasku, formularze max-w 900Ã¢â¬â1200px

## 2026-06-08 Ã¢â¬â Produkcja: ujednolicenie siatki KPI

- `ProductionKpiGrid` (4 kolumny desktop) + `ProductionKpiCard` (`density="compact"`)
- Analiza kosztÄÅw: ukÄ¹âad 4+3 zamiast 3+3+1; efektywnoÄ¹âºÃâ¡ zawsze widoczna (Ã¢â¬â gdy brak danych)
- Pulpit, Planowanie, Historia Ã¢â¬â migracja na wspÄÅlne komponenty KPI

## 2026-06-08 Ã¢â¬â Planer floty: redesign UX + nawigacja moduÄ¹âu WÄÅzki

- Trasa `/carts/optimizer` w shellu WÄÅzki (breadcrumb, zakÄ¹âadki); redirect z `/optimizer`
- KPI: 4Äâ `PurchasingKpiCard` (NEW, pojemnoÄ¹âºÃâ¡, sekcyjne, standardowe) + podsumowanie operacyjne po obliczeniu
- Akcje: Primary Ã¢â¬Å¾ObliczÃ¢â¬Å¥, Secondary Ã¢â¬Å¾ZatwierdÄ¹ÅÃ¢â¬Å¥ (disabled bez wyniku)
- Wynik: 3 sekcje (flota, pojemnoÄ¹âºÃâ¡ z progress bar, zamÄÅwienia z pokryciem %)

## 2026-06-08 Ã¢â¬â Zakupy i planowanie: redesign UX/UI (design system)

- WspÄÅlne tokeny: `purchasingButtonTokens` (PRIMARY/SECONDARY/GHOST/LINK), `purchasingTableTokens`, `PurchasingInfoNotice`, `PurchasingSummaryStrip`
- KPI: ujednolicony `PurchasingKpiCard` (min-h 88px, ikony 8Äâ8, uppercase label)
- NagÄ¹âÄÅwki tabel: jednolite tÄ¹âo `bg-slate-50`, `purchasingTableThClass`
- `AppEmptyState` density `inline` Ã¢â¬â zwarte puste stany w sekcjach tabel
- Auto-uzupeÄ¹ânianie: komunikat harmonogramu poza KPI (`PurchasingInfoNotice`)
- Alerty: akcje w `quickActions`, nie w sekcji analizy
- Historia wspÄÅÄ¹âpracy: `PurchasingSummaryStrip` zamiast duÄ¹Ä½ych kart
- Priorytety: mniejsza heatmapa (bez dÄ¹âugich opisÄÅw w kafelkach)
- ZamÄÅwienia PO: `PurchasingPageShell` + `PurchasingTableSection`

## 2026-06-08 Ã¢â¬â Zakupy i planowanie: kompaktowy UX/UI (10 zakÄ¹âadek)

- WspÄÅlne komponenty moduÄ¹âu: mniejsze KPI (`PurchasingKpiCard` bez min-height, p-4, text-2xl), gÃâ¢stsze odstÃâ¢py (`PurchasingContentArea`, `PurchasingPageShell`, `PurchasingFilterBar`, `PurchasingAnalysisSection`)
- `PurchasingDataPanel`: usuniÃâ¢to `flex-grow` Ã¢â¬â sekcje dopasowujÃâ¦ wysokoÄ¹âºÃâ¡ do treÄ¹âºci
- Pulpit, Generator, PO, Prognoza, Priorytety, Alerty, Auto-uzupeÄ¹ânianie, OszczÃâ¢dnoÄ¹âºci, Historia wspÄÅÄ¹âpracy: `AppEmptyState` zamiast pustych kontenerÄÅw z duÄ¹Ä½ym paddingiem
- Prognoza: wykresy 220/240px, czytelniejsze etykiety osi Y (truncate + szersza oÄ¹âº)
- Priorytety: kompaktowa heatmapa (mniejsze kafle, line-clamp opisÄÅw)
- Historia wspÄÅÄ¹âpracy: jedna sekcja podsumowania zamiast dwÄÅch pustych kart

## 2026-06-08 Ã¢â¬â Produkcja ERP: kolumna Akcje na koÄ¹âcu tabel

- Wszystkie listy moduÄ¹âu: Zlecenia, Planowanie (BatchesListPage), Receptury, Historia, Analiza kosztÄÅw Ã¢â¬â kolumna Akcje sticky right (tokens `productsListActions*`), ostatnia kolumna
- Pulpit: nagÄ¹âÄÅwek Ã¢â¬Å¾AkcjeÃ¢â¬Å¥ w ostatniej kolumnie tabeli partii gotowych

## 2026-06-08 Ã¢â¬â Produkcja ERP (ZarzÃâ¦dzanie produkcjÃâ¦): standard UI systemowy

- `ProductionErpModuleLayout`: `TabsNav` + breadcrumb (jak Dostawcy / Inwentaryzacja); peÄ¹ânoekranowe szczegÄÅÄ¹ây partii/receptury bez tabÄÅw
- Pulpit: 8Äâ `PurchasingKpiCard`, alert brakÄÅw z CTA Ã¢â¬Å¾PrzejdÄ¹Å do brakÄÅwÃ¢â¬Å¥, sekcja WMS jako `PurchasingTableSection` + `AppEmptyState`
- Zlecenia: filtry (status, operator, produkt, daty, priorytet), licznik wynikÄÅw, tabela moduÄ¹âowa, menu akcji
- Planowanie: KPI nad tabelÃâ¦ partii (postÃâ¢p, materiaÄ¹ây, operator, termin)
- Receptury / Historia / Analiza kosztÄÅw: filtry, KPI, sortowanie (analiza), menu akcji zamiast linkÄÅw Ã¢â¬Å¾OtwÄÅrzÃ¢â¬Å¥
- Badge statusÄÅw i priorytetÄÅw: `operationalSemanticBadges` (fiolet/niebieski/zielony/pomaraÄ¹âczowy/czerwony)

## 2026-06-08 Ã¢â¬â Inwentaryzacja (ERP): poprawki layoutu i menu akcji

- Dokumenty: kolumna Akcje przeniesiona na koniec tabeli (sticky right, jak Produkty)
- Menu akcji wiersza: portal + `position: fixed` (z-index 10050) Ã¢â¬â bez obcinania pod sidebar / overflow tabeli
- Kreator: przywrÄÅcony shell moduÄ¹âu (breadcrumb, tytuÄ¹â, zakÄ¹âadki Pulpit/Dokumenty/Nowa/Raporty); kroki kreatora wewnÃâ¦trz zakÄ¹âadki; peÄ¹âna szerokoÄ¹âºÃâ¡ contentu

## 2026-06-08 Ã¢â¬â Inwentaryzacja (ERP): przebudowa UI na standard systemowy

- `InventoryLayout`: `TabsNav` + breadcrumb (jak Dostawcy / MateriaÄ¹ây magazynowe); pomaraÄ¹âczowy CTA Ã¢â¬Å¾Nowa inwentaryzacjaÃ¢â¬Å¥
- Pulpit: `PurchasingKpiGrid` Äâ 6 + sekcje `PurchasingTableSection` (aktywne / do zatwierdzenia / zakoÄ¹âczone)
- Dokumenty: licznik wynikÄÅw, filtry (szukaj / status / typ), tabela moduÄ¹âowa, dropdown akcji (OtwÄÅrz / Edytuj / Duplikuj / Eksportuj / UsuÄ¹â)
- Kreator: layout 2-kolumnowy (formularz + panel podsumowania), karty typu z pomaraÄ¹âczowym zaznaczeniem
- Raporty: karty raportÄÅw z badge statusu i eksportem PDF/XLSX
- Badge statusÄÅw: `inventoryDocumentStatusBadgeClass` (operational semantics)

## 2026-06-08 Ã¢â¬â WÄÅzki / WÄÅzki z koszykami: ujednolicony layout WMS

- WspÄÅlny `CartsFleetList` (BULK + MULTI): `ListPageHeader`, KPI (`PurchasingKpiGrid`), sekcje grup peÄ¹ânej szerokoÄ¹âºci
- `CartsFleetGroupActions`: Dodaj wÄÅzek (pomaraÄ¹âczowy), Edytuj (neutralny), UsuÄ¹â grupÃâ¢ (czerwony)
- `CartCard`: ten sam ukÄ¹âad flex + ikony akcji (`OperationalActionColumn`)
- Globalne zapeÄ¹ânienie w karcie zgodnej z design system

## 2026-06-08 Ã¢â¬â RegaÄ¹ây (WMS): standard UI jak NoÄ¹âºniki / Produkty

- `ConsolidationRacksListPage`: `ListPageHeader` (breadcrumb Magazyn Ã¢â â WMS Ã¢â â RegaÄ¹ây), KPI (`PurchasingKpiGrid` Äâ 5), przycisk Ã¢â¬Å¾Nowy regaÄ¹â kompletacyjnyÃ¢â¬Å¥
- Tabela proporcjonalna: `ConsolidationRacksListTable` Ã¢â¬â kolumna Akcje 120px sticky, ikony PodglÃâ¦d / Edycja / UsuÄ¹â (`OperationalActionColumn`)
- Pakiet: `frontend/src/components/consolidationRacks/rackList/*`

## 2026-06-08 Ã¢â¬â NoÄ¹âºniki (WÄÅzki): pÄ¹âaski layout moduÄ¹âu + KPI + tabela standard

- `CartsModuleLayout`: breadcrumb Ã¢â â tytuÄ¹â Ã¢â â `TabsNav` Ã¢â â treÄ¹âºÃâ¡ (jak MateriaÄ¹ây magazynowe); bypass peÄ¹ânoekranowy dla szczegÄÅÄ¹âu noÄ¹âºnika / edycji regaÄ¹âu
- `WarehouseCarriersPage`: `ListPageHeader`, kafelki KPI (`PurchasingKpiGrid`), akcje w toolbarze, sekcje grup bez zagnieÄ¹Ä½dÄ¹Ä½onych ramek
- `CarrierGroupCard`: pÄ¹âaska sekcja (nagÄ¹âÄÅwek + tabela), przycisk Ã¢â¬Å¾Dodaj noÄ¹âºnikÃ¢â¬Å¥
- `CarriersGroupTable`: proporcjonalna tabela moduÄ¹âu, kolumna Akcje 120px sticky, `OperationalActionColumn`

## 2026-06-08 Ã¢â¬â Zestawy: standard UI jak Produkty / Producenci / Dostawcy

- `BundlesPage`: `ListPageHeader` z licznikiem wynikÄÅw i opisem sekcji; toolbar (Filtry, Widoczne pola, Eksport)
- Filtry: `ListFilterEmbeddedShell` + `FilterPanelBodyWithActions` (WyczyÄ¹âºÃâ¡ / pomaraÄ¹âczowy Filtruj) Ã¢â¬â bez `ModuleListFiltersCard`
- Tabela proporcjonalna: checkbox 56px, zdjÃâ¢cie 80px (`ProductListPhotoCell`), nazwa 2fr, akcje 120px sticky; akcje wiersza: PodglÃâ¦d / Edycja / UsuÄ¹â
- Multiakcje: `ModuleBulkActionsToolbar` przez `BundlesListBulkBar` (ZaznaczÃ¢â¬Â¦ / Multiakcje / Eksport / Odznacz)
- Pusty stan: `AppEmptyState` z przyciskiem Ã¢â¬Å¾Dodaj pierwszy zestawÃ¢â¬Å¥
- Pakiet: `frontend/src/components/bundles/bundleList/*`

## 2026-06-08 Ã¢â¬â MateriaÄ¹ây magazynowe: nagÄ¹âÄÅwek moduÄ¹âu jak Dostawcy

- `WarehouseMaterialsLayout`: breadcrumb Ã¢â â tytuÄ¹â Ã¢â â `TabsNav` Ã¢â â treÄ¹âºÃâ¡ (bez `WmsModuleLayout` / karty tabÄÅw)
- Listy kartonÄÅw i materiaÄ¹âÄÅw pakowych: usuniÃâ¢ty zduplikowany `ListPageHeader`; toolbar jak na liÄ¹âºcie DostawcÄÅw
- Formularze edycji: breadcrumb `Asortyment > MateriaÄ¹ây magazynowe > Ã¢â¬Â¦`

## 2026-06-08 Ã¢â¬â Produkty (lista): standard tabel + bulk bar jak ZamÄÅwienia

- Pasek masowych akcji: `ModuleBulkActionsToolbar` przez `ProductsListBulkBar` (Wybierz akcjÃâ¢ / Multiakcje / Drukuj / E-mail / Eksport / Odznacz)
- Tabela proporcjonalna: checkbox 56px, zdjÃâ¢cie 80px, nazwa 2fr max 500px, akcje 120px; konfigurator kolumn (`FilterVisibilityModal`)
- Filtry: licznik w przycisku Ã¢â¬Å¾Filtry (N)Ã¢â¬Å¥, `ListPageHeader`, `TableProperties`
- Pakiet: `frontend/src/components/products/productList/*`

## 2026-06-08 Ã¢â¬â MateriaÄ¹ây magazynowe: wzorzec formularza produktu + tabele list

- Formularze kartonÄÅw i materiaÄ¹âÄÅw pakowych: `WarehouseMaterialEditLayout` + `ProductLikePageLayout` (breadcrumb, hero 80px, zakÄ¹âadki z ikonami, Zapisz/UsuÄ¹â/Duplikuj)
- Sekcje w kartach (`WmFormSectionCard`); edycja bez zakÄ¹âadek moduÄ¹âu (jak Produkty)
- Listy: proporcjonalne tabele z checkboxem, `ProductListPhotoCell`, konfigurator kolumn, filtry z licznikiem

## 2026-06-08 Ã¢â¬â RentownoÄ¹âºÃâ¡ produktÄÅw: standard tabel + KPI zakupowe

- Tabela proporcjonalna (Akcje 80px, ZdjÃâ¢cie 80px, Produkt 2fr max 500px), konfigurator kolumn pod ikonÃâ¦ tabeli
- Miniatury: wspÄÅlny `ProductListPhotoCell` (identyczny jak Asortyment Ã¢â â Produkty)
- Filtry: przycisk Ã¢â¬Å¾FiltryÃ¢â¬Å¥ z licznikiem, panel `PurchasingFilterBar`, draft/applied
- KPI: `PurchasingKpiGrid` Äâ 6 + `PurchasingKpiCard` z ikonami (jak Pulpit zakupÄÅw); filtry: `ListFilterEmbeddedShell` + pomaraÄ¹âczowy Ã¢â¬Å¾FiltrujÃ¢â¬Å¥

## 2026-06-08 Ã¢â¬â ZamÄÅwienia towaru: peÄ¹âna strona edycji + tabela Akcje/Poz.

- Edycja PO: `/goods-orders/:id`, `/goods-orders/:id/:tab` (Podstawowe, Produkty) Ã¢â¬â shell jak Klienci/Dostawcy
- Nowe zamÄÅwienie: `/goods-orders/new` Ã¢â â szkic + redirect na stronÃâ¢ edycji
- Lista: bez modala; legacy `?edit=` Ã¢â â redirect
- Tabela: kolumna Poz. staÄ¹âa 52px; Akcje staÄ¹âa 176px, `flex-nowrap`, sticky prawo
- `proportionalTableColumns`: opcja `extraFixedColumnsPx` dla kolumn poza pulÃâ¦ fr

## 2026-06-08 Ã¢â¬â Producenci i Dostawcy: peÄ¹âne strony edycji (wzorzec Klienci)

- Producenci: `/manufacturers/new`, `/manufacturers/:id`, `/manufacturers/:id/:tab` Ã¢â¬â breadcrumb, zakÄ¹âadki, shell `AssortmentEntityPageShell`
- Dostawcy: `/suppliers/new`, `/suppliers/:id`, `/suppliers/:id/:tab` Ã¢â¬â poza `SuppliersLayout` (bez podwÄÅjnego shella moduÄ¹âu)
- ZakÄ¹âadki dostawcy: Podstawowe (z adresem), Kontakt, Produkty, Warunki handlowe, Statystyki, Historia
- Listy: nawigacja zamiast popupÄÅw; legacy `?edit=` Ã¢â â redirect na stronÃâ¢ encji
- `SupplierEditModal` / `ManufacturerEditModal`: cienkie re-exporty (deprecated)

## 2026-06-08 Ã¢â¬â ZamÄÅwienia towaru: punktacja, KPI, filtry, tabela

- Nazewnictwo: Scoring Ã¢â â Punktacja (lista, KPI, modal, badge)
- KPI: `PurchasingKpiGrid` + `PurchasingKpiCard` (6 kafelkÄÅw jak Pulpit/Ocena)
- Filtry: `PurchasingFilterBar`, siatka 6 pÄÅl, przyciski WyczyÄ¹âºÃâ¡/Filtruj
- Tabela: proporcjonalne kolumny (Nazwa 2fr), Akcje 120px sticky, badge punktacji 90/70/50/0

## 2026-06-08 Ã¢â¬â Dostawcy: pÄ¹âaski shell moduÄ¹âu (wzorzec Zwroty)

- `SuppliersLayout`: breadcrumb Ã¢â â tytuÄ¹â Ã¢â â `TabsNav` (bez karty wokÄÅÄ¹â tabÄÅw) Ã¢â â outlet; jeden `PageLayout`
- UsuniÃâ¢to `WmsModuleLayout` (podwÄÅjna karta + ramka wokÄÅÄ¹â tabÄÅw)
- `SuppliersPage`: bez wewnÃâ¢trznego `PageLayout` i duplikatu breadcrumb/nagÄ¹âÄÅwka
- Ocena / Historia: bez `PurchasingContentArea` i nagÄ¹âÄÅwka strony w kontekÄ¹âºcie `/suppliers/*`

## 2026-06-08 Ã¢â¬â Dostawcy: Ocena i Historia w stylu Pulpitu zakupÄÅw

- KPI: `PurchasingKpiCard` + `PurchasingKpiGrid` (4 / 5 kolumn), ikony, ukÄ¹âad liczba + opis jak dashboard
- Ocena: karta Ã¢â¬Å¾Ranking dostawcÄÅwÃ¢â¬Å¥ z nagÄ¹âÄÅwkiem/opisem; tabela ze stylami dashboardu
- Historia: 5 KPI w jednym rzÃâ¢dzie, filtr dostawcy pod KPI, sekcje analityczne 2-kolumnowe, karta Ã¢â¬Å¾Ostatnie dokumentyÃ¢â¬Å¥
- `PurchasingKpiGrid`: nowa opcja `columns={5}`; obsÄ¹âuga `supplier_id` z URL na Historii

## 2026-06-08 Ã¢â¬â Lista dostawcÄÅw: nowy standard tabel

- Tabela jak Producenci/Klienci: checkbox, Nazwa (system), kolumny konfigurowalne, Akcje 120px sticky
- Konfigurator kolumn (Widoczne pola), filtry rozszerzone, licznik `Filtry (N)`
- Proporcjonalny ukÄ¹âad bez logo: Nazwa 2fr (250Ã¢â¬â500px), pozostaÄ¹âe 1fr
- API: `product_count`, filtry kraj/miasto/e-mail/telefon/waluta/MOQ/dostawa/min. produkty/zamÄÅwienia

## 2026-06-08 Ã¢â¬â Konfiguratory kolumn/filtrÄÅw: kierunkowe strzaÄ¹âki

- `FilterVisibilityModal` + `ColumnSelectorModal`: Ã¢â Â przed nazwÃâ¦ (DostÃâ¢pne), Ã¢â â po wierszu (Widoczne), ukÄ¹âad Ã¢â¹Â®Ã¢â¹Â® Ã¢â â Ã¢â â Ã¢â â
- Tooltipy: Ã¢â¬Å¾Dodaj do widocznychÃ¢â¬Å¥ / Ã¢â¬Å¾UsuÄ¹â z widocznychÃ¢â¬Å¥ Ã¢â¬â wszystkie listy korzystajÃâ¦ce ze wspÄÅlnych komponentÄÅw

## 2026-06-08 Ã¢â¬â Lista producentÄÅw: nowy standard tabel

- Tabela jak Klienci/Pola dodatkowe: checkbox, kolumny konfigurowalne (localStorage), akcje 36Äâ36
- Filtry: Tenant, Nazwa, Kraj, Status, NIP, Miasto, E-mail, Telefon, Dostawca; licznik `Filtry (N)` w nagÄ¹âÄÅwku
- Logo: max 40Äâ40, `ImageOff` bez ramek; kolumna Nazwa 3-liniowa; produkty jako link gdy >0
- API listy: filtry NIP/miasto/e-mail/telefon/dostawca + `supplier_count` w odpowiedzi

## 2026-06-08 Ã¢â¬â Akcje automatyczne: warunki multi-value + historia diff

- Warunki pÄÅl wyboru wielokrotnego: `value: string[]`, operatory Ã¢â¬Å¾jest jednym zÃ¢â¬Å¥ / Ã¢â¬Å¾nie jest jednym zÃ¢â¬Å¥, `FilterMultiSelect` w modalu warunku
- Historia zmian konfiguracji: model `{ type, field, before, after, userId, createdAt }` w localStorage; diff przy zapisie reguÄ¹ây
- Edytor: zakÄ¹âadki **Historia zmian** / **Historia wykonaÄ¹â** (`AutomationRuleHistoryPanel`); moduÄ¹â logs = tylko wykonania

## 2026-06-08 Ã¢â¬â Konfigurator zwrotÄÅw: uproszczenie UX (analiza + refaktor)

- **Statusy RMZ** Ã¢â â zwiniÃâ¢ta sekcja Ã¢â¬Å¾Workflow magazynowyÃ¢â¬Å¥ z opisem 3 pojÃâ¢Ãâ¡ (etykiety / decyzje / etapy dokumentu)
- **Decyzje:** usuniÃâ¢to Ã¢â¬Å¾Widoczna dla magazynieraÃ¢â¬Å¥ z UI (pole zachowane w danych); aktywnoÄ¹âºÃâ¡ na liÄ¹âºcie; karty pokazujÃâ¦ skutek biznesowy
- **Modal decyzji:** tylko nazwa, kategoria, Ã¢â¬Å¾Produkt wraca na magazynÃ¢â¬Å¥; bez code/sort_order
- **Integracje i API** zamiast Ã¢â¬Å¾ZaawansowaneÃ¢â¬Å¥ (RMZ, uszkodzenia, etykiety Ã¢â¬â kolejnoÄ¹âºÃâ¡)

## 2026-06-08 Ã¢â¬â Konfigurator statusÄÅw zwrotÄÅw: eksperymentalna przebudowa UX

- 4 sekcje kartami: Etykiety listy, Decyzje produktowe, Statusy RMZ (proces), Uszkodzenia
- Ukryto tabele techniczne, skrÄÅty WMS/Z-PZ, kody klas B/C na liÄ¹âºcie gÄ¹âÄÅwnej
- Pola techniczne (code, transition_key, typ workflow, sort_order) Ã¢â â Ã¢â¬Å¾Ustawienia zaawansowaneÃ¢â¬Å¥ w modalach
- RMZ workflow wÄ¹âÃâ¦czone do konfiguratora (wczeÄ¹âºniej osobna strona `/workflow-statuses`)
- Screenshoty mock: `/dev/returns-statuses-configurator-screenshots`, PNG w `returnsStatusesConfigurator/mockups/`

## 2026-06-08 Ã¢â¬â SÄ¹âowniki zwrotÄÅw: przebudowa UX

- PeÄ¹âna szerokoÄ¹âºÃâ¡ Ã¢â¬â usuniÃâ¢to panel Ã¢â¬Å¾PodglÃâ¦d formularza klientaÃ¢â¬Å¥
- Rodzaje zwrotÄÅw: bez emoji; Ä¹ÅrÄÅdÄ¹âa: logotypy marketplace (`OrderSourceLogo` + SVG w `public/assets/marketplaces/`)
- AktywnoÄ¹âºÃâ¡: checkbox inline w wierszu + auto-zapis (`persistConfig` w `ReturnsModuleSettingsPanel`)
- KolejnoÄ¹âºÃâ¡: drag & drop (`@dnd-kit`); bez pola kolejnoÄ¹âºci i sekcji Ã¢â¬Å¾ZaawansowaneÃ¢â¬Å¥ w modalach
- Modal rodzaju: tylko nazwa; modal Ä¹ÅrÄÅdÄ¹âa: marketplace + nazwa + aktywny
- `slugDictionaryCode()` generuje identyfikator systemowy automatycznie

## 2026-06-08 Ã¢â¬â SÄ¹âowniki zwrotÄÅw (UI)

- PoÄ¹âÃâ¦czono zakÄ¹âadki Ã¢â¬Å¾Rodzaje zwrotÄÅwÃ¢â¬Å¥ + Ã¢â¬Å¾Ä¹ÄrÄÅdÄ¹âaÃ¢â¬Å¥ Ã¢â â **SÄ¹âowniki zwrotÄÅw** (`/orders/returns/dictionaries`)
- UkÄ¹âad 2-kolumnowy: karty rodzajÄÅw/Ä¹ÅrÄÅdeÄ¹â + podglÃâ¦d formularza klienta (radio na Ä¹Ä½ywo)
- Edycja przez modale; legacy URL `/return-types`, `/sources` Ã¢â â przekierowanie

## 2026-06-08 Ã¢â¬â Konfigurator statusÄÅw zwrotÄÅw (UI)

- `/orders/returns/statuses`: ukÄ¹âad 2-kolumnowy (grupy statusÄÅw + podglÃâ¦d listy), tabela decyzji produktowych, modale edycji
- `/orders/returns/panel-statuses` Ã¢â â przekierowanie na `/orders/returns/statuses`
- Klasy/powody uszkodzeÄ¹â w zwiniÃâ¢tej sekcji zaawansowanej (bez zmian API)

## 2026-06-08 Ã¢â¬â Zwroty: wspÄÅlny shell breadcrumb + zakÄ¹âadki

- `ReturnsModuleLayout`: jeden `ModuleListBreadcrumb` (ÄÅºÅ¹Â  > ZamÄÅwienia > Zwroty) + `ReturnsModuleTabsStrip` dla wszystkich zakÄ¹âadek moduÄ¹âu
- UsuniÃâ¢to lokalne duplikaty z `ReturnsListPanel`, `ReturnsModuleSettingsTabPage`, `ReturnStatusesPage`, `ReturnPanelUiStatusesSettingsPage`
- SzczegÄÅÄ¹â RMZ (`/orders/returns/:id`) bez zmian Ã¢â¬â wÄ¹âasna Ä¹âºcieÄ¹Ä½ka nawigacji w widoku szczegÄÅÄ¹âu

## 2026-06-08 Ã¢â¬â Module list: Orders vs Returns UX (wiersze)

- `ReturnsListProductCell`: klikalne rozwijanie `+X poz. Ã¢âÄ½` / `ZwiÄ¹â Ã¢âË` (stan lokalny, `stopPropagation`)
- `OrderListDenseTable`: akcje jako ostatnia kolumna, `OperationalActionColumn layout="stack"` (pionowy stos 40Äâ40 jak zwroty)
- Kolumny zamÄÅwieÄ¹â: `ZamÄÅwienie | Status | Produkty | Ã¢â¬Â¦ | Akcje`; backend `items_display_lines` = peÄ¹âna lista pozycji
- Dev/screenshot: `/dev/module-list-orders-vs-returns`, PNG w `moduleList/mockups/module-list-orders-vs-returns.png`

## 2026-06-08 Ã¢â¬â Zakupy Faza 3: operacyjny pulpit + unified KPI

- `PlanningDashboard`: copy operacyjne, 5 Quick Actions (Dostawcy, OszczÃâ¢dnoÄ¹âºci), nawigacja z tabel, poprawione nazwy sekcji PZ
- `PurchasingKpiCard`: styl Ã¢â¬Å¾BalancedÃ¢â¬Å¥ (rounded-2xl, ikona po prawej, opcjonalny badge trendu)
- `PurchasingKpiGrid`: gap-6 Ã¢â¬â propagacja na wszystkie zakÄ¹âadki moduÄ¹âu

## 2026-06-08 Ã¢â¬â Zakupy Faza 2.5: cleanup UI po unifikacji

- UsuniÃâ¢to z barrel `ui/index.ts`: `purchasingFilterLabelClass`, `PurchasingSectionHeader` (komponent zostaje wewnÃâ¢trzny w `PurchasingDataPanel`)
- `PurchasingTableHeader`: usuniÃâ¢to prop `compact`; domyÄ¹âºlny padding nagÄ¹âÄÅwka `px-3 py-3`; Pulpit + PO zachowujÃâ¦ `px-6 py-4` przez wariant `children`
- Przeszukanie `modules/purchasing/**`: brak dodatkowych martwych helperÄÅw / nieuÄ¹Ä½ywanych importÄÅw do usuniÃâ¢cia

## 2026-06-08 Ã¢â¬â Zakupy Faza 2: Alerty + Generator UX

- `PurchasingAlertsPage`: usuniÃâ¢to lokalne `KpiCard`/`SectionCard` Ã¢â â `PageShell` + wspÄÅlne KPI/Filter/Table/Analysis
- `PurchasingReplenishmentPage`: chipy KPI Ã¢â â `KpiGrid`, filtry Ã¢â â `FilterBar`, tabela Ã¢â â `TableSection` + sticky `TableHeader`
- `PurchasingTableHeader`: rozszerzony o `children`, `sticky`, `className`; naprawione klasy align (bez dynamic Tailwind)
- Wszystkie strony list zakupÄÅw: inline `<thead>` Ã¢â â `PurchasingTableHeader` (oprÄÅcz PO detail / modal preview)
- Zero zmian API / logiki biznesowej

## 2026-06-08 Ã¢â¬â Zakupy Faza 1: UX Consistency Pass

- WspÄÅlne komponenty: `PurchasingKpiGrid`, `PurchasingFilterBar`, `PurchasingTableSection`, `PurchasingAnalysisSection`, `PurchasingPageShell`, `PurchasingQuickActions`
- `PurchasingKpiCard`: opcjonalna nawigacja (`to`) Ã¢â¬â klikalne KPI na Pulpicie
- Pulpit: Quick Actions Ã¢â â Generator / Alerty / PO; KPI linkujÃâ¦ do replenishment, orders, suppliers/analytics
- Ujednolicony ukÄ¹âad (Header Ã¢â â KPI Ã¢â â Filtry Ã¢â â Analiza Ã¢â â Tabela) na: Prognoza, Ocena dostawcÄÅw, Historia, Priorytety, Auto-uzupeÄ¹ânianie, OszczÃâ¢dnoÄ¹âºci
- Zero zmian API, routingu, logiki biznesowej, struktury zakÄ¹âadek

## 2026-06-08 Ã¢â¬â PZ: UX akceptacji rÄÅÄ¹Ä½nicy dostawy (bez backendu)

- Menu Ã¢â¹Å»: Ã¢â¬Å¾Zaakceptuj rÄÅÄ¹Ä½nicÃâ¢ dostawyÃ¢â¬Å¥ gdy `ordered > received` (lokalny stan sesji)
- Badge Ã¢â¬Å¾NiedobÄÅr zaakceptowanyÃ¢â¬Å¥ / Ã¢â¬Å¾RÄÅÄ¹Ä½nica zaakceptowanaÃ¢â¬Å¥ w tabeli i szczegÄÅÄ¹âach
- SzczegÄÅÄ¹ây pozycji: ZamÄÅwiono / PrzyjÃâ¢to / Brak
- Ukryta Ã¢â¬Å¾Dodaj blokadÃâ¢ sprzedaÄ¹Ä½yÃ¢â¬Å¥ przy `received <= 0`
- Zero zmian API, modelu, inventory, sales_block

## 2026-06-08 Ã¢â¬â Zakupy i planowanie: UI refactor (prototyp)

- Nowy shell: `PurchasingModuleLayout` Ã¢â¬â sticky zakÄ¹âadki w ramce, podmiot + odÄ¹âºwieÄ¹Ä½ w pasku
- WspÄÅlne komponenty UI: `modules/purchasing/ui/*` (KPI, tabele, panele, statusy)
- Widoki lazy-loaded: `PlanningDashboard`, `PurchaseGeneratorView`, Ã¢â¬Â¦ `SavingsView`
- Kontekst: `PurchasingModuleContext` + `usePurchasingTenant` (tenant z URL, global refresh)
- Pulpit przepisany na nowy design z ikonami lucide; generator/PO zaktualizowane wizualnie
- Zero zmian API / logiki biznesowej


- `backend/db/postgres_sequence_sync.py` Ã¢â¬â idempotent sync all integer PK sequences vs MAX(id)
- Tier 0 startup + `migrate_sqlite_to_postgres` post-step
- SQL: `backend/migrations/postgres_sync_all_sequences.sql`
- Fixes bundle STOCK shadow `products_pkey` after import/migration desync

## 2026-06-08 Ã¢â¬â B1 bundle STOCK EAN validation fix

- `_validate_identifier_uniqueness`: product EAN check mirrors `uq_product_tenant_ean` (includes soft-deleted rows)
- PUT/POST bundle Ã¢â â HTTP 400 `"EAN jest juÄ¹Ä½ uÄ¹Ä½ywany przez inny produkt."` zamiast 500
- Safety net: `map_product_integrity_error` w routerze (adapter + commit)
- Testy: `test_bundle_stock_identifier_validation.py`

## 2026-06-08 Ã¢â¬â P2.1A Warehouse Context UX Fix

- `useActiveWarehouseContext()` + banner Ã¢â¬Å¾Wybierz aktywny magazyn.Ã¢â¬Å¥
- Formularze tworzÃâ¦ce encje magazynowe: `warehouse_id` z aktywnego kontekstu topbar
- Raport: `memory/p2.1a-warehouse-context-ux-report.md`

## 2026-06-08 Ã¢â¬â P2.1 Multi Warehouse Hardening

- PO: `warehouse_id` wymagane w generatorze i alertach (`ERR_PO_WAREHOUSE_REQUIRED`)
- UsuniÃâ¢to auto-assign PZ (`maybe_auto_assign_single_warehouse_on_pz`) i single-WH fallback w resolve/receiving-target
- Frontend: usuniÃâ¢te hardcoded WH w reklamacjach, inwentaryzacji, import zamÄÅwieÄ¹â, regaÄ¹âach, create order
- Skrypt legacy: `backend/scripts/report_deliveries_missing_warehouse.py`
- Testy: `test_purchase_order_warehouse_hardening.py`, `test_multi_warehouse_hardening.py` (10 passed)
- Raport: `memory/p2.1-multi-warehouse-hardening-report.md`

## 2026-06-08 Ã¢â¬â P4.18 Bundle Warehouse Intelligence

- Serwisy read-only: analytics, slotting, replenishment, capacity (`backend/services/bundles/intelligence/`)
- API `/bundles/intelligence/*` Ã¢â¬â dashboard, slotting, replenishment, capacity
- Frontend: `/analytics/bundle-intelligence` (4 zakÄ¹âadki raportu)
- Testy: `test_bundle_intelligence.py` (25+)
- Raport: `bundle-warehouse-intelligence-report.md` Ã¢â¬â rekomendacje only, bez automatyzacji

## 2026-06-08 Ã¢â¬â P4.17A Bundle Scanner UX Integration

- Picking/packing/returns/bulk scan Ã¢â¬â integracja `bundleScannerIntegration` z globalnym skanerem WMS
- Komponenty: `BundlePickingScanCard`, `BundleVerifiedBadge`, `BundleTraceabilityStrip`, RK/RMZ/reklamacje
- Ekran `WmsBundleBulkScanPage` (`/wms/picking/bundle-bulk-scan`)
- Testy frontend: 22 w `bundleScanFlow.test.ts`
- Raport: `bundle-scanner-ux-report.md` Ã¢â¬â **READY FOR P4.18**

## 2026-06-08 Ã¢â¬â P4.17 Bundle Logistic Unit & EAN Automation

- `resolve_bundle_barcode()` Ã¢â¬â EAN produktu/bundle, SKU, kod wewnÃâ¢trzny
- Scan orchestration: pick/pack/returns/complaints (ON_DEMAND vs STOCK)
- Model `BundleLogisticUnit` + migracja `bundle_logistic_units`
- API `/bundles/logistics/*`; bulk STOCK scan; RK view; wave aggregation helpers
- Frontend: `bundlesLogisticsApi.ts`
- Testy: 42 w `test_bundle_logistics.py`; pakiet bundle 178 passed
- Raport: `bundle-logistic-unit-report.md` Ã¢â¬â **READY FOR P4.18**

## 2026-06-08 Ã¢â¬â P4.16 Bundle Traceability & Lot Tracking

- Model `order_line_bundle_component_lots` + migracja schema
- `bundle_lot_snapshot_service` Ã¢â¬â persist po finalize pick / WZ issue
- Traceability API AÃ¢â¬âD, recall report, lot-trace + bundle-lots reports
- Rozszerzenie drzew zwrotÄÅw/reklamacji o `lots[]`; UI partii w RMZ panelu
- Testy: 25 w `test_bundle_traceability.py`; raport `bundle-traceability-report.md`

## 2026-06-08 Ã¢â¬â P4.15B Bundle Operational UX Layer

- Projekcje UX: `bundle_operational_ux_service`, rozszerzone `picking_lines()` metadata
- Picking API: `bundle_breakdown`, `order_bundle_trees`, bundle fields on order rows
- Packing API: `bundle_trees` + line bundle fields
- UI: drzewo bundle w pickingu i pakowaniu; breakdown SKU multi-order
- Single/multi filter + cart volume fix (operational lines only)
- Testy: `test_bundle_operational_ux.py`; raport `bundle-operational-ux-report.md` Ã¢â¬â **READY FOR TRACEABILITY**

## 2026-06-08 Ã¢â¬â P4.15A Bundle operational execution review

- PrzeglÃâ¦d WMS: picking, EAN, regaÄ¹ây, noÄ¹âºniki, pakowanie, cross-dock, multi-order/fala
- Werdykt: **CHANGES REQUIRED** Ã¢â¬â raport `bundle-operational-readiness-report.md`
- Proponowany P4.15B (UX pick/pack + agregacja) przed P4.16 lot snapshot
- Bez implementacji lot snapshot / recall / EAN bundle

## 2026-06-08 Ã¢â¬â P4.15 Bundle returns, complaints & corrections

- Model `return_line_bundle_components`; RMZ `bundle_return_scenario` / `bundle_return_status`
- Refund engine ze snapshotu; PZ per skÄ¹âadnik (ON_DEMAND) / SKU (STOCK)
- API: `/orders/{id}/bundle-return-tree`, PUT bundle-components, raporty
- UI: `BundleReturnLinePanel` (checkboxy skÄ¹âadnikÄÅw, preview refundu)
- Testy: 38 w `test_bundle_returns_complaints.py`; raport `bundle-returns-complaints-report.md`
- Poza scope: EAN bundle scan, lot snapshot, recall, OrderCancellationService

## 2026-06-08 Ã¢â¬â P4.14A Bundle warehouse documents layer

- `warehouse_document_lines()` / `warehouse_receipt_lines()` Ã¢â¬â projekcje COMMERCIAL vs WAREHOUSE
- `bundle_warehouse_document_service` Ã¢â¬â SSOT linii dokumentÄÅw dla zamÄÅwieÄ¹â z bundle
- Integracja: `stock_document_service`, walidacja WZ w `direct_sale/wz_service`
- Testy: 20 + raport `bundle-warehouse-documents-report.md`

## 2026-06-08 Ã¢â¬â P4.14 BundleLineResolver (SSOT)

- Pakiet `backend/services/bundles/`: `BundleLineContext`, `BundleLineResolver`, projekcje (commercial, picking, reservation, warehouse_issue, margin, return, complaint)
- Snapshot: `order_id`, `unit_price_net_snapshot` na `order_line_bundle_components` + migracja P414
- MarÄ¹Ä½a OMS order read Ã¢â â `margin_from_context()` z resolvera
- Eksplozja ON_DEMAND wzbogaca snapshot o ceny skÄ¹âadnikÄÅw
- Testy: `test_bundle_line_resolver.py` (23); raport: `bundle-line-resolver-report.md`
- Bez: RMZ/reklamacje/korekty bundle UI, nowych endpointÄÅw HTTP

## 2026-06-08 Ã¢â¬â P4.13B Bundle P0 stabilization (preÃ¢â¬âBundleLineResolver)

- **SSOT:** `bundle_order_item_ops.sqlalchemy_operational_picking_order_item_clause()` Ã¢â¬â zastÃâ¦pienie lokalnych `is_bundle_parent=False` w falach, dashboardach, konsolidacji, symulacji, routingu, recovery
- **STOCK_PRODUCTION:** parent traktowany jak normalny SKU; **ON_DEMAND:** pick/braki tylko na skÄ¹âadnikach
- **Footprint:** `order_footprint_service` liczy wyÄ¹âÃâ¦cznie linie operacyjne
- **Testy:** `test_bundle_p0_stabilization.py` (14 passed z architekturÃâ¦)
- **Docs:** `bundle-stabilization-report.md`, `bundle-order-cancellation-analysis.md`, `bundle-traceability-audit.md`
- **Werdykt:** READY FOR BUNDLELINERESOLVER

## 2026-06-08 Ã¢â¬â User warehouse assignments + active warehouse context

- **Model:** `user_warehouse_assignments` (backfill z `app_user_warehouses`); `user_wms_profiles.active_warehouse_id`
- **API:** `GET /auth/me/warehouse-context`, `PUT /auth/me/active-warehouse`; login ustawia domyÄ¹âºlny magazyn
- **Frontend:** `WarehouseContext` z kontekstu serwera; globalny przeÄ¹âÃâ¦cznik Ã¢â¬Å¾Magazyn:Ã¢â¬Å¥ w headerze
- **Backward compat:** brak przypisaÄ¹â Ã¢â â dostÃâ¢p do wszystkich magazynÄÅw (jak dotÃâ¦d); 1 magazyn Ã¢â â bez selektora

## 2026-06-08 Ã¢â¬â Offer Stock Pools MVP (Availability Sources)

- **Model:** `offer_stock_pools`, `offer_stock_pool_warehouses`, `product_sales_offers.stock_pool_id`
- **Serwis:** `offer_stock_availability_service.offer_pool_available_qty` Ã¢â¬â suma `offer_available_qty` po magazynach puli (filter `participates_in_network_stock`)
- **API:** CRUD pul `/offer-stock-pools`; oferty: `stock_pool_id` w PATCH, `available_qty` z puli
- **UI:** Ustawienia Ã¢â â SprzedaÄ¹Ä½ Ã¢â â Pule stanÄÅw; dropdown Ã¢â¬Å¾Ä¹ÄrÄÅdÄ¹âo stanuÃ¢â¬Å¥ w ofercie produktu
- **Testy:** Pool A (W+P)=50, B (G)=40, C (all)=90

## 2026-06-08 Ã¢â¬â Z-PZ UI komplet + numeracja globalna bez zer

- **Numeracja:** domyÄ¹âºlne `padding_length=0` (model, schema, API); repair serii WAREHOUSE; RMZ bez `:05d`
- **Kafelek aktywnego Z-PZ:** tylko `/wms/returns`, max-w-sm, RMZ/pozycje/sztuki/data + Zamknij
- **SzczegÄÅÄ¹ây Z-PZ:** peÄ¹âny ekran `/documents/warehouse/z-pz?id=` (Sellasist: nagÄ¹âÄÅwek, podsumowanie, tabela + RMZ)
- **Menu dokumentÄÅw:** dedupe po etykiecie + stock_type w katalogu API (fix duplikat PZ)

## 2026-06-08 Ã¢â¬â Numeracja magazynowa bez paddingu + widok Z-PZ (Sellasist)

- **Numeracja:** wszystkie serie WAREHOUSE (PZ, MM, WZ, RW, PW, ZD, Z-PZ) + RMZ bez wiodÃâ¦cych zer; migracja `padding_length=0`; `_next_rmz_number` Ã¢â â `RMZ-2026-1`
- **API read Z-PZ:** pozycje z `return_decision_label` (A/B/C), `source_rmz_id`, `source_rmz_number`; nagÄ¹âÄÅwek `closed_at` przy CLOSED
- **Frontend:** dedykowany `WarehouseZPzDocumentDetail` w modalu dokumentÄÅw magazynowych (nagÄ¹âÄÅwek + tabela pozycji + link do RMZ)

## 2026-06-08 Ã¢â¬â Z-PZ poprawki: panel, numeracja, lista, auto-druk

- **Panel WMS:** kompaktowy kafelek (numer, AKTYWNY, pozycje/sztuki, data, Zamknij)
- **Ustawienia WMS Ã¢â â Zwroty:** checkbox auto-druk + wybÄÅr szablonu etykiety; `POST /labels/print/z-pz`
- **Numeracja:** brak paddingu domyÄ¹âºlnie (`Z-PZ-2026-1`); seria Z_PZ `padding_length=0`
- **Dokumenty magazynowe:** `Z_PZ` w katalogu/menu (dedupe segmentÄÅw, kolejnoÄ¹âºÃâ¡ MMÃ¢â âZ-PZ); lista OTWARTY/ZAMKNIÃÂTY

## 2026-06-08 Ã¢â¬â Z-PZ zbiorczy: OPEN do rÃâ¢cznego zamkniÃâ¢cia (noÄ¹âºnik zwrotÄÅw)

- **Backend:** status `OPEN` / `CLOSED`; wyszukiwanie aktywnego Z-PZ bez filtra daty (`collective_z_pz_service.py`)
- **API:** `GET/POST /api/wms/returns/active-z-pz` (+ `/close`) Ã¢â¬â zamkniÃâ¢cie Ã¢â â `relocation_status=OPEN`, kolejka rozlokowania
- **Migracja:** `draft`Ã¢â â`OPEN` dla starych zbiorczych; indeks `ux_stock_documents_collective_z_pz_open`
- **Frontend:** panel Ã¢â¬Å¾Aktywny dokument zwrotÄÅwÃ¢â¬Å¥ na `/wms/returns`; etykieta druku (QR + kod kreskowy)
- **Seria dokumentÄÅw:** opis checkboxa Ã¢â¬Å¾zbiorczy Z-PZÃ¢â¬Å¥ Ã¢â¬â operator zamyka noÄ¹âºnik, nie dzieÄ¹â kalendarzowy

## 2026-06-08 Ã¢â¬â Z-PZ schema sync (fix 500 orders/stock-documents)

- **`backend/db/z_pz_schema.py`**: `ensure_z_pz_schema()` Ã¢â¬â jawna, idempotentna migracja kolumn Z-PZ (PG + SQLite)
- Startup: `require_z_pz_schema_or_raise()` przed tier0/API; log `[Z_PZ_SCHEMA] Ã¢â¬Â¦=OK|MISSING`
- `main.py`: rozdzielone try/except migracji stock_documents; Z-PZ przed `migrate_wms_pz_workflow_statuses`
- Tier0 SQL probes: kolumny Z-PZ w `stock_documents` / `stock_document_items`
- Test: `backend/tests/returns/test_z_pz_schema_startup.py`

## 2026-06-08 Ã¢â¬â WMS zwroty (RMZ/RMA): transakcyjny commit + upload zdjÃâ¢Ãâ¡

- **Upload 422:** axios usuwa `Content-Type` dla `FormData`; log `[returns.damage.upload]`
- **Backend:** `commit_workflow=false` (domyÄ¹âºlnie) na `split-process` / `process` Ã¢â¬â bez sync OMS; nowy `POST Ã¢â¬Â¦/commit-wms`
- **Frontend:** decyzje lokalne bez natychmiastowego API; **ZAPISZ** gdy wszystkie linie rozstrzygniÃâ¢te; confirm przy DAMAGED bez zdjÃâ¢Ãâ¡; upload fail nie blokuje decyzji

## 2026-06-08 Ã¢â¬â Snapshot operacji magazynowych: fix 500 po zwrocie RMZ

- **Przyczyna:** alert rozlokowania uÄ¹Ä½ywaÄ¹â `category="Rozlokowanie PZ"` poza enumem Pydantic Ã¢â â 500 gdy po RMZ/PZ_RT pojawiaÄ¹â siÃâ¢ towar do rozlokowania
- **Fix:** kategoria `"Rozlokowanie"` + `_normalize_alert_category()` jako fallback
- **OdpornoÄ¹âºÃâ¡:** kaÄ¹Ä½da sekcja snapshotu w `try/except` z `[warehouse.snapshot] section=Ã¢â¬Â¦`; endpoint zwraca pusty snapshot zamiast 500 przy total failure
- **Frontend:** `getWarehouseOperationsSnapshot` zwraca `null` zamiast rzucaÃâ¡ Ã¢â¬â nie blokuje workflow zwrotÄÅw

## 2026-06-08 Ã¢â¬â PodglÃâ¦d lokalizacji: fix pustej mapy + wiÃâ¢kszy shelf view

- **Mapa:** jawna wysokoÄ¹âºÃâ¡ kontenera (`min(52vh,520px)`), `useDesignerCanvas(null)`, auto-fit na aktywny regaÄ¹â Ã¢â¬â naprawia pusty lewy panel (flex `h-full` = 0px)
- **RegaÄ¹â:** `RackSideViewGrid` `embeddedPreview` Ã¢â¬â wiÃâ¢ksze sloty, etykiety, subtelny highlight; dane zajÃâ¢toÄ¹âºci dla aktywnego slota
- **UI:** biaÄ¹âe tÄ¹âa zamiast szarych placeholderÄÅw w modalu i liÄ¹âºcie produktÄÅw

## 2026-06-08 Ã¢â¬â PodglÃâ¦d lokalizacji: powrÄÅt do design systemu + projektant magazynu

- **UsuniÃâ¢to** ciemny/neonowy custom map (digital twin, cyberpunk HUD)
- **Mapa:** `WarehouseLayoutRenderer` (read) + ten sam layout co projektant magazynu (`GET /warehouse/layout`)
- **RegaÄ¹â:** `RackSideViewGrid` Ã¢â¬â nomenklatura systemowa (`A1-A-1` via `resolveWarehouseLocation`)
- **Modal:** jasny enterprise (white/slate), spÄÅjny z `ProductLocationMapModal`

## 2026-06-08 Ã¢â¬â PodglÃâ¦d lokalizacji: industrial digital twin (v2) Ã¢â¬â **COOFNIÃÂTE**

- Ciemna posadzka hali (tekstura, vignette, siatka techniczna) zamiast szarego wireframe
- RegaÄ¹ây: metalowe sÄ¹âupy, segmenty, belki, cieÄ¹â na podÄ¹âodze Ã¢â¬â nie kafelki/buttony
- Alejki wyliczane z pozycji regaÄ¹âÄÅw: pasy ruchu, strzaÄ¹âki, numeracja A-/V-
- Strefy: subtelne wash + etykiety (Kompletacja, PrzyjÃâ¢cie, SkÄ¹âadowanieÃ¢â¬Â¦)
- Modal = warehouse navigation center (dark HUD); regaÄ¹â front z konstrukcjÃâ¦ i glow TU

## 2026-06-08 Ã¢â¬â PodglÃâ¦d lokalizacji WMS: layout magazyn-first

- Modal: **72% plan magazynu** (mapa + regaÄ¹â fizyczny), **28% info + zawartoÄ¹âºÃâ¡**
- UsuniÃâ¢to mini-mapkÃâ¢ z kolorowymi kwadratami; plan z alejkami, strefami, skalÃâ¦, cieniami
- RegaÄ¹â: konstrukcja pionowa, poziomy, sloty, glow + badge TU
- Panel info skrÄÅcony (wiÃâ¢cej pod rozwijanym linkiem); karty produktÄÅw wiÃâ¢ksze

## 2026-06-08 Ã¢â¬â NoÄ¹âºniki: wizualny podglÃâ¦d lokalizacji (LocationPreviewModal)

- Klik badge lokalizacji Ã¢â â modal z mapÃâ¦ regaÄ¹âÄÅw, widokiem pionowym regaÄ¹âu, zawartoÄ¹âºciÃâ¦ noÄ¹âºnika
- API: `GET /api/wms/locations/{id}/visual-context`
- Komponenty: `LocationPreviewModal`, `LocationPreviewWarehouseGrid`, `LocationPreviewRackView`

## 2026-06-08 Ã¢â¬â Klienci CRM: typ / kanaÄ¹â / flagi (architektura ERP)

- **`customer_type`:** tylko `retail`, `company`, `wholesale` (usuniÃâ¢to `marketplace`, `b2b` z enum)
- **Nowe `sales_channel`:** store, ecommerce, allegro, amazon, phone, b2b_portal, marketplace_other
- **`flags_json`:** + `requires_invoice`, `marketplace` (VIP/blokada/priorytet osobno)
- **Migracja idempotentna:** `b2b`Ã¢â â`wholesale`+`b2b_portal`, `marketplace`Ã¢â â`retail`+flag+`marketplace_other`
- **Frontend:** select typu (3 opcje), kanaÄ¹â sprzedaÄ¹Ä½y, badge VIP/Zablokowany/Marketplace/Priorytet, filtry i kolumny listy

## 2026-06-08 Ã¢â¬â Schema sync: NOT NULL ADD COLUMN na PostgreSQL (customers CRM)

- **Przyczyna:** reconcile robiÄ¹â `ADD COLUMN Ã¢â¬Â¦ NOT NULL` na tabeli z danymi Ã¢â â `NotNullViolation` na Railway
- **Fix (`schema_introspection.py`):** nullable ADD Ã¢â â `UPDATE` backfill (`customer_type=retail`, `customer_status=active`) Ã¢â â `ALTER COLUMN SET NOT NULL`
- **Guards:** indeksy/FK pomijane gdy kolumna indeksu nie istnieje w DB; `failed_columns` przy bÄ¹âÃâ¢dzie ADD
- **Testy:** `backend/tests/test_customer_crm_schema_sync.py`

## 2026-06-08 Ã¢â¬â Klienci + zamÄÅwienia: 500 (schema CRM + logging)

- **Przyczyna:** brak kolumn CRM na `customers` w PostgreSQL Ã¢â â `OperationalError: no such column: customers.customer_type`
- **Order detail:** ten sam bÄ¹âÃâ¦d przy `db.query(Customer)` gdy zamÄÅwienie ma `customer_id`
- **Fix:** `ensure_customer_crm_schema` + `verify_customer_schema_columns` w **blocking** `_bootstrap_tier0_platform_schema` (przed HTTP)
- **Logging:** `[customers.list] failed`, `[orders.detail] failed`, `[orders.detail] customer brief failed`
- **Safe fallback:** agregaty `customer_sales_stats` / `summary_out` Ã¢â¬â lista nie pada gdy analytics niedostÃâ¢pne
- **Order customer brief:** try/except Ã¢â¬â zamÄÅwienie zwraca 200 bez `customer` gdy query klienta pada (z logiem)

## 2026-06-08 Ã¢â¬â Klienci: naprawa GET /api/customers (500)
- **Przyczyna:** ORM miaÄ¹â kolumny CRM (`customer_type`, `customer_status`, `flags_json`, Ã¢â¬Â¦) bez migracji DB Ã¢â â `OperationalError: no such column`
- **`backend/db/customer_schema.py`:** `ensure_customer_crm_schema()` Ã¢â¬â ADD COLUMN + CREATE TABLE (`customer_notes`, `customer_crm_events`) via `ensure_model_schema_sync`
- **`main.py`:** sync przy imporcie + w `upgrade_schema_background`
- **`customers.py`:** `logger.exception("[customers.list] failed tenant_id=%s")`
- Frontend: skeleton Ä¹âadowania + retry przy bÄ¹âÃâ¢dzie listy
- Testy: `backend/tests/test_customers_list_api.py`

## 2026-06-08 Ã¢â¬â WÄÅzki / noÄ¹âºniki: UI operacyjny WMS (frontend only)
- WÄÅzki standardowe (`BulkCartEditor`): usuniÃâ¢te taby, jeden widok (dane, wymiary, pojemnoÄ¹âºÃâ¡, operacje, zdjÃâ¢cie)
- Tokeny moduÄ¹âu: wiÃâ¢ksze fonty (15Ã¢â¬â16px), badge, koszyki w edytorze wÄÅzkÄÅw z koszykami
- NoÄ¹âºniki: `CarrierIdentity` (kod + nazwa + opis, bez duplikatu barcode), `CarrierContentPreview` (popover zawartoÄ¹âºci), `CarrierLocationLink` (badge lokalizacji)
- Lista noÄ¹âºnikÄÅw: tabela desktop + kafle mobile; statusy PL w modalach; prefiksy PAL/BOX/BIN z kolorem i typem
- SzczegÄÅÄ¹ây noÄ¹âºnika: kompaktowy header operacyjny, produkty + historia + ostatnia operacja bez tabÄÅw ProductLike
- Etykiety: PUTAWAY Ã¢â â Ã¢â¬Å¾OdkÄ¹âadanieÃ¢â¬Å¥, ARCHIVED Ã¢â â Ã¢â¬Å¾ArchiwalnyÃ¢â¬Å¥

## 2026-06-08 Ã¢â¬â Klienci: CRM profile (typ, status, flagi, VIP/blokada, agregaty)
- Model `customers`: `customer_type`, `customer_status`, `flags_json`, pola hurtowe (limit, termin, opiekun)
- Tabela `customer_crm_events` Ã¢â¬â timeline (VIP, blokada, zmiana typu/statusu)
- API: `PATCH /customers/{id}/crm`, `POST /customers/{id}/crm/actions` (mark_vip, block, Ã¢â¬Â¦)
- Lista klientÄÅw: typ, status, flagi, `order_count`, `total_gross` (batch stats)
- Detail: `summary` z KPI; self-heal agregatÄÅw gdy `order_count=0` ale sÃâ¦ zamÄÅwienia
- Stats: pomijanie anulowanych/draftÄÅw; refresh po complete direct sale
- Blokada: guard w `set_session_customer` Ã¢â â 403 Ã¢â¬Å¾Klient jest zablokowanyÃ¢â¬Å¥
- Frontend: header CRM (back inline, badge VIP/Blokada, tylko menu Ã¢â¬Å¾WiÃâ¢cejÃ¢â¬Å¥), summary strip, picker z KPI, form hurtowy

## 2026-06-08 Ã¢â¬â Direct sales: naprawa DELETE pozycji koszyka (500)
- Nowy `line_delete_service.py`: lookup linii z DB, bezpieczne zwolnienie rezerwacji, activity event non-blocking
- Endpoint `DELETE .../lines/{line_id}`: commit Ã¢â â `get_session` (fresh lines) Ã¢â â `_session_to_read`; peÄ¹âny `logger.exception` przy 500
- `_session_to_read` / `enrich_session_lines`: pomijanie linii bez `product_id`, per-line try/except na financials
- PATCH qty=0: ten sam reload sesji po commit
- Frontend: `removingLineId` (loading tylko na usuwanej pozycji), toast przy bÄ¹âÃâ¢dzie
- Testy: `backend/tests/test_direct_sale_line_delete.py` (5 cases)

## 2026-06-08 Ã¢â¬â Klienci: CRM-lite etap 1Ã¢â¬â2 (order-link, aktywnoÄ¹âºÃâ¡, notatki)
- Backend: `customer_order_link_service` Ã¢â¬â podglÃâ¦d/utworzenie/poÄ¹âÃâ¦czenie klienta z zamÄÅwienia + wykrywanie duplikatÄÅw (email, telefon, NIP, nazwa)
- Endpointy: `GET/POST /api/customers/order-link/{preview,create,link}`
- Backend: `customer_notes`, `customer_activity_service`, `customer_note_service` Ã¢â¬â timeline (zamÄÅwienia + notatki), CRUD notatek (pin, soft delete)
- Endpointy: `/api/customers/{id}/activity`, `/api/customers/{id}/notes`
- Historia zakupÄÅw KPI: obrÄÅt 30/90/365 dni, najwiÃâ¢ksze zamÄÅwienie (`purchase_history_service`)
- Frontend: `OrderCustomerLinkPanel` w `OrderDetailPage` (badge Ã¢â¬Å¾Klient niezapisanyÃ¢â¬Å¥), `getCustomerDisplayName` na linku klienta
- Frontend: zakÄ¹âadka Ã¢â¬Å¾AktywnoÄ¹âºÃâ¡Ã¢â¬Å¥, `CustomerNotesSection`, `CustomerQuickActions`, rozszerzone KPI historii
- **NastÃâ¢pne etapy:** tagi/segmenty, merge duplikatÄÅw, wiele adresÄÅw, peÄ¹âniejszy timeline (FV, zwroty, GUS)

## 2026-06-08 Ã¢â¬â Klienci: spÄÅjna nazwa + direct sales refresh
- `getCustomerDisplayName()` Ã¢â¬â lista, detail, historia, direct sales (FV)
- Direct sales: peÄ¹âna sesja z `set-customer`, eager fetch klienta, auto-uzupeÄ¹ânianie formularza FV
- Naprawa UI: przypisany klient widoczny od razu (bez bÄ¹âÃâ¢dnego `customer_is_retail` w stanie)

## 2026-06-08 Ã¢â¬â Schema reconciliation: startup crash fix
- `log_schema_tier()` Ã¢â¬â kwargs-safe (`columns_added`, `indexes_added`, `foreign_keys_added`, Ã¢â¬Â¦)
- Reconcile fazowy: tabele Ã¢â â kolumny Ã¢â â indeksy Ã¢â â FK (ostatni etap)
- Orphan FK: NULL przed ADD CONSTRAINT (np. `direct_sale_sessions.customer_id`)
- Topological sort fallback przy cyklach FK (zamiast `sorted_tables` crash/warn)

## 2026-06-08 Ã¢â¬â Klienci: utwardzenie GUS/BIR + VAT MF/VIES
- Backend: `customers_gus.py`, cache PostgreSQL `gus_lookup_cache` (TTL 24h), timeout/retry/circuit breaker BIR
- VAT badge tylko z MF (`rejestr_vat`) i VIES Ã¢â¬â rozdzielone od danych firmy GUS
- Normalizacja adresÄÅw (title case PL, kod pocztowy, ulica/nr)
- Frontend: `customersGusApi.ts`, brak auto-fetch przy wejÄ¹âºciu na klienta; debounce 900 ms + przycisk Ã¢â¬Å¾Pobierz z GUSÃ¢â¬Å¥
- Admin: Ã¢â¬Å¾Nadpisz istniejÃâ¦ceÃ¢â¬Å¥ z potwierdzeniem; panel: `fetched_label`, Ä¹ÅrÄÅdÄ¹âo danych
- Logi strukturalne: nip, tenant_id, cache hit/miss, czas, source (bez peÄ¹ânych danych firmy)

## 2026-06-08 Ã¢â¬â Klienci: naprawa routerÄÅw + layout
- Purchase history + GUS scalone w `customers_router` (jeden mount `/api/customers`)
- GUS: `POST /api/customers/gus-lookup` (usuniÃâ¢to `/clients`)
- Frontend: `CustomerDetailPageShell` (PageLayout + PageHeader jak lista klientÄÅw)
- KPI historii: kompaktowy skeleton + empty state bez duÄ¹Ä½ych pustych kart

## 2026-06-08 Ã¢â¬â Klienci: integracja GUS (NIP)
- Backend: `POST /api/customers/gus-lookup` Ã¢â¬â proxy BIR1 GUS + MF VAT, cache 24h
- Frontend: pole NIP z Ã¢â¬Å¾Pobierz z GUSÃ¢â¬Å¥, debounce 900 ms, panel podglÃâ¦du, Ã¢â¬Å¾UzupeÄ¹ânij daneÃ¢â¬Å¥ (tylko puste pola)
- Badge: Zweryfikowano w GUS, Aktywny VAT, VAT UE
- Env: `GUS_API_KEY`, opcjonalnie `GUS_USE_TEST=true` (Ä¹âºrodowisko testowe GUS)

## 2026-06-08 Ã¢â¬â Klienci: historia zakupÄÅw (CRM dashboard)
- Backend: tabele `customer_sales_stats`, `customer_product_stats`; lazy refresh (TTL 60 min)
- Endpointy: `/customers/{id}/purchase-history/{summary,documents,top-products,trend}` + filtry/paginacja
- Frontend: tab Ã¢â¬Å¾Historia zakupÄÅwÃ¢â¬Å¥ (`/customers/:id/historia-zakupow`), KPI AppStatCard, filtry AppFilterPanel, tabela dokumentÄÅw, top produkty, wykres Recharts

## 2026-06-08 Ã¢â¬â PostgreSQL schema reconciliation (ORM startup sync)
- `schema_reconciliation.py`: peÄ¹âna rekonsyliacja ORM vs DB (CREATE TABLE, ADD COLUMN, INDEX, FK)
- `sync_model_schema` / `ensure_model_schema_sync`: indeksy IF NOT EXISTS + brakujÃâ¦ce FK
- Tier 0 bootstrap: `reconcile_startup_schema` na PostgreSQL i SQLite (nie tylko create_all)
- Tier 1 background: drugi przebieg reconcile po ensure_* operacyjnych
- `ensure_workforce_operational_tables` / `ensure_workforce_user_groups_schema`: ORM sync (naprawa `user_activity_logs.warehouse_id` na PG)
- main.py: workforce ensures w allowliÄ¹âºcie PostgreSQL

## 2026-06-08 Ã¢â¬â WÄÅzki z koszykami: uproszczony UX edytora
- CartEditor: usuniÃâ¢to taby Podstawowe/PojemnoÄ¹âºÃâ¡/PowiÃâ¦zania; meta w headerze + zwijane info techniczne
- CartSectionGrid: karty koszykÄÅw bez szarych teÄ¹â; edycja w drawerze bocznym
- CartRowAddToolbar: kompaktowy pasek dodawania caÄ¹âego rzÃâ¢du
- ProductLikePageLayout: `hideTabs`, `hideModeLabel` dla widokÄÅw jednoekranowych
- Logika API/zapisu bez zmian (capacity_mode nadal z payloadu istniejÃâ¦cego wÄÅzka)

## 2026-06-08 Ã¢â¬â Dokumenty magazynowe: nowy widok szczegÄÅÄ¹âu (PZ/PW/RW/WZ/ZW/ZD)
- Wydzielono `WarehouseDocumentLinesSection`, `warehouseDocumentLineUi`, `WarehouseDocumentDetailFooter`
- Tabela pozycji: lekkie miniatury, skrÄÅty typu (LP/KART/MAT), badge statusÄÅw i LocationBadge
- Kolumny VAT %, cena/wartoÄ¹âºÃâ¡ brutto dla wszystkich typÄÅw dokumentÄÅw
- Podsumowanie: siatka AppStatCard (pozycje, iloÄ¹âºci, rÄÅÄ¹Ä½nica, netto/VAT/brutto)
- Footer: hierarchy z primary Ã¢â¬Å¾ZaksiÃâ¢gujÃ¢â¬Å¥, secondary akcje po lewej
- DocumentTypeBadge w nagÄ¹âÄÅwku i karcie dokumentu (PW/ZD/ZW w palecie)

## 2026-06-08 Ã¢â¬â Struktura magazynu: layout jak karta produktu
- `modules/warehouse-structure/`: etykiety PL, CapacityModeFields, WarehouseEntityPageShell
- BulkCartEditor + CartEditor Ã¢â â ProductLikePageLayout (taby: Podstawowe, PojemnoÄ¹âºÃâ¡/Sekcje, Operacje, PowiÃâ¦zania)
- CartSectionGrid: wizualny ukÄ¹âad sekcji moduÄ¹âowych
- OrderProductPreviewModal: biaÄ¹ây panel, linki do zamÄÅwienia/produktu
- WarehouseCarrierDetailPage Ã¢â â ProductLikePageLayout (Podstawowe, ZawartoÄ¹âºÃâ¡, Historia)
- CarrierStatusBadge: polskie statusy (Aktywny zamiast ACTIVE)

## 2026-06-08 Ã¢â¬â WÄÅzki / RegaÄ¹ây / Strefy / NoÄ¹âºniki: UI spÄÅjne z ERP
- `CartsModuleLayout`: jedna biaÄ¹âa powierzchnia + systemowe taby (jak Dokumenty)
- `modules/carts/cartsModuleTokens.ts`: dense inputs/buttons/tables
- Listy wÄÅzkÄÅw: AppStatCard KPI, CartsListPageHeader, kompaktowe grupy
- Edytory bulk/multi: formularze ERP (bez rounded-2xl / gradientÄÅw)
- RegaÄ¹ây/strefy: AppSection-style konfiguratory + AppEmptyState
- NoÄ¹âºniki: tabela dokumentÄÅw, prostsze badge, CarrierGroupCard dopasowany do grup wÄÅzkÄÅw

## 2026-06-08 Ã¢â¬â ProductLikePageLayout: wspÄÅlny shell produkt + zestaw
- `components/catalog/`: ProductLikePageLayout, CatalogEntityPageShell, ProductLikeSection, tokens
- ProductEditModal + BundleEditModal na tym samym layoutcie (header, taby, rail, footer)
- ProductNewPage/EditPage + BundleNewPage/EditPage Ã¢â â CatalogEntityPageShell

## 2026-06-08 Ã¢â¬â Zestawy: peÄ¹âna strona edycji + design system app-shell
- Trasy: `/bundles/new`, `/bundles/:id/edit` (bez modala tworzenia/edycji)
- `BundleEditModal variant="page"`: taby Podstawowe/Produkty/Magazyn/Historia/Logi/PowiÃâ¦zania
- `components/app-shell/`: AppFilterPanel, AppPageHeader, AppEmptyState, AppSection, AppStatCard, AppToolbar
- Filtry: akcje Filtruj/WyczyÄ¹âºÃâ¡ zawsze na dole panelu (ModuleListFiltersCard Ã¢â â AppFilterPanel)

## 2026-06-08 Ã¢â¬â Czas pracy: telemetria operacyjna caÄ¹âego systemu
- `track_user_activity()` + `session_id` / `warehouse_id` na `user_activity_logs` (gap 15 min)
- Middleware API: automatyczne logowanie mutacji + sensownych GET (mapowanie moduÄ¹âÄÅw)
- Analytics: heatmapa godzin, top moduÄ¹ây, aktywnoÄ¹âºÃâ¡ dzienna, sesje, timeline, throughput
- API: `GET /workforce/analytics`; UI: przebudowany dashboard + strona aktywnoÄ¹âºci
- Testy: `test_workforce_activity.py`

## 2026-06-08 Ã¢â¬â Inwentaryzacja ERP: WMS shell polish
- Layout: breadcrumb Magazyn/Inwentaryzacja, + zamiast duÄ¹Ä½ego CTA, bez subtitle
- Tabela przebiegu: bez duplikatÄÅw Oczek./Policz./RÄÅÄ¹Ä½n., kolumny Operator/Czas, dense rows
- theme.ts: gÃâ¢stsze paddingi, lÄ¹Ä½ejsze bordery, slate tabs

- `resolve_line_unit_cost_net`: obsÄ¹âuga `line=None` (orphan RW), fallback ceny z kartoteki
- `_line_target_quantity`: uÄ¹Ä½ywa zaakceptowanego wyniku supervisora zamiast pomijaÃâ¡ liniÃâ¢
- `reconcile_line_counted_from_operators`: nie zeruje qty po rÃâ¢cznym rozwiÃâ¦zaniu konfliktu
- Testy: `test_posting_preview.py` (6 scenariuszy)
- UI: przycisk Ã¢â¬Å¾WyÄ¹âºlij do zatwierdzeniaÃ¢â¬Å¥ Ã¢â â Ã¢â¬Å¾ZatwierdÄ¹ÅÃ¢â¬Å¥

- Backend conflicts API: `ean`, `product_image_url` w `_build_conflict_item`
- Panel: karty zamiast tabeli ERP; miniatura 56Äâ56, EAN, SKU; operator/iloÄ¹âºÃâ¡/akcje z hierarchiÃâ¦
- Status vs akcja: badge Ã¢â¬Å¾Oczekuje ponownego liczeniaÃ¢â¬Å¥; button Ã¢â¬Å¾ZleÃâ¡ ponowne liczenieÃ¢â¬Å¥ (1Äâ na konflikt, tylko gdy `conflict_open`)

- `wmsLayoutTokens`: `WMS_TERMINAL_SHELL`, `WMS_TERMINAL_INNER`, `WMS_TASK_GRID`, `WMS_TASK_CARD`
- Braki: `WmsOrderIssuesHub` Ã¢â¬â left-aligned, grid 1/2/3, `BrakiOrderIssueCard` (accent strip, badges, CTA)
- Produkcja: layout + Collecting/Execute/Putaway Ã¢â¬â grid kolejki, kompaktowy `WmsTerminalEmptyState`, `WmsProductionActiveBatchBar`
- WspÄÅlne: bez centrowania, bez wÃâ¦skich wrapperÄÅw i kolorowych borderÄÅw caÄ¹âej karty

## 2026-06-09 Ã¢â¬â Dokumenty magazynowe: config-driven kolumny + RW/PW wartoÄ¹âºci
- Frontend: `warehouseDocumentConfigs.ts`, `WarehouseDocumentsTable.tsx` Ã¢â¬â osobne kolumny per PZ/PW/RW/WZ/MM/ZD/ZW; usuniÃâ¢te kolumny pÄ¹âatnoÄ¹âºci
- Backend: `series` object, `resolve_document_financial_totals` dla RW/PW; persist totals przy posting inwentaryzacji
- Detail: ukryty dostawca gdy brak; sekcja Ã¢â¬Å¾Ä¹ÄrÄÅdÄ¹âo dokumentuÃ¢â¬Å¥ dla RW/PW; kompaktowe menu boczne

## 2026-06-09 Ã¢â¬â Konflikty inwentaryzacji: grouped API + accept bez recount
- Backend: `counts[]` z `count_id`, `conflict_status`, `quantity_diff_label`; `POST .../conflicts/accept` (supervisor wybiera istniejÃâ¦cy wpis)
- `conflict_resolution_service`: metadata `operator_conflict_resolution` Ã¢â¬â konflikt znika bez tworzenia recount
- Frontend: tabela 1 wiersz = produkt+lokalizacja; operatorzy/iloÄ¹âºci/czasy stacked; approve po `count_id`; recount tylko Ã¢â¬Å¾WymuÄ¹âº ponowne liczenieÃ¢â¬Å¥
- Testy: `test_conflict_accept.py`, rozszerzenie `test_conflicts_endpoint.py`

## 2026-06-09 Ã¢â¬â Fix: peÄ¹âna inwentaryzacja zeruje niepoliczone stany (FULL + update_stock)
- `full_inventory_posting_service.py`: plan ksiÃâ¢gowania target Ã¢Ââ live stock; zero dla uncounted/orphan scope
- PARTIAL/CYCLE/CONTROL bez zmian Ã¢â¬â tylko policzone linie
- Testy: `test_full_inventory_zeroing.py` (CASE 1Ã¢â¬â3)

## 2026-06-09 Ã¢â¬â WMS shell polish: topbar tabs, launcher command center, DnD
- Topbar: glass (`backdrop-blur`, `bg-white/90`), underline active tab (Linear-style), DnD reorder pinned
- Launcher: search + `/` shortcut, keyboard nav, pinned tiles drag-reorder (mobile: strzaÄ¹âki)
- Kafelki: subtelniejszy hover, mniejsze badge, ciaÄ¹âºniejszy spacing, `React.memo`

## 2026-06-09 Ã¢â¬â Fix: GET /inventory-count/documents/{id}/conflicts Ã¢â â 500
- Przyczyna: brak importu `list_document_conflicts` w `inventory_count.py` Ã¢â â NameError
- `conflict_detail_service`: batch load (lines/products/locations/carriers/recounts/operators), `_safe_float`, per-item try/except, logi skip/partial
- API: `logger.exception` + structured 500 detail; testy `test_conflicts_endpoint.py`
- Frontend: `conflictsError` + retry w panelu konfliktÄÅw (nie blokuje widoku dokumentu)

## 2026-06-09 Ã¢â¬â WMS launcher + topbar: przypinanie, biaÄ¹ây UI
- Launcher: bez hero, bg-white, kafel z pinezkÃâ¦ (pin/unpin), reorder Ã¢â Â/Ã¢â â dla przypiÃâ¢tych
- Topbar: h-11, white, pills przypiÃâ¢tych moduÄ¹âÄÅw (Ä¹âºrodek), grid menu + magazyn (lewo)
- `finalTabs` = tylko pinned (localStorage per user); brak fallbacku na caÄ¹ây katalog
- Shell WMS: `bg-white` zamiast slate-100

## 2026-06-09 Ã¢â¬â Fix: inventory posting StockDocument(notes=Ã¢â¬Â¦) TypeError
- Przyczyna: `adjustment_service` przekazywaÄ¹â `notes=` do `StockDocument` Ã¢â¬â pole nie istnieje w modelu
- Nowy `stock_document_factory.create_stock_document()` Ã¢â¬â walidacja kolumn ORM + log `STOCK_DOCUMENT_INVALID_KWARGS`
- Testy: `test_stock_document_factory.py`, `test_inventory_posting_integration.py` (PW, status, idempotency)

## 2026-06-08 Ã¢â¬â WMS launcher: enterprise module grid (rebuild)
- UsuniÃâ¢ty terminal shell (`WmsHeader`, footer CE); launcher uÄ¹Ä½ywa standardowego `WmsTopBar` jak reszta WMS
- DuÄ¹Ä½e kafle (min ~185px): ikona, tytuÄ¹â, opis, chipy statystyk (konflikty, aktywne, oczekujÃâ¦ce)
- Grid 1/2/3/4 kolumn, max-width 1600px, slate-50 + white cards, hover elevation
- `useWmsLauncherBadges` Ã¢â â `metrics` per moduÄ¹â (inwentaryzacja: konflikty + aktywne docs)

## 2026-06-08 Ã¢â¬â WMS inwentaryzacja: lista dokumentÄÅw jak PZ / Rozlokowanie
- `WmsInventoryDocumentList`: usuniÃâ¢ty hero; peÄ¹âna szerokoÄ¹âºÃâ¡; scanner + grid jak PrzyjÃâ¢cie/Rozlokowanie PZ
- Karta: lewa (ikona, nr, status, operatorzy, konflikty, data), prawa (pokrycie, policzone), dÄÅÄ¹â (progress bar)
- Skan/filtr dokumentu; integracja `useWmsScanner` + `useWmsPageScanHandler`

## 2026-06-08 Ã¢â¬â Fix: HTTP 500 przy ksiÃâ¢gowaniu RW/PW inwentaryzacji
- `posting_validation_service.py`: walidacja przed postem Ã¢â¬â reconcile operatorÄÅw (nigdy suma), snapshot linii `[POST INVENTORY] line snapshot` (cartons/carton_capacity/pieces/computed_total/delta), blokada absurdalnych qty, preflight stock RW
- `adjustment_service.py`: per-line try/except Ã¢â â `InventoryPostingFailedError` (FIFO ValueError zamiast surowego 500)
- API `POST .../post`: `posting_failed` Ã¢â â HTTP 422 ze szczegÄÅÄ¹âami; nieoczekiwane bÄ¹âÃâ¢dy Ã¢â â traceback w `detail`
- Testy: `test_posting_validation.py`

## 2026-06-08 Ã¢â¬â WMS launcher: terminal operacyjny (kafelki moduÄ¹âÄÅw)
- Nowy widok `/wms/menu`: `WmsLauncherPage`, `WmsModuleTile`, `WmsHeader`
- Industrial UI: granatowy header, duÄ¹Ä½e kafelki (Ã¢â°Ä140px), bez pinÄÅw/hover SaaS
- Badge z API: Braki, Zbieranie, Pakowanie, PrzyjÃâ¢cie, Rozlokowanie, Inwentaryzacja
- Nawigacja klawiaturÃâ¦ (strzaÄ¹âki, Enter), focus dla skanerÄÅw/kolektorÄÅw

## 2026-06-08 Ã¢â¬â Fix: eksplozja iloÄ¹âºci WMS (multi-browser / stale state)
- Przyczyna: optimistic update + frontend liczyÄ¹â `quantity` (absolute) z lokalnej bazy; stale `packaging.loaded` w closure; effect re-dekomponowaÄ¹â total przy kaÄ¹Ä½dej zmianie `counted_quantity`
- Skany: backend SSOT przez `delta` (+1 szt / +pack karton); UI aktualizuje siÃâ¢ dopiero z `my_counted_quantity` z API
- RÃâ¢czna korekta: `quantity` (absolute) tylko po zapisie Ã¢â¬â bez optimistic
- WyÄ¹âÃâ¦czono optimistic; `applyServerQuantity` jako jedyny hydrator UI; `savingQty` blokuje double-submit
- Czyszczenie `localStorage` sesji lokalizacji po zakoÄ¹âczeniu (`clearLocationSessionForTask`)
- Logi `[COUNT DEBUG]` frontend (console) + backend (`count_entry_service`)

## 2026-06-08 Ã¢â¬â Fix: stale lock przy ksiÃâ¢gowaniu inwentaryzacji (409 posting_in_progress)
- Lock w DB (`posting_in_progress`), nie Redis; brak cleanup po bÄ¹âÃâ¢dzie zostawiaÄ¹â dokument zablokowany
- Backend: `SELECT FOR UPDATE`, auto-clear orphan lock (`posting_in_progress=1` w DB = failed cleanup), `finally` + force unlock w osobnej transakcji
- Logi `[POST INVENTORY]`: start, acquire lock, transaction, rw/pw, commit, rollback, release lock
- Idempotency key ustawiany dopiero przed commitem (nie przy acquire lock)
- Frontend: ref guard double-submit, UUID idempotency key, loading na przycisku modala

## 2026-06-08 Ã¢â¬â Fix: eksplozja iloÄ¹âºci kartonÄÅw (WMS inwentaryzacja)
- Przyczyna: total w szt. dekomponowany przy pack=1, potem ponownie mnoÄ¹Ä½ony po zaÄ¹âadowaniu unitsPerCarton
- SSOT: cartons + pieces w UI; total tylko computed; API wysyÄ¹âa wyÄ¹âÃâ¦cznie `quantity` (absolute pieces)
- Resync stanu po zaÄ¹âadowaniu opakowania; refs zamiast stale closures
- Backend conflicts: skip lines bez product_id, NaN guard na quantity

## 2026-06-08 Ã¢â¬â Nowoczesny ekran logowania Sasist (SaaS)
- Split layout: ciemny branding + jasny formularz (`LoginBrandingPanel`, `LoginFormPanel`)
- `ProtectedRoute` Ã¢â¬â globalna ochrona tras; public: `/login`, `/wms-upload/*`
- Sesja: remember me (localStorage vs sessionStorage), last path redirect, auto refresh token, `auth:session-expired` event
- UX: show/hide password, caps lock, last email, inline errors, API status footer

## 2026-06-08 Ã¢â¬â Inventory counting UX: terminal + ERP progress
- WMS: optymistyczny licznik po skanie (`applyScanQty` przed API); baza qty z `my_counted_quantity`, nie globalnej sumy
- WMS: header produktu Ã¢â¬â wiÃâ¢ksze zdjÃâ¢cie, badge lokalizacji/noÄ¹âºnika (bez duplikatu w belce); konflikt tylko dla kierownika/superadmin
- WMS: kompaktowe liczniki; dolny pasek: Nieznany (warning), Wada (danger), ZakoÄ¹âcz (primary)
- ERP tab Ã¢â¬Å¾Przebieg liczeniaÃ¢â¬Å¥: osobny wiersz per operator przy konflikcie (`expandOperatorRows`)

## 2026-06-08 Ã¢â¬â ERP inventory: uproszczony przebieg liczenia (UI only)
- UsuniÃâ¢to kolumnÃâ¢ Ã¢â¬Å¾Ä¹ÄrÄÅdÄ¹âo stanuÃ¢â¬Å¥; noÄ¹âºnik pod lokalizacjÃâ¦ (`InventoryLocationStack`)
- Produkt: wiÃâ¢ksze zdjÃâ¢cie, nazwa/EAN/SKU; bez noÄ¹âºnika pod produktem
- Konflikty: POLICZ. pokazuje operatorÄÅw osobno (nie suma); badge Ã¢â¬Å¾Konflikt liczeniaÃ¢â¬Å¥; akcje zatwierdÄ¹Å/recount (istniejÃâ¦ce endpointy)
- UsuniÃâ¢to listÃâ¢ Ã¢â¬Å¾Policzone w lokalizacjiÃ¢â¬Å¥ Ã¢â â **Ostatnio policzone przeze mnie** (max 2 pozycje)
- Hero produktu: duÄ¹Ä½e zdjÃâ¢cie (bez ramek) Ã¢â â nazwa Ã¢â â EAN Ã¢â â lokalizacja Ã¢â â noÄ¹âºnik Ã¢â â kartony/sztuki/suma
- NoÄ¹âºnik przypisywany w kontekÄ¹âºcie produktu (nie w belce lokalizacji)
- Wada przeniesiona do dolnego paska: `[ Nieznany ] [ Wada ] [ ZakoÄ¹âcz ]`
- Backend: liczenia operatorÄÅw **nie sumujÃâ¦ siÃâ¢** (27 + 8 Ã¢â°Â  35); konflikt Ã¢â â `line.counted_quantity = null`, wpisy per operator w `inventory_count_entries`
- API WMS: `scope=mine` na liniach, `my_counted_quantity` / `operator_count_conflict` na skanie

## 2026-06-08 Ã¢â¬â WMS inventory terminal UI (mockup-aligned)
- Presentation-only restyle of operator flow: document cards, location scan, product scan, qty modal
- New/updated `ui/wms/` components: `WmsInventoryLandingView`, `WmsInventoryProductDetailPanel`, mockup theme tokens
- Hooks, API, scan handlers, counting logic unchanged; ERP admin inventory untouched

## 2026-06-08 Ã¢â¬â Inventory UX: portal dropdown + draft delete
- Reports document picker renders via portal (`z-index: 10050`) Ã¢â¬â no clipping under sticky ERP chrome
- Draft documents deletable from list (trash action + confirm modal); `DELETE /inventory-count/documents/{id}` with status/session validation

## 2026-06-08 Ã¢â¬â ERP inventory layout unified with panel shell
- Replaced custom inventory shell (`max-w-[1600px]`, white full-page) with standard `PageLayout` + `SettingsModuleStack` (same as Producenci / Administratorzy)
- Module header: breadcrumbs, title, `TopTabsNavigation`, primary action in header
- Views use `moduleListPageShellClass`, `erpSurfaceCard`, `panelListDense*` table tokens

## 2026-06-08 Ã¢â¬â ERP inventory admin UI (mockup-aligned, presentation only)
- `ui/erp/theme.ts` Ã¢â¬â shared tokens: KPI cards, tables, indigo tabs, wizard steps, selection cards, scope box
- `InventoryLayout` Ã¢â¬â `PageLayout` + indigo tab nav (Pulpit / Dokumenty / Kreator / Raporty)
- Dashboard, documents list, wizard, reports Ã¢â¬â mockup layout on existing hooks/API
- `InventoryDocumentDetailView` Ã¢â¬â KPI grid, indigo detail tabs, table shell; approval/conflict/unknown panels unchanged logically
- `InventoryDocumentPicker` Ã¢â¬â optional `id` + `triggerClassName` for reports selector styling
- WMS inventory terminal untouched; no backend/API/hook changes

## 2026-06-08 Ã¢â¬â Inventory frontend UI architecture cleanup
- `docs/inventory-architecture.md` Ã¢â¬â flow maps, routes, persistence, risk files, orphaned legacy
- New `modules/inventoryCount/ui/erp/` + `ui/wms/` presentation layer (themes separated)
- God page split: `useInventoryDocumentDetail` + `InventoryDocumentDetailView`; `useWmsInventoryTerminalPage` + `WmsInventoryTerminalView`
- API split: `inventoryDocumentsApi`, `inventoryApprovalApi`, `inventoryConflictsApi`, `inventoryReportsApi`, `inventoryWmsApi`; barrel `inventoryCountApi.ts`
- Legacy WMS execution files archived to `frontend/_archive/inventory-count-legacy/`
- Deprecated shims at old `erp/components/` and `components/` paths for incremental import migration

## 2026-06-08 Ã¢â¬â WMS inventory document-scoped entry flow
- WMS `/wms/inventory-count` landing: active docs only (`in_progress`, `awaiting_approval`); drafts/approved/cancelled hidden
- Document cards: number, title, type, scope, progress, operators, conflicts, movement policy, last activity
- Routes: `/d/:documentId` (location scan), `/d/:documentId/count/:taskId` (terminal); legacy `/count/:taskId` redirects
- Sticky header switcher (`WmsInventoryDocumentSwitcher`); sessionStorage per warehouse for active document
- Empty state Ã¢â¬Å¾Brak aktywnych inwentaryzacjiÃ¢â¬Å¥; Ã¢â¬Å¾UtwÄÅrz dokumentÃ¢â¬Å¥ gated by `inventory.submit`
- Backend: `GET /wms/inventory-count/active-documents` + `wms_active_documents_service`

## 2026-06-08 Ã¢â¬â Inventory start stability + movement enforcement + wizard UX
- **500 on start fixed**: missing `log_inventory_audit` import in `location_lock_service` (triggered when movement policy Ã¢â°Â  allow)
- Start returns structured errors: `scope_not_configured`, `scope_not_materialized`, `inventory_start_failed` (+ 500 fallback with code/details)
- `inventory_movement_guard_service`: real enforcement Ã¢â¬â picking complete, putaway, replenishment, pick routing suggestions
- Wizard: collapsible product/location pickers, tag chips, product thumbnails, zones hidden, richer summary + full server persist before start
- Partial scope operational impact copy; `formatInventoryRequestError` for start failures

## 2026-06-08 Ã¢â¬â Inventory operational polish (supervisor + WMS ergonomics)
- Approval safety modal: shortages/surpluses, unknown count, locations, RW/PW preview before submit/approve/post
- `posting_preview_service` + `GET .../posting-preview`; unresolved conflicts in preview
- Dedicated conflict panel: operators, qty, timestamps, carrier, recount state (`GET .../conflicts`)
- Unknown product supervisor resolution: map to catalog product or reject (`GET/POST unknown-products`)
- ERP detail: ops metadata bar (type, policies, warehouse, operators, started/last activity)
- Line table Ã¢â¬Å¾Ä¹ÄrÄÅdÄ¹âo stanuÃ¢â¬Å¥: Na pÄÅÄ¹âce vs W noÄ¹âºniku
- WMS sticky context bar: LOKALIZACJA Ã¢â â NOÄ¹Å¡NIK Ã¢â â PRODUKT always visible during counting
- Filter/tab state persisted in sessionStorage across Przebieg/RÄÅÄ¹Ä½nice/Kontrola
- KPI valuation tooltips (purchase net / snapshot / FIFO foundation)
- Wizard scope operational presets (bez EAN, ABC A, brak ruchu, noÄ¹âºniki, Ã¢â¬Â¦)

## 2026-06-08 Ã¢â¬â Inventory UX production cleanup
- Submit-for-approval: only blocks empty doc, wrong status, operator recount conflicts (not partial count, differences, open WMS tasks)
- KPI: Ã¢â¬Å¾Konflikty liczeniaÃ¢â¬Å¥ + wartoÄ¹âºÃâ¡ nadwyÄ¹Ä½ek/brakÄÅw PLN (removed dead Ã¢â¬Å¾WpÄ¹âyw nettoÃ¢â¬Å¥)
- ERP tabs: filter toolbar on Przebieg / RÄÅÄ¹Ä½nice / Kontrola
- WMS: carrier hierarchy card (LOCATION Ã¢â â CARRIER Ã¢â â PRODUCTS)
- Editable document title + notes; scope preview API + wizard location/product pickers
- Wizard: 4 steps (removed fake Zadania step)

## 2026-06-08 Ã¢â¬â Inventory strategy simplification (operator-first config)
- Replaced snapshot/soft/hard with movement policies: allow_operations | block_picking | block_all
- Result policy: update_stock | count_only | report_only Ã¢â¬â post skips RW/PW for non-update modes
- Partial scope modes in wizard: zones, locations, products, categories, carriers, dynamic filters
- Materialization respects scope_mode + expanded filters; legacy lock_mode values normalized
- Wizard redesigned: Typ Ã¢â â Zakres Ã¢â â Ustawienia Ã¢â â Podsumowanie; removed recount_required checkbox
- Detail page shows operator settings; conditional Ã¢â¬Å¾ZakoÄ¹âcz bez korektÃ¢â¬Å¥ vs Ã¢â¬Å¾KsiÃâ¢guj RW/PWÃ¢â¬Å¥

## 2026-06-08 Ã¢â¬â Recount vs inventory variance (domain fix)
- RÄÅÄ¹Ä½nice expectedÃ¢â°Â counted Ã¢â â supervisor_review, NIE mandatory recount
- `recount_conflict_service`: recount tylko przy konflikcie operatorÄÅw (ten sam produkt/lokalizacja, rÄÅÄ¹Ä½ne iloÄ¹âºci)
- `recount_state`: none | required | resolved na liniach; approval blokuje tylko nierozwiÃâ¦zane konflikty
- UI: Ã¢â¬Å¾RÄÅÄ¹Ä½nicaÃ¢â¬Å¥ vs Ã¢â¬Å¾Wymaga ponownego liczeniaÃ¢â¬Å¥ vs Ã¢â¬Å¾ZweryfikowanoÃ¢â¬Å¥

## 2026-06-08 Ã¢â¬â WMS inwentaryzacja: location Ã¢â â carrier Ã¢â â product
- `wmsInventoryExecutionContext.ts` Ã¢â¬â locationContext, carrierContext, grouping, PAL-/BOX- detection
- Hook: auto-aktywacja lokalizacji po zaÄ¹âadowaniu taska; carrier przez API; scan z carrier_id
- Backend: linie liczone per (location Äâ product Äâ carrier); `resolve-carrier`; task lines z carrier_code
- UI: `WmsInventoryActiveContextBar`, grupowana lista Ã¢â¬Å¾Policzone w lokalizacjiÃ¢â¬Å¥

## 2026-06-08 Ã¢â¬â Submit approval: scoped inventory + Polish errors
- `approval_service`: PARTIAL/CYCLE/CONTROL skip full coverage; smarter WMS task blocking (only incomplete locations); projected recount gate; Polish block messages; rollback on recount failure
- Frontend: `formatInventoryRequestError`, toast + reload doc after failed submit; scoped types in `canSubmitInventoryDocument`

## 2026-06-08 Ã¢â¬â ERP inwentaryzacja: oÄ¹âº czasu Kontrola
- `inventoryAuditEventLabels.ts` Ã¢â¬â mapowanie zdarzeÄ¹â audytu na polskie etykiety operacyjne + `buildInventoryAuditTimeline`
- `InventoryAuditPanel` Ã¢â¬â gÃâ¢sta tabela ERP (operator, czas, operacja, produkt/EAN/miniatura, delta iloÄ¹âºci); bez surowego JSON/kluczy
- Backend `audit_log_service` Ã¢â¬â wzbogacenie o `user_name`, `line_context`, `location_name`
- UsuniÃâ¢to redundantny link Ã¢â¬Å¾Ã¢â Â Lista dokumentÄÅwÃ¢â¬Å¥ z widoku szczegÄÅÄ¹âÄÅw dokumentu

## 2026-06-04 Ã¢â¬â WMS production execution UI shell alignment
- `/wms/production/*` renders inside shared `WmsOperationalLayout` + `WmsTopBar` (removed hideProductionTopBar)
- Removed duplicate header from `WmsProductionExecutionLayout` (icon, TERMINAL WMS, mode title, Menu WMS)
- Removed extra amber Ã¢â¬Å¾Prod. WMSÃ¢â¬Å¥ button from topbar Ã¢â¬â single Ã¢â¬Å¾Produkcja Ã¢â¬â wykonanieÃ¢â¬Å¥ in module nav
- Workflow tabs only (Zbieranie / Wykonanie / OdÄ¹âoÄ¹Ä½enie) + `WMS_OPERATIONAL_CONTAINER` spacing
- Centered empty states via `WmsProductionTerminalEmptyState`

## 2026-06-04 Ã¢â¬â Production schema platform integrity
- Fail-fast `run_production_schema_startup_gate` (import + tier0); blocks on missing tables/columns/types + required batch columns
- `GET /health/schema` Ã¢â¬â dialect, generation `12`, drift fields (Railway/CI/support)
- Startup logs: `PRODUCTION_SCHEMA_VERSION=12`, `[production.schema.audit.summary]`
- Workers guarded via `schema_guard.require_production_schema_valid`; background upgrade aborts workers on gate failure
- PostgreSQL no-op wrapper logs `SCHEMA_HELPER_SKIPPED_POSTGRES` + allowlist warning (production helpers exempt)
- Tests: `test_production_schema_platform.py` (27 production schema tests passing)

## 2026-06-04 Ã¢â¬â Composition Engine + Batch/Wave Production
- `product_compositions` + `product_composition_lines` (bundle | manufacturing modes, no product_type)
- `production_batches` + `production_batch_lines`; aggregated component demand + shortages
- Migration from `production_recipes`; recipe service syncs compositions; stock docs link batch_id
- API: `/compositions`, `/production/batches`; frontend Kompozycje tab + batch Produkcja UI
- Tests: `test_composition_batch.py` (aggregation engine)

## 2026-06-04 Ã¢â¬â Manufacturing / Production module (WMS)
- PostgreSQL-safe migration `ensure_production_tables` (recipes, orders, line snapshots)
- Recipe service + production order service (FIFO consume, RW/PW docs, valuation on complete)
- API router `/production`; no `product_type` enum
- Frontend: Produkcja nav + list/detail UI; product tab with recipe editor and component usage
- Tests: recipe calculations, schema, self-reference guard

## 2026-06-04 Ã¢â¬â Direct Sales PDF + Dokumenty print templates
- Root-cause fix: sale PDF 500 (`map_sale_document` keyword-only call)
- Central `document_print_service` with logging, builtin/custom template fallback, PDF validation
- Auto-seed Paragon/FV/WZ/Korekta A4 templates (stable slugs) in label template Dokumenty category
- Frontend PDF fetch validates `%PDF` bytes; print errors surface backend `detail`

## 2026-06-04 Ã¢â¬â WZ warehouse document cleanup
- `wz_service`: finalize WZ as `completed` with line net/VAT pricing and document totals
- Stock document list/read: order number, series prefix, customer, financial totals for WZ
- `DocumentsWarehousePage` WZ tab: removed payment columns; ZREALIZOWANA status; warehouse-oriented line table

## 2026-06-04 Ã¢â¬â Retail/POS workflow (Direct Sales)
- Auto retail customer (`Klient detaliczny`) on every new session
- Document-first flow: PA = retail badge; FV = NIP lookup + invoice customer upsert
- Line + order discounts with backend canonical totals (`session_financials_service`)
- Discount settings + admin panel section; server-side max-% validation
- Complete pipeline reads session `document_subtype`; `httpx` for MF NIP API

## 2026-06-04 Ã¢â¬â Direct-sale NET price pipeline fix
- Session `unit_price` is catalog NET; backend no longer treats it as gross
- `netto_line_to_gross_fields`, updated `compute_direct_sale_session_total` with per-product VAT
- Receipts/documents: 5.00 net / 1.15 VAT / 6.15 gross (was wrongly 4.07/0.93/5.00)

## 2026-06-04 Ã¢â¬â Financial consistency pass
- Unified order line financials on `sale_document_financials.compute_order_line_financials_with_margin`
- Fixed order-level margin: null when `sum_purchase_active` is zero (no more false 100%)
- Frontend order detail: display-only `line_gross_total` / `unit_price_gross` (fixes 5.01 brutto bug)
- Direct-sale completion traceability: load issue movements from WZ / `source_movement_id`
- PA series padding repair at seed (`padding_length=0`)
- Operational debug panel gated to Vite DEV only

## 2026-06-04 Ã¢â¬â POS UX polish
- PDF print endpoints wired; formatMoneyPl; stationary-sale labels; linked documents UI

## 2026-07-29 Ã¢â¬â Agent 1.5.0 release process + E2E print

- Auto versioning: VERSION + Directory.Build.props + publish-release bump; clean-reinstall-admin.ps1
- Installed 1.5.0 on E-HANDEL; shortcut Sasist Agent on desktop
- E2E ERP batch 9: Pobierz PDF, Drukuj przez przeglÃâ¦darkÃâ¢ (blob open bez noopener), Stanowisko 1 job 18 PDFiumÃ¢â âGDI
- Fix route order: /agents/self/test-page before {agent_id}
- Update metadata: ignore legacy SasistPrinterAgent-Setup; default release 1.5.0

## 2026-07-29 Ã¢â¬â Template usage impact report

- Replaced small UÄ¹Ä½ycia modal with right drawer + full usage report
- Backend usage endpoint returns summary counts and sectioned entries with erp_link deep links
- Editor Przypisania/UÄ¹Ä½ycia tab shows the same report body
## 2026-08-12 Ã¢â¬â Phase 6: production Ã¢â â packing handoff
- Config: after_production_action STATUS_ONLY|OPEN_PACKING; status_after uniqueness/cross-rules
- Fulfillment: CARTLESS + READY_TO_PACK; packing_handoff on progress response; FE toast/auto-open
- Pack finish: consume buffer inventory; badge Z produkcji
- Tests: test_production_packing_handoff.py (+ config/fg regression)


## 2026-08-21  Return statuses configurator sync + matrix UX
- Fixed Magazyn checkbox reset after refetch (PUT reconcile + overview wipe)
- Dense status/decision matrices; IconButton/Tooltip; group +


## 2026-08-21 â generate_sale_correction BLOCKED
- Audyt: brak realnego pipeline wystawiania korekty SaleDocument
- Istnieje tylko seria KOR + szablon PDF (include invoice) + staÅa EFFECT_GENERATE_CORRECTION (nie w SUPPORTED)
- create_sale_document: tylko SALE+INVOICE/RECEIPT; 1 dok. na order; brak parent FK
- RMZ: brak sale_document_id; UI korekta = localStorage / link do zamÃ³wienia
- Nie wdroÅ¼ono atrapy effectu


## 2026-08-21  Sale document correction domain
- SaleDocumentItem snapshots; document_kind PRIMARY|CORRECTION; source_sale_document_id
- issue_sale_correction + RETURN adapter; KOR numbering; PDF template; API from-return
- V1 invoice only; automation effect NOT wired

