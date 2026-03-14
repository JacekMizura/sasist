# Rack-level variable `{rack_name}` for label templates – analysis

**Problem:** Location label templates expect `{rack_name}` (e.g. "A1") and `{loc_name}` (e.g. "A-1", "B-1", "C-1"). The variable inspector only exposes `{loc_name}`, `{loc_barcode}`, `{zone}`. `{rack_name}` is missing.

**Scope:** Trace how label template variables are defined and how records are built; identify where `rack_name` should be added and why it is missing. No code changes.

---

## 1. Where the variable list for label templates is defined

There are two related concepts:

### A. Variables shown in the Variable Inspector (Root variables / Datasets)

- **Source:** The inspector does **not** use a fixed list. It shows variables **found in the template**.
- **Flow:** `VariableInspectorPanel` receives `analysis: { rootVariables, datasets, previewVariables }`.  
  - `rootVariables` and `datasets` come from **`analyzeTemplateVariables(template)`** in `frontend/src/labelSystem/variableAnalysis/analyzeTemplateVariables.ts`.  
  - That function **walks the template elements** and collects every `binding` / `dataBinding` used in dynamicText and barcode elements. So "Root variables" = the set of tokens like `{loc_name}`, `{zone}` that actually appear in the template.
- So if the user never adds a `{rack_name}` field to the template, `rack_name` will not appear under "Root variables". Once they add it, it will appear; it will then show as **unresolved** (⚠) because preview and backend records do not contain `rack_name`.

### B. “Available” variables for insertion (variable picker / suggestions)

- **Source:** **`LABEL_VARIABLE_CATEGORIES`** in `frontend/src/types/labelSystem.ts`.
- **Usage:** In `LabelTemplateDesigner.tsx`, for template type `location`, `TEMPLATE_TYPE_CATEGORIES["location"]` is `["warehouse"]`, so the designer shows the **warehouse** category. Its `items` are:
  - `{ id: "loc_name", label: "{loc_name}", token: "{loc_name}" }`
  - `{ id: "loc_barcode", label: "{loc_barcode}", token: "{loc_barcode}" }`
  - `{ id: "zone", label: "{zone}", token: "{zone}" }`
- So the **list of variables the user can pick** for location templates is exactly these three. **`rack_name` is not in this list**, which is why the inspector/designer “exposes only” `{loc_name}`, `{loc_barcode}`, `{zone}`.

**Summary:**  
- **Variable list for “what you can insert”** = `LABEL_VARIABLE_CATEGORIES` → for location type, only the **warehouse** category, which currently has **loc_name**, **loc_barcode**, **zone** (no **rack_name**).  
- **Variable list in the inspector** = whatever bindings exist in the template (from `analyzeTemplateVariables`); resolution comes from preview/record data.

---

## 2. Does the record builder include `rack_name`?

### Backend – location label records

- **Builder:** `get_location_label_records()` in **`backend/services/warehouse_layout_service.py`**.
- For each bin it builds a record with:
  - `loc_name`, `loc_barcode`, `zone`, `location_code`, `location_barcode`, `barcode_data`, `location_name`
  - `rack` = `rack_str` (e.g. `"A1"`)
  - `rack_id` = `rack_str`
  - `level`, `level_num`, `position`, `zone_name`
  - Curly forms: `{loc_name}`, `{loc_barcode}`, `{rack_id}`, `{level_num}`, `{bin_pos}`, `{zone}`
- **It does not set `rack_name` or `{rack_name}`.** So the record builder does **not** include `rack_name`.

### Frontend – preview record and repeater dataset

- **Root preview record:** `PREVIEW_SAMPLES.location` in **`frontend/src/types/labelSystem.ts`** has `rack_id: "A01"` but **no `rack_name`** and no `{rack_id}` / `{rack_name}`.
- **Repeater dataset “locations”:** `generatePreviewDataset("locations")` in **`frontend/src/labelSystem/repeaterPreview/generatePreviewDataset.ts`** uses `locationsPreview()`, which returns items with `loc_name`, `location_code`, `loc_barcode`, etc., but **no `rack_name`**.

So **neither** the backend record builder **nor** the frontend preview/dataset builders include `rack_name`.

---

## 3. Is `rack_name` stored in location records?

- **Backend:** `get_location_label_records()` does **not** add `rack_name`. It does add **`rack_id`** (and `rack`) with value `rack_str` (e.g. `"A1"`). So the “rack identifier” is present as `rack_id`, but the name used in the UI for “rack name” is not exposed as `rack_name`.
- **Layout/rack model:** The layout API returns racks with e.g. `name`, `aisle_letter`, `rack_index`. The string `f"{aisle}{r_idx}"` (e.g. `"A1"`) is the same value that could serve as `rack_name` for labels. So the data to fill `rack_name` exists (same as current `rack_id` or rack display name); it is just not added to the label record as `rack_name`.

So **no**: `rack_name` is not stored in the location label records today. **`rack_id`** is stored and has the value that could be used as rack name (e.g. "A1").

---

## 4. Is `rack_name` removed somewhere when building label records?

- **No.** It is never added in the first place, so it is not “removed.”
- **Backend:** `get_location_label_records()` never sets `rack_name` or `{rack_name}`.
- **Normalization:** In `label_render_service.py`, `_normalize_record_for_bindings()` only **adds** aliases (e.g. `location_name` → `loc_name`, `zone_name` → `zone`). It does not delete keys. So if we later add `rack_name` in the record builder, it would pass through.

---

## 5. Expected data structure vs current

**Expected (from the task):**

```json
{
  "rack_name": "A1",
  "loc_name": "A-1",
  "location_code": "A-1",
  "barcode_data": "A-1",
  "level": 1,
  "position": 1
}
```

**Current backend record** (from `get_location_label_records`) has:

- `loc_name`, `location_code`, `barcode_data`, `level`, `position` (and level_num, bin_pos, etc.)
- `rack_id`: `"A1"` (and `rack`: `"A1"`)
- **No `rack_name`.**

So the only missing field for the expected structure is **`rack_name`** (and optionally its curly form **`{rack_name}`**). The value can be the same as `rack_id` / `rack` (or the rack’s display name if we choose to use it later).

---

## 6. Where `{rack_name}` should be added

### Backend (record builder)

- **File:** `backend/services/warehouse_layout_service.py`
- **Function:** `get_location_label_records()`
- **Change:** When building each record, set:
  - `rack_name` = same value used for the rack (e.g. `rack_str` = `f"{aisle}{r_idx}"`, or `rack.get("name")` if you prefer the layout’s rack name when present).
  - `"{rack_name}"` = same value.
- **Reason:** This is the single place that builds the “one record per bin” list used for location label PDF and any API that consumes these records. Adding `rack_name` (and `{rack_name}`) here ensures all backend-driven label flows get the variable.

### Frontend (variable list and preview)

1. **Variable picker (so the user can insert `{rack_name}`)**  
   - **File:** `frontend/src/types/labelSystem.ts`  
   - **Change:** In `LABEL_VARIABLE_CATEGORIES`, in the **warehouse** category `items`, add:
     - `{ id: "rack_name", label: "{rack_name}", token: "{rack_name}" }`
   - **Reason:** For template type `location`, only the warehouse category is shown; adding `rack_name` there makes it appear in the designer’s variable list next to `loc_name`, `loc_barcode`, `zone`.

2. **Designer preview (so `{rack_name}` resolves in the inspector)**  
   - **File:** `frontend/src/types/labelSystem.ts`  
   - **Change:** In `PREVIEW_SAMPLES.location`, add:
     - `rack_name: "A01"` (or same as current `rack_id`)
     - `"{rack_name}": "A01"`
   - **Reason:** `resolvePreviewVariables()` resolves bindings from the preview record; without `rack_name` / `{rack_name}` in the sample, `{rack_name}` in the template shows as unresolved (⚠) in the Variable Inspector.

3. **Repeater dataset “locations” preview (optional but consistent)**  
   - **File:** `frontend/src/labelSystem/repeaterPreview/generatePreviewDataset.ts`  
   - **Change:** In `locationsPreview()`, add `rack_name` (and optionally `{rack_name}`) to each item, e.g. same value as the `rack` used in the synthetic `loc_name`.
   - **Reason:** If location templates use a repeater with dataset `locations`, the first item is used to resolve dataset variables; adding `rack_name` there keeps the inspector and preview consistent with root-level location preview.

---

## 7. Why `{rack_name}` is currently missing

1. **Record builder:** The backend only added **`rack_id`** (and `rack`) for the rack identifier and never introduced a separate **`rack_name`** key. So templates that expect `{rack_name}` have no value to bind to.
2. **Variable list:** The warehouse category in `LABEL_VARIABLE_CATEGORIES` was defined with only `loc_name`, `loc_barcode`, and `zone`. So the UI never offered `{rack_name}` as a variable to insert.
3. **Preview data:** `PREVIEW_SAMPLES.location` and `locationsPreview()` do not include `rack_name`, so even if the user types `{rack_name}` manually, it shows as unresolved in the inspector and does not preview.

Nothing strips `rack_name`; it was simply never added to the record or to the frontend variable/preview definitions.

---

## 8. Safest place to inject `rack_name` into label records

- **Single, authoritative place:** **`get_location_label_records()`** in **`backend/services/warehouse_layout_service.py`**.
- **Why:**  
  - All location-label flows that use the layout (e.g. location labels PDF, any API that returns “records for location labels”) go through this method.  
  - The record is built per bin with the rack already in scope (`rack_str` or `rack` dict). Adding `rack_name` and `{rack_name}` here is a small, local change and does not require new APIs or new callers.  
  - Frontend Print Queue and Rack Label flows that build their own records from layout/rack data would still need to include `rack_name` in their payload if they construct records client-side; the backend then just passes them through. The **canonical** place for “layout-driven” location label records is still `get_location_label_records()`.

**Recommendation:**  
- Add **`rack_name`** (and **`{rack_name}`**) in **`get_location_label_records()`**, using the same value as today’s `rack_str` (or the rack’s display name if the layout provides it).  
- Then add **`rack_name`** to the frontend variable list and preview data as above so the designer and Variable Inspector support `{rack_name}` consistently.

---

*End of analysis. No code changes were made.*
