import type { IconProps } from "./WarehouseIcon";

export default function AnalyticsIcon({ size = 24, className, ...rest }: IconProps) {
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
      <rect x="10" y="34" width="8" height="14" rx="2" opacity="0.7" />
      <rect x="24" y="26" width="8" height="22" rx="2" opacity="0.85" />
      <rect x="38" y="18" width="8" height="30" rx="2" />
      <rect x="52" y="10" width="8" height="38" rx="2" opacity="0.8" />
    </svg>
  );
}
