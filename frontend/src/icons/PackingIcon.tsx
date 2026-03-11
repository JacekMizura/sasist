import type { IconProps } from "./WarehouseIcon";

export default function PackingIcon({ size = 24, className, ...rest }: IconProps) {
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
      <rect x="14" y="22" width="36" height="24" rx="4" />
      <rect x="14" y="18" width="36" height="8" rx="3" opacity="0.8" />
    </svg>
  );
}
