import { memo, type ReactNode } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

export type PurchasingKpiTone = "default" | "red" | "amber" | "blue" | "emerald" | "indigo" | "purple" | "yellow";

export type PurchasingKpiTrendSentiment = "good" | "bad" | "neutral";

const TONE_HEX: Record<PurchasingKpiTone, string> = {
  default: "#64748b",
  red: "#ef4444",
  amber: "#f59e0b",
  blue: "#3b82f6",
  emerald: "#10b981",
  indigo: "#6366f1",
  purple: "#a855f7",
  yellow: "#eab308",
};

const TREND_CLASS: Record<PurchasingKpiTrendSentiment, string> = {
  good: "text-emerald-700 bg-emerald-100/60",
  bad: "text-red-700 bg-red-100/60",
  neutral: "text-slate-600 bg-slate-100",
};

type Props = {
  title: string;
  value: ReactNode;
  subtitle?: string;
  icon?: ReactNode;
  tone?: PurchasingKpiTone;
  className?: string;
  /** Opcjonalny badge trendu — tylko gdy dane są dostępne w ekranie nadrzędnym. */
  trend?: {
    label: string;
    sentiment?: PurchasingKpiTrendSentiment;
  };
  /** Nawigacja — karta staje się klikalna (tylko UX, bez zmiany danych). */
  to?: string;
};

function trendIcon(label: string, sentiment: PurchasingKpiTrendSentiment) {
  if (sentiment !== "neutral") {
    return label.includes("-") ? TrendingDown : TrendingUp;
  }
  if (label.includes("+")) return TrendingUp;
  if (label.includes("-")) return TrendingDown;
  return Minus;
}

function PurchasingKpiCardInner({
  title,
  value,
  subtitle,
  icon,
  tone = "default",
  className = "",
  trend,
  to,
}: Props) {
  const hex = TONE_HEX[tone];
  const cardClass = [
    "relative flex min-h-[148px] flex-col rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition-all duration-300",
    to ? "cursor-pointer hover:border-slate-200 hover:shadow-md" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const trendSentiment = trend?.sentiment ?? "neutral";
  const TrendIcon = trend ? trendIcon(trend.label, trendSentiment) : null;

  const inner = (
    <>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-500">{title}</h3>
        {icon ? (
          <div
            className="shrink-0 rounded-xl p-2.5 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:stroke-[2]"
            style={{ backgroundColor: `${hex}26`, color: hex }}
          >
            {icon}
          </div>
        ) : null}
      </div>
      <div className="mt-auto">
        <div className="mb-2 flex flex-wrap items-end gap-3">
          <div className="text-4xl font-bold tracking-tight tabular-nums text-slate-800">{value}</div>
          {trend && TrendIcon ? (
            <div
              className={`mb-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold ${TREND_CLASS[trendSentiment]}`}
            >
              <TrendIcon className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
              {trend.label}
            </div>
          ) : null}
        </div>
        {subtitle ? <div className="text-xs font-medium text-slate-400">{subtitle}</div> : null}
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
