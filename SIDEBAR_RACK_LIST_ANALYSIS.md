# Sidebar rack list — UX analysis (no code changes)

Analysis of two improvements: vertical rack item layout and showing the rack list only in the first tab. **No code was changed.**

---

## SECTION 1 — Rack list rendering

**Goal:** Change each rack list item from a single line to a vertical layout: Nazwa regału, then Wymiary, then Objętość (e.g. A1-01 / 600×1200×2000 cm / 12000 dm³).

### Where rack list items are rendered

- **File:** **`frontend/src/components/warehouse/RackSidebar.tsx`**
- **Section:** “Lista regałów” block: the collapsible area with header “Lista regałów”, search input, then the list of racks.
- **Exact location:** **Lines 416–447** — `filteredRacks.map((r) => { ... })` inside a scrollable `<div className="flex-1 overflow-y-auto space-y-1 ...">`.

**Data source:** `filteredRacks` is derived from `layout.racks` filtered by `rackSearch` (lines 114–121). Filtering uses `getRackDisplayId(r)`, `r.name`, `r.label`, `r.rowPrefix`.

### Fields used for display

- **Name / label:** **`getRackDisplayId(r)`** — used as the main label (line 439). It comes from **warehouseUtils**: prefers `r.name` or `r.label` if set, otherwise `(r.rowPrefix ?? r.aisle_letter) + (r.indexInRow ?? r.rack_index)` (e.g. "A1", "B2"). So the “Nazwa regału” in the new layout should stay **`getRackDisplayId(r)`** (optionally with a label like “Nazwa regału” above it in the vertical layout).
- **Dimensions:** **`r.width_cm`**, **`r.length_cm`** (with fallback **`r.depth_cm`**), **`r.height_cm`** (lines 422–424). Currently shown as a single string: **`w×len×h cm`** (e.g. `600×1200×2000 cm`). So “Wymiary” = **`${r.width_cm ?? 0}×${r.length_cm ?? r.depth_cm ?? 0}×${r.height_cm ?? 0} cm`**.
- **Volume:** **`cap`** (line 425) = **`r.total_capacity_dm3 ?? r.bins.reduce((s, b) => s + (b.volume_dm3 ?? 0), 0)`**. Displayed as **`cap.toLocaleString()} dm³`** (line 443). So “Objętość” = the same `cap` value and unit **dm³**.

### Current structure (single line)

Each rack is a single **`<button>`** (lines 426–444) with one line of content:

- `<span className="font-medium">{getRackDisplayId(r)}</span>`
- `" · "`
- `<span className="text-slate-600">{w}×{len}×{h} cm</span>`
- `" · "`
- `<span className="text-slate-600">{cap.toLocaleString()} dm³</span>`

So today: **A1-01 · 600×1200×2000 cm · 12000 dm³** all on one line.

### Where to modify layout

- **In the same file**, inside the **`filteredRacks.map`** callback (lines 418–446).
- **Change:** Keep the same `<button>` (and the same `key`, `onClick`, `className`) but replace the **children** of the button with a **vertical (stacked) layout**:
  1. **Line 1 — Nazwa regału:** e.g. `<div className="font-medium text-[#1E293B]">` or a small “Nazwa” label + `{getRackDisplayId(r)}`.
  2. **Line 2 — Wymiary:** e.g. `<div className="text-[10px] or text-[11px] text-slate-600">` with `{w}×{len}×{h} cm` (order W×D×H if you want to match your example; currently w = width_cm, len = length_cm/depth_cm, h = height_cm).
  3. **Line 3 — Objętość:** e.g. `<div className="text-[10px] or text-[11px] text-slate-600">` with `{cap.toLocaleString()} dm³`.

Use block elements (`<div>`) or a flex column so the three parts stack. You can add a class like `flex flex-col items-start gap-0.5 text-left` on the button and keep `text-left` and `px-3 py-2` for spacing. No new data or props are required; only the JSX structure inside the button changes.

---

## SECTION 2 — Sidebar tab logic (rack list only in first tab)

**Goal:** Show “Lista regałów” only when the first tab (Katalog / Layout i szablony) is active; hide it when “Elementy wizualne” is selected.

### Where tab state is stored

- **File:** **`frontend/src/components/warehouse/RackSidebar.tsx`**
- **State:** **`const [activeTab, setActiveTab] = useState<"catalog" | "visuals">("catalog");`** (line 105).
- **UI:** Two tab buttons (lines 131–134 when `!showOnlyCatalog`): one sets `setActiveTab("catalog")`, the other `setActiveTab("visuals")`. Labels come from **`UI_STRINGS.warehouse.rackSidebar.catalog`** and **`UI_STRINGS.warehouse.rackSidebar.visualElements`**.

**`WarehouseDesigner.tsx`** does not hold the tab state; it lives entirely inside **RackSidebar**.

### How content is split by tab

- **First tab (catalog):** Content is wrapped in **`(showOnlyCatalog || activeTab === "catalog") && ( <> ... </> )`** (lines 148–373). That block includes: Budynek, catalog section (templates, “Generuj układ”, row tool, etc.). It does **not** include the rack list.
- **Second tab (visuals):** **`!showOnlyCatalog && activeTab === "visuals" && ( ... )`** (lines 374–394). Only the “Elementy wizualne” panel (drag items: column, mezzanine, etc.).
- **Rack list block:** **`!showOnlyCatalog && ( <div> Lista regałów ... </div> )`** (lines 393–464). This block is a **sibling** of the two tab content blocks. The condition is only **`!showOnlyCatalog`**, so whenever we are in the layout view (tabs visible), the rack list is shown **regardless of activeTab**. So the rack list appears in both “Katalog” and “Elementy wizualne”.

### How to hide rack list in “Elementy wizualne”

- **Change the condition** that wraps the “Lista regałów” block so it also requires the first tab to be active.
- **Current:** `{!showOnlyCatalog && (` at line 393.
- **Target:** Show the rack list only when we’re in layout view **and** the catalog tab is selected. So use:
  - **`{!showOnlyCatalog && activeTab === "catalog" && (`**
  for the same `<div>` that starts at line 393 (the one containing the “Lista regałów” header, search, `filteredRacks.map`, totals, and “Zapisz układ” button).
- **Result:** When the user switches to “Elementy wizualne”, `activeTab === "visuals"`, so the rack list block is not rendered. When they switch back to the first tab, `activeTab === "catalog"` and the rack list appears again. When **`showOnlyCatalog`** is true (e.g. Magazyn view), tabs are hidden and the rack list is already not shown by `!showOnlyCatalog`, so behavior stays correct.

No new state or props are needed; only this one condition in **RackSidebar.tsx** needs to be updated.

---

## Summary

| Issue | Location | Current | Change |
|-------|----------|---------|--------|
| **1. Rack item layout** | RackSidebar.tsx, inside `filteredRacks.map` (button content, lines 438–443) | Single line: `getRackDisplayId(r) · w×len×h cm · cap dm³`. | Replace with 2–3 stacked lines (block/flex column): (1) Nazwa regału = getRackDisplayId(r), (2) Wymiary = w×len×h cm, (3) Objętość = cap dm³. Same data (width_cm, length_cm/depth_cm, height_cm, total_capacity_dm3 / bins). |
| **2. Rack list only in first tab** | RackSidebar.tsx, condition around “Lista regałów” block (line 393) | `!showOnlyCatalog &&` → list visible in both tabs. | Use `!showOnlyCatalog && activeTab === "catalog" &&` so the rack list block renders only when the first tab is active. |
