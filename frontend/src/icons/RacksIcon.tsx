import type { IconProps } from "./WarehouseIcon";

export default function RacksIcon({ size = 24, className, ...rest }: IconProps) {
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
      <rect x="10" y="14" width="44" height="6" rx="2" />
      <rect x="10" y="30" width="44" height="6" rx="2" />
      <rect x="10" y="46" width="44" height="6" rx="2" />
      <rect x="14" y="20" width="10" height="10" rx="2" opacity="0.8" />
      <rect x="28" y="36" width="10" height="10" rx="2" opacity="0.8" />
      <rect x="42" y="20" width="10" height="10" rx="2" opacity="0.8" />
    </svg>
  );
}
