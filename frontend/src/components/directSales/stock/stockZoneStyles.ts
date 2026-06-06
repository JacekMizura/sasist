export type LocationZoneKind = "primary" | "store" | "reserve" | "blocked" | "showroom" | "default";

export function resolveLocationZoneKind(zone: string | null | undefined): LocationZoneKind {
  const z = String(zone ?? "").trim().toUpperCase();
  if (!z) return "primary";
  if (z.includes("BLOCK") || z.includes("DAMAGE") || z.includes("PROBLEM") || z.includes("HOLD")) return "blocked";
  if (z.includes("STORE") || z.includes("SALES") || z.includes("FLOOR") || z.includes("SKLEP")) return "store";
  if (z.includes("RESERVE") || z.includes("OVERFLOW") || z.includes("BACK") || z.includes("MAG")) return "reserve";
  if (z.includes("SHOW")) return "showroom";
  if (z.includes("PICK") || z.includes("PRIMARY")) return "primary";
  return "default";
}

export const ZONE_BADGE_CLASS: Record<LocationZoneKind, string> = {
  primary: "bg-blue-100 text-blue-900 ring-1 ring-blue-200",
  store: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200",
  reserve: "bg-amber-100 text-amber-950 ring-1 ring-amber-200",
  blocked: "bg-red-100 text-red-900 ring-1 ring-red-200",
  showroom: "bg-violet-100 text-violet-900 ring-1 ring-violet-200",
  default: "bg-slate-100 text-slate-800 ring-1 ring-slate-200",
};
