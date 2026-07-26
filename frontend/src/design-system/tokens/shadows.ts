/**
 * Shadow scale — 4 levels max.
 */

export const shadows = {
  none: "shadow-none",
  sm: "shadow-sm",
  md: "shadow-md",
  /** Soft card elevation used on rails */
  card: "shadow-sm shadow-slate-900/[0.04]",
  /** Right rail inset */
  rail: "shadow-[-4px_0_24px_rgba(15,23,42,0.04)]",
} as const;
