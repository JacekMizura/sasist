import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type Props = {
  title: string;
  count: number;
  summaryText?: string;
  defaultOpen?: boolean;
  headerActions?: ReactNode;
  children: ReactNode;
};

/** Sekcja grupy wózków — pełna szerokość, bez zewnętrznej ramki (wzorzec Nośniki / Regały). */
export function CartsFleetGroupSection({
  title,
  count,
  summaryText,
  defaultOpen = true,
  headerActions,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="w-full space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-start gap-2 text-left transition hover:opacity-90"
          aria-expanded={open}
        >
          <ChevronDown
            className={`mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`}
            aria-hidden
          />
          <div className="min-w-0">
            <h2 className="text-base font-bold uppercase tracking-wide text-slate-900">{title}</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              <span className="tabular-nums font-medium text-slate-700">{count}</span>{" "}
              {count === 1 ? "wózek" : count >= 2 && count <= 4 ? "wózki" : "wózków"}
              {summaryText ? ` · ${summaryText}` : null}
            </p>
          </div>
        </button>
        {headerActions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{headerActions}</div> : null}
      </div>
      {open ? children : null}
    </section>
  );
}
