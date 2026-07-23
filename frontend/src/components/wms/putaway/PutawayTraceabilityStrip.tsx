import type { StockDocumentItemRead } from "../../../api/stockDocumentsApi";
import { formatExpiryDatePl } from "../../../pages/wms/putawayFormat";
import { CarrierBadge } from "../../warehouse/carriers/CarrierBadge";

type PutawayTraceabilityStripProps = {
  line: StockDocumentItemRead;
  className?: string;
};

/** Operator-visible batch / expiry / serial identity for putaway. */
export default function PutawayTraceabilityStrip({ line, className = "" }: PutawayTraceabilityStripProps) {
  const batch = (line.batch_number || "").trim();
  const serialRange = (line.serial_range_label || "").trim();
  const serialList = line.serial_numbers ?? [];
  const serialLabel = serialRange || serialList.join(", ");
  const showBatch = Boolean(line.track_batch || batch);
  const showExpiry = Boolean(line.track_expiry || line.expiry_date);
  const showSerial = Boolean(line.track_serial || serialLabel);
  const carrierCode = (line.warehouse_carrier_code || "").trim();

  if (!showBatch && !showExpiry && !showSerial && !carrierCode) {
    return null;
  }

  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs ${className}`}>
      <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">Tożsamość towaru</p>
      <div className="space-y-1 font-medium text-slate-800">
        {showBatch ? (
          <p>
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Partia: </span>
            <span className="font-mono font-bold text-slate-900">{batch || "—"}</span>
          </p>
        ) : null}
        {showExpiry ? (
          <p>
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Ważność: </span>
            <span className="font-mono font-bold text-slate-900">{formatExpiryDatePl(line.expiry_date) ?? "—"}</span>
          </p>
        ) : null}
        {showSerial ? (
          <p>
            <span className="text-[10px] font-bold uppercase tracking-wide text-violet-700">Seryjny: </span>
            <span className="font-mono font-bold text-violet-950">{serialLabel || "—"}</span>
          </p>
        ) : null}
        {carrierCode ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-violet-700">Nośnik:</span>
            <CarrierBadge code={carrierCode} className="!py-0.5 !text-[10px]" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
