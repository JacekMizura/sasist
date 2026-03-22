# Rack interaction UX — Analysis (no code changes)

Structured report for four improvements: moving Copy/Paste/Odznacz out of the properties panel, adding Copy to the floating toolbar, changing copy to “copy → placement mode,” and improving the location list. **No code was changed.**

---

## SECTION 1 — Rack properties actions (Kopiuj, Wklej, Odznacz)

**Goal:** Remove these actions from the Rack Properties panel and make copy available on the floating rack toolbar instead.

### Where the buttons are rendered

- **File:** **`frontend/src/components/warehouse/RackPropertiesSidebar.tsx`**
- **Block:** Inside the same `<aside>` as the properties, in a shared button group at the bottom (lines 122–181).

**Buttons:**

1. **Widok z boku** — `setShowElevationForRackId(selectedRack.id ?? selectedRack.rack_index)` (line 122).
2. **Układ wewnętrzny** — `setInternalLayoutRackId(selectedRack.id ?? selectedRack.rack_index)` (line 123).
3. **Kopiuj (Ctrl+C)** — `onClick={() => setClipboard(selectedRacks)}` (line 124). Calls **`setClipboard`** with the current selection (`selectedRacks`).
4. **Wklej (Ctrl+V)** — `onClick` (lines 125–164): if `clipboard.length > 0`, calls **`getPastePosition()`** to get `{ x, y }` in cm, converts to cells, then **`setLayout`** with `prev.racks` plus new racks built from `clipboard.map(...)` (each rack duplicated with new id/position via `createBinsForRack`, `binsToLevels`, etc.).
5. **Odznacz** — `onClick={() => { setSelectedRackId(null); setSelectedRackIds([]); }}` (line 169).
6. **Usuń wybrane** — filter out selected racks from layout, clear selection (lines 171–181).

### How copy/paste are wired

- **Copy:** Only calls **`setClipboard(selectedRacks)`**. `clipboard` and `setClipboard` are React state in **`WarehouseDesigner.tsx`** (e.g. `useState<RackState[]>([])`); they are passed down to `RackPropertiesSidebar` and to **`DesignerKeyboard.ts`** for Ctrl+C / Ctrl+V.
- **Paste:** Uses **`getPastePosition()`** (provided as a prop; implemented in `WarehouseDesigner.tsx` to return e.g. last cursor or viewport center in cm). Then the same duplication logic as in DesignerKeyboard: for each clipboard rack, build new bins with `createBinsForRack`, assign new `x,y` (and offset for multiple racks), push into `layout.racks` via `setLayout`.
- **Odznacz:** Only clears selection state: **`setSelectedRackId(null)`**, **`setSelectedRackIds([])`**.

### Where code needs to change

1. **RackPropertiesSidebar.tsx**
   - Remove the **Kopiuj**, **Wklej**, and **Odznacz** buttons from the button group (lines 124–169).
   - Optionally remove the **clipboard**, **setClipboard**, and **getPastePosition** props from the sidebar if they are only used for those buttons; otherwise keep them only if still needed for keyboard shortcuts or elsewhere.
   - Keep **Widok z boku**, **Układ wewnętrzny**, and **Usuń wybrane** (or move “Usuń wybrane” to the floating toolbar if desired; current requirement is only about Kopiuj/Wklej/Odznacz).
2. **WarehouseDesigner.tsx / WarehouseMainView**
   - Stop passing **setClipboard**, **clipboard**, and **getPastePosition** into **RackPropertiesSidebar** if they are no longer used there. Keyboard copy/paste (DesignerKeyboard) can still use the same state and getPastePosition.
3. **Floating toolbar** (see Section 2): add a Copy action that calls **setClipboard(selectedRacks)** (or equivalent) so copy is available from the canvas.

---

## SECTION 2 — Floating rack action buttons (toolbar)

**Goal:** Add a Copy action to the small floating toolbar that appears when a single rack is selected.

### Where the floating toolbar is rendered

- **File:** **`frontend/src/components/warehouse/WarehouseCanvas/SelectionOverlay.tsx`**
- **Usage:** When **`SelectionOverlay`** is called with **`part="toolbar"`** (from **`WarehouseCanvas.tsx`** around lines 1027–1038).

**Condition:** The toolbar is rendered only when **`selectedRack`** is defined and **`!isMultiSelect`** (line 99: `if (!selectedRack || isMultiSelect) return null`). So it appears for **single-rack** selection only.

**Position:** A `<div>` absolutely positioned above the selected rack:  
`style={{ left: cellToPx(selectedRack.x, cellPx), top: cellToPx(selectedRack.y, cellPx) - 32 }}`.

### How actions are defined

- **ToolbarProps** (lines 22–31): `part`, `selectedRack`, `isMultiSelect`, `cellPx`, `setInternalLayoutRackId`, `setShowElevationForRackId`, `setLayout`, `setSelectedRackId`, `setSelectedRackIds`, `selectedRackIds`.
- **Three buttons today:**
  1. **Grid (Układ wewnętrzny)** — `setInternalLayoutRackId(selectedRack.id ?? selectedRack.rack_index)` (inline SVG: 4 rectangles).
  2. **Edit (Widok z boku)** — `setShowElevationForRackId(selectedRack.id ?? selectedRack.rack_index)` (inline SVG: doc/edit icon).
  3. **Delete (Usuń)** — filter out `selectedRackIds` from `layout.racks`, then `setSelectedRackId(null)`, `setSelectedRackIds([])` (trash icon).

There is no copy button and no **setClipboard** (or similar) in the toolbar props.

### Where code needs to change

1. **SelectionOverlay.tsx**
   - Extend **ToolbarProps** with a callback for copy, e.g. **`onCopyRack?: (rack: RackState) => void`** or **`setClipboard: (racks: RackState[]) => void`**.
   - Add a fourth button (e.g. copy icon) that calls **`setClipboard([selectedRack])`** (or `onCopyRack(selectedRack)` which the parent can translate to setClipboard). Use `title="Kopiuj"` (or from UI_STRINGS).
2. **WarehouseCanvas.tsx**
   - **WarehouseCanvas** receives many props from the parent; it does not currently receive **setClipboard**. Add **setClipboard** (or onCopyRack) to the canvas props and pass it into **SelectionOverlay** when `part="toolbar"`.
3. **WarehouseDesigner.tsx** (or wherever WarehouseCanvas is used with the toolbar)
   - Pass **setClipboard** (or an `onCopyRack` that calls `setClipboard([selectedRack])`) into **WarehouseCanvas** so the floating toolbar can invoke copy.

---

## SECTION 3 — Copy behavior (copy → placement mode with ghost)

**Goal:** Change copy so that after “Copy,” the user immediately enters a placement mode: a ghost rack follows the cursor and a click places the rack (no separate Paste step).

### Where paste/duplicate logic lives

- **RackPropertiesSidebar.tsx** (lines 125–164): Paste button calls **getPastePosition()**, then **setLayout** with new racks built from **clipboard** (same duplication logic as below).
- **DesignerKeyboard.ts** (lines 116–154): **Ctrl+V** — `getPastePosition()`, then **setLayout** with **clipboard.map(...)** and the same rack-building (createBinsForRack, new x/y, rack_index).
- **DesignerKeyboard.ts** (lines 155–195): **Ctrl+D** (duplicate) — same flow but source is **selected racks** instead of clipboard; still uses **getPastePosition()** and the same **setLayout** + **createBinsForRack** logic.

So the **“place duplicated rack(s) at position”** logic is duplicated in:
- RackPropertiesSidebar (paste button),
- DesignerKeyboard (Ctrl+V and Ctrl+D).

The core operation is: **given an array of racks and a position (cx, cy) in cells**, produce new rack(s) with new id/rack_index, new x/y (with offset for multiple), and new bins from **createBinsForRack** / **binsToLevels**, then append to **layout.racks** via **setLayout**.

### How racks are duplicated

- For each source rack: **getLevelConfig(r)**, **getTotalLocations(lc)**, **volumePerBinFromTotal** or **volumePerBin**, then **createBinsForRack**(aisle_letter, new rack_index, levels, bins_per_level, volPerBin, …) with pattern/rowId/sectionStartIndex/binNamingType from the source.
- New rack: **`{ ...r, id: undefined, x, y, rack_index, bins, rackLevels: binsToLevels(bins) }`** (and in some paths **rackLevels** is omitted and only **bins** is set).
- Position: **cx, cy** in cells; for multiple racks, offset: **`cx + (i % 3) * (r.width + 1)`**, **`cy + Math.floor(i / 3) * (r.height + 1)`**.

### Where code needs to change for “copy → placement mode”

1. **Single place for “place racks at position”**
   - Prefer one helper (e.g. in **WarehouseDesigner.tsx** or a small hook) that takes **racks: RackState[]**, **position in cells { cx, cy }**, **current layout** and returns the updated layout (or the new racks to append). Then:
     - Paste button, Ctrl+V, Ctrl+D, and **“place on canvas click”** all call this helper.
   - This avoids duplicating the createBinsForRack/offset logic in multiple places.

2. **New “placement from copy” mode**
   - When user triggers **Copy** (e.g. from the floating toolbar or Ctrl+C):
     - Keep **setClipboard(selectedRacks)**.
     - Additionally set a mode flag, e.g. **placementFromClipboard** or **copyGhostRacks: RackState[] | null**. When non-null, the canvas is in “place copied rack(s)” mode.
   - **Canvas behavior in this mode:**
     - **Mouse move:** Show a **ghost** (same as existing placement ghost or catalog ghost) at the current cell/cursor position for the first copied rack (or a bounding box for multiple). Reuse existing ghost rendering (e.g. the rect used for catalog drop or placement mode) and compute size from clipboard[0].width / height (in cells).
     - **Click (or “place” action):** Call the shared “place racks at position” helper with **clipboard** and **current cell (from getCellFromEvent or cursor position)**. Then clear the mode (**copyGhostRacks = null** or **placementFromClipboard = false**) and optionally clear or keep clipboard.
   - **Escape / cancel:** Clear the mode so the ghost disappears and no placement happens.

3. **Integration points**
   - **WarehouseCanvas** (or the component that handles canvas mouse events) must:
     - Accept props for “copy placement” mode and ghost (e.g. **copyGhostRacks**, **setCopyGhostRacks**, or **placementFromClipboard**, **getCellFromEvent**).
     - In **handleCanvasMouseMove**, if in this mode, update ghost position from current cell (and possibly store “pending place position”).
     - In **handleCanvasMouseDown** or **handleCanvasMouseUp**, if in this mode and click is on canvas, call the shared “place racks at position” then exit mode.
   - **DesignerKeyboard**: Ctrl+V could either:
     - Keep current “paste at getPastePosition()” behavior, or
     - Switch to “enter placement mode with ghost” so V behaves like “Copy then click to place” (one less key, same UX as copy-from-toolbar). Product decision.

4. **Optional: remove Paste UI**
   - If all placement goes through “copy → ghost → click,” the **Paste** button can be removed from the properties panel (already planned in Section 1). Ctrl+V can either be removed or repurposed to “enter placement mode if clipboard has racks.”

---

## SECTION 4 — Location list readability (Poziom → Pozycja → full codes)

**Goal:** Change the list from “levelIndex → positionIndex” (e.g. 1 → 1, 1 → 2) to a layout grouped by level with full location codes (e.g. “Poziom 1” then “A1-1-1”, “A1-1-2”).

### Where the list is rendered

- **File:** **`frontend/src/components/warehouse/RackPropertiesSidebar.tsx`**
- **Block:** Lines 100–118 (single-rack branch).

**Current structure:**

- **Data:** `levels = selectedRack.rackLevels ?? (selectedRack.bins?.length ? binsToLevels(selectedRack.bins) : [])`. So each item is a **RackLevel** `{ levelIndex, positions: RackPosition[] }`.
- **RackPosition** (types): **locationUUID**, **locationAddress**, positionIndex, volume_dm3, used_volume_dm3, etc.
- **Rendering:**  
  `levels.flatMap((lev) => lev.positions.map((_, posIndex) => ( <div key={...}>{lev.levelIndex} → {posIndex + 1}</div> )))`  
  So the UI shows only **level index** and **1-based position index** (e.g. “1 → 1”, “1 → 2”). It does **not** use **pos.locationAddress** or **pos.locationUUID**.

### How location names are generated

- **rackLevels** can come from:
  - **rack.rackLevels** (if already set when the rack was created/loaded), or
  - **binsToLevels(selectedRack.bins)** in **warehouseUtils.ts** (lines 951–978).
- **binsToLevels** builds **RackLevel[]** from **BinState[]**. For each bin it sets:
  - **locationUUID**: `b.locationUUID ?? \`gen-${levelIndex}-${b.segment_index}\``
  - **locationAddress**: `b.location_id ?? b.label ?? ""`
- So **locationAddress** is the human-readable code (e.g. “A1-1-1”) when **bin.label** or **bin.location_id** is set. Those are set when bins are created (e.g. **createBinsForRack** / **expandAddressPattern** or similar). So **full location codes do already exist** on **pos.locationAddress** (and fallback **pos.locationUUID**) when the rack has bins/rackLevels populated with labels.

### Where code needs to change

1. **RackPropertiesSidebar.tsx** (location list block, lines 104–116)
   - **Group by level:** Instead of `levels.flatMap(...)`, iterate **by level** and for each level render:
     - A **section header**: e.g. **“Poziom {lev.levelIndex}”** (or “Poziom 1”, “Poziom 2”, …).
     - Then a list of **positions** for that level.
   - **Show full code per position:** For each `pos` in `lev.positions`, display **`pos.locationAddress || pos.locationUUID || fallback`** (e.g. fallback `${rackDisplayId}-${lev.levelIndex}-${pos.positionIndex}` if both are empty). So each row shows the full location code (e.g. “A1-1-1”, “A1-1-2”) instead of “1 → 1”, “1 → 2”.
   - **Markup:** For example:
     - Outer: `levels.map((lev) => <div key={lev.levelIndex}>...</div>)`
     - Inner: `<p className="...">Poziom {lev.levelIndex}</p>` and then `lev.positions.map((pos) => <div key={pos.locationUUID}>...</div>)` with content `pos.locationAddress || pos.locationUUID || \`${getRackDisplayId(selectedRack)}-${lev.levelIndex}-${pos.positionIndex}\``.
   - **Remove** the current “Lokacje (poziom → pozycja)” line that only shows “levelIndex → posIndex” and replace with the grouped layout and full codes as above.

2. **Data**
   - No schema change. **RackPosition** already has **locationAddress** and **locationUUID**. If some racks have empty **locationAddress**, the fallback (e.g. rack label + level + position) keeps the list readable.

---

## Summary table

| Issue | Main file(s) | Current behavior | Where to change |
|-------|--------------|------------------|------------------|
| **1. Copy/Paste/Odznacz in properties** | RackPropertiesSidebar.tsx | Kopiuj calls setClipboard(selectedRacks); Wklej uses getPastePosition + setLayout; Odznacz clears selection. | Remove these three buttons (and optionally clipboard/getPastePosition props) from RackPropertiesSidebar; add Copy to floating toolbar. |
| **2. Floating toolbar** | SelectionOverlay.tsx, WarehouseCanvas.tsx | part="toolbar" shows grid, elevation, delete; only when single rack selected. | Add setClipboard (or onCopyRack) to ToolbarProps and to WarehouseCanvas props; add Copy button in SelectionOverlay; pass setClipboard from WarehouseDesigner. |
| **3. Copy → placement mode** | DesignerKeyboard, RackPropertiesSidebar, canvas handlers | Paste uses getPastePosition(); duplicate logic in several places. | Add “placement from copy” mode and ghost; single helper for “place racks at position”; on Copy set mode + clipboard; on canvas click in mode call helper and clear mode. |
| **4. Location list** | RackPropertiesSidebar.tsx (100–118) | Flat list “lev.levelIndex → posIndex+1”. | Group by level (“Poziom N”), show pos.locationAddress \|\| pos.locationUUID \|\| fallback per position. |
