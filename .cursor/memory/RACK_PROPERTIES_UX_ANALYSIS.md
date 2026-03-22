# Rack Properties Panel — UX issues (analysis only)

Structured report for five issues in the Rack Properties panel in the Warehouse Designer. **No code was changed.**

---

## SECTION 1 — Bin terminology ("Poziomy / Biny")

**Goal:** Translate "Bin" into proper Polish (e.g. Pozycja or Lokalizacja).

### Where the label is rendered

- **File:** `frontend/src/components/warehouse/RackPropertiesSidebar.tsx`
- **Usage:** Line 102 — `<dt className="text-slate-500">{UI_STRINGS.warehouse.rackProperties.levelsBins}</dt>`
- **Value shown next to it (line 104–110):** Either `${selectedRack.levels} / ${selectedRack.bins_per_level}` (e.g. "4 / 5") or `${selectedRack.levels} poz., Suma: ${total} lok.` when level config is non-uniform.

### Where "Bin" is defined

- **UI text:** The literal **"Poziomy / Biny"** comes from **`frontend/src/constants/uiStrings.ts`**:
  - Key: `UI_STRINGS.warehouse.rackProperties.levelsBins`
  - Value: `"Poziomy / Biny"` (line 106).
- **Schema / data:** The **numbers** (levels, bins per level) come from the rack schema: `selectedRack.levels`, `selectedRack.bins_per_level`, and `getLevelConfig(selectedRack)` (which returns `locations` per level). The word "Biny" is only in the UI string; there is no separate "Bin" label in the schema. The codebase uses `bins_per_level`, `bins`, `BinState` etc. as internal/API names; the user-facing label for the pair "levels / bins" is solely the string in `uiStrings.ts`.

### Related terminology in the app

- **RackSidebar:** `UI_STRINGS.warehouse.rackSidebar.locationsPerLevelShort` is **"lok./poz."** (line 83 in uiStrings.ts) — used for "X poziomy, Y lok./poz.".
- **RackPropertiesSidebar** alternate format already uses **"poz."** and **"lok."** (pozycje, lokalizacje) in the same component (line 108).

### Recommended implementation

1. **Change the UI string only** (no schema change):
   - In `frontend/src/constants/uiStrings.ts`, set `levelsBins` to one of:
     - **"Poziomy / Pozycje"** (consistent with "lok./poz." and "poz." in the same panel), or
     - **"Poziomy / Lokalizacje"** if you prefer "Lokalizacja" everywhere.
2. The display format "4 / 5" (levels / count per level) stays as is; only the section label changes. No changes needed in `RackPropertiesSidebar.tsx` or schema.

---

## SECTION 2 — "Przeciągnij na planie, aby przenieść" (drag helper text)

**Goal:** Remove this helper text.

### Where it is rendered

- **File:** `frontend/src/components/warehouse/RackPropertiesSidebar.tsx`
- **Line:** 129  
  `<p className="text-[10px] text-slate-500 mt-1">Przeciągnij na planie, aby przenieść.</p>`
- **Context:** It appears in the **single-rack** branch of the properties panel (inside the `else` of `isMultiSelect`), below the "Pokaż etykietę na mapie" checkbox.

### Functional dependency

- The text is **static**; it is not used by any handler, state, or condition.
- No code reads this string or depends on the presence of this `<p>`.
- **Conclusion:** Safe to remove. Delete the entire `<p>...</p>` element (line 129).

---

## SECTION 3 — Percentages in Locations list ("A1 -> 30%")

**Goal:** Remove the percentage shown for each location in "Lokacje (poziom → pozycja)".

### Where the percentage is calculated and rendered

- **File:** `frontend/src/components/warehouse/RackPropertiesSidebar.tsx`
- **Section:** "Lokacje (poziom → pozycja)" (lines 132–158).
- **Logic:**
  - For each position in `lev.positions`:  
    `vol = pos.volume_dm3 ?? 0`, `used = pos.used_volume_dm3 ?? 0`  
    `pct = vol > 0 ? Math.min(100, Math.round((used / vol) * 100)) : 0`
  - **Rendered:** Line 149 — `<span className={...}>{pct}%</span>` next to `pos.locationAddress || pos.locationUUID`.

### What the percentage represents

- **Occupancy** of that location (bin): (used volume dm³ / capacity volume dm³) × 100.
- Same concept as in:
  - **ElevationPanel** (bin-level occupancy and tooltips)
  - **RackSidebar** (rack-level capacity %)
  - **warehouseUtils** (`binUsedVolumeDm3`, `binVolumeDm3`)

### Is it used elsewhere?

- The **occupancy value** is used in several places (elevation view, rack list, etc.).
- The **display of a percentage next to each location in the Rack Properties list** is only in this block in `RackPropertiesSidebar.tsx`. Removing it does not affect other features; only this list would no longer show the percentage column.

### Recommended implementation

- In `RackPropertiesSidebar.tsx`, in the locations list (lines 141–151), **remove the percentage span**:
  - Either delete the second `<span>` that shows `{pct}%`, or
  - Remove the `pct` calculation (and optionally the `vol`/`used` variables) if they are only used for this display.
- Keep the row structure so each line still shows the location address/ID (first span). Optionally keep the row as a single column layout (address only).

---

## SECTION 4 — Copy / Paste not working

**Goal:** Understand what copy/paste do and why paste does not work.

### Where copy/paste is implemented

- **Copy (Kopiuj):**  
  **File:** `frontend/src/components/warehouse/RackPropertiesSidebar.tsx` (line 165)  
  `onClick={() => setClipboard(selectedRacks)}`  
  So **copy** stores the currently **selected rack(s)** (`selectedRacks`, i.e. full `RackState[]`) in React state `clipboard` in `WarehouseDesigner.tsx`. It does **not** use the browser clipboard (no `navigator.clipboard`). **Copy works** as implemented.

- **Paste (Wklej):**  
  **Same file**, lines 167–207. On click it runs:
  ```ts
  if (clipboard.length && cursorCm != null) {
    const cx = cmToCells(cursorCm.x);
    const cy = cmToCells(cursorCm.y);
    setLayout((prev) => ({
      ...prev,
      racks: [...prev.racks, ...clipboard.map((r, i) => { /* new racks at (cx, cy) with offset */ })],
    }));
  }
  ```
  So **paste** is supposed to insert copies of the clipboard racks at the **cursor position in cm** (`cursorCm`). If `cursorCm` is **null**, the `if` block never runs and **nothing happens** — no feedback, no paste.

### Why paste does not work

- **Paste depends on `cursorCm`.**  
  `cursorCm` is the last **mouse position over the layout canvas** in centimetres.
- **Where `cursorCm` is set:**
  - **Updated:** In `frontend/src/pages/WarehouseDesigner/useDesignerMouseHandlers.ts`, inside `handleCanvasMouseMove` (via a requestAnimationFrame), only when the pointer is over the **SVG canvas** and `getCellFromEvent(e)` returns a cell (lines 386–410). So `cursorCm` is only non-null when the user has **recently moved the mouse over the canvas**.
  - **Cleared:** In `handleCanvasMouseLeave` (line 439–441): `setCursorCm(null)` when the pointer **leaves the canvas** (e.g. when moving to the sidebar to click "Wklej").
- **Result:** As soon as the user moves the mouse from the canvas to the Rack Properties panel and clicks "Wklej", the pointer has left the canvas, so `cursorCm` is set to `null` and the paste handler does nothing. **Paste therefore appears broken** for the typical flow: select racks → Copy → click Wklej in the sidebar.

- **Keyboard paste (Ctrl+V):** Implemented in `frontend/src/pages/WarehouseDesigner/DesignerKeyboard.ts` (lines 118–126) with the same condition `clipboard.length > 0 && cursorCm != null`. So Ctrl+V has the same issue if the cursor is not over the canvas when the key is pressed.

### What copy is supposed to copy

- **Copy** stores the **current selection of racks** (`selectedRacks`: full `RackState[]` including dimensions, levels, bins, position, etc.). Paste is supposed to **duplicate** those racks at a new position (cursor in cells, with a 3-column offset for multiple racks). Logic for building new rack state (ids, bins, positions) is in the paste handler and is correct; the only blocker is `cursorCm == null`.

### Recommended implementation

1. **Option A — Fallback position when `cursorCm` is null**
   - When the user clicks "Wklej" (or uses Ctrl+V) and `cursorCm == null`, use a **fallback position** instead of doing nothing, e.g.:
     - Last known cursor position stored in a ref (so it is not cleared on mouse leave), or
     - Center of the current viewport in cm, or
     - Offset from the first selected rack (e.g. +1 column / +1 row from the first rack’s top-left).
   - Then paste always inserts at a defined position and works even when the user clicks Wklej from the sidebar.

2. **Option B — Require explicit paste position**
   - Keep `cursorCm` as the only paste position but improve UX:
     - Show a short message when clipboard has content and cursor is not on canvas: e.g. "Najedź na plan i kliknij Wklej lub naciśnij Ctrl+V" (or disable the Wklej button when `cursorCm == null` and show a tooltip).
     - Optionally: "Paste mode" — after clicking Wklej once, the next click on the canvas performs the paste at that cell (so position is set by a canvas click instead of current mouse position).

3. **Option C — Store last cursor in a ref**
   - In `useDesignerMouseHandlers` (or wherever `setCursorCm` is called), update a **ref** (e.g. `lastCursorCmRef`) on every mouse move, and never clear it on mouse leave. Pass that ref (or its current value) to the paste handler. When the user clicks Wklej, use `lastCursorCmRef.current` if `cursorCm` is null. This makes paste use the last canvas position when the user has moved to the sidebar.

Implementing **Option A or C** will make paste work when the user clicks "Wklej" from the panel; Option B only makes the requirement explicit.

---

## SECTION 5 — Multi-select rack editing (height / levels should be read-only)

**Goal:** When multiple racks are selected, the properties panel should show only information (Height, Levels), not editable inputs.

### How multi-selection is detected

- **File:** `frontend/src/pages/WarehouseDesigner.tsx`  
  **Line:** 1215  
  `const isMultiSelect = selectedRackIds.length > 1;`
- **Prop flow:** `isMultiSelect` is passed into `WarehouseCanvas` (and related props) and eventually to **`RackPropertiesSidebar`** as the `isMultiSelect` prop (e.g. from `WarehouseMainView.tsx` around line 299).
- **Selection:** `selectedRackIds` is an array of rack ids; when the user selects more than one rack (e.g. via marquee or Ctrl+click), `selectedRackIds.length > 1` and `isMultiSelect` is true. The properties panel is shown when at least one rack is selected (`selectedRack && selectedAisleIndex == null && selectedVisualIds.length === 0` in WarehouseMainView).

### Where the properties panel checks selected rack count

- **File:** `frontend/src/components/warehouse/RackPropertiesSidebar.tsx`
- **Line:** 37 — `{isMultiSelect ? ( ... ) : ( ... )}`
- **When `isMultiSelect` is true** (lines 38–94): The panel shows:
  - "Wybrano: X regałów"
  - **Editable** "Wysokość (cm) – wszystkie" — `<input type="number" ... onBlur={...}>` (lines 42–52) that applies the same height to all selected racks.
  - **Editable** "Poziomy – wszystkie" — `<input type="number" ... onBlur={...}>` (lines 54–92) that applies the same level count to all selected racks and rebuilds bins.
- **When `isMultiSelect` is false** (lines 95–159): Single-rack view with dimensions, levels/bins label, "Pokaż etykietę", locations list, etc.

So the **check** is the `isMultiSelect` prop; the **editing** is the two number inputs in the multi-select branch.

### Where editing inputs are enabled

- **RackPropertiesSidebar.tsx**, lines 43–52 (height input) and 55–92 (levels input). Both are normal uncontrolled inputs with `onBlur` handlers that call `setLayout` to update all selected racks. There is no `disabled={isMultiSelect}` or similar; the multi-select branch is **defined** as the branch that shows these two inputs.

### Recommended implementation

1. **Replace the two inputs with read-only display** when `isMultiSelect` is true:
   - **Height:** Compute a single value or a summary (e.g. common height if all selected racks have the same `height_cm`, or "X–Y cm" / "różne" if they differ). Render as text (e.g. `<p>` or `<dd>`), no `<input>`.
   - **Levels:** Same idea — show e.g. "4" if all have the same `levels`, or "3–5" / "różne" if they differ. No input.
2. **Keep** the rest of the multi-select block: "Wybrano: X regałów" and any other info you want (e.g. shared actions like Copy, Paste, Odznacz, Usuń wybrane).
3. **Remove** the two `onBlur` handlers and the `setLayout` logic that change height/levels for all selected racks in multi-select mode, so multi-select no longer allows editing dimensions or levels.

If you later want to support "apply same height/levels to all" in multi-select, that can be a separate action (e.g. a button "Ustaw wspólną wysokość" that opens a small modal or inline form) instead of always-visible inputs.

---

## Summary table

| Issue | Main file(s) | Current behavior | Recommended change |
|-------|--------------|------------------|--------------------|
| **1. Bin terminology** | `uiStrings.ts` (levelsBins), `RackPropertiesSidebar.tsx` | Label "Poziomy / Biny" from UI_STRINGS; numbers from rack schema. | Change `levelsBins` to "Poziomy / Pozycje" or "Poziomy / Lokalizacje" in uiStrings.ts. |
| **2. Drag helper text** | `RackPropertiesSidebar.tsx` (line 129) | Static `<p>Przeciągnij na planie, aby przenieść.</p>`. | Remove the `<p>` element; no functional dependency. |
| **3. Location percentage** | `RackPropertiesSidebar.tsx` (lines 132–158) | Occupancy % (used/vol) per location in "Lokacje (poziom → pozycja)". | Remove the percentage span (and optionally the pct/vol/used calc) for that list only. |
| **4. Copy/Paste** | `RackPropertiesSidebar.tsx`, `useDesignerMouseHandlers.ts`, `DesignerKeyboard.ts` | Copy stores selectedRacks in state. Paste requires `cursorCm != null`; cursor is cleared on canvas leave, so sidebar click = null = no paste. | Use fallback position when cursorCm is null (e.g. last cursor ref or viewport center), or document that paste requires cursor over canvas. |
| **5. Multi-select editing** | `WarehouseDesigner.tsx` (isMultiSelect), `RackPropertiesSidebar.tsx` (lines 38–94) | Multi-select shows editable "Wysokość" and "Poziomy" inputs that update all selected racks. | In multi-select branch, replace inputs with read-only text (height and levels summary); remove onBlur/setLayout for those two fields. |
