import type { LocationVisualContext } from "../../../api/wmsLocationVisualApi";
import { formatCarrierCode } from "../../../utils/formatCarrierCode";

function formatDateTime(raw?: string | null): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-3 py-1.5">
      <span className="w-[5.5rem] shrink-0 text-sm text-slate-500">{label}:</span>
      <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm font-medium text-slate-900">
        {value}
      </span>
    </div>
  );
}

type Props = {
  ctx: LocationVisualContext;
  locationCode: string;
};

export function LocationPreviewInfoPanel({ ctx, locationCode }: Props) {
  const code = (ctx.location.code || locationCode || "").trim() || `#${ctx.location.id}`;
  const carrierLabel = ctx.carrier ? formatCarrierCode(ctx.carrier.code) : "—";
  const rackLabel = (ctx.rack?.name ?? ctx.zone.code ?? "—").trim() || "—";

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="border-b border-slate-100 pb-4">
        <h3 className="overflow-x-auto whitespace-nowrap font-mono text-lg font-semibold tracking-tight text-slate-900">
          {code}
        </h3>
        <p className="mt-1 truncate text-sm text-slate-600">{ctx.warehouse.name}</p>
      </header>

      <div className="mt-4 grid min-w-0 grid-cols-1 gap-x-10 gap-y-0 sm:grid-cols-2">
        <div className="min-w-0">
          <InfoRow label="Regał" value={rackLabel} />
          <InfoRow label="Alejka" value={ctx.zone.aisle?.trim() || "—"} />
          <InfoRow label="Poziom" value={ctx.zone.level?.trim() || "—"} />
          <InfoRow label="Pozycja" value={ctx.zone.position?.trim() || "—"} />
        </div>
        <div className="min-w-0">
          <InfoRow label="Nośnik" value={carrierLabel} />
          <InfoRow label="SKU" value={String(ctx.occupancy.sku_count)} />
          <InfoRow label="Ilość" value={`${ctx.occupancy.total_qty} szt.`} />
          <InfoRow label="Ostatni ruch" value={formatDateTime(ctx.last_movement_at)} />
        </div>
      </div>
    </div>
  );
}
