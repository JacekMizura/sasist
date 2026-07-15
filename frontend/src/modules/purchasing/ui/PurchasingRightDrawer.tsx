import { memo, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type PurchasingRightDrawerProps = {
  open: boolean;
  onClose: () => void;
  /** Accessible name when no visible title is provided in `header`. */
  ariaLabel: string;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

function PurchasingRightDrawerInner({
  open,
  onClose,
  ariaLabel,
  header,
  footer,
  children,
}: PurchasingRightDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[69] bg-black/30"
        role="presentation"
        aria-hidden
        onClick={onClose}
      />
      <aside
        className="fixed inset-0 z-[70] flex flex-col bg-white lg:inset-y-0 lg:left-auto lg:right-0 lg:h-screen lg:w-[420px] lg:shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
      >
        {header ? <div className="shrink-0">{header}</div> : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer ? <div className="shrink-0 border-t border-slate-200 bg-white">{footer}</div> : null}
      </aside>
    </>,
    document.body,
  );
}

export const PurchasingRightDrawer = memo(PurchasingRightDrawerInner);
