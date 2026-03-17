# Product stack compression and max stack weight – changelog

## Overview

Stack compression and maximum stack weight were added to support:

- **Compressible products** (e.g. pillows, quilts, clothing): when stacked, use a reduced height (`compressed_height_cm`) for capacity and packing.
- **Maximum stack weight**: limit stack height by total weight (`max_stack_weight` kg), so the number of layers is at most `floor(max_stack_weight / unit_weight)`.

Backward compatibility: `stack_compressible` null → false; `compressed_height_cm` null → use original height; `max_stack_weight` null → no weight limit.

---

## Database

- **Table**: `products`
- **New columns** (nullable, added by migration):
  - `stack_compressible` INTEGER (boolean: 0/1)
  - `compressed_height_cm` REAL
  - `max_stack_weight` REAL
- **Migration**: `ensure_products_stack_columns(engine)` in `backend/db/schema_upgrade.py`; uses `PRAGMA table_info(products)` and adds columns if missing. Called from `main.py` on startup.

---

## Backend

### Model (`backend/models/product.py`)

- `stack_compressible = Column(Boolean, nullable=True)`
- `compressed_height_cm = Column(Float, nullable=True)`
- `max_stack_weight = Column(Float, nullable=True)`

Placed next to `orientation_type` and `shape_type`.

### API (`backend/api/product.py`)

- **Serialization**: `_product_to_dict()` includes `stack_compressible`, `compressed_height_cm`, `max_stack_weight` (getattr with default None).
- **ProductBody**: Optional fields `stack_compressible`, `compressed_height_cm`, `max_stack_weight` with validation:
  - `compressed_height_cm` must be > 0 when provided
  - `max_stack_weight` must be > 0 when provided
- **Create**: Values passed into `Product(...)`.
- **Update**: `product.stack_compressible`, `product.compressed_height_cm`, `product.max_stack_weight` set from body when provided.

---

## Frontend

### Types (`frontend/src/types/warehouse.ts`)

- **WarehouseProduct**: Optional `stack_compressible?: boolean`, `compressed_height_cm?: number | null`, `max_stack_weight?: number | null`.

### Mapping (WarehouseDesigner)

- When building `WarehouseProduct` from API (loadLayout and fetchProductsForMap):
  - `stack_compressible`: from API or default `false`
  - `compressed_height_cm`: from API or `null`
  - `max_stack_weight`: from API or `null`

### Product editor (`frontend/src/pages/Products/ProductEditModal.tsx`)

- **Form**: `ProductForm` extended with `stack_compressible`, `compressed_height_cm`, `max_stack_weight`.
- **State**: `stackCompressible`, `compressedHeightCm`, `maxStackWeight` with defaults from product.
- **UI** – section **"Układanie w stos"**:
  - Checkbox: **"Kompresja przy układaniu w stos"** → `stack_compressible`
  - When checked: number input **"Wysokość po kompresji (cm)"** → `compressed_height_cm`
  - Optional number input **"Maksymalna waga stosu (kg)"** → `max_stack_weight`
- **Save**: All three included in payload and API body.

### Capacity and packing (`frontend/src/pages/WarehouseDesigner/useDesignerMagazynState.ts`)

- **Effective height**  
  `effectiveHeight_cm = (product.stack_compressible && product.compressed_height_cm > 0) ? product.compressed_height_cm : product.height_cm`  
  Used instead of `product.height_cm` when building product dimensions for capacity and packing.

- **Weight limit**  
  `maxCountZByWeight = (product.max_stack_weight && product.weight) ? Math.floor(product.max_stack_weight / product.weight) : Infinity`  
  (Uses `product.weight_kg ?? product.weight` for unit weight.)

- **Combined stack limit**  
  `maxCountZ = Math.min(floor(slotHeight / effectiveHeight_cm), maxCountZByWeight, orientationLimit)`  
  with `orientationLimit = 1` when `orientation_type === "no_stack"`, else unlimited.

- **Packing layout**  
  `maxCountZ` is passed into `calculatePackingLayout` so stacking height is limited. The same limit is applied for cylinder layout (cap on countZ). Core rotation algorithm is unchanged.

---

## Backward compatibility

- **API**: Clients that omit the new fields leave DB as NULL; reads return null.
- **Frontend**: `stack_compressible` null/undefined → false; `compressed_height_cm` null/undefined → use original height; `max_stack_weight` null/undefined → no weight limit in capacity/packing.
