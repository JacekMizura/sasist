import type { ButtonHTMLAttributes } from "react";

import {
  PrimaryButton,
  type PrimaryButtonProps,
  SecondaryButton,
  SuccessButton,
  GhostButton,
} from "../../design-system";

export type AppButtonVariant = "primary" | "secondary" | "success" | "ghost";

export type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AppButtonVariant;
};

/**
 * Shared button facade → Sasist UI Kit.
 * Prefer importing PrimaryButton / SecondaryButton / … directly.
 */
export function AppButton({
  variant = "secondary",
  className = "",
  type = "button",
  children,
  ...props
}: AppButtonProps) {
  if (variant === "primary") {
    return (
      <PrimaryButton
        type={type}
        className={className}
        {...(props as Omit<PrimaryButtonProps, "children" | "className" | "type">)}
      >
        {children}
      </PrimaryButton>
    );
  }
  if (variant === "success") {
    return (
      <SuccessButton type={type} className={className} {...props}>
        {children}
      </SuccessButton>
    );
  }
  if (variant === "ghost") {
    return (
      <GhostButton type={type} className={className} {...props}>
        {children}
      </GhostButton>
    );
  }
  return (
    <SecondaryButton type={type} className={className} {...props}>
      {children}
    </SecondaryButton>
  );
}
