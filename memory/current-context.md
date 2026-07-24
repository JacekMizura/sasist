# current-context

## Active

**Location Access Foundation** — wdrożony lokalnie (bez push, bez Etapu 3).

### Location→Rack SSOT (ustalone przed implementacją)

**Nie** używamy `rack_name`. Stabilny łańcuch już istnieje:

`Location.location_uuid` → `Bin.location_uuid` → `Bin.rack_id` → `Rack` (`Rack.uuid`)

Helper: `backend/services/warehouse_routing/location_rack_link.py`.
`rack_name` = tylko cache UI. Rename regału / move / rotate nie zrywa linku.
Migracja produkcyjna Location→Rack **nie była potrzebna** (brak ryzyka).

### Foundation delivered

- `Rack.service_side` + `rotation_degrees` persist FE↔BE
- Tabela `warehouse_routing_location_access` (AUTO / MANUAL_OVERRIDE)
- AUTO resolver: service edge → half-plane → no pierce → reach → approach_m
- Virtual entry runtime (`route_via_virtual_entries`) — bez pollution authored graph
- Recompute po graph save + layout save
- Walidacja: dostępne / do sprawdzenia / bez drogi (nie „N wymaga przypisania”)
- Overlay diagnostyczny (OFF by default)
- Stage-2 AP path nietknięty dla picking consumers

## Preferencja commitów (user)

Komunikaty po polsku. **Bez push** dopóki user nie poprosi.
