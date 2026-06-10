import { LocationBadge } from "../LocationBadge";

type Props = {
  locationCode: string | null | undefined;
  locationId?: number | null;
  className?: string;
};

/** Badge lokalizacji — większy, klikalny podgląd. */
export function CarrierLocationLink({ locationCode, locationId, className }: Props) {
  const code = (locationCode || "").trim();
  if (!code) {
    return <span className="text-[13px] text-slate-400">—</span>;
  }

  return (
    <button
      type="button"
      title={locationId ? `Lokalizacja ${code}` : code}
      onClick={(e) => {
        e.stopPropagation();
        window.alert(`Lokalizacja: ${code}${locationId ? `\nRef: #${locationId}` : ""}`);
      }}
      className={`inline-flex max-w-full text-left transition hover:opacity-90 ${className ?? ""}`}
    >
      <LocationBadge
        code={code}
        type="PICK"
        className="!px-3 !py-1.5 !text-[14px] !font-bold !leading-none"
        layoutSpread
      />
    </button>
  );
}
