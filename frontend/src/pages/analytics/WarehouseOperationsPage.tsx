import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, Download, RefreshCw, Settings2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  createReplenishmentRelocationTask,
  createWarehousePriorityTask,
  downloadWarehouseOperationsExport,
  getWarehouseOperationsSnapshot,
  listWarehousePriorityTasks,
  type WarehouseOperationsAlert,
  type WarehouseOperationsMainMode,
  type WarehouseOperationsQueue,
  type WarehouseOperationsSnapshot,
  type WarehouseOperatorCard,
  type WarehousePriorityTask,
} from "../../api/warehouseOperationsApi";
import PageContainer from "../../components/layout/PageLayout";
import { PageHeader } from "../../components/layout/PageHeader";
import { useWarehouse } from "../../context/WarehouseContext";
import {
  formatOperationalDuration,
  formatOperationalDurationSince,
  formatOperationalDurationText,
} from "../../utils/formatOperationalDuration";

const DEFAULT_TENANT_ID = 1;
const CONFIG_STORAGE_KEY = "analytics.warehouseOperations.thresholds";

type ThresholdConfig = {
  shortBreakMinutes: number;
  longBreakMinutes: number;
};

type DispatchDraft = {
  alert: WarehouseOperationsAlert;
  action: WarehouseOperationsAlert["actions"][number];
  assignedOperatorId: string;
  priority: "critical" | "high" | "normal";
  deadlineMinutes: string;
  comment: string;
};

type OperationsTabId =
  | "live"
  | "operators"
  | "queues"
  | "picking"
  | "packing"
  | "warehouse-operations"
  | "replenishments"
  | "inbound"
  | "putaway-load"
  | "carrier-issues"
  | "ranking"
  | "bottlenecks"
  | "alerts"
  | "manager-tasks"
  | "history";

const OPERATIONS_TABS: Array<{ id: OperationsTabId; label: string }> = [
  { id: "live", label: "Live" },
  { id: "operators", label: "Operatorzy" },
  { id: "queues", label: "Kolejki" },
  { id: "picking", label: "Kompletacja" },
  { id: "packing", label: "Pakowanie" },
  { id: "warehouse-operations", label: "Operacje magazynowe" },
  { id: "replenishments", label: "Uzupełnienia" },
  { id: "inbound", label: "Dostawy" },
  { id: "putaway-load", label: "Obciążenie magazynu" },
  { id: "carrier-issues", label: "Problemy przewoźników" },
  { id: "ranking", label: "Ranking" },
  { id: "bottlenecks", label: "Wąskie gardła" },
  { id: "alerts", label: "Alerty" },
  { id: "manager-tasks", label: "Zadania kierownika" },
  { id: "history", label: "Historia" },
];

const MAIN_MODE_TONES: Record<WarehouseOperationsMainMode, string> = {
  KOMPLETACJA: "bg-blue-50 text-blue-700 border-blue-200",
  PAKOWANIE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "OPERACJE MAGAZYNOWE": "bg-slate-100 text-slate-700 border-slate-200",
  BRAKI: "bg-amber-50 text-amber-800 border-amber-200",
};

const STATUS_DOT: Record<WarehouseOperatorCard["status_color"], string> = {
  green: "bg-emerald-500 shadow-emerald-500/40",
  gray: "bg-slate-400 shadow-slate-400/30",
  red: "bg-red-500 shadow-red-500/40",
};

function loadThresholdConfig(): ThresholdConfig {
  try {
    const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return { shortBreakMinutes: 5, longBreakMinutes: 10 };
    const parsed = JSON.parse(raw) as Partial<ThresholdConfig>;
    const shortBreakMinutes = Math.max(1, Number(parsed.shortBreakMinutes) || 5);
    const longBreakMinutes = Math.max(shortBreakMinutes + 1, Number(parsed.longBreakMinutes) || 10);
    return { shortBreakMinutes, longBreakMinutes };
  } catch {
    return { shortBreakMinutes: 5, longBreakMinutes: 10 };
  }
}

function saveThresholdConfig(config: ThresholdConfig) {
  window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
}

function formatDateTimeLocal(date: Date): string {
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function quantityLabel(value: number | null | undefined): string {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

function ProgressBar({ value, tone = "blue" }: { value: number | null | undefined; tone?: "blue" | "green" | "amber" | "red" }) {
  if (value == null) return <div className="h-2 rounded-full bg-slate-100" />;
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  const fill = tone === "green" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : tone === "red" ? "bg-red-500" : "bg-blue-500";
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${safe}%` }} />
    </div>
  );
}

function StatusPill({ operator }: { operator: WarehouseOperatorCard }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
      <span className={`h-2 w-2 rounded-full shadow ${STATUS_DOT[operator.status_color]}`} />
      {operator.activity_status_label}
    </span>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: ReactNode; tone: string }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${tone}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-75">{label}</div>
      <div className="mt-0.5 text-2xl font-black leading-none">{value}</div>
    </div>
  );
}

function OperationsTabs({
  active,
  onChange,
}: {
  active: OperationsTabId;
  onChange: (tab: OperationsTabId) => void;
}) {
  return (
    <nav
      aria-label="Centrum operacyjne — sekcje"
      className="flex w-full gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-sm [-webkit-overflow-scrolling:touch]"
    >
      {OPERATIONS_TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-bold transition-colors ${
              isActive ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

function OperatorCard({ operator, onOpen }: { operator: WarehouseOperatorCard; onOpen: () => void }) {
  const progress =
    operator.main_mode === "PAKOWANIE" ? operator.packing_progress_percent : operator.progress_percent;
  const referenceLabel = operator.active_reference_label || operator.document || operator.assigned_order || operator.cart_code;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-900 text-xs font-black text-white">
              {operator.initials}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-black text-slate-900">{operator.user_name}</div>
              <div className={`mt-0.5 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black ${MAIN_MODE_TONES[operator.main_mode]}`}>
                {operator.main_mode}
              </div>
            </div>
          </div>
        </div>
        <StatusPill operator={operator} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Tryb</div>
          <div className="truncate font-semibold text-slate-800">{operator.submode}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">
            {operator.main_mode === "OPERACJE MAGAZYNOWE" ? "Dokument" : "Zamówienie / wózek"}
          </div>
          <div className="truncate font-semibold text-slate-800">
            {referenceLabel || "—"}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-500">
          <span>Postęp</span>
          <span>{progress == null ? "—" : `${Math.round(progress)}%`}</span>
        </div>
        <ProgressBar value={progress} tone={operator.progress_tone} />
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-slate-50 px-2 py-1.5">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Produkty</div>
            <div className="font-black text-slate-800">
              {quantityLabel(operator.products_completed)} / {quantityLabel(operator.products_total)}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 px-2 py-1.5">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Zamówienia</div>
            <div className="font-black text-slate-800">
              {operator.orders_completed} / {operator.orders_total}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Ostatnia lokalizacja</div>
          <div className="truncate font-semibold text-slate-800">{operator.current_location || "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Ostatnia aktywność</div>
          <div className="font-semibold text-slate-800">
            {operator.last_activity_label} · {formatOperationalDuration(operator.minutes_since_activity)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
        <span>Idle: {formatOperationalDuration(operator.idle.total_idle_minutes)}</span>
        <span>
          krótkie {operator.idle.short_idle_periods} · długie {operator.idle.long_idle_periods}
        </span>
      </div>
    </button>
  );
}

function QueueCard({ queue }: { queue: WarehouseOperationsQueue }) {
  const tones: Record<WarehouseOperationsQueue["tone"], string> = {
    neutral: "border-slate-200 bg-white text-slate-800",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  return (
    <div className={`rounded-xl border p-3 ${tones[queue.tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black">{queue.label}</div>
          {queue.detail ? <div className="mt-1 text-xs opacity-75">{queue.detail}</div> : null}
        </div>
        <div className="text-3xl font-black leading-none">{queue.value}</div>
      </div>
    </div>
  );
}

function AlertCard({
  alert,
  onAction,
  featured = false,
}: {
  alert: WarehouseOperationsAlert;
  onAction: (action: WarehouseOperationsAlert["actions"][number]) => void;
  featured?: boolean;
}) {
  const tone =
    alert.level === "critical"
      ? "border-slate-200 border-l-red-500 bg-white text-slate-950"
      : alert.level === "warning"
        ? "border-slate-200 border-l-amber-400 bg-white text-slate-950"
        : "border-slate-200 border-l-blue-400 bg-white text-slate-950";
  const iconTone = alert.level === "critical" ? "text-red-600" : alert.level === "warning" ? "text-amber-600" : "text-blue-600";
  const actionTone: Record<WarehouseOperationsAlert["actions"][number]["tone"], string> = {
    primary: "bg-slate-900 text-white hover:bg-slate-700",
    secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    warning: "bg-amber-600 text-white hover:bg-amber-500",
    danger: "bg-red-600 text-white hover:bg-red-500",
  };
  return (
    <article className={`rounded-2xl border border-l-4 ${featured ? "p-4 shadow-sm" : "p-3"} ${tone}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${iconTone}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className={`${featured ? "text-base" : "text-sm"} font-black`}>
                {formatOperationalDurationText(alert.title || alert.message)}
              </div>
              <div className="mt-1 text-xs font-semibold opacity-75">
                {alert.severity_label || alert.level} · {alert.category}
              </div>
            </div>
            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-black ring-1 ring-slate-200">
              {alert.resolution_status === "open" ? "Otwarte" : alert.resolution_status}
            </span>
          </div>

          {alert.description ? <p className="mt-2 text-sm font-semibold opacity-85">{formatOperationalDurationText(alert.description)}</p> : null}
          {alert.prediction_label ? (
            <div className="mt-2 rounded-lg bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-100">
              Prognoza: {formatOperationalDurationText(alert.prediction_label)}
            </div>
          ) : null}

          {alert.impact.length ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {alert.impact.map((item, idx) => (
                <div key={`${item.label}-${idx}`} className="rounded-lg bg-slate-50 px-2 py-1.5 ring-1 ring-slate-100">
                  <div className="text-[10px] font-bold uppercase tracking-wide opacity-60">{item.label}</div>
                  <div className="text-sm font-black">{formatOperationalDurationText(item.value)}</div>
                  {item.detail ? <div className="text-[11px] opacity-70">{formatOperationalDurationText(item.detail)}</div> : null}
                </div>
              ))}
            </div>
          ) : null}

          {alert.context.length || alert.responsible_area || alert.responsible_operator ? (
            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-bold">
              {alert.responsible_area ? <span className="rounded-full bg-slate-50 px-2 py-0.5 ring-1 ring-slate-100">Odpowiedzialny: {alert.responsible_area}</span> : null}
              {alert.responsible_operator ? <span className="rounded-full bg-slate-50 px-2 py-0.5 ring-1 ring-slate-100">Operator: {alert.responsible_operator}</span> : null}
              {alert.context.map((item, idx) => (
                <span key={`${item.label}-${idx}`} className="rounded-full bg-slate-50 px-2 py-0.5 ring-1 ring-slate-100">
                  {item.label}: {formatOperationalDurationText(item.value)}
                </span>
              ))}
            </div>
          ) : null}

          {alert.recommended_action ? (
            <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs font-semibold text-slate-700">
              Zalecenie: {formatOperationalDurationText(alert.recommended_action)}
            </div>
          ) : null}

          {alert.actions.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {alert.actions.map((action, idx) => (
                <button
                  key={`${action.label}-${idx}`}
                  type="button"
                  onClick={() => onAction(action)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${actionTone[action.tone]}`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-2 text-[11px] opacity-60">
            {alert.minutes_ago > 0 ? `${formatOperationalDuration(alert.minutes_ago)} temu` : "teraz"}
          </div>
        </div>
      </div>
    </article>
  );
}

function DispatchTaskModal({
  draft,
  operators,
  submitting,
  onChange,
  onClose,
  onConfirm,
}: {
  draft: DispatchDraft;
  operators: WarehouseOperatorCard[];
  submitting: boolean;
  onChange: (next: DispatchDraft) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const payload = draft.action.payload || {};
  const title = String(payload["title"] || draft.alert.title || draft.alert.message || "Zadanie kierownika");
  const description = String(payload["description"] || draft.alert.recommended_action || draft.alert.description || "");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4">
          <div>
            <div className="text-xs font-black uppercase tracking-wide text-orange-600">Dyspozycja kierownika</div>
            <h2 className="mt-1 text-lg font-black text-slate-900">{title}</h2>
            {description ? <p className="mt-1 text-sm font-semibold text-slate-600">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <label className="block text-xs font-bold text-slate-600">
            Operator
            <select
              value={draft.assignedOperatorId}
              onChange={(e) => onChange({ ...draft, assignedOperatorId: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Nieprzypisane / najbliższy dostępny</option>
              {operators.map((op) => (
                <option key={`${op.main_mode}-${op.user_id}`} value={op.user_id}>
                  {op.user_name} · {op.main_mode}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-slate-600">
              Priorytet
              <select
                value={draft.priority}
                onChange={(e) => onChange({ ...draft, priority: e.target.value as DispatchDraft["priority"] })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="critical">Krytyczny</option>
                <option value="high">Wysoki</option>
                <option value="normal">Normalny</option>
              </select>
            </label>
            <label className="block text-xs font-bold text-slate-600">
              Deadline za
              <select
                value={draft.deadlineMinutes}
                onChange={(e) => onChange({ ...draft, deadlineMinutes: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="10">10 min</option>
                <option value="20">20 min</option>
                <option value="30">30 min</option>
                <option value="60">60 min</option>
              </select>
            </label>
          </div>
          <label className="block text-xs font-bold text-slate-600">
            Komentarz dla operatora
            <textarea
              value={draft.comment}
              onChange={(e) => onChange({ ...draft, comment: e.target.value })}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="np. Przenieś z rezerwy do A10-A-2 natychmiast"
            />
          </label>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            Po zatwierdzeniu powstanie realne zadanie WMS ze statusem <b>NOWE</b>, widoczne w terminalu operatora jako „Zadanie kierownika”.
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700">
            Anuluj
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {submitting ? "Tworzenie…" : "Utwórz zadanie"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OperatorModeSection({
  mode,
  operators,
  onOpen,
  recentEnded,
}: {
  mode: WarehouseOperationsMainMode;
  operators: WarehouseOperatorCard[];
  onOpen: (operator: WarehouseOperatorCard) => void;
  recentEnded?: WarehouseOperatorCard | null;
}) {
  const emptyLabel: Record<WarehouseOperationsMainMode, string> = {
    KOMPLETACJA: "Brak aktywnych operatorów kompletacji.",
    PAKOWANIE: "Brak aktywnych operatorów pakowania.",
    "OPERACJE MAGAZYNOWE": "Brak aktywnych operatorów operacji magazynowych.",
    BRAKI: "Brak aktywnych operatorów obsługi braków.",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${MAIN_MODE_TONES[mode]}`}>{mode}</span>
        <span className="text-xs font-bold text-slate-500">{operators.length}</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
        {operators.length ? (
          operators.map((op) => <OperatorCard key={op.user_id} operator={op} onOpen={() => onOpen(op)} />)
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-400">
            <div className="font-semibold text-slate-500">{emptyLabel[mode]}</div>
            {recentEnded ? (
              <div className="mt-1 text-xs">
                Ostatnio: {recentEnded.user_name}, {recentEnded.last_activity_label} ({formatOperationalDuration(recentEnded.minutes_since_activity)} temu)
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailModal({
  operator,
  onClose,
  onOpenProgress,
}: {
  operator: WarehouseOperatorCard;
  onClose: () => void;
  onOpenProgress: (row: WarehouseOperatorCard["order_progress"][number]) => void;
}) {
  const progress =
    operator.main_mode === "PAKOWANIE" ? operator.packing_progress_percent : operator.progress_percent;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-sm font-black text-white">
                {operator.initials}
              </span>
              <div>
                <h2 className="text-lg font-black text-slate-900">{operator.user_name}</h2>
                <div className="mt-1 flex flex-wrap gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${MAIN_MODE_TONES[operator.main_mode]}`}>
                    {operator.main_mode}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                    {operator.submode}
                  </span>
                  <StatusPill operator={operator} />
                </div>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid max-h-[74vh] gap-4 overflow-y-auto p-4 lg:grid-cols-[1fr_1.1fr]">
          <section className="space-y-3">
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between text-sm font-bold text-slate-800">
                <span>Aktualne zadanie</span>
                <span>{progress == null ? "—" : `${Math.round(progress)}%`}</span>
              </div>
              <ProgressBar value={progress} tone={operator.progress_tone} />
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-slate-400">Aktywny kontekst</div>
                  <div className="font-bold text-slate-800">{operator.active_reference_label || "—"}</div>
                </div>
                <div>
                  <div className="text-slate-400">Wózek</div>
                  <div className="font-bold text-slate-800">{operator.cart_code || "—"}</div>
                </div>
                <div>
                  <div className="text-slate-400">Dokument</div>
                  <div className="font-bold text-slate-800">{operator.document || "—"}</div>
                </div>
                <div>
                  <div className="text-slate-400">Ostatnia lokalizacja</div>
                  <div className="font-bold text-slate-800">{operator.current_location || "—"}</div>
                </div>
                <div>
                  <div className="text-slate-400">Pierwsza aktywność</div>
                  <div className="font-bold text-slate-800">
                    {operator.first_activity_at ? new Date(operator.first_activity_at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }) : "—"}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-sm font-black text-slate-900">Idle analytics</div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 p-2">
                  <div className="text-lg font-black text-slate-900">{formatOperationalDuration(operator.idle.total_idle_minutes)}</div>
                  <div className="text-[10px] uppercase text-slate-400">łącznie</div>
                </div>
                <div className="rounded-lg bg-amber-50 p-2">
                  <div className="text-lg font-black text-amber-900">{operator.idle.short_idle_periods}</div>
                  <div className="text-[10px] uppercase text-amber-700">krótkie</div>
                </div>
                <div className="rounded-lg bg-red-50 p-2">
                  <div className="text-lg font-black text-red-900">{operator.idle.long_idle_periods}</div>
                  <div className="text-[10px] uppercase text-red-700">długie</div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-sm font-black text-slate-900">Zamówienia / postęp</div>
              <div className="mt-3 space-y-2">
                {operator.order_progress.length ? (
                  operator.order_progress.map((row) => {
                    const rowTone =
                      row.status === "completed"
                        ? "border-emerald-200 bg-emerald-50"
                        : row.status === "blocked"
                          ? "border-red-200 bg-red-50"
                          : row.status === "inactive"
                            ? "border-amber-200 bg-amber-50"
                            : "border-slate-200 bg-slate-50 hover:border-blue-200 hover:bg-blue-50";
                    return (
                      <button
                        key={`${row.order_id ?? row.order_number}-${row.last_activity_at ?? ""}`}
                        type="button"
                        onClick={() => onOpenProgress(row)}
                        disabled={!row.navigation_path}
                        className={`w-full rounded-lg border p-2 text-left transition ${rowTone} ${row.navigation_path ? "cursor-pointer hover:shadow-sm" : "cursor-default"}`}
                      >
                        <div className="grid gap-2 text-xs font-bold text-slate-700 sm:grid-cols-[1fr_4rem_6rem_5rem_4rem]">
                          <span className="truncate text-slate-900">{row.order_number}</span>
                          <span>{row.progress_percent}%</span>
                          <span>
                            {quantityLabel(row.products_completed || row.picked_products)} / {quantityLabel(row.products_total || row.total_products)}
                          </span>
                          <span>{row.status_label}</span>
                          <span>{row.last_activity_label || "—"}</span>
                        </div>
                        <div className="mt-2">
                          <ProgressBar value={row.progress_percent} tone={row.progress_tone} />
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="text-sm text-slate-500">Brak przypisanych zamówień w bieżącym oknie.</div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 p-3">
            <div className="text-sm font-black text-slate-900">Timeline aktywności</div>
            <div className="mt-3 space-y-2">
              {operator.timeline.map((item, idx) => (
                <div key={`${item.at}-${idx}`} className="grid grid-cols-[3rem_1fr] gap-3 rounded-lg bg-slate-50 p-2">
                  <div className="text-xs font-black text-slate-500">{item.time_label}</div>
                  <div>
                    <div className="text-sm font-bold text-slate-800">{item.title}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {item.main_mode} · {item.submode}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function WarehouseOperationsPage() {
  const navigate = useNavigate();
  const { warehouse: activeWarehouse, showWarehouseSelector } = useWarehouse();
  const warehouseId = activeWarehouse?.id ?? null;
  const [config, setConfig] = useState<ThresholdConfig>(() => loadThresholdConfig());
  const [draftConfig, setDraftConfig] = useState<ThresholdConfig>(() => loadThresholdConfig());
  const [snapshot, setSnapshot] = useState<WarehouseOperationsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOperator, setSelectedOperator] = useState<WarehouseOperatorCard | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [activeTab, setActiveTab] = useState<OperationsTabId>("live");
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const [exportMode, setExportMode] = useState<WarehouseOperationsMainMode | "">("");
  const [exportOperatorId, setExportOperatorId] = useState("");
  const [exportZone, setExportZone] = useState("");
  const [replenishmentPriority, setReplenishmentPriority] = useState("");
  const [replenishmentZone, setReplenishmentZone] = useState("");
  const [replenishmentOperator, setReplenishmentOperator] = useState("");
  const [replenishmentCategory, setReplenishmentCategory] = useState("");
  const [creatingRelocationFor, setCreatingRelocationFor] = useState<number | null>(null);
  const [expandedAlertGroups, setExpandedAlertGroups] = useState<Record<string, boolean>>({});
  const [dispatchDraft, setDispatchDraft] = useState<DispatchDraft | null>(null);
  const [dispatchSubmitting, setDispatchSubmitting] = useState(false);
  const [managerTasks, setManagerTasks] = useState<WarehousePriorityTask[]>([]);
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return formatDateTimeLocal(d);
  }, []);
  const [dateFrom, setDateFrom] = useState(todayStart);
  const [dateTo, setDateTo] = useState(formatDateTimeLocal(new Date()));

  const fetchSnapshot = (silent = false) => {
    if (warehouseId == null) {
      setSnapshot(null);
      setLoading(false);
      return;
    }
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    getWarehouseOperationsSnapshot({
      tenantId: DEFAULT_TENANT_ID,
      warehouseId,
      shortBreakMinutes: config.shortBreakMinutes,
      longBreakMinutes: config.longBreakMinutes,
    })
      .then(setSnapshot)
      .catch((err) => setError(err?.message ?? "Błąd ładowania centrum operacyjnego"))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

  const fetchManagerTasks = () => {
    if (warehouseId == null) {
      setManagerTasks([]);
      return;
    }
    listWarehousePriorityTasks({ tenantId: DEFAULT_TENANT_ID, warehouseId, scope: "all" })
      .then(setManagerTasks)
      .catch(() => setManagerTasks([]));
  };

  useEffect(() => {
    fetchSnapshot(false);
    if (warehouseId == null) return undefined;
    const interval = window.setInterval(() => fetchSnapshot(true), 30000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, config.shortBreakMinutes, config.longBreakMinutes]);

  useEffect(() => {
    fetchManagerTasks();
    if (warehouseId == null) return undefined;
    const interval = window.setInterval(fetchManagerTasks, 30000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId]);

  const groupedOperators = useMemo(() => {
    return {
      KOMPLETACJA: snapshot?.picking_operators ?? [],
      PAKOWANIE: snapshot?.packing_operators ?? [],
      "OPERACJE MAGAZYNOWE": snapshot?.warehouse_operation_operators ?? [],
      BRAKI: snapshot?.shortage_operators ?? [],
    } satisfies Record<WarehouseOperationsMainMode, WarehouseOperatorCard[]>;
  }, [snapshot]);

  const recentEndedByMode = useMemo(() => {
    const result: Record<WarehouseOperationsMainMode, WarehouseOperatorCard | null> = {
      KOMPLETACJA: null,
      PAKOWANIE: null,
      "OPERACJE MAGAZYNOWE": null,
      BRAKI: null,
    };
    for (const op of snapshot?.operators ?? []) {
      if (op.minutes_since_activity <= config.longBreakMinutes || op.minutes_since_activity > 180) continue;
      const current = result[op.main_mode];
      if (!current || op.minutes_since_activity < current.minutes_since_activity) {
        result[op.main_mode] = op;
      }
    }
    return result;
  }, [config.longBreakMinutes, snapshot?.operators]);

  const filteredReplenishments = useMemo(() => {
    return (snapshot?.replenishments ?? []).filter((row) => {
      if (replenishmentPriority && row.priority !== replenishmentPriority) return false;
      if (replenishmentZone && !String(row.zone ?? row.target_location ?? "").toLowerCase().includes(replenishmentZone.toLowerCase())) return false;
      if (replenishmentOperator && !String(row.assigned_operator ?? "").toLowerCase().includes(replenishmentOperator.toLowerCase())) return false;
      if (replenishmentCategory && !String(row.category ?? "").toLowerCase().includes(replenishmentCategory.toLowerCase())) return false;
      return true;
    });
  }, [replenishmentCategory, replenishmentOperator, replenishmentPriority, replenishmentZone, snapshot?.replenishments]);

  const managerFocusAlerts = useMemo(() => (snapshot?.alerts ?? []).filter((alert) => alert.manager_focus).slice(0, 5), [snapshot?.alerts]);

  const dispatchOperators = useMemo(() => {
    const seen = new Set<number>();
    return (snapshot?.operators ?? []).filter((op) => {
      if (seen.has(op.user_id)) return false;
      seen.add(op.user_id);
      return true;
    });
  }, [snapshot?.operators]);

  const groupedAlerts = useMemo(() => {
    const order = ["Braki", "Kompletacja", "Pakowanie", "Rozlokowanie PZ", "Rozlokowanie produktów", "Dostawy", "Przewoźnicy", "Operatorzy", "System"];
    const groups = new Map<string, WarehouseOperationsAlert[]>();
    for (const alert of snapshot?.alerts ?? []) {
      const key = alert.category || alert.area || "System";
      const rows = groups.get(key) ?? [];
      rows.push(alert);
      groups.set(key, rows);
    }
    return Array.from(groups.entries()).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [snapshot?.alerts]);

  const handleSaveConfig = () => {
    const next = {
      shortBreakMinutes: Math.max(1, Number(draftConfig.shortBreakMinutes) || 5),
      longBreakMinutes: Math.max(
        Math.max(1, Number(draftConfig.shortBreakMinutes) || 5) + 1,
        Number(draftConfig.longBreakMinutes) || 10,
      ),
    };
    setConfig(next);
    setDraftConfig(next);
    saveThresholdConfig(next);
    setShowConfig(false);
  };

  const handleExport = async (format: "csv" | "xlsx") => {
    if (warehouseId == null) return;
    setExporting(format);
    try {
      await downloadWarehouseOperationsExport({
        tenantId: DEFAULT_TENANT_ID,
        warehouseId,
        format,
        dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
        dateTo: dateTo ? new Date(dateTo).toISOString() : undefined,
        operatorId: exportOperatorId ? Number(exportOperatorId) : undefined,
        mode: exportMode,
        zone: exportZone || undefined,
        shortBreakMinutes: config.shortBreakMinutes,
        longBreakMinutes: config.longBreakMinutes,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eksport nie powiódł się");
    } finally {
      setExporting(null);
    }
  };

  const handleCreateRelocation = async (row: WarehouseOperationsSnapshot["replenishments"][number]) => {
    if (warehouseId == null) return;
    setCreatingRelocationFor(row.product_id);
    setError(null);
    try {
      await createReplenishmentRelocationTask(
        {
          tenantId: DEFAULT_TENANT_ID,
          warehouseId,
          shortBreakMinutes: config.shortBreakMinutes,
          longBreakMinutes: config.longBreakMinutes,
        },
        {
          productId: row.product_id,
          quantityRequired: row.missing_quantity,
          sourceLocation: row.source_location,
          targetLocation: row.target_location,
          priority: row.priority,
        },
      );
      fetchSnapshot(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się utworzyć przesunięcia");
    } finally {
      setCreatingRelocationFor(null);
    }
  };

  const handleOpenProgressRow = (row: WarehouseOperatorCard["order_progress"][number]) => {
    if (!row.navigation_path) return;
    setSelectedOperator(null);
    navigate(row.navigation_path, { state: row.navigation_state });
  };

  const handleAlertAction = (action: WarehouseOperationsAlert["actions"][number]) => {
    if (action.action_type === "create_task") {
      const alert = (snapshot?.alerts ?? []).find((candidate) => candidate.actions.includes(action));
      if (!alert) return;
      setDispatchDraft({
        alert,
        action,
        assignedOperatorId: "",
        priority: alert.level === "critical" ? "critical" : "high",
        deadlineMinutes: alert.level === "critical" ? "10" : "30",
        comment: String(action.payload?.["description"] || alert.recommended_action || ""),
      });
      return;
    }
    if (action.action_type === "switch_tab" && action.target_tab) {
      setActiveTab(action.target_tab as OperationsTabId);
      return;
    }
    if (action.target_path) {
      navigate(action.target_path, { state: action.payload });
      return;
    }
    if (action.target_tab) {
      setActiveTab(action.target_tab as OperationsTabId);
    }
  };

  const handleConfirmDispatch = async () => {
    if (!dispatchDraft || warehouseId == null) return;
    setDispatchSubmitting(true);
    setError(null);
    try {
      const payload = dispatchDraft.action.payload || {};
      const operator = dispatchOperators.find((op) => String(op.user_id) === dispatchDraft.assignedOperatorId);
      const deadline = new Date();
      deadline.setMinutes(deadline.getMinutes() + Math.max(1, Number(dispatchDraft.deadlineMinutes) || 30));
      await createWarehousePriorityTask(
        { tenantId: DEFAULT_TENANT_ID, warehouseId },
        {
          alertId: dispatchDraft.alert.id,
          taskType: String(payload["task_type"] || "quality_check"),
          title: String(payload["title"] || dispatchDraft.alert.title || dispatchDraft.alert.message),
          description: String(payload["description"] || dispatchDraft.alert.recommended_action || ""),
          assignedOperatorId: operator?.user_id ?? null,
          assignedOperatorName: operator?.user_name ?? null,
          priority: dispatchDraft.priority,
          deadlineAt: deadline.toISOString(),
          comment: dispatchDraft.comment,
          targetPath: String(payload["target_path"] || dispatchDraft.action.target_path || ""),
          payload,
        },
      );
      setDispatchDraft(null);
      fetchSnapshot(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się utworzyć zadania kierownika");
    } finally {
      setDispatchSubmitting(false);
    }
  };

  const kpiStrip = (
    <section className="sticky top-0 z-10 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6">
        <KpiCard label="Aktywni" value={snapshot?.summary.active_operators ?? 0} tone="border-emerald-200 bg-emerald-50 text-emerald-900" />
        <KpiCard label="Zakończone dziś" value={snapshot?.summary.orders_completed_today ?? 0} tone="border-blue-200 bg-blue-50 text-blue-900" />
        <KpiCard label="Efektywność" value={snapshot?.summary.warehouse_efficiency_percent ?? 0} tone="border-slate-200 bg-slate-50 text-slate-900" />
        <KpiCard label="Do rozlokowania PZ" value={snapshot?.summary.products_waiting_putaway ?? 0} tone="border-amber-200 bg-amber-50 text-amber-900" />
        <KpiCard label="Dostawy oczekujące" value={snapshot?.summary.inbound_deliveries_waiting ?? 0} tone="border-indigo-200 bg-indigo-50 text-indigo-900" />
        <KpiCard label="Ryzyko SLA" value={snapshot?.summary.sla_risk_percent ?? 0} tone="border-red-200 bg-red-50 text-red-900" />
        <KpiCard label="Kompletacja" value={snapshot?.summary.picking ?? 0} tone="border-blue-200 bg-white text-blue-800" />
        <KpiCard label="Pakowanie" value={snapshot?.summary.packing ?? 0} tone="border-emerald-200 bg-white text-emerald-700" />
        <KpiCard label="Operacje" value={snapshot?.summary.warehouse_operations ?? 0} tone="border-slate-200 bg-white text-slate-900" />
        <KpiCard label="Aktywne braki" value={snapshot?.summary.shortages ?? 0} tone="border-amber-200 bg-white text-amber-900" />
        <KpiCard label="Opóźnienia" value={snapshot?.summary.delayed_operations ?? 0} tone="border-orange-200 bg-orange-50 text-orange-900" />
        <KpiCard label="Zablokowane" value={snapshot?.summary.blocked_orders ?? 0} tone="border-red-200 bg-white text-red-900" />
      </div>
    </section>
  );

  const operatorGroups = (
    <section className="min-w-0 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">Live operatorzy</h2>
        <span className="text-xs font-semibold text-slate-500">polling 30 s</span>
      </div>
      {(["KOMPLETACJA", "PAKOWANIE", "OPERACJE MAGAZYNOWE", "BRAKI"] as WarehouseOperationsMainMode[]).map((mode) => (
        <OperatorModeSection
          key={mode}
          mode={mode}
          operators={groupedOperators[mode]}
          recentEnded={recentEndedByMode[mode]}
          onOpen={setSelectedOperator}
        />
      ))}
    </section>
  );

  const queuesPanel = (
    <section className="min-w-0 space-y-3">
      <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">Kolejki i obciążenie</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        {(snapshot?.queues ?? []).map((queue) => (
          <QueueCard key={queue.key} queue={queue} />
        ))}
      </div>
    </section>
  );

  const activityStream = (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-black text-slate-900">Strumień aktywności</h3>
        <span className="text-xs text-slate-500">najnowsze</span>
      </div>
      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {(snapshot?.activity_stream ?? []).map((event, idx) => (
          <div key={`${event.at}-${idx}`} className="grid grid-cols-[3rem_1fr] gap-2 rounded-lg bg-slate-50 p-2">
            <span className="text-xs font-black text-slate-500">{event.time_label}</span>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-slate-800">{event.title}</div>
              <div className="text-[11px] text-slate-500">
                {event.main_mode} · {event.submode}
                {event.location ? ` · ${event.location}` : ""}
                {event.metadata?.["order_number"] ? ` · ${String(event.metadata["order_number"])}` : ""}
                {event.metadata?.["document_number"] ? ` · ${String(event.metadata["document_number"])}` : ""}
              </div>
            </div>
          </div>
        ))}
        {snapshot?.activity_stream.length === 0 ? <div className="text-sm text-slate-500">Brak zdarzeń w dzisiejszym oknie.</div> : null}
      </div>
    </div>
  );

  const exportPanel = (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900">
        <Download className="h-4 w-4" />
        Eksport aktywności
      </div>
      <div className="grid gap-2 text-xs md:grid-cols-2">
        <label className="font-semibold text-slate-600">
          Od
          <input type="datetime-local" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5" />
        </label>
        <label className="font-semibold text-slate-600">
          Do
          <input type="datetime-local" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5" />
        </label>
        <label className="font-semibold text-slate-600">
          Operator
          <select value={exportOperatorId} onChange={(e) => setExportOperatorId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5">
            <option value="">Wszyscy</option>
            {(snapshot?.operators ?? []).map((op) => (
              <option key={op.user_id} value={op.user_id}>
                {op.user_name}
              </option>
            ))}
          </select>
        </label>
        <label className="font-semibold text-slate-600">
          Tryb
          <select value={exportMode} onChange={(e) => setExportMode(e.target.value as WarehouseOperationsMainMode | "")} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5">
            <option value="">Wszystkie</option>
            <option value="KOMPLETACJA">Kompletacja</option>
            <option value="PAKOWANIE">Pakowanie</option>
            <option value="OPERACJE MAGAZYNOWE">Operacje magazynowe</option>
            <option value="BRAKI">Braki</option>
          </select>
        </label>
        <label className="font-semibold text-slate-600">
          Strefa
          <input value={exportZone} onChange={(e) => setExportZone(e.target.value)} placeholder="np. A-01" className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5" />
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => void handleExport("csv")} disabled={exporting != null || warehouseId == null} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50">
          {exporting === "csv" ? "Eksport…" : "CSV"}
        </button>
        <button type="button" onClick={() => void handleExport("xlsx")} disabled={exporting != null || warehouseId == null} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 disabled:opacity-50">
          {exporting === "xlsx" ? "Eksport…" : "XLSX"}
        </button>
      </div>
    </div>
  );

  const alertsPanel = (
    <aside className="min-w-0 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">Alerty / incydenty</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-600">{snapshot?.alerts.length ?? 0}</span>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-900">Wymaga uwagi kierownika</h3>
            <p className="text-xs font-semibold text-slate-500">Najważniejsze decyzje operacyjne teraz</p>
          </div>
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-black text-red-700">{managerFocusAlerts.length}</span>
        </div>
        <div className="space-y-2">
          {managerFocusAlerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} onAction={handleAlertAction} featured />
          ))}
          {managerFocusAlerts.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
              Brak incydentów wymagających natychmiastowej decyzji kierownika.
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-2">
        {groupedAlerts.map(([category, alerts]) => {
          const critical = alerts.filter((a) => a.priority_group === "critical_now").length;
          const warning = alerts.filter((a) => a.priority_group === "requires_action").length;
          const isOpen = !!expandedAlertGroups[category];
          return (
            <div key={category} className="rounded-2xl border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setExpandedAlertGroups((prev) => ({ ...prev, [category]: !prev[category] }))}
                className="flex w-full items-center justify-between gap-3 p-3 text-left"
              >
                <span className="text-sm font-black text-slate-900">{category} ({alerts.length})</span>
                <span className="flex items-center gap-2 text-xs font-bold text-slate-500">
                  {critical ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">{critical} kryt.</span> : null}
                  {warning ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">{warning} reakcja</span> : null}
                  <ChevronDown className={`h-4 w-4 transition ${isOpen ? "rotate-180" : ""}`} />
                </span>
              </button>
              {isOpen ? (
                <div className="space-y-2 border-t border-slate-100 p-3">
                  {alerts.map((alert) => (
                    <AlertCard key={alert.id} alert={alert} onAction={handleAlertAction} />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        {snapshot?.alerts.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
            Brak aktywnych incydentów operacyjnych.
          </div>
        ) : null}
      </section>
    </aside>
  );

  const taskStatusLabel = (status: WarehousePriorityTask["status"]) =>
    ({
      NOWE: "Aktywne",
      PRZYJĘTE: "Przyjęte",
      W_TRAKCIE: "W realizacji",
      WYKONANE: "Zakończone",
      ODRZUCONE: "Odrzucone",
      ESKALOWANE: "Eskalowane",
    })[status] ?? status;

  const managerTaskSections: Array<{ key: string; title: string; rows: WarehousePriorityTask[] }> = [
    { key: "active", title: "Aktywne", rows: managerTasks.filter((t) => t.status === "NOWE" || t.status === "PRZYJĘTE") },
    { key: "progress", title: "W realizacji", rows: managerTasks.filter((t) => t.status === "W_TRAKCIE") },
    { key: "rejected", title: "Odrzucone", rows: managerTasks.filter((t) => t.status === "ODRZUCONE") },
    { key: "escalated", title: "Eskalowane", rows: managerTasks.filter((t) => t.status === "ESKALOWANE") },
    { key: "done", title: "Zakończone", rows: managerTasks.filter((t) => t.status === "WYKONANE") },
  ];

  const reassignTask = async (task: WarehousePriorityTask) => {
    if (warehouseId == null) return;
    await createWarehousePriorityTask(
      { tenantId: DEFAULT_TENANT_ID, warehouseId },
      {
        alertId: task.alert_id || `reassign-${task.id}`,
        taskType: task.task_type,
        title: task.title,
        description: task.description,
        assignedOperatorId: null,
        assignedOperatorName: null,
        priority: task.priority,
        deadlineAt: task.deadline_at,
        comment: `Ponowne przypisanie po odrzuceniu: ${task.rejection_reason || "brak powodu"}`,
        targetPath: task.target_path,
        payload: task.payload,
      },
    );
    fetchManagerTasks();
  };

  const managerTasksPanel = (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">Zadania kierownika</h2>
          <p className="text-xs font-semibold text-slate-500">Widoczność wykonania, odrzuceń i eskalacji zadań priorytetowych.</p>
        </div>
        <button type="button" onClick={fetchManagerTasks} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700">
          Odśwież
        </button>
      </div>
      {managerTaskSections.map((section) => (
        <div key={section.key} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900">{section.title}</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-600">{section.rows.length}</span>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {section.rows.map((task) => (
              <article key={task.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-slate-900">{task.title}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-500">
                      {task.assigned_operator_name || "Nieprzypisane"} · {taskStatusLabel(task.status)}
                    </div>
                  </div>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-slate-700 ring-1 ring-slate-200">
                    {task.task_type}
                  </span>
                </div>
                {task.status === "ODRZUCONE" ? (
                  <div className="mt-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                    <div><b>Powód:</b> {task.rejection_reason || "Brak opisu"}</div>
                    <div><b>Kiedy:</b> {task.rejected_at ? new Date(task.rejected_at).toLocaleString("pl-PL") : "—"}</div>
                  </div>
                ) : null}
                <div className="mt-3 grid gap-1 text-xs text-slate-600 sm:grid-cols-3">
                  <div>Kierownik: <b>{task.assigned_by_name || "—"}</b></div>
                  <div>Przydzielone: <b>{formatOperationalDurationSince(task.assigned_at)}</b></div>
                  <div>SLA: <b>{task.sla_countdown_minutes == null ? "—" : formatOperationalDuration(task.sla_countdown_minutes)}</b></div>
                </div>
                {task.status === "ODRZUCONE" ? (
                  <button type="button" onClick={() => void reassignTask(task)} className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white">
                    Przypisz ponownie
                  </button>
                ) : null}
              </article>
            ))}
            {section.rows.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">Brak zadań w tej sekcji.</div> : null}
          </div>
        </div>
      ))}
    </section>
  );

  const replenishmentsPanel = (
    <section className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">Uzupełnienia pick-face</h2>
          <span className="text-xs font-semibold text-slate-500">{filteredReplenishments.length} pozycji</span>
        </div>
        <div className="grid gap-2 text-xs md:grid-cols-4">
          <select value={replenishmentPriority} onChange={(e) => setReplenishmentPriority(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5">
            <option value="">Priorytet: wszystkie</option>
            <option value="red">Blokuje zamówienia</option>
            <option value="orange">Niski stan</option>
            <option value="blue">W toku</option>
          </select>
          <input value={replenishmentZone} onChange={(e) => setReplenishmentZone(e.target.value)} placeholder="Strefa" className="rounded-lg border border-slate-300 px-2 py-1.5" />
          <input value={replenishmentOperator} onChange={(e) => setReplenishmentOperator(e.target.value)} placeholder="Operator" className="rounded-lg border border-slate-300 px-2 py-1.5" />
          <input value={replenishmentCategory} onChange={(e) => setReplenishmentCategory(e.target.value)} placeholder="Kategoria" className="rounded-lg border border-slate-300 px-2 py-1.5" />
        </div>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {filteredReplenishments.map((row) => {
          const tone =
            row.priority === "red"
              ? "border-red-200 bg-red-50"
              : row.priority === "blue"
                ? "border-blue-200 bg-blue-50"
                : "border-amber-200 bg-amber-50";
          return (
            <article key={row.id} className={`rounded-2xl border p-3 ${tone}`}>
              <div className="flex gap-3">
                <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-white text-xs font-black text-slate-400 ring-1 ring-slate-200">
                  {row.image_url ? <img src={row.image_url} alt="" className="h-full w-full object-cover" /> : "IMG"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-900">{row.product_name}</div>
                      <div className="text-xs text-slate-500">SKU {row.sku || "—"} · EAN {row.ean || "—"}</div>
                    </div>
                    <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-black text-slate-700 ring-1 ring-slate-200">{row.priority_label}</span>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
                    <div><span className="block text-slate-500">Źródło</span><b>{row.source_location || "—"}</b></div>
                    <div><span className="block text-slate-500">Pick-face</span><b>{row.target_location || "—"}</b></div>
                    <div><span className="block text-slate-500">Brakuje</span><b>{row.missing_quantity}</b></div>
                    <div><span className="block text-slate-500">Blokuje</span><b>{row.blocked_orders}</b></div>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                    <div>Pick stock: <b>{row.current_picking_stock}</b></div>
                    <div>Rezerwa: <b>{row.reserve_stock}</b></div>
                    <div>Od wykrycia: <b>{formatOperationalDuration(row.minutes_since_detected)}</b></div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCreateRelocation(row)}
                    disabled={creatingRelocationFor === row.product_id}
                    className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    {creatingRelocationFor === row.product_id ? "Tworzenie…" : row.action_label}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {filteredReplenishments.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Brak produktów wymagających uzupełnienia.</div> : null}
      </div>
    </section>
  );

  const inboundPanel = (
    <section className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Aktywne dostawy" value={snapshot?.inbound_summary.active_deliveries ?? 0} tone="border-emerald-200 bg-emerald-50 text-emerald-900" />
        <KpiCard label="Opóźnione" value={snapshot?.inbound_summary.delayed_deliveries ?? 0} tone="border-orange-200 bg-orange-50 text-orange-900" />
        <KpiCard label="Do przyjęcia" value={snapshot?.inbound_summary.products_waiting_receiving ?? 0} tone="border-blue-200 bg-blue-50 text-blue-900" />
        <KpiCard label="Do rozlokowania PZ" value={snapshot?.inbound_summary.products_waiting_putaway ?? 0} tone="border-amber-200 bg-amber-50 text-amber-900" />
        <KpiCard label="Najstarsze oczekiwanie" value={formatOperationalDuration(snapshot?.inbound_summary.oldest_waiting_minutes)} tone="border-slate-200 bg-slate-50 text-slate-900" />
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {(snapshot?.inbound_deliveries ?? []).map((row) => (
          <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-black text-slate-900">{row.supplier}</div>
                <div className="text-xs text-slate-500">ETA: {row.eta ? new Date(row.eta).toLocaleString("pl-PL") : "—"} · oczekuje {formatOperationalDuration(row.waiting_minutes)}</div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${row.status_color === "red" ? "bg-red-100 text-red-800" : row.status_color === "orange" ? "bg-orange-100 text-orange-800" : "bg-emerald-100 text-emerald-800"}`}>{row.status_label}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
              <div>SKU: <b>{row.sku_count}</b></div>
              <div>Ilość: <b>{row.total_quantity}</b></div>
              <div>Nośniki: <b>{row.carriers_count}</b></div>
              <div>Operator: <b>{row.assigned_operator || "—"}</b></div>
            </div>
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-[11px] font-bold text-slate-500"><span>Postęp przyjęcia</span><span>{row.receiving_progress_percent}%</span></div>
              <ProgressBar value={row.receiving_progress_percent} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );

  const putawayPanel = (
    <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <div className="space-y-2">
        <KpiCard label="Produkty czekają" value={snapshot?.putaway_load.products_waiting ?? 0} tone="border-amber-200 bg-amber-50 text-amber-900" />
        <KpiCard label="Nośniki czekają" value={snapshot?.putaway_load.pallets_waiting ?? 0} tone="border-blue-200 bg-blue-50 text-blue-900" />
        <KpiCard label="Aktywni rozlok." value={snapshot?.putaway_load.active_putaway_operators ?? 0} tone="border-emerald-200 bg-emerald-50 text-emerald-900" />
        <KpiCard label="Wzrost kolejki" value={snapshot?.putaway_load.queue_growth_trend ?? 0} tone="border-slate-200 bg-slate-50 text-slate-900" />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-700">Najbardziej obciążone strefy</h2>
        <div className="space-y-3">
          {(snapshot?.putaway_load.zones ?? []).map((zone) => (
            <div key={zone.zone} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="mb-1 flex justify-between text-sm font-bold text-slate-800"><span>{zone.zone}</span><span>{zone.waiting_quantity}</span></div>
              <ProgressBar value={zone.heat_percent} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );

  const carrierIssuesPanel = (
    <section className="space-y-2">
      {(snapshot?.carrier_issues ?? []).map((issue) => (
        <article key={issue.id} className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-black text-slate-900">{issue.error_message}</div>
              <div className="text-xs text-slate-500">Zamówienie: {issue.order_id || "—"} · przewoźnik: {issue.carrier || "—"} · próby: {issue.retry_count}</div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${issue.severity === "blocked" ? "bg-red-100 text-red-800" : issue.severity === "critical" ? "bg-orange-100 text-orange-800" : "bg-amber-100 text-amber-800"}`}>{issue.severity}</span>
          </div>
        </article>
      ))}
      {snapshot?.carrier_issues.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Brak aktywnych problemów przewoźników w dzisiejszym oknie.</div> : null}
    </section>
  );

  const rankingPanel = (
    <section className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">Ranking jakości i efektywności</h2>
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs font-bold text-slate-500"><span className="rounded-md bg-white px-2 py-1 text-slate-900">Dzień</span><span className="px-2 py-1">Tydzień</span><span className="px-2 py-1">Miesiąc</span></div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-400">
            <tr><th className="py-2">Operator</th><th>Tryb</th><th>Score</th><th>Produkty/h</th><th>Zam./h</th><th>Idle</th><th>Błędy</th><th>Braki</th><th>Scan</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(snapshot?.employee_rankings ?? []).map((row) => (
              <tr key={`${row.mode}-${row.user_id}`} className="text-slate-700">
                <td className="py-2 font-bold text-slate-900">{row.user_name}</td>
                <td>{row.mode}</td>
                <td><span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-black text-white">{row.efficiency_score}</span></td>
                <td>{row.products_per_hour}</td>
                <td>{row.orders_per_hour}</td>
                <td>{formatOperationalDuration(row.inactivity_minutes)}</td>
                <td>{row.errors_count}</td>
                <td>{row.shortages_created}</td>
                <td>{row.scan_efficiency_percent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  const bottlenecksPanel = (
    <section className="grid gap-3 lg:grid-cols-2">
      {(snapshot?.bottlenecks ?? []).map((row) => (
        <article key={row.id} className={`rounded-2xl border p-3 ${row.level === "critical" ? "border-red-200 bg-red-50" : row.level === "warning" ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-blue-50"}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-black text-slate-900">{row.area}</div>
              <div className="mt-1 text-sm font-semibold text-slate-700">{row.message}</div>
            </div>
            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-black text-slate-700">{row.trend_label || `${row.pressure_percent}%`}</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div>Śr. oczek.: <b>{formatOperationalDuration(row.average_waiting_minutes)}</b></div>
            <div>Najstarsze: <b>{formatOperationalDuration(row.oldest_waiting_minutes)}</b></div>
            <div>SLA: <b>{row.sla_risk_percent}%</b></div>
          </div>
          <div className="mt-3"><ProgressBar value={row.pressure_percent} /></div>
        </article>
      ))}
      {snapshot?.bottlenecks.length === 0 ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">Brak wykrytych wąskich gardeł.</div> : null}
    </section>
  );

  if (loading && !snapshot) {
    return (
      <PageContainer cardClassName="space-y-4">
        <PageHeader
          title="Centrum operacyjne"
          subtitle="Live WMS — operatorzy, kolejki i alerty"
          breadcrumbs={[{ label: "Analiza", to: "/analytics/dashboard" }, { label: "Centrum operacyjne" }]}
        />
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Ładowanie danych operacyjnych…</div>
      </PageContainer>
    );
  }

  return (
    <PageContainer cardClassName="space-y-4">
      <PageHeader
        title="Centrum operacyjne"
        subtitle="Live WMS — kontrola pracy magazynu, operatorów i kolejek"
        breadcrumbs={[{ label: "Analiza", to: "/analytics/dashboard" }, { label: "Centrum operacyjne" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {showWarehouseSelector ? (
              <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">
                Magazyn: {activeWarehouse?.name ?? "—"}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setShowConfig((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Settings2 className="h-4 w-4" />
              Progi
            </button>
            <button
              type="button"
              onClick={() => fetchSnapshot(true)}
              disabled={refreshing || warehouseId == null}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Odśwież
            </button>
          </div>
        }
      />

      <OperationsTabs active={activeTab} onChange={setActiveTab} />

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</div> : null}

      {showConfig ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-3 text-sm font-black text-slate-900">Konfiguracja progów aktywności</div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-slate-600">
              Krótka przerwa (min)
              <input
                type="number"
                min={1}
                value={draftConfig.shortBreakMinutes}
                onChange={(e) => setDraftConfig((cfg) => ({ ...cfg, shortBreakMinutes: Number(e.target.value) }))}
                className="mt-1 block w-32 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Długa przerwa (min)
              <input
                type="number"
                min={2}
                value={draftConfig.longBreakMinutes}
                onChange={(e) => setDraftConfig((cfg) => ({ ...cfg, longBreakMinutes: Number(e.target.value) }))}
                className="mt-1 block w-32 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
            </label>
            <button type="button" onClick={handleSaveConfig} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-blue-500">
              Zastosuj
            </button>
            <span className="text-xs text-slate-500">Domyślnie: 5 min / 10 min. Zapis lokalny dla stanowiska.</span>
          </div>
        </div>
      ) : null}

      {kpiStrip}

      {activeTab === "live" ? (
        <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr_0.9fr]">
          {operatorGroups}
          <section className="min-w-0 space-y-3">
            {queuesPanel}
            {activityStream}
            {exportPanel}
          </section>
          {alertsPanel}
        </div>
      ) : null}

      {activeTab === "operators" ? operatorGroups : null}
      {activeTab === "queues" ? <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">{queuesPanel}{exportPanel}</div> : null}
      {activeTab === "picking" ? (
        <OperatorModeSection mode="KOMPLETACJA" operators={groupedOperators.KOMPLETACJA} recentEnded={recentEndedByMode.KOMPLETACJA} onOpen={setSelectedOperator} />
      ) : null}
      {activeTab === "packing" ? (
        <OperatorModeSection mode="PAKOWANIE" operators={groupedOperators.PAKOWANIE} recentEnded={recentEndedByMode.PAKOWANIE} onOpen={setSelectedOperator} />
      ) : null}
      {activeTab === "warehouse-operations" ? (
        <OperatorModeSection mode="OPERACJE MAGAZYNOWE" operators={groupedOperators["OPERACJE MAGAZYNOWE"]} recentEnded={recentEndedByMode["OPERACJE MAGAZYNOWE"]} onOpen={setSelectedOperator} />
      ) : null}
      {activeTab === "replenishments" ? replenishmentsPanel : null}
      {activeTab === "inbound" ? inboundPanel : null}
      {activeTab === "putaway-load" ? putawayPanel : null}
      {activeTab === "carrier-issues" ? carrierIssuesPanel : null}
      {activeTab === "ranking" ? rankingPanel : null}
      {activeTab === "bottlenecks" ? bottlenecksPanel : null}
      {activeTab === "alerts" ? alertsPanel : null}
      {activeTab === "manager-tasks" ? managerTasksPanel : null}
      {activeTab === "history" ? <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">{activityStream}{exportPanel}</div> : null}

      {selectedOperator ? (
        <DetailModal
          operator={selectedOperator}
          onClose={() => setSelectedOperator(null)}
          onOpenProgress={handleOpenProgressRow}
        />
      ) : null}
      {dispatchDraft ? (
        <DispatchTaskModal
          draft={dispatchDraft}
          operators={dispatchOperators}
          submitting={dispatchSubmitting}
          onChange={setDispatchDraft}
          onClose={() => setDispatchDraft(null)}
          onConfirm={() => void handleConfirmDispatch()}
        />
      ) : null}
    </PageContainer>
  );
}
