import type { IconProps } from "./WarehouseIcon";

export default function CartIcon({ size = 24, className, ...rest }: IconProps) {
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
      <circle cx="22" cy="52" r="4" fill="currentColor" />
      <circle cx="46" cy="52" r="4" fill="currentColor" />
      <rect x="16" y="22" width="36" height="18" rx="4" fill="currentColor" />
      <line x1="12" y1="18" x2="18" y2="22" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
