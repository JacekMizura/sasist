import type { LocationStockRow } from "../../../api/locationStockApi";
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
  if (kind === "backroom") return "Magazyn";
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
  if (!open) return null;

  const sorted = [...rows].sort((a, b) => {
    const za = resolveLocationZoneKind(a.operational_zone_type);
    const zb = resolveLocationZoneKind(b.operational_zone_type);
    const rank = (k: string) => (k === "store" ? 0 : k === "showroom" ? 1 : k === "primary" ? 2 : 3);
    const dr = rank(za) - rank(zb);
    if (dr !== 0) return dr;
    return (b.sales_priority ?? 0) - (a.sales_priority ?? 0);
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/35 p-3">
      <div className="flex max-h-[70vh] w-full max-w-md flex-col rounded-xl border border-slate-200 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          <h3 className="text-sm font-semibold text-slate-900">Wybierz lokalizację</h3>
          <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:text-slate-800">
            Esc · Zamknij
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {loading ? (
            <p className="px-2 py-4 text-sm text-slate-500">Ładuję stany…</p>
          ) : sorted.length ? (
            <ul className="space-y-1">
              {sorted.map((loc) => {
                const kind = resolveLocationZoneKind(loc.operational_zone_type);
                const active = currentLocationId === loc.location_id;
                return (
                  <li key={loc.location_id}>
                    <button
                      type="button"
                      onClick={() => onPick(loc.location_id)}
                      className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50 ${
                        active ? "bg-blue-50 ring-1 ring-blue-200" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${ZONE_BADGE_CLASS[kind]}`}>
                          {loc.code}
                        </span>
                        <span className="ml-2 text-[10px] text-slate-500">{zoneLabel(loc.operational_zone_type)}</span>
                      </div>
                      <span className="shrink-0 text-xs font-medium text-slate-700">{loc.available} szt.</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-2 py-4 text-sm text-slate-500">Brak dostępnych lokacji ze stanem.</p>
          )}
        </div>
      </div>
    </div>
  );
}
