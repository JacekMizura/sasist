import type { CustomerFlags } from "../../modules/customers/customerProfile";
import { customerTypeLabel } from "../../modules/customers/customerProfile";

type Props = {
  customerType?: string | null;
  customerStatus?: string | null;
  flags?: CustomerFlags | null;
  compact?: boolean;
};

const pill = "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide";

export function CustomerOrderBadges({ customerType, customerStatus, flags, compact }: Props) {
  const items: Array<{ key: string; label: string; className: string }> = [];
  if (flags?.vip) items.push({ key: "vip", label: "VIP", className: "border-amber-200 bg-amber-50 text-amber-900" });
  const t = String(customerType || "").toLowerCase();
  if (t === "wholesale") {
    items.push({ key: "wholesale", label: "Hurt", className: "border-violet-200 bg-violet-50 text-violet-800" });
  }
  if (flags?.debtor) items.push({ key: "debtor", label: "Dłużnik", className: "border-rose-200 bg-rose-50 text-rose-800" });
  if (String(customerStatus || "").toLowerCase() === "blocked") {
    items.push({ key: "blocked", label: "Blokada", className: "border-red-300 bg-red-50 text-red-800" });
  }
  if (!compact && customerType) {
    items.unshift({
      key: "type",
      label: customerTypeLabel(customerType),
      className: "border-slate-200 bg-slate-50 text-slate-700 normal-case",
    });
  }
  if (!items.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {items.map((it) => (
        <span key={it.key} className={`${pill} ${it.className}`}>
          {it.label}
        </span>
      ))}
    </span>
  );
}
