## Active

**Etykieta zastępcza (2026-08-08):** pełny mechanizm awaryjny przy braku listu kurierskiego w pakowaniu.

- Typ szablonu `order_replacement` (rodzina Zamówienia) — BE + FE + walidacja ustawień
- Trwały stan w `wms_packing_replacement_labels` (snapshot opakowania/paczek/metody, barcode `RPL-######`, statusy)
- Popup po `offer_replacement_label` + delay z `fallback_label.delay_seconds`
- Skan RPL → restore snapshot → retry courier
- Testy: `test_wms_packing_replacement_label.py` + zaktualizowane auto-actions; `npm run build` OK

**Next:** commit/push na życzenie.
