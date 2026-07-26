import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { colors, focus, radius, typography } from "../tokens";
import {
  DENSITY_DEFAULT,
  densityControlHeight,
  densityControlText,
  densityFieldPad,
  type UiDensity,
} from "../tokens/density";

export type FieldDensity = UiDensity;
export type FieldFocusTone = "brand" | "neutral";

/** @deprecated Prefer density="comfortable". Maps legacy rail → comfortable. */
function normalizeDensity(density: FieldDensity | "rail"): UiDensity {
  if (density === "rail") return "comfortable";
  return density;
}

function fieldBase(density: UiDensity, focusTone: FieldFocusTone): string {
  const ringFocus =
    focusTone === "brand"
      ? `border-0 ${focus.brandSoft} shadow-sm ring-1 ring-slate-200/80 focus:ring-2`
      : `border ${colors.border.soft} ${focus.neutral}`;
  const shape = density === "comfortable" ? radius.lg : radius.sm;
  return [
    "w-full box-border",
    densityControlHeight[density],
    shape,
    colors.surface.page,
    densityFieldPad[density],
    density === "comfortable" ? typography.controlDense : densityControlText[density],
    colors.text.primary,
    "placeholder:text-slate-400",
    ringFocus,
  ]
    .filter(Boolean)
    .join(" ");
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  density?: FieldDensity | "rail";
  focusTone?: FieldFocusTone;
};

export function Input({
  className = "",
  density = DENSITY_DEFAULT,
  focusTone = "neutral",
  type = "text",
  ...props
}: InputProps) {
  const d = normalizeDensity(density);
  return (
    <input
      type={type}
      className={`${fieldBase(d, focusTone)}${className ? ` ${className}` : ""}`.trim()}
      {...props}
    />
  );
}

export type SearchInputProps = InputProps;

export function SearchInput({
  density = "comfortable",
  focusTone = "brand",
  ...props
}: SearchInputProps) {
  return <Input type="search" density={density} focusTone={focusTone} {...props} />;
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  density?: FieldDensity | "rail";
  focusTone?: FieldFocusTone;
};

export function Select({
  className = "",
  density = DENSITY_DEFAULT,
  focusTone = "neutral",
  children,
  ...props
}: SelectProps) {
  const d = normalizeDensity(density);
  return (
    <select
      className={`${fieldBase(d, focusTone)}${className ? ` ${className}` : ""}`.trim()}
      {...props}
    >
      {children}
    </select>
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  density?: FieldDensity | "rail";
  focusTone?: FieldFocusTone;
};

export function Textarea({
  className = "",
  density = DENSITY_DEFAULT,
  focusTone = "neutral",
  ...props
}: TextareaProps) {
  const d = normalizeDensity(density);
  const pad =
    d === "compact" ? "px-2 py-1.5" : d === "comfortable" ? "px-3 py-2.5" : "px-2.5 py-2";
  return (
    <textarea
      className={[
        "w-full min-h-[5rem]",
        d === "comfortable" ? radius.lg : radius.sm,
        colors.surface.page,
        pad,
        densityControlText[d],
        colors.text.primary,
        "placeholder:text-slate-400",
        focusTone === "brand"
          ? `border-0 ${focus.brandSoft} shadow-sm ring-1 ring-slate-200/80 focus:ring-2`
          : `border ${colors.border.soft} ${focus.neutral}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

export const inputClassName = (
  density: FieldDensity | "rail" = DENSITY_DEFAULT,
  focusTone: FieldFocusTone = "neutral",
) => fieldBase(normalizeDensity(density), focusTone);
