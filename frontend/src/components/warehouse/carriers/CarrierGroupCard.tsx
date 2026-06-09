import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { cartsGroupShellClass } from "../../../modules/carts/cartsModuleTokens";

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
    <section className={cartsGroupShellClass}>
      <div className="flex items-stretch border-b border-slate-200/90 bg-white">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2 text-left transition hover:bg-slate-50/80"
        >
          <ChevronRight
            className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
              <h2 className="text-[13px] font-semibold text-slate-900">{title}</h2>
              <span className="font-mono text-[12px] text-slate-500">({memberCount})</span>
            </div>
            {subtitle ? <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p> : null}
            <p className="mt-0.5 text-[11px] font-medium text-slate-600">
              Aktywne: <span className="tabular-nums">{activeCount}</span>
            </p>
          </div>
        </button>
        {headerActions ? (
          <div className="flex shrink-0 items-center border-l border-slate-200/90 px-2 py-1.5">{headerActions}</div>
        ) : null}
      </div>
      {open ? <div className="p-2 sm:p-3">{children}</div> : null}
    </section>
  );
}
