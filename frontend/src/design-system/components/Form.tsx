import type { HTMLAttributes, LabelHTMLAttributes, ReactNode } from "react";

import { Card, type CardProps } from "./Card";
import { typography } from "../tokens";
import { DENSITY_DEFAULT, type UiDensity } from "../tokens/density";

/**
 * Canonical density for ERP page forms (Phase C).
 * Lists/filters may still use compact/default; forms use comfortable (h-10).
 */
export const FORM_FIELD_DENSITY: UiDensity = "comfortable";

export type FormLabelProps = LabelHTMLAttributes<HTMLLabelElement> & {
  children: ReactNode;
};

/** Field label — Documents series / typography.label SSOT. */
export function FormLabel({ className = "", children, ...props }: FormLabelProps) {
  return (
    <label
      className={`mb-1.5 block ${typography.label}${className ? ` ${className}` : ""}`.trim()}
      {...props}
    >
      {children}
    </label>
  );
}

export type FormHelperTextProps = HTMLAttributes<HTMLParagraphElement> & {
  children: ReactNode;
};

export function FormHelperText({ className = "", children, ...props }: FormHelperTextProps) {
  return (
    <p className={`mt-1 ${typography.caption}${className ? ` ${className}` : ""}`.trim()} {...props}>
      {children}
    </p>
  );
}

export type FormErrorProps = HTMLAttributes<HTMLParagraphElement> & {
  children: ReactNode;
};

export function FormError({ className = "", children, ...props }: FormErrorProps) {
  return (
    <p
      role="alert"
      className={`mt-1 text-xs font-medium text-rose-600${className ? ` ${className}` : ""}`.trim()}
      {...props}
    >
      {children}
    </p>
  );
}

export type FormFieldProps = HTMLAttributes<HTMLDivElement> & {
  label?: ReactNode;
  htmlFor?: string;
  helperText?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
};

/**
 * Label + control + helper/error stack.
 * Pass the control as children (Input / Select / Textarea / …).
 */
export function FormField({
  label,
  htmlFor,
  helperText,
  error,
  children,
  className = "",
  ...props
}: FormFieldProps) {
  return (
    <div className={`min-w-0${className ? ` ${className}` : ""}`.trim()} {...props}>
      {label != null ? (
        <FormLabel htmlFor={htmlFor}>{label}</FormLabel>
      ) : null}
      {children}
      {error ? <FormError>{error}</FormError> : helperText ? <FormHelperText>{helperText}</FormHelperText> : null}
    </div>
  );
}

export type FormSectionProps = Omit<CardProps, "variant" | "title"> & {
  title?: ReactNode;
  description?: ReactNode;
  /** Flat divider style (no card chrome) for stacked sections. */
  flat?: boolean;
  children: ReactNode;
};

/**
 * Logical form group. Prefer few sections over wrapping every pair of fields.
 * Default: Card section. `flat` = border-t stack without nested cards.
 */
export function FormSection({
  title,
  description,
  flat = false,
  density = DENSITY_DEFAULT,
  children,
  className = "",
  ...props
}: FormSectionProps) {
  const header =
    title != null || description != null ? (
      <div className={children ? "mb-4" : undefined}>
        {title != null ? <h3 className={typography.h2}>{title}</h3> : null}
        {description != null ? (
          <p className={`mt-1 ${typography.pageDesc}`}>{description}</p>
        ) : null}
      </div>
    ) : null;

  if (flat) {
    return (
      <section
        className={`border-t border-slate-100 pt-6 first:border-t-0 first:pt-0${className ? ` ${className}` : ""}`.trim()}
        {...props}
      >
        {header}
        {children}
      </section>
    );
  }

  return (
    <Card variant="section" density={density} className={className} {...props}>
      {header}
      {children}
    </Card>
  );
}

export type FormActionsProps = HTMLAttributes<HTMLDivElement> & {
  start?: ReactNode;
  end?: ReactNode;
  children?: ReactNode;
  /** Sticky floating bar (document series style). */
  sticky?: boolean;
};

/**
 * Form footer: Wstecz (start) | Anuluj + Zapisz/Dalej (end).
 * Prefer PrimaryButton / SecondaryButton / GhostButton as children — do not invent local CTAs.
 */
export function FormActions({
  start,
  end,
  children,
  sticky = false,
  className = "",
  ...props
}: FormActionsProps) {
  const body = (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4${className ? ` ${className}` : ""}`.trim()}
      {...props}
    >
      <div className="flex flex-wrap items-center gap-2">{start}</div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {end}
        {children}
      </div>
    </div>
  );

  if (!sticky) return body;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm`}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">{start}</div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {end}
          {children}
        </div>
      </div>
    </div>
  );
}

export const formStackClass = "space-y-4";
export const formStackLooseClass = "space-y-6";

/** Class alias when a bare `<label>` is unavoidable. Prefer {@link FormLabel}. */
export const formLabelClass = typography.label;
