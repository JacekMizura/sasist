import { MapPin, Package, ShoppingCart } from "lucide-react";
import type { ReactNode } from "react";
import type { WmsOrderTimelineEventApi } from "../../api/wmsPackingApi";
import { buildWmsLineOperationalModel, formatWmsLineQty } from "./orderLineWmsOperationalModel";

const EPSILON = 0.0001;

function MiniTrack({ value01, activeClass }: { value01: number; activeClass: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value01)) * 100);
  return (
    <div
      className="mt-1 h-1 w-full max-w-[5.5rem] overflow-hidden rounded-full bg-slate-100"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full rounded-full ${activeClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function progressBarFillClass(
  tone: "muted" | "progress" | "done" | "shortage" | "waiting",
  kind: "pick" | "pack",
): string {
  if (tone === "done") return "bg-emerald-600";
  if (tone === "waiting") return "bg-amber-500";
  if (tone === "shortage") return "bg-amber-500";
  if (tone === "progress") return kind === "pick" ? "bg-orange-500" : "bg-slate-600";
  return "bg-slate-300";
}

/** Mockup-style WMS phase pills (dark / green / outlined). */
function statusPill(tone: "muted" | "progress" | "done" | "shortage" | "waiting", kind: "pick" | "pack"): string {
  const base =
    "inline-flex max-w-full shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide leading-none";
  if (tone === "done") return `${base} bg-emerald-600 text-white`;
  if (tone === "waiting") return `${base} bg-amber-500 text-white`;
  if (tone === "shortage") return `${base} bg-amber-500 text-white`;
  if (tone === "progress") {
    return kind === "pick"
      ? `${base} bg-slate-800 text-white`
      : `${base} bg-slate-700 text-white`;
  }
  return `${base} border border-slate-300 bg-white text-slate-600`;
}

export type OrderLineOperationalWorkflowModuleProps = {
  locationsSlot?: ReactNode;
  quantity: number;
  pickedQuantity: number;
  packedQuantity: number;
  pickedQuantityFinal?: number | null;
  wmsPickingLineStatus?: string | null;
  shortageLine?: boolean;
  omsWaitingForStock?: boolean;
  shortageDisplayKind?: string | null;
  timeline?: WmsOrderTimelineEventApi[] | null;
  /** Backend ``operator · dd.mm.yyyy HH:mm`` — zastępuje osobno pobranego operatora z osi czasu. */
  pickSubtitle?: string | null;
  packSubtitle?: string | null;
  /** Wspólne dla zamówienia: wózek / koszyk pod zbieraniem. */
  logisticsLines?: string[] | null;
};

/**
 * Jedna pozioma ścieżka operacyjna: lokalizacje | zbieranie | pakowanie.
 */
export function OrderLineOperationalWorkflowModule({
  locationsSlot,
  quantity,
  pickedQuantity,
  packedQuantity,
  pickedQuantityFinal,
  wmsPickingLineStatus,
  shortageLine = false,
  omsWaitingForStock = false,
  shortageDisplayKind = null,
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
    omsWaitingForStock,
    shortageDisplayKind,
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
    <section className="border-t border-slate-100 bg-slate-50/40 px-3 py-2" aria-label="Realizacja magazynowa — pozycja">
      <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2">
        {locationsSlot != null ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
            <div className="min-w-0">{locationsSlot}</div>
          </div>
        ) : null}

        <div className="ml-auto flex flex-wrap items-start gap-x-8 gap-y-2 sm:gap-x-10">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-3.5 w-3.5 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={statusPill(m.pickTone, "pick")}>{m.pickLabel}</span>
                <span className="text-[11px] font-bold tabular-nums text-slate-800">{qtyLine}</span>
              </div>
              <MiniTrack value01={m.pickProgress01} activeClass={progressBarFillClass(m.pickTone, "pick")} />
              {pickOpLine ? (
                <p className="mt-0.5 truncate text-[10px] font-medium text-slate-600" title={pickOpLine}>
                  {pickOpLine}
                </p>
              ) : null}
              {logistics.length > 0 ? (
                <p className="mt-0.5 truncate text-[10px] text-slate-500" title={logistics.join(" · ")}>
                  {logistics.join(" · ")}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Package className="h-3.5 w-3.5 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={statusPill(m.packTone, "pack")}>{m.packLabel}</span>
                <span className="text-[11px] font-bold tabular-nums text-slate-800">{packQtyLine}</span>
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
