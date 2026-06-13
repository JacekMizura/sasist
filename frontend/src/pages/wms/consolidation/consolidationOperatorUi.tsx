import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LayoutGrid, RefreshCw, TowerControl } from "lucide-react";

import type { ConsolidationControlTowerAlert } from "../../../api/wmsConsolidationApi";
import { WMS_ROUTES } from "../wmsRoutes";

/** Etykiety operacyjne — bez żargonu „konsolidacja / staging / control tower”. */
export const WMS_CONSOLIDATION_LABELS = {
  moduleTitle: "Kompletacja międzymagazynowa",
  moduleHint: "Zamówienia wymagające działania w magazynie docelowym",
  todoTitle: "Do zrobienia",
  emptyTodo: "Brak zamówień wymagających działania.",
  sectionStaging: "Rozkładanie na półki",
  sectionSupply: "Uzupełnienie / ściąganie towaru",
  sectionReadyToPack: "Gotowe do pakowania",
  sectionProblems: "Problemy i alerty",
  shelfPreview: "Podgląd półek",
  processMonitor: "Monitor procesu",
  stagingAction: "Rozłóż na półkę",
  continueStaging: "Kontynuuj rozkładanie",
  openOrder: "Otwórz zamówienie",
  goToPacking: "Przejdź do pakowania",
  backToTodo: "Wróć do listy zadań",
} as const;

export const consolidationOperatorPageClass = "flex h-full min-h-0 w-full flex-col bg-white";

export function ConsolidationOperatorPage({
  children,
  toolbar,
}: {
  children: ReactNode;
  toolbar?: ReactNode;
}) {
  return (
    <div className={consolidationOperatorPageClass}>
      {toolbar ? (
        <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 md:px-6">{toolbar}</div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5">{children}</div>
    </div>
  );
}

export function ConsolidationOperatorToolbar({
  onRefresh,
  refreshing,
  showShelfPreview = true,
  showMonitor = true,
}: {
  onRefresh?: () => void;
  refreshing?: boolean;
  showShelfPreview?: boolean;
  showMonitor?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-lg font-bold text-slate-900">{WMS_CONSOLIDATION_LABELS.todoTitle}</h1>
        <p className="text-sm text-slate-600">{WMS_CONSOLIDATION_LABELS.moduleHint}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {showShelfPreview ? (
          <Link
            to={WMS_ROUTES.consolidationRacks}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
          >
            <LayoutGrid className="h-4 w-4" />
            {WMS_CONSOLIDATION_LABELS.shelfPreview}
          </Link>
        ) : null}
        {showMonitor ? (
          <Link
            to={WMS_ROUTES.consolidationsControlTower}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-600 hover:bg-slate-50"
          >
            <TowerControl className="h-4 w-4" />
            {WMS_CONSOLIDATION_LABELS.processMonitor}
          </Link>
        ) : null}
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Odśwież
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ConsolidationRackLegend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-slate-600">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded border border-emerald-300 bg-emerald-50" /> Wolna
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded border border-sky-300 bg-sky-50" /> Rozkładanie
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded border border-orange-300 bg-orange-50" /> Gotowe do pakowania
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded border border-red-300 bg-red-50" /> Problem
      </span>
    </div>
  );
}

export function OperatorSection({
  title,
  count,
  emptyText = "Brak pozycji w tej kolejce.",
  children,
}: {
  title: string;
  count?: number;
  emptyText?: string;
  children: ReactNode;
}) {
  const hasChildren = count == null ? true : count > 0;
  return (
    <section className="border-b border-slate-100 pb-5 last:border-0 last:pb-0">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">
        {title}
        {count != null ? <span className="ml-2 tabular-nums text-slate-500">({count})</span> : null}
      </h2>
      {!hasChildren ? <p className="mt-3 text-sm text-slate-500">{emptyText}</p> : <div className="mt-3 space-y-2">{children}</div>}
    </section>
  );
}

export function OperatorTaskRow({
  orderNumber,
  meta,
  action,
  href,
}: {
  orderNumber: string;
  meta: ReactNode;
  action?: ReactNode;
  href?: string;
}) {
  const body = (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-300 hover:shadow-sm">
      <div className="min-w-0">
        <div className="text-base font-bold text-slate-900">#{orderNumber}</div>
        <div className="mt-0.5 text-sm text-slate-600">{meta}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {action}
        {href ? <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden /> : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link to={href} className="block no-underline">
        {body}
      </Link>
    );
  }
  return body;
}

export function OperatorPrimaryButton({
  children,
  onClick,
  disabled,
  href,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  href?: string;
}) {
  const cls =
    "inline-flex h-9 items-center justify-center rounded-lg bg-sky-700 px-3 text-[13px] font-semibold text-white hover:bg-sky-800 disabled:opacity-60";
  if (href) {
    return (
      <Link to={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

export function OperatorAlertBadge({ alert }: { alert: ConsolidationControlTowerAlert }) {
  const tone =
    alert.severity.toUpperCase() === "CRITICAL"
      ? "border-red-200 bg-red-50 text-red-900"
      : alert.severity.toUpperCase() === "WARNING"
        ? "border-amber-200 bg-amber-50 text-amber-950"
        : "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${tone}`}>
      {alert.label}
    </span>
  );
}
