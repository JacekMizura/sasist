import type { IconProps } from "./WarehouseIcon";

export default function AisleIcon({ size = 24, className, ...rest }: IconProps) {
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
      <rect x="12" y="8" width="12" height="48" rx="2" opacity="0.8" />
      <rect x="40" y="8" width="12" height="48" rx="2" opacity="0.8" />
      <rect x="26" y="8" width="12" height="48" rx="2" fill="currentColor" opacity="0.4" />
    </svg>
  );
}
