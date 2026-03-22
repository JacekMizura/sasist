# Analysis: Product Stack Compression and Maximum Stack Weight

**Goal:** Introduce stack compression and maximum stack weight for realistic slot capacity, without breaking the current packing algorithm. **Analysis only; no code changes.**

---

## SECTION 1 — Product model

**File:** `backend/models/product.py`

**Existing physical fields:**

- **length**, **width**, **height** (Float) — dimensions in cm
- **weight** (Float) — unit weight in kg
- **volume** (Float) — volume in dm³
- **orientation_type** (String(20), nullable) — any | upright | no_stack
- **shape_type** (String(20), nullable) — box | cylinder

**Where to add stack-related fields:**

- Place them in the same “physical / packing” block as **orientation_type** and **shape_type**, i.e. immediately after **shape_type** and before **label_template_id**. New columns:
  - **stack_compressible** (Boolean or Integer 0/1 for SQLite) — whether the product compresses when stacked
  - **compressed_height_cm** (Float, nullable) — height per unit when stacked (used when stack_compressible is true)
  - **max_stack_weight** (Float, nullable) — maximum total weight (kg) that may rest on top of one unit; used to cap stack height

---

## SECTION 2 — Database schema

**Migrations:** `backend/migrations/` uses SQL files with `ALTER TABLE ... ADD COLUMN ...`.

**Schema upgrade:** `backend/db/schema_upgrade.py` uses:

- `PRAGMA table_info(products)` to get existing columns
- `ALTER TABLE products ADD COLUMN ...` only if the column is missing
- `conn.commit()` after changes

**Adding new nullable columns safely:**

1. Add a new helper, e.g. **ensure_products_stack_columns(engine)**:
   - Query current columns for **products**.
   - If **stack_compressible** is missing, add it (e.g. `INTEGER` for SQLite, 0 = false, 1 = true; default NULL or 0).
   - If **compressed_height_cm** is missing, add `REAL` (nullable).
   - If **max_stack_weight** is missing, add `REAL` (nullable).
2. Call this helper from **main.py** at startup (together with **ensure_products_physical_columns** and others) so existing DBs get the columns on next run.
3. Use **nullable** columns so existing rows are unchanged; application code treats NULL with the safe defaults described in Section 11.

**SQLite note:** No native BOOLEAN; use **INTEGER** (0/1) or **INT** and interpret in code. Alternatively store **stack_compressible** as **TEXT** ('true'/'false') or **INTEGER** with 0 = false, 1 = true.

---

## SECTION 3 — API layer

**File:** `backend/api/product.py`

**_product_to_dict(p):**

- Currently returns id, tenant_id, name, ean, symbol, length, width, height, weight, volume, location, prices, manufacturer, unit, image_url, assigned_locations, label_template_id, orientation_type, shape_type.
- **Add:** **stack_compressible**, **compressed_height_cm**, **max_stack_weight** using **getattr(p, "stack_compressible", None)** etc. so responses work before and after columns exist.

**ProductBody (request):**

- Add optional fields: **stack_compressible: Optional[bool] = None**, **compressed_height_cm: Optional[float] = None**, **max_stack_weight: Optional[float] = None**.
- In the create/update logic that maps payload → Product (around the same place as orientation_type / shape_type), set **product.stack_compressible**, **product.compressed_height_cm**, **product.max_stack_weight** when present in the payload. Do not overwrite with None on PATCH unless the client explicitly sends null.
- Optional: validate **compressed_height_cm** > 0 and **max_stack_weight** >= 0 when provided.

**Conclusion:** Extend **ProductBody**, the payload→model mapping, and **\_product_to_dict** with the three new fields. Using getattr in **\_product_to_dict** keeps old DBs safe.

---

## SECTION 4 — Frontend product type

**WarehouseProduct** in **`frontend/src/types/warehouse.ts`** (lines 42–67):

- Has **width_cm**, **depth_cm**, **height_cm**, **weight_kg** / **weight**, **orientation_type**, **shape_type**.
- Does **not** have stack-related fields.

**Mapping from API:**

- In **WarehouseDesigner.tsx** (loadLayout and fetchProductsForMap), products are built from the API; dimensions and orientation/shape are mapped. **Add:** **stack_compressible**, **compressed_height_cm**, **max_stack_weight** from the response (e.g. `p.stack_compressible`, `p.compressed_height_cm`, `p.max_stack_weight`) with fallback so missing = default (false, undefined, undefined).

**Conclusion:** Extend **WarehouseProduct** with optional **stack_compressible?: boolean**, **compressed_height_cm?: number**, **max_stack_weight?: number**. Map them wherever product data is built from the API (e.g. loadLayout, fetchProductsForMap, productNormalizer if used for Magazyn).

---

## SECTION 5 — Product editor UI

**File:** `frontend/src/pages/Products/ProductEditModal.tsx`

- **ProductForm** already has **orientation_type**, **shape_type**; form state and save body include dimensions and physical options.
- Dimensions (length, width, height, weight, volume) are in numeric inputs; orientation and shape are in their own controls.

**Where to add stack parameters:**

- Add a small block, e.g. **“Układanie w stos”** or **“Parametry stosu”**, after orientation/shape or after dimensions:
  - **Kompresja przy układaniu w stos:** checkbox (stack_compressible). When checked, show the next field.
  - **Wysokość po kompresji (cm):** number input, visible/enabled when stack_compressible is true; value → **compressed_height_cm**.
  - **Maksymalna waga stosu (kg):** number input (optional); value → **max_stack_weight**.
- Add to **ProductForm** type: **stack_compressible?: boolean**, **compressed_height_cm?: number**, **max_stack_weight?: number**.
- In the save handler, add these to the request body (e.g. **stack_compressible**, **compressed_height_cm**, **max_stack_weight**). Use the same “only send when defined” pattern as for other optional fields.

**Conclusion:** Two or three controls and the same number of form/state fields; no structural change to the modal. Polish labels only in the UI; store booleans and numbers in the API/DB.

---

## SECTION 6 — Packing algorithm impact

**Location:** **frontend/src/components/warehouse/warehouseUtils.ts**

- **calculatePackingLayout(slot, product, allowedRotations, maxCountZ)** (lines 786–831): For each allowed rotation, computes **countX**, **countY**, **countZ** from slot and product dimensions; applies **maxCountZ** cap if provided; returns the best layout.
- **calculateMaxCapacityByDimensions** delegates to **calculatePackingLayout** and returns **layout.count**.

**Call chain:** **useDesignerMagazynState** builds **capacityForProduct(slotDims, product)** and **packingLayoutForProduct(slotDims, product)**. These build **dims** from **product.width_cm**, **depth_cm**, **height_cm**, then call **calculatePackingLayout(slotDims, dims, allowedRotations, maxCountZ)**. So **product** is not passed into **warehouseUtils**; only **dims** and options are.

**Where stack compression and max stack weight apply:**

1. **Compression:** Use an **effective height** when building **dims** in the **caller** (e.g. in **capacityForProduct** and **packingLayoutForProduct** in useDesignerMagazynState). If **product.stack_compressible** and **product.compressed_height_cm** are set, set **dims.height_cm = product.compressed_height_cm**; otherwise **dims.height_cm = product.height_cm**. For compressible products, only upright rotations make sense (stacking direction = vertical), so restrict to **allowedRotations = [0, 2, 4]** when stack_compressible is true. The packing functions in **warehouseUtils** then need **no change**; they keep using **dims** as today.
2. **Max stack weight:** Compute **maxCountZByWeight = floor(max_stack_weight_kg / product.weight_kg)** in the **caller** when **product.max_stack_weight** and **product.weight_kg** are present and > 0. Pass a **maxCountZ** into **calculatePackingLayout** that combines:
   - existing **maxCountZ** from **no_stack** (1),
   - and **maxCountZByWeight** when defined,
   - e.g. **maxCountZ = min(existingMaxCountZ, maxCountZByWeight)**. The algorithm already supports **maxCountZ**; no change inside **warehouseUtils** beyond the caller passing this combined cap.

**Conclusion:** **warehouseUtils** can stay unchanged. All new behavior is in the **caller** (useDesignerMagazynState): build **dims** with effective height when compressible, and compute and pass **maxCountZ** that includes the weight limit.

---

## SECTION 7 — Compression logic

**Intended behaviour:** When products are stacked, compressible ones (e.g. pillows, quilts) use a smaller height per unit than their nominal height.

**Effective height:**

- **effectiveHeight_cm = (stack_compressible && compressed_height_cm != null && compressed_height_cm > 0) ? compressed_height_cm : height_cm**

**Where to apply:**

- In the code that builds the product dimensions **dims** passed into **calculatePackingLayout** / **calculateMaxCapacityByDimensions** (i.e. in **capacityForProduct** and **packingLayoutForProduct** in useDesignerMagazynState). Set **dims.height_cm = effectiveHeight_cm** as above. So the **vertical** dimension used in the packing loop is already the compressed height when applicable.
- For **stack_compressible** products, only upright rotations (product height = slot height) are meaningful; use **allowedRotations = [0, 2, 4]** so the “height” in **dims** is always the axis that aligns with slot height. Then **countZ = floor(slotHeight / effectiveHeight_cm)** correctly gives the number of layers.

**No change** is required inside **calculatePackingLayout**; it already uses **product.height_cm** (here passed as **dims.height_cm**) for the third component in each rotation. The caller simply passes the effective height in **dims.height_cm**.

---

## SECTION 8 — Maximum stack weight logic

**Intended behaviour:** The stack above a single unit must not exceed **max_stack_weight** (kg). So the number of units that can sit above one is at most **floor(max_stack_weight / product.weight_kg)** (each unit has weight **product.weight_kg**). So **countZ** is capped by **maxCountZByWeight = floor(max_stack_weight_kg / product.weight_kg)** when both are defined and weight_kg > 0.

**Formula:**

- **maxByWeight = (max_stack_weight_kg != null && weight_kg != null && weight_kg > 0) ? Math.floor(max_stack_weight_kg / weight_kg) : undefined**
- **countZ** in the algorithm is already **countZ = min(floor(slotHeight / h), maxCountZ)** when **maxCountZ** is passed. So the **caller** should pass **maxCountZ** such that:
  - If **maxCountZByWeight** is defined: **maxCountZ = min(existingMaxCountZ, maxCountZByWeight)** (and if there is no existing cap, **maxCountZ = maxCountZByWeight**).
  - Existing **maxCountZ** comes from **no_stack** (1). So: **maxCountZ = no_stack ? 1 : maxCountZByWeight**, or if both apply, **maxCountZ = min(1, maxCountZByWeight)**.

**Where to implement:**

- In **capacityForProduct** and **packingLayoutForProduct** (useDesignerMagazynState): after computing **allowedRotations** and the current **maxCountZ** (from **no_stack**), compute **maxCountZByWeight** from **product.max_stack_weight** and **product.weight_kg**. Then set **maxCountZ = min(currentMaxCountZ, maxCountZByWeight)** when **maxCountZByWeight** is defined (and **currentMaxCountZ** may be undefined or 1). Pass this **maxCountZ** into **calculatePackingLayout**. The existing signature already supports **maxCountZ**; no change inside **warehouseUtils**.

---

## SECTION 9 — Recommended schema

**New columns on Product:**

| Column                 | Type         | Nullable | Purpose |
|------------------------|-------------|----------|--------|
| **stack_compressible** | INTEGER/BOOLEAN | YES   | 1/true = product compresses when stacked; 0/false or NULL = use nominal height. |
| **compressed_height_cm** | REAL       | YES      | Height (cm) per unit when stacked; used only when stack_compressible is true. |
| **max_stack_weight**   | REAL        | YES      | Max weight (kg) allowed on top of one unit; limits stack height. |

**Why these are sufficient:**

- **stack_compressible** + **compressed_height_cm** define “use compressed height when stacking”: one boolean and one value. More complex models (e.g. height as a function of load) can be added later.
- **max_stack_weight** plus unit weight gives a simple, integer cap on layers (floor(max_stack_weight / weight_kg)), which fits the current integer **countZ** and **maxCountZ** in the algorithm. No extra columns needed for a first version.

**Naming:** Use **max_stack_weight** (not max_stack_weight_kg) if the unit is always kg in the domain; API and frontend can still expose it as **max_stack_weight_kg** for clarity. DB can stay **max_stack_weight**.

---

## SECTION 10 — Polish UI labels

**Labels and mapping to backend:**

| Polish label                          | Backend field             | Notes |
|---------------------------------------|---------------------------|--------|
| Kompresja przy układaniu w stos       | **stack_compressible**    | Checkbox: checked = true, unchecked = false. |
| Wysokość po kompresji (cm)            | **compressed_height_cm**  | Number; only relevant when stack_compressible is true. |
| Maksymalna waga stosu (kg)            | **max_stack_weight**      | Number; optional. |

Store only the field values in the DB (boolean, float, float). The UI shows Polish labels; the form sends the same keys (e.g. **stack_compressible**, **compressed_height_cm**, **max_stack_weight**) to the API.

---

## SECTION 11 — Migration strategy

**Safe defaults for existing products:**

- **stack_compressible:** NULL or 0 (false). In application code: treat NULL/false as “not compressible” → use nominal **height_cm**.
- **compressed_height_cm:** NULL. Used only when **stack_compressible** is true; ignore when NULL.
- **max_stack_weight:** NULL. In application code: treat NULL as “no weight limit” → do not cap **countZ** by weight.

**Behaviour after migration:**

- Existing products have no new fields set → **stack_compressible** false, **compressed_height_cm** unused, **max_stack_weight** unused → capacity and packing behave exactly as today.
- New or edited products can set the new fields; only then does effective height and max stack weight apply.

**Backward compatibility:**

- API: **getattr(p, "stack_compressible", None)** etc. in **\_product_to_dict** so old DBs without the columns return None.
- Frontend: when mapping API → WarehouseProduct, treat missing/undefined as above defaults so Magazyn and capacity logic do not assume the fields exist.
- Packing: callers build **dims** and **maxCountZ** only from the new fields when they are present and valid; otherwise keep current behaviour.

---

**Summary:** Add three nullable columns (**stack_compressible**, **compressed_height_cm**, **max_stack_weight**) via schema upgrade; extend API request/response and frontend types and product form with Polish labels; keep **warehouseUtils** unchanged and implement compression and max stack weight in the **caller** (effective height in **dims**, combined **maxCountZ** from weight and no_stack). Default NULL/false so existing data and behaviour remain unchanged. No code was modified in this analysis.
