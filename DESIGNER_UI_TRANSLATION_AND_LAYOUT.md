# Warehouse Designer — UI translation and layout

## 1. Labels translated (UI only)

Only visible user-facing text was changed. No variables, enums, or internal identifiers were renamed.

| Location | Before | After |
|----------|--------|--------|
| **WarehouseCanvas.tsx** (toolbar buttons) | Add Start Point | Punkt startowy |
| **WarehouseCanvas.tsx** (toolbar buttons) | Add Packing Station | Stacja pakowania |
| **WarehouseCanvas.tsx** (view control) | Fit | Dopasuj |
| **LayoutModeBadge.tsx** (badge prefix) | MODE: | Tryb: |
| **LayoutMode.ts** (LAYOUT_MODE_LABELS) | Add Start Point | Punkt startowy |
| **LayoutMode.ts** (LAYOUT_MODE_LABELS) | Add Packing Station | Stacja pakowania |

Unchanged (as requested):

- `LayoutMode.ADD_START`, `LayoutMode.ADD_PACK`, and all other enum/constant names
- All code structure and logic

---

## 2. Catalog section layout

**Before:** The "Katalog" section contained the rack template list and two action buttons in one row: "Generuj układ" and "Nowy szablon".

**After:**

- **Katalog** section contains only:
  - Header row: "Katalog ▼" (collapsible) and a single action **Nowy szablon** (top-right of the section).
  - Below: only the rack template list (and existing row prefix / gap / draw-row hints when not `showOnlyCatalog`).
- **Generuj układ** was removed from the catalog block and is no longer inside the Katalog section.

So the catalog block is only the list of templates; the "Nowy szablon" button sits next to the "Katalog" header.

---

## 3. Buttons relocated

| Button | Before | After |
|--------|--------|--------|
| **Nowy szablon** | Next to "Generuj układ" in the Katalog section | Next to the "Katalog" header (top-right of the Katalog section). Only this button remains in the catalog header. |
| **Generuj układ** | In the Katalog section (same row as "Nowy szablon") | In the **main designer toolbar** (top of the page), next to layout/building actions. Visible only when the "Projektant Layoutu" (layout) tab is active. |

Implementation details:

- **WarehouseDesigner.tsx:** Added `showGenerateLayoutModal` / `setShowGenerateLayoutModal` and passed them to both `RackSidebar` instances and `onOpenGenerateLayout={() => setShowGenerateLayoutModal(true)}` to `DesignerToolbar`.
- **DesignerToolbar.tsx:** New optional prop `onOpenGenerateLayout`. When `mainView === "layout"` and `onOpenGenerateLayout` is provided, a "Generuj układ" button is rendered in the main toolbar and calls `onOpenGenerateLayout` on click.
- **RackSidebar.tsx:** Optional controlled props `showGenerateLayoutModal` and `setShowGenerateLayoutModal`. When provided, the generate-layout modal is driven by the parent (e.g. opened from the main toolbar). Removed the "Generuj układ" button from the catalog block; left only "Nowy szablon" next to the Katalog header.

---

## 4. Button visual integration

- **Main toolbar "Generuj układ":** `px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-500 transition-colors` so it matches the existing toolbar style (same kind of rounding, padding, and primary action look as the building button).
- **Katalog header "Nowy szablon":** Kept `px-2 py-1 rounded-lg text-[10px] font-semibold bg-cyan-600 text-white hover:bg-cyan-500` and `shrink-0` so it stays compact in the sidebar and does not wrap. Header row uses `flex items-center justify-between gap-2` for spacing.

No new design tokens were added; existing Tailwind and inline styles were used.

---

## 5. Verification

The following flows are unchanged and still work:

- **Template selection** — Clicking a template in the catalog and using it for placement or "Draw Row".
- **Template creation** — "Nowy szablon" next to the Katalog header opens the template creator as before.
- **Layout generation** — "Generuj układ" in the main toolbar (layout tab) opens the generate-layout modal; behavior and `setLayout` / `row_containers` updates are the same.
- **Rack placement from templates** — Dragging from the catalog and dropping on the canvas or into row slots is unchanged.

Only the position of the "Generuj układ" and "Nowy szablon" buttons and the visible labels listed above were changed; no logic or data flow was modified.
