# current-context

## Active

**App overlay architecture** — Drawers/Sheets/Modals portalują na `document.body` przez `AppOverlayPortal`, żeby malować się NAD ErpSidebar (`z-30`), nie wewnątrz content `z-0`.

### SSOT
- `frontend/src/components/overlay/AppOverlayPortal.tsx`
- Z-bands: drawer 250, sheet 280, dialog 500 (ConfirmModal)
- `WarehouseDocumentOverlayPortal` = thin alias

### Cause (fixed)
Content column `relative z-0` + sidebar sibling `z-30` → page-level `fixed` never covered sidebar.

### Constraints
Bez commit/push (dopóki user nie poprosi).
