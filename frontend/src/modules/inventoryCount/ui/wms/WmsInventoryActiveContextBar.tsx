import { Package, X } from "lucide-react";

import { CarrierBadge } from "@/components/warehouse/carriers/CarrierBadge";
import { LocationBadge } from "@/components/warehouse/LocationBadge";
import type { WmsCarrierContext, WmsLocationContext } from "../../wmsInventoryExecutionContext";

type Props = {
  location: WmsLocationContext | null;
  carrier: WmsCarrierContext;
  onEnterCarrierScan: () => void;
  onClearCarrier: () => void;
  carrierScanMode?: boolean;
  onSkipCarrier?: () => void;
  locationSubline?: string | null;
};

export default function WmsInventoryActiveContextBar({
  location,
  carrier,
  onEnterCarrierScan,
  onClearCarrier,
  carrierScanMode,
  onSkipCarrier,
  locationSubline,
}: Props) {
  if (!location?.confirmed) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
        <p className="text-sm font-black text-amber-900">Zeskanuj lokalizację, aby rozpocząć liczenie</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Lokalizacja</span>
        {locationSubline ? (
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{locationSubline}</span>
        ) : null}
      </div>

      <LocationBadge code={location.locationCode} type="PICK" layoutSpread className="w-full max-w-none" />

      {carrier ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Package className="h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nośnik</p>
              <CarrierBadge code={carrier.code} className="mt-1" />
            </div>
          </div>
          <button
            type="button"
            onClick={onClearCarrier}
            className="shrink-0 rounded-full p-2 text-slate-400 hover:bg-white hover:text-slate-600"
            aria-label="Usuń nośnik"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
      ) : carrierScanMode ? (
        <div className="flex items-center justify-between rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/30 px-4 py-4">
          <span className="text-sm font-bold text-indigo-700">Skanuj kod nośnika…</span>
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
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-4 text-xs font-black uppercase tracking-widest text-slate-500 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
        >
          <Package className="h-4 w-4 text-slate-400" />
          Przypisz nośnik
        </button>
      )}
    </div>
  );
}
