import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { listSellasistToolbarSquareBtn } from "../listPage/listSellasistTokens";

type OrderPanelActionsDropdownProps = {
  disabled?: boolean;
  onCreateComplaint: () => void;
  onCreateReturn: () => void;
};

/**
 * Sellasist-style compact toolbar control: chevron opens panel actions (reklamacja / zwrot).
 */
export default function OrderPanelActionsDropdown({
  disabled,
  onCreateComplaint,
  onCreateReturn,
}: OrderPanelActionsDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Akcje zwrotów i reklamacji"
        onClick={() => setOpen((v) => !v)}
        className={`${listSellasistToolbarSquareBtn} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={2.25}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-[80] mt-1 min-w-[14rem] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-200/60"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
            onClick={() => {
              onCreateComplaint();
              setOpen(false);
            }}
          >
            Utwórz reklamację
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
            onClick={() => {
              onCreateReturn();
              setOpen(false);
            }}
          >
            Utwórz zwrot
          </button>
        </div>
      ) : null}
    </div>
  );
}
