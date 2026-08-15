import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import {
  ListTile,
  StatusBadge,
  primaryButtonClassName,
  type StatusTone,
} from "@/design-system";
import { ProductThumb } from "./ProductThumb";
import { ProductionProgressCell } from "./ProductionProgressCell";
import { ProductionSourceTypeBadge } from "./ProductionSourceTypeBadge";
import type { ProductionOperationalState } from "../productionOperationalState";

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
  documentNumber?: string | null;
  sourceBadge?: string | null;
  /** Prefer typed source badge over free-text `sourceBadge` when set. */
  sourceKind?: "batch" | "order";
  sourceType?: string | null;
  secondaryMeta?: string | null;
  scheduleMeta?: string | null;
  selected?: boolean;
  showThumb?: boolean;
  compact?: boolean;
  /** Dashboard density: max 1 source badge + stage text (no delayed badge clutter). */
  hideDelayedBadge?: boolean;
  ctaHref?: string;
  ctaOpenInNewTab?: boolean;
  onCtaClick?: () => void;
  ctaDisabled?: boolean;
  ctaTitle?: string;
  overflow?: ReactNode;
};

/**
 * Operator task card — compact list layout.
 * SSOT for step/CTA: ``state`` from getProductionOperationalState.
 * ``isDelayed`` is a flag badge — never replaces the stage label.
 */
export function ProductionOperatorTaskCard({
  state,
  productLabel,
  productImageUrl,
  qtyLabel,
  productMeta,
  documentNumber,
  sourceBadge,
  sourceKind,
  sourceType,
  secondaryMeta,
  scheduleMeta,
  selected,
  showThumb = true,
  compact = true,
  hideDelayedBadge = false,
  ctaHref,
  ctaOpenInNewTab,
  onCtaClick,
  ctaDisabled,
  ctaTitle,
  overflow,
}: ProductionOperatorTaskCardProps) {
  const progress = state.progressMeaning;
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
    <ListTile density="compact" selected={selected} className="w-full !py-2">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 flex-1 gap-2">
          {showThumb ? (
            <ProductThumb imageUrl={productImageUrl} name={productLabel} size="sm" />
          ) : null}
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {numberLabel ? (
                <span className="font-mono text-xs font-semibold text-slate-700">{numberLabel}</span>
              ) : null}
              {sourceKind ? (
                <ProductionSourceTypeBadge kind={sourceKind} sourceType={sourceType} />
              ) : sourceBadge ? (
                <StatusBadge tone="neutral" density="compact">
                  {sourceBadge}
                </StatusBadge>
              ) : null}
              {!hideDelayedBadge && state.isDelayed ? (
                <StatusBadge tone="warning" density="compact">
                  Opóźnione
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
              {productMeta ? <p className="truncate text-[11px] text-slate-500">{productMeta}</p> : null}
            </div>

            {showProgress ? (
              <ProductionProgressCell
                className="max-w-sm"
                current={progress.current}
                total={progress.total}
                percent={progress.percent}
                displayLine={progress.displayLine}
              />
            ) : null}

            {scheduleMeta ? <p className="text-[11px] leading-tight text-slate-500">{scheduleMeta}</p> : null}
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
