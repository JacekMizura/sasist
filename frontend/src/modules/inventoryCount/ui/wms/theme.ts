/** WMS inventory — dense operational terminal + legacy ERP/queue tokens. */

export const WMS_INV = {
  bg: "bg-white",
  shell: "w-full space-y-2",
  text: "text-slate-900",
  textMuted: "text-slate-500",
  textLabel: "text-[10px] font-black uppercase tracking-widest text-slate-400",
  locationCode: "text-xl font-black tracking-tight text-slate-900 leading-none",
  locationSub: "text-[10px] font-bold uppercase tracking-widest text-slate-400",
  inputOperational:
    "w-full border-2 border-slate-200 bg-slate-50/80 py-2 pl-10 pr-3 text-sm font-bold text-slate-900 outline-none transition-colors placeholder:text-slate-400 hover:bg-slate-100 focus:border-[#5a4fcf] focus:bg-white focus:ring-2 focus:ring-indigo-500/10 disabled:opacity-50",
  chip: "inline-flex items-center border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600",
  chipActive: "border-[#1e4d8c] text-[#1e4d8c]",
  btnAction:
    "h-9 w-full max-w-xs border border-slate-200 bg-white px-3 text-left text-xs font-black uppercase tracking-wide text-slate-700 active:bg-slate-50 disabled:opacity-40",
  btnActionPrimary:
    "h-9 w-full max-w-xs border border-[#1e4d8c] bg-[#1e4d8c] px-3 text-left text-xs font-black uppercase tracking-wide text-white active:bg-[#163a6b]",
  divider: "border-t border-slate-100",
  /** Legacy — modals / supervisor queue */
  surface: "bg-white",
  border: "border-[#e8edf3]",
  borderStrong: "border-[#d0d7e2]",
  primary: "bg-[#1e4d8c]",
  primaryText: "text-white",
  accent: "bg-[#e87722]",
  accentText: "text-white",
  successSoft: "bg-[#e8f5ee] text-[#1a7f4b] border-[#9fd4b8]",
  warning: "bg-[#fff4e5] text-[#b45309] border-[#f5c77e]",
  critical: "bg-[#fdecea] text-[#b42318] border-[#f5a8a0]",
  rowHover: "hover:bg-[#f8f9fb]",
  rowActive: "bg-[#eef3fa]",
  header: "bg-[#1e3a5f] text-white",
  input:
    "w-full rounded-lg border border-[#c8ced8] bg-white px-3 py-2.5 text-base font-semibold text-[#1a2b3c] placeholder:text-[#a0aec0] focus:border-[#1e4d8c] focus:outline-none focus:ring-2 focus:ring-[#1e4d8c]/20",
  btnPrimary:
    "inline-flex min-h-[44px] w-full items-center justify-center bg-[#1e4d8c] px-4 text-sm font-bold text-white active:bg-[#163a6b] disabled:opacity-40",
  btnGhost:
    "inline-flex min-h-[44px] items-center justify-center rounded-lg border border-[#d0d7e2] bg-white px-4 py-2 text-sm font-bold text-[#1a2b3c] active:scale-[0.98]",
  btnAccent:
    "inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#e87722] px-4 py-2 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-40",
} as const;

export const TASK_ROW_HEIGHT = 40;
