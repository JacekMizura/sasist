/**
 * Heurystyki ścieżka → szkielet (dokumentacja / ewentualne linki zewnętrzne).
 * **Źródło prawdy:** drzewo tras w {@link ../App.tsx} — layout bez `path` + zagnieżdżone `Route`.
 */

/** Terminal WMS — własny layout, bez menu ERP i bez nagłówka panelu. */
export function isWmsOperationalPath(pathname: string): boolean {
  return pathname === "/wms" || pathname.startsWith("/wms/");
}

/** Pełnoekranowe raporty / upload telefonu — bez menu i nagłówka. */
export function isBareFullscreenPath(pathname: string): boolean {
  return (
    pathname.startsWith("/report/warehouse-structure") ||
    pathname.startsWith("/report/product-locations") ||
    pathname === "/wms-upload" ||
    pathname.startsWith("/wms-upload/")
  );
}

/** Ustawienia, dokumenty, moduły administracyjne — sidebar ERP + standardowy nagłówek (nie WMS). */
export function isSettingsAdminShellPath(pathname: string): boolean {
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return true;
  if (pathname === "/documents" || pathname.startsWith("/documents/")) return true;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  return false;
}
