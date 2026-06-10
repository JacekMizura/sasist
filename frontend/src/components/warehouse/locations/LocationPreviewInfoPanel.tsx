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

type Props = {
  ctx: LocationVisualContext;
  locationCode: string;
};

export function LocationPreviewInfoPanel({ ctx, locationCode }: Props) {
  const [expanded, setExpanded] = useState(false);
  const code = (ctx.location.code || locationCode || "").trim() || `#${ctx.location.id}`;
  const carrierLabel = ctx.carrier ? formatCarrierCode(ctx.carrier.code) : null;
  const badgeKind = (ctx.occupancy.location_type || "PICK").toUpperCase() as WmsLocationBadgeKind;
  const util = Math.round(ctx.occupancy.capacity_utilization_percent);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-3 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Lokalizacja</p>

      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-lg font-black tracking-tight text-slate-900">{code}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {ctx.warehouse.name}
            {ctx.zone.code ? ` · ${ctx.zone.code}` : ""}
          </p>
        </div>
        <LocationBadge code={code} type={badgeKind} layoutSpread />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <dt className="text-slate-500">Nośnik</dt>
          <dd className="font-semibold text-slate-900">{carrierLabel || "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Zajętość</dt>
          <dd className="font-semibold text-slate-900">{util}%</dd>
        </div>
        <div>
          <dt className="text-slate-500">SKU</dt>
          <dd className="font-semibold text-slate-900">{ctx.occupancy.sku_count}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Ostatni ruch</dt>
          <dd className="font-semibold text-slate-900">{formatDateTime(ctx.last_movement_at)}</dd>
        </div>
      </dl>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-amber-500 transition-all"
          style={{ width: `${Math.min(100, Math.max(0, util))}%` }}
        />
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900"
      >
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {expanded ? "Mniej informacji" : "Więcej informacji"}
      </button>

      {expanded ? (
        <dl className="mt-2 space-y-1.5 border-t border-slate-200/80 pt-2 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Strefa</dt>
            <dd className="font-medium text-slate-800">{ctx.zone.code || "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Alejka</dt>
            <dd className="font-medium text-slate-800">{ctx.zone.aisle || "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Poziom</dt>
            <dd className="font-medium text-slate-800">{ctx.zone.level || "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Pozycja</dt>
            <dd className="font-medium text-slate-800">{ctx.zone.position || "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Ilość</dt>
            <dd className="font-medium text-slate-800">{ctx.occupancy.total_qty} szt.</dd>
          </div>
          {ctx.occupancy.storage_type ? (
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Typ</dt>
              <dd className="font-medium text-slate-800">{ctx.occupancy.storage_type}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}
