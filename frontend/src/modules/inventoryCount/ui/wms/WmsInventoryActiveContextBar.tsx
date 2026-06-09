import { LocationBadge } from "@/components/warehouse/LocationBadge";
import type { WmsLocationContext } from "../../wmsInventoryExecutionContext";

type Props = {
  location: WmsLocationContext | null;
  locationSubline?: string | null;
};

/** Minimal location strip — collector workflow, no carrier here. */
export default function WmsInventoryActiveContextBar({ location, locationSubline }: Props) {
  if (!location?.confirmed) {
    return (
      <p className="py-2 text-center text-base font-black text-amber-800">Zeskanuj lokalizację</p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1 py-1 text-center">
      {locationSubline ? (
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{locationSubline}</span>
      ) : null}
      <LocationBadge code={location.locationCode} type="PICK" layoutSpread className="max-w-full" />
    </div>
  );
}
