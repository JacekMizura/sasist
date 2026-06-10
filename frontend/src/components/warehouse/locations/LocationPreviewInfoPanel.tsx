import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { LocationVisualContext } from "../../../api/wmsLocationVisualApi";
import { formatCarrierCode } from "../../../utils/formatCarrierCode";
import { LocationBadge, type WmsLocationBadgeKind } from "../LocationBadge";

function formatDateTime(raw?: string | null): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-base font-semibold leading-snug text-slate-900">{value}</dd>
    </div>
  );
}

type Props = {
  ctx: LocationVisualContext;
  locationCode: string;
};

export function LocationPreviewInfoPanel({ ctx, locationCode }: Props) {
  const [expanded, setExpanded] = useState(true);
  const code = (ctx.location.code || locationCode || "").trim() || `#${ctx.location.id}`;
  const carrierLabel = ctx.carrier ? formatCarrierCode(ctx.carrier.code) : "—";
  const badgeKind = (ctx.occupancy.location_type || "PICK").toUpperCase() as WmsLocationBadgeKind;
  const util = Math.round(ctx.occupancy.capacity_utilization_percent);
  const storageType = (ctx.occupancy.storage_type || "PRIMARY").toUpperCase();

  const detailRows: [string, string][] = [
    ["Strefa", ctx.zone.code || "—"],
    ["Alejka", ctx.zone.aisle || "—"],
    ["Poziom", ctx.zone.level || "—"],
    ["Pozycja", ctx.zone.position || "—"],
    ["Typ", storageType],
    ["Nośnik", carrierLabel],
  ];

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xl font-bold tracking-tight text-slate-900">{code}</p>
          <p className="mt-1 text-sm text-slate-600">{ctx.warehouse.name}</p>
        </div>
        <LocationBadge code={code} type={badgeKind} layoutSpread />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <DetailField label="Zajętość" value={`${util}%`} />
        <DetailField label="SKU" value={String(ctx.occupancy.sku_count)} />
        <DetailField label="Ilość" value={`${ctx.occupancy.total_qty} szt.`} />
        <DetailField label="Ostatni ruch" value={formatDateTime(ctx.last_movement_at)} />
      </dl>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-blue-500 transition-all"
          style={{ width: `${Math.min(100, Math.max(0, util))}%` }}
        />
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800"
      >
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {expanded ? "Mniej informacji" : "Więcej informacji"}
      </button>

      {expanded ? (
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-5 border-t border-slate-100 pt-4">
          {detailRows.map(([label, value]) => (
            <DetailField key={label} label={label} value={value} />
          ))}
        </dl>
      ) : null}
    </div>
  );
}
