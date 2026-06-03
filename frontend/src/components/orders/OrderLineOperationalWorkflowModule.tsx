import { MapPin, Package, ShoppingCart } from "lucide-react";
import type { ReactNode } from "react";
import type { WmsOrderTimelineEventApi } from "../../api/wmsPackingApi";
import { buildWmsLineOperationalModel, formatWmsLineQty } from "./orderLineWmsOperationalModel";

const EPSILON = 0.0001;

function MiniTrack({ value01, activeClass }: { value01: number; activeClass: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value01)) * 100);
  return (
    <div
      className="h-1.5 w-full max-w-[7rem] overflow-hidden rounded-full bg-slate-100"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full rounded-full ${activeClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const pillBase =
  "inline-flex max-w-full shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold leading-none";

function progressBarFillClass(
  tone: "muted" | "progress" | "done" | "shortage",
  kind: "pick" | "pack",
): string {
  if (tone === "done") return "bg-emerald-600";
  if (tone === "shortage") return "bg-amber-500";
  if (tone === "progress") return kind === "pick" ? "bg-blue-600" : "bg-indigo-600";
  return "bg-slate-400";
}

function statusPill(
  tone: "muted" | "progress" | "done" | "shortage",
  kind: "pick" | "pack",
): string {
  if (kind === "pick") {
    if (tone === "shortage") return `${pillBase} border-amber-300/90 bg-amber-50 text-amber-950`;
    if (tone === "done") return `${pillBase} border-emerald-300/90 bg-emerald-50 text-emerald-950`;
    if (tone === "progress") return `${pillBase} border-blue-400/90 bg-blue-50 text-blue-950`;
    return `${pillBase} border-slate-200/90 bg-white text-slate-800`;
  }
  if (tone === "done") return `${pillBase} border-emerald-300/90 bg-emerald-50 text-emerald-950`;
  if (tone === "progress") return `${pillBase} border-indigo-400/90 bg-indigo-50 text-indigo-950`;
  return `${pillBase} border-slate-200/90 bg-white text-slate-800`;
}

export type OrderLineOperationalWorkflowModuleProps = {
  locationsSlot: ReactNode;
  quantity: number;
  pickedQuantity: number;
  packedQuantity: number;
  pickedQuantityFinal?: number | null;
  wmsPickingLineStatus?: string | null;
  shortageLine?: boolean;
  timeline?: WmsOrderTimelineEventApi[] | null;
  /** Backend ``operator · dd.mm.yyyy HH:mm`` — zastępuje osobno pobranego operatora z osi czasu. */
  pickSubtitle?: string | null;
  packSubtitle?: string | null;
  /** Wspólne dla zamówienia: wózek / koszyk pod zbieraniem. */
  logisticsLines?: string[] | null;
};

/**
 * Jedna pozioma ścieżka operacyjna: lokalizacje | zbieranie | pakowanie (layout magazynowy).
 */
export function OrderLineOperationalWorkflowModule({
  locationsSlot,
  quantity,
  pickedQuantity,
  packedQuantity,
  pickedQuantityFinal,
  wmsPickingLineStatus,
  shortageLine = false,
  timeline,
  pickSubtitle,
  packSubtitle,
  logisticsLines,
}: OrderLineOperationalWorkflowModuleProps) {
  const m = buildWmsLineOperationalModel({
    quantity,
    pickedQuantity,
    packedQuantity,
    pickedQuantityFinal,
    wmsPickingLineStatus,
    shortageLine,
    timeline,
  });

  const qtyLine =
    m.quantity > EPSILON ? `${formatWmsLineQty(m.pickedEff)} / ${formatWmsLineQty(m.quantity)}` : "—";
  const packQtyLine =
    m.quantity > EPSILON ? `${formatWmsLineQty(m.packed)} / ${formatWmsLineQty(m.quantity)}` : "—";

  const pickOpLine = (pickSubtitle ?? "").trim() || m.pickUser;
  const packOpLine = (packSubtitle ?? "").trim() || m.packUser;
  const logistics = (logisticsLines ?? []).map((x) => String(x).trim()).filter(Boolean);

  return (
    <section
      className="bg-white px-5 py-5"
      aria-label="Realizacja magazynowa — pozycja"
    >
      <div className="flex items-center gap-8">
        <div className="flex shrink-0 items-center gap-3">

          <div className="flex flex-wrap gap-2">
            {locationsSlot}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-8">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:min-w-[10.5rem] sm:flex-none sm:max-w-[13rem]">
            <ShoppingCart className="h-3.5 w-3.5 shrink-0 text-blue-700" strokeWidth={2} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1">
                <span className={statusPill(m.pickTone, "pick")}>Zbieranie</span>
                <span className="text-[11px] font-bold tabular-nums text-slate-900">{qtyLine}</span>
              </div>
              <MiniTrack value01={m.pickProgress01} activeClass={progressBarFillClass(m.pickTone, "pick")} />
              {logistics.length ? (
                <div className="mt-0.5 space-y-0.5">
                  {logistics.map((ln) => (
                    <p key={ln} className="truncate text-[10px] font-medium text-slate-600" title={ln}>
                      {ln}
                    </p>
                  ))}
                </div>
              ) : null}
              {pickOpLine ? (
                <p className="mt-0.5 truncate text-[10px] font-medium text-slate-600" title={pickOpLine}>
                  {pickOpLine}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-2 sm:min-w-[10.5rem] sm:flex-none sm:max-w-[13rem]">
            <Package className="h-3.5 w-3.5 shrink-0 text-indigo-800" strokeWidth={2} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1">
                <span className={statusPill(m.packTone, "pack")}>Pakowanie</span>
                <span className="text-[11px] font-bold tabular-nums text-slate-900">{packQtyLine}</span>
              </div>
              <MiniTrack value01={m.packProgress01} activeClass={progressBarFillClass(m.packTone, "pack")} />
              {packOpLine ? (
                <p className="mt-0.5 truncate text-[10px] font-medium text-slate-600" title={packOpLine}>
                  {packOpLine}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
