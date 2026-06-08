import { useMemo } from "react";

import type { InventoryAuditEventRead, InventoryDocumentTimelines } from "../../../api/inventoryCountApi";
import { ERP_INV } from "../erpInventoryTheme";

type Props = {
  auditLog: InventoryAuditEventRead[];
  timelines: InventoryDocumentTimelines | null;
  loading?: boolean;
};

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function InventoryAuditPanel({ auditLog, timelines, loading }: Props) {
  const rows = useMemo(() => {
    const out: Array<{ key: string; time: string; action: string; detail: string; user?: string | null }> = [];
    for (const ev of auditLog) {
      out.push({
        key: `audit-${ev.id}`,
        time: fmtTime(ev.created_at),
        action: ev.action,
        detail: typeof ev.detail === "object" ? JSON.stringify(ev.detail) : String(ev.detail ?? ""),
        user: ev.user_name ?? (ev.user_id != null ? `#${ev.user_id}` : null),
      });
    }
    for (const a of timelines?.approval_timeline ?? []) {
      out.push({
        key: `appr-${a.id}`,
        time: fmtTime(a.created_at),
        action: `Zatwierdzenie: ${a.action}`,
        detail: a.notes ?? "",
        user: a.user_id != null ? `#${a.user_id}` : null,
      });
    }
    for (const r of timelines?.recount_timeline ?? []) {
      out.push({
        key: `rec-${r.id}`,
        time: fmtTime(r.completed_at ?? r.created_at),
        action: `Recount (${r.status})`,
        detail: r.reason ?? `Linia #${r.line_id}`,
        user: r.assigned_user_id != null ? `#${r.assigned_user_id}` : null,
      });
    }
    return out.sort((a, b) => (a.time < b.time ? 1 : -1));
  }, [auditLog, timelines]);

  if (loading) return <p className="px-3 py-4 text-xs text-slate-500">Wczytywanie audytu…</p>;

  return (
    <div className={ERP_INV.section}>
      <div className={ERP_INV.sectionHead}>
        <h3 className="text-sm font-semibold text-slate-900">Oś czasu audytu</h3>
      </div>
      <ul className="max-h-[480px] divide-y divide-slate-100 overflow-auto">
        {rows.length === 0 ? (
          <li className="px-3 py-6 text-center text-xs text-slate-500">Brak zdarzeń audytowych.</li>
        ) : (
          rows.map((row) => (
            <li key={row.key} className="flex gap-3 px-3 py-2 text-xs">
              <span className="w-28 shrink-0 tabular-nums text-slate-500">{row.time}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{row.action}</p>
                {row.detail ? <p className="truncate text-slate-600">{row.detail}</p> : null}
              </div>
              <span className="shrink-0 text-slate-500">{row.user ?? "—"}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
