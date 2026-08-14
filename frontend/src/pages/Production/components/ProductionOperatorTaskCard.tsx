import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import {
  ListTile,
  ProgressBar,
  StatusBadge,
  primaryButtonClassName,
  toneTextClass,
  type StatusTone,
} from "@/design-system";
import { ProductThumb } from "./ProductThumb";
import type { ProductionOperationalState } from "../productionOperationalState";
import { productionProgressTone } from "../productionUi";

const STEP_TITLE_TONE: Record<StatusTone, string> = {
  danger: "text-rose-800",
  warning: "text-amber-900",
  info: "text-sky-900",
  primary: "text-orange-900",
  success: "text-emerald-900",
  neutral: "text-slate-900",
};

export type ProductionOperatorTaskCardProps = {
  state: ProductionOperationalState;
  productLabel: string;
  productImageUrl?: string | null;
  qtyLabel: string;
  productMeta?: string | null;
  /** Document number e.g. BAT/0012 or MO-… */
  documentNumber?: string | null;
  /** Source badge: PARTIA / ORDERS / PLANNING / MANUAL */
  sourceBadge?: string | null;
  /** Tiny secondary identifiers — kept for backward compat. */
  secondaryMeta?: string | null;
  scheduleMeta?: string | null;
  selected?: boolean;
  showThumb?: boolean;
  compact?: boolean;
  ctaHref?: string;
  ctaOpenInNewTab?: boolean;
  onCtaClick?: () => void;
  ctaDisabled?: boolean;
  ctaTitle?: string;
  overflow?: ReactNode;
};

/**
 * Operator task card — compact by default for Zlecenia / Pulpit lists.
 * SSOT for step/CTA remains ``state`` from getProductionOperationalState.
 */
export function ProductionOperatorTaskCard({
  state,
  productLabel,
  productImageUrl,
  qtyLabel,
  productMeta,
  documentNumber,
  sourceBadge,
  secondaryMeta,
  scheduleMeta,
  selected,
  showThumb = true,
  compact = true,
  ctaHref,
  ctaOpenInNewTab,
  onCtaClick,
  ctaDisabled,
  ctaTitle,
  overflow,
}: ProductionOperatorTaskCardProps) {
  const progress = state.progressMeaning;
  const barTone = productionProgressTone(progress.percent);
  const showProgress =
    state.currentStep === "COLLECTING" ||
    state.currentStep === "PRODUCING" ||
    state.currentStep === "WAITING_PUTAWAY" ||
    (progress.total > 0 && progress.current > 0);

  const ctaDensity = compact ? "compact" : "comfortable";
  const cta = ctaHref ? (
    <Link
      to={ctaHref}
      target={ctaOpenInNewTab ? "_blank" : undefined}
      rel={ctaOpenInNewTab ? "noopener,noreferrer" : undefined}
      className={primaryButtonClassName(
        ctaDisabled ? "pointer-events-none opacity-50" : "",
        ctaDensity,
      )}
      aria-disabled={ctaDisabled}
      title={ctaTitle}
      onClick={(e) => {
        if (ctaDisabled) e.preventDefault();
      }}
    >
      {state.primaryAction.label}
    </Link>
  ) : (
    <button
      type="button"
      className={primaryButtonClassName("", ctaDensity)}
      disabled={ctaDisabled}
      title={ctaTitle}
      onClick={onCtaClick}
    >
      {state.primaryAction.label}
    </button>
  );

  const numberLabel = documentNumber ?? (secondaryMeta ? secondaryMeta.split(" · ")[0] : null);

  return (
    <ListTile density={compact ? "compact" : "comfortable"} selected={selected} className="w-full">
      <div className={`flex flex-col gap-2 sm:flex-row sm:items-center ${compact ? "sm:gap-3" : "sm:gap-4"}`}>
        <div className="flex min-w-0 flex-1 gap-2.5">
          {showThumb ? (
            <ProductThumb imageUrl={productImageUrl} name={productLabel} size={compact ? "sm" : "md"} />
          ) : null}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {numberLabel ? (
                <span className="font-mono text-xs font-semibold text-slate-700">{numberLabel}</span>
              ) : null}
              {sourceBadge ? (
                <StatusBadge tone="neutral" density="compact">
                  {sourceBadge}
                </StatusBadge>
              ) : null}
              <span className={`text-sm font-bold leading-tight ${STEP_TITLE_TONE[state.tone]}`}>
                {state.businessLabel}
              </span>
            </div>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {productLabel}
                <span className="ml-2 font-normal tabular-nums text-slate-600">{qtyLabel}</span>
              </p>
              {productMeta ? <p className="truncate text-xs text-slate-500">{productMeta}</p> : null}
            </div>

            {showProgress ? (
              <div className="max-w-sm space-y-0.5">
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span className="truncate">{progress.displayLine}</span>
                  <span className={`tabular-nums font-semibold ${toneTextClass[barTone]}`}>
                    {progress.percent}%
                  </span>
                </div>
                <ProgressBar value={progress.percent} tone={barTone} />
              </div>
            ) : null}

            {scheduleMeta ? <p className="text-[11px] text-slate-500">{scheduleMeta}</p> : null}
          </div>
        </div>

        <div
          className="flex shrink-0 flex-row items-center justify-end gap-2 sm:flex-col sm:items-end"
          onClick={(e) => e.stopPropagation()}
        >
          {cta}
          {overflow}
        </div>
      </div>
    </ListTile>
  );
}
