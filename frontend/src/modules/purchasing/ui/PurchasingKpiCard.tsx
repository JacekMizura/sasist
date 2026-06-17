import { memo, type ReactNode } from "react";
import { Link } from "react-router-dom";

export type PurchasingKpiTone = "default" | "red" | "amber" | "blue" | "emerald" | "indigo" | "purple" | "yellow";

const ACCENT: Record<PurchasingKpiTone, string> = {
  default: "border-l-transparent",
  red: "border-l-red-500",
  amber: "border-l-amber-400",
  blue: "border-l-blue-500",
  emerald: "border-l-emerald-500",
  indigo: "border-l-indigo-500",
  purple: "border-l-purple-500",
  yellow: "border-l-yellow-400",
};

const VALUE_COLOR: Partial<Record<PurchasingKpiTone, string>> = {
  red: "text-red-600",
  amber: "text-amber-700",
  blue: "text-blue-600",
  emerald: "text-emerald-600",
  indigo: "text-indigo-600",
  purple: "text-purple-700",
  yellow: "text-yellow-700",
};

const ICON_BG: Partial<Record<PurchasingKpiTone, string>> = {
  red: "bg-red-50",
  amber: "bg-amber-50",
  blue: "bg-blue-50",
  emerald: "bg-emerald-50",
  indigo: "bg-indigo-50",
  purple: "bg-purple-50",
  yellow: "bg-yellow-50",
};

type Props = {
  title: string;
  value: ReactNode;
  subtitle?: string;
  icon?: ReactNode;
  tone?: PurchasingKpiTone;
  className?: string;
  /** Nawigacja — karta staje się klikalna (tylko UX, bez zmiany danych). */
  to?: string;
};

function PurchasingKpiCardInner({ title, value, subtitle, icon, tone = "default", className = "", to }: Props) {
  const cardClass = `relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow border-l-4 ${ACCENT[tone]} ${
    to ? "hover:shadow-md hover:border-slate-300" : ""
  } ${className}`.trim();

  const inner = (
    <>
      <div className="mb-4 flex items-start justify-between">
        <h3 className="w-3/4 text-[11px] font-bold uppercase tracking-widest text-slate-500">{title}</h3>
        {icon ? <div className={`rounded-lg p-2 ${ICON_BG[tone] ?? "bg-slate-50"}`}>{icon}</div> : null}
      </div>
      <div>
        <div className={`mb-1 text-3xl font-extrabold tracking-tight tabular-nums ${VALUE_COLOR[tone] ?? "text-slate-800"}`}>
          {value}
        </div>
        {subtitle ? <div className="text-xs text-slate-400">{subtitle}</div> : <div className="text-xs text-transparent select-none">{"\u00A0"}</div>}
      </div>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={`block no-underline ${cardClass}`} aria-label={title}>
        {inner}
      </Link>
    );
  }

  return <div className={cardClass}>{inner}</div>;
}

export const PurchasingKpiCard = memo(PurchasingKpiCardInner);
