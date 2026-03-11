# Changelog projektu

## Ostatnie zmiany

### Dodano

* **POST /dev/putaway-import-stock:** putaway utility – move stock from Import to storage locations. Parameters tenant_id, warehouse_id. Finds "Import", distributes stock rows randomly across storage locations (excludes Import, Buffer, Packing, etc.); large quantities split across 2–3 locations. Returns rows_processed, locations_used. For development.

* **POST /dev/distribute-import-stock:** distribute stock from Import location into storage. Parameters tenant_id, warehouse_id. Finds location "Import", moves each stock row to a random storage location (excludes Import, Buffer, Packing, etc.); quantities >50 are split across 2–3 locations. Returns rows_processed, locations_used. For development/testing.

* **POST /dev/sync-inventory-to-stock:** sync inventory table to stock table. Reads all inventory records (tenant_id, product_id, warehouse_id, location_id); for each, creates a stock row with default_quantity (default 10) if none exists; does not overwrite existing stock. Returns products_processed, stock_rows_created, stock_rows_existing. For development/testing.

* **POST /dev/generate-test-stock:** generate test warehouse stock (tenant_id, warehouse_id, product_limit default 200). Randomly assigns products to storage locations (excludes special: IMPORT, BUFFER, PACKING etc.), quantities 1–100, respects location capacity; replace_existing optional. Returns products_assigned, locations_used, total_stock_rows_created.

* **Added ability to delete simulated picks data.**

* **Made inventory_unit_id optional in Pick model to support simulated picking.**

* **Picking Analysis now supports generating simulated picks from orders without uploading files.**

* **Added Picking Analysis page with picks table and warehouse heatmap.**

* **Added Pick model to track product picking events.**

* **Hot Locations analysis now uses picks table instead of order_items.**

* **Added warehouse rack highlighting for products.** Products page: "Show in warehouse" action opens a modal with the warehouse rack map (same visualization as Magazyn view). Racks containing the product are highlighted in green. Tooltip on hover shows rack name, product name, and list of locations with quantities. Rack ID derived from location name (first segment before dash, e.g. A3-2-1 → A3). Backend: product locations response includes warehouse_id for warehouse selection.

* **Products table now displays real inventory locations instead of assigned_locations.** Backend: product list and single-product responses include `locations: [{ name, quantity }]` from inventory JOIN locations (quantity &gt; 0). Frontend: column "Lokalizacje" shows inventory locations as "Name (qty)"; if more than 2 locations, shows "N lokalizacje" with tooltip listing all.

* **Added testing tool to randomly assign products to warehouse locations.** Backend POST `/products/randomize-locations/{warehouse_id}` (body: `tenant_id`) reassigns inventory rows (quantity &gt; 0) to random storage locations (excludes PICK_START, PACKING, DOCK); respects location capacity when max_volume/max_weight/max_units exist. Response: products_processed, assigned_successfully, failed_assignments. Frontend: "Randomize product locations" button on Products page, confirmation dialog with warehouse selector, result summary.

* **Added product filters to Slotting analysis.** Backend GET `/analysis/slotting/{warehouse_id}` accepts optional query params `name` (LIKE), `ean`, `sku`; filters are applied on the products table before slotting calculations. Frontend: filter panel (Product name, EAN, SKU) and Search button above the slotting table.

* **Added product filters and pagination to Hot Products, Product Rotation and Batch Picking analysis.**

* **Added filters and pagination to Dead Stock analysis.** Backend GET `/analysis/dead-stock` accepts optional `name` (LIKE), `ean`, `sku`, `sales_start_date`, `sales_end_date`, and `limit` (10, 25, 50, 100, 500; default 25). Sales date range filters order_items by orders.order_date. Frontend: filter panel (Product name, EAN, SKU, Sales from/to), rows per page dropdown, Search button.

* **Picking Strategy Analysis now supports simulation based on order date ranges.** Backend GET `/analysis/picking-strategy/{warehouse_id}` accepts optional `start_date` and `end_date` (YYYY-MM-DD); when both are provided, orders are filtered by `order_date` in that range, otherwise the most recent orders (limit) are used. Frontend: date range selector with presets (Last 7 days, Last 30 days, Custom range), Start/End date inputs, and dataset statistics (Total orders, Total items, Average items per order).

* **Added pick_sequence column to locations table for picking strategy simulation.** Column is INTEGER nullable, with index; migration 006 and startup schema check ensure it exists. When NULL, ordering falls back to location.id so the application does not crash.

* **Restored Analytics entry in sidebar.** Single „Analiza” link (path /analytics, AnalyticsIcon) between System etykiet and Setup; no nested items; navigation stays in module tabs.

* **Refactored Analytics navigation to module tabs instead of sidebar nesting.** Sidebar has a single „Analiza” entry (like Wózki). Analytics page uses top tabs: Dashboard, Analityka, Symulacje, Optymalizacja, Mapy; each tab shows its own sub-navigation and content. All routes unchanged.

* **Refactored analytics module into unified analytics architecture with grouped sidebar navigation.** All analysis/simulation pages now live under `/analytics/*`; the old `/analysis` layout and ANALYSIS_TABS are no longer used. Sidebar „Analiza” has four collapsible groups: ANALITYKA (Dashboard, Wartość magazynu, Zalegający towar, Rotacja produktów, Gorące produkty, Produkty kupowane razem, Koszt chodzenia, Gorące lokalizacje, Gęstość kompletacji, Prognoza sprzedaży, Batch picking), SYMULACJE (Symulacja trasy, Symulacja dnia, Czas kompletacji, Ruch magazynierów), OPTYMALIZACJA (Slotting, Strategia kompletacji, Optymalizacja layoutu, Przepustowość), MAPY (Mapa magazynu, Problemy kompletacji). Legacy `/analysis/*` URLs redirect to `/analytics/*`. Every analytics page uses PageLayout.

* **Refactored analytics navigation to use collapsible sidebar submenu.** „Analiza” in the main sidebar is now a single collapsible section: click to expand/collapse; sub-items (Dashboard, Wartość magazynu, Zalegający towar, Rotacja produktów, Gorące produkty, Produkty kupowane razem, Koszt chodzenia, Gorące lokalizacje) appear indented when expanded. Single-column sidebar; no separate internal panel.

* **Refactored analytics module into separate pages with sidebar navigation.** Analytics (Dashboard, Wartość magazynu, Zalegający towar, Rotacja produktów, Gorące produkty, Produkty kupowane razem, Koszt chodzenia, Gorące lokalizacje) are now separate routes under `/analytics/*` with dedicated sidebar entries under „Analiza”; each page uses PageLayout. Old `/analysis/dashboard`, `/analysis/inventory-value`, etc. redirect to the new `/analytics/*` routes.

* **Picking Strategy Analysis.** New analytics feature „Strategia kompletacji”: backend GET `/analysis/picking-strategy/{warehouse_id}` (query: tenant_id, limit) uses picking_simulation module to simulate Cart, Basket, Zone, and Hybrid strategies on recent orders; returns metrics per strategy (total_walking_distance, estimated_picking_time, estimated_packing_time, required_picker_count, orders_per_hour). Frontend: new tab „Strategia kompletacji” in Analiza with warehouse selector, number of orders, cart capacity / basket count / zone count inputs, RUN SIMULATION button, strategy comparison table, bar chart (orders per hour), and best-strategy recommendation. Uses orders, inventory, warehouse graph, pick_sequence.

* **Changed PageLayout to full-width WMS layout (removed max-width container).** PageLayout container now uses width 100% with horizontal padding only (24px left/right); removed max-width 1200px and center margins so tables and data grids use full horizontal space. PageHeader margin-bottom reduced to 12px. Optional tabs slot for content below header. Sidebar layout unchanged.

* **Standardized page layout using PageLayout component.** New `frontend/src/components/layout/PageLayout.tsx`: PageHeader (flex, space-between, title 24px/600 left-aligned, optional actions), PageContent (gap 24px). Page container: max-width 1200px, mx-auto, padding 24px. Optional fullWidth and fillHeight for full-width/canvas pages. Products, Inventory, Orders, Fleet Planner, Picking Waves, Warehouse Designer, Label System, and Analytics (WmsModuleLayout) now use PageLayout; titles moved to PageHeader, cards contain only content.

* **Picking Strategy Simulation Engine (analytics).** New module `backend/domain/picking_simulation/`: simulates CART, BASKET, ZONE, and HYBRID picking strategies for a given warehouse and set of orders. Uses orders, order_items, inventory locations, warehouse graph, and pick_sequence. Each strategy returns metrics: total_walking_distance, estimated_picking_time, estimated_packing_time, required_picker_count, orders_per_hour. CART: batched orders, mixed in cart, fast pick / slower packing. BASKET: 1 basket = 1 order, medium pick / very fast packing. ZONE: locations split by pick_sequence into zones, parallel pickers, consolidation. HYBRID: small orders (1–2 items) → CART, medium (3–6) → BASKET, large (7+) → ZONE. Entry point: `run_strategy_simulation(db, tenant_id, warehouse_id, order_ids)`. Analytics only; no changes to execution logic.

* **Replaced custom sidebar icons with Lucide icon library for consistency.** Sidebar (MainLayout) now uses `lucide-react` (Home, Package, Archive, ClipboardList, ShoppingCart, Route, ListChecks, Warehouse, Tag, BarChart3, Settings, Cpu). Icons inherit color: inactive `text-slate-500`, hover `hover:text-slate-700`, active `text-white`. Removed `frontend/src/icons/sidebar/` and `frontend/src/assets/sidebar-icons/`.

* **Added unified sidebar icon pack and improved sidebar icon color states.** New sidebar icons in `frontend/src/icons/sidebar/` (DashboardIcon, ProductsIcon, InventoryIcon, OrdersIcon, CartsIcon, FleetPlannerIcon, PickingWavesIcon, WarehouseDesignerIcon, LabelsIcon, AnalyticsIcon, SetupIcon, SystemIcon) matching SVGs in `frontend/src/assets/sidebar-icons/`. Each component: functional, `size` (default 20), `className`, viewBox preserved, width/height from `size`, color via `currentColor`. Sidebar navigation (MainLayout) uses this pack exclusively. Icon color states: inactive `text-slate-500`, hover `hover:text-slate-700`, active (blue background) `text-white`; no hardcoded colors in SVGs.

* **Picking sequence for warehouse locations.** New `Location.pick_sequence` (integer, nullable): order in which locations are visited along the warehouse picking path (layout designer). Migration `006_location_pick_sequence.sql`. PickTask generation (wave_service) now selects location by path order: get all inventory locations for the product, then choose location with smallest `pick_sequence >= current_sequence`; if none, wrap and choose smallest `pick_sequence`. Virtual picker position advances after each assigned pick. Unsequenced locations (NULL) sort after sequenced ones. Existing APIs unchanged; logic prepared for future use.

* **Added central Icon component and icon registry.** New `frontend/src/components/ui/Icon.tsx`: accepts `name` (union type), `size` (default 24), `className`; internal registry maps names (e.g. warehouse, racks, inventory, orders, cart, picking, analytics) to existing icon components. Sidebar (MainLayout) now uses `<Icon name="…" size={20} />` instead of importing each icon separately; labels, setup, and system keep inline fallback SVGs.

* **Added WMS icon pack and React icon components.** Icon pack in `frontend/src/icons`: React components for all SVGs in `frontend/src/assets/icons` (WarehouseIcon, RacksIcon, ZonesIcon, CartIcon, PackingIcon, ReplenishmentIcon, SlottingIcon, RouteIcon, RouteOptimizationIcon, HeatmapIcon, ForecastIcon, SimulationIcon, WorkerIcon, InventoryIcon, OrdersIcon, PickingIcon, AnalyticsIcon, PalletIcon, CartonIcon, AisleIcon, BinLocationIcon). Each component accepts `size` (default 24) and `className`, uses viewBox for scaling, and inherits color via `currentColor`. Barrel export in `icons/index.ts`. Sidebar navigation (MainLayout) updated to use the icon pack for Warehouse, Inventory, Orders, Picking, Analytics (and related modules).

* **Added WMS icon system and React icon components.** New folder `frontend/src/icons` with React components for WMS SVG icons: WarehouseIcon, RacksIcon, ZonesIcon, CartIcon, PackingIcon, ReplenishmentIcon, SlottingIcon, RouteIcon, HeatmapIcon, ForecastIcon, SimulationIcon, WorkerIcon. Each icon is a functional component with `size` (default 24) and `className` props; SVG uses viewBox for scaling, no hardcoded width/height; paths embedded in component; color inherited via `currentColor`. Barrel export in `icons/index.ts`. Sidebar menu updated to demonstrate usage (WarehouseIcon for Dashboard, CartIcon for Carts).

* **Refactored Slotting Map to warehouse layout (racks and bins).** Slotting Map no longer uses warehouse graph nodes. It now uses the same layout system as the Warehouse Designer: WarehouseMap / layout (racks, StorageBin, Location). Flow: product → inventory.location_id → location (Location.name) → bin.label → map element. Each storage bin is colored by slotting result: A=red, B=orange, C=green. Matching by current_location (Location.name) to bin.label. Hover tooltip: product name, SKU, velocity, ABC class, distance_to_packing, slotting_score, location address. Layout loaded via GET /warehouse/layout; bins rendered in a grid per rack (same coordinate system as Warehouse Designer).

* **Slotting analysis UI layout.** Added full UI for Slotting (Analiza → Slotting): KPI summary cards (total products analyzed, Class A/B/C counts), sortable recommendation table (Product, SKU/Symbol, Velocity, Cube, COI, ABC Class, Distance to packing, Current location, Recommended zone, Slotting score; default sort slotting_score DESC; scrollable container), and Recharts scatter chart "Velocity vs Distance to Packing" (X: distance_to_packing, Y: velocity). Page uses warehouse selector and loads data from GET /analysis/slotting/{warehouse_id}; layout renders with no data (empty state messages).

* **Professional slotting analysis (GET /analysis/slotting/{warehouse_id}).** Service: `backend/services/slotting_service.py`. Data: products, order_items, inventory, locations. Metrics: (1) velocity = SUM(order_items.quantity) per product; (2) cube = length×width×height; (3) COI = cube/velocity (null if velocity=0); (4) ABC class — sort by velocity DESC, A=top 20%, B=next 30%, C=remaining 50%; (5) distance to PACKING (Euclidean from inventory location x,y); (6) slotting_score = velocity/(distance_to_packing+1); (7) recommended_zone: A→PICK_FACE, B→MID_ZONE, C→RESERVE. Only products with inventory; sorted by slotting_score DESC. Response: product_id, product_name, symbol, velocity, cube, coi, abc_class, distance_to_packing, slotting_score, current_location, recommended_zone; optional query param limit. Router only calls the service.

* **Unified warehouse simulation engine (backend/domain/simulation).** New domain module centralizes all warehouse simulation logic: **warehouse_graph_service** (nodes/edges, location→node mapping, distance helpers, Dijkstra shortest path for future use), **route_engine** (route START → pick nodes → PACKING; Euclidean today, graph-based later), **picking_simulation_engine** (single-order simulation: route distance, walking time, visited locations), **batch_picking_engine** (multi-order simulation, merged pick locations, distance reduction). **Refactored to use this engine:** pick route simulation (GET/POST), walking cost (GET /analysis/walking-cost), slotting (GET /analysis/slotting), and batch pick route (POST /analysis/pick-route/batch/). API responses and contracts are unchanged (backward compatible). Future: graph-based shortest-path routes can be added in the same module.

* **Warehouse analytics use actual stock location only.** All analytics (pick route simulation, slotting, heatmap, walking cost, etc.) now read product locations from **inventory.location_id** joined with **location**; they do **not** use **product.assigned_locations**. `assigned_locations` is for configuration, putaway suggestion, and default storage only. If a product has assigned_locations but no inventory record, the pick-route response includes a warning: `"product {id} has assigned location but no inventory record"`. Documentation: `docs/ASSIGNED_LOCATIONS_VS_INVENTORY.md`.

* **Product location assignment** now updates actual inventory stock locations. When saving `assigned_locations` via PUT `/products/{id}/`, inventory is synchronized: each entry (locationAddress/locationUUID/label + quantity) is resolved to a Location in the product’s warehouse; inventory rows are updated or created (one per assigned location), and any other inventory rows for that product in that warehouse are removed. Log: "Inventory synchronized with assigned_locations for product {id}".

* **Warehouse slotting analysis** (GET `/analysis/slotting`). Identifies products that should be moved closer to the packing area using product velocity (sales_last_30_days / 30) and distance to the PACKING location. Slot score = velocity / (distance_to_packing + 1); results sorted by slot_score descending, top 100 by default. Query params: `warehouse_id`, `limit` (1–500). Response: `products` (product_id, product_name, location_name, inventory_quantity, sales_last_30_days, distance_to_packing, velocity, slot_score), plus debug: `packing_location`, `products_analyzed`, `products_with_sales`. Service: `backend/services/slotting_service.py`. Does not modify existing picking logic.

* **Product edit → inventory sync.** When updating a product and setting exactly one assigned location, any inventory rows still at the default receiving location ("Import") are updated to that assigned location (`inventory.location_id`). Sync runs in the product update endpoint (PUT `/products/{id}/`) after saving `assigned_locations`; only rows at "Import" are changed. Log: "Inventory location updated based on product assigned location".

* **Inventory import** now assigns stock to the product’s storage location instead of the "Import" receiving location. When importing products with stock, if inventory is created at location "Import" and the product has `assigned_locations`, inventory (and InventoryUnit, Stock) is updated to the first assigned location (by name in the same warehouse). If inventory already exists at that location, quantities are merged. Pick route simulation uses `product.assigned_locations` as the default storage location when resolving where to pick (so routes use real coordinates instead of Import at (0,0)). Pick route debug response includes `inventory_location` and `inventory_location_coordinates` per pick.

* **Batch pick route simulation** endpoint added: POST `/analysis/pick-route/batch/`. Request body: `{ tenant_id, warehouse_id, order_numbers }`. Loads orders by external `order.number`, returns debug: `orders_found`, `order_items`, `order_numbers`. Frontend sends order numbers (from selected orders) and displays the debug result.

* **Pick route simulation** now searches orders using **order.number** (external order number from CSV) instead of internal database ID. Endpoint: GET `/analysis/pick-route/{order_number}`; response includes `order_number`, `order_id`, and `order_found`. Frontend passes the selected order’s `number` when loading the single-order route.

* **Fixed pick route simulation order lookup.** Order is loaded with `db.query(Order).filter(Order.id == order_id).first()` (no dependency on GET /orders/{id}). Order items are loaded explicitly with `db.query(OrderItem).filter(OrderItem.order_id == order_id).all()`, then product list and inventory (filtered by warehouse and tenant). Response includes debug fields: `order_found`, `order_items`, `inventory_locations`, `mapped_nodes_count` to help debug simulation issues.

* **Pick route simulation** now maps product locations to warehouse graph nodes using `location_ids`: order items → inventory → `location_id` → graph node (via `location_nodes` / node’s `location_ids`). Pick nodes list is built from this mapping; route is START → pick nodes (nearest neighbor by Euclidean distance) → PACK. Distance is the sum of Euclidean segment lengths (meters). Response includes `pick_locations`, `mapped_nodes`, and `route` for debugging.

* **Warehouse Layout Improvements.** Added support for special warehouse nodes: **PICK_START** (picking start point), **PACKING** (packing station), **DOCK** (shipping dock). Warehouse Designer toolbar now includes tools: *Add Start Point*, *Add Packing Station*, *Add Dock*. Click a tool, then click on the canvas to place the node (coordinates sent as POST `/warehouse/special-location`). Only one PICK_START per warehouse; adding a new one replaces the existing. Map renders START (green circle), PACK (blue square), DOCK (gray diamond) above shelves. Pick route simulation calculates routes **START → picks → PACKING**. See `docs/WAREHOUSE_SPECIAL_NODES.md`.

* **Dodano zaawansowany system prognozy sprzedaży (globalny + per produkt + sezonowość dni tygodnia).** Serwis `backend/services/sales_forecast_service.py`: historia 90 dni (zamówienia + sztuki), sezonowość dni tygodnia (mnożniki względem średniej tygodniowej), 14-dniowa średnia krocząca, prognoza na 14 dni (base_demand × weekday_multiplier). Endpointy: GET `/analysis/sales-forecast/{warehouse_id}` (historia + prognoza magazynu), GET `/analysis/product-forecast/{product_id}` (historia + prognoza ilości per produkt). Frontend: strona Prognoza sprzedaży z wykresami Recharts (historia — linia ciągła, prognoza — linia kreskowana), wybór magazynu i produktu (lista z gorących produktów). Przy mniej niż 14 dniach danych: „Not enough historical data for forecasting.” Kod przygotowany pod rozszerzenia: sezonowość miesięczna, wykrywanie promocji, modele ML.

* **Added Sales Forecast analytics based on historical order data.** Endpoint GET /analysis/sales-forecast/{warehouse_id} returns last 30 days of daily order volume (using order_date with created_at fallback) and a 7-day-ahead forecast (7-day moving average). Frontend: Analiza → Prognoza sprzedaży — wybór magazynu, wykres (historia — linia ciągła, prognoza — linia kreskowana). Przy mniej niż 7 dniach danych wyświetlany jest komunikat „Not enough historical data for forecast.” W serwisie logowane są orders_count i days_detected.

* **Połączono layout magazynu z grafem chodzenia. Lokalizacje są przypisywane do najbliższego węzła grafu.** W modelu Location dodano kolumnę graph_node_id (FK do warehouse_nodes). Serwis graph_location_service.assign_locations_to_graph_nodes(warehouse_id) wyznacza dla każdej lokalizacji z współrzędnymi najbliższy węzeł (odległość euklidesowa) i ustawia Location.graph_node_id oraz synchronizuje tabelę location_nodes. Wywołanie po zapisie layoutu (save_layout) i po odbudowie grafu (build_graph). GET /warehouse-graph/{warehouse_id}/nodes zwraca locations_count i location_ids. Mapa magazynu (WarehouseGraphMap): tooltip węzła pokazuje liczbę przypisanych lokalizacji, tooltip lokalizacji – nazwę (np. A1-01-02).

* **Dodano wizualizację grafu magazynu w zakładce Analiza → Mapa magazynu.** Nowa strona ładuje węzły (GET /warehouse-graph/{id}/nodes), krawędzie (GET /warehouse-graph/{id}/edges) oraz lokalizacje (GET /warehouses/{id}/locations). Renderowanie SVG: krawędzie szare, węzły niebieskie, lokalizacje pomarańczowe. Tooltip przy najechaniu: id węzła i współrzędne, nazwa lokalizacji. Komponent przygotowany pod przyszłe rozszerzenia: wizualizacja tras, heatmapa ruchu, sugestie slottingu.

* **Naprawiono analizę kosztu chodzenia – wykorzystuje graf magazynu i dane zamówień zamiast picków.** Ścieżka danych: orders → order_items → inventory → location → location_nodes → warehouse_nodes. Dystans: Dijkstra na warehouse_edges (distance_m), start = węzeł typu „packing” lub najbliższy (0,0). Endpoint GET /analysis/walking-cost bez zmian; zakładka „Koszt chodzenia” ładuje i wyświetla tabelę (ID zamówienia, numer, dystans m, liczba lokalizacji, sztuk).

* **Generowanie grafu magazynu z współrzędnych lokalizacji.** Endpoint `POST /warehouse-graph/{warehouse_id}/generate` wywołuje `generate_graph_for_warehouse(warehouse_id)`: ładuje lokalizacje z niepustymi x,y, tworzy węzły co 5 m, krawędzie gdy odległość &lt; 6 m (distance_m = odległość euklidesowa), przypisuje każdą lokalizację do najbliższego węzła (location_nodes). Po wywołaniu GET .../nodes i GET .../edges zwracają dane. Dokumentacja: docs/WAREHOUSE_GRAPH_ARCHITECTURE.md — sekcja „Graph generation from Location coordinates”.

* **Dodano fundament grafu magazynu do analizy tras kompletacji.** Nowe modele: WarehouseNode (węzły: skrzyżowania, wejścia do alejek, stacja pakowania), WarehouseEdge (ścieżki między węzłami, distance_m), LocationNode (powiązanie lokalizacji z najbliższym węzłem). Tabele: warehouse_nodes, warehouse_edges, location_nodes. Serwis `warehouse_graph_service` generuje siatkę węzłów co 5 m na podstawie współrzędnych Location, łączy sąsiednie węzły krawędziami (odległość euklidesowa w m), przypisuje każdą lokalizację do najbliższego węzła. Endpointy: GET /warehouse-graph/{warehouse_id}/nodes, GET /warehouse-graph/{warehouse_id}/edges. Dokumentacja: docs/WAREHOUSE_GRAPH_ARCHITECTURE.md. Istniejąca logika (zamówienia, inwentarz, projektant, analityka) bez zmian.

* **Synchronizacja WarehouseMap → Location:** Projektant mapy magazynu (WarehouseMap) przy dodawaniu lub edycji regałów tworzy lub aktualizuje rekordy w tabeli `locations`. Dla każdego StorageBin powstaje lokalizacja o nazwie w stylu A1-1-1; współrzędne `x`, `y` z `StorageBin.pos_x`, `pos_y`, `z=0`; wymiary `width`, `depth`, `height` z właściwości regału (props). Endpointy analityki (koszt chodzenia, symulacja tras) mogą korzystać z niepustych współrzędnych. Implementacja: `backend/services/warehouse_map_service.py` — `_sync_locations_from_map()`. Istniejące lokalizacje nie są usuwane.

* **Automatyczne przypisywanie współrzędnych (x,y) do lokalizacji podczas generowania regałów w projekcie magazynu.** Przy zapisie layoutu magazynu (warehouse designer) dla każdego regału i każdego binu tworzone są rekordy w tabeli `locations` (jeśli brak lokalizacji o danej nazwie). Nowo utworzonym lokalizacjom ustawiane są: **środek slotu** (x, y, z w cm) oraz **wymiary** (width, depth, height) — center = pozycja regału + offset segmentu + połowa szerokości/głębokości; każda lokalizacja ma unikalną pozycję (np. A1-1-1 → (10.5, 5.5), A1-1-2 → (10.5, 6.5)). Wykorzystanie: analiza kosztu chodzenia, symulacja tras kompletacji, heatmapa magazynu, optymalizacja slottingu. Dokumentacja: `docs/WAREHOUSE_ANALYTICS_AUDIT.md` — sekcja „Automatic coordinate calculation for warehouse locations”. Istniejące lokalizacje (np. z importu) nie są modyfikowane.

* **Architektura współrzędnych lokalizacji (walking cost, symulacje tras):**
  * **Location:** dodane pola **x**, **y**, **z** (Float, nullable) – fizyczna pozycja lokalizacji w magazynie (np. A1-1-1 → x=3, y=1). Istniejące rekordy: NULL.
  * **Warehouse:** dodane pola **start_x**, **start_y** (Float, nullable, default=0) – punkt startowy kompletacji (stacja pakowania / start pickera).
  * **Migracja:** w `backend/main.py` funkcja `_ensure_location_warehouse_columns()` dodaje kolumny do istniejących tabel SQLite (ALTER TABLE locations ADD COLUMN x/y/z; ALTER TABLE warehouses ADD COLUMN start_x/start_y).
  * **Przepływ danych:** orders → order_items → products → inventory → location → (x, y). Koordynaty każdej lokalizacji produktu są dostępne bez tabeli picks.
  * **Walking-cost (GET /analysis/walking-cost):** symulacja używa wyłącznie order_items, inventory i współrzędnych Location (bez picks). Start z (warehouse.start_x, start_y), wizyta w każdej lokalizacji produktu z zamówienia, odległość Manhattan, suma **total_distance** per zamówienie. Zwracane pola: order_id, order_number, total_distance, distinct_locations_count, total_items.
  * **Dokumentacja:** w `docs/WAREHOUSE_ANALYTICS_AUDIT.md` dodana sekcja „Location coordinate architecture”. API bez zmian w kontraktach (zachowana kompatybilność). Umożliwia: analizę kosztu chodzenia, symulację tras, heatmapy ruchu, optymalizację slottingu.

* **Warehouse analytics audit (audyt przed symulacją kosztu chodzenia):**
  * Wykonano pełny audyt systemu pod kątem danych potrzebnych do symulacji **walking cost** w magazynie.
  * Raport techniczny: `docs/WAREHOUSE_ANALYTICS_AUDIT.md`.
  * Zawartość: (1) lista modeli SQLAlchemy i tabel, (2) analiza modelu Location – brak pól x/y oraz aisle/row/level; współrzędne są tylko w WarehouseMap/MapElement/StorageBin, bez powiązania z Location, (3) mapowanie produkt→lokalizacja przez tabelę inventory, (4) struktura orders/order_items, (5) stan tabel picks/pick_tasks – brak zdarzeń kompletacji (picks=0), (6) przegląd endpointów analitycznych i ich źródeł danych, (7) checklista: dostępne/brakujące/dostępne częściowo (współrzędne layoutu częściowo, lokalizacje produktów tak, listy zamówień tak, zdarzenia pików nie, lokalizacja startowa nie), (8) propozycja modelu danych pod realistyczną symulację: Location z (x, y) lub tabela location_positions, inventory bez zmian, depot/start_location. Implementacja nie została jeszcze wdrożona.

* **Analityka oparta wyłącznie na order_items (bez picks / inventory_units / stock):**
  * Endpointy analityczne działają przy pustych tabelach: picks=0, inventory_units=0, stock=0.
  * **Product Pairs (GET /analysis/product-pairs):** produkty kupowane razem – self-join order_items po order_id, product_id_a < product_id_b, GROUP BY, COUNT(*); zwraca nazwy produktów i częstotliwość.
  * **Hot Locations (GET /analysis/hot-locations):** suma quantity per lokalizacja – order_items → inventory → location (bez picks).
  * **Batch Picking (GET /analysis/batch-picking):** suma quantity per produkt z order_items (GROUP BY product_id), bez tabeli picks.
  * **Walking Cost (GET /analysis/walking-cost):** szacunek „podróży” per zamówienie (liczba różnych lokalizacji, liczba sztuk) z order_items + inventory; symulacja bez danych picks.
  * Frontend: strony Produkty kupowane razem, Batch picking i Gorące lokalizacje (pick-heatmap) pobierają dane z nowych endpointów i wyświetlają tabele.

* **System logów importu (Import Log):**
  * Rejestrowanie wyników każdego importu CSV (produkty i zamówienia) w bazie (model `ImportLog`, tabela `import_logs`).
  * Śledzenie: total_rows, created, updated, skipped, warnings, errors oraz message.
  * Ostrzeżenia: brak ceny, brak EAN (import produktów), nieprawidłowa data (import zamówień).
  * Endpoint `GET /import/logs` zwraca ostatnie logi do wyświetlenia w UI.
  * Strona **Import → Historia importów** (`/import/history`): tabela z datą, typem, utworzonymi/zaktualizowanymi, ostrzeżeniami i błędami; kliknięcie wiersza pokazuje szczegóły (message).

* **Ulepszenia importera CSV (UPSERT):**
  * **Importer improvements:** products are updated instead of duplicated; orders are updated instead of duplicated; order items are replaced during order update; importer is now idempotent.
  * Produkty: identyfikacja po EAN (główny) lub SKU/symbol (zapasowo). Aktualizowane są tylko pola, dla których CSV podaje wartość (puste kolumny nie nadpisują istniejących danych). Pola: name, weight, dimensions, purchase_price, producer (manufacturer), unit, image_url.
  * Zamówienia: identyfikacja po `order_number` (pole `Order.number`). Przy aktualizacji: order_date, warehouse_id, city, country, value; istniejące pozycje są usuwane i wstawiane na nowo z CSV (clean set of order items: product_id, quantity, unit_price, unit).
  * Bezpieczeństwo: zamówienia w statusie SHIPPED lub COMPLETED nie są nadpisywane.
  * Logowanie: `"Updating product EAN={ean}"` oraz `"Updating order {order_number}"` ułatwiają debug importów.
  * Ograniczenia bazy: UNIQUE(tenant_id, ean) na Product, UNIQUE(tenant_id, warehouse_id, number) na Order (zapobieganie duplikatom przy nowych instalacjach).

* **Ulepszenia modułu System:**
  * Przywrócono zakładkę **Changelog** w module System. Zawartość `PROJECT_CHANGELOG.md` jest serwowana przez endpoint `GET /system/changelog` i wyświetlana w przewijalnym kontenerze.
  * Poprawiono wykrywanie rozmiaru bazy SQLite: endpoint `/system/db-size` używa tej samej ścieżki co aplikacja (plik `test.db` z konfiguracji silnika), a nie `wms.db`, dzięki czemu wyświetlany jest faktyczny rozmiar bazy z danymi.
  * Dodano logowanie debug: ścieżka do bazy oraz rozmiar w MB są logowane przy wywołaniu `/system/db-size`.
  * Strona **Rozmiar bazy** pokazuje teraz: rozmiar bazy (MB), liczbę tabel, łączną liczbę wierszy.

* **Analityka oparta na zamówieniach (orders, order_items, products, inventory):**
  * Moduły analityki nie korzystają już z pustych tabel `picks`, `inventory_units`, `stock`, `inventory_movements`. Wszystkie zapytania używają wyłącznie: `orders`, `order_items`, `products`, `inventory`.
  * **Backend:** Nowy serwis `analytics_service` oraz endpointy GET: `/analysis/dead-stock` (produkty z zapasem i bez sprzedaży w ostatnich N dniach), `/analysis/product-rotation` (suma quantity per produkt), `/analysis/hot-products` (top produktów po łącznej ilości), `/analysis/pick-density` (suma quantity per lokalizacja – przypisanie produkt→lokalizacja z inventory).
  * **Frontend:** Strony Zalegający towar, Rotacja produktów, Gorące produkty, Gęstość kompletacji pobierają dane z powyższych endpointów i wyświetlają tabele (z obsługą ładowania i błędów). Dodane zakładki i trasy: `/analysis/product-rotation`, `/analysis/hot-products`.

* **Połączenie modułów backendu z frontendem (audyt API):**
  * **System:** Moduł System z zakładkami (TopTabsNavigation): Zdrowie systemu, Rozmiar bazy, Metryki API, Logi błędów. Strona Zdrowie systemu wywołuje `GET /system/health` i `GET /system/db-size` oraz wyświetla status backendu i rozmiar bazy. Strona Rozmiar bazy korzysta z `/system/db-size`. Metryki API i Logi błędów mają placeholder (endpointy w backendzie w kolejnej wersji).
  * **Analiza:** Dashboard analizy wywołuje `GET /tenants/{id}/inventory-value` oraz `GET /system/health` i pokazuje wartość magazynową oraz status backendu. Nowa podstrona **Wartość magazynowa** (`/analysis/inventory-value`) korzysta z `GET /tenants/{id}/inventory-value` i `GET /warehouses/` i wyświetla tabelę wartości per magazyn. Strona Zalegający towar opisuje endpoint `POST /analysis/run` (analiza z plików CSV).
  * Routing: `/system` z zagnieżdżonymi trasami (`/system/health`, `/system/db-size`, `/system/metrics`, `/system/errors`). Sidebar prowadzi do modułu System (`/system`). Wszystkie nowe strony mają stany ładowania i obsługę błędów.

* Pola cenowe w pozycjach zamówienia (OrderItem): `unit_price`, `total_price`, `unit`. Umożliwiają poprawne liczenie wartości zamówień i analitykę. Przy starcie aplikacji istniejące tabele SQLite są uzupełniane o brakujące kolumny (migracja po `create_all`).

* API monitoringu systemu. Nowe endpointy: `/system/health` – status backendu, `/system/db-size` – rozmiar bazy danych. Będą wykorzystywane w zakładce **Zdrowie systemu**.

* Middleware monitorujący zapytania API (`request_metrics`). System loguje teraz:
  * czas wykonania endpointów,
  * błędy backendu,
  * status odpowiedzi HTTP.
  Dane będą wykorzystywane w module **Zdrowie systemu**.

### Naprawiono

* **API listy zamówień (GET /orders) – brakujące pola:** Odpowiedź listy zamówień nie zawierała pól z modelu Order: `order_date`, `value`, `created_at`, `source`, `shipping_method`, `currency`. Zaktualizowano schemat `OrderListRead` w `backend/schemas/order.py` oraz budowanie odpowiedzi w `backend/api/order.py`, tak aby endpoint zwracał te pola. Frontend może teraz poprawnie wyświetlać datę zamówienia i wartość.

* **Import zamówień – data nie zapisywała się (order_date pusta w UI):** Data z CSV nie trafiała do pola `order_date` – zamówienia wyświetlały pustą datę mimo poprawnej kolumny w pliku. Poprawiono w `backend/services/import_service.py`: (1) nagłówki CSV są normalizowane z usunięciem BOM (`\ufeff`), żeby kolumna „Data zamówienia” / „Data dodania” była poprawnie rozpoznawana; (2) wartość daty jest brana z mapowanej kolumny lub z pól „Data zamówienia” / „Data dodania”; (3) `order_date` jest ustawiane na sparsowaną datę z CSV (np. `2024-10-23 19:05:12`), a `created_at` na `datetime.utcnow()` przy tworzeniu rekordu (czas zapisu w bazie); (4) przy aktualizacji istniejącego zamówienia `created_at` nie jest nadpisywane; (5) dodano log debug: `Order import: number=..., csv_date=..., parsed=...`. Po imporcie CSV z datą lista zamówień pokazuje poprawną datę.

* **Import – data zamówienia i cena zakupu:** (1) **Data zamówienia:** Zamówienia zapisywały się z NULL w polu daty mimo mapowanej kolumny „Data zamówienia”. Poprawiono rozpoznawanie kolumny daty: usuwanie BOM (`\ufeff`) i normalizacja nazw w `_resolve_order_date_column`, oraz ustawianie `created_at=order_date` przy tworzeniu zamówienia, tak aby oba pola miały wartość. (2) **Cena zakupu:** Kolumna „Cena zakupu brutto” nie była mapowana na `purchase_price`. W aliasach produktu dodano „Cena zakupu brutto” (przed „Cena zakupu”) i rozwiązywanie kolumny `purchase_price` przez `_resolve_column_index` (jak przy `sale_price`). Wprowadzono funkcję `_parse_price(value)` obsługującą format dziesiętny z przecinkiem (np. 1,21; 4,9) i używano jej dla `purchase_price` oraz `sale_price`; przy błędnej konwersji logowane jest ostrzeżenie. W formularzu edycji produktu pole „Cena zakupu” jest teraz wypełniane po imporcie CSV z kolumną „Cena zakupu brutto”.
</think><｜tool▁call▁begin｜>
ReadLints

* **Analytics zwracały puste wyniki – debug i poprawki:**
  * Wykryto rozbieżność tabel: API wartości magazynowej (`/tenants/{id}/inventory-value`, `/warehouses/{id}/inventory-value`) korzysta z tabeli `inventory_units`, podczas gdy import produktów zapisywał tylko do tabeli `inventory`, więc `inventory_units` i `stock` były puste.
  * **Import:** Przy imporcie produktów z „Stan magazynowy” tworzone są teraz także wpisy w `inventory_units` i `stock` (obok `inventory`), dzięki czemu analityka i lista zapasów mają dane po kolejnych importach.
  * **Fallback:** Gdy `inventory_units` jest puste, wartość magazynowa jest liczona z tabeli `inventory` (dane po starym imporcie).
  * **Debug:** Dodano endpoint `GET /system/debug-counts` zwracający liczby rekordów w tabelach: `orders`, `order_items`, `products`, `inventory`, `inventory_units`, `stock`, `picks`, `inventory_movements` (do weryfikacji, czy import i analityka widzą dane).
  * **Logi:** Przed liczeniem wartości magazynowej (tenant i warehouse) logowane są: `orders_count`, `order_items_count`, `inventory_units_count` (tenant) oraz `inventory_units_count` (warehouse).

* Naprawiono błąd inicjalizacji mapperów SQLAlchemy spowodowany brakiem rejestracji modelu `InventoryMovement`. Dodano import `InventoryMovement` w `models/__init__.py`.

* Naprawiono błąd inicjalizacji SQLAlchemy mapperów. Model `Pick` nie był zarejestrowany w `models/__init__.py`, co powodowało crash backendu przy starcie (InvalidRequestError: expression 'Pick' failed to locate a name). Dodano importy: `Pick`, `Location`, `InventoryUnit`, `Wave`, `PickTask`, `PickWave`, `PickWaveItem`, `PickWaveTask`.

* Naprawiono problem komunikacji frontend–backend powodujący Axios Network Error. CORS w backendzie ustawiono na `allow_origins=["*"]`, aby frontend mógł łączyć się z API (port 8010).

* Błąd ładowania aplikacji frontend (Vite MIME error). Problem wynikał z niepoprawnych importów w `App.tsx` – brakowało plików dla stron (Changelog, System/SystemHealth, PlanningPlaceholder, strony Analizy, PickingWaves). Dodano brakujące komponenty oraz poprawiono błędy TypeScript (nieużywane zmienne, typy), aby build przechodził.

* Konflikt modeli regałów konsolidacyjnych. Błąd importu `ConsolidationRackLevel` powodował crash backendu przy starcie. Importy modeli zostały zsynchronizowane z faktycznymi klasami (w pliku była klasa `RackLevel`; dodano `ConsolidationRackLevel` i tabelę `consolidation_rack_levels`, aby uniknąć konfliktu z modelem `RackLevel` z `rack_level.py`).

### Zmieniono

* Sidebar aplikacji został przebudowany. Usunięto rozwijane sekcje i wprowadzono nawigację modułową jak w Sellasist. Sekcje modułów (np. Analiza) dostępne są teraz jako zakładki u góry strony.
