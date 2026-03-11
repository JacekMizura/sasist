# Project Context: Analiza magazynowa (WMS)

Structured technical overview for onboarding another AI or developer. Do not paste full source code when using this; refer to architecture, structure, and key files below.

---

## 1. PROJECT OVERVIEW

**What the system does**

The application is a **Warehouse Management System (WMS)** focused on warehouse analysis, cart/fleet management, order picking, and label design/printing. It supports multi-tenant (SaaS) operation: each tenant has warehouses, products, orders, carts, and label templates. Main workflows include: defining warehouse layouts (racks, bins, aisles), managing products and orders, assigning orders to carts (BULK or MULTI with baskets), planning and simulating fleet usage, running picking waves, and designing/printing labels for locations, carts, baskets, and label packs (e.g. one cart label + N basket labels per cart).

**Main features**

- **Tenants & warehouses**: Multi-tenant; each tenant has warehouses and optional warehouse layouts (grid, racks, bins, aisles).
- **Products & orders**: Product catalog with dimensions/volume; orders with order items; import (CSV).
- **Carts & baskets**: Carts (BULK or MULTI), optional cart groups; MULTI carts have baskets (grid row/column) with dimensions and optional order assignment per basket.
- **Planning & simulation**: Optimizer (fleet planner), simulation with cart assignment, analysis.
- **Warehouse designer**: Visual layout of warehouse (racks, bins), storage locations, consolidation racks, picking zones.
- **Label system**: Two designer UIs (main designer saving to `SavedLabelTemplate`, v2 designer saving to `LabelTemplate`); PDF generation uses **only** `SavedLabelTemplate.template_json`. Label packs combine templates (e.g. cart + basket) and generate one PDF per cart.
- **Picking waves**: Waves group orders; orders can be assigned to a wave.
- **Scan / barcode**: Scan API; barcodes on carts, baskets, products, orders, locations; legacy barcode-only PDFs and template-based label PDFs.

**Main modules**

- **Backend**: FastAPI app (`backend/main.py`), API routers under `backend/api/`, models `backend/models/`, services `backend/services/`, schemas `backend/schemas/`, domain logic in `backend/domain/`.
- **Frontend**: React SPA (Vite + TypeScript), routes in `App.tsx`, pages under `frontend/src/pages/`, layout in `frontend/src/layout/`, shared components and contexts.

**Technology stack**

- **Backend**: Python, FastAPI, SQLAlchemy (declarative), SQLite (current DB), ReportLab + qrcode for PDF/barcodes.
- **Frontend**: React 19, TypeScript, Vite, React Router, Axios, Tailwind CSS, Lucide React.
- **Database**: SQLite (`./test.db`); schema created/migrated on startup via `Base.metadata.create_all` and inline migrations in `main.py`.

---

## 2. TECH STACK

| Layer      | Technologies |
|-----------|--------------|
| **Backend** | FastAPI, SQLAlchemy, Python 3.x |
| **Frontend** | React 19 + TypeScript + Vite |
| **Database** | SQLite (currently; file `test.db`) |
| **Libraries** | Backend: ReportLab, qrcode[pil]; Frontend: axios, react-router-dom, tailwindcss, lucide-react, jsbarcode, jspdf, html2canvas, qrcode |

---

## 3. PROJECT DIRECTORY STRUCTURE

```
Analiza magazynowa/
├── backend/
│   ├── main.py              # FastAPI app, CORS, DB init, migrations, router includes
│   ├── database.py          # SQLite engine, SessionLocal, Base, get_db
│   ├── api/                 # API routers (one file per domain)
│   │   ├── cart.py          # Carts, groups, labels/barcodes PDFs
│   │   ├── label_template.py   # SavedLabelTemplate CRUD (template_json)
│   │   ├── label_templates_v2.py # LabelTemplate CRUD (layout_json, dataset)
│   │   ├── label_sizes.py   # Label sizes (mm)
│   │   ├── labels.py        # Templates by type (location, cart, basket, …)
│   │   ├── label_pack.py    # Label packs list, generate PDF by pack_id + cart_id
│   │   ├── warehouse.py
│   │   ├── warehouse_layout.py  # Layout get/save, location labels PDF
│   │   ├── tenant.py
│   │   ├── product.py
│   │   ├── order.py
│   │   ├── wave.py
│   │   ├── scan.py
│   │   ├── simulation.py
│   │   ├── planning.py
│   │   ├── analysis.py
│   │   ├── optimizer.py
│   │   ├── picking_zone.py
│   │   ├── consolidation_rack.py
│   │   ├── warehouse_map.py
│   │   ├── warehouse_template.py
│   │   └── import_api.py
│   ├── models/              # SQLAlchemy models
│   │   ├── __init__.py      # Exports Tenant, Cart, CartBasket, Order, SavedLabelTemplate, LabelPack, etc.
│   │   ├── tenant.py
│   │   ├── cart.py
│   │   ├── cart_basket.py
│   │   ├── cart_group.py
│   │   ├── order.py
│   │   ├── order_item.py
│   │   ├── product.py
│   │   ├── warehouse.py     # Warehouse, WarehouseLayout, Rack, Aisle, Bin, StorageLocation
│   │   ├── label_template.py # SavedLabelTemplate (template_json)
│   │   ├── label_template_v2.py # LabelTemplate (layout_json, dataset)
│   │   ├── label_size.py
│   │   ├── label_pack.py    # LabelPack, LabelPackItem
│   │   ├── wave.py
│   │   └── ...
│   ├── schemas/             # Pydantic request/response models
│   ├── services/            # Business logic
│   │   ├── cart_service.py
│   │   ├── label_pack_service.py
│   │   ├── label_render_service.py  # PDF from template_json + records
│   │   ├── label_engine.py           # Low-level element rendering (text, barcode, rect, line, group, repeater)
│   │   ├── warehouse_layout_service.py # Layout CRUD, location label records, location labels PDF
│   │   ├── migration_runner.py
│   │   └── ...
│   ├── domain/              # Planning, simulation, analysis engines
│   └── migrations/         # SQL migration files (e.g. 003_waves.sql)
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Routes: dashboard, products, orders, carts, optimizer, waves, designer, labels, setup
│   │   ├── layout/          # MainLayout, Sidebar, Topbar
│   │   ├── pages/           # Page components
│   │   │   ├── LabelSystem/
│   │   │   │   ├── index.tsx       # Label system shell, routes: list, designer, v2, queue
│   │   │   │   ├── LabelTemplatesList.tsx   # SavedLabelTemplate list
│   │   │   │   ├── LabelTemplatesListV2.tsx # LabelTemplate list (v2)
│   │   │   │   ├── LabelTemplateDesigner.tsx # Designer that saves to SavedLabelTemplate (template_json)
│   │   │   │   ├── LabelDesignerV2.tsx       # Designer that saves to LabelTemplate (layout_json)
│   │   │   │   └── LabelPrintQueue.tsx
│   │   │   ├── CartsComponents/
│   │   │   ├── Products/
│   │   │   ├── Orders/
│   │   │   ├── WarehouseDesigner.tsx
│   │   │   ├── PickingWaves.tsx
│   │   │   └── ...
│   │   ├── components/      # Reusable UI (warehouse, ErrorBoundary, etc.)
│   │   ├── context/         # WarehouseContext, CartsRefreshContext, etc.
│   │   ├── api/             # axios instance
│   │   ├── services/
│   │   ├── types/           # labelSystem.ts, labelSystemV2.ts, warehouse.ts
│   │   ├── constants/
│   │   └── locales/
│   └── package.json
│
└── test.db                  # SQLite database (git-ignored or local)
```

**Directory purposes**

- **backend/api**: HTTP endpoints; thin layer calling services.
- **backend/models**: DB tables and ORM relationships.
- **backend/services**: Core logic (cart CRUD, label PDF generation, layout, waves, etc.).
- **backend/schemas**: Request/response validation and serialization.
- **backend/domain**: Pure logic (planning, simulation, analysis) used by services.
- **frontend/src/pages**: Route-level screens; LabelSystem contains both “main” and “v2” label flows.
- **frontend/src/components**: Shared UI (warehouse views, modals, etc.).

---

## 4. IMPORTANT BACKEND MODELS

| Model | Purpose |
|-------|--------|
| **Tenant** | Top-level tenant; has default_cart_template_id, default_basket_template_id, default_location_template_id (FK to SavedLabelTemplate). |
| **Cart** | Cart entity: tenant_id, warehouse_id, group_id, name, barcode, type (BULK/MULTI), dimensions, total_volume, used_volume, capacity_mode, max_orders, status. MULTI carts have baskets. |
| **CartBasket** | Basket in a MULTI cart: cart_id, name, barcode, row, column, inner dimensions, usable_volume, used_volume, order_id (one order per basket). |
| **CartGroup** | Group of carts (optional). |
| **Order** | Order header: tenant_id, warehouse_id, cart_id, basket_id, total_volume_dm3, wave_id, barcode, etc. |
| **OrderItem** | Order line: product, quantity, volume. |
| **Product** | Product catalog: dimensions, volume, barcode, assigned_locations, etc. |
| **Warehouse** | Tenant’s warehouse (hall). |
| **WarehouseLayout** | Layout for a warehouse: grid_cols/rows, width_m/length_m, row_containers_json. |
| **Rack** | Rack in a layout: position (x, y in 10cm units), dimensions, levels, bins_per_level, aisle_letter, rack_index, internal_structure (JSON). |
| **Bin** | Smallest location unit: rack_id, label, barcode, level_index, segment_index, volume_dm3, storage_type (primary/reserve). |
| **StorageLocation** | Physical coordinates (x_cm, y_cm, z_cm) for a bin. |
| **SavedLabelTemplate** | **Used for all label PDF generation.** tenant_id, name, template_type (location|cart|basket|product|order), **template_json** (full template JSON from main designer). |
| **LabelTemplate** (v2) | Separate table for v2 designer: tenant_id, name, dataset, label_size_id, **layout_json**, is_default. **Not used for PDF**; PDF uses only SavedLabelTemplate. |
| **LabelSize** | Preset sizes: name, width_mm, height_mm. |
| **LabelPack** | Named pack per tenant (e.g. “Cart with baskets”). |
| **LabelPackItem** | Item in a pack: pack_id, template_id (→ SavedLabelTemplate), object_type (cart|basket|location|product), quantity_type (single|per_basket|per_location|per_product). |
| **Wave** | Picking wave; orders can reference wave_id. |

**Relations (concise)**

- Tenant → Warehouses, Carts, SavedLabelTemplates, LabelPacks, LabelTemplates (v2).
- Cart → CartBaskets (cascade); Cart → Orders (assigned_orders); Cart → CartGroup.
- Order → Cart, Basket (CartBasket); Order → Wave.
- CartBasket → Order (order_id: one order per basket).
- LabelPack → LabelPackItem → SavedLabelTemplate (each item points to one template used for PDF).
- Location data: Warehouse → WarehouseLayout → Rack → Bin; StorageLocation links warehouse, rack, bin and coordinates.

---

## 5. LABEL SYSTEM ARCHITECTURE

**Flow (PDF generation uses only SavedLabelTemplate)**

1. **LabelTemplateDesigner** (frontend) → saves to **SavedLabelTemplate** via `/label-templates` (POST/PUT) with **template_json**.
2. **LabelDesignerV2** (frontend) → saves to **LabelTemplate** via `/label-templates-v2` with **layout_json** (dataset, label_size_id). This is “designer UI only”; **no PDF is generated from LabelTemplate** in the current backend.
3. When generating PDFs:
   - **SavedLabelTemplate.template_json** is loaded and passed to **label_render_service** (e.g. `render_label_template`, `build_label_pdf`, `build_label_pdf_multi`).
   - **label_render_service** normalizes template (widthMm, heightMm, elements), then calls **label_engine** to draw elements (text, barcode, rect, line, icon, group, repeater) and produce PDF (ReportLab).

**Template structure (template_json from main designer)**

- Root: `widthMm`, `heightMm`, `dpi`, `elements` (array of elements).
- Coordinates: top-left origin in mm; backend converts to PDF points (bottom-left) when rendering.
- Element types (see section 8): staticText, dynamicText, barcode, rectangle/rect, line (and in label_engine: icon, group, repeater).

**How elements are rendered**

- **label_render_service**: Parses template_json, builds one page per record (or multiple pages for multi-label PDFs). For each element, resolves bindings from the **record** (e.g. `{cart_barcode}`, `barcode_data`, `loc_name`).
- **label_engine**: `render_elements` walks the `elements` array; for each type (staticText, dynamicText, text, barcode, rect, rectangle, line, icon, group, repeater) it draws on the ReportLab canvas. Barcode: Code128 or QR. Dynamic text: value from `record[binding]`.

---

## 6. KEY BACKEND SERVICES

| Service | Purpose |
|--------|--------|
| **cart_service** | Cart CRUD, multi-cart creation, basket updates, volume/capacity logic, assignment of orders to carts/baskets. Ensures cart/basket barcodes; builds label records for cart/basket. **get_cart_labels_pdf** / **get_basket_labels_pdf** use default SavedLabelTemplate and **label_render_service.build_label_pdf**. |
| **label_pack_service** | Loads a LabelPack and its items (each item → SavedLabelTemplate). For a given cart_id, builds records per item (e.g. one cart record, N basket records). Calls **label_render_service.build_label_pdf_multi** with (template, record) pairs to produce one PDF (one page per label). |
| **label_render_service** | Entry points: **render_label_template** (by template_id + records), **build_label_pdf** (template dict + records), **build_label_pdf_multi** (list of (template, record)). Normalizes template (widthMm, heightMm, elements), then uses **label_engine** to render. **template_json_to_dict** parses DB template_json string to dict. |
| **label_engine** | Low-level rendering: **render_elements** (recursive), **render_label_to_canvas_engine**, **build_label_pdf_engine**. Handles staticText, dynamicText/text, barcode (Code128/QR), rect/rectangle, line, icon, **group** (nested elements), **repeater** (horizontal/vertical repeat over a list in the record). Rotation (0, 45, 90, 180); optional conditional styling. |
| **warehouse_layout_service** | Get/save warehouse layout (racks, bins, aisles). **get_location_label_records** builds list of records (loc_name, loc_barcode, zone, barcode_data, etc.) from layout bins. **get_location_labels_pdf** uses default or given SavedLabelTemplate and **render_label_template** to generate location labels PDF. |

---

## 7. KEY API ENDPOINTS

| Endpoint | What it does |
|----------|----------------|
| **GET/POST /label-templates** | List/create SavedLabelTemplate (template_json, template_type). Used by main label designer. |
| **GET/PUT/DELETE /label-templates/{id}** | Get/update/delete SavedLabelTemplate. |
| **GET /label-templates/by-type/{type}** | List SavedLabelTemplate by template_type (location, cart, basket, product, order). |
| **GET/POST /label-templates-v2** | List/create LabelTemplate (layout_json, dataset, label_size_id, is_default). Used by v2 designer. |
| **GET/PUT/DELETE /label-templates-v2/{id}** | Get/update/delete LabelTemplate. |
| **GET /label-sizes/** | List label sizes (width_mm, height_mm). |
| **GET /labels/templates/by-type/{type}** | List SavedLabelTemplate by type with is_default from tenant. |
| **GET /label-packs** | List LabelPacks with items (template_id, object_type, quantity_type). |
| **POST /label-packs/{pack_id}/generate** | Body: `{ "cart_id": N }`. Returns one PDF: one page per label (cart + baskets, etc.) using SavedLabelTemplate.template_json per item. |
| **GET /carts/** | List carts (optional cart_type). |
| **GET /carts/{id}/** | Cart details with baskets. |
| **GET /carts/{id}/labels** | PDF of cart label (default cart template from SavedLabelTemplate). |
| **GET /carts/{id}/basket-labels** | PDF of basket labels (default basket template). |
| **GET /carts/{id}/all-barcodes** | Legacy barcode-only PDF (cart + baskets). |
| **GET /warehouse/layout** | Get warehouse layout (tenant_id, warehouse_id). |
| **GET /warehouse/layout/labels** | Location labels PDF (optional template_id; else default location SavedLabelTemplate). |
| **POST/PUT /warehouse/layout** | Save warehouse layout. |

There is no single `/labels/print` endpoint; printing is done via:

- **Cart/basket labels**: `GET /carts/{id}/labels`, `GET /carts/{id}/basket-labels`, or `POST /label-packs/{pack_id}/generate` with `cart_id`.
- **Location labels**: `GET /warehouse/layout/labels?tenant_id=&warehouse_id=&template_id=`.

---

## 8. TEMPLATE JSON STRUCTURE

**Example (minimal) template_json (used by main designer and backend PDF):**

```json
{
  "widthMm": 50,
  "heightMm": 30,
  "dpi": 300,
  "elements": [
    {
      "id": "el-1",
      "type": "staticText",
      "x": 2,
      "y": 2,
      "width": 20,
      "height": 5,
      "text": "Cart:",
      "fontSize": 10,
      "bold": true
    },
    {
      "id": "el-2",
      "type": "dynamicText",
      "x": 2,
      "y": 8,
      "width": 40,
      "height": 6,
      "binding": "{cart_name}",
      "fontSize": 12
    },
    {
      "id": "el-3",
      "type": "barcode",
      "x": 2,
      "y": 16,
      "width": 46,
      "height": 12,
      "dataBinding": "barcode_data",
      "format": "Code128",
      "showValue": true
    },
    {
      "id": "el-4",
      "type": "rectangle",
      "x": 0,
      "y": 0,
      "width": 50,
      "height": 30,
      "strokeWidth": 0.5
    },
    {
      "id": "el-5",
      "type": "line",
      "x": 0,
      "y": 14,
      "width": 50,
      "height": 0,
      "strokeWidth": 0.3
    }
  ]
}
```

**Element types (backend supports these; frontend types may use slightly different names):**

| Type | Description |
|------|-------------|
| **staticText** | Fixed text: `text`, `fontSize`, `bold`, optional `verticalText`, `textColor`/`backgroundColor`. |
| **dynamicText** / **text** | Text from record: `binding` or `dataBinding` (e.g. `{cart_name}`, `loc_name`). Same style options as staticText. |
| **barcode** | Barcode: `dataBinding` or `binding` for value (e.g. `barcode_data`, `{cart_barcode}`). `format`: Code128 (default) or QR. `showValue` to show text below. |
| **rectangle** / **rect** | Rectangle: `x`, `y`, `width`, `height`, optional `strokeWidth`, `fill`/`backgroundColor`, `conditions` (conditional fill by binding value). |
| **line** | Line from (x,y) to (x+width, y+height): `strokeWidth`, color. |
| **icon** (label_engine) | Simple shapes (arrow_up, arrow_down, etc.). |
| **group** (label_engine) | Container with nested `elements`; children use relative position. |
| **repeater** (label_engine) | Repeats nested template over a list in the record (e.g. `dataset` key); direction horizontal/vertical. |

Coordinates are in mm; origin top-left in designer; backend converts to PDF points with bottom-left origin per page.

---

## 9. CURRENT PROBLEMS / TODO

- **Two template systems**: Main designer → SavedLabelTemplate.template_json (used for PDF). V2 designer → LabelTemplate.layout_json (not used for PDF). Unifying or clearly documenting which UI feeds which PDF flow would reduce confusion.
- **Tenant_id**: Many API endpoints default `tenant_id=1`; multi-tenant selection may not be wired in the UI everywhere.
- **LabelDesignerV2**: Saves to LabelTemplate only; if the goal is to print from v2 templates, either sync to SavedLabelTemplate or add a PDF path that reads from LabelTemplate.layout_json and converts to the same format as template_json.
- **Migrations**: Schema changes are partly done in `main.py` with inline `_migrate_*` functions; some schema checks only log warnings. A single migration runner (e.g. `migration_runner.py` + SQL files) could be used consistently.
- **Database**: SQLite is fine for single-tenant/small scale; for production multi-tenant, consider PostgreSQL and connection handling.
- **CORS**: Currently allows only `http://localhost:5173`; adjust for production frontend origin.
- **Product/order label types**: Label pack service has placeholders for object_type product/order but returns empty records; location/cart/basket are implemented.

---

## 10. DEVELOPMENT NOTES

- **PDF source of truth**: All label PDFs are generated from **SavedLabelTemplate.template_json** only. LabelTemplate (v2) and label_templates table are for the v2 designer and default-per-dataset only; they do not drive PDF generation.
- **Label pack items**: Each LabelPackItem references **SavedLabelTemplate** (template_id). object_type (cart, basket, location, product) and quantity_type (single, per_basket, per_location, per_product) determine how many records are generated; label_pack_service builds (template, record) pairs and calls build_label_pdf_multi.
- **Default templates**: Tenant has default_cart_template_id, default_basket_template_id, default_location_template_id. If not set, cart_service and warehouse_layout_service fall back to “first template of that type” for the tenant.
- **Coordinates**: Designer uses top-left origin in mm; ReportLab uses bottom-left in points. label_render_service and label_engine convert: `y_pdf = label_height_mm - y_design_mm - height_mm`.
- **Bindings**: Record keys can be with or without braces (e.g. `cart_name` or `{cart_name}`). Backend resolves both; frontend preview uses same record shape (see PREVIEW_SAMPLES in labelSystem.ts, PREVIEW_BY_DATASET in labelSystemV2.ts).
- **Barcodes**: Cart and basket barcodes are ensured by cart_service (e.g. CART-0001, CART-0001-B02). Location barcodes come from warehouse_layout_service (e.g. LOC-A01-03-02). Products/orders may have barcode column.
- **Frontend label routes**: `/labels` (list), `/labels/designer/:id` (main designer), `/labels/v2`, `/labels/v2/designer/:id` (v2 designer), `/labels/queue` (print queue).
- **Backend entry**: Run FastAPI from project root (or backend) so that `./test.db` and imports resolve; migrations run on startup.

---

*End of project context document.*
