/** Bazowy URL modułu etykiet: `/labels`, `/system-etykiet` lub Ustawienia → `/admin/print-templates`. */
export function labelModuleBasePath(pathname: string): string {
  if (pathname.startsWith("/admin/print-templates")) return "/admin/print-templates";
  if (pathname.startsWith("/system-etykiet")) return "/system-etykiet";
  return "/labels";
}
