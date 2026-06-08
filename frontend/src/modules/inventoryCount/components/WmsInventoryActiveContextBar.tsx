import { Boxes, MapPin, X } from "lucide-react";

import type { WmsCarrierContext, WmsLocationContext } from "../wmsInventoryExecutionContext";
import { LocationBadge } from "@/components/warehouse/LocationBadge";

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
      <div className="rounded-lg border-2 border-amber-300 bg-amber-50 px-3 py-2">
        <p className="text-sm font-bold text-amber-900">Zeskanuj lokalizację, aby rozpocząć liczenie</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <MapPin className="h-5 w-5 shrink-0 text-slate-500" strokeWidth={2} />
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Lokalizacja</p>
          <LocationBadge code={location.locationCode} type="PICK" />
        </div>
      </div>

      {carrier ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border-2 border-[#1e4d8c]/35 bg-[#1e4d8c]/12 px-3 py-2.5 shadow-sm">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#1e4d8c]/15">
              <Boxes className="h-6 w-6 text-[#1e4d8c]" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-widest text-[#1e4d8c]/80">Aktywny nośnik</p>
              <p className="truncate font-mono text-base font-black text-[#1e4d8c]">{carrier.code}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClearCarrier}
            className="shrink-0 rounded-md border border-[#1e4d8c]/30 bg-white p-1.5 text-slate-600 hover:bg-slate-50"
            aria-label="Usuń nośnik"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
      ) : carrierScanMode ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border-2 border-dashed border-[#1e4d8c]/40 bg-[#eef3fa] px-3 py-2">
          <div className="flex items-center gap-2">
            <Boxes className="h-5 w-5 animate-pulse text-[#1e4d8c]" />
            <span className="text-sm font-bold text-[#1e4d8c]">Skanuj kod nośnika…</span>
          </div>
          {onSkipCarrier ? (
            <button type="button" onClick={onSkipCarrier} className="text-xs font-bold text-slate-500 underline">
              Anuluj
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={onEnterCarrierScan}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:border-[#1e4d8c]/40 hover:bg-[#eef3fa]"
        >
          <Boxes className="h-4 w-4 text-[#1e4d8c]" />
          Przypisz nośnik (paleta / kontener)
        </button>
      )}
    </div>
  );
}
