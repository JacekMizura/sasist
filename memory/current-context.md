**Manual order mutations → Activity Log — PASS (2026-08-23).**

- Wired: shipping/billing address diffs, notes (append/POST), item add/qty/price/VAT
- Shipping/payment method already logged (Phase 2)
- Remove line: WMS projection + actor; no extra OMS duplicate
- Note edit/delete API: missing (writers ready)
- Logi UI: Historia czynności default expanded + detail expand for diffs
- WMS files touched=0 (only operator_user_id passed into existing WMS emits)
