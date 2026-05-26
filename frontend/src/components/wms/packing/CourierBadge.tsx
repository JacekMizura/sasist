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
}: CourierBadgeProps) {
  const name = (courierName ?? "").trim() || null;
  const n = Math.max(0, Math.floor(Number.isFinite(labelCount) ? labelCount : 0));
  const forLogo = (methodNameForLogo ?? name ?? "").trim() || null;
  if (!name && !logoUrl && n <= 0) return null;

  const size = variant === "sidebar" ? "packingSidebar" : "packingTile";

  const showLabels = n > 1;
  const inner = (
    <>
      <div className={variant === "sidebar" ? "flex items-start gap-3" : "flex flex-col items-start gap-1"}>
        <ShippingMethodLogo logoUrl={logoUrl} methodName={forLogo} size={size} />
        <div className="min-w-0 flex-1">
          {name ? (
            <p
              className={
                variant === "sidebar"
                  ? "text-base font-semibold leading-snug text-slate-900"
                  : "text-sm font-semibold leading-tight text-slate-900"
              }
            >
              {name}
            </p>
          ) : null}
          {showLabels ? (
            <p
              className={
                variant === "sidebar" ? "mt-0.5 text-xs font-medium text-slate-500" : "text-[11px] font-medium text-slate-500"
              }
            >
              Listów przewozowych: {n}
            </p>
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
