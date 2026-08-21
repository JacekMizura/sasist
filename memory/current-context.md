**Return statuses configurator UX + STATUS_ACTION sync — PASS (pending commit).**
- Root cause: optimistic clear raced with overview; overview GET errors wiped map to {}; PUT used bare refresh without effects
- Fix: patch from PUT response → then overview reconcile; never wipe overview on error; re-query effects after PUT
- UX: group + headers, icon-only edit, Magazyn Tooltip, counter in Status cell, decisions matrices with inline Aktywna/Powrót
- SSOT unchanged (AutomationRule STATUS_ACTION; creates_stock_document for decisions)
**Return status actions inline matrix â€” PASS (pending commit).**
- Per-subgroup matrix with inline checkboxes; email popover; batch overview with config
- No under-name â€śBrak automatycznych akcjiâ€ť; hierarchy kept; STATUS_ACTION SSOT

**Return status STATUS_ACTION list overview â€” superseded by matrix above.**

**STATUS_ACTION Sellasist UX â€” PASS `2cc3cfce`.**
- Panel: no change_status; ORDER/COMPLAINT emails; RETURN warehouse_commit + emails
- BE merge preserves advanced change_status; enabled if any effect on
- add_tag / legacy cleanup still deferred

**Email delivery pipeline â€” PASS (pending commit).**
- Outbox: PENDING â†’ SENDING â†’ SENT|FAILED; enqueue never marks SENT
- Provider: SMTP via EMAIL_SMTP_* / EMAIL_FROM ENV; memory for tests; unconfigured â†’ FAILED configuration_error
- Worker: email_delivery_worker on operational_loop tick
- Automation send_email SUCCESS = enqueue PENDING (delivery_status)
- Template CRUD API + `/templates/messages` UI; shared MessageTemplatePicker (StatusActions + main editor)

**send_email Automation effect â€” PASS `1e47df40` (superseded by delivery pipeline).**
- Messaging SSOT: MessageTemplate + OutboundEmailMessage (idempotent ae:{execution}:{effect})
- Effect adapter send_email; CUSTOMER only; preflight supports send_email (+ legacy send_message alias)

**Automation runtime safety (unsupported conditions) â€” PASS `fc489fb9`.**
- No skip of unevaluable conditions; SUPPORTED | UNSUPPORTED | INVALID
- Shared preflight before RUNNING; unsupported effect â†’ 0 effects (no partial)
- Read model: runtime_ready + validation_issues; FE badges Gotowa / Wymaga poprawy
- Legacy import keeps full conditions_json; blocked until supported

**Order Automations cutover to backend SSOT â€” PASS.**
- Editor/list/packing activators â†’ `/api/automations` (no new rule writes to localStorage)
- Model: group, conditions_json, metadata_json; condition evaluator; test/run/import-legacy
- Runtime effect ACTIVE: change_status only; other FE kinds persist as UNSUPPORTED
- STATUS_ACTION on same list with badge; Order StatusActionsPanel shared
- Legacy one-shot import (idempotent marker)

**Automation Engine Phase 2 â€” PASS `367c0626`.**
- RETURN/COMPLAINT UI status enter â†’ `entity_status_entered` â†’ Automation Engine
- `change_status` adapters for ORDER/RETURN/COMPLAINT (panel UI only; no RMZ/refund/stock)
- `source=STATUS_ACTION` + `GET /automations/status-actions` projection
- Shared FE `StatusActionsPanel` on Return + Complaint status editors; list badge section
- Delete status â†’ disable STATUS_ACTION rules (keep history)

**Packaging workflow trigger split â€” PASS (commit pending).**
- Independent smart_/three_d_ proposal-init + auto-label; packaging_strategy shared
- Orchestrator `on_order_status_changed_packaging`; assign policy + `selected_carton_source`
- Legacy proposal_init/auto_label backfill + read fallback

**3D Matching rebuild â€” PASS `605f847e`.**
- Rename Dopasowanie przestrzenne â†’ 3D Matching; single Ustawienia section
- Independent smart_enabled / three_d_enabled; filler % (cbrt volume reserve); strategy FE SSOT in Smart workflow
- Runtime: shipping hard-gate, no fake 1Ă—1Ă—1 MATCHED, all active cartons, filler in solver
- Dead localStorage engine knobs removed; multi-package still deferred

**3D Matching settings audit (READ-ONLY) â€” 2026-08-21 â€” COMPLETE.**
- Implemented in rebuild above

**Receiving Validation cleanup â€” CLOSED at `18b1fc64` (accepted).**
- Migrated policy = SSOT; putaway = PZ line lot identity; no receiving/putaway runtime on `product.track_*`
- `toggle_master_carton_pack` gone; carton columns = storage/compat only; `bulk_ean`/`units_per_carton` ACTIVE
- Do not reopen this scope. Follow-ups (separate tasks): (1) `test_picking_routing_excludes_dock`, (2) Production/MM `product.track_*` audit

**Putaway lot identity + dead carton toggle cleanup (2026-08-20) â€” PASS `18b1fc64`.**
- `_item_storage_lot_inventory_key` + hard-delete dock revert â†’ `dock_lot_keys_for_pz_line` (line identity, not `product.track_*`)
- Live putaway already used line identity; fixed legacy backfill/hard-delete split-brain
- Removed dead `toggle_master_carton_pack` (API/service/FE type); no writer for `require_recv_master_carton`
- Regressions Aâ€“F; putaway/lifecycle PASS; vite build PASS

**PrzyjÄ™cia â†’ OgĂłlne validation cleanup (2026-08-20) â€” PASS `23ad64a3`.**
- UI: 3 blocks / 9 settings; removed dead `require_master_carton` feature flag
- Soft master-data (dims/weight/carton completeness); hard traceability (batch/expiry/serial)
- Weight must be > 0; carton EAN/qty/dims/weight unified in completeness helper
- Migrated resolver forces `require_recv_master_carton=False`; mark_damaged + office accept use effective policy
- Bulk EAN scan independent of validation settings 7â€“10; legacy DB/API keys preserved
- Tests Aâ€“O + FE vitest + lifecycle + `npm run build` PASS

**WMS Returns Dokumenty UI cleanup (2026-08-20) â€” shipped `1322570e`.**
- Removed WMS â†’ Zwroty â†’ Dokumenty (misleading return_document DTE picker)
- Nav: OgĂłlne / PrzyjÄ™cie / Produkty produkowane only; DTE/ERP return_document KEPT
- Legacy RETURNS scope assignments left in DB

**Circular import FIX (2026-08-20) â€” PASS, committed `a6fbb76b`.**
- Cycle: mainâ†’cartâ†’packingâ†’wms_sale_documentâ†’buyer_snapshotâ†’direct_sale.__init__â†’completeâ†’workerâ†’wms_sale_document
- Fix: neutral `retail_customer_service.py`; slim `direct_sale/__init__`; facade via `direct_sale_service.py`
- `import backend.main` OK; local `/healthz`+`/readyz` 200 on `run_server.py`

**Print-agent poll log noise cleanup (2026-08-20) â€” PASS, committed `1eafa084`.**
- `log_print_poll`: empty polls DEBUG, jobs>0 INFO (fields unchanged)
- heartbeat success â†’ DEBUG; errors unchanged
- `QuietPrintingAgentAccessFilter` on `uvicorn.access`: suppress 2xx only for pending/heartbeat/devices sync; fail-open
- Wired in `serve.py` + `main.py`; intervals/protocol/agent C# untouched
- Tests: `test_printing_agent_log_noise.py` 13 PASS; full printing suite blocked by pre-existing circular import via `backend.main`

**Manufactured recovery FIX (2026-08-20) â€” FINAL GATE PASS, committed.**
- Snapshot mfg on RMZ (workflow v2); GET/runtime = snapshot only
- SSOT: `RMZLine.intake_disposition_json`; aggregates = projection
- DEFAULT_LOCATION validated **before** Z-PZ shell; BOM freeze via recovery rows
- Full DB E2E: A/B/C allocation, REJECTED, REQUIRED bypass, snapshot, BOM, putaway
- Tests: returns+activity 167 PASS; FE vitest 7 PASS; `npm run build` PASS


**WMS Returns workflow SSOT (2026-08-20) â€” on main `4dfa5a17`.**
- Live SSOT: `require_condition`, `require_photos`, `refund_processing` (disabled|warehouse|office)
- Removed active simple/two_step/advanced as runtime; legacy columns projected only
- RMZ snapshot on CREATE (+ lazy stamp on GET/mutation); runtime reads snapshot
- Warehouse commit = `/finalize` (+ `/commit-wms` alias); office `/refund` gated by `returns.refund`
- Permissions: `returns.warehouse_commit`, `returns.refund`
- two_stepâ†’warehouse (never office); office is conscious admin choice

**Immutable buyer snapshot for SaleDocument (2026-08-19) â€” implemented, NOT committed.**
- `SaleDocument.buyer_json` nullable Text; ORM sync via `ensure_sale_documents_orm_columns`
- Snapshot at `create_sale_document` via `persist_buyer_snapshot` (Direct Sales / packing / OMS / marketplace)
- Precedence: Order addresses_json â†’ Customer+CustomerAddress â†’ retail PA fallback
- `sale_document_mapper._resolve_buyer_display`: buyer_json wins; NULL â†’ legacy live Customer/Order
- Tests: `test_sale_document_buyer_snapshot.py` (Aâ€“H scenarios); direct_sales + mapper PASS

- `extensions.ds_enabled_v1` stamp on conscious PUT; legacy fail-open until stamped
- SSOT: `resolve_direct_sales_business_enabled` + API `enabled_effective` / `enabled_enforced`
- Completion mode: stamped OFF allows finish inflight session, blocks expansion (qty+/scan/add)
- UI cleanup retained: dead workflow statuses, panel SSOT, WMS hook skip for DIRECT_SALE


- Removed entire nav/section + 4 localStorage keys (`supplierAvailabilityCheck`, `legacyMode`, `debugMode`, `advancedRoutingMode`); strip on load/save
- Runtime unchanged: Inventory ATP, CartLifecycle, graph route_sort_key, picking-terminal, picking_config
- GAP (not this task): `PickingOrchestrator` still calls forbidden assign; wave/simulation already 409 `legacy_sim_assign_forbidden`

**Global FastAPI 0.141 routing diagnostics FIX (2026-08-18).**
- Shared `backend/routing_diagnostics.py`: `url_path_for` + OpenAPI; no `app.routes.path`
- False CRITICAL for WMS settings + production planning gone; inventory-count dump replaced
- Returns `22f0dcab` unchanged; pin `fastapi>=0.141.0,<0.142.0`; no remount

**WMS Returns routing diagnostic (2026-08-18) â€” FastAPI 0.141, no remount.**
- Diagnostic uses `url_path_for` (not flat `app.routes.path`); lookup/static/id mounted once
- Pin: `fastapi>=0.141.0,<0.142.0`; tests on `backend.main:app` PASS
- Returns business logic/endpoints unchanged; commit `22f0dcab`

**WMS Automatyzacja przy zbieraniu cleanup (2026-08-18).**
- Removed entire Automatyzacja section + 5 dead localStorage keys
- SSOT unchanged: after_batch_complete_action, picking-terminal scan policy, qty/remaining, target_status_id

**WMS Metody zbierania cleanup (2026-08-18) â€” NO commit/push.**
- Removed dead section + 5 localStorage keys (container type, start scans, auto-suggest cart/route)
- SSOT remains picking_config modes + Cart.capacity_*; default-cart leftover untouched (GAP)

**WMS Lista zleceĹ„ cleanup + after_batch_complete_action (2026-08-17) â€” NO commit/push.**
- Removed dead localStorage duplicates from Zbieranie â†’ Lista zleceĹ„ (batch counts/volume/management/sort-by-age)
- Real batch SSOT remains `picking_config` max_* / modes / order_sort + `Cart.capacity_*`
- New terminal setting `after_batch_complete_action` (tenant+warehouse): assign_new_batch | back_to_list | stay_here; default back_to_list
- Sort resolver public name: `resolve_order_sort_for_flow` (no alias to for_tour)
- GAP (not implemented): order_sort=location sorts by id; courier falls back to date

**WMS picking list_display SSOT (2026-08-17).**
- `list_display` (6 flags) SSOT = GET/POST `/wms/settings/picking-terminal` only
- localStorage `wms-picking-extended-ui:v1:{warehouseId}` no longer seeds/overrides/POSTs those fields
- Help: `SettingInfoButton` on Widok â†’ Lista zbierania; per-option `hint` â†’ shared `(i)`
- Flags still apply only to `WmsPickingProductsPage` â†’ `PickingProductListCard` (not detail / qty panel)
- GET fail: list checkboxes locked, no automatic POST of cache

**Returns journal Activity Log copy (2026-08-17) â€” NO commit/push.**
- Business titles/effects for intake + component recovery; no FG=/rozbiĂłr/bez stocku in UI
- No RETURN_COMPONENT_SCRAP in Activity Log (merged into recovery); `audit_component_scrap` kept
- Finalize journal order: decision â†’ intake â†’ recovery â†’ Z-PZ â†’ finalized
- Files: `return_domain_activity.py`, `return_activity_presentation.py`, `presentation.py`, `rmz_finalize_service.py`, domain_event_codes, tests
- Tests: domain activity 17 + recovery/Z-PZ 63 + rmz_finalize PASS

**OMS returns intake UX compact (2026-08-16) â€” on main `37dc405a`.**
- Shared `ReturnStockIntakeSection` + `IntakeComponentRows` (segmented, badge, compact list, readonly summary)
- Polish: equal-height soft orange segments; MIXED one-row + Razem; denser rows; readonly Odzyskano/Odrzut
- Payload SSOT unchanged; Visual QA Aâ€“F in `frontend/tmp-visual-qa/intake-compact-qa-*.png`

**ETAP 2 A/B/C â€” regression PASS path (2026-08-16).**
- Model locked: A=SALEABLE B=OUTLET_B C=SERVICE_C; legacy on_hand/available = physical A+B+C
- Commits on main: `82c21dd3` (purchasing+picking SALEABLE), `dee4ea27` (order line explicit OUTLET_B)
- Live: #143 A+B @ A1-A-2; offers 99/1; returns B on normal pick locs; planning on_hand = saleable
- Junk UAT orders left: #1280â€“1282 (SALEABLE mis-bound before fix) â€” cancel manually if needed

**OMS panel RMZ disassembly reuse (2026-08-16) â€” on main via 4085e3fa.**
- Reuse WMS SSOT: `ManufacturedRecoveryIntakePanel` + `BundleReturnLinePanel` on `ReturnsReturnDetailPage`
- Finalize payload merges `stock_intake_mode` / `fg_intake_qty` / `disassembly_qty` / `component_recoveries`
- â€žRozdzielenie iloĹ›ciâ€ť = commercial A/B/C/reject split (same as WMS) â€” not a second disassembly model
- GAP: component recovery = accepted(SALEABLE)+scrap only; no per-component B/C disposition yet (same as WMS)
- Partial MIXED (FG+disassemble) supported by existing WMS panel
- Tests: BE manufactured/bundle 46 PASS; FE recovery payload 2 PASS

**ETAP 2 A/B/C stock (2026-08-16) â€” implemented, NO commit/push.**
- SSOT grain: `Inventory.stock_disposition` (SALEABLE/OUTLET_B/SERVICE_C); no quality_class column
- P0: planning FG uses `saleable_qty`; gate/readiness pass `required_stock_disposition`; production reserved filtered by disposition
- P1: disposition snapshot + `outlet_available_qty`/`service_available_qty`; list A/B/C; product card location matrix
- Legacy `on_hand`/`available` unchanged (physical A+B+C) for compatibility
- Tests: `test_etap2_abc_stock_model` + disposition/outlet/commercial PASS
- ETAP 1 returnsâ†’Z-PZâ†’putaway untouched

**Returns Z-PZ ETAP 1 (2026-08-16) â€” DONE on main (`455fa73a`).**
- SAFE: no global collectiveâ†’false; only tenant_id=1 Z_PZ per-RMZ; other tenants unchanged; collective opt-in
- Live UAT tenant=1: RMZ-2026-28 â†’ Z-PZ-2026-3 (#140) NEW (not append to Z-PZ-2026-2)
- Mix: PrzyjÄ™toâ†’SALEABLE, Bâ†’OUTLET_B, rejectedâ†’no line; putaway A1-A-2 keeps disposition; inv qty=1 each
- Link RMZ header `Z-PZ-2026-3` â†’ `/wms/putaway/140`; putaway UI shows PEĹNOWARTOĹšCIOWY + USZKODZONY (B)
- Tests: 17 PASS (`test_rmz_mix_z_pz_dispositions` + migration safety)
- ETAP 2: RESERVABLE/ATP/legacy available â€” implemented in this session (see above)

**Carrier template_type in Label System editor â€” FIXED (2026-08-16).**
- ROOT: orphaned preset JSON + Variables UI group mis-label; production template likely still `location` in DB (FE correctly shows Lokalizacja â€” re-create/import as carrier or change TYPâ†’NoĹ›nik and save)
- Wired `CARRIER_LABEL_HORIZONTAL` into presets/ready catalog; UI group â€žNoĹ›nikâ€ť; CSV carrier group
- SSOT already had carrier in TEMPLATE_TYPE_OPTIONS / LABEL_DESIGNER_TYPE_OPTIONS / PREVIEW_SAMPLES / BE API
- vitest 6 + BE 2 + tsc/build PASS

**Carrier labels + QR PDF fix â€” PASS, on main (2026-08-16).**
- E2E: CarrierLabelPrintModal â†’ POST /labels/carrier â†’ render_label_template â†’ PDF (parity CartLabelPrintModal / PDF viewer; no HTML fallback)
- QR ImageReader + transparent fill/strokeWidth=0; preset 100Ă—50; decode ESP:carrier:6
- Tests: BE 14 + FE vitest 11 + tsc + npm build PASS

**Paper produce UX (2026-08-16) â€” FE-first, pushed main.**
- PaperProduceLineCard: plan/done/remaining + qty input (default=remaining) + ZatwierdĹş; +1/+5 secondary only
- Traceability: effective `production_trace_require_*` from BAT/MO serialize (SSOT policy); shared `productionFgIdentity`
- Progress: single-line = only card; multi = header aggregate + line; â€žZakoĹ„cz produkcjÄ™â€ť only allProduced fallback
- Lifecycle/PW/putaway/production-progress unchanged

**Deploy + re-UAT A multi-LOT PASS (2026-08-16).**
- Commits: `375348b2` multi-LOT collection; `7af1981c` receipt-layer costing â†’ pushed `main`
- healthz/readyz OK; FE live; API exposes `actual_material_cost`
- UAT A: BAT/2026/0023 â€” pick LOT-AĂ—6 then LOT-BĂ—4 @ B1-A-1 â†’ both 200, disc=0, LOT-B=4 after first, RW/2026/08/28 2 linie (6+4), collected=10
- Live cost on RK stock: RW unit 1.13 (karta produktu), total 11.3; dual-PZ weighted = test_A PASS (brak bezpiecznego live PZ w tej sesji)

**Multi-LOT collection pick fix (2026-08-16), bez commit/push â€” gotowe do re-UAT A.**
- ROOT: `system_qty` = agregat lokalizacji â†’ suggested za duĹĽy â†’ discrepancy write-down bez LOT
- FIX: `system_qty`/consume/discrepancy scoped do wybranego LOT(+expiry+SN); partial gdy remaining>slice bez write-down
- FE: picker LOT gdy multi-LOT; suggested z qty partii; `expiry_date` w API
- Testy Aâ€“G `test_production_collection_multi_lot` + multi_location + rw_lot_lines: 19 PASS
- RW split nietkniÄ™ty; nastÄ™pny krok: tylko UAT A (LOT-A 6 â†’ LOT-B 4)

**Material cost FIFO receipt layers (2026-08-16), bez commit/push.**
- Audyt: dotychczas RW stampowaĹ‚ `get_product_current_cost` (katalog), nie warstwy przyjÄ™cia
- Silnik: `material_cost_layers.ReceiptFifoCostLedger` â€” koszt podÄ…ĹĽa za fizycznym consume; fallback `purchase_price`
- Freeze: `material_cost_json` na MO/BAT; ISSUE `unit_price_net`; RW line = weighted slice cost
- UI: rzeczywisty koszt materiaĹ‚Ăłw + hint fallback; Â§20 TRYB_PRODUKCJI zaktualizowany
- Testy Aâ€“J: `test_material_cost_fifo` 10 PASS; FG/PW regresja PASS; tsc/build w toku

**FINAL UAT Produkcja v1 â€” STOP na A (2026-08-16).**
- Prefight OK: healthz/readyz, origin/main=`a55eda02`, frontend live
- A dual-pick LOT-A=6 then LOT-B=4 â†’ FAIL: `discrepancy` write-down w `append_collection_location_pick` zjada drugi LOT (suggested=remaining, bez filtra LOT)
- Diag one-shot pick 10 â†’ RW/2026/08/27 ma 2 linie (LOT-A/6 + LOT-B/4) â€” model RW OK
- Bâ€“F nie uruchomione; bez auto-fix; leftover: BAT/2026/0022 `in_progress`, BAT/21 cancelled

**Â§26 fixture fix + commit/push (2026-08-16).**
- ROOT: stale sqlite fixtures missing `production_fg_outputs` (+ companion tables) after FG delta SSOT
- Fixed `test_production_packing_handoff` + `test_production_orders_fg_fulfillment` fixtures only
- Commit `a55eda02` on `main` pushed; backend `/healthz`+`/readyz` OK; frontend `sasist.vercel.app` HTTP 200

**Â§26 Produkcja v1 backlog â€” wdroĹĽony (2026-08-16), bez commit/push.**
- Cleanup: usuniÄ™to UI â€žLokalizacja docelowaâ€ť + martwy `terminal_required` round-trip; usuniÄ™to path zamiennikĂłw
- RW: linia = PRODUCTĂ—LOTĂ—expiry (MO+BAT); SN tylko audit/ops
- Planning: `combined = max(0, orders+targetâ’stockâ’pipeline)`; historia = realized sales (packed/shipped/done)
- Lista pobrania: CTA + DTE `production_material_pick_list` + queue print
- Docs TRYB_PRODUKCJI zaktualizowane; Â§26 zostawia tylko zamienniki jako dalszy rozwĂłj
- Testy: planning CASE Aâ€“I PASS; RW LOT PASS; collection PASS; vitest Production 67 PASS; tsc PASS; npm build PASS

**Forecast strategies: only 3 (2026-08-16).**
- Removed MEDIAN / MAX_DAILY / AI_SMART from BE+FE; SSOT: PERIOD/WEIGHTED/WEEKDAY
- UI: Standardowa / UwzglÄ™dniaj trend / WedĹ‚ug dni tygodnia; no legacy notice
- Unknown strategy in JSON â†’ PERIOD_AVERAGE; local sqlite: no old values found
- pytest planning PASS; vitest 3 PASS; tsc+build PASS

**FE auto-pack double toast fix (2026-08-16).**
- Root: `registerProductionQty` handled `packing_handoff` after progress **and** after finish (two owners)
- Fix: `selectPackingHandoffCarrier` â†’ one call; session fingerprint idempotency (no debounce); skip buffer toast when auto_pack
- vitest 6 PASS; tsc PASS; npm build PASS; BE untouched

**UAT Aâ€“D auto-pack PASS E2E (2026-08-16); follow-up = double toast only.**
- Deploy `4a813d60`; print_label OFF respected; B missing-labelâ†’packing; C multi all labels; D mixed all-or-nothing
- Observation: identical auto-pack success toast Ă—2 despite 1Ă— PACKING_AUTO_AFTER_PRODUCTION / PACKING_FINISHED

**WMS Produkcja â€” WyglÄ…d terminala (display) egzekwowany (2026-08-16), bez commit.**
- SSOT: `terminal_display` via `useWmsProductionSettings`
- Shared: `productionTerminalDisplay` + `WmsProductionProductIdentity`; `WmsProductTaskCard`/`WmsProductCard` showImage/showTitle
- Wired: kolejki, header pobierania, karty collect/execute, modal rejestracji, ActiveBatchBar
- BE: `product_barcode` + identity fields na queue/header/MO/BAT lines (bez migracji)
- GAP: `show_target_location` â€” brak target w API pobierania/produkcji (nie renderuje siÄ™)
- vitest display 8 PASS; tsc PASS

**Status wejĹ›ciowy â€” zajÄ™te grayed (produkcja = zbieranie) (2026-08-16).**
- Reuse `OrderUiStatusField`/`OrderUiStatusPicker.disabledStatusIds`; produkcja Ĺ‚aduje teĹĽ ĹşrĂłdĹ‚a zbierania
- Zbieranie: zajÄ™te widoczne+disabled (wczeĹ›niej ukrywane); wĹ‚asny status przy edycji dostÄ™pny
- Backend juĹĽ blokowaĹ‚ duplikat `source_status_id` (prodâ†”picking); test kolizji ze zbieraniem
- FE build + pytest SSOT PASS

**Pomoc kontekstowa (i) â€” Ustawienia WMS Produkcja (2026-08-16).**
- KaĹĽde ustawienie: `SettingInfoButton`; strategie z (i) przy opcjach; AI_SMART disabled
- UsuniÄ™te subtitle sekcji + opis pod â€žProdukcjaâ€ť; skrĂłcone labelki (rezerwacje/prognoza)
- FE build PASS

**Konfiguracja produkcji UX (2026-08-16), bez commit/push.**
- Uproszczony UI: Status wejĹ›ciowy | Realizacja; bez Nazwy/Aktywnej/opisĂłw
- Status wejĹ›ciowy edytowalny (OrderUiStatusField); PUT wysyĹ‚a `source_status_id`
- Labelki: WMS / ZmieĹ„ status / PrzejdĹş do pakowania; `is_active` ukryte, zawsze true przy zapisie
- Backend: `ProductionConfigUpdate.source_status_id` (bez migracji); testy SSOT + FE build PASS

**Karta produktu â†’ Produkcja/Receptura UX (2026-08-16), bez commit/push.**
- Widok prezentacyjny 1:1: hero FG + stats, tabela skĹ‚adu, flow INPUTâ†’Produkcjaâ†’OUTPUT, prawa kolumna
- DomyĹ›lnie bez formularza; Edytuj / UtwĂłrz / Dodaj skĹ‚adnik â†’ CompositionVisualEditor
- TĹ‚o biaĹ‚e; header/taby/Historia czynnoĹ›ci nietkniÄ™te; tsc + build PASS

**Produkcja â€” spĂłjny Activity Log + WMS audit (2026-08-16), bez commit/push.**
- 3 warstwy: Historia (`activity_events` + `record_domain_activity`), Logi WMS (reuse ops), bez nowego debug SSOT
- Nowe `PRODUCTION_*` + formatter `production_activity_format`; OUTPUT_REGISTERED per delta (`mo:{id}:output:{output_id}`)
- Writers: create/cancel/planning/batch/reserve/shortage/Phase8/output/PW/putaway/demand detach
- WMS audit RW/PW: LOT + expiry; FE: BAT detail Historia; link MO/BAT w ActivityLogTable
- Testy: `test_production_activity_log` + domain activity + FG register; tsc/build PASS

**Partial FG + multi-LOT per delta (2026-08-15/16), bez commit/push.**
- SSOT: `production_fg_outputs` + PW-per-delta; `register_produced_quantity` dla BAT/MO
- BAT/PLANNING/MANUAL: kaĹĽda rejestracja â†’ real FG/PW â†’ putaway; LOT/SN per delta
- ORDERS: buffer bez zmian semantycznych; multi-LOT = nowa linia PW
- `fg_traceability_json` v2: genealogia SN, bez lock LOT na caĹ‚e zlecenie
- FE: usuniÄ™to blokadÄ™ partial-only-ORDERS; `supportsPartialFgStock=true`
- Testy: `test_production_fg_output_register` Aâ€“I + regresje finish PW

**Planowanie â†’ Rekomendacje â†’ tworzenie + partia masowa UX (2026-08-15), bez commit/push.**
- CTA: â€žUtwĂłrz zlecenieâ€ť; focused entry z rekomendacji (1 produkt, bez katalogu); â€žZmieĹ„ produktâ€ť
- Partia masowa: status materiaĹ‚Ăłw przy kaĹĽdej pozycji z SSOT preview + BOM; shared components OK
- Create nie blokowane na brakach; tsc/build + unit tests PASS

**WMS Produkcja UX â€” 2 kolejki + Zarejestruj produkcjÄ™ (2026-08-15), bez commit/push.**
- UsuniÄ™to tab Rozlokowanie z WMS Produkcji (`/wms/production/putaway` â†’ `/wms/putaway`).
- Tabs: Pobieranie komponentĂłw | Produkcja; CTA modal z domyĹ›lnÄ… pozostaĹ‚Ä… iloĹ›ciÄ….
- GAP: czÄ™Ĺ›ciowy FG stock tylko ORDERS; BAT/PLANNING wymaga peĹ‚nej pozostaĹ‚ej iloĹ›ci (finishâ†’PW).
- Multi-LOT na jednej MO/BAT: zablokowane przez `fg_traceability` lock â€” GAP.
- tsc + build + testy traceability: PASS.

**UAT Production traceability MVP â€” STOP na LOT RW (2026-08-15), bez kodu/commit.**
- Pre: migracje OK (API `traceability`), UI IdentyfikowalnoĹ›Ä‡ dostÄ™pna, default OFF, PZ niezaleĹĽne (smoke PZ#103/104 + putaway).
- UAT A partial: BAT/2026/0019; collect bez LOT â†’ 409 wymagany; z LOT â†’ OK; inventory LOT skonsumowany.
- **STOP LOT RW:** RW/2026/08/20 â€” `StockDocumentItem.batch_number=""`, movements `batch_number=null` mimo selected LOT i spadku stocku LOT.
- Settings przywrĂłcone: production TRACE=OFF; track_batch produktĂłw UAT cofniÄ™te.
- UAT Bâ€“E nie startowane.

**Produkcja ERP â€” polskie URL-e i kompaktowe akcje (2026-08-15), bez commit/push.**
- Kanoniczne FE: `/produkcja/{zlecenia,planowanie,receptury,materialy/braki,serie/:id,historia,analiza-kosztow,realizacja}`; `/production/*` â†’ redirect.
- Detail: â† IconButton; Printer/FileText/XCircle; CTA `Kontynuuj` + Play; banner = businessLabel (status tylko w badge).
- Braki: kolumna â€žZleceniaâ€ť, chevron expand, `UtwĂłrz zapotrzebowanie` + PackagePlus â€žDodaj do zamĂłwienia towaruâ€ť.
- `ProductionErpModuleLayout` FULL_PAGE_DETAIL = `/produkcja/serie|receptury`.
- `tsc --noEmit` + `npm run build`: PASS. Bez commit (rĂłwnolegĹ‚a traceability).

**Production traceability MVP frontend (2026-08-15), bez commit/push.**
- Ustawienia WMS: osobna sekcja IdentyfikowalnoĹ›Ä‡, OFF/CONFIGURED + LOT/SN/expiry; legacy TRACE ukryte z terminal required.
- Karta produktu: capability track_* + produkcyjne override INHERIT/REQUIRE/OFF, zapis z ochronÄ… REQUIRE bez capability.
- Collection WMS/PAPER wymusza wymagane LOT/SN (SN qty 1); aktywne ekrany wykonania przekazujÄ… FG batch/expiry/serials.
- `npm run build` + `git diff --check` OK; globalny typecheck nadal FAIL na licznych zastanych bĹ‚Ä™dach, bez nowych bĹ‚Ä™dĂłw traceability.

**Production traceability MVP backend core (2026-08-15), bez commit/push.**
- NiezaleĹĽny resolver produkcji (`production_traceability_policy`), global settings + product overrides; receiving SSOT bez zmian.
- FG identity snapshots dla MO/BAT, progressive serials, batch/expiry w PW/inventory, serial registry oraz RW `StockOperation.serial_number`.
- Migracje/startup + schema generation 18; API settings/product/progress/finish rozszerzone.
- Testy traceability + production execution/schema/FG regressions: PASS.

**Produkcja â€” formatProductionQuantity (2026-08-15), bez commit.** Display qty/stock floored via shared helper; money/forecast/API inputs untouched. Backend untouched.

**Produkcja â€” kreator zlecenia + qty integer (2026-08-15), bez commit.**
- Operator assign: BRAK API (`assigned_user_id`) â€” UI pokazuje â€žDowolny operatorâ€ť + SettingInfoButton; nie fake select
- `formatProductionQuantity` (floor display) w ERP Produkcji
- Kreator: skĹ‚ad receptury live, rekomendacje bez pustych kart, materiaĹ‚y komplet/braki
- Backend untouched

**Produkcja â€” SettingInfoButton + Do zamĂłwieĹ„ (2026-08-15), bez commit.** Pulpit/Planowanie reuse `SettingInfoButton`; karty bez dublowania CTA; ORDERS label â†’ Do zamĂłwieĹ„. Backend untouched.

**Produkcja â€” language/UX polish gotowy do review (2026-08-15), bez commit.** Frontend-only: etykiety ĹşrĂłdeĹ‚, receptura bez wariantĂłw/marĹĽy, Planowanie/Pulpit tooltips. Backend/lifecycle untouched.

**Produkcja v1 = PASS E2E (zamkniÄ™ta 2026-08-15).** Nie ruszaÄ‡ lifecycle bez osobnego powodu.

**v1.1 follow-upy (tylko zapis, bez implementacji):** `memory/production-v1.1-followups.md`
1. BAT CTA â€žRozpocznij zbieranieâ€ť â€” deep-link bez `start-collecting` (vs `openJob`)
2. BAT completed â€” nie pokazuj â€žMateriaĹ‚y nie sÄ… jeszcze zarezerwowaneâ€ť po RW

**UAT BAT control PASS E2E â€” Produkcja v1 PASS E2E (2026-08-15):**
- Fresh **BAT/2026/0017** id=17 / 75894Ă—1 / BOM#8; releaseâ†’collectingâ†’RW **#98** (â’3 comp)â†’prod 1/1â†’PW **#99**â†’WMS putaway A1-A-1â†’**completed**
- Brak packing; 1Ă—RW/1Ă—PW; znika z ZleceĹ„; w Historii PARTIA; szczegĂłĹ‚y OK

**UAT PLANNING auto-replenishment PASS E2E (2026-08-15):**
- Config: auto ON, coverage=1d, interval=hourly; scheduler tick utworzyĹ‚ MO
- Produkt **75894** / id=383 / BOM#8 (comp 182Ă—3); need = 0.0333â†’**0.03** (targetâ’on_handâ’free_pipeline); ORDERS pipeline nie obniĹĽa need
- **MO/2026/0022** id=24 `source_type=PLANNING` qty=0.03; 2./3. run â†’ created=0, brak bump/duplikatu
- Soft-hold ORDERS: brak open ORDERS MO dla SKU (order_demand=1 bez MO) â€” path nieadversarial; PLANNING bez order_sources
- Lifecycle: plannedâ†’releaseâ†’collectingâ†’RW **#96**â†’productionâ†’`awaiting_putaway`â†’PW **#97**â†’WMS putaway A1-A-1â†’finalizeâ†’**completed**; packing_handoff=null; brak BAT
- Config zostawiony ON (hourly / 1d) na prod tenant1/wh1

**UAT PRINT PASS E2E (2026-08-15):**
- Config #9 chwilowo PRINT (potem restored WMS); MO **MO/2026/0021** / id=23 / ORDERS #1256
- Preview PDF side-effect free; start â†’ `execution_interface=PRINT`, RW **#94** once, ST-003 A1 â’2; double-start idempotent
- Reprint PDF bez RW/consume; progress 0.5â†’1 in_progress; finish â†’ completed; FG buffer DOCK-IN (+1); PW#95 putaway/relocation DONE, **nie** w kolejce rozlokowania; source#22 fulfilled; order â†’ **Pakowanie#8**
- resolve-scan number/id OK; finish retry 400; config restored WMS

**UAT A clean retest po 97321395 â€” PASS E2E (2026-08-15):**
- Cleanup: withdraw UAT leftovers 1266/1267/1269 (Produkcjaâ†’Nowe); MO cancel cascade; MM free B1â†’DOCK; brak PRODUCTION_ORDER ST-003; pickableFree=0
- Fresh **#1256 / id=1270** / SourceItem **#22** / PZ **#91**
- DOCK-only ST-003Ă—2: BRAKI, shortage, allocatable=0, brak AUTO_RESUMED
- Putaway Ă—2 â†’ A1-A-1: reattach #22 reserved, PRODUCTION_ORDER **#82Ă—2**, materials_reserved=true, Produkcja#12, AUTO_RESUMEDĂ—1 (MO/2026/0021)
- Idempotencja (MM notify roundtrip): nadal 1Ă— AUTO_RESUMED, ta sama res #82, planned=1
- Poprzedni #1255: DOCK REGRESSION PASS / PUTAWAY RETRY NOT VALID (ENV CONTAMINATED) â€” nie FAIL kodu

**UAT A po 97321395 â€” STOP KROK 2 (2026-08-15) â€” ENV CONTAMINATED (nie FAIL kodu):**
- Order **#1255 / id=1269** / SourceItem **#21**; PZ **#89** ST-003Ă—2
- KROK1 DOCK-only: PASS â€” BRAKI, shortage, allocatableâ‰0, brak AUTO_RESUMED, brak PRODUCTION_ORDER
- KROK2 putaway: analysis available=2 vs MO demand 4 (leftover sources #19/#20) â†’ NOT VALID
- STOP â€” bez PRINT/PLANNING/BAT; bez kodu

**Fix materials ATP + Phase 8 reserved semantics (2026-08-15) â€” 97321395:**
- SSOT: `production_allocatable_qty` (= allocate eligibility; DOCK wykluczony przy putaway)
- `component_stock_breakdown.available_qty` z allocatable, nie warehouse_on_hand
- material validation: reserved dopiero po `REFRESHED`+`materials_reserved`; fail â†’ shortage/BRAKI
- AUTO_RESUMED tylko przy source `reserved` AND `materials_reserved=true`
- Testy: `test_production_material_allocatable_phase8.py`

**Diagnoza materials po Phase 8 (2026-08-15) â€” bez fixa:**
- Root: asymetria ATP â€” `analyze_composition_quantity`/`warehouse_on_hand` liczy DOCK; `allocate_product_quantity` wyklucza DOCK (`requires_putaway`)
- `apply_material_validation`: sourceâ†’`reserved` **przed** `refresh`; przy `ValueError` w allocate â†’ `RESERVE_FAILED` / `materials_reserved=false`, source zostaje `reserved`
- Phase 8 `AUTO_RESUMED` tylko gdy ACTIVE source â€” **nie** sprawdza `materials_reserved`
- Case #1253: planned=2 â†’ need ST-003Ă—4; dock w analizie; pickable zablokowane â†’ brak PRODUCTION_ORDER

**UAT A Phase 8 retest po 958fdb19 â€” STOP (2026-08-15):**
- Order **#1253 / id=1267** / item 2122 / ST-001Ă—1; SourceItem **#20**
- KROK1: BRAKI#4 PASS; brak nadpisania awaiting; MO/8 agregacja; source#20 shortage
- KROK2/3: PZ#88 receive/putaway ST-003 â†’ AUTO_RESUMED; **same #20** reserved; reattached; Produkcja#12
- **FAIL:** `materials_reserved=false`; brak PRODUCTION_ORDER reservation ST-003Ă—2 (tylko obce SALES_ORDER #72/#73)
- Idempotencja czÄ™Ĺ›ciowa: 2. notify (putaway) bez 2. AUTO_RESUMED
- STOP â€” bez PRINT/PLANNING/BAT

**Fix Phase 8 vs gate (958fdb19) â€” 2026-08-15:**
- BRAKI wygrywa nad awaiting po ALL_SHORTAGE
- Reattach shortage SourceItem z cancelled MO (jeden demand)
- Testy collision UAT #1266 PASS; 89 related tests PASS
- Po deploy: ponĂłw tylko UAT A Phase 8 (bez PRINT)

**UAT v1 domkniÄ™cie STOP na Phase 8 (2026-08-15):**
- Case #1266 / item 2121 / ST-001 BOM ST-003Ă—2
- PRE: source#18 shortage, MO/7 cancelled ALL_SHORTAGE; gate nadpisaĹ‚ BRAKIâ†’awaiting#13 (activity 476 mĂłwi BRAKI)
- P8 notify ST-003+2: RESTORED â†’ source#19 reserved na MO/8, UI Produkcja#12, res#69Ă—2, activity AUTO_RESUMED
- **FAIL:** leftover SourceItem#18 nadal `shortage` (duplikat obok #19 reserved)
- STOP â€” bez UAT B/C/D

**Audyt Produkcja v1 (2026-08-15, read-only):**
- Werdykt: gotowa do normalnego uĹĽycia Ĺ›cieĹĽki ORDERS+WMS (Fazy 1â€“3 PASS E2E) + BAT lifecycle; bez hard blockerĂłw kodu
- Warunek ops: `FEATURE_PICKING_ENTRY_READINESS_MODE=active` + poprawny Konfigurator (awaiting, buffer, after)
- Follow-up: BAT/MO UX, ERP/PAPER clutter, logi peĹ‚ne na karcie, UAT PLANNING/PRINT, Analiza KPI
- Nie ruszaÄ‡: gate/ATP/SALES_ORDER/Phase3 detach/allocator/buffer ORDERS

## Active

**Production ERP UX rebuild (frontend only, 2026-08-15) â€” DONE lokalnie, bez commit/push:**
- Pulpit / Zlecenia / Planowanie / Receptury / MateriaĹ‚y / Historia / Analiza kosztĂłw
- SSOT CTA/statusĂłw bez zmian (`productionOperationalState`); backend lifecycle nietkniÄ™ty
- Nowe thin: `ProductionProgressCell`, `ProductionSourceTypeBadge`
- UsuniÄ™te fake KPI (â€žâ€”â€ť, marĹĽa, Ĺ›redni czas, efficiency na Analizie)
- `tsc` + `npm run build` OK; widoczne po deploy FE / local Vite

**Produkcja v1 = PASS E2E (zamkniÄ™ta 2026-08-15).** Nie ruszaÄ‡ lifecycle bez osobnego powodu.
- Legacy #1251 = stary stan sprzed fixa (nie regresja detacha); allocator SAFE (source#15 `shortage` poza fulfillable)
- Historical SO overbook: B3-C-2 (#65), B3-B-3 (#54) released via reservation service; po cleanup true SO overbook=0
- Fresh #1252 / MO/6: collecting â†’ external +1 B3-A-4 â†’ SOURCE_DETACHED_STARTED_MO; UIâ†’WĂłzki#6; SALES#68; planned=1; finish MO â†’ free FG @ DOCK-IN; brak FE_PICK/pick alloc
- **Fazy 1â€“3 readiness/production fallback = PASS E2E**

**Fix P0/P1 (fa704be5) â€” wdroĹĽone na prod:**
1. `exclude_production_order_id` â€” wĹ‚asna PRODUCTION_ORDER nie blokuje collecting
2. `pickable_free_capacity_*` â€” nowe SALES_ORDER bez overbook
3. Started MO + full external FG â†’ SourceItem `cancelled` (detach) bez shrink planned/RW/mats
4. `allocate_produced_delta` â€” remaining demand â†’ free FG
5. MO finish collecting: committed slices (bez double-consume)

**UAT started MO â€” PARTIAL (przed fixem):**
- Finish MO BLOCKED: wĹ‚asna res MO traktowana jak obca (P0.1)
- Overbook B3-C-2 (P0.2); ryzyko double fulfill (P1)

**UAT partial shrink 2â†’1 PASS (#1249 / id=1262) â€” 2026-08-15:**
- PRE: awaiting, source#13 shortage req=2, SALES=0, freeATP=0, MO/4 planned/draft
- EVENT: putaway +1 ST-001 â†’ B3-C-2 (nie BUFFER)
- POST: res #62=1, req=1, status=shortage, awaiting, DEMAND_REDUCED #505, planned=5 (ACTIVE-only SSOT)
- #1248 = FULL COVER PASS (nie dowĂłd fail partial)
- **Next:** UAT started MO (w toku / blocked finish)

**UAT Faza 3 resume po 51549091 â€” #1248 FULL COVER (2026-08-15):**
- Deploy Active: *Napraw redukcjÄ™â€¦ przy shortage*
- #1248 miaĹ‚ juĹĽ res=1; +1 pickable â†’ full cover â†’ cancelled / WĂłzki / DEMAND_CANCELLED
- Przeklasyfikowane: FULL COVER RECONCILIATION PASS (nie fail partial 2â†’1)

**Fix Phase 3 shortage shrink (2026-08-15):**
- Root: `shortage` poza ACTIVE â†’ reduce nie znajdowaĹ‚ SourceItem (#1248 UAT)
- `PRODUCTION_ORDER_SOURCE_ITEM_RECONCILABLE_DEMAND_STATUSES` (+shortage) tylko dla Phase 3 / reduce
- ACTIVE bez zmian (trigger idempotency / material allocation)
- Partial shrink: requested 2â†’1, status zostaje shortage; planned tylko z ACTIVE

**UAT Faza 3 edge â€” STOP (2026-08-15):**
- A BLOCKED_MIXED #1246: A-only PASS; full READY PASS
- B FG3 #1247/#1248: alloc 2+1 PASS, no overbook PASS, priority PASS
- **FAIL PARTIAL SHRINK:** #1248 SourceItem status=`shortage` â†’ `requested_quantity` zostaĹ‚o **2** (oczekiwane 1); brak DEMAND_REDUCED. Root: ACTIVE_STATUSES bez `shortage`.
- C STARTED MO: **nie uruchomione** (STOP)

**UAT Faza 3 podstawowy â€” PASS (2026-08-15) na #1245/id=1258:**
- Event: MM putaway DOCK-INâ†’B3-B-1 (+1 ST-001), reason `mm_putaway` (nie koĹ„czono MO)
- Auto: reservation #43 qty1; source #9 cancelled; MO planned 4â†’3; status â†’ WĂłzki#6; GATE_READY; w kolejce picking multi
- Brak kradzieĹĽy: sales193 #37=7, #39=3; B #41=1
- Activity: DEMAND_CANCELLED + RETURNED_TO_PICKING (PL, bez enumĂłw)
- Idempotencja: ponowny mm_putaway (buffer B3-A-5) â†’ #1245 bez zmian / bez duplikatĂłw
- **STOP** â€” bez production fulfillment / started MO / BLOCKED_MIXED / multi-order FG3

**Faza 3 FG availability retry (2026-08-15):**
- Notify Phase 8 â†’ takĹĽe `on_fg_availability_increased`
- Awaiting orders: full-order re-gate â†’ reserve FG â†’ reduce/cancel draft MO â†’ `return_picking_status_id`
- Started MO (collecting/in_progress) bez shrink; BLOCKED_MIXED bez return
- SALES_ORDER release emituje availability notify
- Testy: `test_picking_entry_availability_retry_phase3.py`

**UAT Faza 2 â€” KROK 4/5 PASS (2026-08-15):**
- #1245 Logi: czerwony blocker z ST-001 qty + MO/2026/0004; bez enumĂłw
- Idempotencja: re-entry statusâ†’WĂłzki#6 â†’ z powrotem awaiting; planned=4; 1 SourceItem; sales193 nadal 7+3; brak duplikatĂłw eventĂłw 473/474
- **Faza 2 UAT = PASS** â€” wolno startowaÄ‡ FazÄ™ 3

**UAT Faza 2 â€” Ĺ›rodowisko (2026-08-15):**
- Status **Oczekuje na produkcjÄ™** id=13; ProductionConfig #9 awaiting=13
- Railway: `FEATURE_PICKING_ENTRY_READINESS_MODE=active`
- ZamĂłwienia: #1243/#1244/#1245; ST-001 ATP B3-C-1 reserved=10; MO `MO/2026/0004` planned=4

**Faza 2 picking-entry gate (2026-08-14):**
- `FEATURE_PICKING_ENTRY_READINESS_MODE=off|dry_run|active` (domyĹ›lnie off; legacy DRY_RUN=1 â†’ dry_run)
- Active: reserve FG + MO missing-only + `status_awaiting_production_id`
- Snapshot powrotu: `import_metadata_json.return_picking_status_id`
- **Nie** wdraĹĽaÄ‡ Fazy 3 (auto retry / powrĂłt awaitingâ†’picking / shrink MO)

**Faza 1 readiness + SALES_ORDERâ†”picking (2026-08-14):**
- SSOT: `backend/services/wms_picking_atp.py`
- Reserve API: `sales_order_fg_reservation_service` (jeszcze bez auto z gate)
- Dry-run: `FEATURE_PICKING_ENTRY_READINESS_DRY_RUN=1` â†’ log `[picking_entry_readiness]`
- **Nie** wdraĹĽaÄ‡ jeszcze Fazy 2 (MO / awaiting / allocate flag)

**Konfigurator produkcji WMS (2026-08-14):**
- SSOT odczytu/zapisu: `production_config_query` / `production_config_service`
- API: `/wms/settings/production-configs`
- Storage: `picking_config` + `is_production_mode` (bez osobnej tabeli â€” FK MO)
- UI: Ustawienia WMS â†’ Produkcja â†’ Konfigurator produkcji; zbieranie bez trybu produkcji

**Ujednolicona historia Activity Log â€” Zwroty + Produkcja (2026-08-14):**
- Helper `record_domain_activity` + correlation_id idempotency (jeden event, wiele linkĂłw)
- Zwroty: CREATE/DECISION/INTAKE/RECOVERY/SCRAP/Z-PZ/PUTAWAY/FINALIZED z actor
- Produkcja milestones: RELEASEDâ€¦COMPLETED (+ RW/PW); bez duplikacji PRODUCTION_ORDER_*
- FE: RMZ Dziennik â†’ ActivityLogPanel `return`; Order/Product istniejÄ…ce panele; MO detail timeline

**FIX UAT blocker STOCK DISASSEMBLE Z-PZ (2026-08-14):** `_any_planned_lines` nie widziaĹ‚o accepted `ReturnLineBundleComponent` przy FG=0 â†’ ensure skip â†’ finalize zamykaĹ‚ RMZ bez dokumentu. Gate + `ensure_required_*` + assert przed transition.

**STOCK bundle disassemble on return (2026-08-14):** FG vs Rozmontuj; snapshot `OrderLineBundleComponent`; MIXED fg+dq; shared Z-PZ emission untouched.


**WspĂłlna emisja Z-PZ odzysku komponentĂłw (2026-08-14):** commit `8157f91e` â€” `ComponentReturnRecoveryLine` + adapters + `append_accepted_component_lines`; bez migracji modeli.

**P1 produkcji domkniÄ™te (2026-08-14):** commit `e96b749d` â€” KPI brakĂłw = SSOT kolejki MateriaĹ‚Ăłw; etap â‰  OpĂłĹşnione; planowanie formula; polish MateriaĹ‚y/Zlecenia/Pulpit.

**FIX: bom_preview null name/sku na RMZ (2026-08-13):**
- Root cause: `bom_preview_for_product` enrichowaĹ‚ name/sku, `_rmz_line_to_read` nie przekazywaĹ‚ do `WmsBomPreviewComponentRead`
- FE panel pokazuje nazwÄ™ + SKU; fallback `#id` tylko gdy brak danych
- returns tests 53 passed; FE build OK

**UX PLAN (no impl): ModuĹ‚ Produkcja â€” przeglÄ…d widokĂłw (2026-08-13):**
- Role ekranĂłw: Pulpit=attention, Zlecenia=in progress, Planowanie=what to make, Receptury=BOM, MateriaĹ‚y=blockers, Historia=done, Analiza=costs
- Kluczowe luki: Pulpit â‰ Zlecenia; MateriaĹ‚y `missing_qty=0` nadal w kolejce + agregacja `max` zamiast sumy; Analiza â€žKoszt materiaĹ‚Ăłwâ€ť=ÎŁ(koszt recepturyĂ—stan FG), â€žEfektywnoĹ›Ä‡â€ť=finished_today/workload; Historia bez czasu realizacji w API summary
- SzczegĂłĹ‚y planu w rozmowie â€” bez FE/BE implementacji

**IMPL: Odzysk komponentĂłw przy zwrocie FG (2026-08-13):**
- Settings: `manufactured_component_recovery_mode` OFF|OPTIONAL|REQUIRED; receipt STANDARD_PUTAWAY|DEFAULT_LOCATION + location_id
- RMZLine: `stock_intake_mode` FG|DISASSEMBLE|MIXED; `fg_intake_qty` + `disassembly_qty`
- Table `rmz_line_component_recoveries` (BOM snapshot); expected = line.qty Ă— disassembly (no waste)
- Z-PZ: FG via fg_intake_qty; components accepted_qty>0; scrap audit-only
- Bundle flow precedence; commercial REJECTED â‰  block recovery; FG posted locks later disassemble
- Service: `returns/manufactured_component_recovery_service.py`; FE: settings + `ManufacturedRecoveryIntakePanel`
- Tests returns/ 52 passed; FE build OK

**DESIGN (no impl): Odzysk komponentĂłw przy zwrocie FG (2026-08-13):**
- Settings: WMSâ†’Zwroty sekcja â€žProdukty produkowaneâ€ť; mode OFF|OPTIONAL|REQUIRED; receipt STANDARD_PUTAWAY|DEFAULT_LOCATION; scrap = NO_STOCK_HISTORY_ONLY (MVP)
- SSOT BOM: `get_active_manufacturing_composition` + `calculate_required_components` (qty+waste/yield)
- Stock: Z-PZ multi-line komponentĂłw (nie PW); reuse receipt/putaway/return-link; wzorzec jak bundle components, osobna tabela recovery
- Handel â‰  magazyn; po poĹ›cie FG disassemble zabronione (MVP)

**FIX: MO ORDERS READY_TO_PACK vs packing (2026-08-13):**
- BE: `source_awaiting_packing_order_count` (projekcja z fulfilled sources + `order_awaits_packing_after_orders_production`)
- FE: READY_TO_PACK / aktywna lista / CTA packing tylko gdy awaiting > 0; fulfilled â‰  packing
- MO lifecycle `completed` bez zmian; po Spakowane/DONE/SHIPPED â†’ COMPLETED / bucket done / brak CTA

**UAT 3 ORDERS â€” FOR UPDATE fix (2026-08-13):**
- `_find_aggregable_mo`: lock bez joinedload; selectinload po FOR UPDATE
- Po deploy: wznowiÄ‡ KROK 1 na czystym Nowe ST-001 (np. #1022) albo wycofaÄ‡ #1092 z Produkcjaâ†’Nowe i ponownie â†’Produkcja

**UAT 3 ORDERS â€” KROK 1 wynik (2026-08-13):**
- Kandydat: **#1092** (Noweâ†’Produkcja), product **193** ST-001, composition **5**, qty **1**, komponent 192 ST-003 avail 12 / need 2, max_producible=6
- Config Produkcja id=12 / picking_config id=9: is_production_mode=true, buffer DOCK-IN, after=OPEN_PACKING, shortageâ†’BRAKI(4), scope=SINGLE_ELEMENT â€” OK
- PATCH ui-status â†’ **200**, status zostaje **Produkcja**, brak BAT, brak 500
- **MO NIE powstaĹ‚o** â€” soft-fail savepoint: `FeatureNotSupported: FOR UPDATE cannot be applied to the nullable side of an outer join` przy `_find_aggregable_mo` (FOR UPDATE + LEFT JOIN line_snapshots)
- Kolejne czyste Nowe ST-001 qty1: 1022, 917, 862, 832â€¦ (po naprawie FOR UPDATE)

**UAT 3 ORDERS â€” FIX deployed path (2026-08-13):**
- Production hook: SAVEPOINT soft-fail (nie truuje PATCH statusu)
- #1158: `shipping_method_id=NULL` (OK); label DHL zachowany
- Produkt 350 (ST-002): **brak** aktywnej manufacturing composition â†’ blocker UAT przed happy-path MO (nie tworzyÄ‡ BOM bez polecenia)
- Po deploy: moĹĽna wznowiÄ‡ Noweâ†’Produkcja tylko po zapewnieniu BOM; bez BOM oczekiwane przejĹ›cie do `status_on_component_shortage` (nie 500)

**UAT 3 ORDERS â€” STOP KROK 1 (2026-08-13):**
- Config OK: status Produkcja (id=12) ma `is_production_mode=true`, buffer DOCK-IN, after=`OPEN_PACKING` (nie STATUS_ONLY)
- PATCH #1158 â†’ Produkcja: HTTP 500 `request_id=5216823b20b84514b4f8b9c7f731c09b` @ 19:38:08 GMT+2
- **DIAG confirmed (Railway):** `PendingRollbackError` po `IntegrityError` / `ForeignKeyViolation` `orders_shipping_method_id_fkey` â€” order 1158 ma `shipping_method_id=59379f8b-â€¦` nieobecny w `shipping_methods`
- ĹšcieĹĽka: `_enter_production` â†’ **NO BOM** â†’ `_move_order_to_shortage_status` (`order_ui_status_id=4`) â†’ `_log_order` `begin_nested` flush â†’ UPDATE orders pada na orphan FK â†’ sesja failed â†’ soft-fail trigger zostawia poison â†’ `db.commit()` w `patch_order_ui_status` = 500
- Nie: material validation / reservation / create MO / commit logic per se â€” **schema/constraint + brak savepoint + NO_BOM mutuje order**
- Kandydaci UAT: #1158 (ST-002), #1152 (ST-003) â€” nadal Nowe; naprawa dopiero na ĹĽyczenie

**Completed CTA â€žZobacz szczegĂłĹ‚yâ€ť (2026-08-13):**
- Na detailu BAT/MO completed: brak martwego CTA (`primaryAction.kind=none`) â€” uĹĽytkownik juĹĽ jest na koĹ„cowym detailu
- Z listy/pulpitu: `view_details` â†’ `/production/batch/:id` lub `/production/orders/:id` (bez mieszania BAT/MO)
- ORDERS completed+fulfilled: nadal â€žPrzejdĹş do pakowaniaâ€ť takĹĽe na detailu

**ProductionBatch â†’ jedno PW (2026-08-13):**
- finish-production tworzy 1 dokument PW z N pozycjami FG (nie PW per produkt)
- Link: `StockDocument.production_batch_id` + wszystkie linie `pw_stock_document_id` â†’ ten sam PW
- Rozlokowanie: standardowy multi-line putaway; BAT completed dopiero po DONE caĹ‚ego PW
- Bez migracji historycznych multi-PW (np. PW/6 + PW/7 dla BAT/0016)

**WMS collection multi-location (2026-08-13):**
- `pick_events[]` per lokalizacja; qty edytowalna; discrepancy + inventory write-down; modal braku
- finish RW z historii lokalizacji; shortage_reported zamyka komponent niepeĹ‚ny

**WMS BAT finish-collecting / confirm pick (2026-08-13):**
- Confirm WMS = inventory commit (`picked_slices`); finish-collecting = RW only (no re-pick / no double-consume)
- Legacy JSON-only GOTOWE cleared on GET `/collection` until re-confirm
- Business 409 â†’ WmsMessageModal on production terminal

**UAT Produkcja â€” ryzyka A/C/D (2026-08-13):**
- A: lista ZleceĹ„ zostawia completed ORDERS z `source_fulfilled_order_count > 0` jako READY_TO_PACK
- C: copy brakĂłw z `lines[].missing` + nazwa (`Brakuje N szt. â€” â€¦ + M kolejnych`)
- D: planned przed release = â€žPrzekaĹĽ do realizacjiâ€ť; po release = â€žPobierz komponentyâ€ť / â€žRozpocznij zbieranieâ€ť
- E (bez naprawy): BAT i MO to osobne encje bez wspĂłlnego FK â€” UI moĹĽe pokazaÄ‡ obie przy rĂłwnolegĹ‚ym utworzeniu; brak jednoznacznego klucza procesu

**UX Produkcja â€” kolejka pracy + getProductionOperationalState (2026-08-13):**
- FE SSOT: `productionOperationalState.ts` â†’ currentStep / description / CTA / progressMeaning / exclusive dashboardBucket
- Pulpit: Wymaga reakcji | Do wykonania | W toku (bez dublowania pozycji)
- Planowanie: usuniÄ™to â€žAktywne partieâ€ť; zostaje rekomendacja â€žco wyprodukowaÄ‡â€ť
- Putaway terminal: â€žRozlokuj produktâ€ť, bez raw NOT_STARTED / â€ždokument PWâ€ť jako gĹ‚Ăłwny komunikat
- ORDERS nadal omija Rozlokowanie (BE `complete_orders_mo_without_putaway` + FE `ordersMoSkipsPutaway`)

**UX pass Produkcja â€” jedna akcja â€žCo dalej?â€ť (2026-08-13):**
- SSOT: `frontend/src/pages/Production/productionNextAction.ts` (+ `ProductionPrimaryActionBar` / `ProductionContextBanner`)
- Pulpit: attention + in-progress first; lista/detail bez rĂłwnorzÄ™dnych CTA etapĂłw
- MateriaĹ‚y hub: `/production/materials/{shortages|reservations|analysis}`
- Bez zmian backendu Faz 1â€“9

**Phase 9 â€” real auto stock replenishment scheduler (2026-08-13):**
- Shared `operational_workers_loop` daemon (Railway single process; no Celery) ticks existing workers + production replenishment
- Settings in `production_forecast_json`: `stock_replenishment_interval` (hourly/3h/6h/daily), `last_replenishment_run_at`
- Job calls existing `run_production_stock_replenishment`; ORDERS shortage retry + soft-hold before PLANNING
- Concurrency: PG advisory lock + `uq_prod_order_planning_open_agg`; pipeline idempotency

**Phase 8 â€” auto shortage retry on component availability (2026-08-13):**
- Central: `on_component_availability_increased` â†’ same `retry_order_driven_production_shortages` as manual
- Candidates narrowed via BOM `ProductionOrderLineSnapshot.component_product_id` (no new table)
- Hooks: reservation release (coalesced), PZ dock (when ATP), putaway, inventory PW+, MO cancel (after status=cancelled)
- Partial + priority via existing material allocation; restore via `apply_order_panel_ui_status` to MOâ€™s `production_source_status_id`
- Suppress notify during mid-refresh / ALL_SHORTAGE MO collapse; advisory lock + source idempotency

**Pipeline + soft-hold + fulfilled re-entry (2026-08-13):**
- Free-stock pipeline (PLANNING/MANUAL/batches) vs order-driven (ORDERS) â€” nadprodukcja uĹĽywa tylko free-stock
- Trigger: `ALREADY_FULFILLED` + outstanding = order_qty â’ historical fulfilled (delta przy wzroĹ›cie qty)
- Soft-hold: `max(0, ORDERS component need â’ active reservations)` per komponent; bez double-count

**Krytyczne regresje UX produkcji (2026-08-13) â€” audyt B.1/B.2/C.1:**
- Terminal WMS: catch + PL toast; sync mutation lock (ref) na +1 / finish collecting / finish production
- ORDERS finish: brak navigate do putaway; toast bufora; MANUAL/PLANNING bez zmian
- Count â‰  qty: API `source_reserved_quantity_total` / `source_shortage_quantity_total`; lista/detail rozdzielone

**UX produkcji i planowania (2026-08-12):**
- Lista/detail MO: jÄ™zyk biznesowy (Z zamĂłwieĹ„ / Na magazyn, statusy PL, gotowoĹ›Ä‡ materiaĹ‚Ăłw)
- Planowanie: rozbicie ZamĂłwienia vs UzupeĹ‚nienie; Przelicz vs UtwĂłrz zlecenia; coverage tiles
- Konfigurator: sekcja Tryb produkcji + walidacje pĂłl; terminal: Pobierz komponenty

**Stock replenishment / nadprodukcja (2026-08-12) â€” Phase 7:**
- Settings in `production_forecast_json`: `auto_stock_replenishment`, `stock_replenishment_coverage_days` (1|3|7|14)
- `run_production_stock_replenishment` creates/aggregates `ProductionOrder` `source_type=PLANNING` only
- ORDERS material reservations + soft-hold before PLANNING; no FG buffer copy; standard PW/putaway
- Manual API `POST /production/planning/stock-replenishment/run`; no cron yet

**Order-driven production â†’ packing handoff (2026-08-12) â€” Phase 6:**
- `after_production_action` = `STATUS_ONLY` (default) | `OPEN_PACKING` on picking_config
- Stronger `status_after` validation: â‰  source, â‰  other production source, â‰  standard picking entry, unique among production afters; target forced = after (packing queue)
- On source fulfill: `READY_TO_PACK` + `CARTLESS` + status_after; progress returns `packing_handoff` for operator FE toast/navigate
- Packing finish consumes FG buffer inventory (idempotent); optional badge `from_production` / â€žZ produkcjiâ€ť
- No new packing module / courier / overproduction

**Order-driven production print execution (2026-08-12) â€” Phase 5:**
- `picking_config.production_execution_method` = `WMS` | `PRINT` (per production status; default WMS)
- PRINT = alternate *interface* for ORDERS MO (same lifecycle); PDF preview side-effect free
- `POST .../start-print-execution` â†’ lock reservations + existing RW consume path; idempotent restart
- PDF: components with per-location allocations, source orders + flame, MO barcode scan
- `GET .../orders/resolve-scan` + WMS production terminal scan â†’ open existing execution UI
- FE: badge Wydruk/Terminal WMS; PodglÄ…d vs Wydrukuj i rozpocznij + confirm modal

**Order-driven production â†’ packing (2026-08-12) â€” Phase 4:**
- Progress +N: allocate to sources (same priority sort as Phase 3) â†’ `fulfilled` â†’ `status_after_production_id` via SSOT (`skip_production_trigger`)
- ORDERS PW lands on `finished_goods_buffer_location_id` with putaway/relocation DONE (no Rozlokowanie queue); MO finishes as `completed`
- Packing: FE_PICK finalized + pick allocation on buffer; `order_item_required_pack_qty` counts production fulfilled
- UI: produced X/Y, ready/pending/shortage counts on MO detail + list snippet

**Order-driven production materials (2026-08-12) â€” Phase 3:**
- After attach: `apply_material_validation_to_orders_mo` â†’ `producible_now_qty` + StockReservation SSOT
- Partial cover: priority/oldest sources stay `reserved`; rest `shortage` â†’ `status_on_component_shortage_id`
- `planned_quantity` / BOM snapshots / reservations sync to producible qty; `retry_order_driven_production_shortages`

**Order-driven production auto-MO (2026-08-12) â€” Phase 2:**
- Hook: `apply_order_panel_ui_status` â†’ `on_order_panel_status_changed_production` (also bulk-status)
- Enter production status â†’ create/aggregate `ProductionOrder` `source_type=ORDERS` via `ProductionOrderSourceItem`
- Aggregation key: tenant+warehouse+product+composition+picking_config, only `draft`/`planned`
- Concurrency: PG advisory lock + partial unique indexes; idempotency via active source on `order_item_id`
- Withdraw before start reduces planned; after collecting+ blocked; reentry reactivates/creates cleanly

**Order-driven production foundation (2026-08-12) â€” Phase 1:**
- Data: `ProductionOrder.source_type`, `production_order_source_items` (MO â†” OrderItem)
- Config: `picking_config.is_production_mode` + after/shortage statuses + FG buffer location; trigger scope `SINGLE_ELEMENT`

**Picking validation (Walidacja zbierania) (2026-08-11):**
- Sekcja Terminal â†’ â€žWalidacja zbieraniaâ€ť; opcja â€žProdukty bez kodu EANâ€ť
- SSOT resolver: FE `resolvePickingValidationGates` + BE `resolve_picking_validation_gates`
- Priorytet lokalizacji: require_location_scan > multi-force > auto source
- BE egzekwuje product/location scan + rezerwÄ™ + brak EAN na quick-pick / cartless / confirm-remaining

**Picking stock split (2026-08-11):**
- `warehouse_stock` = suma Inventory w magazynie; checkbox â€žStan magazynowyâ€ť tylko to
- Badge lokalizacji zawsze z `primary_location_stock` / `stock_quantity` lokalizacji

**Picking list view settings (2026-08-11):**
- `list_display` w `wms/settings/picking-terminal` (per tenant+magazyn) steruje kafelkami listy zbierania
- Checkboxy: zdjÄ™cie / EAN / SKU / nr kat. / stan / lokalizacja â€” tylko lista, nie detail/qty
- Copy Widok: â€žLista zbieraniaâ€ť; usuniÄ™te zbÄ™dne opisy sekcji

**Picking all-order config (2026-08-11):**
- `all_mode` + `all_order_sort` + `max_all_orders`; flow `all` nie dziedziczy single/multi

**Picking qty screen 1:1 (2026-08-11):**
- `PickingQtyPanel`: belka lokalizacji + kafel bez labela ILOĹšÄ†; logika pick bez zmian

**Inter font self-hosted (2026-08-11):**
- `@fontsource/inter` 400/500/600/700 w `main.tsx`; brak Google Fonts / gstatic

**Picking qty source location bar (2026-08-11):**
- Ekran iloĹ›ci: `[â†]` + belka aktualnej lokalizacji pobrania (`manualLocId ?? activeLocationId`)
- Nie zmienia listy ani detail poza wiringiem `locationLabel` do qty

**Picking order-type first (2026-08-11):**
- Nowa tura: status â†’ ZAWSZE wybĂłr single/multi/all â†’ cart (jeĹ›li trzeba) â†’ produkty
- Wznowienie tylko z zapisanym order_type + cart/cartless
- Copy kart: â€žProdukty do zebraniaâ€ť / â€žProdukty: zebrano X / Yâ€ť

**Picking detail flow (2026-08-11):**
- Detail obowiÄ…zkowy (bez auto-open qty); qty â† wraca do detail
- CTA skan: lokalizacja/produkt â†’ qty; 401 terminal/detail nie maskowane
- GET `wms/settings/picking-terminal` + `wms/picking/product-lines/detail` przez shared axios

**KolejnoĹ›Ä‡ dostaw (2026-08-11):**
- SSOT = `GET /wms/delivery-work-queue` + `derive_warehouse_workflow_status` (istniejÄ…cy flow PZ)
- W kolejce: NEW / COUNTING / COUNTED / PUTAWAY_IN_PROGRESS
- Poza kolejkÄ…: PUTAWAY_COMPLETED / CLOSED
- CTA wg stanu; sort=`delivery_queue_sort`, priority=`delivery_queue_priority` (niezaleĹĽne od statusu)

**Picking flow 1:1 (2026-08-11):**
- STATUS â†’ RODZAJ â†’ POPUP WĂ“ZEK â†’ LISTA â†’ PRODUKT â†’ ILOĹšÄ† â†’ ZATWIERDĹą â†’ LISTA
- Lista: lokalizacja w kafelku; produkt: belka lokalizacji obok â†

**Picking lista/detal UI hierarchy (2026-08-11):**
- Lista: nagĹ‚Ăłwek â† + `Do zebrania: 0/2`
- EAN = `PackingEanBadge` (wspĂłlny z pakowaniem); lokalizacja = `PackingLocationPill`
- Detal: â† + belka lokalizacji; qty panel bez samotnej liczby nad kontrolkÄ…

**Picking status UX + skan 409 (2026-08-11):**
- Root 409: `already_mine` blokowaĹ‚ resolve gdy cart ASSIGNED bez otwartej sesji (orphan) + FE ufaĹ‚ sessionStorage
- BE: `has_active_session` tylko przy otwartej WmsOperationSession; heal orphan ASSIGNEDâ†’AVAILABLE
- resolve-cart: 409 ACTIVE_PICKING_SESSION tylko przy realnej sesji; orphan â†’ heal + allow
- FE skan: zawsze refresh `active-session` przed decyzjÄ…; clear snapshot gdy BE=brak sesji
- UX: duĹĽa liczba zamĂłwieĹ„; lekkie â€žProduktyâ€¦â€ť; empty state Gotowe do rozpoczÄ™cia

**SpĂłjny przepĹ‚yw zbierania (2026-08-10) â€” peĹ‚ny SSOT:**
- Statusy: karty bez CTA; centralny prompt skanu; merge `active-session` â†’ wiersze (bez mieszania BULK/BASKETS)
- BE: configured-statuses NIE dokleja sesji do pierwszego require_cart obcego typu
- Skan wĹ‚asnego wĂłzka: statusy â†’ open session; products/detail â†’ cichy accept (zero â€žmasz juĹĽâ€¦â€ť, zero resolve-cart)
- 409 resolve-cart przy wĹ‚asnej sesji â†’ otwĂłrz istniejÄ…cÄ…
- Cancel: cart_id â†’ cancel-session; cartless tylko bez wĂłzka
- UI: meta WĂłzek+Do zebrania; sticky â‹®|Zbierz; full width; lokalizacja na karcie

**Prompt skanu wĂłzka na statusach (2026-08-10):**
- UsuniÄ™ty czerwony banner â€žZeskanuj wĂłzekâ€¦â€ť
- Po klikniÄ™ciu statusu wymagajÄ…cego wĂłzka (bez sesji): subtelny komunikat na Ĺ›rodku + przycisk Sasist
- Karty bez CTA skanu; przy aktywnej sesji â€” badge, wejĹ›cie bezpoĹ›rednio do zbierania

**Layout zbierania produktĂłw (2026-08-10):**
- PeĹ‚na szerokoĹ›Ä‡ (`WmsOperationalPageBody wide`); sticky: â‹® lewo / Zbierz prawo
- Meta: Do zebrania + badge wĂłzka; lokalizacja tylko na karcie (PackingLocationPill)
- Detail: nazwa+EAN w headerze i na karcie; bez â€žPotwierdĹşâ€ť; bez max-w-3xl

**Lista statusĂłw zbierania â€” spĂłjny SSOT (2026-08-10):**
- Skan wĹ‚asnego CART â†’ otwiera istniejÄ…cÄ… sesjÄ™ (products), zero resolve-cart / zero toastu â€žmasz juĹĽ wĂłzekâ€ť
- â€žProdukty do zebraniaâ€ť tylko na karcie z mojÄ… sesjÄ…; obce karty bez progresu i bez CTA gdy mam aktywnÄ… sesjÄ™
- Nazwa statusu ~19px / bold; CTA tylko przy braku sesji wĂłzkowej
- Helper: `wmsPickingStatusSession.ts`; active-session zwraca products_*

**Sesje + skan wĂłzkĂłw â€” spĂłjna logika (2026-08-10):**
- Root: status page rejestruje handler TYLKO przy CTA â†’ `has_handler=false` â†’ â€žnie obsĹ‚uguje skaneraâ€ť; products zwracaĹ‚ `consumed=false` dla CART; CTA vs badge rozjeĹĽdĹĽaĹ‚y siÄ™ przy type-match
- SSOT: `wmsPickingStatusSession.ts` + `GET /picking/active-session` rĂłwnolegle z configured-statuses
- Statusy: handler ZAWSZE; aktywny wĂłzek â†’ toast, zero resolve-cart; CTA tylko `statusRowShowScanCartCta`
- Tile: `hasActiveSession` + absolutny zakaz CTA przy badge / inProgressByMe
- Products: CART-* zawsze consumed
- BE: bind sesji nawet gdy meta.source_status_id nie pasuje do konfiguracji

**Aktywny wĂłzek SSOT (2026-08-10) â€” definitywna naprawa 409 BASKETS:**
- Root cause: skaner statusĂłw fallbackowaĹ‚ na `needsScanTiles[0]` (czÄ™sto BASKETS) przy sesji CART; CTA gdy `active_cart_type !== cart_type` kafelka; `session_source_status_id` nie byĹ‚o w schemacie Pydantic
- FE: `WmsPickingStatusPage` â€” skan TYLKO przy jawnym `scanTargetStatusId` bez aktywnej sesji; zero fallbacku typu; CTA wyĹ‚Ä…cznie gdy `!rowHasOperatorActiveSession`
- BE: `resolve_operator_active_picking_session` + `GET /picking/active-session`; configured-statuses wiÄ…ĹĽe sesjÄ™ WYĹÄ„CZNIE do `meta.source_status_id`; obce kafle bez wĂłzka/CTA mylÄ…cego
- Schema: `has_operator_active_session`, `session_source_status_id`
- resolve-cart: 409 gdy wĂłzek juĹĽ ASSIGNED/PICKING u operatora (nie start nowej sesji)
- Mixed cart_scan+baskets â†’ BULK; â€žWszystkieâ€ť w order-type tylko przy tym samym typie wĂłzka

**SpĂłjnoĹ›Ä‡ sesji zbierania (2026-08-10):**
- Bug: `pickingSessionId` na sesji WĂ“ZKOWEJ mylony z cartless â†’ czyĹ›ciĹ‚ cartId, product-lines 409, cancel-cartless 400
- Fix: `isCartlessPickingSession` â€” cart_id wygrywa; merge nie wymusza cartless
- BE product-lines: session z cart_id â†’ Ĺ›cieĹĽka wĂłzkowa + source_status z meta
- cancel-cartless z cart_id â†’ `cancel_picking`; tile mixed scanned+baskets â†’ BULK (nie BASKETS)
- Projekcja: sesja tylko na swoim `source_status_id`; API `session_source_status_id`
- Skan CART-* na liĹ›cie produktĂłw przy aktywnej sesji â†’ consumed, bez resolve-cart

**Wznowienie sesji zbierania (2026-08-10):**
- Jedna sesja = jeden wĂłzek; skan tylko przy ROZPOCZÄCIU nowej sesji
- BE: `bootstrap_start_picking_if_needed` â€” walidacja typu wĂłzka NIE przy PICKING/ASSIGNED+sesja
- FE: aktywna sesja â†’ klik statusu â†’ od razu produkty

**Sesja zbierania â€” SSOT wĂłzek + produkty (2026-08-10):**
- Projekcja: `wms_picking_session_projection.py` (ten sam `build_wms_picking_product_lines` co lista)
- Statusy: `session_products_*` + `active_session_id` + `active_order_type`
- Hub â€žWybierzâ€ť: produkty z sesji gdy aktywna; `order_count` nadal = wolne

**Przypisywanie wĂłzkĂłw w zbieraniu â€” SSOT (2026-08-10):**
- Typ wĂłzka vs kafelek: BULKâ†”`CartType.BULK`, BASKETSâ†”`MULTI`; reject PL msg
- Badge / skan na statusach; skip re-scan gdy pasujÄ…cy wĂłzek; lista zamĂłwieĹ„ filtr `source_status_id` na wĂłzku
- `in_progress_by_me` filtruje typ wĂłzka per status config (ASSIGNED|PICKING)

**Ekran Wybierz â€” ukĹ‚ad + AKTYWNE (2026-08-10):**
- Kafelki single/multi/all w rzÄ™dzie (flex wrap: 3 / 2+1 / 1)
- Tekst: `Produkty do zebrania: X/Y szt.`
- Badge AKTYWNE z `active_order_type` hubu (otwarta sesja / inferencja zamĂłwieĹ„)
- `order_type` zapisywane w metadata przy `start_picking` (bez zmiany assign)

**Status zbierania â€” badge wĂłzka (2026-08-10):**
- Na kafelkach z `require_cart` (scanned/baskets): chip `WĂłzek: â€¦` gdy operator ma ASSIGNED/PICKING
- SSOT: `Cart.assigned_user_id` via `configured-statuses` (`active_cart_*`); fallback `WmsPickingCartContext`
- Bez nowego mechanizmu przypisywania

**Picking UI rebuild â€” Sellasist-clean (2026-08-10):**
- White minimal list/detail; Sasist `PackingLocationPill` for locations; sticky â€žZebraneâ€ť + â‹® options sheet
- Kit: `components/wms/picking/Picking*` (header, card, sticky, primitives)
- Logic unchanged (scan/finalize/shortage/MULTI); typography via `wmsTypoClass`

**WMS OgĂłlne / typografia (2026-07-24):**
- Tab Ustawienia WMS â†’ â€žOgĂłlneâ€ť: 5 poziomĂłw 12|14|16|18|20 px (domyĹ›lna 16)
- SSOT: `wms_general_settings` + GET/POST `/wms/settings/general`
- FE: CSS vars on `WmsOperationalLayout` via `WmsOperatorTypographyProvider`; consume `wmsTypoClass`
- No auto-downscale on collectors â€” layout wraps instead
- Stare wartoĹ›ci (np. 21) normalizujÄ… siÄ™ do 16 przy odczycie

**Picking terminal settings (2026-08-10):**
- DB/API: `WmsPickingTerminalSettings` â†’ `/wms/settings/picking-terminal`
- FE policy: `pickingTerminalScanPolicy.ts` (`computeNeedsLocationScan`)
- Operator detail: gates + `product_scan_confirmed`; reserve filtered in product detail / pick paths

**Picking configurator status pickers (2026-08-09):**
- Modal uses shared `OrderUiStatusField` with raised portal z-index
- Allowed statuses from WMS panel groups + packing start IDs (not hardcoded names)
- Save blocked when source/target missing or outside allow-list

**Packing automation activators wired (2026-08-09):**
- Shared runner `orderAutomationRun.ts` â†’ `change_status` via `PATCH â€¦/ui-status`; other effect kinds fail with PL errors (no mocks)
- `PackingAutomationActivators`: labels/icons from rule, loader + exclusive run gate, errors via `showScannerError`
- Help copy no longer says activators donâ€™t affect packing; visibility from enabled WMS packing rules only

**Packing list vs source status (2026-08-09):**
- Queue SSOT: only selected packing `status_id` (no name heuristic); eligibility requires `order_ui_status_id`
- FE counters exclusive from same API list; green translucent overlay on fully packed product cards

**Packing finish #1249 (2026-08-09):**
- Partial pick without shortage â†’ recovery_work blocks finish (validation kept)
- SSOT: no fake physical-complete while recovery open; pick-capped required_pack_qty; clear PL message

**Packing carton gate UI (2026-08-09):**
- `PackingCartonGateModal`: white compact header + 5-col grid, JsBarcode from carton EAN/SKU/id, scan=select
- API: `WmsPackingRecommendedCarton.barcode` / `ean`; `ScannerHandler` no longer clears handler when disabled (carton gate can own scan)

**Bundle STOCK production order 500 (2026-08-09):**
- Cause: `production_orders.recipe_id` NOT NULL vs composition-only MO (`recipe_id=NULL`)
- Fix: schema ensure + migration; path remains `composition_id` from bundle manufacturing BOM

**Packing finish 404 no_cart (2026-08-09):**
- Finish loader: active queue OR fully-packed + mode-compatible fallback (Polish business messages)
- FE: keep `mode=all` when opening cartless card from all list; finish errors via red scan feedback overlay
- Regression: `backend/tests/test_packing_finish_no_cart.py`

**AutoActions screen rebuild (2026-08-09):**
- `AutoActionsView` + `PackingFinalizationView` share `AutoActionsShell` (mockup 1:1, white bg)
- Steps filtered by API `auto_actions`; COD block only when payment is COD
- States from `post_pack_pipeline` / finish progress; after-effect via `afterActionsBehavior` (scan / list / next â€” navigation still in controller)

**Packing view settings: location + activators (2026-08-09):**
- `locationBadgePosition`: only `top_right` | `in_details` (â€žPrawy gĂłrny rĂłgâ€ť / â€žW szczegĂłĹ‚ach produktuâ€ť); legacy corners â†’ `top_right`
- Wired into Default/Active/Done cards + `LineDetailsBlock` via `location_placement` in field visibility
- Settings previews reuse real packing product cards; activators preview top strip / bottom pinned bar
- Removed `CAP_NONE` / â€žBRAK FUNKCJONALNOĹšCIâ€ť from both selects; info tooltips via `PACKING_SETTING_HELP`

**Packing automation activator position (2026-08-09):**
- Setting `automationButtonsPosition`: only `top` | `bottom` (â€žNa gĂłrzeâ€ť / â€žNa doleâ€ť)
- Removed `floating` / `right` from UI + types; legacy â†’ `bottom` via `normalizePackingAutomationButtonsPosition`
- Placement in product column only (not sidebar): top = strip above list/grid; bottom = pinned footer under scroll area

**Shipping method logos NS_BINDING_ABORTED (2026-08-09):**
- Root cause (page lifecycle, not broken files): DEV `React.StrictMode` remounted list logos after first paint â†’ browser aborted in-flight `GET /uploads/...`; abort `onError` + module failure cache flipped `src` (more aborts). Double fetch without effect cleanup could `setRows` twice.
- Fix: drop StrictMode remount; cancellable single load by `warehouseId`; `mergeShippingMethodsRows`; mounted-only `onError`; no module fail-cache; memo list row + stable `key={id}`.
- Do not â€śfixâ€ť with more logo fallbacks / Railway / S3.

**Packing finish UUID series bug (2026-08-09):**
- `create_packing_packaging_rw`: `document_series_id=str(series.id)` (UUID), not `int(series.id)`
- Symptom was HTTP 400 on finish with carton selected (RW consume path)

**Packing cart/basket scan as list lookup (2026-08-09):**
- Status â†’ session `mode=all` â†’ orders list (no forced scan screen)
- Global scanner on list: cart â†’ filter orders; basket â†’ open order; empty â†’ toast
- Picking collection config does NOT gate packing cart scan
- Helpers: `resolvePackingHandoffScan` + `applyPackingHandoffScanResult` (no PackingHandoffScanModal)

**Packing reopen already-packed (2026-08-09):**
- Click fully packed order â†’ packing view (all Done, no active line) + `AlreadyPackedOrderModal`
- Accept â†’ `POST â€¦/acknowledge-reopen` â†’ `PACKING_REOPEN_ACKNOWLEDGED` (WmsOrderEvent + activity log)
- X/Escape dismiss without log; back â†’ lista; suppress AutoActions/finalization on reopen
- Detail fallback outside active queue for packed/finalized/status PACKED|SHIPPED|â€¦

**Order panel status change (2026-08-09):**
- Endpoint: `PATCH office/order-ui/orders/{id}/ui-status` â†’ `apply_order_panel_ui_status`
- Status always persists; cart detach only when `can_detach_order_from_cart` allows
- Detail UI: toast on error + `reloadOrderById` after success

**Packing layout settings (2026-08-09):**
- `layoutMode`: `with_sidebar` | `full_width` (legacy unused values â†’ sidebar via schema v2)
- Full-width: no left sidebar; `PackingOrderFullWidthInfo` strip; denser product grid; Spakuj wszystko in header
- `movePackedToBottom` wired in `sortLinesForPacking` / `sortedLines`
- Order chrome toggles: `showOrderPhone`, `showOrderValue`, `showShippingAddress` (default ON)
- View settings: collapsible `PodglÄ…d ukĹ‚adu` under layout / products / comments / sales doc (default collapsed)

**Packing product appearance (2026-08-09):**
- Shared `packingProductDisplay.ts` merges `interface_display` + extended UI
- Cards (Active/Default/Done) honor stock/EAN/SKU/catalog/signature/price/name/truncate/image/location
- API: `product_signature`, `unit_price_display` on packing lines
- Mockup layout: fixed grid 20Ă—19.5rem; list full-width rows; EAN badge; done = translucent green whole-card + faded image/data
- Settings preview (`ProductDisplayModePreview`): fixed card widths, includes Done sample

