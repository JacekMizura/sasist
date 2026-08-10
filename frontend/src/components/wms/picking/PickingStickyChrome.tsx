import { useEffect } from "react";
import { Eye, MapPinPlus, MoreVertical, NotebookPen, PackageX, ScanBarcode, X } from "lucide-react";
import { AppOverlayPortal } from "../../overlay";
import {
  PICKING_PAGE_PAD_X,
  PICKING_PRIMARY_BTN_CLASS,
  PICKING_STICKY_FOOTER_CLASS,
} from "./pickingUiTokens";

export type PickingOptionsHandlers = {
  onNotes?: () => void;
  onProductPreview?: () => void;
  onMarkShortage?: () => void;
  onRequestReplenishment?: () => void;
  onPick?: () => void;
  notesDisabled?: boolean;
  previewDisabled?: boolean;
  shortageDisabled?: boolean;
  replenishmentDisabled?: boolean;
  pickDisabled?: boolean;
};

type SheetProps = {
  open: boolean;
  onClose: () => void;
} & PickingOptionsHandlers;

const ROW =
  "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * Bottom sheet „Opcje” — visual shell only; callbacks keep existing picking logic.
 */
export function PickingOptionsSheet({
  open,
  onClose,
  onNotes,
  onProductPreview,
  onMarkShortage,
  onRequestReplenishment,
  onPick,
  notesDisabled,
  previewDisabled,
  shortageDisabled,
  replenishmentDisabled,
  pickDisabled,
}: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <AppOverlayPortal>
      <div className="fixed inset-0 z-[80] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Opcje">
        <button type="button" className="absolute inset-0 bg-slate-900/35" aria-label="Zamknij" onClick={onClose} />
        <div className="relative z-[1] max-h-[85vh] overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-base font-bold text-slate-900">Opcje</h2>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-700"
              aria-label="Zamknij opcje"
              onClick={onClose}
            >
              <X size={18} strokeWidth={2.2} />
            </button>
          </div>
          <ul className="list-none space-y-0.5 p-2">
            <li>
              <button
                type="button"
                className={ROW}
                disabled={notesDisabled || !onNotes}
                onClick={() => {
                  onClose();
                  onNotes?.();
                }}
              >
                <NotebookPen size={18} className="shrink-0 text-slate-400" strokeWidth={2} />
                Notatki
              </button>
            </li>
            <li>
              <button
                type="button"
                className={ROW}
                disabled={previewDisabled || !onProductPreview}
                onClick={() => {
                  onClose();
                  onProductPreview?.();
                }}
              >
                <Eye size={18} className="shrink-0 text-slate-400" strokeWidth={2} />
                Podgląd produktu
              </button>
            </li>
            <li>
              <button
                type="button"
                className={ROW}
                disabled={shortageDisabled || !onMarkShortage}
                onClick={() => {
                  onClose();
                  onMarkShortage?.();
                }}
              >
                <PackageX size={18} className="shrink-0 text-slate-400" strokeWidth={2} />
                Oznacz jako brak
              </button>
            </li>
            <li>
              <button
                type="button"
                className={ROW}
                disabled={replenishmentDisabled || !onRequestReplenishment}
                onClick={() => {
                  onClose();
                  onRequestReplenishment?.();
                }}
              >
                <MapPinPlus size={18} className="shrink-0 text-slate-400" strokeWidth={2} />
                Zleć uzupełnienie lokalizacji
              </button>
            </li>
            <li>
              <button
                type="button"
                className={ROW}
                disabled={pickDisabled || !onPick}
                onClick={() => {
                  onClose();
                  onPick?.();
                }}
              >
                <ScanBarcode size={18} className="shrink-0 text-slate-400" strokeWidth={2} />
                Zbierz
              </button>
            </li>
          </ul>
        </div>
      </div>
    </AppOverlayPortal>
  );
}

type StickyProps = {
  onOpenOptions: () => void;
  onZebrane: () => void;
  zebraneLabel?: string;
  zebraneDisabled?: boolean;
  zebraneBusy?: boolean;
  optionsDisabled?: boolean;
};

/**
 * Sticky bottom bar — full width:
 * [ ⋮ ] ………………… [ Zbierz ]
 * (opcje skrajnie lewo, akcja skrajnie prawo)
 */
export function PickingStickyFooter({
  onOpenOptions,
  onZebrane,
  zebraneLabel = "Zbierz",
  zebraneDisabled,
  zebraneBusy,
  optionsDisabled,
}: StickyProps) {
  return (
    <div className={PICKING_STICKY_FOOTER_CLASS}>
      <div className={["flex w-full items-center justify-between gap-4", PICKING_PAGE_PAD_X].join(" ")}>
        <button
          type="button"
          disabled={optionsDisabled}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          aria-label="Opcje"
          onClick={onOpenOptions}
        >
          <MoreVertical size={22} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          className={PICKING_PRIMARY_BTN_CLASS}
          disabled={zebraneDisabled || zebraneBusy}
          onClick={onZebrane}
        >
          {zebraneBusy ? "…" : zebraneLabel}
        </button>
      </div>
    </div>
  );
}
