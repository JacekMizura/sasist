import { useEffect, useId, useRef, useState, type SyntheticEvent } from "react";
import { MoreVertical } from "lucide-react";

export type WmsCardKebabMenuItem = {
  id: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
};

type Props = {
  items: WmsCardKebabMenuItem[];
  disabled?: boolean;
  /** Passed to the trigger for tests / a11y. */
  ariaLabel?: string;
  buttonClassName?: string;
};

function stopCardActivation(e: SyntheticEvent) {
  e.preventDefault();
  e.stopPropagation();
}

/**
 * Kebab menu for WMS product line cards. Must live inside `[data-wms-product-card-menu]`
 * (see `WmsProductCard`) so card navigation ignores menu interactions.
 */
export function WmsCardKebabMenu({
  items,
  disabled = false,
  ariaLabel = "Menu pozycji",
  buttonClassName = "flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800",
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

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
    <div ref={rootRef} className="relative" data-wms-product-card-menu="">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        className={buttonClassName}
        onClick={(e) => {
          stopCardActivation(e);
          if (disabled) return;
          setOpen((v) => !v);
        }}
        onMouseDown={stopCardActivation}
      >
        <MoreVertical size={18} aria-hidden />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-[200] mt-1 min-w-[220px] max-w-[min(100vw-1rem,280px)] rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl"
          onClick={stopCardActivation}
          onMouseDown={stopCardActivation}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={`flex w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                item.danger
                  ? "text-rose-700 hover:bg-rose-50"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
              onClick={(e) => {
                stopCardActivation(e);
                setOpen(false);
                if (item.disabled) return;
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
