import type { ButtonHTMLAttributes, ReactNode } from "react";

import { secondaryButtonClassFor, type UiDensity } from "./buttonClasses";

export type SecondaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {

  children: ReactNode;

  density?: UiDensity;

};

export function SecondaryButton({

  children,

  className = "",

  type = "button",

  density = "default",

  ...props

}: SecondaryButtonProps) {

  return (

    <button

      type={type}

      className={`${secondaryButtonClassFor(density)}${className ? ` ${className}` : ""}`.trim()}

      {...props}

    >

      {children}

    </button>

  );

}

export function secondaryButtonClassName(layoutClassName = "", density: UiDensity = "default"): string {

  return `${secondaryButtonClassFor(density)}${layoutClassName ? ` ${layoutClassName}` : ""}`.trim();

}

