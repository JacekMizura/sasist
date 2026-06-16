-- Production diagnostic bundle STOCK / products_pkey
-- Run: psql "$DATABASE_URL" -f backend/scripts/prod_bundle_shadow_diagnostic.sql
-- WARNING: nextval() ADVANCES the sequence — run in maintenance window or comment out section 3.

\echo '=== 1. products sequence state ==='
SELECT MAX(id) AS max_id FROM products;

SELECT last_value, is_called FROM products_id_seq;

\echo '=== 2. next nextval (ADVANCES sequence — optional) ==='
-- SELECT nextval('products_id_seq');

\echo '=== 3. bundle #1 ==='
SELECT id, tenant_id, linked_product_id, bundle_fulfillment_mode, sku, ean
FROM bundles
WHERE id = 1;

\echo '=== 4. shadow products ==='
SELECT id, tenant_id, name, sku, ean, deleted_at, metadata_json
FROM products
WHERE metadata_json IS NOT NULL
  AND metadata_json::text LIKE '%shadow_bundle_id%'
ORDER BY id;

\echo '=== 5. products id in error range (3,10,12,13) ==='
SELECT id, tenant_id, name, sku, ean, deleted_at,
       LEFT(metadata_json, 120) AS metadata_preview
FROM products
WHERE id IN (3, 10, 12, 13)
ORDER BY id;

\echo '=== 6. would _find_shadow_product_by_bundle_id(1) match? ==='
SELECT id, metadata_json
FROM products
WHERE tenant_id = (SELECT tenant_id FROM bundles WHERE id = 1)
  AND metadata_json IS NOT NULL
  AND (
    metadata_json LIKE '%"shadow_bundle_id": 1%'
    OR metadata_json LIKE '%"shadow_bundle_id":1%'
  );
