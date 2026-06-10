import { useState } from "react";
import { LocationBadge } from "../LocationBadge";
import { LocationPreviewModal } from "../locations/LocationPreviewModal";

type Props = {
  tenantId: number;
  locationCode: string | null | undefined;
  locationId?: number | null;
  carrierId?: number | null;
  className?: string;
};

/** Badge lokalizacji — otwiera wizualny podgląd magazynu. */
export function CarrierLocationLink({ tenantId, locationCode, locationId, carrierId, className }: Props) {
  const [open, setOpen] = useState(false);
  const code = (locationCode || "").trim();
  const locId = locationId != null ? Number(locationId) : 0;

  if (!code) {
    return <span className="text-[13px] text-slate-400">—</span>;
  }

  return (
    <>
      <button
        type="button"
        title={`Podgląd lokalizacji ${code}`}
        onClick={(e) => {
          e.stopPropagation();
          if (locId > 0) setOpen(true);
        }}
        disabled={locId < 1}
        className={`inline-flex max-w-full text-left transition hover:opacity-90 disabled:cursor-default disabled:opacity-70 ${className ?? ""}`}
      >
        <LocationBadge
          code={code}
          type="PICK"
          className="!px-3 !py-1.5 !text-[14px] !font-bold !leading-none"
          layoutSpread
        />
      </button>
      {locId > 0 ? (
        <LocationPreviewModal
          open={open}
          onClose={() => setOpen(false)}
          tenantId={tenantId}
          locationId={locId}
          locationCode={code}
          carrierId={carrierId}
        />
      ) : null}
    </>
  );
}
