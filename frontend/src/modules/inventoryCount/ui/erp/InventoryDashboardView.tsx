import { Link } from "react-router-dom";

import type { InventoryDashboardPayload, InventoryDocumentRead } from "@/api/inventoryCountApi";
import { erpInventoryCountPaths } from "../../inventoryCountPaths";
import { inventoryTypeLabel } from "../../inventoryCountUiLabels";
import InventoryStatusBadge from "./InventoryStatusBadge";

type Props = {
  data: InventoryDashboardPayload;
  onNewInventory: string;
};

function DocListRow({ doc }: { doc: InventoryDocumentRead }) {
  return (
    <Link
      to={erpInventoryCountPaths.document(doc.id)}
      className="flex cursor-pointer items-center justify-between border-b border-slate-100 p-4 transition-colors last:border-b-0 hover:bg-slate-50"
    >
      <div>
        <p className="text-sm font-semibold text-slate-900">{doc.number}</p>
        <p className="mt-0.5 text-xs text-slate-500">{inventoryTypeLabel(doc.inventory_type)}</p>
      </div>
      <div className="text-right">
        <InventoryStatusBadge status={doc.status} />
        <p className="mt-1 text-xs text-slate-400 tabular-nums">
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
    <div className="flex h-64 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h3>
      </div>
      <div className={`flex-1 overflow-y-auto ${empty ? "flex items-center justify-center p-4" : "p-0"}`}>
        {children}
      </div>
    </div>
  );
}

/** Dashboard — pixel match uploaded mockup. */
export default function InventoryDashboardView({ data, onNewInventory }: Props) {
  const kpis = [
    { label: "AKTYWNE", value: String(data.kpis.active_inventories) },
    { label: "DO ZATWIERDZENIA", value: String(data.kpis.awaiting_approval) },
    { label: "OTWARTE RÓŻNICE", value: String(data.kpis.open_differences) },
    { label: "POKRYCIE MAGAZYNU", value: `${data.kpis.warehouse_coverage_percent}%` },
    { label: "ZAKOŃCZONE (7 DNI)", value: String(data.kpis.completed_last_7_days) },
    { label: "SESJE OPERATORÓW", value: String(data.kpis.active_operator_sessions) },
  ];

  return (
    <div className="animate-in fade-in space-y-6 duration-300">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Pulpit inwentaryzacji</h2>
        <Link
          to={onNewInventory}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
        >
          Nowa inwentaryzacja
        </Link>
      </div>
      <p className="-mt-4 text-sm text-slate-500">
        Aktywne liczenia, różnice i zatwierdzenia — liczenie w terminalu WMS.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{stat.label}</p>
            <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Aktywne inwentaryzacje" empty={data.active_inventories.length === 0}>
          {data.active_inventories.length === 0 ? (
            <p className="text-sm text-slate-400">Brak aktywnych.</p>
          ) : (
            data.active_inventories.map((d) => <DocListRow key={d.id} doc={d} />)
          )}
        </Panel>

        <Panel title="Do zatwierdzenia" empty={data.awaiting_approval.length === 0}>
          {data.awaiting_approval.length === 0 ? (
            <p className="text-sm text-slate-400">Brak oczekujących.</p>
          ) : (
            data.awaiting_approval.map((d) => <DocListRow key={d.id} doc={d} />)
          )}
        </Panel>

        <Panel title="Ostatnio zakończone" empty={data.recent_completed.length === 0}>
          {data.recent_completed.length === 0 ? (
            <p className="text-sm text-slate-400">Brak w ostatnich 7 dniach.</p>
          ) : (
            data.recent_completed.map((d) => <DocListRow key={d.id} doc={d} />)
          )}
        </Panel>
      </div>
    </div>
  );
}
