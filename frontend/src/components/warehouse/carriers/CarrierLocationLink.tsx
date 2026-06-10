import { LocationBadge } from "../LocationBadge";

type Props = {
  locationCode: string | null | undefined;
  locationId?: number | null;
  className?: string;
};

/** Lokalizacja magazynowa jako badge — klik otwiera podgląd (alert) lub przyszły deep link. */
export function CarrierLocationLink({ locationCode, locationId, className }: Props) {
  const code = (locationCode || "").trim();
  if (!code) {
    return <span className="text-[13px] text-slate-400">—</span>;
  }

  return (
    <button
      type="button"
      title={locationId ? `Lokalizacja #${locationId}` : code}
      onClick={() => {
        window.alert(`Lokalizacja: ${code}${locationId ? `\nID: ${locationId}` : ""}`);
      }}
      className={`inline-flex max-w-full text-left ${className ?? ""}`}
    >
      <LocationBadge code={code} type="PICK" className="!text-[13px] !font-bold" layoutSpread />
    </button>
  );
}
