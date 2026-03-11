import type { IconProps } from "./WarehouseIcon";

export default function PalletIcon({ size = 24, className, ...rest }: IconProps) {
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
      <rect x="8" y="36" width="20" height="20" rx="2" fill="currentColor" />
      <rect x="36" y="36" width="20" height="20" rx="2" fill="currentColor" />
      <rect x="8" y="8" width="48" height="24" rx="2" fill="currentColor" opacity="0.9" />
      <line x1="8" y1="20" x2="56" y2="20" stroke="currentColor" strokeWidth="2" opacity="0.5" />
    </svg>
  );
}
