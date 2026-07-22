import { MapPin, X } from "lucide-react";
import type { LocationStockRow } from "../../../api/locationStockApi";
import { sortDirectSalesLocationRows } from "../../../modules/directSales/settings/sortLocationRows";
import { useResolvedDirectSalesSettings } from "../../../modules/directSales/settings/resolvedDirectSalesSettings";
import { resolveLocationZoneKind, ZONE_BADGE_CLASS } from "../stock/stockZoneStyles";

type Props = {
  open: boolean;
  loading: boolean;
  rows: LocationStockRow[];
  currentLocationId: number | null;
  onClose: () => void;
  onPick: (locationId: number) => void;
};

function zoneLabel(zone: string | null): string {
  const kind = resolveLocationZoneKind(zone);
  if (kind === "store") return "Sklep";
  if (kind === "reserve") return "Rezerwa";
  if (kind === "blocked") return "Zablokowane";
  if (kind === "showroom") return "Ekspozycja";
  return "Lokacja";
}

export function LocationPickerModal({
  open,
  loading,
  rows,
  currentLocationId,
  onClose,
  onPick,
}: Props) {
  const resolvedDirectSalesSettings = useResolvedDirectSalesSettings();

  if (!open) return null;

  const sorted = sortDirectSalesLocationRows(rows, resolvedDirectSalesSettings);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4">
      {/* Kontener Modala */}
      <div className="flex max-h-[70vh] w-full max-w-md flex-col rounded-[2rem] border border-blue-50 bg-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] overflow-hidden">
        
        {/* Nagłówek */}
        <div className="flex items-center justify-between border-b border-blue-50 px-6 py-4 bg-white z-10">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <MapPin size={20} className="text-blue-600" /> Wybierz lokalizację
          </h3>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
            title="Zamknij (Esc)"
          >
            <X size={20} />
          </button>
        </div>

        {/* Ciało Modala */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3 custom-scrollbar">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm font-bold text-blue-400 animate-pulse">
              Ładuję stany…
            </div>
          ) : sorted.length ? (
            <ul className="space-y-2">
              {sorted.map((loc) => {
                const kind = resolveLocationZoneKind(loc.operational_zone_type);
                const active = currentLocationId === loc.location_id;
                
                return (
                  <li key={loc.location_id}>
                    <button
                      type="button"
                      onClick={() => onPick(loc.location_id)}
                      className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition-all border-2 group ${
                        active 
                          ? "bg-blue-50 border-blue-200 shadow-sm" 
                          : "bg-white border-transparent hover:bg-slate-50 hover:border-slate-100"
                      }`}
                    >
                      <div className="min-w-0 flex items-center gap-3">
                        <span className={`rounded-lg px-2 py-1 text-xs font-bold tracking-wide shadow-sm ${ZONE_BADGE_CLASS[kind]}`}>
                          {loc.code}
                        </span>
                        <span className={`text-xs font-medium ${active ? "text-blue-700" : "text-slate-500"}`}>
                          {zoneLabel(loc.operational_zone_type)}
                        </span>
                      </div>
                      
                      <div className="shrink-0 text-right">
                        <span className={`text-sm font-black ${active ? "text-blue-700" : "text-slate-700"}`}>
                          {loc.available} <span className="text-[10px] font-medium text-slate-400">szt.</span>
                        </span>
                        {loc.type ? (
                          <div className="text-[10px] font-medium text-slate-400">{loc.type}</div>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-4 py-8 text-center text-sm font-medium text-slate-500 bg-slate-50 rounded-2xl border border-slate-100 border-dashed">
              Brak dostępnych lokacji ze stanem.
            </div>
          )}
        </div>

      </div>
    </div>
  );
}