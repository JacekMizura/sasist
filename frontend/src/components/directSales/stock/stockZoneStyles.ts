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

// Nowoczesne, jasne kolory dopasowane do zaktualizowanego LocationBadge
export const ZONE_BADGE_CLASS: Record<LocationZoneKind, string> = {
  primary: "bg-blue-50 text-blue-700 border-blue-200",
  store: "bg-emerald-50 text-emerald-700 border-emerald-200",
  reserve: "bg-amber-50 text-amber-700 border-amber-200",
  blocked: "bg-red-50 text-red-700 border-red-200",
  showroom: "bg-violet-50 text-violet-700 border-violet-200",
  default: "bg-slate-50 text-slate-700 border-slate-200",
};