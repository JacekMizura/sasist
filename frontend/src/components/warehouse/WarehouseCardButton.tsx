import type { ButtonHTMLAttributes, ReactNode } from "react";

export type WarehouseCardButtonTone = "neutral" | "emerald" | "rose";

export type WarehouseCardButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  /** Selected / pressed segment (Magazyn·Sklep, Drzwi·Brama). */
  active?: boolean;
  /** Subtle text/icon accent without changing card chrome. */
  tone?: WarehouseCardButtonTone;
  /** Stretch to fill flex/grid cell. */
  fullWidth?: boolean;
};

/** Shared chrome for designer secondary actions — card-like, not pills. */
export const warehouseCardButtonBaseClass = [
  "inline-flex items-center justify-center gap-1.5",
  "rounded-[11px] border border-slate-200/90 bg-white",
  "px-3 py-2.5 text-[11px] font-medium leading-none",
  "shadow-sm shadow-slate-900/[0.04]",
  "transition-all duration-150",
  "hover:bg-slate-50/90 hover:shadow-md",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/40",
  "disabled:pointer-events-none disabled:opacity-50",
].join(" ");

const toneTextClass: Record<WarehouseCardButtonTone, string> = {
  neutral: "text-slate-800",
  emerald: "text-emerald-800",
  rose: "text-rose-700",
};

/**
 * Card-style secondary button used across Magazyn / Projektowanie rails
 * (Generuj układ, Nowy szablon, Magazyn/Sklep, Drzwi/Brama, Raporty/Szkody).
 */
export function WarehouseCardButton({
  children,
  className = "",
  active = false,
  tone = "neutral",
  fullWidth = false,
  type = "button",
  ...props
}: WarehouseCardButtonProps) {
  const stateClass = active
    ? "border-transparent shadow-md ring-2 ring-orange-400/50"
    : "";
  return (
    <button
      type={type}
      className={[
        warehouseCardButtonBaseClass,
        toneTextClass[tone],
        fullWidth ? "w-full" : "",
        stateClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-pressed={active || undefined}
      {...props}
    >
      {children}
    </button>
  );
}

export function warehouseCardButtonClassName(options?: {
  active?: boolean;
  tone?: WarehouseCardButtonTone;
  fullWidth?: boolean;
  className?: string;
}): string {
  const active = options?.active ?? false;
  const tone = options?.tone ?? "neutral";
  return [
    warehouseCardButtonBaseClass,
    toneTextClass[tone],
    options?.fullWidth ? "w-full" : "",
    active ? "border-transparent shadow-md ring-2 ring-orange-400/50" : "",
    options?.className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}
