import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { AppOverlayPortal } from "../../overlay";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidthClassName?: string;
};

/** Centered modal shell for heavier header actions (link / copy). */
export function OrderHeaderModalFrame({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidthClassName = "max-w-lg",
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.setAttribute("data-modal-open", "true");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.removeAttribute("data-modal-open");
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <AppOverlayPortal>
      <div
        className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={`w-full ${maxWidthClassName} overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-700"
              aria-label="Zamknij"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
          <div className="max-h-[min(32rem,70vh)] overflow-y-auto px-4 py-4">{children}</div>
          {footer ? <div className="border-t border-slate-100 px-4 py-3">{footer}</div> : null}
        </div>
      </div>
    </AppOverlayPortal>
  );
}
