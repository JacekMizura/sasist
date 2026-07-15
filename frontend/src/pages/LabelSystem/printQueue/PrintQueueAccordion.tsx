import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  id: string;
  title: string;
  icon: LucideIcon;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  /** Optional one-line summary when collapsed. */
  summary?: string;
};

/** Config accordion panel — white, bordered, rounded-xl, soft shadow. */
export default function PrintQueueAccordion({
  id,
  title,
  icon: Icon,
  open,
  onToggle,
  children,
  summary,
}: Props) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <button
        type="button"
        id={`${id}-trigger`}
        aria-controls={`${id}-panel`}
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-start gap-3 text-left"
      >
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-slate-600">
          <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-slate-900">{title}</span>
          {!open && summary ? (
            <span className="mt-0.5 block truncate text-xs text-slate-500">{summary}</span>
          ) : null}
        </span>
        <ChevronDown
          className={[
            "mt-1.5 h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200",
            open ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden
        />
      </button>
      {open ? (
        <div id={`${id}-panel`} role="region" aria-labelledby={`${id}-trigger`} className="mt-4 space-y-3">
          {children}
        </div>
      ) : null}
    </section>
  );
}
