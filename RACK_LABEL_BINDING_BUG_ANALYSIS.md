# Rack label variable binding bug – analysis

**Symptom:** PDF shows `{{loc_name}}` instead of resolved values (e.g. `A-01-02-03`).

**Task:** Analyse where binding fails. No code changes.

---

## 1. Example template_json text element

The template can store text in two ways:

**Dynamic text (binding resolved from record):**
```json
{
  "id": "...",
  "type": "dynamicText",
  "x": 2,
  "y": 2,
  "width": 40,
  "height": 8,
  "binding": "{loc_name}",
  "fontSize": 10,
  "align": "left"
}
```
- Backend expects `binding` or `dataBinding` (e.g. `"loc_name"` or `"{loc_name}"`).
- No `text` field is used for resolution; resolution uses `binding` only.

**Static text (no resolution, drawn as-is):**
```json
{
  "id": "...",
  "type": "staticText",
  "x": 2,
  "y": 2,
  "width": 40,
  "height": 8,
  "text": "{{loc_name}}",
  "fontSize": 10,
  "align": "left"
}
```
- Backend uses `el.get("text")` and draws it literally.
- If `text` is `"{{loc_name}}"`, the PDF will show exactly that.

**Conclusion:** The format that causes the bug is **staticText with `"text": "{{loc_name}}"`**. The engine does not support `{{variable}}` in static text; only **dynamicText** with **binding** is resolved. Single-brace `{loc_name}` is the supported binding format in the codebase; double-brace `{{loc_name}}` is not treated as a variable in static text.

---

## 2. Example dataset record

Rack records from `generate_rack_locations()` (and `generate_rack_strip()`) already contain the right keys:

**From `backend/services/rack_label_generator.py`:**
```python
record = {
    "loc_name": loc_name,           # e.g. "A-1-1"
    "loc_barcode": loc_name,
    "location_name": loc_name,
    "level": level,
    "position": position,
    "barcode_data": loc_name,
    "{loc_name}": loc_name,
    "{loc_barcode}": loc_name,
}
# + zone_name / {zone} if zone given
```

So `loc_name`, `location_name`, `barcode_data`, and `{loc_name}` are all present.  
`_normalize_record_for_bindings()` in `label_render_service.py` also fills `loc_name` from `location_name` or `location_code` when missing. So the **dataset record is not the cause** of the bug.

---

## 3. Code responsible for binding

**Backend layout (where text is resolved):**  
`backend/services/label_engine.py` – `_compute_layout_items()`:

- **Lines 259–262 (dynamic text):**
  - `binding = el.get("binding") or el.get("dataBinding") or ""`
  - `item["text"] = _resolve(record, binding) or ""`
  - Only runs when `el_type in ("text", "dynamictext")`.

- **Lines 267–268 (static text):**
  - `item["text"] = el.get("text") or ""`
  - No lookup; text is used as-is. Runs when `el_type == "statictext"`.

**Resolution helper:**  
`_resolve(data, key)` in `label_engine.py` (lines 40–53):

- Tries `data.get(key)`.
- If `key` is single-brace, strips braces and tries `data.get(key[1:-1].strip())`.
- Supports `"loc_name"` and `"{loc_name}"`. For `"{{loc_name}}"`, `key[1:-1]` is `"{loc_name}"`, so it would use `data.get("{loc_name}")`, which rack records provide. So **if** the element were dynamicText with `binding: "{{loc_name}}"`, it would resolve. The bug is not `_resolve` failing for double braces; it is that **static text never goes through `_resolve`**.

**Normalization (record shape for bindings):**  
`backend/services/label_render_service.py` – `_normalize_record_for_bindings()` (lines 390–434):

- Adds `loc_name` / `{loc_name}` from `location_name` or `location_code` when missing.
- Does not change how the template specifies binding (dynamic vs static).

So the code that “does” binding is: **`_compute_layout_items()`** for **text/dynamicText** only, using **`el.get("binding") or el.get("dataBinding")`** and **`_resolve(record, binding)`**. Static text never uses binding.

---

## 4. Exact reason variables appear as `{{loc_name}}` instead of resolved values

The PDF shows the literal `{{loc_name}}` because:

1. The failing element in `template_json` is stored as **`type: "staticText"`** (or `"staticText"` which is lowercased to `"statictext"` in the engine).
2. Its content is in **`text`**, e.g. **`"text": "{{loc_name}}"`**.
3. In `_compute_layout_items()`, only elements with **`el_type in ("text", "dynamictext")`** use binding: they set `item["text"] = _resolve(record, binding)`.  
   For **`el_type == "statictext"`** the code does **`item["text"] = el.get("text") or ""`** and never calls `_resolve`.
4. So the layout item gets `text = "{{loc_name}}"`, and the PDF renderer draws that string as-is.

So the failure is **not**:

- Missing or wrong record keys (`loc_name` is present),
- `_resolve()` not supporting `{{...}}` (it’s not called for static text),
- Or wrong binding key name.

The failure **is**: the template treats the placeholder as **static text** (`staticText` + `text: "{{loc_name}}"`), so the engine never runs binding resolution for that element. Only **dynamicText** with a **binding** (e.g. `"{loc_name}"` or `"loc_name"`) is resolved.

How the template can end up that way:

- User adds “static text” and types `{{loc_name}}`, or
- Another tool/import (e.g. BarTender/NiceLabel style) uses double-brace placeholders and is mapped to static text, or
- An old or alternate flow saves variable placeholders into `text` with `staticText` instead of `dynamicText` + `binding`.

---

## 5. Recommended fix (do not implement yet)

**Option A – Backend (and frontend) fallback for static text placeholders**

- In **`_compute_layout_items()`**, when handling **staticText**, before setting `item["text"] = el.get("text") or ""`:
  - If `text` matches a single placeholder pattern (e.g. `\{\{([^}]+)\}\}` or `\{([^}]+)\}`), treat it as one variable:
    - Extract the variable name (e.g. `loc_name` from `{{loc_name}}` or `{loc_name}`).
    - Set `item["text"] = _resolve(record, key) or text` (or keep `text` if resolution is empty to avoid breaking intentional literals).
  - Same idea in the frontend layout engine for static text so preview and PDF stay in sync.
- **Pros:** Existing templates with static `"{{loc_name}}"` start working without re-saving.  
- **Cons:** Need a clear, safe rule (e.g. only one placeholder per static text, or whitelist of names) so normal static text with `{...}` in text is not misinterpreted.

**Option B – Ensure templates use dynamicText + binding**

- Designer / import / presets: when the user intends a variable, always create **dynamicText** with **binding** (e.g. `"loc_name"` or `"{loc_name}"`), never staticText with `text: "{{loc_name}}"`.
- Add validation or migration: if an element is staticText and `text` looks like `{{...}}`, warn or offer to convert to dynamicText with that binding.
- **Pros:** Clear model: variables = binding on dynamicText.  
- **Cons:** Existing templates with static `{{loc_name}}` must be fixed (migration or manual edit).

**Option C – Hybrid**

- Prefer **Option B** for new/edited templates.
- Add **Option A** as a backward-compatible fallback only for static text that matches a single `{{variable}}` (or `{variable}`) pattern, so old or imported templates work without DB changes.

**Recommendation:** Implement **Option C**: resolve single `{{...}}` (and optionally `{...}`) in static text in both layout engines as a fallback, and ensure the designer and any import always save variable placeholders as **dynamicText** with **binding** so new templates stay correct and preview/PDF stay consistent.

---

## 6. Debug output (for verification)

To confirm the cause on a specific template/record, log in the backend during PDF generation:

**In `label_engine.py` inside `_compute_layout_items()`,** when building a text item (e.g. right after determining `el_type` for the element, or before `out.append(item)` for text/statictext):

- `el.get("type")`, `el.get("binding")`, `el.get("dataBinding")`, `el.get("text")`.
- For the first record: `list(record.keys())`, `record.get("loc_name")`, `record.get("{loc_name}")`.

**In `label_render_service.py`** (e.g. at the start of `build_label_pdf` or right after `_normalize_record_for_bindings`):

- For the first record: `list(records[0].keys())`, `records[0].get("loc_name")`.
- For the first text/staticText element in `elements`: `el.get("type")`, `el.get("text")`, `el.get("binding")`.

Expected when the bug occurs:

- One element with `type == "staticText"` and `text == "{{loc_name}}"`.
- No `binding` used for that element; `item["text"]` is set from `el.get("text")` only.

This will confirm that the failing element is static text with a literal `{{loc_name}}` and that binding resolution is never applied to it.
