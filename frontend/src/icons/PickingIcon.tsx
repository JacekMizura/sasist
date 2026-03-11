import type { IconProps } from "./WarehouseIcon";

export default function PickingIcon({ size = 24, className, ...rest }: IconProps) {
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
      <circle cx="20" cy="18" r="6" />
      <rect x="14" y="24" width="12" height="16" rx="4" />
      <rect x="32" y="22" width="18" height="6" rx="2" />
      <rect x="32" y="32" width="18" height="6" rx="2" />
      <rect x="32" y="42" width="18" height="6" rx="2" opacity="0.8" />
    </svg>
  );
}
