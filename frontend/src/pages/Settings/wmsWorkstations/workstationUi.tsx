import { Link } from "react-router-dom";
import type { ReactNode } from "react";

import { STATION_TYPE_STYLE } from "../../../types/wmsWorkstations";
import { cnParts, wmsSettingsTokens } from "../wmsSettingsTokens";
import { brandOutlineButtonClass, brandPrimaryButtonClass } from "../../../design-system/brandUi";
import { pageShellEmptyStateClass } from "../../../design-system";

export const wsTokens = {
  stack: wmsSettingsTokens.mainStack,
  intro: "text-sm text-slate-600",
  sectionLabel: "text-xs font-semibold uppercase tracking-wide text-slate-500",
  card: wmsSettingsTokens.card,
  cardInner: wmsSettingsTokens.cardInner,
  cardTitle: wmsSettingsTokens.cardTitle,
  cardDescription: wmsSettingsTokens.cardDescription,
  fieldLabel: "block text-sm font-medium text-slate-700",
  input: wmsSettingsTokens.input.replace("max-w-md ", "w-full "),
  select: wmsSettingsTokens.select.replace("max-w-md ", "w-full "),
  actions: "flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4",
  mutedBtn:
    "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50",
  dangerBtn:
    "inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50",
  primaryBtn: brandPrimaryButtonClass,
  outlineBtn: brandOutlineButtonClass,
  settingsRow:
    "flex flex-col gap-3 border-b border-slate-100 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between",
  listRow:
    "grid gap-3 border-b border-slate-100 px-1 py-4 last:border-b-0 hover:bg-slate-50/70 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_auto] sm:items-center",
} as const;

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
      <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Połączono
      </span>
    );
  }
  if (status === "offline") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-amber-700">
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        Offline
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
      <span className="h-2 w-2 rounded-full bg-slate-300" />
      Nie połączono
    </span>
  );
}

export function WsStatusBadge({
  tone,
  children,
}: {
  tone: "success" | "neutral" | "warning" | "danger";
  children: ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : tone === "warning"
        ? "bg-amber-50 text-amber-900 ring-amber-200"
        : tone === "danger"
          ? "bg-red-50 text-red-800 ring-red-200"
          : "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span
      className={cnParts(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        toneClass,
      )}
    >
      {children}
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

/** Full-width card — same tokens as WmsSettingsSection / Produkcja. */
export function WorkstationCard({
  title,
  description,
  children,
}: {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={wmsSettingsTokens.card}>
      {title ? (
        <div className="mb-4">
          <h3 className={wmsSettingsTokens.cardTitle}>{title}</h3>
          {description ? <p className={wmsSettingsTokens.cardDescription}>{description}</p> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** Full-width tab body — same rhythm as other WMS settings panels. */
export function WorkstationTabShell({
  intro,
  children,
  actions,
}: {
  intro?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={cnParts("w-full min-w-0", wsTokens.stack)}>
      {intro ? <p className={wsTokens.intro}>{intro}</p> : null}
      {children}
      {actions ? <div className={wsTokens.actions}>{actions}</div> : null}
    </div>
  );
}

export function WorkstationDescList({
  rows,
}: {
  rows: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => (
        <div key={row.label} className={wmsSettingsTokens.cardInner}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{row.label}</dt>
          <dd className="mt-1 text-sm font-medium text-slate-900">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const DEVICE_KIND_ICON: Record<string, string> = {
  printer: "🖨",
  scanner: "📠",
  scale: "⚖",
  camera: "📷",
  rfid: "📶",
  barcode_reader: "▮▮",
  barcode: "▮▮",
  other: "🔌",
};

export function DeviceCard({
  name,
  detail,
  status,
  lastSeenAt,
  deviceKind,
}: {
  name: string;
  detail?: string | null;
  status: string;
  lastSeenAt: string | null;
  deviceKind?: string;
}) {
  const icon = DEVICE_KIND_ICON[(deviceKind || "other").toLowerCase()] ?? DEVICE_KIND_ICON.other;
  const online = status === "online";
  return (
    <article className={wmsSettingsTokens.cardInner}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none" aria-hidden>
              {icon}
            </span>
            <h4 className="truncate text-sm font-semibold text-slate-900">{name}</h4>
          </div>
          {detail ? <p className="mt-1 truncate text-xs text-slate-500">{detail}</p> : null}
        </div>
        <WsStatusBadge tone={online ? "success" : "neutral"}>
          <span className={cnParts("h-1.5 w-1.5 rounded-full", online ? "bg-emerald-500" : "bg-slate-400")} />
          {online ? "Online" : "Offline"}
        </WsStatusBadge>
      </div>
      <p className="mt-3 text-xs text-slate-500">sync {formatRelativePl(lastSeenAt)}</p>
    </article>
  );
}

export function WorkstationEmptyState({
  title,
  description,
  action,
  compact,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-3 py-3 text-sm text-slate-500">
        <span className="font-medium text-slate-700">{title}</span>
        {description ? <span className="mt-0.5 block text-xs">{description}</span> : null}
      </div>
    );
  }
  return (
    <div className={cnParts(pageShellEmptyStateClass, "text-center")}>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description ? <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">{description}</p> : null}
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
        <button type="button" className="mt-3 text-sm font-medium text-orange-700 hover:text-orange-800" onClick={onRetry}>
          Spróbuj ponownie
        </button>
      ) : null}
    </div>
  );
}

/** @deprecated Prefer PageHeader breadcrumbs via WmsSettingsChrome */
export function WorkstationsBreadcrumb({ current }: { current?: string }) {
  return (
    <nav className="text-sm text-slate-500" aria-label="Okruszki">
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
