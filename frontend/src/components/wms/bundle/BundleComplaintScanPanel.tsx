import type { BundleScanOut } from "../../../api/bundlesLogisticsApi";
import { bundleDisplayTitle } from "../../../utils/bundleScanFlow";
import { BundleTraceabilityStrip } from "./BundleTraceabilityStrip";

type Props = {
  scan: BundleScanOut;
  className?: string;
};

export function BundleComplaintScanPanel({ scan, className = "" }: Props) {
  return (
    <div className={`rounded-2xl border border-sky-200 bg-sky-50/60 p-4 space-y-3 ${className}`}>
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-sky-800">Reklamacja — bundle</p>
        <p className="text-base font-bold text-slate-900 mt-1">{bundleDisplayTitle(scan.bundle_name)}</p>
        <p className="text-sm font-medium text-slate-600 mt-1">Historia partii i traceability dla tego pakietu.</p>
      </div>
      <BundleTraceabilityStrip links={scan.traceability_links} />
    </div>
  );
}
