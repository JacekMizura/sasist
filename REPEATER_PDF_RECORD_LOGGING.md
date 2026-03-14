# Repeater PDF – record logging and expected values

Diagnostic logging was added so you can inspect the exact record passed to `renderLabel()` and the layout result. No fixes were implemented.

---

## Logging added

### 1. LabelPrintQueue.tsx – before the loop (once per PDF)

- `console.log("REPEATER", repeater)` – the template repeater element or `undefined`
- `console.log("DATASET KEY", repeater?.dataset)` – e.g. `"locations"`
- `console.log("SLOTS", slots, ...)` – slots per label from `getSlotsPerLabel(repeater, template)` (and columns for grid)

### 2. LabelPrintQueue.tsx – before each `renderLabel()` call

- `console.log("FINAL RECORD", JSON.stringify(record, null, 2))`
- `console.log("DATASET KEY", repeater?.dataset)`
- `console.log("DATASET VALUE", record[repeater?.dataset ?? ""])`
- `console.log("DATASET LENGTH", record[repeater?.dataset ?? ""]?.length)`

### 3. renderLabel.ts – after `computeLayoutFromTemplate()`

- `console.log("LAYOUT ITEMS", items.length)`

---

## 1. Example final record (repeater template)

When the template has a repeater and `buildPageRecords()` runs, each record passed to `renderLabel()` should look like this (dataset key `"locations"`, 3 slots per label):

```json
{
  "location_name": "A1-1-1",
  "location_code": "A1-1-1",
  "location_barcode": "A1-1-1",
  "barcode_data": "A1-1-1",
  "loc_name": "A1-1-1",
  "loc_barcode": "A1-1-1",
  "rack": "A1",
  "rack_id": "A1",
  "level": 2,
  "position": 1,
  "zone_name": "Magazyn",
  "{loc_name}": "A1-1-1",
  "{loc_barcode}": "A1-1-1",
  "locations": [
    {
      "loc_name": "A1-1-1",
      "loc_barcode": "A1-1-1",
      "barcode_data": "A1-1-1",
      "location_name": "A1-1-1",
      "location_code": "A1-1-1",
      "location_barcode": "A1-1-1"
    },
    {
      "loc_name": "A1-1-2",
      "loc_barcode": "A1-1-2",
      "barcode_data": "A1-1-2",
      "location_name": "A1-1-2",
      "location_code": "A1-1-2",
      "location_barcode": "A1-1-2"
    },
    {
      "loc_name": "A1-1-3",
      "loc_barcode": "A1-1-3",
      "barcode_data": "A1-1-3",
      "location_name": "A1-1-3",
      "location_code": "A1-1-3",
      "location_barcode": "A1-1-3"
    }
  ]
}
```

So the record must contain:

- `record.locations` (or whatever `repeater.dataset` is)
- as an **array** of objects with `loc_name`, `location_name`, `barcode_data`, etc.

If **FINAL RECORD** in the console has no `locations` (or the dataset key), or `locations` is not an array, the repeater will get no items and the PDF will be empty.

---

## 2. datasetKey

- Comes from the repeater: `repeater?.dataset` (e.g. `"locations"`, `"segments"`, `"levels"`).
- Logged as **DATASET KEY**.
- `buildPageRecords` uses `repeater.dataset.trim() || "locations"` when building the record, so the key on the record should match this.

---

## 3. dataset length

- **DATASET LENGTH** = `record[repeater?.dataset]?.length`.
- For correct behaviour this should be the number of slots per label (e.g. 3 or 4), matching the repeater layout.
- If it is `undefined` or `0`, the repeater will produce no layout items and the page will be empty.

---

## 4. layoutItems length

- **LAYOUT ITEMS** = number of items returned by `computeLayoutFromTemplate()`.
- For a repeater label with 3 slots and several elements per slot (e.g. rect + text + barcode), this should be well above 0 (e.g. 10+).
- If it is **0** or very small (e.g. 1–2), the repeater is not expanding: either `record[datasetKey]` is missing/empty, or the layout/repeater config is wrong.

---

## 5. Repeater configuration (rows, columns, slots)

- **REPEATER** – full repeater element from `template.elements` (or `undefined` if no repeater).
- **DATASET KEY** – `repeater.dataset`.
- **SLOTS** – from `getSlotsPerLabel(repeater, template)`:
  - **Horizontal:** `floor((template.widthMm - rep.x) / itemWidth)`
  - **Vertical:** `floor((template.heightMm - rep.y) / itemHeight)`
  - **Grid:** `columns * floor((template.heightMm - rep.y) / itemHeight)`

So there is no single `rows` property; rows are derived from template height and `itemHeight`. For grid, effective slots = columns × computed rows. The log **SLOTS** prints this computed value and, for grid, `(columns=N)`.

---

## What to check in the console

1. **REPEATER** – if `undefined`, the template is not seen as having a repeater (e.g. repeater inside a group and `template.elements` not flattened).
2. **FINAL RECORD** – must contain a key equal to **DATASET KEY** (e.g. `locations`) whose value is an array.
3. **DATASET LENGTH** – should equal the number of slots per label (e.g. 3).
4. **LAYOUT ITEMS** – should be > 0 for repeater templates; if 0 or very small, the repeater is not getting data or slots are 0.

If **FINAL RECORD** already has `locations: [...]` with the right length but **LAYOUT ITEMS** is still 0, the problem is in the layout engine (e.g. dataset key mismatch or repeater not found in the flattened elements). If **FINAL RECORD** has no dataset array, the problem is in **buildPageRecords** or in the template (repeater not found / wrong `template.elements`).
