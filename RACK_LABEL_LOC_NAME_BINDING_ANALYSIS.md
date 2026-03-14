# Rack label: `{loc_name}` not resolved in PDF – analysis

**Problem:** PDF output shows the literal `{loc_name}` instead of the resolved value (e.g. `A1-1-1`). The binding is not resolved.

**Conclusion:** The **record** passed to `renderLabel()` has **no top-level `loc_name`**. It has `locations` (or the repeater dataset key) as an **array** of items, each with `loc_name`. Elements **inside** the repeater get the per-slot record and resolve correctly. Any element **outside** the repeater (top-level) that binds to `{loc_name}` receives this record and `resolveBinding(record, "{loc_name}")` returns `""`, so the placeholder is left as-is.

---

## 1. Where `renderLabel(template, record)` is called for rack label download

**File:** `frontend/src/components/labels/RackLabelDownloadModal.tsx`

**Location:** Inside `handleDownload()`, in the loop over chunks (lines 121–141):

```ts
for (const group of chunks) {
  const first = group[0];
  const datasetItems = group.map((loc) => ({
    loc_name: loc.label,
    location_name: loc.label,
    location_code: loc.label,
    location_barcode: loc.barcode ?? loc.label,
    barcode_data: loc.barcode ?? loc.label,
  }));
  const record = {
    [datasetKey]: datasetItems,
    location_code: first?.label ?? "",
    location_barcode: first?.barcode ?? first?.label ?? "",
    barcode_data: first?.barcode ?? first?.label ?? "",
  };
  // ...
  const svg = await renderLabel(template, record);
  svgs.push(svg);
}
```

So for each label (each chunk), `renderLabel(template, record)` is called once with the `record` built above.

---

## 2. Actual record structure passed to renderLabel

**Actual structure** (with `datasetKey === "locations"`):

```js
{
  locations: [
    { loc_name: "A1-1-1", location_name: "A1-1-1", location_code: "A1-1-1", location_barcode: "...", barcode_data: "..." },
    { loc_name: "A1-1-2", ... },
    // ... one object per slot in the chunk
  ],
  location_code: "A1-1-1",   // first item's label
  location_barcode: "...",   // first item's barcode
  barcode_data: "...",      // first item's barcode
}
```

There is **no** top-level `loc_name` or `location_name`. So:

- `record.loc_name` → **undefined**
- `record.locations` → array (used by the repeater)
- `record.location_code` / `location_barcode` / `barcode_data` → set from the **first** item only

**Expected structure** (for top-level bindings to `{loc_name}` to work):

```js
{
  loc_name: "A1-1-1",           // from first item (or primary location)
  location_name: "A1-1-1",      // optional, same
  locations: [ ... ],           // for repeater
  location_code: "A1-1-1",
  location_barcode: "...",
  barcode_data: "...",
}
```

So the gap is: **top-level `loc_name` (and optionally `location_name`) are missing** from the record.

---

## 3. How `resolveBinding(record, binding)` resolves `{loc_name}`

**File:** `frontend/src/utils/labelLayoutEngine.ts` (lines 59–68):

```ts
function resolveBinding(record: Record<string, unknown>, binding: DynamicBinding): string {
  if (!binding || typeof binding !== "string") return "";
  const key = binding.trim();
  if (!key) return "";
  let val = record[key];
  if (val != null) return String(val);
  const bare = key.startsWith("{") && key.endsWith("}") ? key.slice(1, -1).trim() : key;
  val = record[bare] ?? record[`{${bare}}`];
  return val != null ? String(val) : "";
}
```

For binding `"{loc_name}"`:

1. `key` = `"{loc_name}"`
2. `val = record[key]` → `record["{loc_name}"]` → **undefined** (not set)
3. `bare` = `"loc_name"` (strip `{` and `}`)
4. `val = record[bare] ?? record["{loc_name}"]` → `record["loc_name"] ?? record["{loc_name}"]` → **undefined** with the current record (no top-level `loc_name`)
5. Returns `""`

So it checks:

- `record["{loc_name}"]`
- `record["loc_name"]`

It does **not** look inside `record.locations[0].loc_name` or any other nested path. So if `loc_name` is only inside the repeater dataset array, top-level elements never see it.

---

## 4. Why `{loc_name}` remains unresolved in the PDF

- **Elements inside the repeater:**  
  For each slot, the layout engine uses `items = record[rep.dataset]` (e.g. `record.locations`) and builds **per-item** data: `itemData = { ...item }` (each item already has `loc_name`, `location_name`, etc.). So `elementToLayoutItem(child, cx, cy, itemData)` is called with a record that **has** `loc_name`. So `resolveBinding(itemData, "{loc_name}")` returns the correct value for that slot. So **inside** the repeater, `{loc_name}` is resolved.

- **Elements outside the repeater (top-level):**  
  They are laid out with the **same** `record` that was passed to `computeLayoutFromTemplate` — the one built in RackLabelDownloadModal. That record has **no** `record.loc_name`. So for any top-level static or dynamic text that uses `{loc_name}`, `resolveBinding(record, "{loc_name}")` returns `""`.  
  - For **dynamicText**, the layout engine then uses the fallback: `(binding ? `{${binding.replace(/^\{|\}$/g, "")}}` : "")` → `"{loc_name}"`, so the literal appears.  
  - For **staticText**, the placeholder is only replaced when `resolved` is truthy (`if (resolved) text = resolved`); when `resolved === ""`, the original text (e.g. `"{loc_name}"`) is kept. So the PDF shows `{loc_name}`.

So the failure is **only** for elements that are **not** inside the repeater and that bind to `{loc_name}`. The record is correct for the repeater; it is **incomplete for top-level** bindings.

---

## 5. Minimal safe fix (do NOT implement yet)

**Where:** `frontend/src/components/labels/RackLabelDownloadModal.tsx`, in the loop where `record` is built (around lines 129–134).

**Change:** Add top-level fields from the **first** location in the chunk so that top-level elements can resolve `loc_name` (and related) the same way as the first slot:

- Add to `record`:
  - `loc_name: first?.label ?? ""`
  - Optionally `location_name: first?.label ?? ""` for consistency with other bindings.

**Resulting record shape** (conceptually):

```js
const record = {
  [datasetKey]: datasetItems,
  loc_name: first?.label ?? "",
  location_name: first?.label ?? "",
  location_code: first?.label ?? "",
  location_barcode: first?.barcode ?? first?.label ?? "",
  barcode_data: first?.barcode ?? first?.label ?? "",
};
```

**Why this is minimal and safe:**

- Repeater logic already uses `record[datasetKey]` and builds per-slot data from each item; it does not depend on top-level `loc_name`. So adding top-level `loc_name` does not change repeater behavior.
- Top-level elements that bind to `{loc_name}` or `{location_name}` will now get the first location’s value, which matches the typical “one label per chunk, first location as primary” semantics for rack strips.
- No change is required in `labelLayoutEngine.ts` or `renderLabel.ts`; the contract (record with flat keys for bindings) is already correct; the modal was just not populating those keys at the top level.

**Optional:** If the template or backend ever expects other top-level variables (e.g. `warehouse_name`), they can be added in the same place or via `renderLabel(..., { templateVariables: { ... } })`; the analysis above is scoped to `{loc_name}` and the current record shape.
