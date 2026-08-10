import { PickingFieldLabel, PickingLocationBadge } from "./PickingUiPrimitives";
import { PICKING_PRIMARY_BTN_CLASS } from "./pickingUiTokens";
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
 * Full-screen quantity step (Sellasist layout, white / Sasist orange CTA).
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
  const atMin = qty <= 1e-9;
  const atMax = qty >= maxQty - 1e-9;
  const canConfirm = qty > 1e-9 && qty <= maxQty + 1e-9 && !busy;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white">
      <PickingSimpleHeader onBack={onBack} backAriaLabel="Wróć" title="Podaj ilość" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
          <div className="flex items-start gap-3">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden bg-transparent">
              {imageUrl ? (
                <img src={imageUrl} alt="" className="max-h-full max-w-full object-contain" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className={["break-words font-bold text-slate-900", wmsTypoClass.base].join(" ")}>
                {productName}
              </p>
              {ean ? (
                <p className="mt-1 break-words text-sm text-slate-600">
                  EAN: <span className="font-mono font-semibold">{ean}</span>
                </p>
              ) : null}
            </div>
          </div>

          {locationLabel ? (
            <div>
              <PickingFieldLabel>Lokalizacja</PickingFieldLabel>
              <div className="mt-1 max-w-[14rem]">
                <PickingLocationBadge text={locationLabel} />
              </div>
            </div>
          ) : null}

          <div>
            <PickingFieldLabel>Do zebrania</PickingFieldLabel>
            <p className={["mt-0.5 font-bold text-slate-900", wmsTypoClass.quantity].join(" ")}>
              {remainingLabel}
            </p>
          </div>

          <div className="flex items-stretch gap-3">
            <button
              type="button"
              aria-label="Zmniejsz"
              disabled={atMin || busy}
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border-2 border-slate-300 bg-white text-3xl font-bold text-slate-900 disabled:opacity-40"
              onClick={() => onChangeQty(Math.max(0, Math.round((qty - 1) * 100) / 100))}
            >
              −
            </button>
            <div
              className={[
                "flex min-h-[4rem] min-w-0 flex-1 items-center justify-center rounded-lg border-2 border-slate-300 bg-white font-black text-slate-900",
                wmsTypoClass.quantity,
              ].join(" ")}
            >
              {qty}
            </div>
            <button
              type="button"
              aria-label="Zwiększ"
              disabled={atMax || busy}
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border-2 border-slate-300 bg-white text-3xl font-bold text-slate-900 disabled:opacity-40"
              onClick={() => onChangeQty(Math.min(maxQty, Math.round((qty + 1) * 100) / 100))}
            >
              +
            </button>
          </div>
        </div>
      </div>
      <div className="border-t border-slate-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          className={`${PICKING_PRIMARY_BTN_CLASS} w-full`}
          disabled={!canConfirm}
          onClick={onConfirm}
        >
          {busy ? "…" : "Zatwierdź"}
        </button>
      </div>
    </div>
  );
}
