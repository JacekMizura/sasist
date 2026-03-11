import type { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

export default function WarehouseIcon({ size = 24, className, ...rest }: IconProps) {
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
      <rect x="8" y="24" width="48" height="28" rx="4" />
      <polygon points="8,24 32,10 56,24" opacity="0.9" />
      <rect x="28" y="36" width="8" height="16" rx="2" opacity="0.3" />
    </svg>
  );
}
