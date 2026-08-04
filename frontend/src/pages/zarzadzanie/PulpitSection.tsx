import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, typography } from "@/design-system";

type Props = {
  id: string;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

/** Zwinięta sekcja Pulpitu — Card section jak WorkSection w Produkcji. */
export function PulpitSection({ id, title, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card id={id} variant="section" density="comfortable" className="overflow-hidden !p-0">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50/80"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={typography.h2}>{title}</span>
        {open ? (
          <ChevronUp size={16} className="shrink-0 text-slate-400" />
        ) : (
          <ChevronDown size={16} className="shrink-0 text-slate-400" />
        )}
      </button>
      {open ? <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3">{children}</div> : null}
    </Card>
  );
}
