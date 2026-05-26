import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

type Props = {
  title: string;
  subtitle?: string;
  memberCount: number;
  activeCount: number;
  defaultOpen?: boolean;
  headerActions?: ReactNode;
  children: ReactNode;
};

export function CarrierGroupCard({
  title,
  subtitle,
  memberCount,
  activeCount,
  defaultOpen = true,
  headerActions,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-stretch border-b border-slate-100 bg-slate-50/80">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-100/90"
        >
          <span className="mt-0.5 shrink-0 text-slate-500" aria-hidden>
            {open ? <ChevronDown size={20} strokeWidth={2.5} /> : <ChevronRight size={20} strokeWidth={2.5} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
              <h2 className="text-base font-black text-slate-900">{title}</h2>
              <span className="font-mono text-sm font-bold text-slate-500">({memberCount})</span>
            </div>
            {subtitle ? <p className="mt-0.5 text-xs text-slate-600">{subtitle}</p> : null}
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
              Aktywne: <span className="tabular-nums">{activeCount}</span>
            </p>
          </div>
        </button>
        {headerActions ? (
          <div className="flex shrink-0 items-center border-l border-slate-200 bg-white/60 px-2 py-2">{headerActions}</div>
        ) : null}
      </div>
      {open ? <div className="space-y-2 p-3 sm:p-4">{children}</div> : null}
    </section>
  );
}
