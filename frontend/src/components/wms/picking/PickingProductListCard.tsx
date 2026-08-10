import { Check, ImageIcon, X } from "lucide-react";
import { PickingFieldLabel, PickingLocationBadge, PickingQtyPair } from "./PickingUiPrimitives";
import { PICKING_CARD_CLASS } from "./pickingUiTokens";
import { wmsTypoClass } from "../../../wms/typography/wmsOperatorTypography";

export type PickingListCardStatus = "ACTIVE" | "PARTIAL" | "COMPLETED_PICK" | "SHORTAGE";

export type PickingProductListCardProps = {
  name: string;
  ean: string | null;
  catalogNumber?: string | null;
  imageUrl: string | null;
  pickedLabel: string;
  totalLabel: string;
  locationLabel: string;
  /** Missing qty for BRAK badge (e.g. 1) — with totalLabel forms BRAK X/Y */
  shortageLabel?: string | null;
  status?: PickingListCardStatus;
  disabled?: boolean;
  onClick: () => void;
  onUndoComplete?: () => void;
};

/**
 * Clean product card for the picking list (Sellasist layout, Sasist location badge).
 */
export function PickingProductListCard({
  name,
  ean,
  catalogNumber,
  imageUrl,
  pickedLabel,
  totalLabel,
  locationLabel,
  shortageLabel,
  status = "ACTIVE",
  disabled,
  onClick,
  onUndoComplete,
}: PickingProductListCardProps) {
  const catalog = (catalogNumber ?? "").trim();
  const hasEan = Boolean((ean ?? "").trim());
  const completed = status === "COMPLETED_PICK";
  const shortage = status === "SHORTAGE" || (shortageLabel != null && String(shortageLabel).length > 0);
  const muted = completed;

  return (
    <div
      className={[
        PICKING_CARD_CLASS,
        "relative flex w-full flex-col gap-3 p-4 transition",
        muted ? "opacity-45" : "hover:border-slate-300",
        disabled ? "pointer-events-none opacity-40" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {completed ? (
            <div className="flex items-center gap-1.5 text-emerald-700">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                <Check size={12} strokeWidth={3} />
              </span>
              <span className={["font-bold", wmsTypoClass.quantity].join(" ")}>
                Zebrano {pickedLabel}/{totalLabel}
              </span>
            </div>
          ) : (
            <>
              <PickingFieldLabel>Zebrano</PickingFieldLabel>
              <div className="mt-0.5">
                <PickingQtyPair picked={pickedLabel} total={totalLabel} />
              </div>
            </>
          )}
        </div>
        <div className="flex min-w-0 max-w-[55%] flex-col items-end gap-1">
          {locationLabel ? (
            <>
              <PickingFieldLabel>Lokalizacja</PickingFieldLabel>
              <div className="flex items-center gap-1">
                <PickingLocationBadge text={locationLabel} muted={muted} />
                {completed && onUndoComplete ? (
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500 text-white"
                    aria-label="Cofnij"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUndoComplete();
                    }}
                  >
                    <X size={12} strokeWidth={3} />
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
          {shortage && shortageLabel ? (
            <span className="inline-flex rounded-full bg-red-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
              Brak {shortageLabel}/{totalLabel}
            </span>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="flex w-full min-w-0 items-start gap-3 text-left outline-none"
      >
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden bg-transparent sm:h-20 sm:w-20">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
          ) : (
            <ImageIcon size={28} className="text-slate-200" strokeWidth={1.5} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={[
              "break-words font-bold uppercase leading-snug",
              muted ? "text-slate-500" : "text-slate-900",
              wmsTypoClass.base,
            ].join(" ")}
          >
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
      </button>
    </div>
  );
}
