import { X } from "lucide-react";
import type { ReactNode } from "react";

import { AppOverlayPortal } from "../../../components/overlay";
import { PrimaryButton } from "../../../design-system/PrimaryButton";

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
};

/** Shared Sasist chrome for product gallery modals. */
export function ProductGalleryModalShell({ title, onClose, children, footer, wide }: Props) {
  return (
    <AppOverlayPortal>
      <div className="fixed inset-0 z-[280] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
        <div
          className={`relative w-full rounded-xl bg-white shadow-xl ${wide ? "max-w-2xl" : "max-w-lg"}`}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Zamknij"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
          <h3 className="border-b border-slate-100 py-4 pl-6 pr-12 text-lg font-bold text-slate-800">{title}</h3>
          <div className="p-6">{children}</div>
          {footer != null ? (
            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">{footer}</div>
          ) : null}
        </div>
      </div>
    </AppOverlayPortal>
  );
}

export function GalleryModalSaveButton({
  onClick,
  disabled,
  label = "Zapisz",
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <PrimaryButton type="button" density="compact" disabled={disabled} onClick={onClick}>
      {label}
    </PrimaryButton>
  );
}
