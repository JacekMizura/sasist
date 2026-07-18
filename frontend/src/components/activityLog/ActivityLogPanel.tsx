import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Info,
  XCircle,
} from "lucide-react";

import { fetchActivityLog } from "../../api/activityLogApi";
import type { ActivityEventItem, ActivityObjectType } from "../../types/activityLog";

type ActivityLogPanelProps = {
  objectType: ActivityObjectType | string;
  objectId: number | null | undefined;
  /** Optional title override */
  title?: string;
  /** Start collapsed (default true) */
  defaultCollapsed?: boolean;
  className?: string;
};

function severityIcon(severity: string) {
  const s = severity.toUpperCase();
  if (s === "SUCCESS") return CheckCircle2;
  if (s === "WARNING") return AlertTriangle;
  if (s === "ERROR") return XCircle;
  if (s === "AUDIT") return Circle;
  return Info;
}

function severityClass(severity: string) {
  const s = severity.toUpperCase();
  if (s === "SUCCESS") return "text-emerald-600 bg-emerald-50";
  if (s === "WARNING") return "text-amber-600 bg-amber-50";
  if (s === "ERROR") return "text-rose-600 bg-rose-50";
  if (s === "AUDIT") return "text-slate-600 bg-slate-50";
  return "text-sky-600 bg-sky-50";
}

function formatWhen(iso: string | null): { time: string; date: string } {
  if (!iso) return { time: "—", date: "" };
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) {
    const parts = iso.split(" ");
    return { time: parts[1]?.slice(0, 5) || "—", date: parts[0] || "" };
  }
  return {
    time: d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }),
    date: d.toLocaleDateString("pl-PL"),
  };
}

function metaLines(meta: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const volFrom = meta.volume_from ?? meta.assigned_volume_from;
  const volTo = meta.volume_to ?? meta.assigned_volume ?? meta.assigned_volume_to;
  if (volFrom != null || volTo != null) {
    lines.push(`Objętość: ${volFrom ?? "—"} l → ${volTo ?? "—"} l`);
  }
  const pctFrom = meta.usage_from ?? meta.capacity_usage_from;
  const pctTo = meta.usage_to ?? meta.capacity_usage_percent ?? meta.capacity_usage_to;
  if (pctFrom != null || pctTo != null) {
    lines.push(`Pojemność: ${pctFrom ?? "—"}% → ${pctTo ?? "—"}%`);
  }
  const reason = meta.reason ?? meta.powod;
  if (typeof reason === "string" && reason.trim()) {
    lines.push(`Powód: ${reason.trim()}`);
  }
  const ordersCount = meta.orders_count;
  if (typeof ordersCount === "number") {
    lines.push(`Zamówienia: ${ordersCount}`);
  }
  return lines;
}

function ActivityEntry({
  item,
  hideObjectType,
}: {
  item: ActivityEventItem;
  hideObjectType: string;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const Icon = severityIcon(item.severity);
  const { time, date } = formatWhen(item.occurred_at);
  const details = metaLines(item.metadata || {});
  const related = (item.links || []).filter(
    (l) => !(l.object_type === hideObjectType),
  );

  return (
    <li className="relative pl-10">
      <div
        className={`absolute left-0 top-1 flex h-8 w-8 items-center justify-center rounded-full ${severityClass(item.severity)}`}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <button
        type="button"
        className="w-full text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="text-sm font-bold tabular-nums text-slate-900">{time}</span>
          {date ? <span className="text-[11px] font-medium text-slate-400">{date}</span> : null}
        </div>
        <p className="mt-1 text-sm font-semibold text-slate-800">{item.description}</p>
        {item.actor_name ? (
          <p className="mt-0.5 text-[12px] text-slate-500">
            Operator: <span className="font-medium text-slate-700">{item.actor_name}</span>
          </p>
        ) : null}
      </button>

      {open ? (
        <div className="mt-2 space-y-2 rounded-xl border border-slate-100 bg-white px-3 py-2.5">
          {details.length ? (
            <ul className="space-y-1 text-[13px] text-slate-700">
              {details.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-slate-400">Brak dodatkowych szczegółów.</p>
          )}
          {related.length ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {related.map((lnk) => {
                const label =
                  lnk.object_label ||
                  `${lnk.object_type} #${lnk.object_id}`;
                const go = () => {
                  if (lnk.href) navigate(lnk.href);
                };
                return (
                  <button
                    key={`${lnk.object_type}-${lnk.object_id}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      go();
                    }}
                    disabled={!lnk.href}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-[12px] font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50 disabled:cursor-default disabled:opacity-60"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Reusable collapsible Activity Log for OMS panel object views.
 * Default collapsed. White background — no grey canvas.
 */
export default function ActivityLogPanel({
  objectType,
  objectId,
  title = "Logi czynności",
  defaultCollapsed = true,
  className = "",
}: ActivityLogPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ActivityEventItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const ready = objectId != null && Number(objectId) > 0;

  useEffect(() => {
    if (!ready || collapsed) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchActivityLog({ objectType, objectId: Number(objectId), limit: 100 })
      .then((res) => {
        if (!cancelled) setItems(res.items);
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setError("Nie udało się wczytać historii czynności.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, collapsed, objectType, objectId]);

  const countLabel = useMemo(() => {
    if (collapsed || loading) return null;
    return items.length ? `${items.length}` : "0";
  }, [collapsed, loading, items.length]);

  if (!ready) return null;

  return (
    <section
      className={`mt-8 border-t border-slate-100 pt-4 ${className}`}
      aria-label={title}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden />
        )}
        <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
          {title}
        </span>
        {countLabel != null ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
            {countLabel}
          </span>
        ) : null}
      </button>

      {!collapsed ? (
        <div className="mt-4">
          {loading ? (
            <p className="text-sm text-slate-400">Ładowanie historii…</p>
          ) : error ? (
            <p className="text-sm text-rose-600">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-slate-400">Brak zapisanych czynności dla tego obiektu.</p>
          ) : (
            <ol className="relative space-y-6 border-l border-slate-100 ml-4 pl-2">
              {items.map((item) => (
                <ActivityEntry
                  key={`${item.source_module || "act"}-${item.id}`}
                  item={item}
                  hideObjectType={String(objectType)}
                />
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </section>
  );
}
