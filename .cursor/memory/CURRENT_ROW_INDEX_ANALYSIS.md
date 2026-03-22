# "Aktualny rząd" (Current Row Index) – Analysis

**Goal:** Understand where the row index is stored, how it is used during rack/row creation, and how to move selection so the row index is chosen only when a new row or rack is created.

---

## 1. Where "Aktualny rząd" is defined

### UI

- **Label:** `"Aktualny rząd"` comes from `UI_STRINGS.warehouse.rackSidebar.currentRow` in `frontend/src/constants/uiStrings.ts` (value: `"Aktualny rząd"`).
- **Component:** Rendered in **`frontend/src/components/warehouse/RackSidebar.tsx`** (lines ~198–217):
  - A `<label>` with that text.
  - An `<input>` bound to `currentRowPrefix` with `value={currentRowPrefix}` and `onChange={(e) => setCurrentRowPrefix(e.target.value)}`.
  - An optional "Re-index" button that calls `onReindexRow(selectedRackId ?? null, (currentRowPrefix || "A").trim() || "A")`.
- **Visibility:** This block is only shown when `!showOnlyCatalog` (i.e. in the Layout designer tab; in Magazyn tab the sidebar can show only catalog and then this block is hidden).

### State

- **State is stored in:** **`frontend/src/pages/WarehouseDesigner/useDesignerRowState.ts`**
  - `const [currentRowPrefix, setCurrentRowPrefix] = useState("A");`
  - Returned from `useDesignerRowState()` along with other row/canvas state.
- **Consumer:** **`WarehouseDesigner.tsx`** (main designer page):
  - Calls `useDesignerRowState()` and gets `currentRowPrefix` and `setCurrentRowPrefix`.
  - Passes them into **`RackSidebar`** as `currentRowPrefix` and `setCurrentRowPrefix` (for both Magazyn and Layout views that render the sidebar).
  - Passes `currentRowPrefix` into **`useDesignerRackPlacement`** and **`useDesignerRowOperations`** (no setter passed there; those hooks only read it).

**Summary:** The "current row" is the **row prefix** (e.g. "A", "B") used as the letter part of rack labels (A1, A2, B1, …). It is stored as `currentRowPrefix` in `useDesignerRowState`, displayed and edited in `RackSidebar`, and read by rack/row placement logic.

---

## 2. How rows are created and how row index is assigned

### Where rows are created

| Action | File / hook | Function / flow | Row prefix source |
|--------|-------------|------------------|-------------------|
| **Draw empty row** | `useDesignerRowOperations.ts` | `placeEmptyRow` | `(currentRowPrefix \|\| "A").trim() \|\| "A"` |
| **Draw row with template** | `useDesignerRowOperations.ts` | `placeRowWithTemplate` | Same `currentRowPrefix` |
| **Place rack from catalog (empty canvas)** | `useDesignerRackPlacement.ts` | `stampRackFromCatalogItem` | Snap: `snap.rowPrefix`; else `currentRowPrefix` |
| **Place rack from catalog (into empty slot)** | `useDesignerRackPlacement.ts` | `stampRackIntoSlot` | Row’s `row.rowPrefix ?? currentRowPrefix` |
| **Place rack (stamp at cell, no row)** | `useDesignerRackPlacement.ts` | `stampRackAt` | **Template’s `template.aisle_letter`** (not currentRowPrefix) |
| **Auto layout** | `layoutGenerator.ts` + `GenerateWarehouseLayoutModal` | `generateWarehouseLayout` | Modal’s **`startRowPrefix`** (local state in modal, not `currentRowPrefix`) |

### Row index assignment

- **Row “index”** in the UI is the **row prefix** (letter like A, B). The **rack index within row** is 1, 2, 3… and is computed by:
  - **`getNextIndexInRow(racks, rowPrefix)`** in `warehouseUtils.ts`: among racks with that `rowPrefix`, takes the max `indexInRow` and adds 1 (or 1 if none).
- When creating a **new row** (empty or with template), the row’s **label** is set once from `currentRowPrefix`; all racks in that row get `rowPrefix` set to that value and `indexInRow` 1, 2, 3….
- When placing a **single rack** on empty canvas (no snap to existing row), `stampRackFromCatalogItem` uses `currentRowPrefix` for that rack (and no `RowContainer` is created unless you draw a row).
- **Layout generator** does not use `currentRowPrefix`; it uses its own `startRowPrefix` and `nextRowLetter(startRowPrefix, rowIndex)` to assign A, B, C… to each generated row.

### Row containers and IDs

- **`RowContainer`** (`types/warehouse.ts`): `{ id: string; rowPrefix?: string; orientation?: "horizontal" | "vertical"; slots: EmptyRowSlot[] }`.
- **IDs:** Row containers get a **client-generated id** when the row is created:
  - `placeEmptyRow` / `placeRowWithTemplate`: `id = \`row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}\``.
  - Layout generator: `id: \`row-gen-${r}-${Date.now()}\`` (or similar).
- These IDs are **not** stored in the backend as separate entities; they are part of the **`row_containers`** JSON blob (see below). So rows have **persistent IDs only in the sense that** the same layout JSON is saved/loaded; the id is a string that persists with the layout.

---

## 3. Backend row handling

### Persistence

- **Rack:** Backend stores per-rack fields; **row prefix** is sent as `row_prefix` (snake_case) in the layout payload and is stored on the **Rack** model only if the schema includes it. In `warehouse_layout_service` the payload is applied to rack data; the frontend sends `row_prefix: r.rowPrefix`. The **backend Rack model** (in `backend/models/warehouse.py`) does **not** expose a dedicated `row_prefix` column in the grep results; the layout is typically stored as a JSON-like structure or the frontend sends it and it may be stored in a generic way. So **rack-level** row prefix is round-tripped in the layout payload; **row containers** are persisted as JSON.
- **Row containers:** Backend stores them as a single JSON column:
  - **Model:** `WarehouseLayout.row_containers_json` (Text) in `backend/models/warehouse.py`.
  - **Service:** `warehouse_layout_service.get_layout` returns `row_containers` from `row_containers_json`; `save_layout` writes `data.get("row_containers")` into `row_containers_json`.
- **Schemas:** `WarehouseLayoutPayload` in `backend/schemas/warehouse_layout.py` has `row_containers: Optional[List[Any]]` with comment: `[{ id, rowPrefix?, slots: [{ x,y,w,h, rackId? }] }]`.

So: **row index (prefix)** is persisted **on each rack** (as sent by frontend) and **on each row container** in the `row_containers` JSON. There is no separate backend “row” entity; rows are defined by `RowContainer` objects and by racks that share the same `rowPrefix`.

---

## 4. UI dependencies on current row

### Catalog UI

- The **catalog** (list of templates, drag-and-drop) does **not** render the current row selector. The **current row** block is a **sibling** of the catalog in the sidebar: same tab (“Katalog”) but a separate section above the template list.
- **Dependencies:**
  - When user **drags a rack from catalog** and drops on the canvas, `stampRackFromCatalogItem` (in `useDesignerRackPlacement`) uses `currentRowPrefix` **only if** the drop is not on an existing row (no snap). So the catalog drop **depends on** the current value of `currentRowPrefix` for the new rack’s label.
  - When user **draws a row** (empty or with template), `placeEmptyRow` / `placeRowWithTemplate` use `currentRowPrefix` for the new row’s prefix.
- There is **no** `selectedRow` or `rowSelector` in the sense of a separate “current row” entity; the only thing is **`currentRowPrefix`** (string) and optionally **`selectedRowContainerId`** (which row container is selected for move/delete/fill). The **Re-index** button uses the **selected rack** (`selectedRackId`) or the current **prefix** to reindex.

### Where UI for row selection lives

- **Single place:** **`RackSidebar.tsx`** (lines ~196–217): the “Aktualny rząd” label, the text input for `currentRowPrefix`, and the “Re-index” button. This is the only UI that sets/edits the current row **prefix** for creation. There is no separate modal or popup for choosing the row when creating something.

---

## 5. Trigger points (when a row is first “created”)

Conceptually a “row” can appear in two ways: (1) as a **RowContainer** (slots), or (2) as a **geometric row** of racks (same Y or same X) without a RowContainer. The **prefix** is needed when:

1. **Placing first rack on empty canvas (no row, no snap)**  
   - **Trigger:** Drop from catalog onto empty canvas; `findSnapToRowPosition` returns null.  
   - **Where:** `useDesignerRackPlacement.stampRackFromCatalogItem`.  
   - **Uses:** `currentRowPrefix` (and `getNextIndexInRow` for index in row).

2. **Drawing an empty row**  
   - **Trigger:** User finishes drag for “Draw Row” (no template); mouse up calls `placeEmptyRow(rowDrawStart, rowDrawEnd)`.  
   - **Where:** `useDesignerRowOperations.placeEmptyRow`.  
   - **Uses:** `currentRowPrefix` for the new `RowContainer.rowPrefix`.

3. **Drawing a row with template**  
   - **Trigger:** User finishes drag with a template selected; `placeRowWithTemplate(start, end, item)`.  
   - **Where:** `useDesignerRowOperations.placeRowWithTemplate`.  
   - **Uses:** `currentRowPrefix` for the new row and all racks in it.

4. **Placing a rack into an empty slot**  
   - **Trigger:** Drop from catalog onto an empty slot of an existing row.  
   - **Where:** `stampRackIntoSlot` (and `stampRackFromCatalogItem` when it finds an empty slot).  
   - **Uses:** `row.rowPrefix ?? currentRowPrefix` (row already has a prefix; no new row created).

5. **Auto layout**  
   - **Trigger:** User confirms in Generate Layout modal.  
   - **Where:** `GenerateWarehouseLayoutModal` → `generateWarehouseLayout(config)` with `config.startRowPrefix` from the modal’s **“Prefiks pierwszego rzędu”** input.  
   - **Does not use** `currentRowPrefix`; it has its own `startRowPrefix`.

So the **exact moments** when a **new** row (or a new “logical row” of racks) is created and the prefix is read are:

- **A:** Before **placeEmptyRow** runs (draw empty row).
- **B:** Before **placeRowWithTemplate** runs (draw row with template).
- **C:** Before **stampRackFromCatalogItem** runs when there is **no** snap and **no** empty slot (first rack or new rack on empty canvas).

For **C**, the “row” is not a RowContainer yet; it’s just the first rack with that prefix. So if you want “row index is selected only when a new row or rack is created”, the triggers are **A**, **B**, and **C** (and optionally when adding a rack to an existing row, you could keep using that row’s prefix without asking).

---

## 6. Output summary and where to trigger a popup

### 1. Where the "Aktualny rząd" state is stored

- **State:** `currentRowPrefix` (and `setCurrentRowPrefix`) in **`useDesignerRowState.ts`** (default `"A"`).
- **Lifted and passed by:** **`WarehouseDesigner.tsx`** into RackSidebar and into `useDesignerRackPlacement` / `useDesignerRowOperations`.

### 2. Where rows are created

- **Empty row:** `useDesignerRowOperations.placeEmptyRow` (mouse up after drawing row with row tool, no template).
- **Row with template:** `useDesignerRowOperations.placeRowWithTemplate` (mouse up after drawing with template).
- **First rack on empty canvas (no row container):** `useDesignerRackPlacement.stampRackFromCatalogItem` when there is no empty slot and no snap (or when there is snap, snap’s rowPrefix is used).
- **Auto layout:** `layoutGenerator.generateWarehouseLayout` (prefix from modal’s `startRowPrefix`).

### 3. Whether rows have persistent IDs

- **RowContainer:** Has a string **`id`** generated at creation (`row-${Date.now()}-${random}` or `row-gen-...`). This is persisted inside **`layout.row_containers`**, which is saved as **`row_containers_json`** in the backend. So IDs persist with the layout; they are not database row IDs.

### 4. Where UI for row selection currently lives

- **Only in:** **`RackSidebar.tsx`**, in the catalog tab: the “Aktualny rząd” label, text input, and “Re-index” button. There is no other row selector or popup; the user is expected to change the prefix in that input before creating rows/racks.

### 5. Best place to trigger a popup when a new row/rack is created

To move behavior so that **row index is selected only when a new row or rack is created**, trigger a **row prefix selection popup** at these points:

1. **When about to create a new empty row**  
   - In **`useDesignerRowOperations.placeEmptyRow`**, **before** building `rowPrefix` and calling `setLayout`.  
   - Either: open a small modal/popover asking for the row letter (defaulting to `currentRowPrefix` or next letter), then pass that into the same function; or: call a callback like `onRequestRowPrefixForNewRow(() => placeEmptyRow(...))` that the parent resolves with a prefix (e.g. from a popup).

2. **When about to create a new row with template**  
   - Same idea in **`useDesignerRowOperations.placeRowWithTemplate`** before using `currentRowPrefix`.

3. **When about to place a rack on empty canvas (no slot, no snap)**  
   - In **`useDesignerRackPlacement.stampRackFromCatalogItem`**, when `!emptySlot && (!snap || you still want to ask)`: before creating the new rack, prompt for prefix (or use a callback), then create the rack with that prefix.

**Implementation options:**

- **Option A – Callback from parent:** Add something like `onBeforeCreateRowOrRack: () => Promise<string>` (or sync) that shows a modal and returns the chosen prefix. Call it in `placeEmptyRow`, `placeRowWithTemplate`, and in the drop path that calls `stampRackFromCatalogItem` when creating a new rack without a row. Then you can **remove or hide** the “Aktualny rząd” input from the sidebar and only show the popup at these creation moments.
- **Option B – Local state in hooks:** Keep `currentRowPrefix` as default/suggestion but open a small **inline popover or modal** at the drop/draw position (or in the sidebar) that appears only when the action would create a new row or first rack, and use the value from that popup for that single action.

**Suggested trigger points (concrete):**

- **`placeEmptyRow`** (in `useDesignerRowOperations.ts`): right before `const rowPrefix = (currentRowPrefix || "A").trim() || "A";` (or at the start of the function), call the “get row prefix for new row” flow (popup or callback), then use the returned value.
- **`placeRowWithTemplate`**: same, before `const rowPrefix = (currentRowPrefix || "A").trim() || "A";`.
- **Catalog drop that creates a new rack (no slot, no snap):** in the flow that leads to `stampRackFromCatalogItem` (e.g. in the mouse-up handler in `usePlacementInteraction` or wherever the drop is handled), when you detect that the drop will go to `stampRackFromCatalogItem` and there is no empty slot and no snap, show the popup first, then call `stampRackFromCatalogItem` with the chosen prefix (you may need to pass prefix into `stampRackFromCatalogItem` for that call path).

After that, you can remove or repurpose the “Aktualny rząd” input in **RackSidebar** so it’s no longer the primary way to set the row index; the popup at creation time becomes the only (or main) place where the row index is selected.
