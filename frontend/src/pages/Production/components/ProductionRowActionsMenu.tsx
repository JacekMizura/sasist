import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { createPortal } from "react-dom";

import { listSellasistToolbarSquareBtn } from "@/components/listPage/listSellasistTokens";

const MENU_Z = 10050;
const MENU_MIN_WIDTH = 176;
const MENU_ITEM_HEIGHT = 36;

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const updateMenuPos = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(8, Math.min(rect.right - MENU_MIN_WIDTH, window.innerWidth - MENU_MIN_WIDTH - 8));
    const estimatedHeight = actions.length * MENU_ITEM_HEIGHT + 8;
    let top = rect.bottom + 4;
    if (top + estimatedHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - estimatedHeight - 4);
    }
    setMenuPos({ top, left });
  };

  useLayoutEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(updateMenuPos);
    window.addEventListener("scroll", updateMenuPos, true);
    window.addEventListener("resize", updateMenuPos);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("scroll", updateMenuPos, true);
      window.removeEventListener("resize", updateMenuPos);
    };
  }, [open, actions.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
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

  const menu =
    open && typeof document !== "undefined" ? (
      <div
        ref={menuRef}
        role="menu"
        className="overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl shadow-slate-200/60"
        style={
          menuPos
            ? { position: "fixed", top: menuPos.top, left: menuPos.left, minWidth: MENU_MIN_WIDTH, zIndex: MENU_Z }
            : { position: "fixed", visibility: "hidden", zIndex: MENU_Z }
        }
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
    ) : null;

  return (
    <>
      <div className="flex justify-center" ref={rootRef}>
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={ariaLabel}
          onClick={() => setOpen((v) => !v)}
          className={listSellasistToolbarSquareBtn}
        >
          <MoreHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      </div>
      {menu ? createPortal(menu, document.body) : null}
    </>
  );
}
