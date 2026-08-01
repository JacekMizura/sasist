import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { odHeaderActionMenuItemClass, odHeaderActionMenuItemIconClass } from "./orderHeaderActionTokens";

type Shared = {
  icon?: ReactNode;
  label: ReactNode;
  trailing?: ReactNode;
  className?: string;
};

type ButtonProps = Shared &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
    to?: undefined;
  };

type LinkProps = Shared & {
  to: string;
  onClick?: () => void;
  disabled?: boolean;
};

/** Flat context-menu row — icon left, label, optional trailing. */
export function OrderHeaderMenuItem(props: ButtonProps | LinkProps) {
  const { icon, label, trailing, className } = props;
  const cls = `${odHeaderActionMenuItemClass} ${className ?? ""}`;

  const body = (
    <>
      {icon ? <span className={odHeaderActionMenuItemIconClass} aria-hidden>{icon}</span> : null}
      <span className="min-w-0 flex-1 leading-snug">{label}</span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </>
  );

  if ("to" in props && props.to) {
    return (
      <Link
        role="menuitem"
        to={props.to}
        onClick={props.onClick}
        className={cls}
        aria-disabled={props.disabled || undefined}
      >
        {body}
      </Link>
    );
  }

  const { onClick, disabled, ...rest } = props as ButtonProps;
  return (
    <button type="button" role="menuitem" onClick={onClick} disabled={disabled} className={cls} {...rest}>
      {body}
    </button>
  );
}
