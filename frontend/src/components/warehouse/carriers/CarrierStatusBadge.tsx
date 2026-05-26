const TONE: Record<string, string> = {
  ACTIVE: "border-emerald-300 bg-emerald-50 text-emerald-900",
  INBOUND: "border-sky-300 bg-sky-50 text-sky-900",
  PUTAWAY: "border-violet-300 bg-violet-50 text-violet-900",
  PICKING: "border-indigo-300 bg-indigo-50 text-indigo-900",
  PACKING: "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900",
  SHIPPING: "border-cyan-300 bg-cyan-50 text-cyan-900",
  BLOCKED: "border-rose-300 bg-rose-50 text-rose-900",
  DAMAGED: "border-orange-400 bg-orange-50 text-orange-950",
  ARCHIVED: "border-slate-300 bg-slate-100 text-slate-700",
  EMPTY: "border-slate-200 bg-white text-slate-600",
};

export function CarrierStatusBadge({ status }: { status: string }) {
  const s = (status || "ACTIVE").trim().toUpperCase();
  const cls = TONE[s] ?? "border-slate-300 bg-slate-50 text-slate-800";
  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${cls}`}>
      {s}
    </span>
  );
}
