# current-context

## Active

**warehouse_special_placements** — poprawny model domenowy specials (mapa ≠ locations).

### Done
- Tabela + migracja z `locations` (PICK_START/PACKING/DOCK)
- CRUD API operuje na placementach; DELETE nie kasuje `locations`
- `get_special_locations_xy` czyta placements
- Geometria specials wyczyszczona z `locations.x/y/z`

### Constraints
Bez commit/push (dopóki user nie poprosi).
