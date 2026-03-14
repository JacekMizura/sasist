# Warehouse location naming redesign – analysis

**Goal:** Support flexible naming (automatic from pattern, custom patterns, manual names) while separating **structure fields** from **display name** (`loc_name`). No implementation; analysis only.

**Target:** A location model with explicit fields (e.g. `rack_name`, `row`, `column`, `level`, `position`, `slot`, `loc_name`) where `loc_name` is the display label only.

---

## 1. Current structural fields already available

### Bin (layout bin – warehouse_bins)

| Field | Type | Role |
|-------|------|------|
| **rack_id** | FK | Which rack this bin belongs to. |
| **label** | String | Display name (e.g. "A-1", "B-2", "A1-1-3"). Currently the only “name”; may be pattern-generated or manual. |
| **level_index** | Integer | Row/level (0-based). **Structural.** |
| **segment_index** | Integer | Column/slot within level (0-based). **Structural.** |
| barcode, volume_dm3, current_load_dm3, storage_type | – | Not naming. |

So **Bin** already has structural **level_index** and **segment_index**. It does **not** have explicit **rack_name**, **row**, **column**, or **slot** (display); those are derivable from Rack + template (e.g. bin NamingType) and segment_index.

### Rack (warehouse_layout_racks)

| Field | Type | Role |
|-------|------|------|
| **aisle_letter** | String | e.g. "A". Part of rack identifier. |
| **rack_index** | Integer | e.g. 1. With aisle_letter → "A1". **Structural.** |
| name | String | Optional display name. |

Rack gives **rack_name** as `f"{aisle_letter}{rack_index}"` (or rack.name when set).

### Location (operational locations table)

| Field | Type | Role |
|-------|------|------|
| **name** | String | Single display/identifier string. Used as **unique key** per warehouse (lookup, sync, import). **No separate structural fields.** |
| warehouse_id, type, width, depth, height, x, y, z, location_type, graph_node_id, pick_sequence | – | Not naming. |

So **Location** has only **name**. There are no **level**, **bin**, **rack_name**, **row**, **column**, or **position** columns. Structure is only implied by parsing `name` where code assumes a pattern.

### Summary

- **Structural today:** Bin: `level_index`, `segment_index`; Rack: `aisle_letter`, `rack_index`. Location: **none** (only `name`).
- **Display today:** Bin.`label`, Location.`name`; in APIs/records also `loc_name`, `location_name`, `location_code` (often same value).

---

## 2. Where `loc_name` is used as a structural field

“Structural” here means: the value is used for **ordering**, **lookup**, **uniqueness**, or **parsing** to derive other fields, not only for display.

| Place | Use | Why structural |
|-------|-----|----------------|
| **warehouse_layout_service._sync_locations_from_bins** | `Location.name == b.label`; create `Location(..., name=b.label)`. | **Unique key** per warehouse: locations are found/created by this name. Changing format can break sync and create duplicates or missing rows. |
| **warehouse_layout_service.get_location_label_records** | `if location_name in seen: continue`; `seen.add(location_name)`. | **Uniqueness** of label records (dedup by name). |
| **wave_service** | `_location_label_to_coords(label)` → (rack_num, level, pos) for **sorting** path and **distance**. | **Ordering and distance** depend on parsed structure. If format changes (e.g. "P01", "PICK-A-01"), parsing can fail or return None. |
| **labelData.applyFormatting (frontend)** | `parts = location_name_raw.split("-")`; uses parts[0], parts[1], parts[2] for rack, level, position and **rebuilds** `location_name`. | **Derives** rack/level/position from string; **output format** is fixed (R-L-P). |
| **product API** | `Location.name == location_address` (assign product to location by address string). | **Lookup** by name; format must match what UI/import sends. |
| **import_service** | `Location.name == loc_name`; `Location.name == label` (get_or_create by name). | **Lookup/create** by name; CSV column maps to Location.name. |
| **warehouse_map_service** | `Location.warehouse_id == warehouse_id, Location.name == name` (sync map bins to Location). | **Lookup** by name. |

So **loc_name / location name** is used structurally for:

1. **Uniqueness / key:** sync (Location.name = b.label), label records (seen set), import and product API (lookup by name).
2. **Ordering / distance:** wave_service path sort and distance (via parsing).
3. **Formatting / display:** applyFormatting parses to apply zero-pad and rebuild a single string.

---

## 3. Where location names are parsed (split, regex)

### Backend

| File | Function | Logic |
|------|----------|--------|
| **wave_service** | `_location_label_to_coords(location)` | If dict: uses `level`, `position`, `rack_name`/`rack_id`/`rack` when present (no parse). Else: `re.split(r"[-_\s]+", s)`; expects ≥3 parts → rack, level, pos (int); or 2 parts → rack, level, pos=0. **Assumption:** name encodes rack-level-position. |

### Frontend

| File | Function | Logic |
|------|----------|--------|
| **labelData.ts** | `applyFormatting(record, rules)` | `parts = location_name_raw.split("-")`; parts[0]=rack, parts[1]=level, parts[2]=position; uses `record.rack_name`/`record.level`/`record.position`/`record.bin` when present, else parsed values. **Assumption:** at least 2–3 segments separated by "-". |
| **RackLabelDownloadModal** | (building record from item) | `String(item.label).split("-")` for “first part” logic when building repeater record. **Assumption:** label has segments. |
| **ProductInWarehouseModal** | (display) | `name.trim().split("-")[0]` (first segment only). **Assumption:** first part is meaningful (e.g. rack). |

So parsing is concentrated in **wave_service** (path/distance) and **labelData.applyFormatting** (zero-pad and rebuild). Other uses are either lookup by full name or simple “first segment” display.

---

## 4. Where location names are generated

### Backend

| File | How |
|------|-----|
| **warehouse_layout_service** | `_bin_label(aisle, rack_index, level, segment)` → `"{aisle}{rack}-{level+1}-{segment+1}"`. Default bins and fallback when bin has no label. |
| **warehouse_layout_service** | `get_location_label_records`: `location_name = bin_data.get("label") or _bin_label(...)`. |
| **warehouse_layout_service** | `_sync_locations_from_bins`: `Location.name = b.label` (Bin.label from layout). |
| **rack_label_generator** | `loc_name = f"{rack}-{level}-{position}"` (numeric). |
| **rack_strip_generator** | `loc_name = f"{rack}-{level}-{pos}"`. |
| **warehouse_map_service** | `_location_name(aisle, rack_index, level_index, bin_index)` → `"{aisle}{rack}-{level+1}-{bin+1}"`. |
| **import_service** | `Location.name = loc_name` from CSV (user-provided or column value). |

### Frontend

| File | How |
|------|-----|
| **warehouseUtils.ts** | `createBinsForRack`: either `expandAddressPattern(...)` (e.g. `{Row}{Section}-{Bin}-{Level}`) or `expandNamingPattern(...)` (e.g. A-1-1-1). Sets `b.label`. |
| **generatePreviewDataset.ts** | `locationsPreview()`: `loc_name = \`${rack}-${level}-${position}\``. |
| **RackLabelDownloadModal** | Record from `item.label`. |
| **LabelPrintQueue** | `code` from layout location → loc_name, location_name. |
| **labelData.applyFormatting** | Rebuilds `location_name` from [rack_id, levelStr, positionStr].join("-"). |

So generation is either (1) **pattern-based** (_bin_label, expandAddressPattern, expandNamingPattern, _location_name) or (2) **manual** (Bin.label from editor, import CSV, or record from layout).

---

## 5. Services that depend on location naming format

| Service / area | Dependency | Breaks if |
|----------------|------------|-----------|
| **wave_service** | Parses label to (rack_num, level, pos) for path order and distance. Already supports **dict** with level, position, rack_name. | If only a string like "P01" or "PICK-A-01" is passed and no dict with structural fields, parse may return None → no order/distance. |
| **warehouse_layout_service** | Sync: Location.name = b.label; lookup by name. Label records: uniqueness by location_name. | If two bins get the same display name under a new scheme, sync/lookup can overwrite or dedup incorrectly. |
| **label_render_service** | Only resolves record keys (loc_name, location_name, location_code); normalizes to loc_name. **Does not parse.** | Safe: any string in loc_name works. |
| **label_engine** | Barcode fallback includes location_code. **Does not parse loc_name.** | Safe. |
| **rack_label_generator / rack_strip_generator** | Build loc_name from rack-level-position. | Only affect their own outputs; they assume numeric pattern. |
| **import_service** | Lookup/create Location by name from CSV. | If CSV uses new names (e.g. P01), works as long as name is unique. No format assumption. |
| **product API** | Assign product to location by `Location.name == location_address`. | Same: format-agnostic if UI sends exact name. |
| **analytics_service / slotting / picks / inventory_api** | Use Location.name for display or LIKE filter. | No structural assumption; any string works. |
| **Frontend applyFormatting** | Parses to apply zero-pad and rebuild R-L-P string. | Fails or misbehaves for names without "-" or with different structure (e.g. "P01"). |

So the only **hard** format dependency is: (1) **wave_service** when it receives only a string (parse required for order/distance), and (2) **applyFormatting** (assumes R-L-P segments). **Sync and uniqueness** depend on **name** being the stable key, not on its format, but if the same display name is reused (e.g. two different structural locations with same label), that would break uniqueness.

---

## 6. What would break if `loc_name` format changes

- **Wave path order and distance:** If locations are passed only as strings (e.g. "P01", "PICK-A-01") and code relies on `_location_label_to_coords`, parse fails → no sort key → path order and distance broken. **Mitigation:** Pass records/dicts with `level`, `position`, `rack_name` (wave_service already supports this).
- **applyFormatting (frontend):** Zero-pad and rebuild assume at least 2–3 "-" segments. Names like "P01" or "A1-01" (only 2 parts) get wrong or incomplete rebuild. **Mitigation:** Use explicit record.rack_name, record.level, record.position, record.bin when present; only parse as fallback for legacy data.
- **Uniqueness:** If the new scheme can produce the same `loc_name` for two different bins (e.g. different racks, same display label), then `get_location_label_records` (seen set) and sync (Location.name = b.label) can dedup incorrectly or create one Location for two bins. **Mitigation:** Ensure display name is unique per warehouse (or key by warehouse + structural fields instead of name).
- **Lookups:** Product API and import use `Location.name == ...`. As long as the value stored in Location.name is exactly what callers send, format does not matter. So **manual** or **custom** names are fine; only **generation** and **parsing** need to align with the new model.

---

## 7. Label system: does it parse `loc_name`?

- **Backend label_engine / label_render_service:** Resolve bindings from the record (e.g. `record["loc_name"]`, `record["{loc_name}"]`). **No parsing or splitting** of loc_name. So the label engine **can operate without parsing loc_name**; it only needs the right keys in the record.
- **Frontend renderLabel / svgRenderer:** Same: they use whatever is in the record for bindings. No parse of loc_name.
- **applyFormatting** is the only place that parses; it is a **pre-step** (formatting/zero-pad) before rendering. If records already carry explicit rack_name, level, position, bin, then applyFormatting can use those and **never parse** loc_name for new data.

So: **label engine does not rely on parsing loc_name.** It only needs a record with `loc_name` (and optionally rack_name, level, bin, etc.). Parsing is only in formatting and in wave_service.

---

## 8. Recommended location model for flexible naming

### Principles

- **loc_name** = display label only (any pattern or manual).
- **Structure** = explicit fields for algorithms and optional display (rack_name, row, column, level, position, slot).
- **Uniqueness** = per warehouse, by a stable key (today: Location.name; could stay name or become composite of structural fields where available).

### Recommended fields (logical)

| Field | Meaning | Source / note |
|-------|---------|----------------|
| **rack_name** | Rack identifier (e.g. "A1"). | From Rack (aisle_letter + rack_index) or template. |
| **row** | Optional; e.g. level as “row” in some schemes. | Can alias level or be separate (e.g. aisle row). |
| **column** | Optional; column/slot (e.g. A, B, C or 1, 2, 3). | From segment_index + template binNamingType. |
| **level** | Level/row index (1-based typical). | From Bin.level_index + 1. |
| **position** | Position/slot within level (1-based). | From Bin.segment_index + 1. |
| **slot** | Same as position or a combined slot id; optional. | Can be position or column display. |
| **loc_name** | Display label (pattern-generated or manual). | Bin.label or Location.name; never parsed for structure. |

So: **structure** = rack_name, level, position (and optionally row, column, slot); **display** = loc_name. Algorithms (wave, sorting, distance) use structure when present; label engine and UI use loc_name (and optionally other record fields) without parsing.

### Where to hold these

- **Bin:** Already has level_index, segment_index; keep **label** as display. Optionally add **display_label** and keep **label** for backward compat, or keep single label.
- **Location:** Today only **name**. Optionally add nullable **rack_name**, **level**, **position** (and **bin**/column if desired) so APIs and wave can use them without parsing name. **name** remains the human-facing and unique key.
- **Label records:** Already have rack_name, level, position in many paths. Add **bin** (column display) where missing. Always set **loc_name** = display value; never require parsing loc_name for structure.

### Naming modes

- **Automatic (pattern):** Template defines pattern (e.g. {Row}{Section}-{Bin}-{Level}); generator fills structure (level_index, segment_index, rack) and computes loc_name from pattern. Structure and loc_name both stored or passed.
- **Custom pattern:** Same as automatic but pattern is custom per layout/template; still output structure + loc_name.
- **Manual:** User sets loc_name only (e.g. P01, PICK-A-01). Structure (rack_name, level, position) can be null; algorithms that need order use pick_sequence or fall back to parse only when structural fields are missing.

---

## 9. Migration strategy (avoid breaking existing warehouses)

### Phase 1: Add structure to records and APIs (no DB change)

- **get_location_label_records** (and any builder of location label records): Always pass **rack_name**, **level**, **position** from Bin/Rack; add **bin** (column display) when template supports it. Keep **loc_name** = bin.label or _bin_label fallback. So label engine and templates get structure without parsing.
- **Wave / path order:** Ensure callers pass **dicts** with level, position, rack_name when available. wave_service already supports this; only ensure layout/API provide these fields so parsing is only fallback for legacy.
- **Frontend applyFormatting:** Prefer **record.rack_name**, **record.level**, **record.position**, **record.bin**; parse only when absent (legacy data). Do not assume "-" segments for new data.

Result: New layouts and new data use explicit structure; old data still works via parse fallback and existing Location.name.

### Phase 2: Optional structural columns on Location

- Add nullable **rack_name**, **level**, **position** (and optionally **bin**) to **locations** table. Backfill from existing name where possible (same parse as _location_label_to_coords / applyFormatting). New sync from layout can set these from Bin/Rack. Existing code that only uses Location.name keeps working.

### Phase 3: Uniqueness and sync

- Keep **Location.name** as the main key for sync and lookup (unique per warehouse). Ensure layout generation never assigns the same name to two different bins. If you later introduce composite key (warehouse_id + rack_name + level + position), do it behind an optional flag or new warehouses only so existing warehouses are unchanged.

### Phase 4: Custom and manual names

- Allow **manual** labels in layout (user types "P01"); then Bin.label = "P01", no pattern. Structure (level_index, segment_index) still exists for geometry; rack_name from parent Rack. For **custom patterns**, store pattern on template and generate loc_name from structure; structure is always filled from level_index/segment_index/rack, so algorithms never need to parse loc_name.

### Don’t do (to avoid breakage)

- Do **not** change the meaning of Location.name for existing rows (still display + key).
- Do **not** require a new format for existing warehouses; parsing fallback keeps wave and applyFormatting working.
- Do **not** remove or rename Bin.label or Location.name until all consumers use structural fields where needed.

---

## 10. Summary table

| Question | Answer |
|----------|--------|
| **Current structural fields** | Bin: level_index, segment_index, label. Rack: aisle_letter, rack_index. Location: name only (no level/bin/rack_name). |
| **Services that depend on parsing loc_name** | **wave_service** (path order, distance) when given only a string; **labelData.applyFormatting** (zero-pad, rebuild). |
| **What breaks if format changes** | Wave order/distance if no structural dict; applyFormatting for non-R-L-P names; uniqueness if two bins share same display name. |
| **Recommended model** | Structure: rack_name, level, position (and optionally row, column, slot). Display: loc_name. Store structure on Bin (already partial), optionally on Location; always in label records. |
| **Migration** | Add structure to label records and APIs; use structural fields in wave and applyFormatting when present; optional Location columns + backfill; keep name as key; support manual and custom names without requiring parse. |

---

*End of analysis. No code changes were made.*
