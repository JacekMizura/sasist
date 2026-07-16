import type { ReactNode } from "react";
import type { LocationVisualContext, LocationVisualLastMovement } from "../../../api/wmsLocationVisualApi";
import { formatCarrierCode } from "../../../utils/formatCarrierCode";
import { storageTypeLabelPl } from "./locationPreviewVisual";

function formatDateTimeFull(raw?: string | null): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function LastMovementBlock({ movement }: { movement: LocationVisualLastMovement | null | undefined }) {
  if (!movement?.occurred_at && !movement?.type_label && !movement?.document_label) {
    return <span className="text-sm text-slate-500">—</span>;
  }

  const doc = (movement?.document_label || "").trim();
  const type = (movement?.type_label || "").trim();
  const primary = doc || type || "Ruch magazynowy";
  const when = formatDateTimeFull(movement?.occurred_at);

  return (
    <div className="min-w-0">
      <p className="truncate font-mono text-sm font-semibold text-slate-900">{primary}</p>
      {!doc && type && type !== primary ? (
        <p className="mt-0.5 truncate text-xs text-slate-600">{type}</p>
      ) : doc && type && !type.toLowerCase().includes("przyj") ? (
        <p className="mt-0.5 truncate text-xs text-slate-600">{type}</p>
      ) : null}
      <p className="mt-0.5 text-xs tabular-nums text-slate-500">{when}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-start gap-x-2 gap-y-0.5 py-1">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="min-w-0 text-sm text-slate-900">{value}</div>
    </div>
  );
}

type Props = {
  ctx: LocationVisualContext;
  locationCode: string;
  className?: string;
};

export function LocationPreviewInfoPanel({ ctx, locationCode, className = "" }: Props) {
  const code = (ctx.location.code || locationCode || "").trim() || `#${ctx.location.id}`;
  const carrierLabel = ctx.carrier ? formatCarrierCode(ctx.carrier.code) : "—";
  const rackLabel = (ctx.rack?.name ?? ctx.zone.code ?? "—").trim() || "—";
  const typeLabel = storageTypeLabelPl(ctx.occupancy.storage_type, ctx.occupancy.location_type);
  const movement =
    ctx.last_movement ??
    (ctx.last_movement_at
      ? { type_label: "Ruch magazynowy", document_label: null, occurred_at: ctx.last_movement_at }
      : null);

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}>
      <header className="shrink-0 border-b border-slate-100 px-4 py-2.5">
        <h3 className="truncate font-mono text-base font-semibold tracking-tight text-slate-900">{code}</h3>
        <p className="truncate text-xs text-slate-500">{ctx.warehouse.name}</p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 [scrollbar-width:thin]">
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          <div className="min-w-0">
            <InfoRow label="Regał" value={<span className="font-medium">{rackLabel}</span>} />
            <InfoRow label="Alejka" value={ctx.zone.aisle?.trim() || "—"} />
            <InfoRow label="Poziom" value={ctx.zone.level?.trim() || "—"} />
            <InfoRow label="Typ" value={typeLabel} />
          </div>
          <div className="min-w-0">
            <InfoRow label="Nośnik" value={<span className="font-mono font-medium">{carrierLabel}</span>} />
            <InfoRow label="SKU" value={String(ctx.occupancy.sku_count)} />
            <InfoRow label="Ilość" value={`${ctx.occupancy.total_qty} szt.`} />
            <InfoRow label="Ostatni ruch" value={<LastMovementBlock movement={movement} />} />
          </div>
        </div>
      </div>
    </div>
  );
}
