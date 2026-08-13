import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import {
  ListTile,
  ProgressBar,
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
  /** Secondary meta line under product, e.g. „6 zamówień · 18 szt.” */
  productMeta?: string | null;
  /** Tiny secondary identifiers — number, source — never compete with the step title. */
  secondaryMeta?: string | null;
  /** Termin / priorytet as muted text. */
  scheduleMeta?: string | null;
  selected?: boolean;
  showThumb?: boolean;
  /** Primary CTA — either link or button handler. */
  ctaHref?: string;
  ctaOpenInNewTab?: boolean;
  onCtaClick?: () => void;
  ctaDisabled?: boolean;
  ctaTitle?: string;
  overflow?: ReactNode;
};

/**
 * Operator task card: step title first, technical ids last.
 * Answers „Co mam zrobić teraz?” in 2–3 seconds.
 */
export function ProductionOperatorTaskCard({
  state,
  productLabel,
  productImageUrl,
  qtyLabel,
  productMeta,
  secondaryMeta,
  scheduleMeta,
  selected,
  showThumb = true,
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

  const cta = ctaHref ? (
    <Link
      to={ctaHref}
      target={ctaOpenInNewTab ? "_blank" : undefined}
      rel={ctaOpenInNewTab ? "noopener noreferrer" : undefined}
      className={primaryButtonClassName(
        ctaDisabled ? "pointer-events-none opacity-50" : "",
        "comfortable",
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
      className={primaryButtonClassName("", "comfortable")}
      disabled={ctaDisabled}
      title={ctaTitle}
      onClick={onCtaClick}
    >
      {state.primaryAction.label}
    </button>
  );

  return (
    <ListTile density="comfortable" selected={selected} className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-4">
        <div className="flex min-w-0 flex-1 gap-3">
          {showThumb ? (
            <ProductThumb imageUrl={productImageUrl} name={productLabel} size="md" />
          ) : null}
          <div className="min-w-0 flex-1 space-y-2">
            {/* 1. Current step — dominant */}
            <p className={`text-lg font-bold leading-snug tracking-tight sm:text-xl ${STEP_TITLE_TONE[state.tone]}`}>
              {state.businessLabel}
            </p>

            {/* 2. Product + qty */}
            <div>
              <p className="line-clamp-2 text-sm font-semibold text-slate-900">{productLabel}</p>
              <p className="mt-0.5 text-sm tabular-nums text-slate-700">
                <span className="font-semibold">{qtyLabel}</span>
              </p>
              {productMeta ? <p className="mt-0.5 text-xs text-slate-500">{productMeta}</p> : null}
            </div>

            {/* 3. What next */}
            <p className="text-sm text-slate-600">{state.description}</p>

            {/* 4. Stage progress */}
            {showProgress ? (
              <div className="max-w-md space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span>{progress.displayLine}</span>
                  <span className={`tabular-nums font-semibold ${toneTextClass[barTone]}`}>
                    {progress.percent}%
                  </span>
                </div>
                <ProgressBar value={progress.percent} tone={barTone} />
                {progress.nextStepHint ? (
                  <p className="text-xs font-medium text-orange-800">{progress.nextStepHint}</p>
                ) : null}
              </div>
            ) : null}

            {/* 5. Schedule / priority + secondary ids */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
              {scheduleMeta ? <span>{scheduleMeta}</span> : null}
              {secondaryMeta ? <span className="font-mono text-slate-400">{secondaryMeta}</span> : null}
            </div>
          </div>
        </div>

        {/* 6. Single primary CTA */}
        <div
          className="flex shrink-0 flex-col items-stretch justify-center gap-2 sm:items-end"
          onClick={(e) => e.stopPropagation()}
        >
          {cta}
          {overflow}
        </div>
      </div>
    </ListTile>
  );
}
