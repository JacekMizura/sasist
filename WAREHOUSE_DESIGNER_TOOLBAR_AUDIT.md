# Warehouse Designer Toolbar – Feature Audit

**Scope:** Warehouse Designer module (main designer at `/designer` and `/warehouse-designer`).  
**Purpose:** Identify which toolbar features are used, which are unused or dead, and their impact on backend/simulation.  
**No code was modified; analysis only.**

---

## SECTION 1 — TOOLBAR FEATURES (where each is implemented)

All of the following tools appear in the **canvas toolbar** inside `WarehouseCanvas.tsx` (around lines 434–522). The **top-level** designer toolbar is `DesignerToolbar.tsx`, which only has Magazyn/Layout tabs, building dimensions, warehouse selector, and save status — it does **not** contain the drawing tools.

| # | Feature | UI label (PL) | Component / file | Implementation details |
|---|--------|----------------|-------------------|-------------------------|
| 1 | **Draw Aisle** | Alejka | `WarehouseCanvas.tsx` (button "Alejka"); state/handlers in `WarehouseDesigner.tsx`, `useSelectionInteraction.ts` | `aisleToolActive` / `LayoutMode.DRAW_AISLE`; click-drag creates rectangle → appended to `layout.aisles`. |
| 2 | **Path Tool** | Narzędzie ścieżki | `WarehouseCanvas.tsx` (button "Narzędzie ścieżki"); state in `WarehouseDesigner.tsx`; handlers in `usePathInteraction.ts` | `pathToolActive`; click adds points to `manualPathPoints`; path drawn by `PathLayer.tsx`. |
| 3 | **Picking Path** | Ścieżka kompletowania | `WarehouseCanvas.tsx` (toggle "Ścieżka kompletowania"); state `showPickingPath`, `manualPathPoints` in `WarehouseDesigner.tsx` | Toggle visibility of the same path; distance shown when `pathDistanceM > 0`. |
| 4 | **Add Start Point** | Add Start Point | `WarehouseCanvas.tsx` (button); mode `LayoutMode.ADD_START`; placement in `usePlacementInteraction.ts` | Click calls `addSpecialLocation(cell, "PICK_START")` → API `POST /warehouse/special-location`. |
| 5 | **Add Packing Station** | Add Packing Station | Same as above; mode `LayoutMode.ADD_PACK` | `addSpecialLocation(cell, "PACKING")` → same API. |
| 6 | **Add Dock** | Add Dock | Same; mode `LayoutMode.ADD_DOCK` | `addSpecialLocation(cell, "DOCK")` → same API. |
| 7 | **Optimize (S)** | Optymalizuj (S) | `WarehouseCanvas.tsx` (button); handler `onMagicWand` from `useDesignerPath.ts` → `handleMagicWand` | Reorders `manualPathPoints` with S-shape (snake) and sets `showPickingPath` true. |
| 8 | **Show Labels** | Pokaż etykiety | `WarehouseCanvas.tsx` (button "Pokaż etykiety"); state `showRackLabels` in `WarehouseDesigner.tsx` | Toggle passed to `RackLayer`, `VisualLayer`, `WarehouseFullMap`; per-rack `show_label` in `RackPropertiesSidebar`. |
| 9 | **Show Dimensions** | Pokaż wymiary | `WarehouseCanvas.tsx` (checkbox); state `showDimensions` in `WarehouseDesigner.tsx` | When true, `useDesignerDimensions` provides `dimensionLines` and `aisleHighlights`; overlay drawn on canvas. |
| 10 | **Aisle Width (cm)** | Szer. alejki (cm) | `WarehouseCanvas.tsx` (number input); state `aisleWidthCm` in `WarehouseDesigner.tsx` | Used by `snapPosition()` in `DesignerRackPlacement.ts` (magnetic snap when placing rows) and by row/rack placement hooks. |

**Supporting files:**

- **Layout modes:** `frontend/src/warehouse-layout/LayoutMode.ts` — `DRAW_AISLE`, `PATH_TOOL`, `ADD_START`, `ADD_PACK`, `ADD_DOCK`.
- **Path logic:** `frontend/src/pages/WarehouseDesigner/useDesignerPath.ts` — `pickingPathPoints`, `pathDistanceM`, `handleMagicWand` (S-shape).
- **Path rendering:** `frontend/src/components/warehouse/WarehouseCanvas/PathLayer.tsx` — polyline from `pickingPathPoints`.
- **Aisle drawing:** `frontend/src/pages/WarehouseDesigner/interactions/useSelectionInteraction.ts` — `handleAislePart`, mouse up creates aisle rect.
- **Special locations API:** Frontend calls `POST /warehouse/special-location` and `GET /warehouse/{warehouse_id}/special-locations`; state `specialLocations` in `WarehouseDesigner.tsx`.

---

## SECTION 2 — FEATURE USAGE ANALYSIS

### 1. Draw Aisle (rysowanie alejki)

- **Where used:** Canvas toolbar toggles `aisleToolActive` (Draw Aisle mode). Mouse down on canvas sets `aisleDrawStart`; mouse up creates an aisle rectangle and pushes it to `layout.aisles`. Selection click on an existing aisle sets `selectedAisleIndex`; `WarehouseMainView.tsx` shows a sidebar to edit name, x, y, width, height, or delete the aisle.
- **State:** `aisleToolActive`, `aisleDrawStart`, `selectedAisleIndex`; `layout.aisles` (array of `AisleState`).
- **Persistence:** Aisles are part of the layout payload; backend `save_layout` persists them to `Aisle` table and returns them in `get_layout`. So **fully persisted**.
- **Backend:** Layout API reads/writes aisles; no separate aisle endpoint. `ValidationEngine` can validate `minAisleWidth` against layout aisles. **Path tool** (`usePathInteraction.ts`) restricts adding path points to cells inside an aisle (or rack/visual) — so aisles affect where path points can be placed.
- **Verdict:** **Fully implemented.** Used for drawing and editing aisles; persisted; path tool uses aisle geometry.

### 2. Path Tool (narzędzie ścieżki)

- **Where used:** Button enables Path Tool mode; clicks on canvas add points to `manualPathPoints` (with constraint: cell must be inside an aisle, rack, or visual). Points can be dragged; segments allow insert. Path is drawn as polyline in `PathLayer`.
- **State:** `pathToolActive`, `manualPathPoints`, `showPickingPath`; path distance computed in `useDesignerPath`.
- **Persistence:** Frontend sends `picking_path` in the layout save payload, but the **backend does not persist it**: `WarehouseLayoutPayload` and `save_layout` do not store `picking_path` or `visual_elements`. So the path is **session-only** and lost on reload.
- **Backend:** No backend endpoint consumes or returns picking path waypoints. Simulation and warehouse graph use **special locations** (PICK_START, PACKING) and **graph nodes/edges**, not this manual path.
- **Verdict:** **Partially implemented.** UI and interaction work; **not persisted**; not used by simulation or routing.

### 3. Picking Path (ścieżka kompletowania)

- **Where used:** Toggle "Ścieżka kompletowania" shows/hides the same path drawn by Path Tool and displays "Dystans: X m" when the path has ≥2 points.
- **State:** Same as Path Tool — `showPickingPath`, `manualPathPoints`; `pickingPathPoints` = `manualPathPoints` in current code.
- **Persistence:** Same as Path Tool — not stored by backend.
- **Verdict:** **UI only** for the same path data; **not persisted**; **not used by backend/simulation**.

### 4. Add Start Point

- **Where used:** Button sets mode to `ADD_START`; click on canvas calls `addSpecialLocation(cell, "PICK_START")` → `POST /warehouse/special-location` with `type: "PICK_START"`. Response updates `specialLocations.pick_start`. Canvas draws a "START" marker at that position.
- **State:** `specialLocations.pick_start` (from API); mode `layoutMode === ADD_START`.
- **Backend:** `POST /warehouse/special-location` creates a `Location` with `location_type=PICK_START`. Only one PICK_START per warehouse (new one replaces previous). `GET /warehouse/{id}/special-locations` returns `pick_start`, `packing`, `dock`.
- **Used by:** `get_special_locations_xy()` in `backend/domain/simulation/warehouse_graph_service.py` returns `(start_xy, pack_xy)` used by:
  - `picking_simulation_engine.py` (picking simulation),
  - `_pick_helpers.py` (picking simulation helpers),
  - `slotting_service.py` (distance to packing).
  - **Pick Path Simulation** page (`PickPathSimulation.tsx`) requires "Define start and packing locations in the warehouse designer" to run batch simulation.
- **Verdict:** **Fully implemented.** Required for picking simulation and analytics (e.g. Pick Path Simulation, slotting).

### 5. Add Packing Station

- **Where used:** Same flow as Add Start Point with `type: "PACKING"`. Marker "PACK" on canvas.
- **Backend:** Same API; `Location.location_type = "PACKING"`. `get_special_locations_xy` returns it as `pack_xy`.
- **Used by:** Same as Start Point — picking simulation, slotting (distance to packing), Pick Path Simulation page.
- **Verdict:** **Fully implemented.** Required for simulation and analytics.

### 6. Add Dock

- **Where used:** Same flow with `type: "DOCK"`. Canvas shows "DOCK" marker.
- **Backend:** Stored as `Location.location_type = "DOCK"` and returned in `get_special_locations`. **Not** used by `get_special_locations_xy()` (that only returns PICK_START and PACKING). Used in `generate_test_stock_service` and `dev` API to **exclude** DOCK from certain operations.
- **Verdict:** **Implemented but not used by simulation/routing.** Only stored and displayed; no distance or route logic uses DOCK. Safe to keep for future use or remove if not needed.

### 7. Optimize (S)

- **Where used:** Button calls `onMagicWand` → `handleMagicWand` in `useDesignerPath.ts`, which reorders `manualPathPoints` with `orderPointsSShape()` (sort by Y, then alternate X per row) and sets `showPickingPath` true.
- **State:** Modifies `manualPathPoints` only; no backend call.
- **Backend:** None. Pure frontend reorder of the manual path.
- **Verdict:** **Fully implemented (UI).** Only affects the non-persisted manual path; no simulation dependency.

### 8. Show Labels

- **Where used:** Toggle `showRackLabels`; passed to `RackLayer`, `VisualLayer`, `WarehouseFullMap`. Rack layer uses `canShowRackLabel()` so small racks hide labels. Per-rack `show_label` is editable in `RackPropertiesSidebar` and persisted in layout (backend stores `show_label` on rack).
- **State:** `showRackLabels` (global toggle); each rack has optional `show_label`.
- **Backend:** Rack `show_label` is in layout payload and can be stored (if backend schema extended; currently Rack model has no `show_label` in the grep; schema has `show_label` in RackSchema). Used only for display.
- **Verdict:** **Fully implemented.** Display-only; improves usability.

### 9. Show Dimensions

- **Where used:** Checkbox toggles `showDimensions`. When true, `useDesignerDimensions` computes `dimensionLines` and `aisleHighlights` for selected row/rack (distances to neighbors) and an overlay is drawn on the canvas.
- **State:** `showDimensions` in `WarehouseDesigner.tsx`; dimension data from `useDesignerDimensions`.
- **Backend:** None. Pure frontend visualization.
- **Verdict:** **Fully implemented.** Display-only; no persistence or simulation.

### 10. Aisle Width (Szer. alejki cm)

- **Where used:** Number input updates `aisleWidthCm` (default 250). Passed to `snapPosition()` in `DesignerRackPlacement.ts` for "magnetic" snap when placing a new row (candidates at rack ± `aisleCells`). Also used in `useDesignerRackPlacement` and `useRackInteraction` for snap when dragging racks.
- **State:** `aisleWidthCm` in `WarehouseDesigner.tsx`.
- **Persistence:** Not stored in layout; session-only (reset on reload). Layout generator modal has its own "Szerokość przejścia (cm)" for generation only.
- **Verdict:** **Fully implemented.** Affects placement UX only; not persisted; not used by backend.

---

## SECTION 3 — DEAD / UNUSED FEATURES

### 3.1 Manual picking path (Path Tool + Picking Path + Optimize S)

- **Dead in terms of persistence:** The path is sent in the save payload but **never stored** by the backend. After reload, the path is empty.
- **Dead in terms of simulation:** No backend or simulation code reads this path. Routing and picking simulation use the **warehouse graph** and **special locations** (PICK_START, PACKING), not `picking_path`.
- **Conclusion:** Path Tool, "Ścieżka kompletowania" toggle, and "Optymalizuj (S)" are **UI-only and non-persistent**. They are not dead code (they work in the session) but they are **unused by the rest of the system** and **not persisted**.

### 3.2 Alternate designer (WarehouseDesignerContext + Toolbar.tsx + WarehouseGrid.tsx)

- **Files:** `frontend/src/pages/WarehouseDesigner/WarehouseDesigner.tsx` (default export), `Toolbar.tsx`, `WarehouseGrid.tsx`, `RackConfiguratorPanel.tsx`, `context/WarehouseDesignerContext.tsx`.
- **Usage:** The **route** `/designer` and `/warehouse-designer` point to `WarehouseDesigner` from **`pages/WarehouseDesigner.tsx`** (the root file), **not** to `pages/WarehouseDesigner/WarehouseDesigner.tsx`. So the page that uses `WarehouseDesignerProvider`, `Toolbar`, and `WarehouseGrid` is **never mounted** unless something explicitly imports and renders `WarehouseDesigner` from the subfolder.
- **Conclusion:** The **Toolbar** with "Punkt startowy (START)", "Stacja pakowania (PACK)", "Ścieżka (2 punkty)" in `Toolbar.tsx` and the **WarehouseGrid** that fetches `/warehouse-maps/` are **orphan code** for the current app entry (they belong to an alternate designer that is not on the main route).

### 3.3 Add Dock

- **Used by backend only to:** (1) store and return in special-locations, (2) exclude from test stock generation and dev endpoints. **Not** used by `get_special_locations_xy`, routing, or picking simulation.
- **Conclusion:** **Optional / incomplete** from a simulation perspective. Safe to remove if you do not plan to use docks in routing or analytics.

---

## SECTION 4 — FEATURES REQUIRED FOR SIMULATION

### Picking simulation and warehouse graph

- **Required:** **Add Start Point** and **Add Packing Station.**  
  - They create `Location` rows with `location_type` PICK_START and PACKING.  
  - `get_special_locations_xy(db, warehouse_id)` returns `(start_xy, pack_xy)` in cm.  
  - Used by: `picking_simulation_engine`, `_pick_helpers`, `slotting_service`, and the **Pick Path Simulation** page (batch simulation is disabled until start and packing are defined).

### Routing and graph

- **Warehouse graph** (`warehouse_graph.py`, `WarehouseGraphService`): Builds nodes/edges from **Location** coordinates (including storage locations). It does **not** read the designer’s manual **picking_path** waypoints. Start/packing positions come from **special locations** (PICK_START, PACKING), not from the path tool.
- **Aisles:** Stored in layout and used by the frontend path tool to **restrict where path points can be placed**. They are **not** used by the current backend graph generation (which uses location coordinates and fixed spacing). So aisles are **not required for simulation** in the current backend.

### Summary table

| Feature | Required for simulation / graph? | Required for Pick Path Simulation page? |
|--------|-----------------------------------|----------------------------------------|
| Draw Aisle | No (not used by backend graph) | No |
| Path Tool / Picking Path / Optimize S | No | No |
| Add Start Point | Yes | Yes |
| Add Packing Station | Yes | Yes |
| Add Dock | No | No |
| Show Labels / Show Dimensions / Aisle Width | No (display/UX only) | No |

---

## SECTION 5 — SAFE TO REMOVE

### 5.1 Safe to remove (no impact on core or simulation)

1. **Path Tool + Picking Path toggle + Optimize (S)**  
   - If you do not plan to persist or use the manual path anywhere: you can remove the Path Tool, the "Ścieżka kompletowania" toggle, and the "Optymalizuj (S)" button, plus `useDesignerPath`’s magic wand and path-related state (`manualPathPoints`, `showPickingPath`) and `PathLayer` usage for this path.  
   - **Caveat:** Frontend currently sends `picking_path` in the save payload; backend ignores it. Removing the UI only is safe; optionally stop sending `picking_path` in the payload.

2. **Add Dock**  
   - Safe to remove if you do not need dock as a special location for future features. Backend would need to stop accepting/returning DOCK in special-location API and in `get_special_locations` if you want full cleanup.

3. **Alternate designer (WarehouseDesigner/WarehouseDesigner.tsx + Toolbar + WarehouseGrid + WarehouseDesignerContext)**  
   - Safe to remove if you confirm no route or entry point uses this flow. This removes the duplicate "Punkt startowy / Stacja pakowania / Ścieżka (2 punkty)" toolbar and the `/warehouse-maps/`-based grid.

### 5.2 Do not remove (needed for core / simulation)

- **Add Start Point** and **Add Packing Station** — required for picking simulation and Pick Path Simulation page.
- **Draw Aisle** — used for layout editing and for path-tool constraints; persisted; part of layout.
- **Show Labels, Show Dimensions, Aisle Width** — no backend dependency but improve usability; remove only if you intentionally simplify the toolbar.

### 5.3 Backend endpoints vs these tools

- **`backend/api/simulation.py`**  
  - No direct reference to aisles, path tool, or picking_path.  
  - Simulation uses services that call `get_special_locations_xy` (Start + Packing). So **simulation depends on Add Start Point and Add Packing Station**, not on the path tool or aisles.

- **`backend/api/warehouse_graph.py`**  
  - Graph is generated from **Location** coordinates (and optionally warehouse dimensions).  
  - No use of designer aisles or manual picking_path.  
  - Start/packing for routing come from **special locations** (same as above).

- **`backend/api/optimizer.py`**  
  - Uses OptimizerService and SimulationService (cart/order assignment).  
  - No direct use of aisles, path, or picking_path.  
  - Can indirectly depend on warehouse state (e.g. locations); no dependency on the listed toolbar features except as above (special locations).

---

## Summary

- **Fully implemented and used:** Draw Aisle, Add Start Point, Add Packing Station, Show Labels, Show Dimensions, Aisle Width (cm).  
- **Implemented but not persisted and not used by backend/simulation:** Path Tool, Picking Path toggle, Optimize (S).  
- **Implemented but not used by simulation/routing:** Add Dock.  
- **Orphan code (not on main route):** WarehouseDesigner (subfolder) + Toolbar.tsx + WarehouseGrid.tsx + WarehouseDesignerContext.  
- **Required for simulation / Pick Path Simulation page:** Add Start Point and Add Packing Station only.  
- **Safe to remove without breaking core:** Path Tool + Picking Path + Optimize (S) (and optionally Add Dock and the alternate designer stack), after confirming no other use of `picking_path` or DOCK.
