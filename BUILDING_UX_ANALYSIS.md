# Building size management – UX analysis

**Context:** Building boundaries are implemented (dashed rectangle, grid inside building, placement within grid). Building size is currently shown in the toolbar (“Building: —” or “Building: 80 × 40 m”) and can be edited via `EditBuildingModal` opened from the toolbar. This document refines and standardizes the UX for managing building size.

**Scope:** Analysis only. No implementation.

---

## 1. Current UI state (summary)

- **Toolbar:** Tabs (Magazyn | Projektant Layoutu), then building label (clickable), warehouse usage % when building is set, warehouse selector, save status.
- **Building label:** “Building: 80 × 40 m” when set; “Building: —” when not. Click opens `EditBuildingModal`.
- **EditBuildingModal:** Title “Wymiary budynku”, Szerokość (m), Wysokość/głębokość (m), Anuluj / Zapisz. On save, `clampGridToBuilding` is applied so grid is capped by building.
- **Canvas:** Dashed rect around full canvas (building outline). Grid and racks inside.
- **RackSidebar:** No building section. Generator modal already warns when generated layout exceeds building and truncates.

---

## 2. UX options for where building configuration lives

### Option A — Toolbar control (current)

- **Pattern:** “Building: 80×40 m” (or “—”) in toolbar; click opens modal.
- **Pros:** Always visible in layout mode; one click to edit; doesn’t crowd sidebar; same place as usage %.
- **Cons:** Toolbar can get busy (tabs, building, usage, warehouse, save); small touch target if text is long.

### Option B — Sidebar panel

- **Pattern:** Section “BUDYNEK” in RackSidebar with Szerokość / Głębokość inputs and optional “Edit” opening modal.
- **Pros:** Groups layout-related settings; space for inline fields or short summary + “Edytuj”.
- **Cons:** Sidebar is already dense (catalog, templates, visuals, export, rack list); building is a one-time/seldom edit, so a full section may be heavy; user may not look in sidebar for “building.”

### Option C — Warehouse settings modal

- **Pattern:** Building dimensions in a separate “Warehouse settings” or “Layout settings” modal (e.g. from menu or warehouse selector).
- **Pros:** Keeps designer toolbar/sidebar minimal; fits “warehouse-level” metadata.
- **Cons:** Less discoverable; extra navigation; building is tightly tied to layout view (grid, generator, usage), so editing it from a generic “settings” screen can feel disconnected.

---

## 3. Recommended UI location for building settings

**Recommendation: Keep building in the toolbar as primary entry (Option A), and optionally mirror a read-only summary or shortcut in the sidebar.**

- **Primary:** Toolbar control that opens the existing modal. It’s already there, visible in layout mode, and next to usage %. No need to move it.
- **Optional later:** In the sidebar, a compact “Budynek: 80×40 m” line with an “Edytuj” link that opens the same modal (or focuses the toolbar control). This gives a second path without duplicating logic.
- **Warehouse settings (Option C):** Reserve for later if you add a full warehouse/project settings screen; building could be editable there too, but the designer toolbar should remain the main place to set/edit building so the meaning of the dashed rectangle is obvious.

**Conclusion:** **Option A (toolbar)** as primary; optional small sidebar line as secondary entry.

---

## 4. Recommended modal layout

Current modal is already clear. Suggested refinements (content/structure only):

- **Title:** Keep “Wymiary budynku” or use “Ustaw wymiary budynku” for first-time.
- **Fields:**
  - **Szerokość (m)** — width, number input, min 1, step 1 (or 0.5). Keep label as is.
  - **Głębokość (m)** — depth/length. Prefer “Głębokość” for consistency with “Szerokość” (both plan dimensions). Current “Wysokość / głębokość” is ambiguous (vertical vs horizontal); in 2D layout, the second dimension is depth/length. So: **“Głębokość (m)”**.
- **Short hint:** One line under the inputs, e.g. “Siatka i regały będą ograniczone do tego obszaru.” So the user understands that saving will clamp the grid and that racks must stay inside.
- **Actions:** Keep **Anuluj** and **Zapisz**. On **Zapisz**: run existing logic (update layout with building dimensions, `clampGridToBuilding`). If the new building is smaller than the current grid and any rack would end up outside the new boundary, show a **warning before or after save** (see section 8).
- **Optional:** Preview line “Powierzchnia: 3200 m²” (width × height) so users see the total area.

**Layout sketch:**

```
┌─────────────────────────────────────┐
│  Wymiary budynku                     │
├─────────────────────────────────────┤
│  Szerokość (m)                      │
│  [  80  ]                            │
│  Głębokość (m)                      │
│  [  40  ]                            │
│  Powierzchnia: 3200 m²   (optional) │
│  Siatka i regały w tym obszarze.    │
├─────────────────────────────────────┤
│           [ Anuluj ]  [ Zapisz ]    │
└─────────────────────────────────────┘
```

---

## 5. How to show building size in the toolbar

**Current:** Text “Building: 80 × 40 m” or “Building: —”; click opens modal.

**Improvements:**

1. **Make the control clearly editable:** Use a small icon (e.g. pencil ✏️ or “Edit” icon) next to the size so it’s obvious the value is editable. Current hover/title “Edytuj wymiary budynku” is good; icon reinforces it.
2. **Compact format when set:** “80×40 m” is fine. Optionally “Budynek: 80×40 m” if you switch to Polish for consistency with the rest of the UI.
3. **When not set:** Keep “Building: —” or “Budynek: —” and style it as a call-to-action (e.g. “Ustaw wymiary budynku” as button text when building is not set, and show “—” only in a subtitle or tooltip). So the empty state invites setting dimensions.
4. **Usage next to it:** Keep “Warehouse usage: 45%” (or “Zajętość: 45%”) when building is set; same line or immediately after building label so the relation “building → usage” is clear.

**Example toolbar line:**

```
[ Magazyn | Projektant Layoutu ]   Budynek: 80×40 m ✏️   Zajętość: 45%   [ Warehouse ▼ ]   Zapisano
```

When not set:

```
[ Magazyn | Projektant Layoutu ]   [ Ustaw wymiary budynku ]   [ Warehouse ▼ ]   …
```

---

## 6. Where to render dimension labels (80 m, 40 m)

**Goal:** Show building dimensions on the canvas (e.g. “80 m” along the top, “40 m” along the side) so the dashed rectangle is clearly labeled.

**Options:**

- **A) Inside WarehouseCanvas (SVG or div layer):** Draw text/labels in the same coordinate system as the canvas (cellPx, width, height). Pro: aligned with zoom/pan; con: canvas is already busy (grid, racks, rows, visuals).
- **B) Overlay layer (sibling to canvas):** A div or SVG overlay that sits on top of the canvas, same size, with the same transform (zoom/pan) so labels move with the view. Pro: separates “decoration” from content; con: need to keep overlay in sync with canvas transform.
- **C) Inside SVG, same group as building rect:** Add `<text>` elements for “80 m” and “40 m” near the building outline (e.g. top edge center, right edge center). Pro: one place, one transform; labels scale with zoom. Con: SVG gets more elements.

**Recommendation: Render dimension labels inside WarehouseCanvas, in the same SVG that contains the building rect.**

- **Placement:**  
  - **Width label:** e.g. top edge, center: `x = width/2`, `y = 12` (or 0.5 * cellPx), text “80 m” (or `${building_width_m} m` when building is set).  
  - **Depth label:** e.g. right edge, center: `x = width - 12`, `y = height/2`, text “40 m”, rotated -90° so it reads along the depth.  
  Or: width at top-left corner area, depth at bottom-right corner area (like your ASCII sketch) to avoid overlapping content.
- **Condition:** Only show when `layout.building_width_m` and `layout.building_height_m` are set. Use layout dimensions, not grid_cols/grid_rows, so the labels always show “building” size in meters.
- **Styling:** Small font (e.g. 10–11px), neutral color (#64748b or similar), possibly with a light background or no fill so they stay readable on grid. Consider `pointer-events: none` so they don’t block interaction.
- **Zoom:** Labels are in the same SVG viewBox, so they scale with zoom. If they become too big or too small, you can later hide them at extreme zoom or switch to a fixed-size overlay; for most zooms, scaling is acceptable.

**Why not a separate overlay layer for labels only:** An overlay would need to receive the same pan/zoom as the canvas; that’s doable but duplicates transform logic. Putting labels in the existing SVG keeps one source of truth and is simpler. If you later add many annotations, a dedicated “annotation layer” component (still inside the canvas wrapper) could be introduced.

**Conclusion:** **WarehouseCanvas**, in the same SVG as the building rect. Add a `<g>` (e.g. “building-labels”) with two `<text>` elements (width + depth), visible only when building dimensions are set, positioned at top and side (or corners) of the building rect.

---

## 7. User flow (summary)

1. User opens designer (Magazyn or Projektant Layoutu).
2. If building not set: toolbar shows “Building: —” or “Ustaw wymiary budynku”. User clicks → modal opens.
3. User sets width and depth (m), clicks Zapisz. Layout updates: `building_width_m`, `building_height_m` set; `clampGridToBuilding` runs so `grid_cols`/`grid_rows` ≤ building-derived max.
4. Grid (and canvas) may shrink if previous grid was larger than the new building. If any rack would end up outside the new boundary, show a warning (see below).
5. Generator (Generuj układ) already receives maxCols/maxRows from building and truncates with a message. No change needed for flow.
6. User sees usage % in toolbar when building is set; dashed rect and dimension labels on canvas reinforce “this is the building.”

---

## 8. How to warn when racks exceed building

Two situations:

**A) User shrinks the building (or sets building for the first time and current grid is larger):**  
After `clampGridToBuilding`, `grid_cols`/`grid_rows` can decrease. Racks that were inside the old grid might now have `x + width > grid_cols` or `y + height > grid_rows`. So they are effectively “outside” the new building.

**B) Load from backend:**  
Layout might have been saved with a larger grid and no building; then user sets a smaller building. Same as (A).

**Ways to handle:**

1. **Warn in the modal before saving:** When user clicks Zapisz, compute the new grid from the new building size. Check if any rack has `r.x + r.width > maxCols` or `r.y + r.height > maxRows`. If yes, show a warning in the modal (e.g. “Zmniejszenie budynku spowoduje, że X regałów znajdzie się poza granicą. Czy kontynuować?”) and require confirmation (e.g. “Zapisz anyway” / “Anuluj i dostosuj wymiary”). Optionally list which racks (by name) or count.
2. **Warn after save (snackbar/toast):** After applying new building and grid, run a check: racks outside new grid. If any, show a toast: “X regałów jest poza nową granicą budynku. Przesuń je lub usuń.” and optionally highlight those racks or offer “Pokaż regały”.
3. **Auto-move or clamp:** Not recommended: moving racks automatically can create overlaps or confusing layouts. Prefer warn + user action.
4. **Persistent banner:** When layout has “racks outside building,” show a small banner above or below the toolbar: “2 regały są poza granicą budynku. Edytuj budynek lub przesuń regały.” with a link to scroll to list or select them.

**Recommendation:**

- **In the modal (before save):** If the new building size would make the grid smaller and any existing rack would be outside the new grid, show an inline warning in the modal and a second step: “X regałów będzie poza granicą. Zapisać anyway?” with [Anuluj] [Zapisz anyway]. So the user consciously accepts that some racks will be “outside” until they move or delete them.
- **After save (and on load):** If `layout.building_width_m` and `layout.building_height_m` are set, compute maxCols/maxRows and check racks. If any rack is outside, show a **non-blocking** toast or small banner: “Y regałów poza granicą budynku” with optional “Pokaż”. Do not auto-delete or auto-move. User can then resize building again or move/delete racks.
- **Visual hint on canvas (optional):** Dim or outline racks that are outside the building (e.g. red border or “outside” badge). This helps when there are few such racks.

**Implementation note:** “Outside” = `r.x + r.width > maxCols` or `r.y + r.height > maxRows` (or `r.x < 0` or `r.y < 0`). Use the same `metersToCells(building_*_m)` as elsewhere for consistency.

---

## 9. Future UX compatibility

- **Generator:** Already respects building (maxCols/maxRows, truncation message). No UX change needed; keep showing “Layout will be truncated” when applicable.
- **Layout statistics:** Toolbar already shows usage %. A future “Layout statistics” panel could show building area, used area, utilization, and list of racks outside building if any.
- **Aisle planner / picking simulation:** Building boundary is the same rectangle; no extra UX for “building” beyond what’s in the designer. Simulation and heatmaps can use the same grid and building extent.

---

## 10. Summary

| Topic | Recommendation |
|-------|----------------|
| **Best UI location** | **Toolbar (Option A)** as primary. Optional: short “Budynek: 80×40 m” + “Edytuj” in sidebar opening same modal. |
| **Modal layout** | Keep current structure; use “Głębokość (m)” for second dimension; add one-line hint that grid/racks are limited to this area; optional area line (m²). Add “racks outside” warning before save when shrinking building. |
| **Toolbar display** | Show “Budynek: 80×40 m” with edit icon when set; “Ustaw wymiary budynku” when not set. Keep usage % next to it. |
| **Dimension labels** | **WarehouseCanvas**, in the same SVG as the building rect: two text elements (width at top, depth on side or corner), only when building dimensions are set; use building_width_m / building_height_m. |
| **Racks exceed building** | **Before save (modal):** If new building shrinks grid and any rack would be outside, show warning and “Zapisz anyway” confirmation. **After save / on load:** If any rack is outside building, show toast or small banner “X regałów poza granicą”; optional highlight or “Pokaż.” No auto-move or auto-delete. |

No code was changed; this is analysis only for implementation.
