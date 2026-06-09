import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type AppEmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  density?: "default" | "compact";
};

/** Unified operational empty state — dense by default. */
export function AppEmptyState({ icon: Icon, title, description, action, density = "compact" }: AppEmptyStateProps) {
  const pad = density === "compact" ? "py-8 sm:py-10" : "py-12 sm:py-16";
  const iconBox = density === "compact" ? "h-10 w-10" : "h-12 w-12";
  const iconSz = density === "compact" ? "h-5 w-5" : "h-6 w-6";

  return (
    <div className={`mx-auto flex max-w-md flex-col items-center px-4 text-center ${pad}`}>
      <span
        className={`flex ${iconBox} items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500`}
      >
        <Icon className={iconSz} strokeWidth={1.75} aria-hidden />
      </span>
      <h3 className="mt-3 text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{description}</p>
      {action ? <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}
