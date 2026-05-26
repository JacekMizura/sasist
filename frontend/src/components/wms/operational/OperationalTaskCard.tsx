import { Link } from "react-router-dom";
import { ChevronRight, MapPin, Package } from "lucide-react";
import type { WmsOperationalTaskApi } from "../../../api/wmsOperationalTasksApi";
import { WMS_ROUTES } from "../../../pages/wms/wmsRoutes";
import { formatOperationalDurationSince } from "../../../utils/formatOperationalDuration";
import { queueRouteLabel, taskTypeLabel } from "./operationalWorkflow";
import { OperationalLiveStatusStrip } from "./OperationalLiveStatusStrip";

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

export function operationalTaskRoute(task: WmsOperationalTaskApi): string {
  if (task.task_type === "RELOCATION") {
    return WMS_ROUTES.operationalRelocationTask(task.id);
  }
  return WMS_ROUTES.operationalTask(task.id);
}

type Props = {
  task: WmsOperationalTaskApi;
};

export function OperationalTaskCard({ task }: Props) {
  const to = operationalTaskRoute(task);
  const isRelocation = task.task_type === "RELOCATION";
  const isWaiting = task.task_type === "WAITING_SUPPLY";
  const waitingAge = isWaiting && task.waiting_oldest_at ? formatOperationalDurationSince(task.waiting_oldest_at) : null;

  return (
    <Link
      to={to}
      className="block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-indigo-300 hover:shadow-md"
    >
      <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-800">
            {queueRouteLabel(task.queue)}
          </span>
          <span className="text-[10px] font-bold text-slate-500">{taskTypeLabel(task.task_type)}</span>
        </div>
      </div>
      <div className="flex gap-3 p-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50">
          {task.image_url ? (
            <img src={task.image_url} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <Package className="text-slate-400" size={24} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-base font-bold text-slate-900">{task.product_name}</p>
          {(task.product_sku || task.product_ean) && (
            <p className="mt-0.5 font-mono text-xs text-slate-600">
              {task.product_sku ? `SKU ${task.product_sku}` : null}
              {task.product_sku && task.product_ean ? " · " : null}
              {task.product_ean ? `EAN ${task.product_ean}` : null}
            </p>
          )}
          <p className="mt-1 text-sm font-semibold text-indigo-800">{task.summary_line}</p>
          {isWaiting ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-950">
                Czeka {fmtQty(task.quantity_remaining)} szt.
              </span>
              {(task.waiting_order_count ?? 0) > 0 ? (
                <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase text-slate-700">
                  {task.waiting_order_count} zamówień
                </span>
              ) : null}
              {waitingAge !== null ? (
                <span className="rounded-lg bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-900">
                  {waitingAge}
                </span>
              ) : null}
            </div>
          ) : null}
          {isRelocation ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-lg bg-violet-100 px-2 py-0.5 text-[10px] font-black uppercase text-violet-900">
                {task.relocation_allocation_count ?? 0} alokacji · {task.relocation_order_count ?? 0} zam.
              </span>
              {(task.target_zones?.length ?? 0) > 0 ? (
                <span className="rounded-lg bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-900">
                  {task.target_zones!.slice(0, 2).join(" · ")}
                </span>
              ) : null}
            </div>
          ) : null}
          {(isRelocation ? task.picked_from_location : task.location_hint) ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-600">
              <MapPin size={12} className="shrink-0" />
              {isRelocation ? `Z: ${task.picked_from_location ?? task.location_hint}` : task.location_hint}
            </p>
          ) : null}
          <div className="mt-3">
            <OperationalLiveStatusStrip task={task} />
          </div>
        </div>
        <ChevronRight className="shrink-0 self-center text-slate-400" size={22} />
      </div>
    </Link>
  );
}
