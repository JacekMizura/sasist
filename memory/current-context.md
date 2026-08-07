## Active

**Magazyn devices IA rebuild (2026-08-07).**

Tabs: Wózki | Strefa sortująca | Planer floty | Nośniki
- Wózki: unified BULK+MULTI list (`CartsFleetPage`), `?type=` filter, type picker on create, badges on cards
- Strefa sortująca: former Regały (`/carts/racks`); UI copy without „Regały”
- Strefy: removed (FE pages + `/zones` API); redirect `/carts/zones` → `/carts/bulk`
- Models `PickingZone` kept for WMS order associations

**Prior:** App shell header above sidebar; WMS settings search
