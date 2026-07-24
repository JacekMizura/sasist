# current-context

## Active

**Physical Routing / Rack Passage Foundation** — zaimplementowane lokalnie (bez push, bez Etapu 3).

### Delivered
- `WarehouseRackPassage` table (UUID SSOT), layout load/save
- `physical_collision.py` SSOT (footprint − enabled passages), eps=2cm
- Soft graph validation `EDGES_THROUGH_OBSTACLES` (warning; save nie blokuje)
- Location Access approach via collision; invalid edges excluded from AUTO
- FE: passage editor + map overlay; invalid edge highlight; orthogonal prefer + Shift free-angle

### Still dual-store until Stage 3
- Picking / walking-cost → OLD AP
- Designer / NEW Location Access → edge+t

## Preferencja
Commity PL. **Bez push** dopóki user nie poprosi.
