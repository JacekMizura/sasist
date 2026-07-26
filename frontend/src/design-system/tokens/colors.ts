/**
 * Sasist UI Kit — color roles (Tailwind class fragments).
 * Feature code must import these — never hardcode palette utilities.
 */

export const colors = {
  primary: {
    bg: "bg-orange-500",
    bgHover: "hover:bg-orange-600",
    bgActive: "active:bg-orange-700",
    softBg: "bg-orange-50",
    softBgHover: "hover:bg-orange-100",
    softBorder: "border-orange-200",
    border: "border-orange-500",
    text: "text-orange-600",
    textStrong: "text-orange-700",
    textOn: "text-white",
    ring: "ring-orange-400",
    ringSoft: "ring-orange-400/50",
    focusRing: "focus-visible:ring-orange-400",
  },
  success: {
    bg: "bg-emerald-600",
    bgHover: "hover:bg-emerald-700",
    softBg: "bg-emerald-50",
    text: "text-emerald-600",
    textStrong: "text-emerald-800",
    textOn: "text-white",
    ring: "ring-emerald-500",
    focusRing: "focus-visible:ring-emerald-500/50",
  },
  warning: {
    bg: "bg-amber-600",
    bgHover: "hover:bg-amber-700",
    softBg: "bg-amber-50",
    text: "text-amber-600",
    textStrong: "text-amber-800",
    textOn: "text-white",
    ring: "ring-amber-500",
    focusRing: "focus-visible:ring-amber-500/50",
  },
  danger: {
    bg: "bg-rose-600",
    bgHover: "hover:bg-rose-700",
    softBg: "bg-rose-50",
    softBgHover: "hover:bg-rose-100",
    border: "border-rose-200",
    text: "text-rose-600",
    textStrong: "text-rose-700",
    textOn: "text-white",
    ring: "ring-rose-400",
    focusRing: "focus-visible:ring-rose-400",
  },
  info: {
    bg: "bg-sky-600",
    softBg: "bg-sky-50",
    text: "text-sky-700",
    textStrong: "text-sky-800",
    ring: "ring-sky-400",
  },
  neutral: {
    bg: "bg-slate-100",
    softBg: "bg-slate-50",
    text: "text-slate-600",
    textStrong: "text-slate-800",
    textMuted: "text-slate-500",
    textFaint: "text-slate-400",
    border: "border-slate-200",
    borderSoft: "border-slate-200/90",
    ring: "ring-slate-200",
    focusRing: "focus-visible:ring-slate-400/35",
  },
  surface: {
    page: "bg-white",
    rail: "bg-[#f7f8fa]",
    canvas: "bg-slate-100/80",
    muted: "bg-slate-50",
  },
  border: {
    default: "border-slate-200",
    soft: "border-slate-200/90",
    strong: "border-slate-300",
    dashed: "border-dashed border-slate-200",
  },
  text: {
    primary: "text-slate-900",
    secondary: "text-slate-800",
    body: "text-slate-700",
    muted: "text-slate-500",
    faint: "text-slate-400",
    inverse: "text-white",
  },
} as const;

export type ColorTone = "success" | "warning" | "danger" | "info" | "neutral";

export const toneTextClass: Record<ColorTone, string> = {
  success: colors.success.text,
  warning: colors.warning.text,
  danger: colors.danger.text,
  info: colors.info.text,
  neutral: colors.neutral.text,
};

export const toneSoftBgClass: Record<ColorTone, string> = {
  success: colors.success.softBg,
  warning: colors.warning.softBg,
  danger: colors.danger.softBg,
  info: colors.info.softBg,
  neutral: colors.neutral.softBg,
};

export const toneBadgeClass: Record<ColorTone, string> = {
  success: `${colors.success.softBg} ${colors.success.textStrong}`,
  warning: `${colors.warning.softBg} ${colors.warning.textStrong}`,
  danger: `${colors.danger.softBg} ${colors.danger.textStrong}`,
  info: `${colors.info.softBg} ${colors.info.textStrong}`,
  neutral: `${colors.neutral.softBg} ${colors.neutral.textStrong}`,
};
