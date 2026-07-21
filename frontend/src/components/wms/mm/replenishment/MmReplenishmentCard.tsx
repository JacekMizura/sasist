import type { WmsReplenishmentTaskRead } from "../../../../api/wmsReplenishmentApi";
import { LocationBadge } from "../../../warehouse/LocationBadge";
import { formatWarehouseLocationTypeLabel } from "../../../../utils/warehouseLocationTypeLabels";
import { replenishmentPriorityBandLabel } from "../../../../utils/replenishmentUiLabels";

function fmtQty(n: number) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 4 }).format(n);
}

function priorityTone(band: string): string {
  const b = (band || "").toUpperCase();
  if (b === "HIGH") return "border-orange-200 bg-orange-50 text-orange-900";
  if (b === "MEDIUM") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

type Props = {
  task: WmsReplenishmentTaskRead;
  onOpen: (task: WmsReplenishmentTaskRead) => void;
};

export function MmReplenishmentCard({ task, onOpen }: Props) {
  const name = (task.product_name || "").trim() || `Produkt #${task.product_id}`;
  const sku = (task.product_sku || "").trim();
  const ean = (task.product_ean || "").trim();
  const tgt = (task.target_location_code || "").trim() || `#${task.target_location_id}`;
  const pickStock = Number(task.pick_stock) || 0;
  const reserveStock = Number(task.reserve_stock) || 0;

  const sourceRows =
    task.sources && task.sources.length > 0
      ? task.sources
      : [
          {
            location_id: task.source_location_id,
            location_code: (task.source_location_code || "").trim() || `#${task.source_location_id}`,
            quantity_planned: Number(task.quantity) || 0,
            quantity_done: 0,
          },
        ];

  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className="flex w-full flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-orange-200 hover:shadow-md active:scale-[0.995]"
    >
      <div className="flex gap-3">
        <div className="shrink-0">
          {task.product_image_url ? (
            <img
              src={task.product_image_url}
              alt=""
              className="h-[88px] w-[88px] rounded-xl border border-slate-200 bg-white object-contain"
            />
          ) : (
            <span className="flex h-[88px] w-[88px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-slate-400">
              —
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-base font-bold leading-snug text-slate-900">{name}</p>
            <span
              className={`shrink-0 rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${priorityTone(task.priority_band)}`}
            >
              {replenishmentPriorityBandLabel(task.priority_band)}
            </span>
          </div>
          <p className="mt-1 truncate font-mono text-xs text-slate-600">
            {[sku ? `SKU ${sku}` : null, ean ? `EAN ${ean}` : null].filter(Boolean).join(" · ") || "—"}
          </p>
          <div className="mt-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Do uzupełnienia</p>
            <p className="text-2xl font-black tabular-nums text-orange-900">{fmtQty(Number(task.quantity) || 0)} szt.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Stan {formatWarehouseLocationTypeLabel("PICK")}
          </p>
          <LocationBadge code={tgt} type="PICK" layoutSpread className="w-full" />
          <p className="mt-2 text-xs font-semibold tabular-nums text-slate-700">{fmtQty(pickStock)} szt.</p>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Stan {formatWarehouseLocationTypeLabel("BUFFER")}
          </p>
          <p className="text-xs font-semibold tabular-nums text-slate-800">{fmtQty(reserveStock)} szt.</p>
        </div>
      </div>

      <div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Lokalizacje rezerwy</p>
        <ul className="space-y-2">
          {sourceRows.map((s) => {
            const code = (s.location_code || "").trim() || `#${s.location_id}`;
            const done = Number(s.quantity_done) || 0;
            const plan = Number(s.quantity_planned) || 0;
            return (
              <li key={`${s.location_id}-${plan}`}>
                <LocationBadge code={code} type="BUFFER" layoutSpread className="w-full" />
                <p className="mt-1 text-xs font-semibold tabular-nums text-slate-700">
                  {fmtQty(plan)} szt.{done > 0 ? ` · wykonano ${fmtQty(done)}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      </div>

      {task.days_of_cover != null && Number.isFinite(Number(task.days_of_cover)) ? (
        <p className="text-xs text-slate-500">
          Pokrycie (szac.): <span className="font-semibold tabular-nums">{fmtQty(Number(task.days_of_cover))}</span> dni
        </p>
      ) : null}
    </button>
  );
}
