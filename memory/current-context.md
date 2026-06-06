# Current context

## Active goal
Warehouse layout editor — rack properties panel UX + rack name save flow (done).

## Rack editor UX fix
- `RackPropertiesSidebar`: fixed overlay drawer below toolbar (`top: 7.5rem`), resize handle, compact mode, sticky footer (Zapisz/Zamknij)
- Rack name: instant local sync + commit on blur/Enter/save; `[rack.rename]` logs; save states (Zapisywanie…/Zapisano/Błąd)
- Close: X, ESC, backdrop click, re-click selected rack (toggle)
- `InternalLayoutModal`: breadcrumb, back button, ESC, sticky footer; canvas scroll restored on close
- Elevation panel offset so toolbar stays accessible

## Prior
Direct Sales settings — unified with global order panel statuses (IDs, not hardcoded strings).

## Product detail fix
- `backend/services/product_detail_service.py` — staged build, degraded fallback, never HTTP 500 on enrichment failure
