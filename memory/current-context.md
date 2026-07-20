# current-context

## Active

**PRODUCT INTEGRATION — missing logistics policy** — local commit pending. No push.

## Policy (HARD)

- Runtime technical defaults: 1×1×1 cm, weight 0 kg via `normalize_product_logistics` SSOT.
- Technical default ≠ real data (provenance = master field presence, never numeric 1×1×1 equality).
- Receiving validation SSOT unchanged in role; defaults NEVER satisfy required fields.
- Fit confidence: defaults → ESTIMATED (never false EXACT).
- Runtime normalization does not write defaults into master data.

## Delivered (prior + this)

- Capacity SSOT + batch + putaway cards + distribution plan (PLAN ≠ execution)
- Packing recommendation / alts / override / multi-carton plan read-only
- Logistics normalizer + receiving gate + FE estimated labels

## Explicit GAPs

- Multi-carton persistence (single `orders.selected_carton_id`)
- DB `recommended_carton_id` vs selected (if not already mirrored in packing session)
- Replenishment / consolidation capacity wiring
- SAFE TO PUSH: NO until smoke + multi-carton persist decision
