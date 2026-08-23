# Project context (RZ / business reservation)

- BUSINESS RESERVATION SSOT: `order_warehouse_reservations` (warehouse+product+qty, no location).
- WMS location holds stay in `stock_reservations` for production / DS / pick allocation.
- AVAILABLE FOR SALE = physical - SUM(active OWR); location holds must not double-subtract.
- RZ = StockDocument type RESERVATION via DocumentSeries subtype RESERVATION.
- Backfill: `backfill_sales_order_location_holds_to_business` (dry-run, not auto on prod).
