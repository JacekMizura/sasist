import { X } from "lucide-react";

import type { WmsCarrierContext, WmsLocationContext } from "../wmsInventoryExecutionContext";
import { LocationBadge } from "@/components/warehouse/LocationBadge";
import { WMS_INV } from "../wmsIndustrialTheme";

type Props = {
  location: WmsLocationContext | null;
  carrier: WmsCarrierContext;
  onEnterCarrierScan: () => void;
  onClearCarrier: () => void;
  carrierScanMode?: boolean;
  onSkipCarrier?: () => void;
};

export default function WmsInventoryActiveContextBar({
  location,
  carrier,
  onEnterCarrierScan,
  onClearCarrier,
  carrierScanMode,
  onSkipCarrier,
}: Props) {
  if (!location?.confirmed) {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5">
        <p className="text-[11px] font-bold text-amber-900">Zeskanuj lokalizację, aby rozpocząć liczenie</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Lokalizacja</span>
        <LocationBadge code={location.locationCode} type="PICK" />
      </div>

      {carrier ? (
        <div className={`flex items-center gap-1 ${WMS_INV.chipActive}`}>
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Nośnik</span>
          <span className="font-mono text-[11px] font-black text-[#1e4d8c]">{carrier.code}</span>
          <button
            type="button"
            onClick={onClearCarrier}
            className="ml-0.5 rounded p-0.5 text-slate-500 hover:bg-white/60 hover:text-slate-800"
            aria-label="Usuń nośnik"
          >
            <X className="h-3 w-3" strokeWidth={2.5} />
          </button>
        </div>
      ) : carrierScanMode ? (
        <div className="flex items-center gap-2">
          <span className={`${WMS_INV.chip} ring-1 ring-[#1e4d8c]/30`}>Skanuj nośnik…</span>
          {onSkipCarrier ? (
            <button type="button" onClick={onSkipCarrier} className="text-[10px] font-bold text-slate-400 underline">
              Anuluj
            </button>
          ) : null}
        </div>
      ) : (
        <button type="button" onClick={onEnterCarrierScan} className={WMS_INV.chip}>
          + nośnik
        </button>
      )}
    </div>
  );
}
