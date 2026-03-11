import type { IconProps } from "./WarehouseIcon";

export default function ReplenishmentIcon({ size = 24, className, ...rest }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
      stroke="currentColor"
      {...rest}
    >
      <rect x="10" y="34" width="18" height="12" rx="3" fill="currentColor" />
      <rect x="36" y="18" width="18" height="12" rx="3" fill="currentColor" opacity="0.8" />
      <polyline
        points="28,40 36,32 28,24"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
