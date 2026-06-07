/**
 * Single source for “is this sidebar path active?” — used by ErpShellLayout / nav config consumers.
 */

export function isNavPathActive(pathname: string, path: string): boolean {
  const q = path.indexOf("?");
  if (q !== -1) {
    return isNavPathActive(pathname, path.slice(0, q));
  }
  if (path.startsWith("/documents/")) {
    return pathname === path || pathname.startsWith(`${path}/`);
  }
  if (path === "/labels") {
    return pathname.startsWith("/labels") || pathname.startsWith("/system-etykiet");
  }
  if (path === "/designer") {
    return pathname.startsWith("/designer") || pathname.startsWith("/warehouse-designer");
  }
  if (path === "/carts") {
    return pathname === "/carts" || pathname.startsWith("/carts/");
  }
  if (path === "/analytics") {
    return pathname === "/analytics" || pathname === "/analytics/dashboard";
  }
  if (path === "/system") {
    return pathname.startsWith("/system") || pathname.startsWith("/changelog");
  }
  if (path === "/dashboard") {
    return pathname === "/dashboard";
  }
  if (path === "/products/list") {
    if (pathname === "/products/new" || /^\/products\/\d+\/edit$/.test(pathname)) return false;
    return pathname.startsWith("/products");
  }
  if (path === "/bundles") {
    return pathname === "/bundles" || pathname.startsWith("/bundles/");
  }
  if (path === "/production") {
    return pathname === "/production" || pathname.startsWith("/production/");
  }
  if (path === "/wms/production") {
    return pathname === "/wms/production" || pathname.startsWith("/wms/production/");
  }
  if (path === "/manufacturers") {
    return pathname === "/manufacturers" || pathname.startsWith("/manufacturers/");
  }
  if (path === "/suppliers") {
    if (pathname.startsWith("/suppliers/zamowienia")) return false;
    return pathname === "/suppliers" || pathname.startsWith("/suppliers/");
  }
  if (path === "/goods-orders") {
    return pathname === "/goods-orders" || pathname.startsWith("/goods-orders/");
  }
  if (path === "/customers") {
    return pathname === "/customers" || pathname.startsWith("/customers/");
  }
  if (path === "/purchasing/dashboard") {
    return pathname === "/purchasing" || pathname === "/purchasing/dashboard";
  }
  if (path === "/purchasing/replenishment") {
    return pathname === "/purchasing/replenishment";
  }
  if (path === "/purchasing/suppliers/analytics") {
    return pathname === "/purchasing/suppliers/analytics";
  }
  if (path === "/purchasing/orders") {
    return pathname === "/purchasing/orders" || pathname.startsWith("/purchasing/orders/");
  }
  if (path === "/purchasing/forecast") {
    return pathname === "/purchasing/forecast";
  }
  if (path === "/purchasing/alerts") {
    return pathname === "/purchasing/alerts" || pathname.startsWith("/purchasing/alerts/");
  }
  if (path === "/purchasing/segments") {
    return pathname === "/purchasing/segments" || pathname.startsWith("/purchasing/segments/");
  }
  if (path === "/purchasing/auto-reorder") {
    return pathname === "/purchasing/auto-reorder" || pathname.startsWith("/purchasing/auto-reorder/");
  }
  if (path === "/purchasing/price-opportunities") {
    return pathname === "/purchasing/price-opportunities" || pathname.startsWith("/purchasing/price-opportunities/");
  }
  if (path === "/purchasing/cooperation-history") {
    return pathname === "/purchasing/cooperation-history" || pathname.startsWith("/purchasing/cooperation-history/");
  }
  if (path === "/orders/custom-fields") {
    return pathname.startsWith("/orders/custom-fields");
  }
  /** Order list / import / new / numeric detail — never returns or complaints subtree */
  if (path === "/orders/list") {
    if (pathname.startsWith("/orders/returns")) return false;
    if (pathname.startsWith("/orders/complaints")) return false;
    if (pathname.startsWith("/orders/custom-fields")) return false;
    if (pathname.startsWith("/orders/automation")) return false;
    return (
      pathname === "/orders" ||
      pathname === "/orders/list" ||
      pathname === "/orders/new" ||
      /^\/orders\/\d+$/.test(pathname)
    );
  }
  if (path === "/orders/new") {
    return pathname === "/orders/new";
  }
  if (path === "/orders/automation") {
    return pathname.startsWith("/orders/automation");
  }
  if (path === "/orders/returns") {
    return pathname === "/orders/returns" || pathname.startsWith("/orders/returns/");
  }
  if (path === "/returns") {
    return pathname === "/returns" || pathname.startsWith("/returns/");
  }
  if (path === "/inventory") {
    return pathname === "/inventory";
  }
  if (path === "/settings/printers") {
    return pathname === "/settings/printers" || pathname.startsWith("/settings/printers/");
  }
  if (path === "/settings/exports") {
    return pathname === "/settings/exports" || pathname.startsWith("/settings/exports/");
  }
  if (path === "/settings/import") {
    return pathname === "/settings/import";
  }
  if (path === "/admin/message-templates") {
    return pathname === "/admin/message-templates" || pathname.startsWith("/admin/message-templates/");
  }
  if (path === "/admin/print-templates") {
    return pathname === "/admin/print-templates" || pathname.startsWith("/admin/print-templates/");
  }
  if (path === "/settings/wms") {
    return pathname === "/settings/wms" || pathname.startsWith("/settings/wms/");
  }
  if (path === "/settings/orders/ui-statuses") {
    return pathname === "/settings/orders/ui-statuses" || pathname.startsWith("/settings/orders/");
  }
  if (path === "/settings/complaints/ui-statuses") {
    return pathname === "/settings/complaints/ui-statuses" || pathname.startsWith("/settings/complaints/");
  }
  if (path === "/wms") {
    return pathname === "/wms" || pathname.startsWith("/wms/");
  }
  if (path === "/wms-upload") {
    return pathname === "/wms-upload" || pathname.startsWith("/wms-upload/");
  }
  if (path === "/complaints") {
    return (
      pathname === "/complaints" ||
      pathname.startsWith("/complaints/") ||
      pathname.startsWith("/orders/complaints")
    );
  }
  if (path === "/locations") {
    return pathname === "/locations" || pathname.startsWith("/locations/");
  }
  if (path === "/waves") {
    return pathname === "/waves" || pathname.startsWith("/waves/");
  }
  if (path === "/optimizer") {
    return pathname === "/optimizer" || pathname.startsWith("/optimizer/");
  }
  if (path === "/warehouse-materials/cartons") {
    return pathname.startsWith("/warehouse-materials");
  }
  if (path === "/warehouse/bdo") {
    return pathname === "/warehouse/bdo" || pathname.startsWith("/warehouse/bdo/");
  }
  return pathname === path || pathname.startsWith(path + "/");
}

export function navGroupHasActivePath(
  pathname: string,
  itemPaths: readonly string[],
): boolean {
  return itemPaths.some((p) => isNavPathActive(pathname, p));
}
