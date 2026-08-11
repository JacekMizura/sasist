import { PackingEanBadge } from "../packing/packingProductCardParts";
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
 * Ekran końcowego podania ilości (produkt + lokalizacja już znane).
 * Układ 1:1 ze screenem: [←][belka lokalizacji] → zdjęcie → nazwa → EAN → −/n/+ → Zatwierdź.
 * Lokalizacja tylko w belce nagłówka — nie w kafelku produktu.
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
  const sourceLocation = locationLabel.trim();
  const eanText = (ean ?? "").trim();

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white">
      <PickingSimpleHeader
        onBack={onBack}
        backAriaLabel="Wróć do poprzedniego kroku zbierania"
        trailingFill
        trailing={
          sourceLocation ? (
            <span
              className={[
                "inline-flex h-10 w-full min-w-0 flex-1 items-center justify-center rounded-full border border-slate-800 bg-white px-3 text-center font-bold text-slate-900",
                wmsTypoClass.location,
              ].join(" ")}
              title={sourceLocation}
            >
              {sourceLocation}
            </span>
          ) : null
        }
      />

      <div className={["min-h-0 flex-1 overflow-y-auto py-5", PICKING_PAGE_PAD_X].join(" ")}>
        <div className={[PICKING_CARD_CLASS, "flex w-full flex-col p-5 sm:p-6"].join(" ")}>
          <div className="flex w-full justify-center pb-5 pt-3">
            <div className="flex h-44 w-44 items-center justify-center overflow-hidden bg-transparent sm:h-52 sm:w-52">
              {imageUrl ? (
                <img src={imageUrl} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <div className="text-xs font-semibold text-slate-300">Brak zdjęcia</div>
              )}
            </div>
          </div>

          <div className="flex flex-col items-center gap-2.5 text-center">
            <p
              className={[
                "break-words font-bold uppercase leading-snug tracking-wide text-slate-900",
                wmsTypoClass.base,
              ].join(" ")}
            >
              {productName}
            </p>
            {eanText ? <PackingEanBadge value={eanText} /> : null}
          </div>

          <div className="mt-5 flex w-full flex-col gap-3 border-t border-slate-200 pt-5">
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
