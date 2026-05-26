import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  /** Compact = less vertical whitespace (dashboard empty). */
  density?: "default" | "compact";
};

/** Operational empty state — compact by default to match Wózki-style dashboards. */
export default function DocumentsEmptyState({ icon: Icon, title, description, action, density = "compact" }: Props) {
  const pad = density === "compact" ? "py-10 sm:py-12" : "py-16 sm:py-20";
  const iconBox = density === "compact" ? "h-12 w-12" : "h-14 w-14";
  const iconSz = density === "compact" ? "h-6 w-6" : "h-7 w-7";
  return (
    <div className={`mx-auto flex max-w-lg flex-col items-center px-4 text-center ${pad}`}>
      <span
        className={`flex ${iconBox} items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 shadow-inner`}
      >
        <Icon className={iconSz} strokeWidth={1.75} aria-hidden />
      </span>
      <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
      {action ? <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}
