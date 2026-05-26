import { memo } from "react";
import type { WmsPackingRecommendedCartonApi } from "../../../../api/wmsPackingApi";
import { PackingMainCartonStaticCard } from "../PackingRecommendedCartons";
import { CourierBadge } from "../CourierBadge";
import { orderNumberLabel } from "../packingHelpers";

export type StaticOrderPanelProps = {
  orderNumber: string;
  customerComment: string | null;
  courierName: string | null;
  labelCount: number;
  shippingMethodLogoUrl?: string | null;
  methodNameForLogo?: string | null;
  orderValueDisplay: string | null;
  paymentLabel: string | null;
  /** Notatka magazynu (`staff_notes`) — tylko gdy niepusta. */
  staffNotes: string | null;
  /** Wybrany karton z pakowania — zamiast statycznego „Gabaryt A”. */
  selectedCarton?: WmsPackingRecommendedCartonApi | null;
};

function StaticOrderPanelInner({
  orderNumber,
  customerComment,
  courierName,
  labelCount,
  shippingMethodLogoUrl,
  methodNameForLogo,
  orderValueDisplay,
  paymentLabel,
  staffNotes,
  selectedCarton,
}: StaticOrderPanelProps) {
  const codLine =
    orderValueDisplay?.trim() ||
    (paymentLabel && paymentLabel.trim()) ||
    "—";

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {customerComment ? (
        <div
          className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900"
          role="status"
        >
          <span className="text-[11px] font-bold uppercase tracking-wide text-red-800">UWAGI KLIENTA</span>
          <p className="mt-1 leading-snug">{customerComment}</p>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-row items-start gap-4">
        <CourierBadge
          variant="tile"
          courierName={courierName}
          labelCount={labelCount}
          logoUrl={shippingMethodLogoUrl}
          methodNameForLogo={methodNameForLogo ?? courierName}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">
            <div className="px-4 pb-2 pt-4">
              <p className="text-lg font-semibold text-slate-500">{orderNumberLabel(orderNumber)}</p>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4 px-4 pb-4 pt-1">
              <div className="min-w-0 flex-1">
                <PackingMainCartonStaticCard carton={selectedCarton} />
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold text-slate-500">Kwota pobrania</p>
                <p className="text-lg font-bold tabular-nums text-slate-900">{codLine}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {staffNotes ? (
        <div
          className="w-full min-w-0 rounded-lg px-3 py-2.5 text-white shadow-sm"
          style={{ background: "#c62828" }}
          role="status"
        >
          <p className="text-[11px] font-bold uppercase tracking-wide">NOTATKA</p>
          <p className="mt-1 text-sm font-medium leading-snug">{staffNotes}</p>
        </div>
      ) : null}
    </div>
  );
}

function propsEqual(a: StaticOrderPanelProps, b: StaticOrderPanelProps): boolean {
  return (
    a.orderNumber === b.orderNumber &&
    a.customerComment === b.customerComment &&
    a.courierName === b.courierName &&
    a.labelCount === b.labelCount &&
    (a.shippingMethodLogoUrl ?? "") === (b.shippingMethodLogoUrl ?? "") &&
    (a.methodNameForLogo ?? "") === (b.methodNameForLogo ?? "") &&
    a.orderValueDisplay === b.orderValueDisplay &&
    a.paymentLabel === b.paymentLabel &&
    a.staffNotes === b.staffNotes &&
    (a.selectedCarton?.id ?? "") === (b.selectedCarton?.id ?? "")
  );
}

export const StaticOrderPanel = memo(StaticOrderPanelInner, propsEqual);
