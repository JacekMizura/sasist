# Rack label download – exact code path and fix

**Symptom:** Warehouse Designer → Rack → Download labels produces a PDF that cuts the label on the right; only the left part is visible. Template size is correct (e.g. 276 mm × 86 mm).

---

## 1. Exact file and function used for rack label download

| Step | File | Function / handler |
|------|------|--------------------|
| **UI button** | `frontend/src/components/warehouse/magazyn/MagazynRackDetailHeader.tsx` | Button "Pobierz etykiety" → `onClick={onShowLabelDownload}` |
| **Modal open** | `frontend/src/pages/WarehouseDesigner.tsx` | `onShowLabelDownload={() => setShowRackLabelDownload(true)}` → state; modal renders when `showRackLabelDownload && mainView === "magazyn" && selectedRackIdForSideView != null` |
| **Modal** | `frontend/src/components/labels/RackLabelDownloadModal.tsx` | `RackLabelDownloadModal` – button "Pobierz PDF" → `onClick={handleDownload}` |
| **PDF generation** | Same file | `handleDownload` (lines 71–122): builds chunks, calls `renderLabel(template, record)` per chunk → gets SVG strings → calls **`exportLabelsPdf(svgs, template.widthMm, template.heightMm, filename)`** |
| **PDF creation** | `frontend/src/utils/labels/exportLabelsPdf.ts` | **`exportLabelsPdf()`** – creates jsPDF, draws each SVG via **`drawSvgVector(pdf, calibratedSvg, 0, 0, wPt, hPt)`** (svg2pdf.js) or PNG fallback |

So the path is: **MagazynRackDetailHeader** ("Pobierz etykiety") → **WarehouseDesigner** (opens modal) → **RackLabelDownloadModal** ("Pobierz PDF" → **handleDownload**) → **exportLabelsPdf** → **drawSvgVector** (svg2pdf).

No backend API is used for this flow; PDF is built entirely in the browser with **jsPDF** and **svg2pdf.js**.

---

## 2. Code snippet that creates the PDF

**File:** `frontend/src/utils/labels/exportLabelsPdf.ts`

```ts
const wPt = widthMm * POINTS_PER_MM;
const hPt = heightMm * POINTS_PER_MM;
const pdf = new jsPDF({ unit: "pt", format: [wPt, hPt] });

for (let i = 0; i < svgs.length; i++) {
  if (i > 0) pdf.addPage([wPt, hPt]);
  const calibratedSvg = applyCalibration(svgs[i], printerProfile);

  if (VECTOR_PDF_ENABLED) {
    try {
      await drawSvgVector(pdf, calibratedSvg, 0, 0, wPt, hPt);
    } catch {
      const pngDataUrl = await svgToPngDataUrl(calibratedSvg, widthMm, heightMm);
      pdf.addImage(pngDataUrl, "PNG", 0, 0, wPt, hPt);
    }
  } else {
    // raster path
  }
}
```

**File:** `frontend/src/utils/labels/svgToPdfVector.ts` – SVG is drawn with:

```ts
await api.svg(svgElement, {
  x: 0,
  y: 0,
  width: widthMm,   // actually receives wPt from caller
  height: heightMm, // actually receives hPt from caller
});
```

So the PDF is created with **jsPDF** in **pt**, page size **format: [wPt, hPt]**, and each SVG is drawn at **(0, 0)** with size **(wPt, hPt)** via **svg2pdf**.

---

## 3. Page size used for the PDF

- **Intended:** 276 mm × 86 mm → **wPt ≈ 782.4**, **hPt ≈ 243.8** (with `POINTS_PER_MM = 2.83465`).
- **What’s passed:** `new jsPDF({ unit: "pt", format: [wPt, hPt] })` and `pdf.addPage([wPt, hPt])` with **no `orientation`**.
- **What jsPDF does:** With a custom **format** array and **no** `orientation`, jsPDF typically defaults to **portrait** (`'p'`). In portrait, the first number is treated as the **smaller** side (width) and the second as the **larger** (height). So for **[782, 244]** it can be interpreted as **width = 244 pt, height = 782 pt**, i.e. a **narrow, tall** page (~86 mm × 276 mm) instead of a wide strip (276 mm × 86 mm).
- **Result:** The **actual** page is **244 pt × 782 pt** (~86 mm × 276 mm). Content is still drawn in a **782 pt × 244 pt** box (full label size). So the right part of the drawing (from 244 pt to 782 pt) falls outside the page width and is **clipped** – only the **left part** of the label is visible.

So the page size **in code** is [wPt, hPt], but the **effective** page size is **swapped** because orientation is not set for a wide label.

---

## 4. Reason labels are cut (right side)

- For a **wide** template (e.g. 276 mm × 86 mm), **width > height**.
- **jsPDF** is called with `format: [wPt, hPt]` and **no `orientation`**.
- jsPDF defaults to **portrait**, so it treats the format as **[narrow, tall]** and builds a page of **244 pt × 782 pt** (86 mm × 276 mm).
- The label content is then drawn in a **782 pt × 244 pt** rectangle (correct full size in pt).
- The PDF page is only **244 pt** wide, so everything to the right of 244 pt is **clipped**.
- **Effect:** Only the left part of the label is visible; the right is cut off.

So the cut is not due to wrong mm→pt conversion or wrong draw size, but to **page orientation**: the custom format is effectively applied as portrait, swapping width and height for wide labels.

---

## 5. Minimal fix (do not implement yet)

**Fix:** When creating the PDF and when adding pages, pass **orientation** so the **[width, height]** array is not swapped for wide labels.

- In **`exportLabelsPdf.ts`**:
  - When creating the document, pass **orientation** derived from the label shape:
    - `orientation: widthMm > heightMm ? 'l' : 'p'`  
      (landscape when width > height, portrait otherwise).
  - Use the same **format** as now: `format: [wPt, hPt]` (with `unit: "pt"`).
  - When calling **`addPage`** for additional pages, pass the same dimensions **and** the same orientation (e.g. `pdf.addPage([wPt, hPt], widthMm > heightMm ? 'l' : 'p')` if the API supports it, or rely on the document’s default after the first page is set correctly).

**Concrete change (conceptual):**

```ts
// In exportLabelsPdf():
const wPt = widthMm * POINTS_PER_MM;
const hPt = heightMm * POINTS_PER_MM;
const orientation = widthMm > heightMm ? 'l' : 'p';  // landscape for wide labels
const pdf = new jsPDF({ unit: "pt", orientation, format: [wPt, hPt] });

for (let i = 0; i < svgs.length; i++) {
  if (i > 0) pdf.addPage([wPt, hPt], orientation);  // or the addPage variant that accepts orientation
  // ... rest unchanged
}
```

(Exact jsPDF API for `addPage` with custom size + orientation may need to be checked; the important part is that the **first** page is created with **orientation** so [wPt, hPt] is not swapped.)

**Optional:** Normalize `template.widthMm` and `template.heightMm` to numbers in **RackLabelDownloadModal** before calling `exportLabelsPdf` (e.g. `Number(template.widthMm) || 100`) so dimensions are never undefined or string.

**Debug logs (to confirm):**

- In **RackLabelDownloadModal** `handleDownload`, before `exportLabelsPdf`:
  - `console.log("Template size (mm):", template.widthMm, template.heightMm);`
- In **exportLabelsPdf**:
  - `console.log("Page size (pt):", wPt, hPt, "orientation:", widthMm > heightMm ? 'l' : 'p');`
  - After `new jsPDF(...)`:
  - `console.log("PDF page (getWidth/getHeight):", pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());`

Expected when the bug is present: template 276 × 86 mm, wPt ≈ 782, hPt ≈ 244, but `getWidth()`/`getHeight()` report ~244 and ~782 (swapped). After the fix, they should report ~782 and ~244 for a wide label.
