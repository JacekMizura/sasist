import type { IconProps } from "./WarehouseIcon";

export default function HeatmapIcon({ size = 24, className, ...rest }: IconProps) {
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
      <circle cx="20" cy="24" r="8" opacity="0.7" />
      <circle cx="40" cy="36" r="10" />
      <circle cx="28" cy="44" r="6" opacity="0.7" />
    </svg>
  );
}
