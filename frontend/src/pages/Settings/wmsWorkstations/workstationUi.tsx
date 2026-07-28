import { Link } from "react-router-dom";
import type { ReactNode } from "react";

import { STATION_TYPE_STYLE } from "../../../types/wmsWorkstations";

export function StationTypeBadge({
  stationType,
  label,
}: {
  stationType: string;
  label: string;
}) {
  const style = STATION_TYPE_STYLE[stationType] ?? STATION_TYPE_STYLE.other;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style.className}`}
    >
      <span aria-hidden>{style.emoji}</span>
      {label}
    </span>
  );
}

export function ConnectionDot({ status }: { status: string }) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-700">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Połączono
      </span>
    );
  }
  if (status === "offline") {
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-700">
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        Offline
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-slate-500">
      <span className="h-2 w-2 rounded-full bg-slate-300" />
      Nie połączono
    </span>
  );
}

export function formatRelativePl(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "przed chwilą";
  if (sec < 3600) return `${Math.floor(sec / 60)} min temu`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} godz. temu`;
  return d.toLocaleString("pl-PL");
}

export function formatUptime(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} godz. ${m} min`;
  if (m > 0) return `${m} min`;
  return "poniżej minuty";
}

export function WorkstationEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">{description}</p> : null}
      {action ? <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function WorkstationErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-xl border border-red-100 bg-red-50/60 px-5 py-6">
      <p className="text-sm font-medium text-red-800">{message}</p>
      {onRetry ? (
        <button
          type="button"
          className="mt-3 text-sm font-medium text-orange-700 hover:text-orange-800"
          onClick={onRetry}
        >
          Spróbuj ponownie
        </button>
      ) : null}
    </div>
  );
}

export function WorkstationsBreadcrumb({ current }: { current?: string }) {
  return (
    <nav className="text-sm text-slate-500">
      <Link to="/settings/wms" className="hover:text-orange-600">
        Ustawienia WMS
      </Link>
      <span className="mx-1.5">›</span>
      {current ? (
        <>
          <Link to="/settings/wms/workstations" className="hover:text-orange-600">
            Stanowiska
          </Link>
          <span className="mx-1.5">›</span>
          <span className="text-slate-800">{current}</span>
        </>
      ) : (
        <span className="text-slate-800">Stanowiska</span>
      )}
    </nav>
  );
}
