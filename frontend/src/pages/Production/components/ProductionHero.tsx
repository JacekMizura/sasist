import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Factory,
  Plus,
  TrendingUp,
  Users,
} from "lucide-react";
import type { ProductionDashboardRead } from "../../../api/productionApi";
import { PIPELINE_STAGES } from "../productionTheme";
import { wmsProductionPaths } from "../productionPaths";
import { OperatorAvatar } from "./OperatorAvatar";

type Props = {
  data: ProductionDashboardRead | null;
  warehouseName?: string;
  loading?: boolean;
  onCreateBatch: () => void;
};

function KpiPill({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur-sm">
      <p className="text-[10px] font-bold uppercase tracking-wider text-violet-200">{label}</p>
      <p className={`mt-0.5 text-2xl font-bold tabular-nums text-white`}>
        {loadingValue(value)}
        {suffix ? <span className="ml-0.5 text-base font-semibold text-violet-100">{suffix}</span> : null}
      </p>
      <p className={`mt-0.5 text-[10px] ${tone}`}>&nbsp;</p>
    </div>
  );
}

function loadingValue(v: number | string) {
  return v;
}

export function ProductionHero({ data, warehouseName, loading, onCreateBatch }: Props) {
  const shortages = data?.batches_with_shortages ?? 0;
  const operators = data?.active_operators ?? [];

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-950 via-violet-900 to-indigo-950 text-white shadow-xl shadow-violet-900/20">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(167,139,250,0.35) 0%, transparent 45%), radial-gradient(circle at 80% 60%, rgba(99,102,241,0.25) 0%, transparent 40%)",
        }}
        aria-hidden
      />
      <div className="relative p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-xl">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-violet-200 ring-1 ring-white/10">
              <Factory className="h-3.5 w-3.5" aria-hidden />
              Centrum dowodzenia produkcji
            </p>
            <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
              {warehouseName ? `Produkcja · ${warehouseName}` : "Pulpit operacyjny"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-violet-100/90">
              Planuj partie masowe, monitoruj kolejki operatorów, reaguj na braki materiałów i śledź postęp
              zbierania → wykonania → rozlokowania.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onCreateBatch}
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-sm font-bold text-violet-900 shadow-lg shadow-black/20 transition hover:bg-violet-50"
              >
                <Plus className="h-5 w-5" aria-hidden />
                Nowa partia produkcyjna
              </button>
              <Link
                to={wmsProductionPaths.collecting()}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/25 px-5 py-3.5 text-sm font-semibold text-white hover:bg-white/10"
              >
                Kolejka zbierania
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>

          <div className="grid min-w-[280px] flex-1 grid-cols-2 gap-2 sm:max-w-md">
            <KpiPill label="Zaplanowane" value={loading ? "—" : (data?.planned_batches ?? 0)} tone="" />
            <KpiPill label="Aktywne" value={loading ? "—" : (data?.active_batches ?? 0)} tone="" />
            <KpiPill label="Braki" value={loading ? "—" : shortages} tone="" />
            <KpiPill
              label="Efektywność"
              value={loading ? "—" : (data?.production_efficiency_percent ?? 0)}
              suffix="%"
              tone=""
            />
          </div>
        </div>

        {shortages > 0 && !loading ? (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/15 px-4 py-3 text-sm text-amber-50">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden />
            <div>
              <p className="font-semibold">{shortages} partii wymaga uwagi — braki materiałów</p>
              <p className="mt-0.5 text-xs text-amber-100/90">
                Sprawdź sekcję „Oczekuje na materiały” i uzupełnij stany lub zmień plan produkcji.
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-white/10 pt-5">
          <div className="flex flex-wrap gap-2">
            {PIPELINE_STAGES.map((stage, idx) => {
              const count =
                stage.key === "collecting"
                  ? data?.collecting_batches ?? 0
                  : stage.key === "execute"
                    ? data?.in_production_batches ?? 0
                    : data?.putaway_batches ?? 0;
              const Icon = stage.icon;
              return (
                <div key={stage.key} className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${stage.tone}`}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {stage.label}
                    <span className="rounded-md bg-white/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-800">
                      {loading ? "…" : count}
                    </span>
                  </span>
                  {idx < PIPELINE_STAGES.length - 1 ? (
                    <ArrowRight className="hidden h-4 w-4 text-violet-300 sm:block" aria-hidden />
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Users className="h-4 w-4 text-violet-300" aria-hidden />
            <span className="text-xs font-medium text-violet-200">Operatorzy aktywni:</span>
            {loading ? (
              <span className="text-xs text-violet-300">…</span>
            ) : operators.length === 0 ? (
              <span className="text-xs text-violet-300/80">Brak aktywnych</span>
            ) : (
              <div className="flex -space-x-2">
                {operators.slice(0, 5).map((op) => (
                  <OperatorAvatar key={op} name={op} size="sm" />
                ))}
              </div>
            )}
            {!loading && (data?.finished_today ?? 0) > 0 ? (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-100">
                <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                {data?.finished_today} dziś
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
