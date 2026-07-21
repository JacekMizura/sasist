# current-context

## Active

**WMS Przyjęcie — effective validation policy + scan gate** — local commit; **do not push**.

## Root causes

1. **Scan gate:** FE `serialAwaitingRef` could block / mislabel product EAN before opening the product modal; stale awaiting when effective `track_serial=false`.
2. **Overrides:** PZ line `track_*` and several write paths used legacy `Product.track_*`, ignoring `validation_skip_*` (global ∧ ¬skip SSOT in `resolve_effective_receiving_requirements`).

## SSOT

`effective = global_required AND NOT product.validation_skip_*` (`product_validation_policy.py`).
Document lines + scan resolve + receive-serial / lot keys use effective flags.
Scan returns `validation_requirements` for FE presentation.
