import { carrierStatusLabel } from "../../../modules/warehouse-structure/labels";

const TONE: Record<string, string> = {
  ACTIVE: "border-emerald-200 bg-emerald-50/80 text-emerald-800",
  INBOUND: "border-sky-200 bg-sky-50/80 text-sky-800",
  PUTAWAY: "border-violet-200 bg-violet-50/80 text-violet-800",
  PICKING: "border-indigo-200 bg-indigo-50/80 text-indigo-800",
  PACKING: "border-fuchsia-200 bg-fuchsia-50/80 text-fuchsia-800",
  SHIPPING: "border-cyan-200 bg-cyan-50/80 text-cyan-800",
  BLOCKED: "border-rose-200 bg-rose-50/80 text-rose-800",
  DAMAGED: "border-orange-200 bg-orange-50/80 text-orange-900",
  ARCHIVED: "border-slate-200 bg-slate-50 text-slate-600",
  EMPTY: "border-slate-200 bg-white text-slate-600",
  INACTIVE: "border-slate-200 bg-slate-50 text-slate-600",
};

export function CarrierStatusBadge({ status }: { status: string }) {
  const key = (status || "ACTIVE").trim().toUpperCase();
  const cls = TONE[key] ?? "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <span className={`inline-flex rounded-md border px-2.5 py-1 text-[13px] font-bold leading-none ${cls}`}>
      {carrierStatusLabel(status)}
    </span>
  );
}
