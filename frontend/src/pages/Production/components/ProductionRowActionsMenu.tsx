import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

import { listSellasistToolbarSquareBtn } from "@/components/listPage/listSellasistTokens";

export type ProductionRowAction = {
  id: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
};

type Props = {
  ariaLabel: string;
  actions: ProductionRowAction[];
};

export function ProductionRowActionsMenu({ ariaLabel, actions }: Props) {
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

  if (actions.length === 0) return null;

  return (
    <div className="relative flex justify-center" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className={listSellasistToolbarSquareBtn}
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-[80] mt-1 min-w-[11rem] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-200/60"
        >
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              className={`flex w-full px-3 py-2 text-left text-sm font-medium disabled:opacity-50 ${
                action.danger ? "text-red-700 hover:bg-red-50" : "text-slate-800 hover:bg-slate-50"
              }`}
              onClick={() => {
                action.onClick();
                setOpen(false);
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
