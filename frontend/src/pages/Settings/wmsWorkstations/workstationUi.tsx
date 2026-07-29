import { Link } from "react-router-dom";
import type { ReactNode } from "react";

import { brandOutlineButtonClass, brandPrimaryButtonClass } from "../../../design-system/brandUi";
import { STATION_TYPE_STYLE } from "../../../types/wmsWorkstations";
import { cnParts, wmsSettingsTokens } from "../wmsSettingsTokens";

/** Shared Stanowiska module chrome — one layout for every detail tab. */
export const wsTokens = {
  /** Content column shared by all tabs */
  content: "mx-auto w-full max-w-3xl",
  stack: "space-y-5",
  intro: "text-sm text-slate-600",
  sectionLabel: "text-xs font-semibold uppercase tracking-wide text-slate-500",
  card: wmsSettingsTokens.card,
  cardTight: "rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm",
  cardTitle: wmsSettingsTokens.cardTitle,
  cardDescription: wmsSettingsTokens.cardDescription,
  fieldLabel: "block text-sm font-medium text-slate-700",
  input: wmsSettingsTokens.input.replace("max-w-md ", ""),
  select: wmsSettingsTokens.select.replace("max-w-md ", ""),
  actions: "flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4",
  mutedBtn:
    "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50",
  dangerBtn:
    "inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50",
  primaryBtn: brandPrimaryButtonClass,
  outlineBtn: brandOutlineButtonClass,
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

/** Config / online / warning badges used across Agent + Printers tabs. */
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
    <div className={cnParts(wsTokens.content, wsTokens.stack)}>
      {intro ? <div className={wsTokens.intro}>{intro}</div> : null}
      {children}
      {actions ? <div className={wsTokens.actions}>{actions}</div> : null}
    </div>
  );
}

export function WorkstationCard({
  title,
  description,
  children,
  footer,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cnParts(wsTokens.card, className)}>
      {title || description ? (
        <header className={children || footer ? "mb-4" : undefined}>
          {title ? <h3 className={wsTokens.cardTitle}>{title}</h3> : null}
          {description ? <p className={wsTokens.cardDescription}>{description}</p> : null}
        </header>
      ) : null}
      {children}
      {footer ? <div className={cnParts(wsTokens.actions, "mt-4")}>{footer}</div> : null}
    </section>
  );
}

export function WorkstationDescList({
  rows,
}: {
  rows: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5">
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
    <article className={wsTokens.cardTight}>
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
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cnParts(wsTokens.card, "border-dashed bg-slate-50/80 px-6 py-10 text-center shadow-none")}>
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
        <button type="button" className="mt-3 text-sm font-medium text-orange-700 hover:text-orange-800" onClick={onRetry}>
          Spróbuj ponownie
        </button>
      ) : null}
    </div>
  );
}

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
