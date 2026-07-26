/** Bazowy URL modułu etykiet — kanon: `/templates/labels`. */
export function labelModuleBasePath(pathname: string): string {
  if (pathname.startsWith("/templates/labels")) return "/templates/labels";
  if (pathname.startsWith("/admin/print-templates")) return "/admin/print-templates";
  if (pathname.startsWith("/system-etykiet")) return "/system-etykiet";
  if (pathname.startsWith("/labels")) return "/labels";
  return "/templates/labels";
}
