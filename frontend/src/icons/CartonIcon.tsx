import type { IconProps } from "./WarehouseIcon";

export default function CartonIcon({ size = 24, className, ...rest }: IconProps) {
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
      <path d="M32 8 L8 24 L8 48 L32 56 L56 40 L56 16 Z" fill="currentColor" opacity="0.9" />
      <path d="M32 8 L32 56 M8 24 L32 40 L56 24" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.4" />
    </svg>
  );
}
