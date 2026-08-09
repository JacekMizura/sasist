import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type Props = {
  children: ReactNode;
  /** Domyślnie zwinięty — zgodnie z mockupem ustawień widoku. */
  defaultOpen?: boolean;
  className?: string;
};

/**
 * Zwijany blok „Podgląd układu” pod kontrolką ustawienia pakowania.
 * Domyślnie zamknięty; po rozwinięciu pokazuje wizualny mockup.
 */
export function PackingSettingsPreviewCollapse({ children, defaultOpen = false, className }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={["mt-1.5 max-w-3xl rounded-lg border border-slate-200 bg-white", className ?? ""].join(" ")}>
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="min-w-0 flex-1 text-xs font-semibold text-slate-600">Podgląd układu</span>
        <ChevronDown
          className={["h-4 w-4 shrink-0 text-slate-400 transition-transform", open ? "rotate-180" : ""].join(" ")}
          aria-hidden
        />
      </button>
      {open ? <div className="border-t border-slate-100 px-3 pb-3 pt-2">{children}</div> : null}
    </div>
  );
}
