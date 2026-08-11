import { PickingEanBadge, PickingFieldLabel, PickingLocationBadge } from "./PickingUiPrimitives";
import { PICKING_CARD_CLASS, PICKING_PAGE_PAD_X } from "./pickingUiTokens";
import { wmsTypoClass } from "../../../wms/typography/wmsOperatorTypography";
import { PickingSimpleHeader } from "./PickingSimpleHeader";

export type PickingQtyPanelProps = {
  productName: string;
  ean: string | null;
  imageUrl: string | null;
  locationLabel: string;
  remainingLabel: string;
  qty: number;
  maxQty: number;
  busy?: boolean;
  onChangeQty: (next: number) => void;
  onConfirm: () => void;
  onBack: () => void;
};

/**
 * Full-screen quantity step — vertical hierarchy only:
 * location bar → image → name/EAN → ILOŚĆ → full-width stepper → Zatwierdź.
 */
export function PickingQtyPanel({
  productName,
  ean,
  imageUrl,
  locationLabel,
  remainingLabel,
  qty,
  maxQty,
  busy,
  onChangeQty,
  onConfirm,
  onBack,
}: PickingQtyPanelProps) {
  void remainingLabel;
  const atMin = qty <= 1e-9;
  const atMax = qty >= maxQty - 1e-9;
  const canConfirm = qty > 1e-9 && qty <= maxQty + 1e-9 && !busy;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white">
      <PickingSimpleHeader
        onBack={onBack}
        backAriaLabel="Wróć"
        trailingFill
        trailing={
          locationLabel ? (
            <PickingLocationBadge text={locationLabel} className="w-full" />
          ) : null
        }
      />
      <div className={["min-h-0 flex-1 overflow-y-auto py-5", PICKING_PAGE_PAD_X].join(" ")}>
        <div className={[PICKING_CARD_CLASS, "flex w-full flex-col gap-5 p-4 sm:p-5"].join(" ")}>
          <div className="flex w-full justify-center py-2">
            <div className="flex h-40 w-40 items-center justify-center overflow-hidden bg-transparent sm:h-48 sm:w-48">
              {imageUrl ? (
                <img src={imageUrl} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <div className="text-xs font-semibold text-slate-300">Brak zdjęcia</div>
              )}
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 text-center">
            <p
              className={[
                "break-words font-bold uppercase leading-snug text-slate-900",
                wmsTypoClass.base,
              ].join(" ")}
            >
              {productName}
            </p>
            <PickingEanBadge value={ean} className="justify-center" />
          </div>

          <div className="flex w-full flex-col gap-3 border-t border-slate-100 pt-5">
            <PickingFieldLabel>Ilość</PickingFieldLabel>

            <div className="flex w-full items-stretch overflow-hidden rounded-lg border border-slate-300 bg-white">
              <button
                type="button"
                aria-label="Zmniejsz"
                disabled={atMin || busy}
                className="flex h-12 w-14 shrink-0 items-center justify-center border-r border-slate-300 text-xl font-bold text-slate-900 disabled:opacity-40"
                onClick={() => onChangeQty(Math.max(0, Math.round((qty - 1) * 100) / 100))}
              >
                −
              </button>
              <div
                className={[
                  "flex min-h-12 min-w-0 flex-1 items-center justify-center font-bold text-slate-900",
                  wmsTypoClass.quantity,
                ].join(" ")}
              >
                {qty}
              </div>
              <button
                type="button"
                aria-label="Zwiększ"
                disabled={atMax || busy}
                className="flex h-12 w-14 shrink-0 items-center justify-center border-l border-slate-300 text-xl font-bold text-slate-900 disabled:opacity-40"
                onClick={() => onChangeQty(Math.min(maxQty, Math.round((qty + 1) * 100) / 100))}
              >
                +
              </button>
            </div>

            <button
              type="button"
              className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-[#e85d04] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#d45303] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!canConfirm}
              onClick={onConfirm}
            >
              {busy ? "…" : "Zatwierdź"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
