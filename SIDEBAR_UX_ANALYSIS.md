# Warehouse Designer Sidebar — UX improvements (analysis only)

Structured report for six sidebar issues. **No code was changed.**

---

## SECTION 1 — Sidebar tab naming ("Katalog")

**Goal:** Rename the tab to reflect that it contains layout tools and templates, not only a catalog.

### Where the tab label is defined

- **Source:** **`frontend/src/constants/uiStrings.ts`**
  - Key: `UI_STRINGS.warehouse.rackSidebar.catalog`
  - Value: **`"Katalog"`** (line 81).
- **Usage:** **`frontend/src/components/warehouse/RackSidebar.tsx`**
  - Line 131: tab button text — `{UI_STRINGS.warehouse.rackSidebar.catalog}` for the first tab.
  - Line 165: same string is used as the section title for the collapsible "catalog" block ("Katalog ▶" / "Katalog ▼").

### Hardcoded vs uiStrings

- The tab label is **from uiStrings** (not hardcoded in RackSidebar). Changing `UI_STRINGS.warehouse.rackSidebar.catalog` in `uiStrings.ts` will update both the tab and the section heading inside that tab.

### Current structure

- When `!showOnlyCatalog`, the sidebar shows two tabs: **"Katalog"** and **"Elementy wizualne"** (`UI_STRINGS.warehouse.rackSidebar.visualElements`). The first tab contains: Budynek, Szablony (templates), row tool, and (when expanded) Lista regałów with export buttons.

### Recommended approach

1. **Rename in one place:** In `frontend/src/constants/uiStrings.ts`, change `rackSidebar.catalog` from `"Katalog"` to a label that reflects "layout + templates", e.g.:
   - **"Layout i szablony"**, or
   - **"Projekt"**, or
   - **"Szablony i plan"**
2. No changes needed in `RackSidebar.tsx`; it will pick up the new string.
3. If the internal section title (the collapsible "Katalog ▼") should differ from the tab (e.g. tab "Layout i szablony", section "Szablony regałów"), add a separate key (e.g. `rackSidebar.catalogSection`) and use it only for the collapsible header, keeping the tab label from `catalog`.

---

## SECTION 2 — Rack list rendering (and adding search)

**Goal:** Add a search field above the rack list; identify where the list is rendered and what can be filtered.

### Where the rack list is rendered

- **File:** **`frontend/src/components/warehouse/RackSidebar.tsx`**
- **Section:** The "Lista regałów" block (when `!showOnlyCatalog` and `!rackListCollapsed`), lines 329–430.
- **Rack items:** **Lines 384–414** — `layout.racks.map((r) => { ... })`. Each rack is rendered as a `<button>` with:
  - `key={rid}` (`r.id ?? r.rack_index`)
  - Click handler for selection (single or Ctrl+multi)
  - Content: `{getRackDisplayId(r)} · {formatVolume(pct)}%` (see Section 5 for metrics).

### Rack properties available for filtering

From **`RackState`** (`frontend/src/types/warehouse.ts`) and **`getRackDisplayId`** (`warehouseUtils.ts`), each rack in the list has:

- **Display ID / label:** From `getRackDisplayId(r)` — uses `r.name` or `r.label` if set, else `(r.rowPrefix ?? r.aisle_letter) + (r.indexInRow ?? r.rack_index)` (e.g. "A1", "B2").
- **name**, **label** (optional strings).
- **rowPrefix**, **aisle_letter** (e.g. "A", "B").
- **rack_index**, **indexInRow** (numbers).
- **id** (optional number).
- **width_cm**, **length_cm**, **height_cm**.
- **templateId** (optional, links to custom template).
- **bins** (array; not ideal for quick search).

Best candidates for a **single search field**:

- **Display ID** — matches what the user sees in the list (e.g. "A1", "B3") and is derived from name/label or rowPrefix + index.
- **name / label** — if present, user may search by custom name.
- Optionally **rowPrefix** or **aisle_letter** (e.g. filter by "A").

### Recommended approach

1. **State:** Add local state in `RackSidebar.tsx`, e.g. `const [rackListSearch, setRackListSearch] = useState("")`.
2. **UI:** Render an `<input>` (search/filter) above the scrollable rack list (above the `layout.racks.map` block), e.g. below the "Lista regałów" header and above the "Pobierz Mapę..." / Export buttons (or above the list only if export moves — see Section 3).
3. **Filter:** Derive a filtered list:  
   `const filteredRacks = layout.racks.filter((r) => { const q = rackListSearch.trim().toLowerCase(); if (!q) return true; const displayId = getRackDisplayId(r).toLowerCase(); const name = (r.name ?? r.label ?? "").toLowerCase(); return displayId.includes(q) || name.includes(q) || (r.rowPrefix ?? r.aisle_letter ?? "").toLowerCase().includes(q); });`  
   Then map over `filteredRacks` instead of `layout.racks`.
4. **Accessibility:** Use a label (e.g. "Szukaj w liście regałów") and optionally `placeholder="np. A1, B…"`.

---

## SECTION 3 — Export button position and style

**Goal:** Move "Eksportuj" above the "Budynek" section and style it as a green action button.

### Where export is rendered

- **File:** **`frontend/src/components/warehouse/RackSidebar.tsx`**
- **Current structure (when `!showOnlyCatalog`):**
  1. Tabs (Katalog | Elementy wizualne)
  2. When `activeTab === "catalog"`:  
     - **Budynek** block (lines 137–157) — `onOpenEditBuilding`  
     - **Catalog** block (templates, Generuj układ, row tool)  
     - **Lista regałów** block (lines 329–430):  
       - **Inside this block:**  
         - "Pobierz Mapę Lokalizacji (CSV)" button (337–345)  
         - "Eksportuj ▾" dropdown (347–382) with PDF / CSV / JSON  
       - Rack list (`layout.racks.map`)  
       - Totals + "Zapisz układ"

So the **"Eksportuj"** dropdown and the **locations CSV** button are **inside** the "Lista regałów" collapsible section, below its header and above the rack list.

### How export works

- **Locations CSV:** `onExportLocationsMapCsv` — passed from `WarehouseDesigner.tsx` as `handleExportLocationsMapCsv`, which calls **`exportLocationsMapCsv(layout)`** from **`frontend/src/pages/WarehouseDesigner/DesignerExport.ts`**. Downloads a CSV of locations (e.g. locationUUID, name, capacity_dm3).
- **Eksportuj dropdown:** Opens a dropdown; options call `onExportPdf`, `onExportCsv`, `onExportJson` (also from DesignerExport). No logic depends on the button’s position in the DOM.

### Recommended approach

1. **Move export block above Budynek:** In `RackSidebar.tsx`, add a **new block** that renders **before** the Budynek block (e.g. right after the tab strip, still inside `(showOnlyCatalog || activeTab === "catalog")`). In that block:
   - **Primary export action:** One green-styled button that either:
     - Opens the same dropdown as now (PDF/CSV/JSON), or
     - Is the main "Eksportuj" action (e.g. PDF) with a dropdown for the rest.
   - Optionally include the locations CSV as a second button in the same block (e.g. "Pobierz lokalizacje" — see Section 4) or keep it in the list section.
2. **Styling:** Use green classes similar to "Generuj układ" (e.g. `bg-emerald-600 text-white hover:bg-emerald-500`) for the main export button so it reads as a primary action.
3. **Remove or keep in list:** Remove the duplicate Export dropdown and locations CSV button from **inside** the "Lista regałów" block so they exist only in the new top block; or keep a minimal link/button in the list for convenience (your choice).
4. **Dropdown:** Keep the same `exportOpen` state and dropdown content; only the trigger button’s position and style change.

---

## SECTION 4 — Rename "Pobierz Mapę Lokalizacji (CSV)"

**Goal:** Change label to **"Pobierz lokalizacje"**.

### Where the label is defined

- **File:** **`frontend/src/components/warehouse/RackSidebar.tsx`**
- **Line:** 344 — **hardcoded** string:  
  `Pobierz Mapę Lokalizacji (CSV)`
- **Context:** It is the text inside the button that calls `onExportLocationsMapCsv` (lines 337–345). The button is in the "Lista regałów" section.

### Recommended approach

1. **Option A (quick):** In `RackSidebar.tsx` line 344, replace the button text with **"Pobierz lokalizacje"**.
2. **Option B (consistent with other labels):** Add a key in **`frontend/src/constants/uiStrings.ts`**, e.g. under `warehouse.export`: `locationsCsv: "Pobierz lokalizacje"`, and in RackSidebar use `{UI_STRINGS.warehouse.export.locationsCsv}`. This keeps all export-related copy in one place.

---

## SECTION 5 — Rack list metrics (percentage → volume and dimensions)

**Goal:** In the rack list, remove the percentage and show rack volume and dimensions instead.

### Where rack list items are rendered

- **File:** **`frontend/src/components/warehouse/RackSidebar.tsx`**
- **Lines:** 384–414 — `layout.racks.map((r) => { ... })`.

### Current metrics (percentage)

- **Lines 390–392:**  
  `cap = r.total_capacity_dm3 ?? r.bins.reduce((s, b) => s + b.volume_dm3, 0)`  
  `used = r.used_dm3 ?? r.bins.reduce((s, b) => s + (b.current_load_dm3 ?? 0), 0)`  
  `pct = cap > 0 ? (used / cap) * 100 : 0`
- **Line 410:** Display: `{getRackDisplayId(r)} · {formatVolume(pct)}%`  
  So each item shows e.g. **"A1 · 30.00%"** (occupancy).

### Data available per rack

From **`RackState`** and usage in the same file:

- **Dimensions:** `r.width_cm`, `r.length_cm`, `r.height_cm` (numbers, cm).
- **Volume:** `r.total_capacity_dm3` or computed from bins: `r.bins.reduce((s, b) => s + b.volume_dm3, 0)` (same as `cap` above).
- **Display ID:** `getRackDisplayId(r)` (name/label or rowPrefix + indexInRow).

`formatVolume` in `warehouseUtils.ts` (line 527) returns `Number(v).toFixed(2)` — used today for the percentage number; it can be reused for volume (dm³).

### Recommended approach

1. **Remove percentage:** Stop computing and displaying `pct` and `formatVolume(pct)}%` in the rack list item (lines 391–392 and 410).
2. **Show dimensions and volume:** For each rack, display e.g.:
   - **Dimensions:** `{r.width_cm}×{r.length_cm}×{r.height_cm} cm` (or "W×D×H" if you add a short label).
   - **Volume:** `{formatVolume(cap)} dm³` (reuse existing `cap` for total capacity).
3. **Layout:** Either one line: `{getRackDisplayId(r)} — {width_cm}×{length_cm}×{height_cm} cm, {formatVolume(cap)} dm³`, or two lines (ID on first line, dimensions and volume on second) to avoid overflow in narrow sidebar.
4. **Optional:** Keep `used`/`cap` in scope if you later want to show occupancy elsewhere (e.g. tooltip); for the list itself, showing dimensions and volume is enough per the requirement.

---

## SECTION 6 — Building edit UI consistency (pencil icon)

**Goal:** Use the same pencil icon for the building edit control as for rack template editing.

### Where the buttons are rendered

- **File:** **`frontend/src/components/warehouse/RackSidebar.tsx`**
- **Building edit:** **Lines 141–144** — when `hasBuilding`, a **text button**:  
  `<button type="button" onClick={onOpenEditBuilding} className="text-xs text-cyan-600 hover:underline">Edytuj</button>`
- **Rack template edit:** **Lines 257–264** — icon button with **inline SVG pencil**:  
  `<button type="button" onClick={...} className="p-1 rounded hover:bg-slate-200 ..." title="Edytuj" aria-label="Edytuj">`  
  `<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>`  
  </button>

So the template uses a **pencil SVG** with `title="Edytuj"` and `aria-label="Edytuj"`; the building uses **text "Edytuj"** only.

### Recommended approach

1. **Replace building text with pencil icon:** In the Budynek block (lines 141–144), change the building edit control from a text button to an icon button that matches the template edit:
   - Use the **same SVG path** as the template edit button (line 263):  
     `d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"`
   - Same semantics: `title="Edytuj"`, `aria-label="Edytuj"`, and `onClick={onOpenEditBuilding}`.
2. **Styling:** Use the same pattern as template edit for consistency: e.g. `className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700"` and `className="w-3.5 h-3.5"` on the SVG, so it looks like the template pencil. Optionally keep `text-cyan-600` for the building icon if you want it to stay visually tied to the building section.
3. **Layout:** Place the icon button next to the building dimensions text (same flex container as now), so the row stays "W × D × H m [pencil icon]" instead of "W × D × H m Edytuj".

---

## Summary table

| Issue | Main file(s) | Current behavior | Recommended change |
|-------|--------------|------------------|---------------------|
| **1. Tab name "Katalog"** | `uiStrings.ts` (catalog), `RackSidebar.tsx` | Tab and section use `UI_STRINGS.warehouse.rackSidebar.catalog` = "Katalog". | Change `catalog` in uiStrings to e.g. "Layout i szablony"; optionally add `catalogSection` for collapsible header. |
| **2. Rack list search** | `RackSidebar.tsx` (329–414) | No search; `layout.racks.map` renders all. Rack has name, label, rowPrefix, aisle_letter, displayId. | Add `rackListSearch` state and filter by displayId/name/rowPrefix; render input above list, map over filtered array. |
| **3. Export position/style** | `RackSidebar.tsx` (337–382) | Export dropdown and locations CSV inside "Lista regałów". | Add new block above Budynek with green "Eksportuj" (and optionally locations); remove or keep duplicate in list. |
| **4. "Pobierz Mapę..." label** | `RackSidebar.tsx` (344) | Hardcoded "Pobierz Mapę Lokalizacji (CSV)". | Replace with "Pobierz lokalizacje" (inline or via uiStrings.export.locationsCsv). |
| **5. Rack list metrics** | `RackSidebar.tsx` (388–410) | Shows `getRackDisplayId(r) · formatVolume(pct)}%`. | Show dimensions (width_cm×length_cm×height_cm cm) and volume (cap dm³); remove percentage. |
| **6. Building edit icon** | `RackSidebar.tsx` (144 vs 261–264) | Building: text "Edytuj"; template: pencil SVG. | Replace building text button with same pencil SVG as template edit; keep title/aria-label. |
