import type { IconProps } from "./WarehouseIcon";

export default function ZonesIcon({ size = 24, className, ...rest }: IconProps) {
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
      <rect x="8" y="8" width="22" height="22" rx="4" />
      <rect x="34" y="8" width="22" height="22" rx="4" opacity="0.8" />
      <rect x="8" y="34" width="22" height="22" rx="4" opacity="0.8" />
      <rect x="34" y="34" width="22" height="22" rx="4" />
    </svg>
  );
}
