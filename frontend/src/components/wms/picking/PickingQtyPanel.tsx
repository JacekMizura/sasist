import { PackingEanBadge } from "../packing/packingProductCardParts";
import { APP_OVERLAY_Z } from "../../overlay";
import { PICKING_CARD_CLASS, PICKING_PAGE_PAD_X } from "./pickingUiTokens";
import { wmsTypoClass } from "../../../wms/typography/wmsOperatorTypography";
import { PickingLocationBadge } from "./PickingUiPrimitives";

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

function IconBack() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

/**
 * Ekran końcowego podania ilości (produkt + lokalizacja już znane).
 * Układ 1:1: [←][belka lokalizacji] → karta (zdjęcie → nazwa → EAN) → −/n/+ → Zatwierdź.
 * Montaż: AppOverlayPortal → document.body (ErpShell overflow ucina fixed).
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
    <div
      className="fixed inset-0 flex flex-col overflow-x-hidden bg-white"
      style={{ zIndex: APP_OVERLAY_Z.drawer }}
      role="dialog"
      aria-modal="true"
      aria-label="Podaj ilość zbierania"
    >
      <header className="shrink-0 bg-white">
        <div className={["flex w-full items-center gap-2.5 py-2.5", PICKING_PAGE_PAD_X].join(" ")}>
          <button
            type="button"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-slate-800 hover:bg-slate-50 active:bg-slate-100"
            onClick={onBack}
            aria-label="Wróć do poprzedniego kroku zbierania"
          >
            <IconBack />
          </button>
          {sourceLocation ? <PickingLocationBadge text={sourceLocation} variant="bar" /> : <div className="min-w-0 flex-1" />}
        </div>
      </header>

      <div className={["min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-4 pt-1.5", PICKING_PAGE_PAD_X].join(" ")}>
        <div className={[PICKING_CARD_CLASS, "flex w-full flex-col px-4 pb-4 pt-3 sm:px-5"].join(" ")}>
          <div className="flex w-full justify-center pb-2">
            <div className="flex h-36 w-36 items-center justify-center overflow-hidden bg-transparent sm:h-40 sm:w-40">
              {imageUrl ? (
                <img src={imageUrl} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <div className="text-xs font-semibold text-slate-300">Brak zdjęcia</div>
              )}
            </div>
          </div>

          <div className="flex flex-col items-center gap-1.5 pb-3 text-center">
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

          <div className="flex w-full flex-col gap-2.5 border-t border-slate-200 pt-3">
            <div className="flex w-full items-stretch overflow-hidden rounded-lg border border-slate-300 bg-white">
              <button
                type="button"
                aria-label="Zmniejsz"
                disabled={atMin || busy}
                className="flex h-14 w-14 shrink-0 items-center justify-center border-r border-slate-300 text-2xl font-bold text-slate-900 disabled:opacity-40"
                onClick={() => onChangeQty(Math.max(0, Math.round((qty - 1) * 100) / 100))}
              >
                −
              </button>
              <div
                className={[
                  "flex min-h-14 min-w-0 flex-1 items-center justify-center font-bold tabular-nums text-slate-900",
                  wmsTypoClass.quantity,
                ].join(" ")}
              >
                {qty}
              </div>
              <button
                type="button"
                aria-label="Zwiększ"
                disabled={atMax || busy}
                className="flex h-14 w-14 shrink-0 items-center justify-center border-l border-slate-300 text-2xl font-bold text-slate-900 disabled:opacity-40"
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
