import { Check, ImageIcon, X } from "lucide-react";
import {
  PickingEanBadge,
  PickingFieldLabel,
  PickingLocationBadge,
  PickingQtyPair,
  PickingShortageBadge,
} from "./PickingUiPrimitives";
import { PICKING_CARD_CLASS } from "./pickingUiTokens";
import { wmsTypoClass } from "../../../wms/typography/wmsOperatorTypography";

export type PickingListCardStatus = "ACTIVE" | "PARTIAL" | "COMPLETED_PICK" | "SHORTAGE";

export type PickingProductListCardVisibility = {
  showProductImage?: boolean;
  showEAN?: boolean;
  showSKU?: boolean;
  showCatalogNumber?: boolean;
  showLocation?: boolean;
  showWarehouseStock?: boolean;
};

export type PickingProductListCardProps = {
  name: string;
  ean: string | null;
  sku?: string | null;
  catalogNumber?: string | null;
  imageUrl: string | null;
  pickedLabel: string;
  totalLabel: string;
  locationLabel: string;
  /** Łączny stan w magazynie — widoczny gdy visibility.showWarehouseStock */
  warehouseStockLabel?: string | null;
  shortageLabel?: string | null;
  status?: PickingListCardStatus;
  disabled?: boolean;
  visibility?: PickingProductListCardVisibility;
  onClick: () => void;
  onUndoComplete?: () => void;
};

/**
 * LISTA „Do zebrania” tile — location stays INSIDE the card (top-right).
 * Never use location bar / page header for location here.
 * Visibility flags come from WMS picking terminal `list_display` (tenant+warehouse).
 */
export function PickingProductListCard({
  name,
  ean,
  sku,
  catalogNumber,
  imageUrl,
  pickedLabel,
  totalLabel,
  locationLabel,
  warehouseStockLabel,
  shortageLabel,
  status = "ACTIVE",
  disabled,
  visibility,
  onClick,
  onUndoComplete,
}: PickingProductListCardProps) {
  const completed = status === "COMPLETED_PICK";
  const shortage = status === "SHORTAGE" || (shortageLabel != null && String(shortageLabel).length > 0);
  const muted = completed;

  const showImage = visibility?.showProductImage !== false;
  const showEan = visibility?.showEAN !== false;
  const showSku = visibility?.showSKU === true;
  const showCatalog = visibility?.showCatalogNumber === true;
  const showLocation = visibility?.showLocation !== false;
  const showWarehouseStock = visibility?.showWarehouseStock === true;

  const skuText = (sku ?? "").trim();
  const catalogText = (catalogNumber ?? "").trim();
  const locText = showLocation ? (locationLabel ?? "").trim() : "";
  const warehouseText = showWarehouseStock ? (warehouseStockLabel ?? "").trim() : "";

  return (
    <div
      className={[
        PICKING_CARD_CLASS,
        "relative flex w-full flex-col gap-3 p-4 transition",
        muted ? "opacity-55" : "hover:border-slate-300",
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
              <PickingFieldLabel>Zebrane</PickingFieldLabel>
              <div className="mt-0.5">
                <PickingQtyPair picked={pickedLabel} total={totalLabel} />
              </div>
            </>
          )}
        </div>
        <div className="flex w-fit max-w-[55%] shrink-0 flex-col items-end gap-1">
          {locText ? (
            <div className="flex flex-col items-end gap-0.5">
              <PickingFieldLabel>Lokalizacja</PickingFieldLabel>
              <div className="flex items-center gap-1">
                <PickingLocationBadge text={locText} muted={muted} variant="compact" />
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
            </div>
          ) : completed && onUndoComplete ? (
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
          {shortage && shortageLabel ? (
            <PickingShortageBadge missing={shortageLabel} total={totalLabel} />
          ) : null}
        </div>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="flex w-full min-w-0 items-start gap-3 text-left outline-none"
      >
        {showImage ? (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden bg-transparent sm:h-20 sm:w-20">
            {imageUrl ? (
              <img src={imageUrl} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
            ) : (
              <ImageIcon size={28} className="text-slate-200" strokeWidth={1.5} />
            )}
          </div>
        ) : null}
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
          {showSku && skuText ? (
            <p className={["mt-1 text-slate-500", wmsTypoClass.base].join(" ")}>
              SKU: <span className={muted ? "text-slate-400" : "text-slate-700"}>{skuText}</span>
            </p>
          ) : null}
          {showCatalog && catalogText ? (
            <p className={["mt-0.5 text-slate-500", wmsTypoClass.base].join(" ")}>
              Nr kat.:{" "}
              <span className={muted ? "text-slate-400" : "text-slate-700"}>{catalogText}</span>
            </p>
          ) : null}
          {warehouseText ? (
            <p className={["mt-1 text-slate-500", wmsTypoClass.base].join(" ")}>
              Stan magazynowy:{" "}
              <span className={muted ? "text-slate-400" : "text-slate-700"}>{warehouseText}</span>
            </p>
          ) : null}
          {showEan ? (
            <div className="mt-1.5">
              <PickingEanBadge value={ean} muted={muted} />
            </div>
          ) : null}
        </div>
      </button>
    </div>
  );
}
