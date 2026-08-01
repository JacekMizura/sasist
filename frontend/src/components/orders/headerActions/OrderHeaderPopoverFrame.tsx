import { useEffect, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { odHeaderActionPopoverClass, odHeaderActionPopoverWideClass } from "./orderHeaderActionTokens";

type Props = {
  open: boolean;
  onClose: () => void;
  rootRef: RefObject<HTMLDivElement | null>;
  /** Accessible name (and optional chrome title when ``chrome``). */
  title: string;
  children: ReactNode;
  wide?: boolean;
  /**
   * ``menu`` — flat Sellasist context menu (no title bar).
   * ``panel`` — light header with close (e.g. messages).
   */
  variant?: "menu" | "panel";
  footer?: ReactNode;
};

/** Click-outside + Escape popover anchored under a toolbar button. */
export function OrderHeaderPopoverFrame({
  open,
  onClose,
  rootRef,
  title,
  children,
  wide,
  variant = "menu",
  footer,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, rootRef]);

  if (!open) return null;

  const showChrome = variant === "panel";

  return (
    <div
      role="menu"
      aria-label={title}
      className={wide ? odHeaderActionPopoverWideClass : odHeaderActionPopoverClass}
    >
      {showChrome ? (
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-700"
            aria-label="Zamknij"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      ) : null}
      <div className={showChrome ? "max-h-[min(28rem,70vh)] overflow-y-auto py-1" : "max-h-[min(28rem,70vh)] overflow-y-auto py-1"}>
        {children}
      </div>
      {footer ? <div className="border-t border-slate-100">{footer}</div> : null}
    </div>
  );
}
