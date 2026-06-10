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
    <div className="flex h-full min-h-0 flex-col rounded-md border border-slate-700/50 bg-[#0f1520]/90 p-3 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-2xl font-bold tracking-tight text-white">{code}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{ctx.warehouse.name}</p>
        </div>
        <LocationBadge code={code} type={badgeKind} layoutSpread />
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {[
          { label: "Nośnik", value: carrierLabel || "—" },
          { label: "Zajętość", value: `${util}%` },
          { label: "SKU", value: String(ctx.occupancy.sku_count) },
          { label: "Ruch", value: formatDateTime(ctx.last_movement_at) },
        ].map((item) => (
          <div key={item.label} className="rounded bg-[#080c12]/80 px-2 py-1.5">
            <p className="text-[9px] uppercase tracking-wider text-slate-500">{item.label}</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-slate-200">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-emerald-500 to-amber-500 transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(0, util))}%` }}
        />
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-cyan-500/80 hover:text-cyan-400"
      >
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {expanded ? "Mniej" : "Więcej informacji"}
      </button>

      {expanded ? (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-slate-800 pt-2 text-xs">
          {[
            ["Strefa", ctx.zone.code],
            ["Alejka", ctx.zone.aisle],
            ["Poziom", ctx.zone.level],
            ["Pozycja", ctx.zone.position],
            ["Ilość", `${ctx.occupancy.total_qty} szt.`],
            ["Typ", ctx.occupancy.storage_type],
          ].map(([k, v]) =>
            v ? (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-slate-500">{k}</dt>
                <dd className="font-medium text-slate-300">{v || "—"}</dd>
              </div>
            ) : null,
          )}
        </dl>
      ) : null}
    </div>
  );
}
