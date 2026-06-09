import { Link } from "react-router-dom";

import type { InventoryDashboardPayload, InventoryDocumentRead } from "@/api/inventoryCountApi";
import { moduleListPageShellClass } from "@/components/listPage/moduleListLayoutTokens";
import { erpInventoryCountPaths } from "../../inventoryCountPaths";
import { inventoryTypeLabel } from "../../inventoryCountUiLabels";
import { erpSurfaceCard } from "./theme";
import InventoryStatusBadge from "./InventoryStatusBadge";

type Props = {
  data: InventoryDashboardPayload;
};

function DocListRow({ doc }: { doc: InventoryDocumentRead }) {
  return (
    <Link
      to={erpInventoryCountPaths.document(doc.id)}
      className="flex cursor-pointer items-center justify-between border-b border-slate-100 px-4 py-3 transition-colors last:border-b-0 hover:bg-slate-50"
    >
      <div>
        <p className="text-sm font-semibold text-slate-900">{doc.number}</p>
        <p className="mt-0.5 text-xs text-slate-500">{inventoryTypeLabel(doc.inventory_type)}</p>
      </div>
      <div className="text-right">
        <InventoryStatusBadge status={doc.status} />
        <p className="mt-1 text-xs tabular-nums text-slate-400">
          {doc.coverage_percent}% • {doc.counted_lines}/{doc.total_lines}
        </p>
      </div>
    </Link>
  );
}

function Panel({
  title,
  children,
  empty,
}: {
  title: string;
  children: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <div className={`${erpSurfaceCard} flex h-64 flex-col overflow-hidden`}>
      <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      </div>
      <div className={`flex-1 overflow-y-auto ${empty ? "flex items-center justify-center p-4" : ""}`}>
        {children}
      </div>
    </div>
  );
}

/** Dashboard — standard ERP page body (shell in {@link InventoryLayout}). */
export default function InventoryDashboardView({ data }: Props) {
  const kpis = [
    { label: "Aktywne", value: String(data.kpis.active_inventories) },
    { label: "Do zatwierdzenia", value: String(data.kpis.awaiting_approval) },
    { label: "Otwarte różnice", value: String(data.kpis.open_differences) },
    { label: "Pokrycie magazynu", value: `${data.kpis.warehouse_coverage_percent}%` },
    { label: "Zakończone (7 dni)", value: String(data.kpis.completed_last_7_days) },
    { label: "Sesje operatorów", value: String(data.kpis.active_operator_sessions) },
  ];

  return (
    <div className={moduleListPageShellClass}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {kpis.map((stat) => (
          <div key={stat.label} className={`${erpSurfaceCard} p-4`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{stat.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Aktywne inwentaryzacje" empty={data.active_inventories.length === 0}>
          {data.active_inventories.length === 0 ? (
            <p className="text-sm text-slate-500">Brak aktywnych.</p>
          ) : (
            data.active_inventories.map((d) => <DocListRow key={d.id} doc={d} />)
          )}
        </Panel>

        <Panel title="Do zatwierdzenia" empty={data.awaiting_approval.length === 0}>
          {data.awaiting_approval.length === 0 ? (
            <p className="text-sm text-slate-500">Brak oczekujących.</p>
          ) : (
            data.awaiting_approval.map((d) => <DocListRow key={d.id} doc={d} />)
          )}
        </Panel>

        <Panel title="Ostatnio zakończone" empty={data.recent_completed.length === 0}>
          {data.recent_completed.length === 0 ? (
            <p className="text-sm text-slate-500">Brak w ostatnich 7 dniach.</p>
          ) : (
            data.recent_completed.map((d) => <DocListRow key={d.id} doc={d} />)
          )}
        </Panel>
      </div>
    </div>
  );
}
