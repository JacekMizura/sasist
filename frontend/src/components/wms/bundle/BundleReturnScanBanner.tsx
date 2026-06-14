import type { BundleScanOut } from "../../../api/bundlesLogisticsApi";
import { bundleDisplayTitle } from "../../../utils/bundleScanFlow";
import { BundleTraceabilityStrip } from "./BundleTraceabilityStrip";

type Props = {
  scan: BundleScanOut;
  onOpenOrder?: (orderId: number) => void;
  className?: string;
};

export function BundleReturnScanBanner({ scan, onOpenOrder, className = "" }: Props) {
  const orderIds = scan.return_tree_order_ids ?? [];
  return (
    <div className={`rounded-2xl border border-amber-200 bg-amber-50/80 p-4 space-y-3 ${className}`}>
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-amber-800">Bundle — zwrot RMZ</p>
        <p className="text-base font-bold text-slate-900 mt-1">{bundleDisplayTitle(scan.bundle_name)}</p>
        <p className="text-sm font-medium text-slate-600 mt-1">
          Zaznacz zwrócone składniki w drzewie RMZ (bez ręcznego wyszukiwania).
        </p>
      </div>
      {orderIds.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {orderIds.slice(0, 5).map((oid) => (
            <button
              key={oid}
              type="button"
              onClick={() => onOpenOrder?.(oid)}
              className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
            >
              Zamówienie #{oid}
            </button>
          ))}
        </div>
      ) : null}
      <BundleTraceabilityStrip links={scan.traceability_links} />
    </div>
  );
}
