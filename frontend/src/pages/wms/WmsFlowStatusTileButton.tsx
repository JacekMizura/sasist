import type { CSSProperties } from "react";
import { Loader2 } from "lucide-react";
import { Icon } from "../../components/ui/Icon";
import type { OrderUiMainGroup } from "../../types/orderUiStatus";
import { sidebarSubStatusRgb } from "../../utils/panelSidebarHierarchy";
import { wmsTypoClass } from "../../wms/typography/wmsOperatorTypography";

function statusAccentStyles(color: string, group: OrderUiMainGroup): CSSProperties {
  const [r, g, b] = sidebarSubStatusRgb(color, group);
  return {
    borderLeftColor: `rgb(${r}, ${g}, ${b})`,
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.05)`,
  };
}

export type WmsFlowStatusTileCartType = "BULK" | "BASKETS" | null | undefined;

function ActiveCartBadge({ label }: { label: string }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-800 shadow-sm"
      title={`Wózek sesji zbierania: ${label}`}
    >
      <Icon name="cart" size={12} className="shrink-0 text-slate-600" aria-hidden />
      <span className="truncate">
        Wózek: <span className="font-bold tabular-nums tracking-tight">{label}</span>
      </span>
    </span>
  );
}

type Props = {
  statusName: string;
  orderCount: number;
  inProgressByOthers?: number;
  inProgressByMe?: number;
  color: string;
  mainGroup: OrderUiMainGroup;
  requireCart: boolean;
  cartType: WmsFlowStatusTileCartType;
  /** Label wózka z aktywnej sesji — nigdy bez sesji. */
  activeCartLabel?: string | null;
  /** SSOT: aktywna sesja na tej karcie — wymusza brak CTA niezależnie od innych props. */
  hasActiveSession?: boolean;
  sessionProductsPicked?: number;
  sessionProductsTotal?: number;
  /** CTA tylko gdy brak aktywnej sesji/wózka. */
  showScanCartCta?: boolean;
  onScanCartClick?: () => void;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "default" | "work";
  showRealizationCounts?: boolean;
};

export function WmsFlowStatusTileButton({
  statusName,
  orderCount,
  inProgressByOthers = 0,
  inProgressByMe = 0,
  color,
  mainGroup,
  requireCart,
  cartType,
  activeCartLabel = null,
  hasActiveSession = false,
  sessionProductsPicked = 0,
  sessionProductsTotal = 0,
  showScanCartCta = false,
  onScanCartClick,
  onClick,
  disabled,
  loading,
  variant = "default",
  showRealizationCounts = false,
}: Props) {
  const accent = statusAccentStyles(color, mainGroup);
  const effectiveType =
    !requireCart ? null : cartType === "BASKETS" ? "BASKETS" : "BULK";
  const showBulk = effectiveType === "BULK";
  const showBaskets = effectiveType === "BASKETS";
  const cartBadge =
    requireCart && activeCartLabel && activeCartLabel.trim()
      ? activeCartLabel.trim()
      : null;
  // Absolutny zakaz CTA przy aktywnej sesji / badge / „Realizowane przez Ciebie”.
  const allowScanCta =
    showScanCartCta &&
    !hasActiveSession &&
    !cartBadge &&
    inProgressByMe <= 0 &&
    Boolean(onScanCartClick);
  const modeHint = showBaskets ? " — koszyki" : showBulk ? " — wózek" : "";
  const cartHint = cartBadge ? `, wózek ${cartBadge}` : "";
  const countTooltip = showRealizationCounts
    ? "Zamówień = dostępne do rozpoczęcia. Realizowane = przypisane do aktywnej sesji. Produkty = stan tej sesji."
    : "Liczba zamówień wstępnie oczekujących w tym statusie.";
  const ariaLabel = showRealizationCounts
    ? `${statusName}, zamówień ${orderCount}, realizowane przez innych ${inProgressByOthers}, realizowane przez Ciebie ${inProgressByMe}, produkty ${sessionProductsPicked}/${sessionProductsTotal}${modeHint}${cartHint}.`
    : `${statusName}, ${orderCount} zamówień oczekujących${modeHint}${cartHint}.`;

  if (variant === "work") {
    const workIconSize = 24;
    return (
      <button
        type="button"
        disabled={disabled || loading}
        aria-label={ariaLabel}
        title={countTooltip}
        style={accent}
        onClick={onClick}
        className={[
          "group flex w-full flex-col justify-center text-left outline-none",
          "min-h-[9.5rem] gap-3 py-4",
          "rounded-2xl border border-slate-200 border-l-[6px] px-6 sm:px-8 shadow-sm",
          "transition-[box-shadow,transform] duration-150",
          "hover:shadow-md hover:border-slate-300",
          "active:scale-[0.99]",
          "disabled:pointer-events-none disabled:opacity-50",
        ].join(" ")}
      >
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="shrink-0 text-slate-700 transition-transform duration-300 group-hover:scale-110">
              {showBulk ? <Icon name="cart" size={workIconSize} /> : null}
              {showBaskets ? <Icon name="basket" size={workIconSize} /> : null}
              {!showBulk && !showBaskets ? (
                <Icon name="picking" size={workIconSize} aria-hidden />
              ) : null}
            </div>
            <span className={["min-w-0 break-words font-bold tracking-tight text-slate-900", wmsTypoClass.base].join(" ")}>
              {statusName}
            </span>
          </div>
          <div className="shrink-0 pl-2 text-right" title={countTooltip}>
            {loading ? (
              <Loader2 size={32} className="ml-auto animate-spin text-slate-400" strokeWidth={2.5} />
            ) : (
              <>
                {showRealizationCounts ? (
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Zamówień
                  </p>
                ) : null}
                <span className={["font-bold text-slate-900 tracking-tight leading-none", wmsTypoClass.quantity].join(" ")}>
                  {orderCount}
                </span>
              </>
            )}
          </div>
        </div>

        {showRealizationCounts && !loading ? (
          <div className="space-y-1.5 text-sm text-slate-600">
            <p>
              Realizowane przez innych:{" "}
              <span className="font-semibold tabular-nums text-slate-800">{inProgressByOthers}</span>
            </p>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <p className="min-w-0">
                Realizowane przez Ciebie:{" "}
                <span className="font-semibold tabular-nums text-slate-800">{inProgressByMe}</span>
              </p>
              {cartBadge ? <ActiveCartBadge label={cartBadge} /> : null}
            </div>
            <p className="text-sm text-slate-600">
              Produkty do zebrania:{" "}
              <span className={["font-semibold text-slate-900", wmsTypoClass.quantity].join(" ")}>
                {Math.max(0, sessionProductsPicked)}/{Math.max(0, sessionProductsTotal)} szt.
              </span>
            </p>
            {allowScanCta ? (
              <span
                role="button"
                tabIndex={0}
                className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-sm hover:border-slate-400"
                onClick={(e) => {
                  e.stopPropagation();
                  onScanCartClick?.();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onScanCartClick?.();
                  }
                }}
              >
                <Icon name="cart" size={14} className="shrink-0 text-slate-600" aria-hidden />
                Zeskanuj wózek
              </span>
            ) : null}
          </div>
        ) : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-label={ariaLabel}
      title={countTooltip}
      style={accent}
      onClick={onClick}
      className={[
        "flex min-h-[3.5rem] w-full items-center gap-2.5 rounded-xl border border-slate-200/95 border-l-[3px] px-3 py-2.5 text-left shadow-sm",
        "transition-[background-color,box-shadow,border-color,transform] duration-150",
        "hover:border-slate-300 hover:shadow-md",
        "active:scale-[0.98]",
        "disabled:pointer-events-none disabled:opacity-50",
      ].join(" ")}
    >
      {showBulk ? <Icon name="cart" size={20} className="shrink-0 text-slate-600" /> : null}
      {showBaskets ? <Icon name="basket" size={20} className="shrink-0 text-slate-600" /> : null}
      {!showBulk && !showBaskets ? <Icon name="picking" size={20} aria-hidden /> : null}
      <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-snug text-slate-800">
        {statusName}
      </span>
      <span className="font-semibold tabular-nums text-slate-500" title={countTooltip}>
        ({orderCount})
      </span>
    </button>
  );
}
