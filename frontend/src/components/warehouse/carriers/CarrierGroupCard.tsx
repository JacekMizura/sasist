import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type Props = {
  title: string;
  subtitle?: string;
  memberCount: number;
  defaultOpen?: boolean;
  headerActions?: ReactNode;
  children: ReactNode;
};

/** Sekcja grupy nośników — bez zewnętrznej ramki (wzorzec list modułu). */
export function CarrierGroupCard({
  title,
  subtitle,
  memberCount,
  defaultOpen = true,
  headerActions,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="space-y-3">
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
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
            <p className="mt-1 text-sm font-medium text-slate-600">
              <span className="tabular-nums">{memberCount}</span>{" "}
              {memberCount === 1 ? "nośnik" : memberCount >= 2 && memberCount <= 4 ? "nośniki" : "nośników"}
            </p>
          </div>
        </button>
        {headerActions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{headerActions}</div> : null}
      </div>
      {open ? children : null}
    </section>
  );
}
