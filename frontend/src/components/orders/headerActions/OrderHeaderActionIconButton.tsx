import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  odHeaderActionBadgeClass,
  odHeaderActionBtnActiveClass,
  odHeaderActionBtnClass,
  odHeaderActionIconClass,
} from "./orderHeaderActionTokens";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
  badgeCount?: number | null;
  children: ReactNode;
};

/** 36×36 icon button with tooltip (title) and optional numeric badge. */
export function OrderHeaderActionIconButton({
  label,
  active,
  badgeCount,
  children,
  className,
  ...rest
}: Props) {
  const showBadge = badgeCount != null && Number(badgeCount) > 0;
  const badgeText = showBadge && Number(badgeCount) > 99 ? "99+" : String(badgeCount ?? "");

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`${odHeaderActionBtnClass} ${active ? odHeaderActionBtnActiveClass : ""} ${className ?? ""}`}
      {...rest}
    >
      <span className={odHeaderActionIconClass} aria-hidden>
        {children}
      </span>
      {showBadge ? <span className={odHeaderActionBadgeClass}>{badgeText}</span> : null}
    </button>
  );
}
