## Active

**Smart Matching (2026-08-08):** ustawienia + uczenie z historii pakowania podpięte pod istniejący packaging engine.

- API `/wms/smart-matching/*` (settings, history, rules, reset)
- Tabele: settings / rules / history / breaks
- Finish pakowania → `record_packing_carton_choice`; status panelu → proposal init + auto-label (tylko z opakowaniem)
- UI: OrderUiStatusField, historia, przerwane serie (!), reset
- Testy `test_wms_smart_matching.py` (8); `npm run build` OK

**Next:** commit/push na życzenie.
