# Rack label PDF page size / crop bug – analysis

**Symptom:** When downloading rack labels from Warehouse Designer → Rack → Download labels, the PDF shows only the left part of the label; the rest is cropped. Template is e.g. 276 mm × 86 mm but the PDF page appears smaller.

**Task:** Find why the page size does not match the template size. No code changes.

---

## 1. Exact code that sets PDF page size

### Backend (ReportLab) – used for API-driven label PDFs

**File:** `backend/services/label_engine.py`

**Where:** `build_label_pdf_engine()` (around lines 1102–1109).

```python
w_pt = width_mm * POINTS_PER_MM
h_pt = height_mm * POINTS_PER_MM
buf = io.BytesIO()
c = canvas.Canvas(buf, pagesize=(w_pt, h_pt))
```

- **Constant:** `POINTS_PER_MM = 2.83465` (line 31). Conversion is correct: 1 mm = 2.83465 pt.
- **Subsequent pages:** For `i > 0`, `c.showPage()` then `c.setPageSize((w_pt, h_pt))` (lines 1117–1118), so every page uses the same size.

**Call chain:**  
`label_render_service.build_label_pdf()` → `_normalize_template()` for `width`/`height` → `build_label_pdf_engine(layout, width, height, records, ...)`. So backend page size is set from template `widthMm` / `heightMm` in mm, converted to points, and is correct.

---

### Frontend (jsPDF) – used for “Rack → Download labels”

**File:** `frontend/src/utils/labels/exportLabelsPdf.ts`

**Where:** `exportLabelsPdf()` (lines 45 and 48).

```ts
const pdf = new jsPDF({ unit: "mm", format: [widthMm, heightMm] });
// ...
if (i > 0) pdf.addPage([widthMm, heightMm]);
```

- **Source of dimensions:** `RackLabelDownloadModal.tsx` (line 115):  
  `exportLabelsPdf(svgs, template.widthMm, template.heightMm, ...)`  
  with `template = JSON.parse(row.template_json)`. So `widthMm` and `heightMm` are whatever is at the top level of the saved template (e.g. 276 and 86).

So the only place that sets the **rack download** PDF page size is this jsPDF `format: [widthMm, heightMm]` with `unit: "mm"`. The backend is **not** used for the “Warehouse Designer → Rack → Download labels” flow; that flow is entirely client-side (SVG via `renderLabel` then PDF via `exportLabelsPdf`).

---

## 2. Template width/height example

- **Intended:** e.g. **276 mm × 86 mm** (wide strip).
- **Stored:** In `SavedLabelTemplate.template_json`, after parse: `template.widthMm === 276`, `template.heightMm === 86` (assuming the designer saved with these values at the top level).
- **Backend normalization:** `_normalize_template()` in `label_render_service.py` (lines 256–279) reads `widthMm` or `width_mm` (and same for height) and defaults to 100.0 / 60.0 only if missing. So if the template has 276 and 86, backend uses 276 and 86.

---

## 3. Page size actually used

- **Backend:** Page size in points is `(276 * 2.83465, 86 * 2.83465)` ≈ `(782.4, 243.8)` pt, i.e. 276 mm × 86 mm. Correct.
- **Frontend (rack download):**  
  - Intended: 276 mm × 86 mm.  
  - There are known issues (e.g. older jsPDF, or certain versions) where **custom `format` is interpreted in points instead of the given `unit`**.  
  - If jsPDF treats `format: [276, 86]` as **points** instead of mm:
    - Page size becomes **276 pt × 86 pt** ≈ **97.4 mm × 30.3 mm**.
  - Content is still drawn for the full label size (276 mm × 86 mm in mm, or equivalent in the SVG). So you get a 276 mm wide drawing on a ~97 mm wide page → **only the left portion is visible**; the rest is clipped. That matches “labels are cut off” and “only the left part of the label”.

So the **actual** page size in the bug scenario is likely **~97 mm × ~30 mm** (if format is taken as points), while the content is laid out for **276 mm × 86 mm**.

---

## 4. Reason why labels are cut off

- **Rack download** uses the **frontend-only** path: `RackLabelDownloadModal` → `renderLabel()` → SVGs → `exportLabelsPdf(svgs, template.widthMm, template.heightMm, ...)` → jsPDF with `format: [widthMm, heightMm]`, `unit: "mm"`.
- **Most likely cause:** jsPDF (or the way the custom format is applied) treats the **format array as points** even when `unit` is `"mm"`. So:
  - Page size becomes **276 pt × 86 pt** ≈ **97 mm × 30 mm**.
  - The label content is still generated for **276 mm × 86 mm**.
  - Result: the PDF page is too small and **only the left (and top) part of the label is visible**; the rest is cropped.
- **Secondary possibility:** If `template.widthMm` or `template.heightMm` were missing or wrong (e.g. undefined, or from a nested structure), a small or default page would also crop the content. With the current list API and designer save format, dimensions should be at the top level; if a different client or an old template shape is used, wrong dimensions could contribute.

So the **root cause** is the **PDF page size being too small** in the frontend path, most plausibly due to **custom format being interpreted in points instead of mm** (or an equivalent unit-handling bug in jsPDF/setup).

---

## 5. Minimal fix (do not implement yet)

**Option A – Frontend: force correct page size in points**

- Avoid relying on jsPDF’s `unit` for the **page** size. Compute page size in **points** and pass it explicitly:
  - `const PT_PER_MM = 2.83465;`
  - `const wPt = widthMm * PT_PER_MM;`
  - `const hPt = heightMm * PT_PER_MM;`
  - Create the document with **points** and that size:  
    `new jsPDF({ unit: "pt", format: [wPt, hPt] });`  
  - For `addPage`, use the same: `pdf.addPage([wPt, hPt]);`
  - When calling `drawSvgVector(pdf, svg, 0, 0, widthMm, heightMm)` (or `addImage`), ensure the plugin/method respects the current page and unit. If the API expects mm, keep passing mm for the **draw** call; the important change is that the **page** is created in pt with the correct dimensions so the physical page size is 276 mm × 86 mm regardless of jsPDF’s internal handling of `unit` and custom `format`.

**Option B – Use backend for rack label PDFs**

- For “Rack → Download labels”, call the backend instead of generating PDF in the browser:
  - Use `POST /labels/generate-rack` (or equivalent) to get records, then `POST /labels/render-pdf` with `template_id` and those records.
  - Backend uses ReportLab with `pagesize=(w_pt, h_pt)` and correct mm→pt conversion, so page size is correct and labels are not cropped.
  - Downside: requires network call and backend capacity; upside: single, correct implementation of page size and layout.

**Option C – Defensive frontend: normalize dimensions**

- Before calling jsPDF, ensure dimensions are numbers and come from the template used for layout:
  - `const w = Number(template.widthMm) || 100;`
  - `const h = Number(template.heightMm) || 60;`
  - Use `(w, h)` for both `renderLabel`/SVG and `exportLabelsPdf(svgs, w, h, ...)`.  
  This does not fix a format/unit bug but avoids wrong size when `widthMm`/`heightMm` are missing or non-numeric.

**Recommendation:** Apply **Option A** so the rack download PDF page size is set unambiguously in points (matching the backend’s conversion). If you want to avoid client-side PDF generation for rack labels, use **Option B** instead. Option C is a small extra safeguard in both cases.

---

## 6. Debug print example

To confirm page size and template dimensions at runtime:

**Frontend** (e.g. in `RackLabelDownloadModal` just before `exportLabelsPdf`, or inside `exportLabelsPdf`):

```ts
console.log("Template size (mm):", template.widthMm, "x", template.heightMm);
console.log("PDF page size (mm) passed to jsPDF format:", widthMm, "x", heightMm);
// After: pdf = new jsPDF(...)
console.log("jsPDF page size (getWidth/getHeight):", pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
```

**Backend** (e.g. in `build_label_pdf_engine` right after computing `w_pt`, `h_pt`):

```python
logger.info("Template size: width_mm=%s height_mm=%s", width_mm, height_mm)
logger.info("Canvas pagesize (pt): w_pt=%s h_pt=%s", w_pt, h_pt)
```

**Expected when the bug occurs (frontend):**  
Template size 276 × 86 mm, but `pageSize.getWidth()` / `getHeight()` in the same units as the internal rep (often pt) ≈ 782 and 244 (pt) if correct, or ≈ 276 and 86 if incorrectly left in “pt” as width/height (i.e. 276 pt × 86 pt → small page).
