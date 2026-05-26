import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "success" | "danger" | "ghost";

const VARIANT: Record<Variant, string> = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800",
  secondary: "border-2 border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
  success: "bg-emerald-600 text-white hover:bg-emerald-700",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-100",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
  fullWidth?: boolean;
};

/** Min 52px touch target — gloves / scanner friendly. */
export function ExecutionTouchButton({
  variant = "primary",
  className = "",
  children,
  fullWidth,
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={[
        "inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl px-5 text-sm font-black uppercase tracking-wide transition active:scale-[0.98] disabled:opacity-50",
        VARIANT[variant],
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}
