# Current context

## Active goal
Warehouse layout designer refactor — separate interaction states, drag/click fix, consistent drawer, faster save.

## State model (layout tab)
- `selectedRackId` — single-click selection only (uuid-first via `rackPrimaryId`)
- `previewRackId` — details drawer (double-click opens; independent from selection)
- `editingRackId` — name field focus (hides floating toolbar)
- `draggingRackId` — active after 5px pointer threshold

## Interaction
- Single click: select rack
- Double click: open right drawer
- Drag: move rack (never opens panel); 5px threshold before drag activates

## Drawer
- Always fixed right overlay (`RackPropertiesSidebar`), 420px desktop / 100vw mobile
- ESC + backdrop close; unsaved name warning
- Explicit `rack_type` selector (Magazyn / Sklep)

## Save
- `[layout.save.start|payload|success]` logs; removed post-save full reload (optimistic)
- `rack_type` persisted explicitly on each rack in payload

## Prior
Direct sales terminal settings + complete-sale fixes.
