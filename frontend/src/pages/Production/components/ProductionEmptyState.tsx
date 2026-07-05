import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";

type Props = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  variant?: "section" | "hero";
};

export function ProductionEmptyState({ icon: Icon, title, description, action, variant = "section" }: Props) {
  const pad = variant === "hero" ? "py-10 sm:py-12" : "py-6 sm:py-8";
  return (
    <div className={`relative overflow-hidden rounded-xl border border-dashed border-slate-200 bg-slate-50/50 ${pad}`}>
      <div className="relative mx-auto flex max-w-md flex-col items-center px-4 text-center">
        <span className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm">
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          {variant === "hero" ? (
            <Sparkles className="absolute -right-1 -top-1 h-3 w-3 text-amber-500" aria-hidden />
          ) : null}
        </span>
        <h3 className="mt-3 text-sm font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{description}</p>
        {action ? <div className="mt-3 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
      </div>
    </div>
  );
}
