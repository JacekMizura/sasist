/** Industrial WMS inventory execution — bright, high-contrast operational palette. */

export const WMS_INV = {
  bg: "bg-[#f4f6fa]",
  surface: "bg-white",
  border: "border-[#c5d0de]",
  borderStrong: "border-[#1e3a5f]",
  text: "text-[#1a2b3c]",
  textMuted: "text-[#5a6b7d]",
  primary: "bg-[#1e4d8c]",
  primaryHover: "hover:bg-[#163a6b]",
  primaryText: "text-white",
  accent: "bg-[#e87722]",
  accentText: "text-white",
  success: "bg-[#1a7f4b]",
  successSoft: "bg-[#e8f5ee] text-[#1a7f4b] border-[#9fd4b8]",
  warning: "bg-[#fff4e5] text-[#b45309] border-[#f5c77e]",
  critical: "bg-[#fdecea] text-[#b42318] border-[#f5a8a0]",
  rowHover: "hover:bg-[#eef3fa]",
  rowActive: "bg-[#dce8f8]",
  header: "bg-[#1e3a5f] text-white",
  scanZone: "border-2 border-dashed border-[#1e4d8c] bg-[#f0f5fc]",
  input:
    "w-full rounded-lg border-2 border-[#c5d0de] bg-white px-3 py-2.5 text-base font-semibold text-[#1a2b3c] placeholder:text-[#8a9bb0] focus:border-[#1e4d8c] focus:outline-none focus:ring-2 focus:ring-[#1e4d8c]/25",
  btnPrimary:
    "inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#1e4d8c] px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-[#163a6b] active:scale-[0.98] disabled:opacity-50",
  btnAccent:
    "inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#e87722] px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-[#c9651a] active:scale-[0.98] disabled:opacity-50",
  btnGhost:
    "inline-flex min-h-[44px] items-center justify-center rounded-lg border-2 border-[#c5d0de] bg-white px-4 py-2.5 text-sm font-bold text-[#1a2b3c] transition hover:border-[#1e4d8c] hover:bg-[#eef3fa] active:scale-[0.98]",
} as const;

export const TASK_ROW_HEIGHT = 44;
