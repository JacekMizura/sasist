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
  trend?: {
    label: string;
    sentiment?: PurchasingKpiTrendSentiment;
  };
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
    "relative flex min-h-[88px] flex-col rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition-all duration-200",
    to ? "cursor-pointer hover:border-slate-200 hover:shadow-md" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const trendSentiment = trend?.sentiment ?? "neutral";
  const TrendIcon = trend ? trendIcon(trend.label, trendSentiment) : null;

  const inner = (
    <>
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg [&_svg]:h-4 [&_svg]:w-4 [&_svg]:stroke-[2]"
          style={icon ? { backgroundColor: `${hex}26`, color: hex } : undefined}
          aria-hidden={!icon}
        >
          {icon ?? null}
        </div>
      </div>
      <div className="mt-auto">
        <div className="mb-0.5 flex flex-wrap items-end gap-2">
          <div className="text-2xl font-bold leading-none tracking-tight tabular-nums text-slate-800">{value}</div>
          {trend && TrendIcon ? (
            <div
              className={`mb-0.5 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${TREND_CLASS[trendSentiment]}`}
            >
              <TrendIcon className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              {trend.label}
            </div>
          ) : null}
        </div>
        {subtitle ? <div className="line-clamp-2 text-xs font-medium text-slate-400">{subtitle}</div> : null}
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
