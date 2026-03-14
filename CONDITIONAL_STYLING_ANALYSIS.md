# Conditional styling in label templates – analysis

**Goal:** Allow template elements (e.g. rectangles) to change properties (fill, stroke, etc.) based on record values, e.g. different color per rack level. Feature must be **optional** so existing templates are unchanged.

**Conclusion:** Styling is today resolved **only from the template** in the layout phase; there is **no per-element conditional styling** in the frontend. The backend has **partial** support (value-based conditions for rect in `_draw_rectangle`), but the **main PDF path uses layout items**, which do not carry or apply conditions. The safest approach is to **evaluate conditions in the layout phase** (frontend and backend), output **resolved** properties on the layout item, and leave renderers unchanged. Adding an optional `conditions` array on elements is **safe** for existing templates.

---

## 1. How styling properties are currently resolved

### Frontend (`labelLayoutEngine.ts`)

- **`elementToLayoutItem(el, x0_mm, y0_mm, record)`** builds a single `LayoutItem` from a template element. Styling is taken **only from the element**:
  - **rect** (lines 245–253): `fill: rect.fill`, `strokeWidth: rect.strokeWidth ?? 0.5`. No use of `record`.
  - **section**: `borderWidth`, `backgroundColor`/`borderColor`/`textColor` from `base` (el).
  - **line**: `strokeWidth` from el.
  - **text/dynamicText**: only **content** is resolved from record via `resolveBinding(record, binding)`; `fontSize`, `fontFamily`, `bold`, `textColor` etc. come from the element.
- **`resolveBinding(record, binding)`** (59–68) is used for **text/barcode values** (and staticText placeholders), not for styling. It does not touch fill, stroke, or fontSize for shapes.
- **`computeLayout`** just calls `flattenElements(elements, record, ...)`; each leaf is passed through `elementToLayoutItem(el, x0, y0, record)`. So **fill, stroke, fontSize** are always the template values; they are **never** modified from the record in the frontend layout.

### Frontend renderer (`labelRenderer/`)

- **`renderRectangle(item)`** uses `item.fill ?? item.backgroundColor`, `item.borderColor`, `item.strokeWidth` from the **LayoutItem** only. No conditions or record.
- Other renderers (text, barcode, section, line, etc.) also use only layout item fields. So **all styling in the frontend is “layout item in → SVG out”**; no conditional logic in the renderer.

### Backend (`label_engine.py`)

- **Layout phase (`_compute_layout_items`):** For **rect** (307–309) the layout item is set as:
  - `item["fill"] = el.get("fill") or el.get("backgroundColor")`
  - `item["strokeWidth"] = ...`
  No `conditions` are read or applied here; the item gets the element’s default only.

- **Draw phase:** The **main PDF path** is `build_label_pdf_engine` → `render_label_to_canvas_engine` → **`compute_layout(layout, record, ...)`** → **`render_layout_items_to_canvas`** → **`_draw_layout_item(c, item, ...)`**. So drawing is from **layout items**, not from raw template elements.

- **`_draw_layout_item`** (751–822) builds a synthetic **`el`** from the **item** (no `conditions` on item), then calls `_draw_rectangle(c, el, data, ...)`. So `el` never has `"conditions"`; `_draw_rectangle` always takes the `else` branch and uses `el.get("fill")` etc. **Conditional styling in `_draw_rectangle` is never used on the main path.**

- **`_draw_rectangle`** (445–468) does have logic for `conditions`: if `el.get("conditions")` is set, it uses **`_resolve_color(binding, data, conditions, default)`**, which expects conditions as **`[ {"value": "1", "color": "#2ecc71"}, ... ]`** (compare `_resolve(data, binding)` to `cond["value"]`). So the backend has **value-match** conditions (binding value → color), not **expression-based** (`"if": "{level} == 1"`). That logic is only used when drawing from **template elements** (e.g. `render_elements`), which is **not** the path used by `build_label_pdf_engine`.

**Summary:** Styling is **template-only** in the frontend and in the backend layout. The backend has optional value-based conditions in `_draw_rectangle`, but the main PDF flow uses layout items and never passes conditions, so they have no effect there.

---

## 2. Whether conditional logic already exists

**Yes, in two forms:**

- **Visibility (visibleIf):** Both frontend and backend support **`visibleIf`** on elements:
  - Frontend: `flattenElements` (323–325) skips the element if `evaluateCondition(visibleIf, record)` is false.
  - Backend: `_compute_layout_items` (174–175) skips if `_evaluate_condition(visible_if, record)` is false.
  - Same expression format: `{field} == value`, `!=`, `>`, `<` (quoted string or number). So **expression evaluation** already exists for visibility.

- **Rect fill (backend only, value-match):** In **`_draw_rectangle`**, if the **template element** has `conditions`, **`_resolve_color(binding, data, conditions, default)`** is used: it resolves `binding` against `data`, then compares to each condition’s **`"value"`** and uses that condition’s **`"color"`**. Format is **not** expression-based (`"if": "{level} == 1"`); it is **value → color**. And as noted, this is **not** used on the main PDF path (layout → draw layout items).

There is **no** conditional styling in the **frontend** (no conditions for rect/section/line, etc.), and **no** expression-based conditions anywhere (only value-match in backend draw, and only when drawing from template elements).

---

## 3. Best place to evaluate conditions (frontend + backend)

**Recommendation: evaluate in the layout phase (A), not in the renderer (B).**

**A) In `computeLayout` / `_compute_layout_items` (preferred)**

- Layout has **record** and **element**; it can evaluate `conditions` and write **resolved** `fill`, `stroke`, etc. onto the **layout item**.
- Renderers (frontend SVG and backend `_draw_layout_item` → `_draw_rectangle`) then only see **final** values; they need no condition logic and no access to the record.
- **Consistency:** One place defines “what the label looks like” (layout). Frontend preview and backend PDF both use the same layout contract (flat list of items with resolved props), so they stay in sync.
- **Backend parity:** Backend already uses “layout → draw items” for PDF. If layout items carry resolved fill/stroke, existing `_draw_layout_item` + `_draw_rectangle` can stay as-is (they already use `item.fill` when drawing from layout item; the only change is that `item.fill` is now conditionally resolved in layout).

**B) In the renderer**

- Would require both SVG and PDF renderers to evaluate conditions and have access to the **record** (or a per-item record). Frontend renderer currently only receives `LayoutItem[]` and options (no record). So either the renderer contract changes (record passed in) or conditions would have to be stored on the layout item and evaluated in the renderer (duplicated logic in two renderers and risk of drift).

So **A (layout)** is the right place: one implementation in each layout engine (frontend + backend), same output shape, renderers unchanged.

---

## 4. Backend parity

- **Current backend:** Styling for rect is applied in two places:
  - **Layout:** `item["fill"] = el.get("fill") or el.get("backgroundColor")` (no conditions).
  - **Draw:** `_draw_rectangle(c, el, data, ...)` with `el` either from **template** (in `render_elements`) or from **layout item** (in `_draw_layout_item`). When from layout item, `el` has no `conditions`, so fill is taken from `el.get("fill")`.

- **Conditional styling can be added without breaking compatibility** by resolving conditions **in `_compute_layout_items`** when building the rect (or section, etc.) item:
  - If element has `conditions` (optional array), evaluate each condition’s `"if"` with `_evaluate_condition(cond["if"], record)`; on first match, apply that condition’s properties (e.g. `fill`, `stroke`) to the item and stop; otherwise use element defaults.
  - Output is still a flat list of layout items with scalar `fill`, `stroke`, etc. So `_draw_layout_item` and `_draw_rectangle` do not need to change; they already consume `item["fill"]`. No change to the draw path except that `item["fill"]` may now be conditionally chosen.
- The existing **value-match** logic in `_draw_rectangle` (and `_resolve_color`) can remain for any legacy path that passes template elements with the old `conditions` format; the **layout path** would use the new expression-based format and write resolved values into the item.

So backend parity is **possible**: implement expression-based conditions in **layout** (frontend and backend); keep renderers and the rest of the draw pipeline unchanged.

---

## 5. Template compatibility: adding optional `conditions`

- **Existing template:**  
  `{ "type": "rect", "x": 0, "y": 0, "width": 276, "height": 86, "fill": "#ffffff" }`  
  No `conditions` key.

- **New template:**  
  Same, plus optional `"conditions": [ { "if": "{level} == 1", "fill": "#2ecc71" }, ... ]`.

**Behavior:**

- **Layout (frontend and backend):** If `conditions` is **absent** or **falsy**, use the same logic as today: set `item.fill = el.fill` (or existing fallbacks). So behavior is **identical** to current.
- If `conditions` is present, iterate in order; first condition whose `"if"` expression is true wins; apply that entry’s properties (e.g. `fill`) to the item; if none match, use element defaults. No change to elements that don’t have `conditions`.

So **templates without `conditions` render exactly the same**. The new field is **additive and optional**.

---

## 6. Minimal architectural approach (do NOT implement yet)

1. **Contract**
   - Allow an optional **`conditions`** array on elements that support it (e.g. `rect`, and optionally `section`, `line`, later text).
   - Each entry: **`{ "if": "<expression>", "fill": "#hex?", "stroke": "#hex?", ... }`**. Same expression syntax as **visibleIf** (`{field} == value`, `!=`, `>`, `<`). First matching rule wins; if none match, use the element’s default properties.

2. **Where to implement**
   - **Frontend:** In **`elementToLayoutItem`** (in `labelLayoutEngine.ts`), for element types that support conditions (e.g. rect): if `el.conditions` is a non-empty array, loop over it, call existing **`evaluateCondition(cond.if, record)`**; on first true, overlay `cond.fill`, `cond.stroke`, etc. on the layout item (or base object), then break; if none match, keep element defaults. Output a **LayoutItem** with **resolved** `fill`, `stroke`, etc. only (no `conditions` on the item).
   - **Backend:** In **`_compute_layout_items`**, when building the item for rect (and any other supported type): if `el.get("conditions")` is present, loop and use **`_evaluate_condition(cond["if"], record)`**; first match: set `item["fill"] = cond.get("fill") or item["fill"]`, etc.; if none match, keep current defaults. Layout item again has only resolved values.

3. **Renderers**
   - **No change.** Frontend `renderRectangle(item)` keeps using `item.fill`, `item.borderColor`, `item.strokeWidth`. Backend `_draw_layout_item` already builds `el["fill"] = item.get("fill")` and passes to `_draw_rectangle`. So both continue to work with resolved values only.

4. **Types**
   - Add an optional **`conditions?: Array<{ if: string; fill?: string; stroke?: string; ... }>`** on the element types that support it (e.g. in `labelSystem.ts` for rect). Omit from LayoutItem; it is template-only.

5. **Backward compatibility**
   - Omit or empty `conditions` → current behavior. Existing templates unchanged.
   - Backend’s existing value-match `_resolve_color` in `_draw_rectangle` can stay for any code path that still passes raw template elements with the old format; the main path (layout → draw items) uses the new expression-based resolution in layout only.

This gives a minimal, safe way to support conditional styling: optional `conditions` on the element, evaluation in layout only, same layout output shape, and no renderer or template breakage.
