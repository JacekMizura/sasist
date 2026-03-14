# Rack strip template analysis – bindings and repeater

**Symptoms:** (1) Text shows `{{loc_name}}` instead of actual value. (2) All barcodes show the same code (e.g. A1-1-1).

**Cause:** Template may use **staticText** with literal `"{{loc_name}}"`, and/or repeater dataset/record shape may not match what the engine expects.

---

## 1. Actual template JSON for rack strip (from codebase)

Templates are stored in **SavedLabelTemplate.template_json** (DB). The codebase **creates** strip templates in two ways; the saved JSON will look like one of these.

### A) “Pasek regału” from Label Left Panel

**File:** `frontend/src/pages/LabelSystem/components/LabelLeftPanel.tsx` (generateRackSection).

Repeater uses **dataset: "segments"**. Inner elements:

- **Barcode:** `dataBinding: "barcode_data"`.
- **Text:** `type: "dynamicText"`, `binding: "barcode_data"` (same as barcode value).

No `loc_name` text element; location is shown via barcode + text bound to `barcode_data`.

**Example repeater + inner template (conceptual):**

```json
{
  "type": "repeater",
  "dataset": "segments",
  "direction": "horizontal",
  "itemWidth": 30,
  "itemHeight": 15,
  "template": {
    "elements": [
      {
        "type": "barcode",
        "dataBinding": "barcode_data",
        "format": "Code128",
        "showValue": false
      },
      {
        "type": "dynamicText",
        "binding": "barcode_data",
        "fontSize": 6,
        "align": "center"
      }
    ]
  }
}
```

### B) Imported PNG strip (buildRepeaterTemplate)

**File:** `frontend/src/labelImporter/templateBuilder/buildRepeaterTemplate.ts`.

Repeater uses **dataset: "locations"**. Inner elements:

- **dynamicText:** `binding: "location_code"`.
- **barcode:** `dataBinding: "location_barcode"`.

**Example (conceptual):**

```json
{
  "type": "repeater",
  "dataset": "locations",
  "direction": "horizontal",
  "template": {
    "elements": [
      { "type": "dynamicText", "binding": "location_code", "fontSize": 6, "align": "center" },
      { "type": "barcode", "dataBinding": "location_barcode", "format": "Code128", "showValue": false }
    ]
  }
}
```

### C) Preset strip (labelPresets.ts)

**File:** `frontend/src/services/labelPresets.ts` – strip presets use **dataset: "locations"** and **dynamicText** with **binding: "loc_name"** (and barcode with **dataBinding: "barcode_data"** or similar).

So in **code**, all strip templates use **dynamicText** and **binding** (or **dataBinding** for barcode), not static text with `{{loc_name}}`.

If a **saved** template in the DB has:

- **staticText** with **`"text": "{{loc_name}}"`**

then that came from:

- manual edit,
- an import that emitted static text with placeholders, or
- an older designer that saved placeholders as static text.

---

## 2. Element type used for location name

- **Intended (from code):** **`"type": "dynamicText"`** with **`"binding": "{loc_name}"`** or **`"binding": "loc_name"`** or **`"binding": "location_code"`** or **`"binding": "barcode_data"`** depending on preset/flow.
- **Bug case:** **`"type": "staticText"`** with **`"text": "{{loc_name}}"`**.  
  Then the location name is stored as a literal string; the engine only resolves bindings for **text** / **dynamicText**, not for **staticText** (unless we add a fallback).

---

## 3. Whether binding is used or text literal

- **Binding (correct):** Element has **`type: "dynamicText"`** and **`binding: "{loc_name}"`** (or `"loc_name"`, `"location_code"`, `"barcode_data"`). The layout engine resolves **binding** from the **current record** (repeater item or root) and sets the displayed text.
- **Text literal (bug):** Element has **`type: "staticText"`** and **`text: "{{loc_name}}"`**. The engine uses **text** as-is and does **not** substitute variables, so `{{loc_name}}` is shown literally.  
  **Backend** already has a fallback (in `label_engine.py`): if staticText `text` matches `{{var_name}}`, it resolves and replaces. **Frontend** did not have this fallback, so in the browser-generated PDF (Rack → Download labels) the literal `{{loc_name}}` appeared until we added the same resolution in the frontend layout engine.

---

## 4. Binding resolution in the engine

**Backend** (`backend/services/label_engine.py`, `_compute_layout_items`):

- **text / dynamictext:** `binding = el.get("binding") or el.get("dataBinding")` → `item["text"] = _resolve(record, binding)`.  
  So only these types get binding resolution for text.
- **statictext:** `text_value = el.get("text")`. There is a **fallback**: if `text_value` matches `{{?([a-zA-Z0-9_]+)}}?`, it resolves that variable with `_resolve(record, "{" + var_name + "}")` and uses it; otherwise uses literal.
- **barcode:** Uses **record** (repeater **item** when inside repeater) for `_resolve_barcode_value(record, binding)`. So each repeater cell gets that item’s barcode value.

**Frontend** (`frontend/src/utils/labelLayoutEngine.ts`, `elementToLayoutItem`):

- **dynamicText:** Uses **record** and **`resolveBinding(record, el.binding)`** for text. Correct for repeater (record = item).
- **staticText:** Previously used **`el.text`** only (no substitution). **Now:** if `el.text` matches a single placeholder like `{{var_name}}` or `{var_name}`, we resolve it with `resolveBinding(record, "{" + varName + "}")` and use that, so `{{loc_name}}` in staticText is resolved from the current record (repeater item or root).
- **barcode:** Uses **record** and **`resolveBarcodeValue(record, el.dataBinding)`**. So each repeater cell uses that item; if the record passed to the repeater is the **chunk array** with one object per segment and keys like **loc_name**, **barcode_data**, **location_code**, **location_barcode**, then each slot gets the correct value.

So:

- **{{loc_name}}** is fixed by resolving that placeholder in **staticText** on the frontend (and was already handled on the backend).
- **All barcodes same** is fixed by ensuring the **repeater dataset** is the one the template expects (**segments** or **locations**) and each **item** in that array has **barcode_data** (and **loc_name** / **location_code** / **location_barcode**) set per location; that was addressed in **RackLabelDownloadModal** by using **repeater.dataset** and building **datasetItems** with those keys per location.

---

## 5. Recommended fix (summary)

1. **Template JSON (designer / presets / import)**  
   Prefer **dynamicText** with **binding** for location name (e.g. **`binding: "loc_name"`** or **`"location_code"`**), not staticText with **`text: "{{loc_name}}"`**. Existing presets and buildRepeaterTemplate already do this.

2. **Frontend staticText placeholder (done)**  
   In **labelLayoutEngine.ts**, for **staticText**, if **text** is a single placeholder (e.g. **`{{loc_name}}`** or **`{loc_name}`**), resolve it with **resolveBinding(record, "{" + varName + "}")** and use that. So old or imported templates that use static **`{{loc_name}}`** still work in the browser-generated PDF.

3. **Repeater dataset and record shape (done)**  
   In **RackLabelDownloadModal**, use the template’s **repeater.dataset** (e.g. **"segments"** or **"locations"**) as the key for the chunk array, and build each **item** with **loc_name**, **location_code**, **location_barcode**, **barcode_data** (and optionally **location_name**) so both text and barcode resolve per slot. Then **renderLabel(template, record)** receives **record[datasetKey] = [item1, item2, item3]** and each repeater iteration gets the right item.

4. **Backend**  
   No change needed for strip templates: backend already resolves **staticText** placeholders and uses **item_data** for repeater cells. Ensure any API that builds records for strip labels (e.g. **/labels/render-pdf**) passes the same shape: **record[dataset] = list of dicts** with **loc_name** / **barcode_data** etc. per item.

5. **Validation / migration (optional)**  
   Add a check or migration: if an element is **staticText** and **text** looks like **`{{...}}`**, suggest converting to **dynamicText** with that binding so behaviour is explicit and consistent everywhere.
