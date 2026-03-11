import type { IconProps } from "./WarehouseIcon";

export default function SimulationIcon({ size = 24, className, ...rest }: IconProps) {
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
      <circle cx="20" cy="20" r="6" fill="currentColor" />
      <circle cx="44" cy="20" r="6" fill="currentColor" />
      <circle cx="32" cy="44" r="6" fill="currentColor" opacity="0.8" />
      <line x1="20" y1="20" x2="44" y2="20" stroke="currentColor" strokeWidth="4" />
      <line x1="20" y1="20" x2="32" y2="44" stroke="currentColor" strokeWidth="4" />
      <line x1="44" y1="20" x2="32" y2="44" stroke="currentColor" strokeWidth="4" />
    </svg>
  );
}
