import { TrendingUp } from "lucide-react";

import markUrl from "../../../assets/logo/sasist-mark.svg";

/** Dark SaaS branding panel — desktop only. */
export default function LoginBrandingPanel() {
  return (
    <div className="relative hidden flex-col justify-between overflow-hidden bg-slate-950 p-10 text-white lg:flex lg:w-[55%] lg:p-14">
      <div className="pointer-events-none absolute -left-[10%] top-[-15%] h-[600px] w-[600px] rounded-full bg-indigo-600/20 blur-[120px]" />
      <div className="pointer-events-none absolute -right-[10%] bottom-[-10%] h-[500px] w-[500px] rounded-full bg-emerald-500/10 blur-[100px]" />

      <div className="relative z-10">
        <div className="mb-16 flex items-center gap-2.5">
          <img src={markUrl} alt="" className="h-9 w-9" draggable={false} />
          <span className="text-2xl font-extrabold tracking-[0.12em] text-white">SASIST</span>
        </div>

        <h1 className="mb-6 max-w-lg text-5xl font-extrabold leading-[1.12] tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400">
          Twój magazyn
          <br />i e-commerce
          <br />w jednym systemie.
        </h1>
        <p className="max-w-md text-lg font-light leading-relaxed text-slate-400">
          Nowoczesny WMS/ERP — od{" "}
          <strong className="font-medium text-slate-200">przyjęć</strong> i{" "}
          <strong className="font-medium text-slate-200">rozlokowania</strong>, przez{" "}
          <strong className="font-medium text-slate-200">kompletację</strong> i{" "}
          <strong className="font-medium text-slate-200">pakowanie</strong>, po sprzedaż i produkcję.
        </p>
      </div>

      <div className="relative z-10 mb-4 max-w-md rounded-2xl border border-white/10 border-t-white/20 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/20 p-2.5">
              <TrendingUp className="h-5 w-5 text-indigo-400" strokeWidth={2} />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-200">Aktywność magazynu</div>
              <div className="text-xs text-slate-500">Bieżąca zmiana</div>
            </div>
          </div>
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-sm font-semibold text-emerald-400">
            +18%
          </span>
        </div>

        <div className="space-y-4">
          <div>
            <div className="mb-2 flex justify-between text-xs">
              <span className="text-slate-400">Kompletacja zamówień</span>
              <span className="font-medium text-white">83%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800/60">
              <div className="h-full w-[83%] rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.45)]" />
            </div>
          </div>
          <div>
            <div className="mb-2 flex justify-between text-xs">
              <span className="text-slate-400">Rozlokowanie (putaway)</span>
              <span className="font-medium text-white">100%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800/60">
              <div className="h-full w-full rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.45)]" />
            </div>
          </div>
        </div>
      </div>

      <p className="relative z-10 text-xs font-medium uppercase tracking-widest text-slate-600">
        &copy; {new Date().getFullYear()} Sasist
      </p>
    </div>
  );
}
