import { Package, Truck } from "lucide-react";
import { shippingMethodLogoForDisplay } from "../../utils/shippingMethodLogoUrl";

export type ShippingMethodLogoSize =
  | "lg"
  | "md"
  | "sm"
  | "xs"
  | "listRow"
  | "orderList"
  /** WMS pakowanie — lewy panel (~64–80px) */
  | "packingSidebar"
  /** WMS pakowanie — kafel po pakowaniu (~56–72px) */
  | "packingTile"
  /** Ekran potwierdzenia po pakowaniu — duży logo operatora */
  | "postPackHero";

const IMG: Record<ShippingMethodLogoSize, string> = {
  lg: "max-h-[48px] w-auto max-w-[200px] object-contain object-left",
  md: "max-h-10 w-auto max-w-[180px] object-contain object-left",
  sm: "max-h-6 w-auto max-w-[140px] object-contain object-left",
  xs: "max-h-5 w-auto max-w-[120px] object-contain object-left",
  /** Settings list row: max 40px height, centered in 64×64 cell */
  listRow: "max-h-10 w-auto max-w-[64px] object-contain object-center",
  /** Orders list: ~56px logo cell, fast scan */
  orderList: "max-h-14 w-auto max-w-[120px] object-contain object-center",
  packingSidebar: "h-auto w-full max-h-[80px] max-w-[80px] min-w-[64px] object-contain object-left",
  packingTile: "h-auto w-full max-h-[64px] max-w-[72px] min-w-[56px] object-contain object-left",
  postPackHero:
    "h-auto max-h-[112px] w-auto max-w-[min(240px,28vw)] min-w-[72px] object-contain object-right",
};

const ICON: Record<ShippingMethodLogoSize, string> = {
  lg: "h-10 w-10",
  md: "h-9 w-9",
  sm: "h-6 w-6",
  xs: "h-4 w-4",
  listRow: "h-10 w-10",
  orderList: "h-10 w-10",
  packingSidebar: "h-20 w-20",
  packingTile: "h-[4.5rem] w-[4.5rem]",
  postPackHero: "h-24 w-24",
};

export type ShippingMethodLogoProps = {
  logoUrl?: string | null;
  methodName?: string | null;
  size?: ShippingMethodLogoSize;
  className?: string;
  /** When no carrier image/heuristic: truck (default) or generic package. */
  placeholder?: "truck" | "package";
};

/** Carrier logo or placeholder icon — no box, aspect ratio preserved, max height by size. */
export function ShippingMethodLogo({
  logoUrl,
  methodName,
  size = "md",
  className,
  placeholder = "truck",
}: ShippingMethodLogoProps) {
  const src = shippingMethodLogoForDisplay(logoUrl, methodName);
  const wrap = ["inline-flex shrink-0 items-center justify-center self-center text-slate-400", className].filter(Boolean).join(" ");

  if (src) {
    return (
      <span className={wrap}>
        <img src={src} alt="" className={IMG[size]} loading="lazy" />
      </span>
    );
  }

  const Icon = placeholder === "package" ? Package : Truck;
  return (
    <span className={wrap} aria-hidden>
      <Icon className={ICON[size]} strokeWidth={1.5} />
    </span>
  );
}
