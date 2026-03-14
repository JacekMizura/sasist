# Repeater templates – empty PDF investigation

**Problem:** Templates with a repeater (e.g. "3 locations per label") render correctly in preview but produce empty pages in PDFs. Single-label templates work.

**Conclusion:** The PDF pipeline passes **one record per label**, where each record is a **single location** (flat object). It does **not** include the **dataset array** (e.g. `record.locations`) that the repeater needs. The layout engine reads `record[rep.dataset]` → `record.locations` → **undefined**, so the repeater gets **zero items** and outputs no layout items for the repeated content. Preview works because it uses **buildPreviewRecord()**, which explicitly sets `record.locations = generatePreviewDataset("locations")` (an array).

---

## 1. Example record passed to renderLabel during PDF generation

**Source:** `generatePdfBlob()` in `LabelPrintQueue.tsx` is called with `records` from `getRecordsFromLayout(layout, ...)` (location mode). It iterates **one record per label** and calls `renderLabel(template, record, ...)`.

**Example record (one location):**

```js
{
  location_name: "A1-1-1",
  location_code: "A1-1-1",
  location_barcode: "A1-1-1",
  barcode_data: "A1-1-1",
  rack: "A1",
  rack_id: "A1",
  level: 2,
  position: 1,
  zone_name: "Magazyn",
  volume_capacity: 120,
  storage_type: "primary",
  aisle_letter: "A",
  rack_index: 1,
  isBottomLevel: false,
  "{loc_name}": "A1-1-1",
  "{loc_barcode}": "A1-1-1",
  "{rack_id}": "A1",
  "{level_num}": 2,
  "{bin_pos}": "1",
  "{zone_name}": "Magazyn",
  "{capacity_dm3}": 120
}
```

There is **no** `locations` (or other repeater dataset) key. The record describes **one** location, not a list of locations for one label.

---

## 2. Whether the record contains the dataset required by the repeater

**No.**

- The template has an element `type: "repeater"` with `dataset: "locations"` (or similar).
- The layout engine does:  
  `let items: unknown[] = (record[rep.dataset] as unknown[]) ?? [];`  
  i.e. `items = record.locations ?? []`.
- In the PDF path, `record` is a single-location object from `getRecordsFromLayout`. It has **no** `locations` property.
- So `record.locations` is **undefined**, and `items = []`. The repeater loop runs **0 times** and produces **no** layout items from the repeater.

So the record passed during PDF generation **does not** contain the dataset required by the repeater.

---

## 3. layoutItems length

- **Repeater template + PDF pipeline:** After `computeLayoutFromTemplate(sortedTemplate, record)`:
  - Non-repeater elements (e.g. a single background rect) still get layout items.
  - The repeater contributes **0** items because `record.locations` is undefined → `items.length === 0` in the repeater branch.
- So **layout items length** is **small** (e.g. 0 or 1–2): only non-repeater elements. If the template is mostly or entirely a repeater, the count is 0 or 1 (e.g. one rect), so the page looks **empty** or only a blank rectangle.

The temporary log added in `renderLabel.ts` is:

```ts
console.log("layout items", items.length);
```

Running "Generate PDF" with a repeater template will show a low number (e.g. 0 or 1) for each label, confirming the repeater produced no items.

---

## 4. Root cause of empty PDF

**Root cause:** Record shape mismatch between **preview** and **PDF** for repeater templates.

| Pipeline        | Record source              | Record shape for repeater |
|----------------|----------------------------|----------------------------|
| **Preview**    | `buildPreviewRecord(template)` | `record.locations = generatePreviewDataset("locations")` → **array of 3 items** (each with `loc_name`, `location_name`, `barcode_data`, etc.). So `record[rep.dataset]` is an array; repeater runs 3 times and produces many layout items. |
| **PDF**        | `getRecordsFromLayout(...)` → one record per label | Each `record` is a **single location** (flat keys only). **No** `record.locations`. So `record[rep.dataset]` is undefined → `[]` → repeater runs **0** times → **no** layout items from the repeater. |

So:

1. **Preview** builds a record that includes the repeater dataset (e.g. `record.locations`), so the repeater expands and the label looks correct.
2. **PDF** uses one flat record per label (one location per label) and never sets `record.locations`. The repeater therefore gets an empty list and adds nothing to the layout, so the PDF page is effectively empty (or only non-repeater content like one rect).

Single-label templates do not use a repeater; they only use fields like `record.location_name`, `record.barcode_data`, which exist on the flat record. So they work in both preview and PDF.

**Summary:** Empty repeater PDFs are caused by the PDF path passing **one record per label** with **no dataset array** (`record.locations`), while the repeater expects **one record per label** with **record.locations** (and optionally other dataset keys) set to an **array of items** for that label.

---

## Diagnostic logging added (temporary)

1. **LabelPrintQueue.tsx** (before `renderLabel` in `generatePdfBlob`):
   - `console.log("PDF record", record);`
   - `console.log("template elements", template.elements);`

2. **renderLabel.ts** (after `computeLayoutFromTemplate`):
   - `console.log("layout items", items.length);`

These confirm: (a) the record has no `locations` (or other repeater dataset), and (b) the layout item count is 0 or very low for repeater templates when generating PDF.

Remove or gate these logs once the fix is implemented.
