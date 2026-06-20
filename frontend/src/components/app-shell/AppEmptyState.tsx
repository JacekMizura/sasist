import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type AppEmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  density?: "default" | "compact" | "inline";
};

/** Unified operational empty state — dense by default. */
export function AppEmptyState({ icon: Icon, title, description, action, density = "compact" }: AppEmptyStateProps) {
  if (density === "inline") {
    return (
      <div className="flex items-start gap-3 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1 text-left">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{description}</p>
          {action ? <div className="mt-2 flex flex-wrap items-center gap-2">{action}</div> : null}
        </div>
      </div>
    );
  }

  const pad = density === "compact" ? "py-6 sm:py-8" : "py-12 sm:py-16";
  const iconBox = density === "compact" ? "h-9 w-9" : "h-12 w-12";
  const iconSz = density === "compact" ? "h-4 w-4" : "h-6 w-6";

  return (
    <div className={`mx-auto flex max-w-md flex-col items-center px-4 text-center ${pad}`}>
      <span
        className={`flex ${iconBox} items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500`}
      >
        <Icon className={iconSz} strokeWidth={1.75} aria-hidden />
      </span>
      <h3 className="mt-2.5 text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{description}</p>
      {action ? <div className="mt-3 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}
