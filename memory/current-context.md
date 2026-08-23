**WMS picking scanned location context — PASS (2026-08-23).**

## Root cause
- Scanner Helper `performScan` classified `B3-C-1` as location **before** picking handled it → OSTATNIA LOKALIZACJA=B3
- Picking only updated `activeLocationId` when `needsLocationScan` matched a row in `detail.locations`; after location already satisfied (or single-loc auto A1), wrong/other location scans were **silently `consumed=true`** without updating active or rejecting
- Product quick-pick used stale `selectedLocation ?? locations[0]` (A1-A-1)
- Plain ValueError → FE `UNKNOWN_SCAN_CODE` / NIEZNANY KOD for known EAN

## Fix
- SSOT: `resolvePickingSourceLocationScan` — accept only route-allowed locs; else WRONG_LOCATION with expected/scanned; reject does not change active
- Helper defers location history on picking path until page accept
- quick-pick location_id from active only; NO_OPEN_QUANTITY / PRODUCT_NOT_IN_SESSION structured codes
- Cartless stock gate from `7e541f4b` unchanged (regression tests green)
