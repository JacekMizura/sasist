import { Link } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { PrimaryButton, primaryButtonClassName } from "@/design-system";
import { listSellasistToolbarSquareBtn } from "@/components/listPage/listSellasistTokens";
import type { ProductionNextAction, ProductionSecondaryAction } from "../productionNextAction";

type Props = {
  primary: ProductionNextAction;
  secondary: ProductionSecondaryAction[];
  busy?: boolean;
  onPrimaryClick?: () => void;
  onSecondary: (id: ProductionSecondaryAction["id"]) => void;
  className?: string;
};

const MENU_Z = 10050;
const MENU_MIN_WIDTH = 200;

/**
 * One primary CTA + overflow menu for secondary actions (print, cancel, paper…).
 */
export function ProductionPrimaryActionBar({
  primary,
  secondary,
  busy,
  onPrimaryClick,
  onSecondary,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const updateMenuPos = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(
      8,
      Math.min(rect.right - MENU_MIN_WIDTH, window.innerWidth - MENU_MIN_WIDTH - 8),
    );
    const estimatedHeight = secondary.length * 36 + 8;
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
  }, [open, secondary.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
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

  const primaryDisabled = Boolean(busy || primary.disabled);

  const primaryControl =
    primary.href && !onPrimaryClick ? (
      <Link
        to={primary.href}
        target={primary.openInNewTab ? "_blank" : undefined}
        rel={primary.openInNewTab ? "noopener noreferrer" : undefined}
        className={primaryButtonClassName(primaryDisabled ? "pointer-events-none opacity-50" : "")}
        aria-disabled={primaryDisabled}
        title={primary.disabled ? primary.disabledReason : undefined}
        onClick={(e) => {
          if (primaryDisabled) e.preventDefault();
        }}
      >
        {primary.label}
      </Link>
    ) : (
      <PrimaryButton
        type="button"
        disabled={primaryDisabled}
        title={primary.disabled ? primary.disabledReason : undefined}
        onClick={onPrimaryClick}
      >
        {primary.label}
      </PrimaryButton>
    );

  const menu =
    open && typeof document !== "undefined" ? (
      <div
        ref={menuRef}
        role="menu"
        className="overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl shadow-slate-200/60"
        style={
          menuPos
            ? {
                position: "fixed",
                top: menuPos.top,
                left: menuPos.left,
                minWidth: MENU_MIN_WIDTH,
                zIndex: MENU_Z,
              }
            : { position: "fixed", visibility: "hidden", zIndex: MENU_Z }
        }
      >
        {secondary.map((action) => (
          <button
            key={action.id}
            type="button"
            role="menuitem"
            disabled={busy || action.disabled}
            className={`flex w-full px-3 py-2 text-left text-sm font-medium disabled:opacity-50 ${
              action.danger ? "text-red-700 hover:bg-red-50" : "text-slate-800 hover:bg-slate-50"
            }`}
            onClick={() => {
              onSecondary(action.id);
              setOpen(false);
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {primary.kind !== "none" ? primaryControl : null}
      {secondary.length > 0 ? (
        <>
          <button
            ref={triggerRef}
            type="button"
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label="Więcej akcji"
            onClick={() => setOpen((v) => !v)}
            className={listSellasistToolbarSquareBtn}
          >
            <MoreHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
          {menu ? createPortal(menu, document.body) : null}
        </>
      ) : null}
    </div>
  );
}
