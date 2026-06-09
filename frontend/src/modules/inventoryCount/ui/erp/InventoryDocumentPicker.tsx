import { ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { filterInputClass } from "@/components/filters";

const MENU_Z = 10050;

export type InventoryDocumentPickerOption = {
  value: number | "";
  label: string;
};

type Props = {
  options: InventoryDocumentPickerOption[];
  value: number | "";
  onChange: (value: number | "") => void;
  placeholder?: string;
  className?: string;
};

/** Anchored select — menu renders in a portal above sticky ERP chrome. */
export default function InventoryDocumentPicker({
  options,
  value,
  onChange,
  placeholder = "— wybierz dokument —",
  className = "max-w-md",
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const selected = options.find((o) => o.value === value);

  const updateMenuPos = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const menu =
    open && typeof document !== "undefined" ? (
      <div
        ref={menuRef}
        className="max-h-60 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl shadow-slate-200/60"
        style={
          menuPos
            ? {
                position: "fixed",
                top: menuPos.top,
                left: menuPos.left,
                width: menuPos.width,
                zIndex: MENU_Z,
              }
            : { position: "fixed", visibility: "hidden", zIndex: MENU_Z }
        }
        role="listbox"
      >
        {options.map((opt) => (
          <button
            key={opt.value === "" ? "empty" : opt.value}
            type="button"
            role="option"
            aria-selected={value === opt.value}
            onClick={() => {
              onChange(opt.value);
              setOpen(false);
            }}
            className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
              value === opt.value ? "bg-slate-50 font-semibold text-slate-900" : "text-slate-700"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <>
      <div ref={rootRef} className={className}>
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={`${filterInputClass} flex w-full items-center justify-between text-left`}
        >
          <span className={selected?.label ? "font-medium text-slate-900" : "text-slate-500"}>
            {selected?.label || placeholder}
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {menu ? createPortal(menu, document.body) : null}
    </>
  );
}
