/** WMS inventory — terminal (minimal) + legacy queue components. */

export const WMS_INV = {
  bg: "bg-white",
  surface: "bg-white",
  border: "border-[#e8edf3]",
  borderStrong: "border-[#d0d7e2]",
  text: "text-[#1a2b3c]",
  textMuted: "text-[#5a6b7d]",
  primary: "bg-[#1e4d8c]",
  primaryText: "text-white",
  accent: "bg-[#e87722]",
  accentText: "text-white",
  successSoft: "bg-[#e8f5ee] text-[#1a7f4b] border-[#9fd4b8]",
  warning: "bg-[#fff4e5] text-[#b45309] border-[#f5c77e]",
  critical: "bg-[#fdecea] text-[#b42318] border-[#f5a8a0]",
  rowHover: "hover:bg-[#f8f9fb]",
  header: "bg-[#1e3a5f] text-white",
  scanZone: "border border-[#d0d7e2] bg-white",
  input:
    "w-full rounded-xl border border-[#d0d7e2] bg-white px-4 py-4 text-xl font-semibold text-[#1a2b3c] placeholder:text-[#a0aec0] focus:border-[#1e4d8c] focus:outline-none focus:ring-2 focus:ring-[#1e4d8c]/20",
  btnPrimary:
    "inline-flex min-h-[52px] flex-1 items-center justify-center rounded-xl bg-[#1e4d8c] px-4 text-base font-bold text-white active:scale-[0.98] disabled:opacity-40",
  btnSecondary:
    "inline-flex min-h-[52px] flex-1 items-center justify-center rounded-xl border border-[#d0d7e2] bg-white px-4 text-base font-bold text-[#1a2b3c] active:scale-[0.98]",
  btnIcon:
    "inline-flex h-11 w-11 items-center justify-center rounded-full text-[#5a6b7d] active:bg-[#f0f2f5]",
  btnGhost:
    "inline-flex min-h-[44px] items-center justify-center rounded-lg border border-[#d0d7e2] bg-white px-4 py-2 text-sm font-bold text-[#1a2b3c] active:scale-[0.98]",
  btnAccent:
    "inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#e87722] px-4 py-2 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-40",
} as const;

export const TASK_ROW_HEIGHT = 44;
