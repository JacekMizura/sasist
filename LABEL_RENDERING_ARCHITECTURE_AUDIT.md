# Label rendering system – full architectural audit

Analysis only. No code changes. Purpose: identify every rendering path and how they differ before making changes.

---

## STEP 1 — All render entry points

### Frontend

| File | Function | Output type | Who calls it |
|------|----------|-------------|--------------|
| `frontend/src/labelRenderer/renderLabel.ts` | `renderLabel(template, data, options?)` | **SVG** (string) | useLabelPreview, LabelPreviewCard, TemplatePreview, RackLabelDownloadModal, generatePdfBlob |
| `frontend/src/utils/labelLayoutEngine.ts` | `computeLayoutFromTemplate(template, record)` | **LayoutItem[]** (in-memory) | renderLabel only (internal) |
| `frontend/src/labelRenderer/svgRenderer.ts` | `svgRenderer.render(items, options)` | **SVG** (string) | renderLabel (default renderer) |
| `frontend/src/pages/LabelSystem/LabelPrintQueue.tsx` | `generatePdfBlob(template, records, thermal, profile)` | **PDF** (Blob) | handleGeneratePdf, getLocationLabelPdfBlob, handlePrint (fallback), basket/strip flows |
| `frontend/src/pages/LabelSystem/LabelPreviewCard.tsx` | `LabelPreviewCard` (uses renderLabel → SVG) | **React + SVG** (preview card) | LabelPrintQueue (location + rack preview grids) |
| `frontend/src/utils/labels/exportLabelsPdf.ts` | `exportLabelsPdf(svgs, widthMm, heightMm, filename, profile)` | **PDF** (download) | RackLabelDownloadModal |
| `frontend/src/utils/labels/svgToPdfVector.ts` | `drawSvgVector(pdf, svgString, x, y, w, h)` | **PDF** (writes into jsPDF) | exportLabelsPdf, generatePdfBlob |

### Backend

| File | Function | Output type | Who calls it |
|------|----------|-------------|--------------|
| `backend/services/label_render_service.py` | `render_label_template(db, template_id, data, tenant_id, …)` | **PDF** (bytes) | api/labels.py (render-pdf, product, cart), warehouse_layout_service |
| `backend/services/label_render_service.py` | `build_label_pdf(template, records, …)` | **PDF** (bytes) | render_label_template, build_label_pdf_multi; cart_service |
| `backend/services/label_engine.py` | `build_label_pdf_engine(layout_json, width_mm, height_mm, records, …)` | **PDF** (bytes) | label_render_service.build_label_pdf |
| `backend/services/label_engine.py` | `compute_layout(layout, record, width_mm, height_mm)` | **list[dict]** (layout items) | render_label_to_canvas_engine, _render_elements_svg (SVG path) |
| `backend/services/label_engine.py` | `render_label_to_canvas_engine(c, layout, record, …)` | **Canvas** (ReportLab) | build_label_pdf_engine (per record) |
| `backend/services/label_engine.py` | `_compute_layout_items(elements, record, …)` | **out: list[dict]** (layout items) | compute_layout only (internal) |

### Summary: what produces what

- **SVG:** `renderLabel` → `svgRenderer` (frontend only).
- **React preview:** `LabelPreviewCard` → `renderLabel` → SVG injected into DOM (same pipeline as designer).
- **PDF (client):** `generatePdfBlob` → `renderLabel` → SVG → `drawSvgVector` (svg2pdf) or PNG fallback; or `exportLabelsPdf` (RackLabelDownloadModal) same SVG→PDF.
- **PDF (backend):** `render_label_template` → `build_label_pdf` → `build_label_pdf_engine` → `compute_layout` → `render_label_to_canvas_engine` → ReportLab canvas.

---

## STEP 2 — Rendering pipelines (table)

### Designer preview

```
Template (in-memory)
  → useLabelPreview: buildPreviewRecord(template)  → record
  → renderLabel(template, previewRecord)
  → computeLayoutFromTemplate (frontend labelLayoutEngine)
  → svgRenderer.render(items)
  → SVG string
  → Injected into LabelCanvas (dangerouslySetInnerHTML)
```

**Output:** SVG in designer canvas.

---

### Print Queue preview

```
Template (from API: locationPreviewTemplate / rackPreviewTemplate)
  → Record (getRecordsFromLayout or rackRecords – one per card)
  → LabelPreviewCard({ template, record })
  → renderLabel(fullTemplate, record)
  → computeLayoutFromTemplate (frontend labelLayoutEngine)
  → svgRenderer.render(items)
  → SVG string
  → Scaled and displayed in card (img/embed or inline SVG)
```

**Output:** SVG inside React preview cards. Same layout + renderer as designer; only record source differs.

---

### Print Queue Generate PDF

**Path A – Backend (location, preferred):**

```
Template (from API by template_id)
  → buildRecordsForBackendRenderPdf(template, records)  → records with [datasetKey]: [...]
  → POST /labels/render-pdf { template_id, records }
  → render_label_template
  → build_label_pdf
  → build_label_pdf_engine(layout, width, height, records)
  → For each record: compute_layout(layout, record, …)  (backend label_engine)
  → render_label_to_canvas_engine(c, layout, record, …)
  → _draw_layout_item (ReportLab)
  → PDF bytes
```

**Path B – Client (fallback or when backend not used):**

```
Template (locationPreviewTemplate or template)
  → buildPageRecords(template, records)  → pageRecords with [datasetKey]: [...]
  → generatePdfBlob(template, pageRecords, …)
  → For each record: renderLabel(template, record, { thermal })
  → computeLayoutFromTemplate (frontend) → svgRenderer → SVG
  → applyCalibration → drawSvgVector (svg2pdf) or PNG fallback
  → jsPDF → Blob
```

**Output:** PDF (backend ReportLab or client jsPDF + svg2pdf/PNG).

---

### Warehouse → Rack label download

```
Template (from API by selected template)
  → effectiveLocations / getRackLocations(rack)
  → Chunk by capacity; for each chunk: record = { [datasetKey]: datasetItems, loc_name, … }
  → renderLabel(template, record)  (frontend)
  → computeLayoutFromTemplate (frontend labelLayoutEngine)
  → svgRenderer.render(items)
  → SVG string per label
  → exportLabelsPdf(svgs, widthMm, heightMm, filename)
  → jsPDF + drawSvgVector (or raster) per SVG
  → PDF download
```

**Output:** PDF (client-only; same frontend layout + SVG → jsPDF).

---

## STEP 3 — Layout engines (frontend vs backend)

### Locations

- **Frontend:** `frontend/src/utils/labelLayoutEngine.ts`
  - `computeLayoutFromTemplate(template, record)` → `computeLayout({ elements, record, … })` → `flattenElements(elements, record, …)`.
  - Repeater: `items = (record[rep.dataset] as unknown[]) ?? []`; loop over items; per item `itemData = { ...item }`; call `flattenElements(template, itemData, …)`.
  - Binding: `resolveBinding(record, binding)` → `record[key]`, `record[bare]`, `record["{bare}"]`.
  - Transform: no explicit “transform” object; position (x_mm, y_mm) and rotation on each LayoutItem.

- **Backend:** `backend/services/label_engine.py`
  - `compute_layout(layout, record, width_mm, height_mm)` → `_compute_layout_items(elements, record, …)`.
  - Repeater: `items = list(record.get(dataset_key) or [])`; if not list, `items = []`; loop over items; `child_record = {**record, **item_data}`; call `_compute_layout_items(nested, child_record, …)`.
  - Binding: `_resolve(data, key)` → `data.get(key)`, and if key is `{x}` then `data.get(x)`.
  - Transform: rotation stored on layout item; applied in `_draw_layout_item` via `_apply_rotation` (translate to center, rotate, translate back).

### Comparison

| Aspect | Frontend | Backend |
|--------|----------|---------|
| Repeater dataset | `record[rep.dataset] ?? []` | `record.get(dataset_key) or []`; then `items = []` if not list |
| Repeater child record | `itemData = { ...item }` only | `child_record = {**record, **item_data}` (merge with parent) |
| Binding | `record[key]`, `record[bare]`, `record["{bare}"]` | `data.get(key)`, `data.get(bare)` for `{bare}` |
| visibleIf | `evaluateCondition(visibleIf, record)` | `_evaluate_condition(visible_if, record)` (same expression style) |
| Output shape | LayoutItem[] (typed) | list[dict] (same logical fields: x_mm, y_mm, width_mm, height_mm, type, text, fill, …) |

Both engines flatten repeaters into a single list of layout items; no nested “repeater” in the output. Repeater logic is equivalent; backend merges parent record into child record, frontend uses only item. Binding and visibleIf are aligned. So layout structures are intended to be identical; any divergence is from record shape (e.g. missing dataset on backend for some callers) or from renderer differences, not from a different layout algorithm.

---

## STEP 4 — Renderer differences

### 1. svgRenderer (frontend)

- **Rotation:** `wrapElement`: `transform="translate(x,y) rotate(-rot, cx, cy)"` (center of element).
- **Transforms:** Only translate + rotate per element; no scale in transform (size via width/height).
- **Barcode:** `renderBarcode(item)` → SVG group with rects/paths (or external lib); uses item.width_mm, item.height_mm, item.barcodeValue.
- **Repeaters:** Repeaters are **flattened** in layout; renderer receives flat LayoutItem[] only.

### 2. LabelPreviewCard (frontend)

- **Implementation:** Calls `renderLabel(template, record)` and displays the returned **SVG** in a scaled container. No separate “React renderer”; it is **same pipeline as designer** (renderLabel → svgRenderer).
- So rotation, transforms, barcodes, repeaters: same as svgRenderer.

### 3. svg2pdf (frontend, client PDF)

- **Rotation:** Inherited from SVG (e.g. `transform="rotate(...)"`). svg2pdf.js parses SVG and draws paths/shapes; rotation is in the SVG.
- **Transforms:** All SVG transforms are in the DOM; svg2pdf interprets them (known issues with some edge cases, e.g. fill="none", external CSS).
- **Barcode:** Rendered as SVG by svgRenderer; then svg2pdf draws that SVG into PDF (vector or raster depending on path).
- **Repeaters:** Already flattened in layout; SVG contains only flat elements.

### 4. ReportLab canvas (backend)

- **Rotation:** `_apply_rotation`: translate to element center, `c.rotate(-angle)`, translate back; applied in `_draw_layout_item` before drawing.
- **Transforms:** No SVG; position and size from layout item; rotation applied explicitly.
- **Barcode:** `_draw_barcode_layout` / Code128 etc. drawn with ReportLab; uses item dimensions and barcodeValue.
- **Repeaters:** Flattened in `compute_layout`; `_draw_layout_item` receives flat list.

### Summary

- All paths use **flattened** layout (repeaters expanded before rendering).
- Frontend SVG and backend ReportLab both apply rotation around element center; semantics match.
- Layout distortions in Print Queue PDF are more likely from (1) record/dataset shape differing between backend and client, (2) client thermal mode or calibration, or (3) svg2pdf behavior (e.g. coordinate system, fill) than from a different “repeater vs flattened” model.

---

## STEP 5 — Data pipelines (record structure)

| Workflow | Record source | Repeater dataset in record? | Example shape |
|----------|----------------|-----------------------------|---------------|
| **Designer preview** | `buildPreviewRecord(template)` | Yes. `record[datasetName] = generatePreviewDataset(name)` (e.g. `locations`: 3 items). | `{ location_name, barcode_data, …, locations: [ {...}, {...}, {...} ] }` |
| **Print Queue preview** | `getRecordsFromLayout` or `rackRecords` | No. One record per card; flat (location_name, barcode_data, …). | `{ location_name, barcode_data, … }` (no `locations`) |
| **Print Queue PDF (backend)** | `buildRecordsForBackendRenderPdf(template, records)` | Yes. Same as RackLabelDownloadModal: chunk + `[datasetKey]: datasetItems`. | `{ loc_name, locations: [ {...}, {...}, {...} ], … }` |
| **Print Queue PDF (client)** | `buildPageRecords(template, records)` | Yes. `buildRecordsLikeRackLabelModal` → `[datasetKey]: datasetItems`. | Same as above. |
| **Rack label download** | Built in modal: chunk → `record = { [datasetKey]: datasetItems, loc_name, … }` | Yes. | `{ locations: [ {...}, {...}, {...} ], loc_name, … }` |

- **Designer:** Always has dataset array (synthetic).
- **Print Queue preview:** Uses **one record per card** (flat); no dataset array, so **repeater templates show only first slot or wrong count** unless the UI passes something else (current code passes same records as grid).
- **Print Queue PDF:** Backend and client both build **dataset records** via `buildRecordsForBackendRenderPdf` / `buildPageRecords` (same shape as rack modal).
- **Rack download:** Builds dataset records explicitly; works.

So the only pipeline that does **not** guarantee a repeater dataset for repeater templates is **Print Queue preview** (flat record per card). PDF and Rack download do pass dataset when the frontend uses the build helpers.

---

## STEP 6 — Source of truth (most reliable pipeline)

From behavior and code:

- **Rack label download (Warehouse)** uses:
  - **Frontend** layout engine (`computeLayoutFromTemplate`).
  - **Frontend** svgRenderer.
  - **Frontend** export (jsPDF + drawSvgVector or raster).
  - Record built with **explicit** `[datasetKey]: datasetItems` in the modal.

So the “correct” layout and look are defined by:

**Frontend: template → labelLayoutEngine → svgRenderer → SVG.**

The backend pipeline (template → label_engine.compute_layout → ReportLab) is **intended** to match (same schema, same repeater expansion). If backend receives the **same** record shape (with dataset array), it should produce the same logical layout. The most reliable end-to-end path that users report as “works correctly” is **Rack label download**, which is **100% frontend**: same layout engine + same SVG renderer + same record shape. So the **source of truth** for “correct” layout is the **frontend layout engine + svgRenderer**. The backend is a second implementation that must be fed the same record shape and kept in sync with frontend layout semantics.

---

## STEP 7 — Architecture diagram (all pipelines)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ TEMPLATE (JSON: elements, widthMm, heightMm)                                     │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                               ▼
┌─────────────────┐         ┌─────────────────────┐         ┌─────────────────────┐
│ Designer        │         │ Print Queue         │         │ Rack label download │
│ buildPreview    │         │ getRecordsFromLayout│         │ Chunk + dataset     │
│ Record()        │         │ or buildPageRecords  │         │ in modal            │
└────────┬────────┘         └──────────┬──────────┘         └──────────┬──────────┘
         │                             │                               │
         ▼                             ▼                               ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ LAYOUT ENGINE                                                                     │
│ • Frontend: labelLayoutEngine.ts → computeLayoutFromTemplate → flattenElements   │
│ • Backend:  label_engine.py → compute_layout → _compute_layout_items              │
└─────────────────────────────────────────────────────────────────────────────────┘
         │                             │                               │
         ▼                             ▼                               ▼
┌─────────────────┐         ┌─────────────────────┐         ┌─────────────────────┐
│ RENDERER        │         │ RENDERER            │         │ RENDERER            │
│ svgRenderer     │         │ (A) Backend:         │         │ svgRenderer         │
│                 │         │   ReportLab canvas   │         │                     │
│                 │         │ (B) Client:          │         │                     │
│                 │         │   svgRenderer → SVG  │         │                     │
└────────┬────────┘         └──────────┬──────────┘         └──────────┬──────────┘
         │                             │                               │
         ▼                             ▼                               ▼
┌─────────────────┐         ┌─────────────────────┐         ┌─────────────────────┐
│ OUTPUT          │         │ OUTPUT               │         │ OUTPUT               │
│ SVG → Designer  │         │ (A) PDF (backend)    │         │ SVG → exportLabelsPdf│
│ canvas          │         │ (B) PDF (client      │         │ → PDF download       │
│                 │         │     jsPDF+svg2pdf)   │         │                      │
└─────────────────┘         └─────────────────────┘         └─────────────────────┘

Print Queue PREVIEW: same as Designer path (renderLabel → svgRenderer → SVG) with record per card.
```

Side-by-side:

| Pipeline              | Template source | Record builder              | Layout engine   | Renderer        | Output   |
|-----------------------|----------------|-----------------------------|-----------------|-----------------|----------|
| Designer preview      | In-memory      | buildPreviewRecord          | Frontend        | svgRenderer     | SVG      |
| Print Queue preview   | API            | getRecordsFromLayout / rack | Frontend        | svgRenderer     | SVG      |
| Print Queue PDF (BE)   | API            | buildRecordsForBackendRenderPdf | Backend    | ReportLab       | PDF      |
| Print Queue PDF (FE)   | API / state   | buildPageRecords            | Frontend        | svgRenderer→svg2pdf | PDF  |
| Rack label download   | API            | In-modal chunk + dataset    | Frontend        | svgRenderer→export | PDF  |

---

## STEP 8 — Risk assessment

| Component | Safe to remove? | Safe to unify? | Notes |
|-----------|------------------|----------------|-------|
| **Rack label download** | No | Yes (with care) | Only path that is 100% frontend; users rely on it. Unify record building with Print Queue so backend receives same shape. |
| **Template designer** | No | N/A | Required for editing; preview must stay in sync with PDF. |
| **Conditional styling** | Optional feature | Yes | Backend already has conditions for rect; frontend added in layout. Unify condition format and evaluation. |
| **Repeaters** | No | Yes | Core feature. Unify: (1) record shape (dataset array) in all call paths, (2) keep single layout contract (flattened items). |
| **Barcode rendering** | No | Yes | Frontend (svgRenderer + lib) and backend (ReportLab) must stay equivalent; same data (barcodeValue), same size. |
| **Backend layout engine** | No (needed for API PDF) | Yes | Keep for POST /labels/render-pdf, product/cart labels, warehouse. Unify with frontend: same record contract, same repeater/binding rules. |
| **Client PDF (generatePdfBlob)** | No (fallback) | Yes | Same layout + SVG as designer; only export step differs. Unify record building with backend (buildRecordsForBackendRenderPdf / buildPageRecords). |
| **svg2pdf vs ReportLab** | Keep both for now | Hard | Two PDF implementations; unifying would mean either backend-only PDF (no client fallback) or client-only (no server-side PDF). Lower risk: fix record shape and layout parity so both paths produce same content. |
| **Print Queue preview cards** | No | Yes | Already use renderLabel → SVG; same as designer. Risk: record per card is flat; for repeater templates, preview could show wrong count. Optional: pass built page records to preview when template has repeater. |

**Summary:** Do not remove rack download, designer, repeaters, or barcode rendering. Unifying record building (dataset records for repeaters) across backend, client PDF, and optionally preview is safe and recommended. Unifying the two layout engines into one (e.g. backend calls frontend logic) would be a larger change; keeping both but aligning contract and behavior is lower risk.

---

*End of audit. No implementations changed.*
