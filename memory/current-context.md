# Current context

## Active goal
Direct sales terminal — settings-driven UI, complete-sale reliability, payment/location UX.

## Recent fixes
- **Stock hint bug:** `session_enrichment` used wrong key `total_available` → always 0; now reads `summary.available`.
- **Settings wired to terminal:** EAN/SKU/catalog, stock/images, payment methods, customer rules, document FV gate, allocation strategy on session create.
- **Complete sale:** structured errors (`step`, `code`, `message`), validation log, soft-fail completion read; order gets `order_ui_status_id` from settings.
- **Payment:** cash change panel; MIXED split (cash + card) with backend `payment_splits`.
- **Locations:** zone badge colors; store-first sort; no false "Brak" on cart lines.

## Prior
Warehouse layout editor — rack name/type corruption fix (`reindexGeometricRow`).
