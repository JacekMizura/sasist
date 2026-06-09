/** ERP inventory presentation tokens — aligned with panel list / Dashboard surfaces. */
export const erpSurfaceCard =
  "rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

/** @deprecated Use panelListDense* from `@/components/operational` for tables. */
export const ERP_INV = {
  table: "min-w-full text-xs",
  th: "px-2 py-1 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200",
  td: "px-2 py-1 align-middle border-b border-slate-100",
  row: "hover:bg-slate-50/80",
} as const;
