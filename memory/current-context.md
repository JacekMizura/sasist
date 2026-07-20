# current-context

## Active

**PRODUCT INTEGRATION Phase 1 + core Phase 2** — implemented (local commit pending/done). No push.

## Delivered

- Capacity SSOT API: product×location + batch (max 80)
- Putaway UI: capacity cards + distribution plan (PLAN ≠ execution)
- Product locations capacity list (batch)
- Packing: recommendation panel, alts, override warning, multi-carton plan read-only
- Multi-carton persistence: GAP (single `selected_carton_id`)

## Hard gates

- FE operational UI does not compute fit
- Smart cannot promote NO FIT
- Distribution plan does not mutate Inventory
