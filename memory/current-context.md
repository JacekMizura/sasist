# current-context

## Active

**FIT ENGINE productization** — local commits only. **No push.**

## SSOT (unchanged core)

`backend/services/fit_engine/` + `product_logistics_normalizer`
→ warehouse capacity / putaway / packing cartonization

## New in productization commit

- Shared shelf/rack weight: `warehouse_structural_weight_limits` + Rack.max_weight_kg + internal_structure levels
- ShippingMethod: max_package_weight_kg + max_*_cm → effective carton payload
- Replenishment capped by `solve_location_capacity.additional_capacity`
- Operator UX: ODŁÓŻ / WEŹ+ZAPAKUJ; settings tab „Dopasowanie przestrzenne”
- Product validation: still only WMS Walidacja produktu (no parallel)

## SAFE TO PUSH

NO — multi-carton persist GAP; admin UI for structural weight limits still thin (table + rack JSON); shipping fields need admin form wiring; smoke E2E.
