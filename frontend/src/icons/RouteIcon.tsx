import type { IconProps } from "./WarehouseIcon";

export default function RouteIcon({ size = 24, className, ...rest }: IconProps) {
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
      <circle cx="14" cy="50" r="4" fill="currentColor" />
      <circle cx="50" cy="14" r="4" fill="currentColor" />
      <path
        d="M14 50 C20 30, 40 34, 50 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
