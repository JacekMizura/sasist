import type { CSSProperties } from "react";
import { Loader2 } from "lucide-react";
import { Icon } from "../../components/ui/Icon";
import type { OrderUiMainGroup } from "../../types/orderUiStatus";
import { sidebarSubStatusRgb } from "../../utils/panelSidebarHierarchy";

function statusAccentStyles(color: string, group: OrderUiMainGroup): CSSProperties {
  const [r, g, b] = sidebarSubStatusRgb(color, group);
  return {
    borderLeftColor: `rgb(${r}, ${g}, ${b})`,
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.05)`,
  };
}

export type WmsFlowStatusTileCartType = "BULK" | "BASKETS" | null | undefined;

type Props = {
  statusName: string;
  orderCount: number;
  color: string;
  mainGroup: OrderUiMainGroup;
  requireCart: boolean;
  cartType: WmsFlowStatusTileCartType;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Duży kafel jak wybór trybu pracy (pakowanie); domyślnie kompaktowy układ zbierania. */
  variant?: "default" | "work";
};

export function WmsFlowStatusTileButton({
  statusName,
  orderCount,
  color,
  mainGroup,
  requireCart,
  cartType,
  onClick,
  disabled,
  loading,
  variant = "default",
}: Props) {
  const accent = statusAccentStyles(color, mainGroup);
  const effectiveType =
    !requireCart ? null : cartType === "BASKETS" ? "BASKETS" : "BULK";
  const showBulk = effectiveType === "BULK";
  const showBaskets = effectiveType === "BASKETS";
  const modeHint = showBaskets ? " — koszyki" : showBulk ? " — wózek" : "";
  const ariaLabel = `${statusName}, ${orderCount} zamówień${modeHint}`;

  // ============================================================================
  // WARIANT OPERACYJNY ZBIERANIA ("work")
  // ============================================================================
  if (variant === "work") {
    const workIconSize = 24;
    return (
      <button
        type="button"
        disabled={disabled || loading}
        aria-label={ariaLabel}
        style={accent}
        onClick={onClick}
        className={[
          "group flex w-full items-center justify-between text-left outline-none",
          "h-[7.5rem] rounded-2xl border border-slate-200 border-l-[6px] px-6 sm:px-8 shadow-sm",
          "transition-[box-shadow,transform] duration-150",
          "hover:shadow-md hover:border-slate-300",
          "active:scale-[0.99]",
          "disabled:pointer-events-none disabled:opacity-50",
        ].join(" ")}
      >
        {/* Lewa strona: Ikona i Nazwa statusu obok siebie */}
        <div className="flex min-w-0 items-center gap-4">
          <div className="shrink-0 text-slate-700 transition-transform duration-300 group-hover:scale-110">
            {showBulk ? <Icon name="cart" size={workIconSize} /> : null}
            {showBaskets ? <Icon name="basket" size={workIconSize} /> : null}
            {!showBulk && !showBaskets ? (
              <Icon name="picking" size={workIconSize} aria-hidden />
            ) : null}
          </div>
          
          <span className="truncate text-xl font-bold tracking-tight text-slate-900">
            {statusName}
          </span>
        </div>

        {/* Prawa strona: Duża, czytelna cyfra */}
        <div className="shrink-0 pl-4">
          {loading ? (
            <Loader2 size={32} className="animate-spin text-slate-400" strokeWidth={2.5} />
          ) : (
            <span className="text-4xl sm:text-5xl font-bold tabular-nums text-slate-900 tracking-tight">
              {orderCount}
            </span>
          )}
        </div>
      </button>
    );
  }

  // ============================================================================
  // WARIANT KOMPAKTOWY ("default")
  // ============================================================================
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-label={ariaLabel}
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
      <span className="font-semibold tabular-nums text-slate-500">
        ({orderCount})
      </span>
    </button>
  );
}