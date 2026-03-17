# Product orientation and shape – changelog

## Overview

Product orientation constraints and shape types were added so that capacity and packing respect:

- **Orientation**: `any` (all 6 rotations), `upright` (only vertical orientations), `no_stack` (single layer).
- **Shape**: `box` (rectangular 3D bin packing) or `cylinder` (diameter = width, height = height; simple grid).

Backward compatibility: `orientation_type` and `shape_type` are optional. Null/undefined is treated as `any` and `box` respectively.

---

## Database

- **Table**: `products`
- **New columns** (nullable, added by migration):
  - `orientation_type` VARCHAR(20) – allowed: `any`, `upright`, `no_stack`
  - `shape_type` VARCHAR(20) – allowed: `box`, `cylinder`
- **Migration**: `ensure_products_physical_columns(engine)` in `backend/db/schema_upgrade.py`; uses `PRAGMA table_info(products)` and adds columns if missing. Called from `main.py` on startup.

---

## Backend

### Model (`backend/models/product.py`)

- `orientation_type = Column(String(20), nullable=True)`
- `shape_type = Column(String(20), nullable=True)`

### API (`backend/api/product.py`)

- **Serialization**: `_product_to_dict()` includes `orientation_type` and `shape_type` (getattr with default `None`).
- **ProductBody**: Optional fields `orientation_type`, `shape_type` with Pydantic validators:
  - `orientation_type` ∈ `["any", "upright", "no_stack"]`
  - `shape_type` ∈ `["box", "cylinder"]`
- **Create**: Values passed into `Product(...)` (empty string → None).
- **Update**: `product.orientation_type` and `product.shape_type` set from body when provided.

---

## Frontend

### Types (`frontend/src/types/warehouse.ts`)

- **WarehouseProduct**: Optional `orientation_type?: "any" | "upright" | "no_stack"` and `shape_type?: "box" | "cylinder"`.

### Mapping (WarehouseDesigner)

- When building `WarehouseProduct` from API (loadLayout and fetchProductsForMap):
  - `orientation_type`: from API or default `"any"` (invalid values fallback to `"any"`).
  - `shape_type`: from API or default `"box"` (invalid values fallback to `"box"`).

### Product editor (`frontend/src/pages/Products/ProductEditModal.tsx`)

- **Form**: `ProductForm` extended with `orientation_type`, `shape_type`.
- **State**: `orientationType`, `shapeType` with defaults from product or `"any"` / `"box"`.
- **UI** (after dimensions):
  - **Orientacja produktu**: Dowolna → `any`, Tylko pionowo → `upright`, Nie układać w stos → `no_stack`.
  - **Kształt produktu**: Prostopadłościan → `box`, Walec (butelka) → `cylinder`.
- **Save**: Both fields included in payload and API body (POST/PUT).

### Packing (`frontend/src/components/warehouse/warehouseUtils.ts`)

- **calculatePackingLayout(slot, product, allowedRotations?, maxCountZ?)**
  - `allowedRotations`: default `[0,1,2,3,4,5]`; only these rotation indices are considered.
  - `maxCountZ`: optional cap on vertical count (e.g. 1 for no_stack).
- **calculateMaxCapacityCylinder(slotDims, productDims)**
  - Diameter = product `width_cm`, height = product `height_cm`.
  - Capacity = `floor(slotWidth/diameter) * floor(slotDepth/diameter) * floor(slotHeight/height)`.

### Capacity hook (`frontend/src/pages/WarehouseDesigner/useDesignerMagazynState.ts`)

- **Orientation rules**:
  - `orientation_type === "upright"` → `allowedRotations = [0, 2, 4]`.
  - `orientation_type === "no_stack"` → `maxCountZ = 1`.
  - `orientation_type === "any"` or null → all rotations, no cap.
- **Shape**:
  - `shape_type === "cylinder"` → capacity and preview use `calculateMaxCapacityCylinder` (synthetic layout for preview).
  - Otherwise → box packing with `calculatePackingLayout` and the above orientation rules.
- Helpers `capacityForProduct(slotDims, product)` and `packingLayoutForProduct(slotDims, product)` centralize logic for bin capacity and packing preview.

---

## Backward compatibility

- **API**: Existing clients that omit `orientation_type` / `shape_type` leave DB as NULL; reads return null; frontend treats as `any` and `box`.
- **DB**: Existing rows keep NULL; migration only adds columns.
- **Frontend**: Undefined or invalid values default to `orientation_type = "any"` and `shape_type = "box"` in mapping and in capacity/packing logic.
