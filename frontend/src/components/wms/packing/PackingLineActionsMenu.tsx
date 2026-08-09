import { MoreVertical } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type PackingLineActionsMenuProps = {
  disabled?: boolean;
  onMarkShortage: () => void;
};

/** Menu „3 kropki” na kafelku produktu w pakowaniu. */
export function PackingLineActionsMenu({ disabled, onMarkShortage }: PackingLineActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative z-20" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        disabled={disabled}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Akcje produktu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen((v) => !v);
        }}
      >
        <MoreVertical className="h-4 w-4" strokeWidth={2.2} aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-[12rem] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-900/5"
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2.5 text-left text-sm font-semibold text-slate-800 hover:bg-amber-50 hover:text-amber-950"
            onClick={() => {
              setOpen(false);
              onMarkShortage();
            }}
          >
            Oznacz jako brak
          </button>
        </div>
      ) : null}
    </div>
  );
}
