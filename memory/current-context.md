## Active

**Packaging materials + BDO architecture refactor (in progress, 2026-08-07).**

SSOT direction:
- Carton / PackagingMaterial = master data + BDO kg flags
- Physical stock = `inventory` via linked `products.stock_item_kind` (CARTON | PACKAGING_MATERIAL)
- BDO = report-only over stock documents (PZ RECEIPT / RW ISSUE)
- Packing finish creates packaging RW for selected carton (+ consumables JSON)

Removed / removing: BDO purchases, corrections, stock-count ledger tables & FE pages.

**Next stages:** FE consumables UI on packing; document movement history projection; MM/inventory-count UX for packaging stockables; purge dead BDO API client helpers.
