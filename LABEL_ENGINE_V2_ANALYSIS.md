# Label Engine v2 – Architecture Analysis Report

**Scope:** Analysis only. No code changes, refactors, or engine rewrites.

**Goal:** Determine how the current label engine can safely support v2 features (auto-fit text, dynamic font scaling, grid repeaters, conditional rendering, template variables, dataset transforms) while preserving frontend/backend parity and preview–PDF consistency.

---

## 1. Current Layout Engine Capabilities

### 1.1 How `computeLayout` Works

**Frontend** (`frontend/src/utils/labelLayoutEngine.ts`):

- **Entry:** `computeLayout(input)` and `computeLayoutFromTemplate(template, record)`.
- **Flow:** Single pass over `elements`; for each element either recurse (group/repeater) or convert to a **LayoutItem** and push to a flat list.
- **Output:** Array of `LayoutItem` with `id`, `type`, `x_mm`, `y_mm`, `width_mm`, `height_mm`, `rotation`, and type-specific fields (e.g. `text`, `fontSize`, `barcodeValue`). Coordinates in mm, origin top-left.

**Backend** (`backend/services/label_engine.py`):

- **Entry:** `compute_layout(layout, record, width_mm, height_mm)` with `layout["elements"]`.
- **Flow:** `_compute_layout_items(elements, record, …)` mirrors the frontend: for each element, handle group (recurse with offset), repeater (iterate items, recurse with advancing position), or build one layout item dict and append to `out`.
- **Output:** List of dicts with the same semantic fields (`x_mm`, `y_mm`, `width_mm`, `height_mm`, `type`, `text`, `fontSize`, etc.). Same coordinate system (mm, top-left).

Both engines are **deliberately aligned**: same recursion structure, same repeater positioning (horizontal vs vertical by `direction`), same group offset accumulation.

### 1.2 How Elements Are Flattened

- **Groups:** Not emitted as layout items. Origin is updated (`x0_mm + gx`, `y0_mm + gy`) and nested `elements` are flattened with that origin. No group box in the flat list.
- **Repeaters:** Not emitted. For each item in `record[dataset]`, nested template elements are flattened with current `(cx, cy)`; then `cx` or `cy` is advanced by `itemWidth` or `itemHeight` depending on `direction`.
- **All other elements:** Converted via `elementToLayoutItem` (frontend) or equivalent dict construction (backend) and appended. Bounds are clamped to label size (`min/max` so the item stays inside the label).

### 1.3 How Repeaters Are Expanded

- **Data source:** `record[rep.dataset]` (frontend) or `record.get(dataset_key)` (backend). Must be a list; if missing or not a list, treated as `[]`.
- **Per item:** Each list entry is used as the **record** for the repeater’s nested template. So bindings inside the repeater resolve from the item object (e.g. `item.product_name`).
- **Positioning:** Single row or column only. `direction === "vertical"` → advance `cy` by `itemHeight`; else advance `cx` by `itemWidth`. No wrapping, no grid.
- **Backend quirk:** If `dataset` is missing/empty, the repeater is skipped (no default dataset name in backend; frontend does not default).

### 1.4 Where Binding Resolution Happens

- **Frontend:** In `elementToLayoutItem`, when building a layout item:
  - **dynamicText:** `resolveBinding(record, el.binding)` → text stored on `LayoutItem.text`.
  - **barcode:** `resolveBarcodeValue(record, el.dataBinding)` (binding + fallback keys).
- **Backend:** In `_compute_layout_items`, when building the item dict:
  - Text: `_resolve(record, binding)` for dynamic/static text.
  - Barcode: `_resolve_barcode_value(record, binding)`.
- **Resolution rules:** Key can be bare (`product_name`) or braced (`{product_name}`). Lookup: `record[key]`, then `record[bare]` or `record["{bare}"]`. All resolution is from the **current record** (root or repeater item). No separate “template” or “global” context.

**Summary:** Layout is a single recursive flatten; bindings are resolved at layout time from the current record only; repeaters are linear (horizontal or vertical) only.

---

## 2. Text Rendering Capabilities and Limitations

### 2.1 Frontend (`frontend/src/labelRenderer/renderText.ts`)

- **Input:** A `LayoutItem` with `type === "text"` and fields `text`, `fontSize`, `fontFamily`, `bold`, alignment, `verticalAlign`, `verticalText`, `textColor`, and box `width_mm`, `height_mm`.
- **Size:** Font size is taken as-is from `item.fontSize` (default 10). Converted to a local “mm” size for SVG as `fontSize * 0.35` (approximate pt→mm).
- **Measurement:** There is **no** text measurement. No `measureText`, `getComputedTextLength`, or any width/height calculation. Text is drawn at full length; overflow is not detected or handled.
- **Clipping:** No clipping to the box; long text can extend beyond the element bounds in SVG.

### 2.2 Backend (`backend/services/label_engine.py`)

- **Paths:**
  - **Layout path:** `compute_layout` → `render_layout_items_to_canvas` → `_draw_layout_item`. For text, `_draw_text(c, el, data, …)` or `_draw_static_text_layout(c, item, …)` is called with the layout item’s resolved `text` and `fontSize`.
  - **Element path:** `render_elements` → `_draw_text` / static text block; same truncation logic.
- **Measurement:** ReportLab `stringWidth(val, font_name, font_size)` is used. Text is **truncated** to fit width: `while val and stringWidth(...) > w_pt: val = val[:-1]`. No shrinking of font size.
- **Result:** Backend avoids horizontal overflow by truncation; frontend does not. This is an **existing parity gap** (preview can show overflow where PDF does not).

### 2.3 Auto-Fit and Scale-To-Height Feasibility

- **Auto-fit (shrink font to fit box):**
  - **Backend:** Easy to add. `stringWidth` is available; a loop can reduce `fontSize` (with an optional minimum) until the text fits width (and optionally height if line count is considered). The computed `fontSize` can be stored on the layout item so the same value is used when drawing. No change to layout recursion; only to the place where text layout items are built and to the draw function if it reads fontSize from the item.
  - **Frontend:** No text measurement today. Options: (1) Use Canvas 2D `measureText()` in a hidden canvas or offscreen, or (2) approximate width with a shared formula (e.g. character-width heuristic). (1) gives correct behavior but depends on browser font metrics; (2) is faster but can diverge from backend. **Safe addition:** Implement auto-fit in the **layout phase** (both sides): compute a single `fontSize` and put it on the layout item; both renderers just use that. Parity then depends on using the same algorithm and, where possible, comparable metrics (backend: ReportLab; frontend: measureText or agreed heuristic).
- **Dynamic font scaling (e.g. scaleToHeight):** Same idea: compute a font size that makes text fill the available height (e.g. one line at max height). Again, best done in the layout phase and stored on the layout item so both engines only consume it. Backend can use font metrics; frontend needs measureText or equivalent for vertical metrics.

**Conclusion:** Auto-fit and scale-to-height are **possible without rewriting the engine**. They require: (1) extending the layout item with a computed `fontSize` (and possibly a “computed” flag), (2) implementing the same sizing algorithm in both layout engines, and (3) adding frontend text measurement (Canvas or heuristic) for parity. Risk: font metrics differ (ReportLab vs browser); testing and possibly a shared “safe” minimum step size will be important.

---

## 3. Repeater Architecture and Limitations

### 3.1 Current Repeater Behaviour

- **Positioning:** Linear only. One row (horizontal) or one column (vertical). `cx, cy` start at repeater `(x, y)`; after each item, either `cx += itemWidth` or `cy += itemHeight`.
- **No wrapping:** There is no logic to start a new row or column when the current row/column would exceed label bounds.
- **No grid:** No `columns` or `rows`; no `layout: "grid"`.

### 3.2 Grid Repeaters – Feasibility

- **Desired:** e.g. `layout: "grid"`, `columns: 5`, `itemWidth`, `itemHeight`; items wrap into rows.
- **Where to change:**
  - **Frontend:** In `flattenElements`, in the `el.type === "repeater"` branch. After resolving `items`, if `rep.layout === "grid"` (and e.g. `rep.columns` is set), compute `(cx, cy)` per item as: `col = i % columns`, `row = i // columns` → `cx = rep.x + col * itemWidth`, `cy = rep.y + row * itemHeight`. Then call `flattenElements(template, itemData, …)` with that `(cx, cy)`.
  - **Backend:** Same in `_compute_layout_items` for `el_type == "repeater"`: if grid, compute position by index and row/column; otherwise keep current linear behaviour.
- **Compatibility:** Existing templates do not set `layout: "grid"` or `columns`; they rely on `direction` and `itemWidth`/`itemHeight`. Adding a branch that only runs when `layout === "grid"` (and optionally `columns` is set) keeps existing behaviour unchanged. Default remains linear.

### 3.3 Parts of the Engine That Would Require Modification

- **Layout only:** Repeater expansion in both `labelLayoutEngine.ts` (repeater branch) and `label_engine.py` (`_compute_layout_items` repeater block). No change to `elementToLayoutItem` or to renderers, except that new positions are computed for grid.
- **Template/type system:** If the designer or API validates element schemas, repeater elements would allow optional `layout` and `columns` (and possibly `rows`). No change to binding resolution or to how datasets are read; only how **position** is derived from index.

**Conclusion:** Grid repeaters are a **localized, backward-compatible extension** of the repeater branch in both layout engines.

---

## 4. Conditional Rendering Feasibility

### 4.1 Can Elements Be Skipped During Layout?

Yes. Both engines already skip certain elements (groups and repeaters are not pushed as items; they only recurse). So “skip this element” is already a pattern: do not append an item for this element.

### 4.2 Where Condition Evaluation Could Be Inserted

- **Frontend:** In `flattenElements`, before calling `elementToLayoutItem` and pushing:
  - For non-group, non-repeater elements: if the element has e.g. `visibleIf: "{stock} == 0"`, evaluate the condition against the current `record`. If false, skip (don’t push). Evaluation can be a small expression parser (e.g. compare one binding to a literal or another binding) or a whitelist of simple predicates.
- **Backend:** In `_compute_layout_items`, same: before building and appending the layout item, if the element has `visibleIf`, evaluate against the current `record`; if false, `continue` (do not append).

### 4.3 Scope and Safety

- **Scope:** Condition is evaluated in the same place where the record is known (per-element, per repeater item). So “show only when stock is 0” is per record or per repeater row.
- **Expression language:** To keep parity and security, the expression language should be simple and identical on both sides (e.g. “binding op value” or a small safe subset). No arbitrary code.
- **Groups/repeaters:** Optional: `visibleIf` on a group could mean “skip entire subtree when false”. Same for repeater (skip whole repeater if condition false). Most useful is per-element visibility.

**Conclusion:** Conditional rendering is **feasible and safe**: add a single check before appending a layout item (and optionally at group/repeater level). No change to layout item shape or to renderers; only to the flatten loop and to a small, shared expression evaluator.

---

## 5. Variable Resolution Pipeline and Template Variables

### 5.1 How Bindings Are Resolved Today

- Single source: the **current record** (dict). Keys: bare or braced (`key` / `{key}`). No second context, no “template” scope, no globals.

### 5.2 Adding a Global (Template) Variable Context

- **Requirement:** e.g. `{warehouse_name}` resolved from a global/template context rather than (or in addition to) the per-record record.
- **Options:**
  1. **Merge before layout:** Caller (e.g. `build_label_pdf`, or frontend preview) merges a “template variables” object into each record (e.g. `record = { ...globals, ...record }`). Layout engine unchanged; bindings resolve as today. **Pros:** No engine change; **Cons:** Need to ensure repeaters don’t overwrite globals (e.g. pass merged only at root, and for repeater items use item-only or item-over-globals).
  2. **Two-tier context in layout:** Pass an optional `globalContext` (or `templateVariables`) into `computeLayout` / `compute_layout`. In `resolveBinding` / `_resolve`, if key is not in the current record, look in `globalContext`. **Pros:** Explicit separation of record vs template vars; **Cons:** Every call path must pass the extra context; repeater recursion must forward it.
- **Recommendation:** (1) is the **safest and smallest** change: service layer (or frontend) builds a record that already includes template-level variables; layout engines stay record-only. (2) is cleaner for API design (e.g. “variables” vs “record” in the payload) but touches both layout engines and all callers.

### 5.3 Feasibility

- **Without breaking compatibility:** Yes. Existing templates and records keep working. New behaviour: either records that already contain “global” keys (e.g. `warehouse_name` set once per job), or an explicit global context that is merged or consulted. No change to layout item structure.

**Conclusion:** Template variables are **feasible**. Prefer merging at the caller (or adding an optional second context and resolving record-first, then globals) so the layout engine stays simple.

---

## 6. Dataset Processing (Sort / Filter Before Repeater Expansion)

### 6.1 How Datasets Enter the Layout Engine

- Repeater reads `record[dataset]` (frontend) or `record.get(dataset_key)` (backend). The list is used as-is; no sorting or filtering.

### 6.2 Applying Sort/Filter Before Expansion

- **Where:** In the same repeater branch where `items` is obtained. After `items = record[rep.dataset] ?? []` (frontend) or `items = record.get(dataset_key)` (backend), apply:
  - **Filter:** e.g. `filter: "zone == 'A'"` → keep only items where `item.zone === 'A'` (or a small expression evaluator). Same expression language as `visibleIf` keeps parity.
  - **Sort:** e.g. `sortBy: "level"` → `items = [...items].sort((a,b) => ...)` (frontend) and equivalent in Python. Optional `sortOrder: "asc"|"desc"`.
- **Compatibility:** If `sortBy` / `filter` are absent, behaviour is unchanged. New optional properties only.

### 6.3 Implementation Points

- **Frontend:** `flattenElements`, repeater block: after `const items = ...`, if `rep.filter` then filter the array; if `rep.sortBy` then sort. Then iterate over the resulting list.
- **Backend:** Same in `_compute_layout_items`: after `items = ...`, apply filter then sort if specified.
- **Expression language:** Filter expressions (e.g. `zone == 'A'`) should be the same as for `visibleIf` (simple, safe, both engines).

**Conclusion:** Dataset transforms are **feasible** as a thin layer on top of the existing repeater data path; no change to binding resolution or to layout item structure.

---

## 7. Frontend / Backend Parity by Feature

| Feature | Possible without breaking compatibility? | Files to change | Safe for both engines? |
|--------|------------------------------------------|-----------------|------------------------|
| **Auto-fit text** | Yes (optional `autoFit` + optional `minFontSize`) | FE: `labelLayoutEngine.ts` (elementToLayoutItem / text branch), `renderText.ts` if any fallback; BE: `label_engine.py` (_compute_layout_items text branch, _draw_text / _draw_static_text_layout). Frontend needs text measurement (new util or Canvas). | Yes, if the same algorithm and comparable metrics are used; risk of minor font metric differences. |
| **Dynamic font scaling (scaleToHeight)** | Yes (optional flag on text elements) | Same as auto-fit: layout computes fontSize and stores on item; both renderers use it. | Same as auto-fit. |
| **Grid repeaters** | Yes (optional `layout: "grid"`, `columns`) | FE: `labelLayoutEngine.ts` (repeater branch in flattenElements). BE: `label_engine.py` (_compute_layout_items repeater block). | Yes; only positioning logic changes. |
| **Conditional rendering (visibleIf)** | Yes (optional `visibleIf` on elements) | FE: `labelLayoutEngine.ts` (flattenElements: evaluate condition before pushing). BE: `label_engine.py` (_compute_layout_items: evaluate before append). Shared: simple expression evaluator (or duplicate minimal logic). | Yes; both engines skip the same elements when condition is false. |
| **Template variables** | Yes (caller merges globals into record, or engine gets optional globalContext) | Option A: FE preview + BE `label_render_service` / callers (merge globals into record). Option B: FE `labelLayoutEngine.ts` resolveBinding + computeLayout input; BE `label_engine.py` _resolve + compute_layout input; all callers. | Yes; no change to layout item schema. |
| **Dataset transforms (sortBy, filter)** | Yes (optional on repeater) | FE: `labelLayoutEngine.ts` (repeater branch). BE: `label_engine.py` (_compute_layout_items repeater block). Shared expression semantics for filter. | Yes; same list is used for expansion on both sides. |

---

## 8. Risk Analysis

### 8.1 Features That May Break Preview/PDF Consistency

- **Auto-fit / scaleToHeight:** Font metrics differ (ReportLab vs browser). Same algorithm can still yield slightly different font sizes. **Mitigation:** Use a conservative minimum step, document “approximate” parity, and test with common fonts. Optionally, backend could be authoritative and send computed `fontSize` in layout item for frontend preview (heavy change).
- **Conditional rendering:** If the expression language is not identical (e.g. string comparison, null handling), some elements could show in preview but not in PDF or vice versa. **Mitigation:** Single shared spec and tests for the expression subset; ideally a shared (e.g. JS) expression implementation and a port to Python that passes the same tests.
- **Dataset filter/sort:** Same as above if filter is expression-based; and sort stability (e.g. equal values) must be defined so both engines order identically.

### 8.2 Features That Require Deep Engine Changes

- None of the proposed features require changing the core recursion (group/repeater/element) or the layout item contract. The deepest change is **text**: both layout engines must produce a **computed** fontSize for auto-fit/scaleToHeight, and frontend must gain text measurement. That is a contained extension, not a rewrite.

### 8.3 Features That Are Safe Extensions

- **Template variables (merge at caller):** No engine change; safe.
- **Grid repeaters:** Add a branch in the repeater block; existing behaviour unchanged.
- **Conditional rendering:** Add a single “if visible, append” check; no new layout item types.
- **Dataset sort/filter:** Add a step on the list before the existing loop; no change to how items are flattened.

---

## 9. Recommended Implementation Phases

### Phase 1 – Safe, Low-Risk Extensions

1. **Template variables**  
   - Provide template-level variables by merging a `variables` (or `globalContext`) object into the record before calling the layout engine (frontend preview and backend `build_label_pdf` / `render_label_template`). No layout code change; only caller and API contract.
2. **Conditional rendering (`visibleIf`)**  
   - Introduce a minimal expression language (e.g. `binding == value`, or whitelist of ops). In both engines, before appending a non-group/non-repeater element, evaluate `visibleIf` against the current record; if false, skip. Add tests for same visibility on FE and BE.
3. **Dataset sort (`sortBy` + optional `sortOrder`)**  
   - In both repeater branches, after reading the items list, if `sortBy` is set, sort the list (same key and order). No filter yet; keeps Phase 1 simple.

### Phase 2 – Moderate Complexity

4. **Dataset filter**  
   - Add optional `filter` on repeaters; same simple expression language as `visibleIf`. Apply after sort, before the position loop. Ensures FE and BE use the same expression semantics.
5. **Grid repeaters**  
   - Add `layout: "grid"` and `columns` (and optionally `rows`). In both engines, in the repeater block, compute (cx, cy) from index and grid dimensions when layout is grid; otherwise keep current linear behaviour. Designer/API can expose these fields.

### Phase 3 – Advanced (Text and Metrics)

6. **Auto-fit text**  
   - Add `autoFit` (and optional `minFontSize`) on text elements. In layout phase (both engines), when building a text layout item, if autoFit: compute fontSize so that text fits within width_mm (and height_mm if multi-line is considered). Store computed fontSize on the layout item. Backend already has `stringWidth`; frontend needs text measurement (Canvas `measureText` or a documented heuristic). Both renderers use the layout item’s fontSize as today.
7. **Dynamic font scaling (scaleToHeight)**  
   - Add `scaleToHeight` (or similar) on text elements. In layout phase, compute a single fontSize that fits the element height (e.g. one line filling height). Store on layout item; renderers unchanged. Same parity considerations as auto-fit.

This order keeps compatibility (all additions optional), avoids touching text measurement until Phase 3, and delivers “visibility + data shape” (conditionals, variables, sort/filter, grid) before “text sizing” (auto-fit, scaleToHeight).

---

**End of report.**
