/** Damage trace on inventory rows — RMZ / complaint → Z-PZ → putaway. */

export type InventoryDamageTrace = {
  damage_class?: string | null;
  damage_reasons?: string[];
  source_reference?: string | null;
  source_kind?: "RMZ" | "COMPLAINT" | string | null;
  decided_at?: string | null;
  operator_name?: string | null;
  disposition_badge?: string | null;
  stock_disposition?: string | null;
};

export function formatDamageTooltip(trace: InventoryDamageTrace | null | undefined): string {
  if (!trace) return "";
  const lines: string[] = [];
  if (trace.damage_class) {
    lines.push(`Klasa uszkodzenia: ${trace.damage_class}`);
  }
  const reasons = (trace.damage_reasons ?? []).filter(Boolean);
  if (reasons.length) {
    lines.push("Powody:");
    for (const r of reasons) lines.push(`• ${r}`);
  }
  if (trace.source_reference) {
    lines.push(`Źródło: ${trace.source_reference}`);
  }
  if (trace.decided_at) {
    const d = new Date(trace.decided_at);
    lines.push(`Data decyzji: ${Number.isNaN(d.getTime()) ? trace.decided_at : d.toLocaleString("pl-PL")}`);
  }
  if (trace.operator_name) {
    lines.push(`Operator: ${trace.operator_name}`);
  }
  return lines.join("\n");
}

export type DamageBadgeVariant = "none" | "b" | "c" | "generic";

export function resolveDamageBadgeVariant(
  stockDisposition?: string | null,
  damageClass?: string | null,
  dispositionBadge?: string | null,
): DamageBadgeVariant {
  const cls = (damageClass ?? "").trim().toUpperCase();
  if (cls === "B") return "b";
  if (cls === "C") return "c";
  const sd = (stockDisposition ?? "").trim().toUpperCase();
  if (sd === "OUTLET_B" || sd === "SERVICE_C") return "generic";
  const badge = (dispositionBadge ?? "").trim().toUpperCase();
  if (badge.includes("USZKODZONY")) return "generic";
  return "none";
}

export function resolveDamageBadgeLabel(
  stockDisposition?: string | null,
  damageClass?: string | null,
  dispositionBadge?: string | null,
): string | null {
  const cls = (damageClass ?? "").trim().toUpperCase();
  if (cls === "B") return "USZKODZONY B";
  if (cls === "C") return "USZKODZONY C";
  const sd = (stockDisposition ?? "").trim().toUpperCase();
  if (sd === "OUTLET_B" || sd === "SERVICE_C") return "USZKODZONY";
  const raw = (dispositionBadge ?? "").trim();
  if (raw && raw !== "(A)") return raw.replace(/^\(|\)$/g, "");
  return null;
}

export function damageBadgeClassName(variant: DamageBadgeVariant): string {
  switch (variant) {
    case "b":
      return "rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-950 ring-1 ring-amber-300/80";
    case "c":
      return "rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-950 ring-1 ring-red-300/80";
    case "generic":
      return "rounded bg-orange-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-orange-950 ring-1 ring-orange-300/70";
    default:
      return "";
  }
}
