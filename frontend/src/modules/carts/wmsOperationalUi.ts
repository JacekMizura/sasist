/** Typography + control sizes for WMS operational screens (wózki, nośniki). */

export const wmsTextBase = "text-[15px] leading-relaxed text-slate-800";
export const wmsTextMeta = "text-[13px] leading-snug text-slate-600";
export const wmsTextLabel = "text-[12px] font-semibold uppercase tracking-wide text-slate-500";
export const wmsTextCode = "font-mono text-[15px] font-bold tabular-nums text-slate-900";
export const wmsTextCodeLg = "font-mono text-lg font-black tabular-nums tracking-tight text-slate-900";

export const wmsBtnPrimary =
  "inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 text-[14px] font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50";

export const wmsBtnSecondary =
  "inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-[14px] font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50";

export const wmsInputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-[15px] text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400";

export const wmsSelectClass = wmsInputClass;

export const wmsSectionTitle = "text-[13px] font-bold uppercase tracking-wide text-slate-600";

export const wmsSegmentedWrap = "inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5";

export const wmsSegmentedBtn = (active: boolean) =>
  `rounded-md px-4 py-2 text-[13px] font-semibold transition ${
    active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
  }`;
