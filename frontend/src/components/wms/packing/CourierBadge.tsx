import { ShippingMethodLogo } from "../../shipping/ShippingMethodLogo";

export type CourierBadgeVariant = "sidebar" | "tile";

export type CourierBadgeProps = {
  /** Prefer ``shipping_method_name``, fallback ``shipping_method``. */
  courierName: string | null | undefined;
  /** Liczba listów przewozowych (API: ``labels_count`` / ``waybill_count``). */
  labelCount: number;
  logoUrl?: string | null;
  /** Heurystyka logo (np. DPD/TEMU) gdy brak ``logoUrl``. */
  methodNameForLogo?: string | null;
  variant: CourierBadgeVariant;
  className?: string;
  /** Pokazuj „Nx List przewozowy” także przy 1 (sidebar mockup). */
  showWaybillLine?: boolean;
};

/**
 * Wspólny blok kuriera — panel boczny pakowania lub kafel po domknięciu zamówienia.
 */
export function CourierBadge({
  courierName,
  labelCount,
  logoUrl,
  methodNameForLogo,
  variant,
  className,
  showWaybillLine = false,
}: CourierBadgeProps) {
  const name = (courierName ?? "").trim() || null;
  const n = Math.max(0, Math.floor(Number.isFinite(labelCount) ? labelCount : 0));
  const forLogo = (methodNameForLogo ?? name ?? "").trim() || null;
  if (!name && !logoUrl && n <= 0) return null;

  const size = variant === "sidebar" ? "packingSidebar" : "packingTile";

  const showLabels = showWaybillLine ? n >= 1 : n > 1;
  const labelsText = showWaybillLine
    ? `${Math.max(1, n)}x List przewozowy`
    : `Listów przewozowych: ${n}`;
  const inner = (
    <>
      <div className={variant === "sidebar" ? "flex flex-col items-start gap-2" : "flex flex-col items-start gap-1"}>
        <ShippingMethodLogo logoUrl={logoUrl} methodName={forLogo} size={size} />
        <div className="min-w-0 flex-1">
          {showLabels ? (
            <p
              className={
                variant === "sidebar" ? "text-xs font-semibold text-slate-700" : "text-[11px] font-medium text-slate-500"
              }
            >
              {labelsText}
            </p>
          ) : name && variant !== "sidebar" ? (
            <p className="text-sm font-semibold leading-tight text-slate-900">{name}</p>
          ) : null}
        </div>
      </div>
    </>
  );

  if (variant === "sidebar") {
    return (
      <div className={["w-full min-w-0", className].filter(Boolean).join(" ")} aria-label="Przesyłka">
        {inner}
      </div>
    );
  }

  return (
    <div
      className={["flex max-w-[100px] shrink-0 flex-col items-start gap-1 sm:max-w-[120px]", className]
        .filter(Boolean)
        .join(" ")}
      aria-label="Przesyłka"
    >
      {inner}
    </div>
  );
}
