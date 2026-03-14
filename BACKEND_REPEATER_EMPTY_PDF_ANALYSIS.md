# Backend repeater empty PDF – analysis

**Problem:** Labels with repeaters render in the Designer preview but produce **empty PDFs** when generated from the Print Queue via the **backend** `POST /labels/render-pdf` pipeline.

**Conclusion:** The Print Queue sends **one flat record per location** (e.g. `{ location_code, barcode_data, ... }`) and **does not** send a `locations` array. The backend layout engine reads `record.get("locations")` for repeaters with `dataset: "locations"`; that key is **missing**, so `items = []` and the repeater outputs no layout items → empty page.

---

## 1. Example request payload sent to `/labels/render-pdf`

**Endpoint:** `POST /labels/render-pdf`  
**Body (RenderPdfBody):** `{ template_id: number, records: list[dict], printer_profile_id?: number }`

When the Print Queue generates **location** labels (with a repeater template), it calls the backend with **the same `records`** as used for the grid – i.e. a **flat list of one record per location** from `getRecordsFromLayout()`:

```json
{
  "template_id": 42,
  "records": [
    {
      "location_name": "A1-1-1",
      "location_code": "A1-1-1",
      "location_barcode": "A1-1-1",
      "barcode_data": "A1-1-1",
      "rack": "A1",
      "rack_id": "A1",
      "level": 2,
      "position": 1,
      "zone_name": "Magazyn",
      "{loc_name}": "A1-1-1",
      "{loc_barcode}": "A1-1-1"
    },
    {
      "location_name": "A1-1-2",
      "location_code": "A1-1-2",
      "barcode_data": "A1-1-2",
      ...
    }
  ]
}
```

So:

- **One record per page** (backend does one page per record).
- Each record is a **single location** (flat keys only).
- There is **no** `locations` (or other repeater-dataset) key in any record.

**Rack strip** is different: the frontend sends `records: [stripRecord]` with `stripRecord = { locations: stripRecords }`, so the backend **does** receive a `locations` array for that flow.

---

## 2. Example record received by the layout engine

For **location** labels from the Print Queue, each `record` passed to `compute_layout(layout, record, ...)` (and thus into `_compute_layout_items(..., record, ...)`) is **one** of the flat objects above, after `_normalize_record_for_bindings()`. Normalization only adds/fills binding keys (e.g. `barcode_data`, `loc_name`); it **does not** add a `locations` array.

**Example record (one page) when using a repeater template:**

```python
{
    "location_name": "A1-1-1",
    "location_code": "A1-1-1",
    "location_barcode": "A1-1-1",
    "barcode_data": "A1-1-1",
    "rack": "A1",
    "rack_id": "A1",
    "level": 2,
    "position": 1,
    "zone_name": "Magazyn",
    "{loc_name}": "A1-1-1",
    "{loc_barcode": "A1-1-1",
    # ... other flat keys; NO "locations" key
}
```

So the layout engine **never** sees `record["locations"]` for location-label PDFs from the Print Queue.

---

## 3. dataset_key used by repeater

In **`label_engine.py`**, inside **`_compute_layout_items()`**, for each element with `el_type == "repeater"`:

```python
dataset_key = el.get("dataset")
# ...
dataset_key = dataset_key.strip() if isinstance(dataset_key, str) else dataset_key
```

So **dataset_key** is the template’s repeater **`dataset`** (e.g. `"locations"`). The repeater then does:

```python
raw_dataset = record.get(dataset_key)
items = list(raw_dataset or [])
if not isinstance(raw_dataset, list):
    items = []
```

So it uses **`record.get(dataset_key)`** (e.g. `record.get("locations")`).

---

## 4. record[dataset_key] value and whether it is empty or missing

- For **location** labels from the Print Queue, each record is a single-location dict with **no** `locations` key.
- So **`record.get("locations")`** is **`None`** (missing).
- Then **`raw_dataset or []`** → **`[]`**, and **`not isinstance(raw_dataset, list)`** is true, so **`items = []`**.
- The repeater loop **`for idx, item in enumerate(items):`** runs **0 times** → no layout items from the repeater → page is empty (or only non-repeater content).

So for this pipeline:

- **record[dataset_key]:** **missing** (None).
- **Effective items:** **empty** list.

---

## 5. How repeaters read datasets when dataset_key is missing

Code in **`label_engine.py`** (repeater block):

```python
raw_dataset = record.get(dataset_key)   # None when key missing
items = list(raw_dataset or [])        # list(None or []) → []
if not isinstance(raw_dataset, list):  # True when raw_dataset is None
    items = []
```

So when **dataset_key** is missing from the record:

1. **`record.get(dataset_key)`** returns **None**.
2. **`items`** is set to **`[]`** (and stays `[]` after the `isinstance` check).
3. The repeater emits **no** layout items for that record → empty (or nearly empty) page.

The backend does **not** build a `locations` (or other dataset) array from the flat record; it only uses what the client sends.

---

## 6. Preview vs PDF record shape

| Pipeline | Record source | Record shape for repeater |
|----------|----------------|----------------------------|
| **Designer preview** (frontend) | **buildPreviewRecord(template)** | `record.locations = generatePreviewDataset("locations")` → **array of 3 items**. So `record[dataset_key]` is an array; repeater runs and produces many layout items. |
| **Print Queue → backend PDF** (location) | Request body **records** from frontend | Frontend sends **flat list**: one record per location, each with `location_code`, `barcode_data`, etc. **No** `locations` key. Backend uses these records as-is (after binding normalization only). So **record["locations"]** is **missing** → repeater gets **items = []** → empty page. |
| **Print Queue → backend PDF** (rack strip) | Frontend sends **records: [{ locations: stripRecords }]** | Record **has** `locations` array → repeater works for that flow. |

So:

- **Preview** works because the **frontend** builds **`record.locations`** in **buildPreviewRecord()**.
- **Backend PDF for location labels** fails because the **Print Queue** sends flat records and **does not** build a `{ locations: [...] }`-shaped record per page before calling `/labels/render-pdf`. The backend never constructs that shape; it only receives it for rack strip when the frontend sends it.

---

## Diagnostic logging added (backend)

1. **backend/api/labels.py** – at the start of **post_render_pdf**:
   - `template_id`, `records_count`
   - First record’s keys and whether it has a **`locations`** key

2. **backend/services/label_engine.py** – inside the **repeater** branch of **\_compute_layout_items**:
   - `record_keys`, `dataset_key`, type of `record[dataset_key]` (or "missing"), and `len(items)`

After deploying, trigger a location-label PDF from the Print Queue with a repeater template and check logs: you should see **first record has 'locations': False** and **layout repeater: ... dataset_key='locations' ... missing len=0**.

---

## Summary

| Item | Value |
|------|--------|
| **Example request payload** | `{ template_id, records: [ { location_name, location_code, barcode_data, ... }, ... ] }` – no `locations` in any record |
| **Example record to layout** | One of the above flat dicts (single location); no `locations` key |
| **dataset_key** | From template repeater: e.g. `"locations"` |
| **record[dataset_key]** | **Missing** (None) for location-label PDFs from Print Queue |
| **Empty or missing?** | **Missing** → backend uses `[]` → repeater produces **0** items → **empty PDF**. |

No fixes were implemented; only the described logging was added for verification.
