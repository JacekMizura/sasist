import { MapPin, Package } from "lucide-react";

import type { InventoryLineRead } from "../../../api/inventoryCountApi";
import {
  DIFF_CLASS_LABELS,
  ERP_INV,
  LINE_STATUS_LABELS,
  lineStatusBadgeClass,
  locationBadgeClass,
} from "../erpInventoryTheme";

type Props = { code: string; line?: Pick<InventoryLineRead, "status" | "difference_quantity"> };

export function InventoryLocationBadge({ code, line }: Props) {
  const cls = line ? locationBadgeClass(line.status, line.difference_quantity) : "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
  return (
    <span className={`${ERP_INV.badge} ${cls}`}>
      <MapPin className="mr-0.5 inline h-3 w-3" aria-hidden />
      {code}
    </span>
  );
}

export function InventoryLineStatusBadge({ line }: { line: InventoryLineRead }) {
  const diff = line.difference_quantity;
  const hasDiff = diff != null && Math.abs(diff) > 1e-9;
  const label = line.status === "recount"
    ? "RECOUNT"
    : hasDiff
      ? "RÓŻNICA"
      : line.counted_quantity != null
        ? "OK"
        : LINE_STATUS_LABELS[line.status] ?? line.status;
  return (
    <span className={`${ERP_INV.badge} ${lineStatusBadgeClass(line.status, diff)}`}>{label}</span>
  );
}

export function InventoryVarianceClassBadge({ diffClass }: { diffClass?: string | null }) {
  if (!diffClass || diffClass === "none") return null;
  const label = DIFF_CLASS_LABELS[diffClass] ?? diffClass;
  const tone =
    diffClass === "mandatory_recount"
      ? "bg-orange-100 text-orange-800"
      : diffClass === "supervisor_review"
        ? "bg-red-100 text-red-800"
        : "bg-emerald-100 text-emerald-800";
  return <span className={`${ERP_INV.badge} ${tone}`}>{label}</span>;
}

export function InventoryProductThumb({ url, name }: { url?: string | null; name?: string | null }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-white">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-contain" loading="lazy" />
      ) : (
        <Package className="h-4 w-4 text-slate-400" aria-hidden />
      )}
      <span className="sr-only">{name ?? "Produkt"}</span>
    </div>
  );
}
