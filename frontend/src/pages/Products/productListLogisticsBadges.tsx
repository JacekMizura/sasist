import { ClipboardCheck, Layers, Package, RotateCcw } from "lucide-react";
import type { ProductListRow } from "./productListMapper";

export type ProductLogisticsBadge = {
  key: string;
  label: string;
  title: string;
  className: string;
  Icon: typeof Package;
};

export function productLogisticsBadges(p: ProductListRow): ProductLogisticsBadge[] {
  const out: ProductLogisticsBadge[] = [];

  const wmsReq =
    p.require_recv_height ||
    p.require_recv_width ||
    p.require_recv_length ||
    p.require_recv_weight ||
    p.track_batch ||
    p.track_expiry ||
    p.track_serial;
  if (wmsReq) {
    out.push({
      key: "wms",
      label: "WMS",
      title: "Wymagane uzupełnienie danych przy przyjęciu",
      className: "border-indigo-200/90 bg-indigo-50/80 text-indigo-900",
      Icon: ClipboardCheck,
    });
  }

  if (p.require_recv_master_carton || p.bulk_ean?.trim()) {
    out.push({
      key: "carton",
      label: "Karton",
      title: "Opakowanie zbiorcze / master carton",
      className: "border-sky-200/90 bg-sky-50/80 text-sky-900",
      Icon: Package,
    });
  }

  const repl =
    (p.min_pick_quantity != null && p.min_pick_quantity > 0) ||
    (p.max_pick_quantity != null && p.max_pick_quantity > 0) ||
    (p.min_reserve_quantity != null && p.min_reserve_quantity > 0) ||
    (p.max_reserve_quantity != null && p.max_reserve_quantity > 0);
  if (repl) {
    out.push({
      key: "repl",
      label: "Uzupeł.",
      title: "Skonfigurowane progi uzupełniania (pick / zapas)",
      className: "border-emerald-200/90 bg-emerald-50/80 text-emerald-900",
      Icon: RotateCcw,
    });
  }

  const orient = (p.product_orientation_type ?? p.orientation_type ?? "any").toLowerCase();
  const stack = (p.product_stack_behavior ?? p.stack_behavior ?? "stackable").toLowerCase();
  if (orient !== "any" || stack === "no_stack") {
    out.push({
      key: "orient",
      label: orient === "upright" ? "Pion." : stack === "no_stack" ? "Bez stos." : "Orient.",
      title: `Orientacja: ${orient}; stos: ${stack}`,
      className: "border-amber-200/90 bg-amber-50/80 text-amber-950",
      Icon: Layers,
    });
  }

  return out;
}

export function ProductListLogisticsBadges({ product }: { product: ProductListRow }) {
  const badges = productLogisticsBadges(product);
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((b) => (
        <span
          key={b.key}
          title={b.title}
          className={`inline-flex max-w-full items-center gap-0.5 rounded border px-1 py-0.5 text-[10px] font-semibold leading-none ${b.className}`}
        >
          <b.Icon className="h-2.5 w-2.5 shrink-0 opacity-80" aria-hidden />
          {b.label}
        </span>
      ))}
    </div>
  );
}
