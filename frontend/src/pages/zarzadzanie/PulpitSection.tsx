import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

type Props = {
  id: string;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

/** Zwinięta sekcja Pulpitu kierownika — nie osobny ekran. */
export function PulpitSection({ id, title, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      id={id}
      className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
    >
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50/80"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-sm font-black text-slate-900">{title}</span>
        {open ? <ChevronUp size={16} className="shrink-0" /> : <ChevronDown size={16} className="shrink-0" />}
      </button>
      {open ? <div className="border-t border-slate-100 px-3 pb-4 pt-3">{children}</div> : null}
    </section>
  );
}
