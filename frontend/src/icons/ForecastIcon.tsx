import type { IconProps } from "./WarehouseIcon";

export default function ForecastIcon({ size = 24, className, ...rest }: IconProps) {
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
      <rect x="12" y="38" width="8" height="12" rx="2" opacity="0.6" />
      <rect x="26" y="30" width="8" height="20" rx="2" opacity="0.8" />
      <rect x="40" y="20" width="8" height="30" rx="2" />
    </svg>
  );
}
