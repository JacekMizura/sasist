import { ImageIcon } from "lucide-react";
import { PickingFieldLabel, PickingLocationBadge, PickingQtyPair } from "./PickingUiPrimitives";
import { PICKING_CARD_CLASS } from "./pickingUiTokens";
import { wmsTypoClass } from "../../../wms/typography/wmsOperatorTypography";

export type PickingProductListCardProps = {
  name: string;
  ean: string | null;
  catalogNumber?: string | null;
  imageUrl: string | null;
  pickedLabel: string;
  totalLabel: string;
  locationLabel: string;
  disabled?: boolean;
  onClick: () => void;
};

/**
 * Clean product row for the picking list (Sellasist layout, Sasist location badge).
 */
export function PickingProductListCard({
  name,
  ean,
  catalogNumber,
  imageUrl,
  pickedLabel,
  totalLabel,
  locationLabel,
  disabled,
  onClick,
}: PickingProductListCardProps) {
  const catalog = (catalogNumber ?? "").trim();
  const hasEan = Boolean((ean ?? "").trim());

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        PICKING_CARD_CLASS,
        "flex w-full flex-col gap-3 p-4 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-45 sm:flex-row sm:items-stretch sm:gap-4",
      ].join(" ")}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden bg-transparent sm:h-20 sm:w-20">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
          ) : (
            <ImageIcon size={28} className="text-slate-200" strokeWidth={1.5} />
          )}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className={["break-words font-bold uppercase leading-snug text-slate-900", wmsTypoClass.base].join(" ")}>
            {name}
          </p>
          {hasEan ? (
            <p className="mt-1 break-words text-sm text-slate-600">
              EAN: <span className="font-mono font-semibold text-slate-800">{(ean ?? "").trim()}</span>
            </p>
          ) : null}
          {catalog ? (
            <p className="mt-0.5 break-words text-sm text-slate-600">
              Numer katalogowy: <span className="font-semibold text-slate-800">{catalog}</span>
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-row items-start justify-between gap-4 sm:w-[13rem] sm:flex-col sm:items-end sm:justify-start">
        <div className="min-w-0">
          <PickingFieldLabel>Zebrano</PickingFieldLabel>
          <div className="mt-0.5">
            <PickingQtyPair picked={pickedLabel} total={totalLabel} />
          </div>
        </div>
        {locationLabel ? (
          <div className="min-w-0 max-w-[11rem] text-right sm:w-full">
            <PickingFieldLabel>Lokalizacja</PickingFieldLabel>
            <div className="mt-1 flex justify-end">
              <PickingLocationBadge text={locationLabel} />
            </div>
          </div>
        ) : null}
      </div>
    </button>
  );
}
