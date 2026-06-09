import { MapPin, Package, X } from "lucide-react";

import type { WmsCarrierContext, WmsLocationContext } from "../../wmsInventoryExecutionContext";
import { WMS_INV } from "./theme";

type ActiveProduct = {
  product_name?: string | null;
  sku?: string | null;
  ean?: string | null;
};

type Props = {
  location: WmsLocationContext | null;
  carrier: WmsCarrierContext;
  activeProduct?: ActiveProduct | null;
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
      <div className={`${WMS_INV.card} ${WMS_INV.cardPad} border-amber-200 bg-amber-50`}>
        <p className="text-sm font-bold text-amber-900">Zeskanuj lokalizację, aby rozpocząć liczenie</p>
      </div>
    );
  }

  return (
    <div className={`${WMS_INV.card} ${WMS_INV.cardPad}`}>
      <div className="mb-4 flex items-center justify-between">
        <div className={WMS_INV.textLabel}>Lokalizacja</div>
        {locationSubline ? <span className={WMS_INV.locationSub}>{locationSubline}</span> : null}
      </div>

      <div className={`${WMS_INV.locationCode} mb-4 w-full`}>
        <MapPin className="mr-3 h-5 w-5 shrink-0" />
        {location.locationCode}
      </div>

      {carrier ? (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-[#d6defc] bg-[#eff2fe] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Package className="h-4 w-4 shrink-0 text-[#5a45d0]" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Nośnik</p>
              <p className="truncate font-mono text-sm font-bold text-[#5a45d0]">{carrier.code}</p>
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
        <div className="mb-4 flex items-center justify-between rounded-xl border-2 border-dashed border-[#5a45d0]/40 bg-[#eff2fe]/50 px-4 py-4">
          <span className="text-sm font-bold text-[#5a45d0]">Skanuj kod nośnika…</span>
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
          className="flex w-full items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-4 text-xs font-bold uppercase tracking-widest text-slate-500 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
        >
          <Package className="mr-2 h-4 w-4 text-slate-400" />
          Przypisz nośnik (paleta / kontener)
        </button>
      )}
    </div>
  );
}
