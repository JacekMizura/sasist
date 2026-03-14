# Label rendering pipeline – inconsistencies (Designer vs Print Queue vs PDF)

**Problem:** Inconsistent rendering between (1) Label Designer preview (correct), (2) Print queue preview thumbnails (incorrect), (3) Generated PDF (incorrect). Symptoms: template variables missing in print preview; background colors sometimes black in PDF; some templates (e.g. rack strip with repeater) produce empty PDFs.

**Conclusion:** The pipelines **diverge in (a) which record is passed, (b) which renderer is used for the queue preview, and (c) thermal mode and SVG→PDF conversion.** Black backgrounds are primarily from **thermal mode** forcing all fills to black. Empty rack-strip PDFs are likely from **backend** record shape or layout when using strip records.

---

## 1. Rendering pipeline for Designer preview

| Stage | Component | Function | Renderer / data |
|-------|------------|----------|------------------|
| Hook | `useLabelPreview` | `buildPreviewRecord(template)` | Record = `PREVIEW_SAMPLES[template_type]` + repeater datasets from `generatePreviewDataset(name)` |
| Layout | `renderLabel(template, previewRecord)` | `computeLayoutFromTemplate(sortedTemplate, record)` | Same layout engine as PDF |
| Render | `renderLabel` → `svgRenderer` | `r.render(items, { widthMm, heightMm })` | **SVG** (shared `labelRenderer`, `renderRectangle`, `renderText`, etc.) |
| Output | Designer canvas | `labelSvg` injected as `dangerouslySetInnerHTML` | One SVG string per template |

**Record shape (designer):** From `buildPreviewRecord` + `generatePreviewDataset`:
- **location:** `PREVIEW_SAMPLES.location` = `location_name`, `barcode_data`, `loc_barcode`, `"{loc_name}"`, `"{loc_barcode}"`, `"{zone}"`, etc. (no bare `loc_name`; binding resolves via `record["{loc_name}"]`).
- **Repeater:** `record[datasetName]` = array of 3 items (e.g. `locations`: `loc_name`, `location_name`, `barcode_data`, `"{loc_name}"` per item).

**Renderer:** **SVG only** – `renderLabel` → `computeLayoutFromTemplate` → `svgRenderer.render(items)` → SVG string.

---

## 2. Rendering pipeline for Print Queue preview

| Stage | Component | Function | Renderer / data |
|-------|------------|----------|------------------|
| Data | `LabelPrintQueue` | `getRecordsFromLayout(layout, selectionMode, ...)` (location) or `rackRecords` / `stripRecords` (rack / strip) | Real records from warehouse layout or API |
| Template | Same component | `locationPreviewTemplate` or `rackPreviewTemplate` from API (`/label-templates/:id`) | Saved template JSON, **not** the in-memory designer template |
| Layout | `LabelPreviewCard` | `computeLayoutFromTemplate({ ...template, elements }, record)` | **Same layout engine** as designer and PDF |
| Render | `LabelPreviewCard` | `layoutItems.map((item) => renderLayoutItem(item, scale, StatusIconPreview))` | **Custom React/DOM** – divs, inline SVG fragments, `BarcodeBlock`, **not** `renderLabel` / full SVG |

**Record shape (print queue):**
- **Location:** `getRecordsFromLayout` → each record has `location_name`, `location_code`, `barcode_data`, `level`, `position`, `rack_id`, `"{loc_name}"`, `"{loc_barcode}"`, `"{level_num}"`, etc. **No bare `loc_name`**; resolution uses `record["loc_name"] ?? record["{loc_name}"]`, so `"{loc_name}"` works.
- **Rack:** API `/labels/generate-rack` → `rackRecords` (one record per location).
- **Rack strip:** API `/labels/generate-rack-strip` → `stripRecords` (list of segment objects). Preview UI shows segment codes; **no** `LabelPreviewCard` with repeater template for strip (only a list of segment codes). So **strip has no thumbnail preview** using the same repeater layout as designer.

**Renderer:** **Not** `renderLabel`. Layout is shared (`computeLayoutFromTemplate`), but **drawing is custom React** in `LabelPreviewCard` (`renderLayoutItem`): absolute-positioned divs, small SVGs for rect/line, `BarcodeBlock` for barcodes. So fonts, alignment, and exact styling can differ from the designer SVG (e.g. no shared `renderText`/`renderRectangle` from `labelRenderer`).

---

## 3. Rendering pipeline for Generate PDF

| Stage | Component | Function | Renderer / data |
|-------|------------|----------|------------------|
| Location (preferred) | `LabelPrintQueue` | `handleGeneratePdf` → `api.post("/labels/render-pdf", { template_id, records })` | **Backend** (`label_render_service` → `label_engine`) – one page per record |
| Location (fallback) / Rack | Same | `generatePdfBlob(templateForPdf, records, thermalMode, profile)` | **Client:** `renderLabel(template, record, { thermal })` → SVG, then `drawSvgVector(pdf, calibratedSvg, ...)` or raster fallback |
| Rack strip download | Same | `handleDownloadRackStripPdf` → `api.post("/labels/render-pdf", { template_id, records: [stripRecord] })` with `stripRecord = { locations: stripRecords }` | **Backend only** – one page for the strip |
| Rack label download (modal) | `RackLabelDownloadModal` | `renderLabel(template, record)` per chunk → `exportLabelsPdf(svgs, ...)` | **Client:** same `renderLabel` + `exportLabelsPdf` (no thermal in modal) |

**Client PDF path (generatePdfBlob):**
1. For each record: `renderLabel(template, record, { thermal: _thermal })` → SVG (same layout + **svgRenderer** as designer; if `thermal` true, **applyThermalMode** runs and sets all `fill` / `textColor` / `borderColor` to black).
2. `applyCalibration(svg, printerProfile)` – wraps SVG content in `<g transform="translate(ox,oy) scale(s)">`.
3. `drawSvgVector(pdf, calibratedSvg, x0, y0, labelW, labelH)` – **svg2pdf.js** converts SVG to PDF vectors.
4. On exception: fallback to `svgToPngDataUrl` → `pdf.addImage(pngDataUrl, "PNG", ...)`.

**Record shape (PDF):** Same as print queue: location = `getRecordsFromLayout`; rack = `rackRecords`; strip (backend) = `[{ locations: stripRecords }]`.

---

## 4. Differences between pipelines

| Aspect | Designer preview | Print queue preview | Generated PDF |
|--------|------------------|---------------------|---------------|
| **Template** | Current in-memory template (designer state) | Saved template from API (by selected id) | Same as queue (saved template) or backend template by id |
| **Record** | `buildPreviewRecord(template)` – synthetic (PREVIEW_SAMPLES + repeater datasets) | Real data: `getRecordsFromLayout` / `rackRecords` / `stripRecords` | Same real data as queue |
| **Layout** | `computeLayoutFromTemplate(template, record)` | `computeLayoutFromTemplate(template, record)` | Same (client) or backend `compute_layout` (backend) |
| **Renderer** | **SVG** (`renderLabel` → `svgRenderer`) | **React/DOM** (`LabelPreviewCard` → `renderLayoutItem`) | **SVG** → **svg2pdf.js** (or PNG fallback) |
| **Thermal** | No | No | Yes when thermal mode on → **all fills/strokes set to black** |
| **Strip preview** | Repeater expanded with 3 sample items | No repeater card; only list of segment codes | Backend: one page with `record.locations` |

Main divergences:
1. **Queue preview does not use the same renderer as designer/PDF** – it uses custom React layout in `LabelPreviewCard`, so text/rect/barcode can look different and variables can appear to “not resolve” if the card’s rendering or data binding differs.
2. **Record source:** Designer uses synthetic preview record; queue and PDF use real records. If real records lack a key the template expects (e.g. only `"{loc_name}"` and not `loc_name`), resolution is still correct in layout because `resolveBinding` checks both; any “missing variables” in preview are more likely from the **preview renderer** (e.g. not passing resolved text the same way).
3. **Thermal mode (client PDF)** applies **after** layout and overwrites every item’s `fill`, `textColor`, `borderColor` to black → **background rects that should be white become black**.
4. **Rack strip:** No queue thumbnail that uses the repeater template; PDF is backend-only with `records: [{ locations: stripRecords }]`. Empty PDF can be backend (layout/draw) or record shape mismatch.

---

## 5. Root cause of black background bug

- **Primary cause:** **Thermal mode** in the client PDF path.  
  In `applyThermalMode` (used when `renderLabel(..., { thermal: true })`), **every** layout item is forced to:
  - `out.fill = BLACK`
  - `out.backgroundColor = BLACK`
  - `out.textColor = BLACK`
  - `out.borderColor = BLACK`  
  So background rectangles that are white (or any color) in the designer become **black** in the generated PDF whenever “thermal” is on. The designer and queue preview do **not** use thermal mode.

- **Secondary (possible):** **SVG fill and svg2pdf.js**  
  - Our rects use `fill="${item.fill}"`; if `item.fill` is missing we use `item.backgroundColor ?? "none"`. So we can output `fill="none"`.  
  - In SVG, `fill="none"` means no fill (transparent). Some PDF or svg2pdf behavior could treat missing/none fill as black; that would be a smaller factor than thermal mode.  
  - **Exact SVG element:** `<rect ... fill="#000000" .../>` when thermal is on (from `renderRectangle.ts` using `item.fill` after thermal overwrite). Without thermal, rects use `item.fill ?? item.backgroundColor ?? "none"`.

**Minimal fix (conceptual):** Do not set **background** fills to black in thermal mode (e.g. skip overwriting `fill`/`backgroundColor` for elements that are purely background, or introduce a “background” flag and only force foreground elements to black). Alternatively, allow a per-template or per-element override so background rects stay white in thermal mode.

---

## 6. Root cause of empty PDF bug (rack strip template)

- **Flow:** Rack strip PDF is generated **only on the backend**: `handleDownloadRackStripPdf` sends `records: [{ locations: stripRecords }]` to `POST /labels/render-pdf`. Backend does “one page per record”, so one page is produced for that single record. The template’s repeater uses `record.locations`; the backend layout engine should expand the repeater and produce many layout items for that page.

- **Why the PDF can be empty:**
  1. **Record shape mismatch:** Backend (and frontend) expect `record[datasetKey]` (e.g. `locations`) to be an array of **objects** with keys like `loc_name`, `location_name`, `barcode_data`. If `/labels/generate-rack-strip` returns a different shape (e.g. flat strings, or different key names), the repeater may get an empty list or wrong data and produce no (or wrong) items.
  2. **Empty `locations`:** If `stripRecords` is empty or not sent correctly (e.g. `records: [{}]`), then `record.locations` is empty, the repeater loop runs 0 times, and the page has only non-repeater elements (or none), leading to an effectively empty page.
  3. **Backend layout/draw bug:** Backend `compute_layout` or drawing might skip repeater items or fail for this template (e.g. wrong dataset key, or layout not producing items for repeater children).

- **Frontend client path:** `generatePdfBlob` is used for **location** (and basket, etc.) with **one record per label**. It is **not** used for rack strip download; rack strip uses the backend. So “empty PDF” for rack strip is **not** from `items.length === 0` in the frontend PDF step; it is from the **backend** returning a PDF with an empty or nearly empty page. Checking backend `compute_layout` and the expected shape of `stripRecords` (and that the template’s repeater `dataset` matches the key used in the record) would confirm the root cause.

**Minimal fix (conceptual):** Ensure the record sent to the backend for rack strip has the shape the backend layout expects: `{ locations: [ { loc_name, location_name, barcode_data, ... }, ... ] }`. Align `/labels/generate-rack-strip` output and backend repeater dataset key (e.g. `locations`). Add a guard or log when `record.locations` is missing or empty so the backend does not silently produce an empty page.

---

## 7. Minimal safe architectural fix (do NOT implement yet)

1. **Unify preview with designer/PDF renderer**  
   For print queue thumbnails, stop using a separate React renderer in `LabelPreviewCard`. Either:
   - Use **`renderLabel(template, record)`** to get the same SVG as the designer, then show that SVG in the card (e.g. `<img src={dataUrl(svg)} />` or inline SVG), or  
   - Keep using `computeLayoutFromTemplate` but feed the resulting **layout items** into the **same** SVG (or shared) rendering path used by `renderLabel`, so the preview is pixel-aligned with designer and PDF.  
   This removes the “incorrect” queue preview caused by a different renderer.

2. **Thermal mode and background rects**  
   Change **`applyThermalMode`** so it does not force **all** fills to black. For example:
   - Only set text, strokes, and “foreground” elements to black; leave `fill`/`backgroundColor` unchanged for rects/sections that are used as backgrounds, or  
   - Add a simple heuristic (e.g. rect with no stroke or first in z-order) or template hint so background rects stay white (or a light color) in thermal mode.  
   This fixes the “black background” in PDF when thermal is on.

3. **Record shape consistency**  
   - Ensure **getRecordsFromLayout** (and any other record builder) provides both `loc_name` and `"{loc_name}"` (and other bindings) if the layout engine or UI expects them, so all pipelines resolve variables the same way.  
   - For **rack strip**, document and enforce the contract: `records = [{ locations: [ { loc_name, location_name, barcode_data, ... } ] }]`; ensure backend and `/labels/generate-rack-strip` match it.  
   This reduces “missing variables” and empty strip PDFs.

4. **Rack strip empty PDF**  
   - On the **backend**, when building layout for a record that has a repeater, if `record[datasetKey]` is missing or empty, log or handle it explicitly instead of producing an empty page.  
   - Ensure **generate-rack-strip** returns segment objects with `loc_name`, `location_name`, `barcode_data` (and any keys the template’s repeater children bind to).  
   This fixes empty rack-strip PDFs when the record or dataset key is wrong.

5. **SVG → PDF (svg2pdf)**  
   - Ensure rects (and other shapes) never emit `fill="none"` when a visible background is intended; use explicit `fill="#ffffff"` for white backgrounds so svg2pdf does not interpret missing/none as black.  
   - Keep vector path as default; use raster fallback only on error.  
   This avoids secondary fill/black issues from the converter.

Implementing the above in this order (unify preview renderer, then thermal behavior, then record/shape and backend strip handling) addresses the three symptom groups (preview incorrect, PDF black background, empty strip PDF) without changing the overall architecture.
