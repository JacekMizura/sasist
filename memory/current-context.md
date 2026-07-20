# current-context

## Active

**FIT product integration + missing-data audit** — local commits only. No push.

## Validation SSOT (confirmed)

`Ustawienia WMS → Przyjęcia → Walidacja produktów`
→ `wms_settings.validation_require_*`
→ `resolve_effective_receiving_requirements`
→ `validate_required_product_data`
→ receiving soft gate

**No parallel** fit_engine_required / tenant logistic required settings.

## Runtime fallback

`normalize_product_logistics` → 1×1×1 / 0 kg, non-persisted; ESTIMATED when used.

## Commits (local, ahead of origin)

- `54c959e9` — normalizer + provenance
- `34cc8b30` — audit correction (FE weight sync, WHY_SELECTED, matrix tests)

## SAFE TO PUSH

NO — multi-carton persist GAP + smoke receiving E2E still open.
