import { Package, ShoppingCart } from "lucide-react";
import type { WmsOrderTimelineEventApi } from "../../api/wmsPackingApi";
import { buildWmsLineOperationalModel } from "./orderLineWmsOperationalModel";

const pillBase =
  "inline-flex max-w-full shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none tracking-tight";

function pickPillClass(tone: "muted" | "progress" | "done" | "shortage"): string {
  if (tone === "shortage") return `${pillBase} border-amber-300/80 bg-amber-50 text-amber-950`;
  if (tone === "done") return `${pillBase} border-emerald-200/90 bg-emerald-50/95 text-emerald-950`;
  if (tone === "progress") return `${pillBase} border-blue-200/90 bg-blue-50/95 text-blue-950`;
  return `${pillBase} border-slate-200/90 bg-white text-slate-700`;
}

function packPillClass(tone: "muted" | "progress" | "done"): string {
  if (tone === "done") return `${pillBase} border-emerald-200/90 bg-emerald-50/95 text-emerald-950`;
  if (tone === "progress") return `${pillBase} border-indigo-200/90 bg-indigo-50/95 text-indigo-950`;
  return `${pillBase} border-slate-200/90 bg-white text-slate-700`;
}

export type OrderLineWmsInlinePickPackSegment = "both" | "picking" | "packing";

type Props = {
  quantity: number;
  pickedQuantity: number;
  packedQuantity: number;
  pickedQuantityFinal?: number | null;
  wmsPickingLineStatus?: string | null;
  timeline?: WmsOrderTimelineEventApi[] | null;
  shortageLine?: boolean;
  segment?: OrderLineWmsInlinePickPackSegment;
};

function OperatorHint({ name }: { name: string | null | undefined }) {
  if (!name) return null;
  return (
    <span className="max-w-[10rem] truncate text-[10px] font-medium leading-tight text-slate-600" title={name}>
      {name}
    </span>
  );
}

/** Wariant listowy — ten sam model co {@link OrderLineOperationalWorkflowModule}. */
export function OrderLineWmsInlinePickPack({
  quantity,
  pickedQuantity,
  packedQuantity,
  pickedQuantityFinal,
  wmsPickingLineStatus,
  timeline,
  shortageLine = false,
  segment = "both",
}: Props) {
  const m = buildWmsLineOperationalModel({
    quantity,
    pickedQuantity,
    packedQuantity,
    pickedQuantityFinal,
    wmsPickingLineStatus,
    shortageLine,
    timeline,
  });

  const pickBlock = (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className={pickPillClass(m.pickTone)} title="Postęp zbierania (WMS)">
        <ShoppingCart className="h-3 w-3 shrink-0 opacity-90" strokeWidth={2} aria-hidden />
        <span className="min-w-0">{m.pickLabel}</span>
      </span>
      <OperatorHint name={m.pickUser} />
    </span>
  );

  const packBlock = (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className={packPillClass(m.packTone)} title="Postęp pakowania (WMS)">
        <Package className="h-3 w-3 shrink-0 opacity-90" strokeWidth={2} aria-hidden />
        <span className="min-w-0">{m.packLabel}</span>
      </span>
      <OperatorHint name={m.packUser} />
    </span>
  );

  if (segment === "picking") return pickBlock;
  if (segment === "packing") return packBlock;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      {pickBlock}
      {packBlock}
    </div>
  );
}
