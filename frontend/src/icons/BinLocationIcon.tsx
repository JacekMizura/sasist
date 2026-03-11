import type { IconProps } from "./WarehouseIcon";

export default function BinLocationIcon({ size = 24, className, ...rest }: IconProps) {
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
      <rect x="10" y="14" width="44" height="36" rx="4" />
      <rect x="16" y="22" width="10" height="10" rx="2" opacity="0.6" />
      <rect x="30" y="22" width="10" height="10" rx="2" opacity="0.8" />
      <rect x="44" y="22" width="6" height="10" rx="2" opacity="0.5" />
      <rect x="16" y="36" width="10" height="10" rx="2" opacity="0.8" />
      <rect x="30" y="36" width="10" height="10" rx="2" opacity="0.6" />
    </svg>
  );
}
