import type { IconProps } from "./WarehouseIcon";

export default function OrdersIcon({ size = 24, className, ...rest }: IconProps) {
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
      <rect x="10" y="10" width="44" height="12" rx="5" />
      <rect x="10" y="26" width="44" height="12" rx="5" />
      <rect x="10" y="42" width="44" height="12" rx="5" />
      <circle cx="46" cy="16" r="3" opacity="0.8" />
      <circle cx="46" cy="32" r="3" opacity="0.8" />
      <circle cx="46" cy="48" r="3" opacity="0.8" />
    </svg>
  );
}
