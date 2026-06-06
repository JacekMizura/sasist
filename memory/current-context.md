# Current context

## Active goal
Warehouse layout editor — state corruption fix (rack names, rack_type, save roundtrip).

## Root cause fixed
- `reindexGeometricRow` / `reindexRowByPrefix` were **renaming all racks on the same row** and regenerating bins on every create/move.
- Now they only update `indexInRow`; names assigned at creation/rename only.

## State architecture hardening
- `rackEntityKey`, `getNextRackIndex`, `cloneRackState`, `validateLayoutEntityIntegrity`
- Debug logs: `[layout.rack.create|rename|persist|hydrate]` + dev cross-mutation warnings
- Save pipeline: explicit `rack_type` coercion, uuid/name duplicate checks
- Stable rack_index via `getNextRackIndex` (not `racks.length + 1`)

## Prior
Rack editor sidebar UX + rack name save flow.
