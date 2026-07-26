import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cardButtonClass, type UiDensity } from "./buttonClasses";

export type CardButtonTone = "neutral" | "emerald" | "rose";

export type CardButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {

  children: ReactNode;

  active?: boolean;

  tone?: CardButtonTone;

  fullWidth?: boolean;

  density?: UiDensity;

};

/**

 * Card-chrome secondary / segment item (Magazyn rails, Generuj układ, Magazyn/Sklep).

 */

export function CardButton({

  children,

  className = "",

  type = "button",

  active = false,

  tone = "neutral",

  fullWidth = false,

  density = "default",

  ...props

}: CardButtonProps) {

  return (

    <button

      type={type}

      className={`${cardButtonClass({ active, tone, fullWidth, density })}${className ? ` ${className}` : ""}`.trim()}

      aria-pressed={active || undefined}

      {...props}

    >

      {children}

    </button>

  );

}

export function cardButtonClassName(options?: {

  active?: boolean;

  tone?: CardButtonTone;

  fullWidth?: boolean;

  density?: UiDensity;

  className?: string;

}): string {

  return `${cardButtonClass(options)}${options?.className ? ` ${options.className}` : ""}`.trim();

}

