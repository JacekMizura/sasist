# Impact analysis: explicit bin (column) and level (row) for warehouse locations

**Goal:** Refactor so location naming uses explicit fields `rack_name`, `bin`, `level`, and `loc_name` (formatted display), instead of encoding everything in a single string that is parsed in multiple places.

**Example target:**
- `rack_name = "A1"`, `bin = "B"`, `level = 2`, `loc_name = "B-2"`

**Scope:** Trace where location names are generated, stored, parsed, displayed, exported, and used in algorithms. No implementation; analysis only.

---

## 1. Where `loc_name` / location name is constructed

### Backend

| Location | File | How |
|----------|------|-----|
| **Legacy label helper** | `warehouse_layout_service.py` | `_bin_label(aisle_letter, rack_index, level, segment)` → `f"{aisle_letter}{rack_index}-{level+1}-{segment+1}"` (e.g. `A1-1-1`). Used when bin has no `label` and when generating default bins. |
| **Location label records** | `warehouse_layout_service.py` | `get_location_label_records()`: `location_name = bin_data.get("label") or _bin_label(...)`. Record gets `loc_name`, `location_code`, `location_name`, `rack_id`, `rack_name`, `level` (1-based), `position` (1-based). No explicit `bin` (column letter). |
| **Sync Location from bins** | `warehouse_layout_service.py` | `_sync_locations_from_bins()`: `Location.name = b.label` (Bin.label from layout). |
| **Rack label generator** | `rack_label_generator.py` | `loc_name = f"{rack}-{level}-{position}"` (numeric style). |
| **Rack strip generator** | `rack_strip_generator.py` | `loc_name = f"{rack}-{level}-{pos}"`. |
| **Warehouse map service** | `warehouse_map_service.py` | `_location_name(aisle_letter, rack_index, level_index, bin_index)` → `f"{aisle_letter}{rack_index}-{level_index+1}-{bin_index+1}"`. Used when syncing map bins to Location. |
| **Import service** | `import_service.py` | `_get_or_create_location(..., name)`: `loc_name = (name or "").strip() or "Import"`; `Location(..., name=loc_name)`. Location name comes from CSV/user. |
| **Barcode generation** | `barcode_generation.py` | `location_barcode_for_bin`, `location_barcode_unique`: build barcode strings from rack_id + level_index + segment_index (no loc_name construction). |

### Frontend

| Location | File | How |
|----------|------|-----|
| **Bin creation** | `warehouseUtils.ts` | `createBinsForRack()`: either `expandAddressPattern(...)` (e.g. `{Row}{Section}-{Bin}-{Level}` → "A1-B-2") or `expandNamingPattern(...)` (e.g. `A-1-1-1`). Output is `b.label` (and `location_id`). No separate `bin`/`level` on the bin state today. |
| **Repeater preview** | `generatePreviewDataset.ts` | `locationsPreview()`: `loc_name = \`${rack}-${level}-${position}\`` (single string). |
| **Rack label modal** | `RackLabelDownloadModal.tsx` | Record built from `item.label` → `loc_name`, `location_name`, `location_code`. |
| **Print Queue** | `LabelPrintQueue.tsx` | `code` from layout locations → `loc_name`, `location_name`, `{loc_name}`. |
| **Label formatting** | `labelData.ts` | `applyFormatting()`: takes `record.location_name ?? record.location_code`, then **parses** it (see below); **reconstructs** `location_name` from `parts.join("-")` after zero-pad rules. |

---

## 2. Where `loc_name` / location name is parsed

### Frontend

| Location | File | Logic |
|----------|------|--------|
| **Label formatting** | `labelData.ts` | `applyFormatting(record, rules)`: `location_name = record.location_name ?? record.location_code ?? ""`; `parts = location_name.split("-")`. Assumes **canonical format** `A1-1-3`: `parts[0]` = rack, `parts[1]` = level, `parts[2]` = position. Uses `parts` for zero-pad (rack index, level, segment) and rebuilds `location_name = parts.join("-")`. So **level and bin/position are derived from the string**. |

### Backend

| Location | File | Logic |
|----------|------|--------|
| **Wave / path ordering** | `wave_service.py` | `_location_label_to_coords(label)`: `parts = re.split(r"[-_\s]+", s)`; requires `len(parts) >= 3`; `parts[0]` = rack string, `parts[1]` = level (int), `parts[2]` = position (int). Converts rack to numeric for sorting. Used to **sort locations by (rack_num, level, pos)** and to compute **distance** between two labels. So **all ordering and distance** for wave/path rely on this parse. **Fails** for formats like `B-2` (only 2 parts). |

---

## 3. Where level or bin are derived from location name

- **Frontend `labelData.applyFormatting`:** Level and segment (bin position) are taken from `parts[1]` and `parts[2]` after `split("-")`; they are used only to zero-pad and rebuild the same string. So they are derived from `loc_name` only for display formatting.
- **Backend `wave_service._location_label_to_coords`:** Level and position are parsed from the label and used for:
  - Sorting labels into a path order: `labels_with_coords.sort(key=lambda x: x[0])` where `x[0]` is `(rack_num, level, pos)`.
  - Distance: `_distance_between(c1, c2)` using `(rack_num, level, pos)`.
- **No other backend code** parses location name to get level/bin; elsewhere, level/position come from **Bin** (`level_index`, `segment_index`) or from the **label record** (`level`, `position` already provided).

---

## 4. Where location sorting happens

| Location | File | What is sorted |
|----------|------|----------------|
| **Layout bins** | `warehouse_layout_service.py` | Bins sorted by `(level_index, segment_index)` when building `bins_out` in `get_layout()` and when processing payload bins in `save_layout()`. |
| **Wave path order** | `wave_service.py` | Location **names** sorted by `_location_label_to_coords(name)` → `(rack_num, level, pos)`. So sorting is by **parsed** rack/level/position from the string. |
| **Picking by path** | `wave_service.py` | `select_stock_by_pick_sequence()` sorts candidates by `(pick_sequence, location_id)`; no direct sort by location name. |
| **Pick helpers** | `_pick_helpers.py` | Pick nodes sorted by `(pick_sequence, location_id)`. |

So the only **name-based** sorting is in **wave_service** (path order and distance), which depends on the three-part parse.

---

## 5. CSV / export and display

| Usage | File | Detail |
|-------|------|--------|
| **Export locations CSV** | `DesignerExport.ts` (frontend) | `exportLocationsMapCsv`: headers `["locationUUID", "name", "capacity_dm3"]`; `name = bin.label`. So exported "name" is the current single-string label. |
| **Import** | `import_service.py` | Location name from CSV column → `Location.name` (no parsing). |
| **Product API** | `product.py` | `Location.name.label("location_name")`; filter `Location.name == location_address`. |
| **Inventory API** | `inventory_api.py` | `location_name=location.name`. |
| **Picks API** | `picks.py` | `location_name=t.location.name`. |
| **Analytics / heatmap** | `analytics_service.py` | `location_name` from `Location.name`; filter `Location.name.ilike(...)`. |
| **Slotting** | `slotting_service.py` | `Location.name.label("location_name")`; `current_location` from that. |
| **Warehouse map sync** | `warehouse_map_service.py` | Creates/updates `Location` with `name = _location_name(...)`. |
| **Display (UI)** | Various (InventoryList, PickDensityPage, PickingAnalysis, LabelPrintQueue, etc.) | Show `location_name` or `location_code` or `loc_name` from API/record; no parsing. |

---

## 6. Database: Location and Bin schema

### Location (operational locations table)

- **Model:** `backend/models/location.py`
- **Columns:** `id`, `warehouse_id`, **`name`** (String), `type`, `width`, `depth`, `height`, `x`, `y`, `z`, `location_type`, `graph_node_id`, `pick_sequence`.
- **No `bin` or `level` (or `rack_name`) column.** The only “name” is the single string `name`.

So today:
- **Stored:** Single display name (`Location.name` = e.g. `A1-1-1` or `B-2`).
- **Not stored:** Explicit rack_name, bin (column), level (row) on Location.

### Bin (layout bins)

- **Model:** `backend/models/warehouse.py` (class `Bin`)
- **Columns:** `rack_id`, **`label`**, `barcode`, **`level_index`**, **`segment_index`**, `volume_dm3`, `current_load_dm3`, `storage_type`.
- So **Bin** already has **level_index** and **segment_index** (numeric). It does **not** have an explicit **bin** (e.g. column letter "A","B","C"); that would be derived from template (binNamingType) and segment_index when building a display label.

### Required migration if Location gets explicit fields

To store **bin** and **level** (and optionally **rack_name**) on **Location**:

- Add nullable columns to avoid breaking existing rows, e.g.:
  - `rack_name` (String, nullable)
  - `bin` (String, nullable)  — column identifier, e.g. "A", "B", "C" or "1", "2", "3"
  - `level` (Integer, nullable)  — 1-based row/level
- **Migration steps:** Add columns with default NULL; backfill from existing `name` where possible (using same parsing as `_location_label_to_coords` / split logic); then optionally make non-null for new rows. Existing code that only uses `Location.name` keeps working.

If you keep **only** `name` on Location and never add bin/level there, then:
- **Label records** and **Bin** already carry level_index/segment_index (and rack); you can add **bin** (display) and **level** (1-based) only to the **label record** and to the frontend bin state, without a Location migration.

---

## 7. Label system: record shape and dependency on parsing

### Current location label record (from `get_location_label_records`)

- Already has: `loc_name`, `location_code`, `location_name`, `loc_barcode`, `barcode_data`, `zone`, `rack_id`, **`rack_name`**, **`level`** (1-based), **`position`** (1-based), `level_num`, `zone_name`, and curly variants.
- **Does not have:** explicit **`bin`** (e.g. "A", "B", "C") as a separate field. Position is numeric.

So the record already has **rack_name**, **level**, **position**. What’s missing for “bin (column) and level (row)” is:
- **`bin`** as the column identifier (letter or number as used in the address pattern).

### Does label rendering parse `loc_name`?

- **No.** The label engine (backend `label_engine.py`, frontend `renderLabel` / `svgRenderer`) only **resolves bindings** from the record (e.g. `record["loc_name"]`, `record["{loc_name}"]`). It does **not** parse or split `loc_name`. So:
  - Adding **`bin`** and keeping **`loc_name`** as the formatted display value is enough for templates.
  - Rendering does **not** depend on parsing `loc_name`; only **applyFormatting** (frontend) and **wave_service** (backend) do.

---

## 8. Services that depend on location naming format

| Service / area | Dependency |
|----------------|------------|
| **warehouse_layout_service** | Builds `loc_name` from `bin.label` or `_bin_label(aisle, rack_index, level, segment)`. Syncs `Location.name = b.label`. Label records use level_index/segment_index for level/position. |
| **wave_service** | **Critical:** Parses location name with `_location_label_to_coords` (expects at least 3 parts, numeric level and position). Used for path order and distance. Format like `B-2` (2 parts) would break. |
| **label_render_service** | Only uses record keys; normalizes `location_name`/`location_code` → `loc_name`. No parse. |
| **rack_label_generator / rack_strip_generator** | Build `loc_name` as `rack-level-position` (numeric). |
| **warehouse_map_service** | Builds name with `_location_name(aisle, rack_index, level_index, bin_index)`. |
| **import_service** | Uses `Location.name` as provided (no fixed format). |
| **analytics_service / slotting / product / picks / inventory_api** | Use `Location.name` for display and filter; no parsing. |
| **Frontend labelData.applyFormatting** | Assumes `A1-1-3` style; parses and rebuilds for zero-pad. |
| **Frontend createBinsForRack / expandAddressPattern** | Can already produce "B-2" style when using address pattern; bin/level are implicit in the pattern, not stored as separate fields on the bin. |

---

## 9. Safe migration strategy

### Phase 1: Add explicit fields to **records** (no DB change)

- In **`get_location_label_records()`**: Compute **`bin`** (column display) from template/binNamingType and segment_index (or from bin.label if you parse it). Add **`bin`** and **`{bin}`** to each record. Keep **`loc_name`** as the formatted display (already from `bin.label` or _bin_label). Record already has **level**, **position**, **rack_name**.
- In **frontend** bin state / preview / label payloads: Add **bin** and **level** (and **rack_name** where missing) wherever you build location records, so designer preview and Print Queue see the same shape.
- **Label rendering:** No change; it only reads record keys. Templates can bind `{bin}`, `{level}`, `{rack_name}`, `{loc_name}`.

### Phase 2: Prefer explicit fields when building names

- Where you currently build a single string from rack+level+segment (e.g. `_bin_label`, `expandNamingPattern`), keep doing so for **backward compatibility** but ensure the **same** logic is used to set **loc_name** and the explicit **rack_name**, **bin**, **level** so they stay consistent.
- **applyFormatting (frontend):** Prefer `record.rack_name`, `record.level`, `record.bin` when present; fall back to parsing `location_name` only for old data or when those keys are missing.

### Phase 3: Wave service and path order

- **Option A:** Extend **`_location_label_to_coords`** to accept optional explicit (rack, level, bin/position). When building path order, if the API or record provides **rack_name**, **level**, **bin** (or position), pass those in and avoid parsing the label. Only parse when explicit fields are missing.
- **Option B:** Keep generating a **sort key** in a canonical form (e.g. rack_num, level, position) from either (1) explicit fields or (2) parsed label, so wave_service sorting and distance still work for both old (e.g. `A1-1-1`) and new (e.g. `B-2`) names.

### Phase 4 (optional): Location table

- Add **rack_name**, **bin**, **level** to **Location** via migration; backfill from `name` where possible; use them for filtering/sorting and for building label records when available. Keep **name** as the display string so existing code that uses `Location.name` continues to work.

### Risk reduction

- Do **not** change the **format of `Location.name`** or **Bin.label** for existing data; keep writing the same strings until all consumers can use explicit fields.
- Keep **loc_name** in all label records as the main display value; add **bin** and **level** (and **rack_name**) as extra keys so templates and algorithms can use either the string or the structured fields.

---

## 10. Summary

| Question | Answer |
|----------|--------|
| **Where is loc_name constructed?** | Backend: `_bin_label`, `get_location_label_records`, rack_label_generator, rack_strip_generator, warehouse_map_service, import. Frontend: `createBinsForRack`, `generatePreviewDataset`, RackLabelDownloadModal, LabelPrintQueue, and `applyFormatting` (rebuilds after parse). |
| **Where is loc_name parsed?** | Frontend: `labelData.applyFormatting` (split "-", parts[0]=rack, parts[1]=level, parts[2]=position). Backend: `wave_service._location_label_to_coords` (same idea; used for path order and distance). |
| **Services depending on naming format?** | Strongest: **wave_service** (parsing and sorting). Others use name as opaque string or already use level/position from Bin/record. |
| **Database changes?** | **Location** has no `bin` or `level`; only `name`. Optional migration: add nullable `rack_name`, `bin`, `level` and backfill. **Bin** already has `level_index`, `segment_index` (no `bin` display field). |
| **Label rendering parse loc_name?** | No. Rendering only uses record keys. Add **bin** (and keep **level**, **rack_name**) to the record so templates can use explicit fields; **loc_name** remains the display value. |

**Recommended order:** (1) Add **bin** (and ensure **level**, **rack_name**) to label records and frontend record builders; (2) Update **applyFormatting** to prefer explicit fields; (3) Update **wave_service** to use explicit rack/level/position when available and fall back to parse; (4) Optionally add columns to Location and backfill.

---

*End of impact analysis. No code changes were made.*
