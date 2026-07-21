# current-context

## Active

**Replenishment SSOT audit + Polish UI** — local commit; **no push.**

## Replenishment SSOT (`wms_replenishment_service`)

- TRIGGER: `pick_stock < min_pick_quantity`
- TARGET/need: `min_pick − pick_stock` (fill-to-min; **not** fill-to-max / not demand)
- `max_pick_quantity` + open-order demand: **priority score only**
- `move_qty = min(need, Σ moveable BUFFER, trusted destination capacity)`
- Source locations: badge kind **BUFFER** only
- Operator queue: ACTIONABLE only; NO_SOURCE_STOCK → Alerty/Braki

## Polish UI (Centrum operacyjne / MM replenishment)

- FE map: `frontend/src/utils/replenishmentUiLabels.ts`
- Operator instruction: `Przenieś N szt. / Z: / DO:` (+ partial-fill note)
- Never render raw ACTIONABLE / NO_SOURCE_STOCK / HIGH / blocked / critical

## Product GAP (not a bug under current SSOT)

Demand-driven fill (CASE 2/3) would require an **explicit** policy change — do not invent.

## SAFE TO PUSH

NO — user hold; confirm demand fill-to-min vs demand-fill product intent before push.
