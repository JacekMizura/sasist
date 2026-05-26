import { ScanLine } from "lucide-react";

type Props = {
  title: string;
  scanHint?: string;
  sourceLabel?: string | null;
  targetLabel?: string | null;
  remainingQty?: number | null;
};

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

/**
 * Answers in &lt;1s: what now, where from, where to.
 */
export function ScanStepHero({
  title,
  scanHint,
  sourceLabel,
  targetLabel,
  remainingQty,
}: Props) {
  return (
    <section className="rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-700">Teraz</p>
      <h2 className="mt-1 text-xl font-black leading-tight text-slate-900 sm:text-2xl">{title}</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-100 px-3 py-2">
          <p className="text-[10px] font-bold uppercase text-slate-500">Skąd</p>
          <p className="mt-0.5 text-sm font-black text-slate-900">{sourceLabel?.trim() || "—"}</p>
        </div>
        <div className="rounded-xl bg-violet-100 px-3 py-2">
          <p className="text-[10px] font-bold uppercase text-violet-700">Dokąd</p>
          <p className="mt-0.5 text-sm font-black text-violet-950">{targetLabel?.trim() || "—"}</p>
        </div>
        <div className="rounded-xl bg-emerald-100 px-3 py-2">
          <p className="text-[10px] font-bold uppercase text-emerald-800">Zostało</p>
          <p className="mt-0.5 text-sm font-black text-emerald-950">
            {remainingQty != null ? `${fmtQty(remainingQty)} szt.` : "—"}
          </p>
        </div>
      </div>
      {scanHint ? (
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-indigo-900">
          <ScanLine size={18} className="shrink-0" />
          {scanHint}
        </p>
      ) : null}
    </section>
  );
}
