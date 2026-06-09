/** WMS inventory — modern operational terminal tokens (aligned with putaway/picking). */

export const WMS_INV = {
  pageBg: "bg-white",
  bg: "bg-white",
  shell: "mx-auto w-full max-w-4xl space-y-6 px-4 sm:px-6 pb-32",
  shellWide: "mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 pb-12",
  splitMain: "flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-white px-4 py-6 sm:px-6",
  text: "text-slate-800",
  textMuted: "text-slate-500",
  textLabel: "text-[11px] font-bold uppercase tracking-widest text-slate-400",
  textSub: "text-sm font-medium text-slate-500",
  card: "bg-white border border-slate-200 rounded-2xl shadow-sm",
  cardPad: "p-5 sm:p-6",
  scanHero:
    "block w-full pl-20 pr-8 py-6 border border-slate-200 rounded-[2rem] focus:ring-4 focus:ring-indigo-50 focus:border-[#5a45d0] focus:outline-none text-xl font-semibold text-slate-700 placeholder-slate-400 transition-all bg-white shadow-sm disabled:opacity-50",
  scanDefault:
    "block w-full pl-16 pr-6 py-5 border border-slate-200 rounded-[1.5rem] focus:ring-4 focus:ring-indigo-50 focus:border-[#5a45d0] focus:outline-none text-lg font-medium text-slate-700 placeholder-slate-400 transition-shadow bg-white shadow-sm disabled:opacity-50",
  scanIconHero: "pointer-events-none absolute left-8 top-1/2 h-7 w-7 -translate-y-1/2 text-[#5a45d0]",
  scanIconDefault: "pointer-events-none absolute left-6 top-1/2 h-6 w-6 -translate-y-1/2 text-[#5a45d0]",
  chip: "inline-flex items-center border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 rounded-lg",
  chipActive: "border-[#5a45d0] text-[#5a45d0]",
  btnAction:
    "flex-1 bg-white border-2 border-slate-200 text-slate-700 text-xs font-bold py-4 px-4 rounded-xl hover:bg-slate-50 transition-colors uppercase tracking-widest disabled:opacity-40",
  btnActionPrimary:
    "flex-1 bg-[#23438e] hover:bg-[#1a326b] text-white text-xs font-bold py-4 px-4 rounded-xl transition-colors uppercase tracking-widest shadow-md disabled:opacity-40",
  btnCta:
    "shrink-0 rounded-xl bg-[#23438e] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#1a326b] disabled:bg-slate-300",
  bottomBar:
    "fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 p-4 flex justify-center z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]",
  bottomBarInner: "max-w-4xl w-full flex gap-4",
  sidebar:
    "flex w-full shrink-0 flex-col border-slate-200/80 bg-white lg:h-full lg:min-h-0 lg:w-[320px] lg:min-w-[320px] lg:max-w-[320px] lg:overflow-y-auto lg:border-r",
  sidebarHeader: "shrink-0 border-b border-slate-100 px-4 py-4",
  listRow:
    "flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors hover:bg-slate-50/80",
  listRowActive: "bg-indigo-50/60 hover:bg-indigo-50/80",
  divider: "border-t border-slate-100",
  accentPurple: "text-[#5a45d0]",
  accentBlue: "text-[#23438e]",
  /** Legacy — modals / supervisor queue */
  surface: "bg-white",
  border: "border-[#e8edf3]",
  borderStrong: "border-[#d0d7e2]",
  primary: "bg-[#23438e]",
  primaryText: "text-white",
  accent: "bg-[#e87722]",
  accentText: "text-white",
  successSoft: "bg-[#e8f5ee] text-[#1a7f4b] border-[#9fd4b8]",
  warning: "bg-[#fff4e5] text-[#b45309] border-[#f5c77e]",
  critical: "bg-[#fdecea] text-[#b42318] border-[#f5a8a0]",
  rowHover: "hover:bg-[#f8f9fb]",
  rowActive: "bg-[#eef3fa]",
  header: "bg-[#1e3a5f] text-white",
  inputOperational:
    "block w-full pl-16 pr-6 py-5 border border-slate-200 rounded-[1.5rem] focus:ring-4 focus:ring-indigo-50 focus:border-[#5a45d0] focus:outline-none text-lg font-medium text-slate-700 placeholder-slate-400 transition-shadow bg-white shadow-sm disabled:opacity-50",
  input:
    "w-full rounded-lg border border-[#c8ced8] bg-white px-3 py-2.5 text-base font-semibold text-[#1a2b3c] placeholder:text-[#a0aec0] focus:border-[#23438e] focus:outline-none focus:ring-2 focus:ring-[#23438e]/20",
  btnPrimary:
    "inline-flex min-h-[44px] w-full items-center justify-center bg-[#23438e] px-4 text-sm font-bold text-white active:bg-[#1a326b] disabled:opacity-40 rounded-xl",
  btnGhost:
    "inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[#d0d7e2] bg-white px-4 py-2 text-sm font-bold text-[#1a2b3c] active:scale-[0.98]",
  btnAccent:
    "inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#e87722] px-4 py-2 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-40",
  /** @deprecated use pageBg */
  pageBgLegacy: "bg-[#fafbfc]",
  textLabelLegacy: "text-[10px] font-black uppercase tracking-widest text-slate-400",
  locationCodeLegacy:
    "bg-[#eff2fe] border border-[#d6defc] text-[#5a45d0] px-5 py-3.5 rounded-xl font-bold text-lg flex items-center",
  locationSub: "text-[11px] font-bold uppercase tracking-widest text-slate-400",
  docSwitcherBar: "px-4 sm:px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center shadow-sm",
  docSwitcherBtn:
    "flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest hover:text-slate-800 transition-colors bg-slate-50 px-3 py-2 rounded-lg border border-slate-100",
} as const;

export const TASK_ROW_HEIGHT = 40;
