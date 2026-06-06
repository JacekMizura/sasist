/**
 * Eager-import critical modules to surface TDZ / circular-init at load time.
 * Run: npx vite-node scripts/test-module-imports.mjs
 */
const MODULES = [
  "./src/main.tsx",
  "./src/App.tsx",
  "./src/pages/Products/ProductEditModal.tsx",
  "./src/pages/Products/ProductEditPage.tsx",
  "./src/pages/Products/ProductDetail.tsx",
  "./src/pages/Products/productListMapper.ts",
  "./src/pages/Products/productPricingDisplay.ts",
  "./src/components/products/ProductWarehouseStockPanel.tsx",
  "./src/pages/WarehouseDesigner/WarehouseDesignerPage.tsx",
  "./src/pages/wms/direct-sales/DirectSalesTerminalPage.tsx",
  "./src/components/directSales/DirectSalesLayout.tsx",
  "./src/hooks/directSales/useDirectSalesTerminal.ts",
  "./src/pages/wms/WmsPickingStatusPage.tsx",
  "./src/pages/wms/WmsPickingProductsPage.tsx",
  "./src/pages/wms/WmsPickingProductDetailPage.tsx",
];

let failed = 0;
for (const mod of MODULES) {
  try {
    await import(mod);
    console.log(`OK  ${mod}`);
  } catch (e) {
    failed++;
    const err = e instanceof Error ? e : new Error(String(e));
    console.error(`FAIL ${mod}`);
    console.error(`     ${err.message}`);
    if (err.stack) {
      const lines = err.stack.split("\n").slice(0, 8);
      for (const line of lines) console.error(`     ${line}`);
    }
  }
}

if (failed) {
  console.error(`\n${failed} module(s) failed to import`);
  process.exitCode = 1;
} else {
  console.log(`\nAll ${MODULES.length} modules imported without TDZ`);
}
