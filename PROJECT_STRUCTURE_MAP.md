# WMS Project Structure Map — Source of Truth

Deep scan of `frontend/src` and `backend` with focus on warehouse layout, product–location mapping, and API boundaries.

---

## 1. Directory tree (frontend/src)

```
frontend/src/
├── main.tsx                          # App mount (React root)
├── App.tsx                            # Router + route definitions; mounts WarehouseDesigner at /designer, /warehouse-designer
├── index.css
├── App.css
│
├── api/
│   └── axios.ts                      # Single axios instance; baseURL http://127.0.0.1:8010; trailing-slash interceptor
│
├── assets/
│   └── react.svg
│
├── components/
│   ├── ErrorBoundary.tsx
│   └── warehouse/                    # ★ Warehouse UI building blocks
│       ├── WarehouseCanvas.tsx       # ★ Main SVG canvas: grid, racks, visuals, drag, zoom, pan, row/aisle/path tools
│       ├── WarehouseLegend.tsx       # ★ Legend for map (fullMap | rackDetail) + optional stats
│       ├── RackSidebar.tsx           # ★ Side panel: rack catalog (Projektant) or catalog-only (Magazyn); hideVisualInMagazyn
│       ├── WarehouseMainView.tsx     # Wraps WarehouseCanvas with same props
│       ├── WarehouseMiniMap.tsx      # Simplified floor plan for Magazyn: click rack → side view
│       ├── WarehouseFullMap.tsx      # Full-screen map for Magazyn tab (same layout as Projektant)
│       ├── WarehouseModals.tsx       # Create warehouse, elevation, internal layout, edit product, snackbar
│       ├── warehouseUtils.ts         # Grid/cell helpers, positionFitsDimensions, getPositionsFromLayoutRacks
│       ├── warehouseTypes.ts         # Local types for warehouse components
│       ├── RowPreviewOverlay.tsx     # Row-draw preview
│       ├── InternalLayoutModal.tsx   # Internal rack structure editor
│       ├── TemplateCreator.tsx       # Rack template creation
│       ├── ElevationPanel.tsx        # Elevation / side view for rack
│       ├── DimensionOverlay.tsx      # Dimension overlay on canvas
│       ├── RackSideViewGrid.tsx       # Side view grid (bins)
│       ├── RackPropertiesSidebar.tsx # Rack properties in layout mode
│       ├── ProductSearchAutocomplete.tsx
│       ├── LocationPicker.tsx        # Pick bin for product assignment
│       └── EditProductModal.tsx      # Edit product at location (Layout only; not in Magazyn)
│
├── components/warehouse-layout/      # Re-exports only (barrel for Vite)
│   └── index.ts                      # Re-exports from ../../warehouse-layout
│
├── context/
│   ├── WarehouseContext.tsx          # Global warehouse list / selected warehouse (for Products, Import, etc.)
│   ├── WarehouseDesignerContext.tsx  # State for WarehouseDesigner (map, selection, rackConfig); used by Designer subfolder
│   └── CartsRefreshContext.tsx       # Refresh bus for Carts after simulation/reset
│
├── constants/
│   └── uiStrings.ts                  # PL UI strings: warehouseDesigner, Magazyn, Projektant, designerSubTabs, etc.
│
├── layout/
│   ├── MainLayout.tsx                # Sidebar nav + content area; links to /designer (Projektant Magazynu)
│   ├── AppLayout.tsx
│   ├── Sidebar.tsx
│   ├── Topbar.tsx
│   ├── designTokens.ts
│   └── Orders.tsx
│
├── locales/
│   ├── index.ts                      # useTranslation
│   └── pl.json
│
├── pages/
│   ├── Dashboard.tsx
│   ├── Setup.tsx
│   ├── Import.tsx
│   ├── Import/
│   │   ├── ImportPage.tsx            # Product/order import UI
│   │   └── importMappingConfig.ts
│   ├── Products.tsx                  # Legacy/products entry
│   ├── Products/                     # ★ Product views + CSV location mapping
│   │   ├── ProductsLayout.tsx        # Layout + tabs (list / import)
│   │   ├── ProductList.tsx           # ★ Product list: filters, pagination, volume dm³, LocationMappingExportImport
│   │   ├── ProductEditModal.tsx      # Edit product; fetchLayout for location picker
│   │   └── LocationMappingExportImport.tsx  # ★ CSV export/import for product–location mapping (Location_Name, UUID, SKU, Qty)
│   ├── Orders/
│   │   ├── OrdersLayout.tsx
│   │   └── OrderList.tsx
│   ├── Carts.tsx
│   ├── CartsComponents/              # Carts, zones, racks, bulk editor, simulation
│   │   ├── CartList.tsx, BulkCartList.tsx, CartEditor.tsx, BulkCartEditor.tsx, CartForm.tsx
│   │   ├── ZonesTab.tsx, RacksTab.tsx, ZoneConfigurator.tsx, RackConfigurator.tsx
│   │   ├── i18n.ts
│   │   └── ui/                       # CartCard, ProgressBar, SummaryDashboard, SimulationResultModal, etc.
│   ├── CartDetails.tsx
│   ├── FleetPlanner.tsx
│   ├── BarcodeManagement.tsx
│   ├── LabelSystem/
│   │   ├── index.tsx                 # Label system tabs
│   │   ├── LabelTemplateDesigner.tsx
│   │   ├── LabelPrintQueue.tsx
│   │   ├── labelData.ts
│   │   └── ...
│   │
│   ├── WarehouseDesigner.tsx         # ★ ENTRY: Full warehouse page (Magazyn + Projektant Layoutu tabs, canvas, sidebar, legend)
│   └── WarehouseDesigner/           # Alternative designer flow (context + grid); not mounted in App
│       ├── WarehouseDesigner.tsx     # Wrapper: WarehouseDesignerProvider + WarehouseGrid + Toolbar + RackConfiguratorPanel
│       ├── WarehouseGrid.tsx         # Grid canvas using WarehouseDesignerContext
│       ├── Toolbar.tsx               # Layout mode toolbar
│       └── RackConfiguratorPanel.tsx # Rack config panel
│
├── types/
│   ├── warehouse.ts                  # LayoutState, BinState, AssignedLocation, product-in-warehouse types
│   ├── labelSystem.ts
│   └── qrcode.d.ts
│
└── warehouse-layout/                 # ★ Layout logic (snap, validation, layers, mode)
    ├── index.ts                      # Barrel: LayoutMode, SnapEngine, ValidationEngine, LayerManager, useLayoutInteractions
    ├── LayoutMode.ts                 # SELECT, DRAW_ROW, DRAW_AISLE, PATH_TOOL, etc.
    ├── useLayoutMode.ts              # useLayoutModeShortcuts, useLayoutModeDisplay
    ├── LayoutModeBadge.tsx           # Badge UI for current mode
    ├── SnapEngine.ts                 # ★ snapPosition (grid/align); SnapConfig, SnapResult, Rect
    ├── ValidationEngine.ts           # ★ validateLayout (constraints, violations)
    ├── LayerManager.ts               # Layer visibility state (racks, visuals, rows, paths)
    └── useLayoutInteractions.ts      # Interaction helpers for layout tools
```

---

## 2. Directory tree (backend)

```
backend/
├── main.py                           # FastAPI app; CORS; mounts all API routers; DB create_all; migrations
├── database.py                       # SQLAlchemy engine, Base, session
│
├── api/                              # ★ FastAPI routers (all under base URL; frontend uses api.get/post/...)
│   ├── warehouse.py                 # Warehouse CRUD
│   ├── warehouse_map.py             # Map/list for warehouse
│   ├── warehouse_layout.py          # ★ GET/POST layout (racks, bins, visuals, row_containers); main source for canvas
│   ├── warehouse_template.py        # Rack templates
│   ├── product.py                   # ★ Products + assigned_locations (product–location mapping)
│   ├── import_api.py                # Import (products/orders)
│   ├── order.py
│   ├── cart.py
│   ├── planning.py
│   ├── simulation.py
│   ├── optimizer.py
│   ├── analysis.py
│   ├── picking_zone.py
│   ├── consolidation_rack.py
│   ├── tenant.py
│   └── label_template.py
│
├── models/                           # SQLAlchemy models
│   ├── __init__.py
│   ├── base.py
│   ├── warehouse.py, warehouse_map.py, warehouse_template.py
│   ├── product.py, order.py, order_item.py
│   ├── cart.py, cart_basket.py, cart_group.py, basket.py
│   ├── storage_unit.py, zone_slot.py, rack_level.py
│   ├── picking_zone.py, consolidation_rack.py
│   ├── tenant.py, label_template.py
│   ├── enums.py
│   └── ...
│
├── schemas/                          # Pydantic request/response
│   ├── warehouse.py, warehouse_layout.py, warehouse_map.py, warehouse_template.py
│   ├── product.py, order.py, cart.py, planning.py, simulation.py, import_schema.py
│   ├── picking_zone.py, consolidation_rack.py, tenant.py, label_template.py
│   ├── storage.py
│   └── ...
│
├── services/                         # Business logic called by API
│   ├── warehouse_service.py, warehouse_map_service.py
│   ├── warehouse_layout_service.py  # ★ Layout load/save (racks, bins, visuals, row_containers)
│   ├── warehouse_template_service.py
│   ├── product (via api/product)
│   ├── import_service.py
│   ├── cart_service.py, planning_service.py, simulation_service.py, optimizer_service.py
│   ├── analysis_service.py, bin_label_service.py
│   ├── picking_zone_service.py, consolidation_rack_service.py
│   ├── tenant_service.py
│   └── ...
│
├── domain/                           # Domain engines (volume, allocation, planning, simulation)
│   ├── order_volume_engine.py
│   ├── cart_allocation_engine.py
│   ├── planning_engine.py
│   ├── simulation_engine.py
│   └── analysis_engine.py
│
├── migrations/
│   ├── 001_order_cart_basket_fk.sql
│   └── 002_warehouse_bins_storage_type.sql
│
└── tests/
    └── test_planning_engine.py
```

---

## 3. Component locations (quick reference)

| Component / area           | Path |
|----------------------------|------|
| **WarehouseCanvas**        | `frontend/src/components/warehouse/WarehouseCanvas.tsx` |
| **WarehouseLegend**        | `frontend/src/components/warehouse/WarehouseLegend.tsx` |
| **RackSidebar**            | `frontend/src/components/warehouse/RackSidebar.tsx` |
| **ProductList**            | `frontend/src/pages/Products/ProductList.tsx` |
| **CSV import/export**      | `frontend/src/pages/Products/LocationMappingExportImport.tsx` |
| **SnapEngine**             | `frontend/src/warehouse-layout/SnapEngine.ts` |
| **ValidationEngine**       | `frontend/src/warehouse-layout/ValidationEngine.ts` |
| **Layout mode / layers**   | `frontend/src/warehouse-layout/` (LayoutMode.ts, LayerManager.ts, useLayoutInteractions.ts) |

---

## 4. API / backend communication

- **Single client:** All frontend HTTP calls use the axios instance from **`frontend/src/api/axios.ts`** (base URL `http://127.0.0.1:8010`, trailing slash enforced).
- **Usage:** Pages and components `import api from "../api/axios"` (or relative path) and call `api.get(...)`, `api.post(...)`, etc. No separate “services” folder; API paths are inline in components/pages.
- **Relevant backend routes for warehouse + products:**
  - **Layout (canvas data):** `GET/POST /warehouse/layout/` — **`backend/api/warehouse_layout.py`** → **`backend/services/warehouse_layout_service.py`**
  - **Products + locations:** **`backend/api/product.py`** (product list, assigned_locations)
  - **Warehouse list / map:** **`backend/api/warehouse.py`**, **`backend/api/warehouse_map.py`**
  - **Import:** **`backend/api/import_api.py`**

---

## 5. Responsibilities (one sentence per main directory)

| Directory | Role in WMS |
|-----------|-------------|
| **frontend/src/api** | Defines the single axios client for all FastAPI calls (base URL and interceptors). |
| **frontend/src/components/warehouse** | Renders the interactive warehouse map (canvas, legend, side panel, modals) and shared warehouse UI (side view, location picker, product search). |
| **frontend/src/warehouse-layout** | Contains layout logic: snap-to-grid (SnapEngine), layout validation (ValidationEngine), layer visibility, and layout mode (select, draw row, aisle, path). |
| **frontend/src/pages/Products** | Product list, filters, pagination, product edit; CSV export/import for product–location mapping (LocationMappingExportImport). |
| **frontend/src/pages/WarehouseDesigner.tsx** | Main warehouse page: Magazyn vs Projektant Layoutu tabs, canvas, sidebar, legend; state for layout, products, selection; **calculates per-bin used volume (dm³) from products and assigned locations for occupancy display.** |
| **frontend/src/context** | Global warehouse selection (WarehouseContext), designer state (WarehouseDesignerContext), carts refresh (CartsRefreshContext). |
| **frontend/src/types** | Shared TypeScript types for warehouse (LayoutState, bins, assigned locations), labels, etc. |
| **backend/api** | FastAPI route handlers; expose warehouse, layout, product, order, cart, import, etc. |
| **backend/services** | Business logic for layout, products, orders, carts, simulation, optimization. |
| **backend/domain** | Domain engines: order volume, cart allocation, planning, simulation, analysis (e.g. dm³ / capacity logic can live here or in services). |

---

## 6. Entry points and view switching

### 6.1 Where the Warehouse Designer is initialized

- **App entry:** **`frontend/src/main.tsx`** renders **`App`**.
- **Router:** **`frontend/src/App.tsx`** defines routes; **`WarehouseDesigner`** is imported from **`./pages/WarehouseDesigner`** (resolves to the **file** **`pages/WarehouseDesigner.tsx`**, not the folder).
- **Mounted routes:**  
  - **`/designer`** → **`<WarehouseDesigner />`**  
  - **`/warehouse-designer`** → **`<WarehouseDesigner />`**
- **Sidebar link:** **`frontend/src/layout/MainLayout.tsx`** links to **`/designer`** with label from **`UI_STRINGS.navigation.warehouseDesigner`** (“Projektant Magazynu”).

So the **single entry component** for the interactive warehouse layout in the app is:

**`frontend/src/pages/WarehouseDesigner.tsx`** (default export).

The folder **`frontend/src/pages/WarehouseDesigner/`** contains an alternative flow (WarehouseDesignerProvider + WarehouseGrid + Toolbar + RackConfiguratorPanel) and is **not** referenced in **App.tsx**; it can be used for a map-by-id or future refactor.

### 6.2 How “Magazyn” vs “Projektant” views are switched

- **State:** In **`frontend/src/pages/WarehouseDesigner.tsx`**:
  - `mainView` is `"magazyn" | "layout"` (line ~457).
  - Default is `"layout"`; can be synced from URL `searchParams.get("view") === "layout"`.
  - `isLiveView = mainView === "magazyn"`.
- **UI:** In the same file, header has two buttons (~3310–3324):
  - **Magazyn:** `onClick={() => { setMainView("magazyn"); ...; setSearchParams(next); }}`  
    - Label: `UI_STRINGS.warehouse.designerSubTabs.magazyn` (“Magazyn”).
  - **Projektant Layoutu:** `onClick={() => { setMainView("layout"); ... setSearchParams(next); }}`  
    - Label: `UI_STRINGS.warehouse.designerSubTabs.layoutDesigner` (“Projektant Layoutu”).
- **Content branching:**  
  - `mainView === "magazyn"` → Magazyn dashboard (rack count, summary by template, dm³ occupancy bar), then main area with map + sidebar.  
  - `mainView === "layout"` → Layout designer (same canvas in edit mode: add/edit racks, visuals, rows, paths).  
- **Read-only in Magazyn:** In Magazyn view, RackSidebar is catalog-only (no “Visual” / layout actions); product list in side view has no “Edit / Remove from location” (only in Projektant Layoutu). EditProductModal is not rendered in Magazyn.

So: **one page, two modes** controlled by **`mainView`** in **`pages/WarehouseDesigner.tsx`**; URL can reflect `?view=layout`.

---

## 7. dm³ occupancy (source of truth)

- **Calculation:** In **`frontend/src/pages/WarehouseDesigner.tsx`**:
  - **`usedVolumeAtBin(bin)`** (callback, ~531–548): For each product, sums `quantity * volume_dm3` for assignments to that bin (by `locationUUID` or `location_id`/label). Returns used dm³ per bin.
  - **`displayRack`** (~549–557): Selected rack with bins enriched with `used_volume_dm3` / `current_load_dm3` from `usedVolumeAtBin` (for occupancy bar in side view).
  - **`summaryByTemplate`** (~2965–2976): Per-rack used vs total capacity using `usedVolumeAtBin` and `binVolumeDm3`; used for “Zajętość (dm³)” in the Magazyn dashboard.
- **Product volume:** In **`frontend/src/pages/Products/ProductList.tsx`**, **`volumeDm3(p)`** (~32–36): uses `p.volume` or `(length*width*height)/1000` for display/filtering.

---

## 8. Summary checklist for future updates

- **Interactive warehouse layout:**  
  - Canvas/legend/sidebar: **`components/warehouse/`** (WarehouseCanvas, WarehouseLegend, RackSidebar).  
  - Layout rules: **`warehouse-layout/`** (SnapEngine, ValidationEngine, LayoutMode, LayerManager).  
  - Page and Magazyn/Projektant switch: **`pages/WarehouseDesigner.tsx`**.
- **Product–location mapping:**  
  - List and CSV: **`pages/Products/ProductList.tsx`**, **`pages/Products/LocationMappingExportImport.tsx`**.  
  - API: **`backend/api/product.py`** (and **`backend/api/warehouse_layout.py`** for bin/layout structure).
- **API:**  
  - Frontend: **`api/axios.ts`** (single client).  
  - Backend: **`backend/main.py`** (routers), **`backend/api/*.py`** (routes), **`backend/services/*.py`** (logic).

Use this map to avoid path errors when changing the interactive warehouse layout or product-location features.
