import { PickingEanBadge, PickingFieldLabel, PickingLocationBadge } from "./PickingUiPrimitives";
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
 * Full-screen quantity step — product identity + compact qty controls + Zatwierdź under controls.
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
      <PickingSimpleHeader onBack={onBack} backAriaLabel="Wróć" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
          {locationLabel ? (
            <div className="flex flex-col items-center gap-1.5 border-b border-slate-100 pb-4">
              <PickingFieldLabel>Lokalizacja</PickingFieldLabel>
              <div className="w-full max-w-sm">
                <PickingLocationBadge text={locationLabel} />
              </div>
            </div>
          ) : null}

          <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-start sm:text-left">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden bg-transparent">
              {imageUrl ? (
                <img src={imageUrl} alt="" className="max-h-full max-w-full object-contain" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={[
                  "break-words font-bold uppercase leading-snug text-slate-900",
                  wmsTypoClass.base,
                ].join(" ")}
              >
                {productName}
              </p>
              <div className="mt-2 flex justify-center sm:justify-start">
                <PickingEanBadge value={ean} />
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4">
            <p
              className={[
                "font-bold tabular-nums leading-none text-slate-900",
                "text-[2.5rem]",
              ].join(" ")}
              aria-label={`Do zebrania ${remainingLabel}`}
            >
              {remainingLabel}
            </p>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                aria-label="Zmniejsz"
                disabled={atMin || busy}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-xl font-bold text-slate-900 disabled:opacity-40"
                onClick={() => onChangeQty(Math.max(0, Math.round((qty - 1) * 100) / 100))}
              >
                −
              </button>
              <div className="flex h-11 min-w-[3.5rem] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-lg font-bold tabular-nums text-slate-900">
                {qty}
              </div>
              <button
                type="button"
                aria-label="Zwiększ"
                disabled={atMax || busy}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-xl font-bold text-slate-900 disabled:opacity-40"
                onClick={() => onChangeQty(Math.min(maxQty, Math.round((qty + 1) * 100) / 100))}
              >
                +
              </button>
            </div>

            <button
              type="button"
              className={PICKING_PRIMARY_BTN_CLASS}
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
