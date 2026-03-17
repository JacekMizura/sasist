# Analysis: Product Orientation Constraints and Shape Type

**Goal:** Introduce orientation constraints and shape type (box vs cylinder) for realistic slot capacity and packing, without breaking the existing system. **Analysis only; no code changes.**

---

## SECTION 1 — Product model

**File:** `backend/models/product.py`

**Current fields:**

- **Dimensions:** `length`, `width`, `height` (Float) — stored in cm in practice (API accepts length_cm/width_cm/height_cm and writes to these columns).
- **Weight:** `weight` (Float).
- **Volume:** `volume` (Float) — stored in dm³ when derived from L×W×H/1000.
- **No** `volume_dm3` column — the API and code use `volume` for dm³.
- **No** orientation or shape fields.

**Conclusion:** The model has **length, width, height, weight, volume** but **no** orientation constraints or shape type. New nullable columns are required for:
- orientation constraint (e.g. free / upright-only / no-stack),
- shape type (e.g. box / cylinder).

---

## SECTION 2 — Database schema

**Migrations:** `backend/migrations/` contains SQL files (e.g. `005_location_type.sql`) that use `ALTER TABLE ... ADD COLUMN ... DEFAULT '...'` for SQLite.

**Schema upgrade:** `backend/db/schema_upgrade.py` provides **ensure_*** helpers that:
- Use `PRAGMA table_info(table_name)` to get existing columns.
- Run `ALTER TABLE ... ADD COLUMN ...` only if the column is missing.
- Commit after changes.

**How to add new columns safely:**

1. **Option A — New migration SQL file:** Add e.g. `011_product_orientation_shape.sql` with `ALTER TABLE products ADD COLUMN orientation_type VARCHAR(20);` and `ALTER TABLE products ADD COLUMN shape_type VARCHAR(20);` (and defaults if desired). Run migrations manually or via a migration runner if one exists.
2. **Option B — Schema upgrade helper (consistent with existing pattern):** Add e.g. `ensure_products_physical_columns(engine)` in `schema_upgrade.py` that checks `PRAGMA table_info(products)`, then adds `orientation_type` and `shape_type` only if missing. Call this from `main.py` at startup (next to `ensure_locations_columns` and `ensure_warehouse_layout_building_columns`). Use nullable columns and no NOT NULL until defaults are decided; or use NOT NULL with a default so existing rows get the default.

**Recommendation:** Use **schema_upgrade** so existing SQLite DBs get the new columns on next app start without a separate migration step. Use **nullable** columns with a **default** in application logic (e.g. treat NULL as "any_orientation" / "box") so existing products are unchanged and new code can assume a value.

---

## SECTION 3 — API layer

**File:** `backend/api/product.py`

**Serialization — `_product_to_dict(p)` (lines 150–177):**

- Returns: `id`, `tenant_id`, `name`, `ean`, `symbol`, **`length`**, **`width`**, **`height`**, **`weight`**, **`volume`**, `location`, prices, `manufacturer`, `unit`, `image_url`, `assigned_locations`, `label_template_id`.
- Does **not** return `length_cm` / `width_cm` / `height_cm`; the frontend maps `length`/`width`/`height` to dimensions.

**Adding new fields:**

1. **Response:** Add `orientation_type` and `shape_type` to the dict returned by `_product_to_dict`, e.g. `getattr(p, "orientation_type", None)` and `getattr(p, "shape_type", None)` so it works before the model has the columns (returns None) and after (returns the value).
2. **Request:** In **ProductBody** (Pydantic), add optional `orientation_type: Optional[str] = None` and `shape_type: Optional[str] = None`. In the update/create logic that applies the payload to the product (around lines 529–570), add branches that set `product.orientation_type` and `product.shape_type` when present in the payload. Validate allowed values (e.g. "any" | "upright" | "no_stack" and "box" | "cylinder") in the API or model layer to avoid invalid DB values.

**Conclusion:** New fields can be added in **ProductBody**, in the code that maps payload → Product, and in **`_product_to_dict`**. Using **getattr** in **`_product_to_dict`** keeps responses safe before columns exist.

---

## SECTION 4 — Frontend types

**WarehouseProduct** is in **`frontend/src/types/warehouse.ts`** (lines 42–63):

- Has **width_cm**, **depth_cm**, **height_cm** (optional) for 3D capacity.
- Does **not** have orientation or shape fields.

**Mapping from API:** In **WarehouseDesigner.tsx** (loadLayout and fetchProductsForMap), products are built from the API with **normalizeProductDims(p)** and explicit **width_cm**, **depth_cm**, **height_cm**. There is no `frontend/src/types/product.ts`; **ProductEditModal** uses **ProductForm** (length, width, height, weight, volume, etc.) and sends **length_cm**, **width_cm**, **height_cm**, **weight_kg**, **volume_dm3** in the body.

**Adding new fields:**

- **WarehouseProduct:** Add optional `orientation_type?: string` and `shape_type?: string` (or union types for allowed values). When mapping API → WarehouseProduct, set them from `p.orientation_type` and `p.shape_type` (with fallback so missing = default behavior).
- **ProductForm** (ProductEditModal): Add optional `orientation_type` and `shape_type`; include them in the save payload so the backend persists them.

**Conclusion:** Extend **WarehouseProduct** and **ProductForm** with optional orientation and shape; map them from/to the API in the same places where dimensions are mapped.

---

## SECTION 5 — Product editor UI

**File:** `frontend/src/pages/Products/ProductEditModal.tsx`

- **ProductForm** holds name, ean, symbol, length, width, height, weight, volume, image_url, assignedLocations, etc. Form state uses `useState` for each field; save builds a **body** with **length_cm**, **width_cm**, **height_cm**, **weight_kg**, **volume_dm3**, etc.
- Dimensions are edited in numeric inputs; volume can be auto-computed from L×W×H.

**Where to add new fields:**

- Add state, e.g. `orientationType` and `shapeType`, with default from `product?.orientation_type` / `product?.shape_type` or a default (e.g. "any" / "box").
- Add a small section in the form (e.g. after dimensions or in a "Właściwości fizyczne" block) with:
  - **Orientacja produktu:** select or radio: "Dowolna" | "Tylko pionowo" | "Nie układać w stos" (values stored as backend enum, e.g. `any` | `upright` | `no_stack`).
  - **Kształt produktu:** select or radio: "Prostopadłościan" | "Walec (butelka)" (e.g. `box` | `cylinder`).
- Include **orientation_type** and **shape_type** in the **body** sent to POST/PUT so the API can persist them.

**Conclusion:** Add two controls and two state fields; no structural change to the modal. Polish labels only in the UI; store enum-like strings in the DB.

---

## SECTION 6 — Packing algorithm impact

**Files:** `frontend/src/components/warehouse/warehouseUtils.ts`

- **calculatePackingLayout(slot, product)** (lines 784–824): Tries all **6** rotations of (w, d, h) and picks the one that maximizes count. It does **not** accept or use orientation constraints.
- **calculateMaxCapacityByDimensions** delegates to **calculatePackingLayout** and returns **layout.count**.

**Rotation indices (current order):**

- 0: (pw, pd, ph) — product W→slot W, D→slot D, H→slot H  
- 1: (pw, ph, pd)  
- 2: (pd, pw, ph)  
- 3: (pd, ph, pw)  
- 4: (ph, pw, pd)  
- 5: (ph, pd, pw)

**Upright-only:** "Upright" typically means the product’s **height** axis (original ph) must align with the slot’s **vertical** (slot height). So only rotations where the third component (slot height) is **ph** are allowed: indices **0, 2, 4** (where the third element is ph). So **allowedRotations = [0, 2, 4]** for upright-only.

**No-stack (e.g. do not stack horizontally):** Interpretation can be product-specific; one option is to allow only rotations where the product is “standing” (same as upright), i.e. same filter. Alternatively, "no_stack" could mean only one layer in height (countZ = 1), which would be a different constraint (max count = countX * countY * 1). The analysis assumes "no_stack" is implemented either as upright-only or as a separate rule (e.g. cap countZ at 1).

**How to filter rotations:**

- Extend the packing functions to accept an optional **allowedRotations: number[]** (e.g. [0,1,2,3,4,5] for free, [0,2,4] for upright-only). When present, only try rotations whose index is in **allowedRotations**; when absent, keep current behavior (all 6).
- **calculatePackingLayout** and **calculateMaxCapacityByDimensions** could accept an optional third argument or an options object, e.g. `{ allowedRotations?: number[] }`. Callers (e.g. useDesignerMagazynState) would derive **allowedRotations** from **product.orientation_type** (and optionally **shape_type**): map "any" → [0,1,2,3,4,5], "upright" → [0,2,4], "no_stack" → [0,2,4] or apply a countZ cap.

**Conclusion:** The algorithm can support orientation by **filtering** which rotation indices are tried. No change to the core formula; only the set of rotations is restricted. Default (no constraint / legacy products) = all 6 rotations.

---

## SECTION 7 — Shape type and cylinder handling

**Shapes:** **BOX** (prostopadłościan), **CYLINDER** (walec / butelka).

**Cylinder capacity (concept):**

- Treat **diameter = width_cm** (or a dedicated diameter_cm if added later), **height = height_cm**. Depth can be ignored or equal to width (round footprint).
- Simple grid model: each cylinder occupies a square of side **diameter** in the horizontal plane and **height** vertically. Then:
  - **countX = floor(slotWidth / diameter)**
  - **countY = floor(slotDepth / diameter)**
  - **countZ = floor(slotHeight / height)**
  - **capacity = countX * countY * countZ**
- Cylinders are **upright-only** (no rotation of the cylinder axis). So orientation for cylinders is effectively fixed; the only “rotation” is placing the circle on the floor (same count for a square slot).

**Where the logic should live:**

- **Option A — In warehouseUtils:** Add e.g. **calculateMaxCapacityCylinder(slotDims, diameter_cm, height_cm)** and, when **shape_type === "cylinder"**, call it instead of **calculateMaxCapacityByDimensions**. Product dimensions: use **width_cm** (or a new diameter_cm) and **height_cm**; depth_cm can be ignored or set equal to width for a single “rotation.”
- **Option B — Single entry point:** A function **calculateMaxCapacity(slot, product, options?)** that checks **product.shape_type** (or options.shapeType): if "cylinder", use cylinder logic; else use box logic with **allowedRotations** from orientation. Callers in useDesignerMagazynState would pass product (with shape_type and dimensions) and slot; no need to branch in the hook.

**Recommendation:** Keep **calculateMaxCapacityByDimensions** (and **calculatePackingLayout**) for boxes. Add **calculateMaxCapacityCylinder(slot, diameter_cm, height_cm)** in **warehouseUtils**. In the hook (or a small wrapper in warehouseUtils), if **product.shape_type === "cylinder"** use the cylinder function; else use the existing box logic with **allowedRotations** derived from **orientation_type**. Cylinder layout for visualization (if needed) would return a single “rotation” (upright) and countX, countY, countZ from the formula above.

---

## SECTION 8 — Recommended schema

**New columns on Product (backend):**

| Column             | Type         | Nullable | Purpose                                      |
|--------------------|-------------|----------|----------------------------------------------|
| **orientation_type** | VARCHAR(20) | YES      | Constraint: any / upright / no_stack        |
| **shape_type**       | VARCHAR(20) | YES      | box / cylinder                              |

**Naming:** Use **orientation_type** and **shape_type** to align with existing naming (e.g. **storage_type** on bins, **location_type**). No **volume_dm3** column name; keep using **volume** for dm³.

**Allowed values (application-enforced or CHECK):**

- **orientation_type:** `any` | `upright` | `no_stack` (or `free` | `upright_only` | `no_horizontal_stack` if you prefer longer names).
- **shape_type:** `box` | `cylinder`.

**Optional:** If cylinders need an explicit diameter (e.g. when width ≠ depth), add **diameter_cm** (Float, nullable) later; for the first version, **width_cm** (or length) can represent diameter.

---

## SECTION 9 — Polish UI labels

**Orientacja produktu:**

- **Dowolna** → store `any` (or `free`)
- **Tylko pionowo** → store `upright`
- **Nie układać w stos** → store `no_stack`

**Kształt produktu:**

- **Prostopadłościan** → store `box`
- **Walec (butelka)** → store `cylinder`

**Storage in DB:** Store the **internal enum** (e.g. `any`, `upright`, `no_stack`, `box`, `cylinder`) in the database. The UI only displays Polish labels; the form maps label → value when saving and value → label when loading. No need to store Polish text in the DB; use a small constant map in the frontend (and optionally in the backend for API docs or admin).

---

## SECTION 10 — Migration strategy

**Goals:** (1) Existing products keep working. (2) New fields are optional. (3) No breaking changes to API or frontend.

**Steps:**

1. **Backend DB:** Add **orientation_type** and **shape_type** as **nullable** columns (no NOT NULL). Default in DB: NULL. In application code, treat **NULL** as:
   - **orientation_type:** "any" (all 6 rotations allowed).
   - **shape_type:** "box" (use existing box packing).
2. **Backend API:** In **ProductBody**, add optional **orientation_type** and **shape_type**. In create/update, set them only when provided; do not overwrite with NULL on update unless the client explicitly sends null. In **`_product_to_dict`**, return them with **getattr(p, "orientation_type", None)** so old DBs without the column get None.
3. **Frontend:** When mapping API → WarehouseProduct, treat missing/undefined as default: **orientation_type ?? "any"**, **shape_type ?? "box"**. Capacity and packing logic use these defaults when the value is missing.
4. **Packing:** In **calculatePackingLayout** / **calculateMaxCapacityByDimensions**, add optional **allowedRotations**. When **orientation_type === "upright"** (or "no_stack" if same filter), pass **[0, 2, 4]**; else pass all 6. When **shape_type === "cylinder"**, use cylinder capacity instead of box.
5. **Product form:** Add the two dropdowns with Polish labels; default selection = "Dowolna" / "Prostopadłościan" (value `any` / `box`) for new products. Existing products load with null from API and display as "Dowolna" / "Prostopadłościan" until the user saves.

**Recommended defaults:**

- **orientation_type:** NULL in DB → treat as **any** in code.
- **shape_type:** NULL in DB → treat as **box** in code.

This keeps existing products unchanged and allows gradual adoption of the new options.

---

**Summary:** The Product model currently has dimensions and weight/volume but no orientation or shape. Add nullable **orientation_type** and **shape_type** via schema_upgrade (or migration SQL); extend API request/response and frontend types and product form; filter rotations in the packing algorithm by orientation and add a separate cylinder capacity path; store enum-like values in the DB and use Polish labels only in the UI. Default NULL to "any" and "box" so existing data and callers remain valid. No code was modified in this analysis.
