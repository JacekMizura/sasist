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
  const pad = variant === "hero" ? "py-16 sm:py-20" : "py-10 sm:py-12";
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-dashed border-violet-200/80 bg-gradient-to-b from-white to-violet-50/30 ${pad}`}>
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-violet-200/30 blur-2xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-indigo-200/25 blur-2xl" aria-hidden />
      <div className="relative mx-auto flex max-w-md flex-col items-center px-6 text-center">
        <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-300/40">
          <Icon className="h-8 w-8" strokeWidth={1.75} aria-hidden />
          <Sparkles className="absolute -right-1 -top-1 h-4 w-4 text-amber-300" aria-hidden />
        </span>
        <h3 className="mt-5 text-base font-bold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
        {action ? <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{action}</div> : null}
      </div>
    </div>
  );
}
