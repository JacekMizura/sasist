import type { IconProps } from "./WarehouseIcon";

/** Koszyk na wózku (WMS MULTI / baskets). */
export default function BasketIcon({ size = 24, className, ...rest }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
      {...rest}
    >
      <path
        opacity="0.2"
        d="M18 30h28l-3.5 24H21.5L18 30z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 30h24l-3 22H23l-3-22zm-6 0h36v5H14v-5zm12-12c1.5-5 4.5-8 8-8s6.5 3 8 8"
      />
    </svg>
  );
}
