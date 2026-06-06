export type LocationZoneKind = "primary" | "store" | "backroom" | "showroom" | "default";

export function resolveLocationZoneKind(zone: string | null | undefined): LocationZoneKind {
  const z = String(zone ?? "").trim().toUpperCase();
  if (!z) return "primary";
  if (z.includes("STORE") || z.includes("SALES") || z.includes("FLOOR") || z.includes("SKLEP")) return "store";
  if (z.includes("BACK") || z.includes("RESERVE") || z.includes("MAG")) return "backroom";
  if (z.includes("SHOW")) return "showroom";
  return "default";
}

export const ZONE_BADGE_CLASS: Record<LocationZoneKind, string> = {
  primary: "bg-blue-100 text-blue-900 ring-1 ring-blue-200",
  store: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200",
  backroom: "bg-amber-100 text-amber-950 ring-1 ring-amber-200",
  showroom: "bg-violet-100 text-violet-900 ring-1 ring-violet-200",
  default: "bg-slate-100 text-slate-800 ring-1 ring-slate-200",
};
