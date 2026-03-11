import type { IconProps } from "./WarehouseIcon";

export default function InventoryIcon({ size = 24, className, ...rest }: IconProps) {
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
      <rect x="8" y="14" width="48" height="6" rx="2" />
      <rect x="8" y="30" width="48" height="6" rx="2" />
      <rect x="8" y="46" width="48" height="6" rx="2" />
      <rect x="12" y="20" width="10" height="10" rx="2" opacity="0.8" />
      <rect x="26" y="36" width="10" height="10" rx="2" opacity="0.8" />
      <rect x="40" y="20" width="10" height="10" rx="2" opacity="0.8" />
    </svg>
  );
}
