# Catalog UI improvement

## Summary

The **Generuj układ** button was moved from the main designer toolbar back into the **Katalog** section and grouped with **+ Nowy szablon**. Both catalog actions are now in one place, with consistent styling and optional icons. No logic or function names were changed.

---

## Moved "Generuj układ" into catalog

- **Before:** "Generuj układ" was in the main designer toolbar (top of the page, next to building/warehouse actions).
- **After:** "Generuj układ" is inside the Katalog block in `RackSidebar`, directly under "+ Nowy szablon".

Behavior is unchanged: clicking "Generuj układ" still opens the same generate-layout modal (state and handlers are unchanged).

---

## Grouped catalog actions

**Target structure:**

```
Katalog                    ▼
------------------------------
[ + Nowy szablon    ]   (cyan)
[ Generuj układ     ]   (emerald)
------------------------------
(current row / gap / hints)
(template list)
```

- **Header:** Only the collapsible "Katalog ▼" title (no button in the header row).
- **Actions:** When the catalog is expanded and not in "showOnlyCatalog" mode, a single column shows:
  1. **+ Nowy szablon** — same action as before (opens template creator).
  2. **Generuj układ** — same action as before (opens generate layout modal).
- **Layout:** `flex flex-col gap-2` so both buttons are full width (`w-full`), same height (`px-3 py-2`), and spaced with `gap-2`.

---

## Style consistency

- Both buttons use:
  - `w-full px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2`
- **+ Nowy szablon:** `bg-cyan-600 text-white hover:bg-cyan-500`
- **Generuj układ:** `bg-emerald-600 text-white hover:bg-emerald-500`

---

## Icons (lucide-react)

- **+ Nowy szablon:** `Plus` icon (14px), with existing "+" in the label from `UI_STRINGS.warehouse.rackSidebar.newTemplate`.
- **Generuj układ:** `Wand2` icon (14px).

Imports: `Plus`, `Wand2` from `lucide-react`.

---

## Files modified

| File | Change |
|------|--------|
| `frontend/src/components/warehouse/RackSidebar.tsx` | Imported `Plus`, `Wand2`. Removed the single "Nowy szablon" button from the Katalog header row. Added a vertical group (flex-col gap-2) with two full-width buttons: "+ Nowy szablon" (Plus icon) and "Generuj układ" (Wand2 icon), only when `!catalogCollapsed && !showOnlyCatalog`. |
| `frontend/src/pages/WarehouseDesigner/DesignerToolbar.tsx` | Removed the "Generuj układ" button and the `onOpenGenerateLayout` prop from the main toolbar. |
| `frontend/src/pages/WarehouseDesigner.tsx` | Stopped passing `onOpenGenerateLayout` to `DesignerToolbar`. Still passes `showGenerateLayoutModal` / `setShowGenerateLayoutModal` to `RackSidebar` so the modal continues to work. |

---

## Verification

- **Creating a template:** "+ Nowy szablon" still opens the template creator; behavior unchanged.
- **Generating layout:** "Generuj układ" in the catalog still opens the generate-layout modal and runs the same logic.
- **Selecting templates:** Template list and selection/drag are unchanged; only the action buttons above the list were regrouped and restyled.
