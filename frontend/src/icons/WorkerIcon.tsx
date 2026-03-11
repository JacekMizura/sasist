import type { IconProps } from "./WarehouseIcon";

export default function WorkerIcon({ size = 24, className, ...rest }: IconProps) {
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
      <circle cx="32" cy="18" r="8" />
      <rect x="20" y="28" width="24" height="20" rx="6" />
      <rect x="26" y="34" width="12" height="8" rx="2" opacity="0.5" />
    </svg>
  );
}
