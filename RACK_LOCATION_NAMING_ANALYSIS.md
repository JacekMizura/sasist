# Rack location naming – pipeline analysis

**Problem:** Rack template editor config (Row ID: A, Bin Naming: Alpha, Address Pattern: `{Row}{Section}{Bin}{Level}`) is not respected. Generated locations appear as `A1-1-1`, `A1-1-2`, … (legacy `rack-level-position`) instead of the configured pattern and bin naming.

**Scope:** Trace from rack template editor → storage → location generation. No code changes; analysis only.

---

## 1. Where `binNaming` and `addressPattern` are stored

### Frontend (form)

- **TemplateCreator.tsx** (rack template editor):
  - State: `addressPattern`, `rowId`, `sectionStartIndex`, `binNamingType` (e.g. `"numeric"` | `"alpha"`).
  - On save it builds a payload with:
    - `addressPattern`, `rowId`, `sectionStartIndex`, `binNamingType`
    - and **also** `naming_pattern: \`${rowIdVal}-{R}-{L}-{B}\`` (legacy pattern), which is redundant when using the new pattern.
  - Submit goes to `onSave(payload)` / `onSaveEdit(..., payload)` (parent provides API call).

### Backend (database)

- **Table:** `warehouse_templates` (model **WarehouseTemplate** in `backend/models/warehouse_template.py`).
- **Columns:**
  - `row_id` (String)
  - `section_start_index` (Integer, default 1)
  - `address_pattern` (String, nullable)
  - `bin_naming_type` (String, default `"numeric"`)
  - Plus: `naming_pattern`, `aisle_letter`, dimensions, levels, etc.
- **Service:** `backend/services/warehouse_template_service.py` maps payload to model:
  - `rowId` → `row_id`, `sectionStartIndex` → `section_start_index`, `addressPattern` → `address_pattern`, `binNamingType` → `bin_naming_type`.
- So **yes:** `binNaming` and `addressPattern` are saved in the DB (template table).

### Layout payload (when saving the warehouse layout)

- Saving the **layout** does **not** send template fields to the layout API.
- Payload is `racks` + `row_containers` + …; each rack has `bins` (array of `{ label, level_index, segment_index, … }`).
- So the **only** naming information that reaches the layout save is the **per-bin `label`** already computed on the frontend. Template `addressPattern` / `binNamingType` are not sent again with the layout; they only affect how the frontend computes those `label` values when it creates/updates bins.

---

## 2. Where location names are generated

### Frontend (bin labels)

- **Single place that assigns human‑readable location names:** `createBinsForRack()` in **`frontend/src/components/warehouse/warehouseUtils.ts`**.
- Logic:
  - If **all** of `addressPattern`, `rowId`, `sectionStartIndex`, `binNamingType` are provided → use **address pattern**:
    - `useAddressPattern = true`
    - Label = `expandAddressPattern(addrPattern, row, sectionStart, binType, lev+1, seg+1)` (supports `{Row}`, `{Section}`, `{Bin}`, `{Level}`; Bin = alpha A,B,C or numeric per `binNamingType`).
  - Else → use **legacy naming pattern**:
    - Pattern = `namingPattern?.trim() || \`${aisleLetter}-{R}-{L}-{B}\``
    - Label = `expandNamingPattern(pattern, rackIndex, lev+1, seg+1, aisleLetter)` (e.g. `A1-1-1` style).
- So **whoever calls** `createBinsForRack` **decides** whether the template’s `addressPattern` + `binNamingType` are used by passing those args (or not).

### Backend (persistence and label records)

- **When saving layout** (`warehouse_layout_service.py` – `save_layout` / sync):
  - For each rack, bins come from payload `r_data.get("bins")`.
  - Each bin: `label = bin_data.get("label") or _bin_label(aisle_letter, rack_index, level_index, segment_index)`.
  - So the backend **does** persist the frontend’s `label` when provided; it only falls back to `_bin_label` when `label` is missing.
- **When no bins in payload** (backend generates default bins):
  - It uses **only** `_bin_label(aisle_letter, rack_index, lev, seg)` → `f"{aisle_letter}{rack_index}-{level+1}-{segment+1}"` (e.g. `A1-1-1`). It does **not** read any template or row config (no `address_pattern`, no `bin_naming_type`).
- **When building “location label records”** (e.g. for PDF or APIs):
  - `get_location_label_records()` in `warehouse_layout_service.py`:
    - Iterates over `layout_data["racks"]` and each rack’s `bins`.
    - For each bin it sets **`location_code` (and thus `loc_name`, etc.)** to:
      - **`_bin_label(aisle, r_idx, lev, seg)`** (hardcoded legacy formula).
    - It **does not** use `bin_data.get("label")` for the location name, even though the stored bin has a `label` and `get_layout()` returns it. So for any consumer that uses `get_location_label_records()` (e.g. location labels PDF), the displayed “location name” is always the legacy format, regardless of what is stored in the DB.
- **Location table (operational locations):**
  - `_sync_locations_from_bins()` creates/updates `Location` rows with `name=b.label`.
  - So the **locations** table does get the **stored** bin label (the one saved from the frontend). If the frontend sent wrong labels, those wrong names are in the Location table; if the frontend sent correct labels, the Location table has correct names. The only place that **overwrites** the concept of “location name” for downstream features is `get_location_label_records()`, which recomputes it with `_bin_label`.

---

## 3. Why the naming settings are ignored

### Cause 1: Frontend – bin creation often does not use template’s pattern

When racks/bins are **created** in the designer, `createBinsForRack` is called from several places. In most of them the **template’s** `addressPattern` and `sectionStartIndex` are **not** passed; a **hardcoded** pattern or the legacy path is used instead.

| Call site | File | addressPattern / naming | sectionStartIndex | Result |
|-----------|------|-------------------------|-------------------|--------|
| Single “add rack” (free placement) | useDesignerRackPlacement.ts | `undefined`, `undefined` | – | Legacy: `namingPattern` default → e.g. `A-1-1-1` / `A1-1-1` style |
| Stamp rack into row slot | useDesignerRackPlacement.ts | **ROW_LABEL_ADDRESS_PATTERN** | 1 | Fixed pattern `"{Row}-{Level}-{Bin}"`, not template’s |
| Drop rack on grid | useDesignerRackPlacement.ts | **ROW_LABEL_ADDRESS_PATTERN** | 1 | Same |
| Place row (A→B) from catalog | useDesignerRowOperations.ts | **ROW_LABEL_ADDRESS_PATTERN** | 1 | Same (template has `addressPattern` in `templateToApply` but it is not passed into `createBinsForRack`) |
| Fill row / fill multiple slots | useDesignerRowOperations.ts | **ROW_LABEL_ADDRESS_PATTERN** | 1 | Same |
| **Apply template to existing racks** (after template edit) | WarehouseDesigner.tsx | **template.addressPattern**, template.rowId, sectionStartIndex, binNamingType | from template | Correct: uses template config |

So:

- **Only** “Apply template” (update existing racks after template edit) passes the template’s `addressPattern`, `rowId`, `sectionStartIndex`, `binNamingType` into `createBinsForRack`. All other flows (add rack, stamp, drop, place row) either use no pattern (legacy) or the constant **`ROW_LABEL_ADDRESS_PATTERN = "{Row}-{Level}-{Bin}"`** and section `1`, so:
  - Template’s **Address Pattern** (e.g. `{Row}{Section}{Bin}{Level}`) is ignored.
  - Template’s **Section start** is ignored (always 1 in these paths).
  - **Bin Naming** is sometimes passed (`spec.binNamingType`) when a catalog spec exists, but the **pattern** is still the hardcoded one, so the full intended behaviour (e.g. Row A, Section 1, Bin A/B/C, Level 1) is not achieved.

Result: after “save rack”, the payload’s `bins[].label` are often the legacy or fixed-pattern names (e.g. `A1-1-1`). Those are what get stored in the DB and in the Location table.

### Cause 2: Backend – label records always use legacy formula

Even when the frontend **did** send correct labels (e.g. after “Apply template” + save):

- **`get_location_label_records()`** recomputes `location_code` / `loc_name` with **`_bin_label(aisle, r_idx, lev, seg)`** and does **not** use `bin_data.get("label")`.
- So any feature that uses “location label records” (e.g. location labels PDF, or APIs that expose “location name” from this builder) will show `A1-1-1` style names, ignoring the stored bin label and thus the template’s naming config.

---

## 4. Answers to the requested questions

1. **Are `binNaming` and `addressPattern` saved in the database?**  
   **Yes.** In table `warehouse_templates`, columns `address_pattern`, `bin_naming_type`, `row_id`, `section_start_index` (see `backend/models/warehouse_template.py`, `backend/services/warehouse_template_service.py`).

2. **When locations are generated, are these fields read?**  
   - **Frontend:** They are read only when “Apply template” runs (WarehouseDesigner.tsx); all other bin-creation paths do not use the template’s `addressPattern` / `sectionStartIndex` (and sometimes not the template’s pattern at all).  
   - **Backend:** When generating **default** bins (no payload bins), the backend does not read template or row; it only uses `_bin_label(...)`. When building **location label records**, it does not read `address_pattern` / `bin_naming_type` and does not use the stored bin `label` for the location name; it always uses `_bin_label`.

3. **Is there legacy code that builds locations as `{rack}-{level}-{position}`?**  
   **Yes.**  
   - Backend: `_bin_label(aisle_letter, rack_index, level, segment)` returns `f"{aisle_letter}{rack_index}-{level+1}-{segment+1}"` (e.g. `A1-1-1`). Used when creating default bins and in **every** location name in `get_location_label_records()`.  
   - Frontend: When `createBinsForRack` is called without address-pattern args, it uses `expandNamingPattern` with default pattern `{aisleLetter}-{R}-{L}-{B}`, which produces the same style.

4. **Different generator for layout designer vs rack editor vs CSV import?**  
   - **Layout designer (place/stamp/drop racks):** Uses `createBinsForRack` with either legacy default or `ROW_LABEL_ADDRESS_PATTERN` + section 1; does **not** use the saved template’s `addressPattern` / `binNamingType` (except when applying template to existing racks).  
   - **Rack template editor:** Only saves template fields to `warehouse_templates`; it does not generate locations. The **same** `createBinsForRack` is used when creating bins from that template, but only one call path (apply template) passes the template’s pattern.  
   - **CSV import:** Not traced here; typically imports existing location names and does not use the rack template’s pattern.

---

## 5. Minimal change to respect `binNaming` and `addressPattern`

### Frontend

- **Where:** Every call to `createBinsForRack` that creates bins for a rack that is tied to a template (e.g. from catalog with `item.template` or from a row that has a template).
- **What:** Pass the **template’s** (or row’s) `addressPattern`, `rowId`, `sectionStartIndex`, and `binNamingType` into `createBinsForRack` instead of `undefined` or `ROW_LABEL_ADDRESS_PATTERN` + `1`.
- Concretely:
  - Use `spec.addressPattern ?? ROW_LABEL_ADDRESS_PATTERN` (or template’s pattern when available).
  - Use `spec.rowId` / template rowId and `spec.sectionStartIndex` / template sectionStartIndex (including per-row section progression if applicable).
  - Use `spec.binNamingType` / template binNamingType (already passed in some places).
- So: **one** consistent rule – “when this rack comes from a template (or row with template), use that template’s naming config when calling `createBinsForRack`” – and apply it in useDesignerRackPlacement, useDesignerRowOperations, and any other placement path that creates bins.

### Backend

- **Where:** `get_location_label_records()` in `warehouse_layout_service.py`.
- **What:** Use the **stored** bin label for the location name when present: e.g. `location_code = (bin_data.get("label")) or _bin_label(aisle, r_idx, lev, seg)`. Use that same value for `loc_name`, `location_code`, `location_name`, and any other field that represents “display name” of the location. Fall back to `_bin_label` only when `label` is missing (e.g. old data or backend-generated bins).
- Optional: When the backend **generates** default bins (no payload bins), it could in theory look up the rack’s template (if `template_id` is set) and use that template’s `address_pattern` / `bin_naming_type` to compute labels instead of `_bin_label`. That would require loading template and implementing pattern expansion on the backend; the minimal fix is to prefer `bin.label` wherever it exists and fix the frontend so that the stored labels are correct.

---

## 6. Summary diagram

```
Rack template editor (TemplateCreator)
  → Saves: addressPattern, rowId, sectionStartIndex, binNamingType
  → Backend: warehouse_templates table ✅

Layout designer – place/stamp/drop rack
  → createBinsForRack(..., undefined or ROW_LABEL_ADDRESS_PATTERN, ..., 1, ...)
  → Template’s addressPattern / section / binNaming NOT used ❌
  → Labels = legacy or fixed "{Row}-{Level}-{Bin}"

Layout designer – “Apply template” to existing racks
  → createBinsForRack(..., template.addressPattern, template.rowId, ...)
  → Template config IS used ✅

Save layout
  → Payload: racks[].bins[].label (as computed above)
  → Backend: Bin.label = bin_data.get("label") or _bin_label(...) ✅ (persists frontend label when present)
  → _sync_locations_from_bins: Location.name = b.label ✅

get_location_label_records (e.g. for labels PDF)
  → location_code = _bin_label(...)  (ignores bin_data["label"]) ❌
  → So exported “location name” is always legacy format
```

---

*End of analysis. No code changes were made.*
