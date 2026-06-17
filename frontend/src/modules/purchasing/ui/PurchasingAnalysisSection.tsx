import { memo, type ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Sekcja analizy (wykresy, heatmapy, karty podsumowujące) — spójna ramka modułu. */
function PurchasingAnalysisSectionInner({ title, subtitle, action, children, className = "" }: Props) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${className}`.trim()}
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-slate-600">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export const PurchasingAnalysisSection = memo(PurchasingAnalysisSectionInner);
