import type { HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { colors, focus, radius } from "../tokens";

export type CheckboxProps = InputHTMLAttributes<HTMLInputElement>;

export function Checkbox({ className = "", ...props }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      className={`h-3.5 w-3.5 shrink-0 ${radius.sm} border-slate-300 text-slate-800 focus:ring-1 focus:ring-slate-400/50${className ? ` ${className}` : ""}`.trim()}
      {...props}
    />
  );
}

export type RadioProps = InputHTMLAttributes<HTMLInputElement>;

export function Radio({ className = "", ...props }: RadioProps) {
  return (
    <input
      type="radio"
      className={`h-3.5 w-3.5 shrink-0 border-slate-300 ${colors.primary.text} focus:ring-1 ${colors.primary.focusRing}/50${className ? ` ${className}` : ""}`.trim()}
      {...props}
    />
  );
}

export type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: ReactNode;
};

/** Accessible checkbox-styled switch (no extra deps). */
export function Switch({ className = "", label, id, ...props }: SwitchProps) {
  const switchId = id ?? props.name;
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2${className ? ` ${className}` : ""}`}>
      <input id={switchId} type="checkbox" role="switch" className="peer sr-only" {...props} />
      {/* Full Tailwind class strings required for JIT — values mirror color tokens. */}
      <span
        className={`relative h-5 w-9 rounded-full bg-slate-200 transition peer-checked:bg-orange-500 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-400/50 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4 ${focus.brandSoft}`}
        aria-hidden
      />
      {label ? <span className={`text-sm ${colors.text.body}`}>{label}</span> : null}
    </label>
  );
}

export type ProgressBarProps = HTMLAttributes<HTMLDivElement> & {
  value: number;
  tone?: "success" | "warning" | "danger" | "neutral" | "info" | "primary";
  /** Track thickness. */
  size?: "sm" | "md" | "lg";
};

/** Progress fill — token-aligned static classes for Tailwind JIT. */
const barTone: Record<NonNullable<ProgressBarProps["tone"]>, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  neutral: "bg-slate-400",
  info: "bg-sky-500",
  primary: "bg-orange-500",
};

const trackSize: Record<NonNullable<ProgressBarProps["size"]>, string> = {
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-3.5",
};

export function ProgressBar({
  value,
  tone = "success",
  size = "sm",
  className = "",
  ...props
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div
      className={`${trackSize[size]} overflow-hidden rounded-full bg-slate-200/80${className ? ` ${className}` : ""}`.trim()}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      {...props}
    >
      <div
        className={`h-full rounded-full transition-all duration-500 ${barTone[tone]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
