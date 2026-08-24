# Current context

- Complaints list UI aligned to Returns list SSOT (`ModuleListPageToolbar`, embedded filters, `ModuleListBulkBar`, `moduleList*` table tokens). Domain fields unchanged.
- Document series UI: split-pane workspace on `/documents/series/*` — list left (~44%), editor right with tabs (Podstawowe / Dokument / Numeracja / Automatyzacja / Dane na dokumencie). No full-page editor.
- Document trigger architecture corrected: warehouse docs only via explicit triggers (automation `generate_document` + series_id). Pick finalize and OWR reserve do NOT auto-create WZ/RZ.
- Classic WMS finalize: physical decrement → OWR consume → sync existing RZ status → stamp fulfillment key on pick movements. No WZ.
- Business reservation OWR exists without RZ; RZ via `create_document_from_series` / automation.
- Documentary WZ infrastructure kept (`post_pick_settlement`, settlement_mode, idempotency, movement link).
- Packing still FV/PA only. Z-PZ / production PW-RW unchanged domain exceptions.
- status_on_* series fields untouched (not status→document triggers).
