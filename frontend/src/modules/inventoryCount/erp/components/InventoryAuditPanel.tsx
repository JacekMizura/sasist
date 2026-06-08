import { useMemo } from "react";

import type { InventoryAuditEventRead, InventoryDocumentTimelines } from "@/api/inventoryCountApi";
import { inventoryAuditActionLabel, inventoryLineStatusLabel } from "../../inventoryCountUiLabels";
import { InventorySection } from "./InventoryPageShell";

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
        action: inventoryAuditActionLabel(ev.action),
        detail: typeof ev.detail === "object" ? JSON.stringify(ev.detail) : String(ev.detail ?? ""),
        user: ev.user_name ?? (ev.user_id != null ? `#${ev.user_id}` : null),
      });
    }
    for (const a of timelines?.approval_timeline ?? []) {
      out.push({
        key: `appr-${a.id}`,
        time: fmtTime(a.created_at),
        action: `Zatwierdzenie: ${inventoryAuditActionLabel(a.action)}`,
        detail: a.notes ?? "",
        user: a.user_id != null ? `#${a.user_id}` : null,
      });
    }
    for (const r of timelines?.recount_timeline ?? []) {
      out.push({
        key: `rec-${r.id}`,
        time: fmtTime(r.completed_at ?? r.created_at),
        action: `Ponowne liczenie (${inventoryLineStatusLabel(r.status)})`,
        detail: r.reason ?? `Pozycja #${r.line_id}`,
        user: r.assigned_user_id != null ? `#${r.assigned_user_id}` : null,
      });
    }
    return out.sort((a, b) => (a.time < b.time ? 1 : -1));
  }, [auditLog, timelines]);

  if (loading) return <p className="py-3 text-xs text-slate-500">Wczytywanie kontroli…</p>;

  return (
    <InventorySection title="Oś czasu kontroli">
      <ul className="max-h-[420px] divide-y divide-slate-100 overflow-auto">
        {rows.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-slate-500">Brak zdarzeń.</li>
        ) : (
          rows.map((row) => (
            <li key={row.key} className="flex gap-2 px-3 py-1.5 text-xs">
              <span className="w-24 shrink-0 tabular-nums text-slate-500">{row.time}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{row.action}</p>
                {row.detail ? <p className="truncate text-slate-600">{row.detail}</p> : null}
              </div>
              <span className="shrink-0 text-slate-500">{row.user ?? "—"}</span>
            </li>
          ))
        )}
      </ul>
    </InventorySection>
  );
}
