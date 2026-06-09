import { Link } from "react-router-dom";

import type { InventoryDashboardPayload, InventoryDocumentRead } from "@/api/inventoryCountApi";
import { erpInventoryCountPaths } from "../../inventoryCountPaths";
import { inventoryTypeLabel } from "../../inventoryCountUiLabels";
import InventoryStatusBadge from "./InventoryStatusBadge";
import {
  erpKpiCard,
  erpKpiLabel,
  erpKpiValue,
  erpPageShell,
  erpSectionCard,
  erpSectionHeader,
} from "./theme";

type Props = {
  data: InventoryDashboardPayload;
};

function DocListRow({ doc }: { doc: InventoryDocumentRead }) {
  return (
    <Link
      to={erpInventoryCountPaths.document(doc.id)}
      className="flex cursor-pointer items-center justify-between rounded-lg border border-transparent p-3 transition-colors hover:border-slate-100 hover:bg-slate-50"
    >
      <div>
        <div className="text-sm font-semibold text-slate-900">{doc.number}</div>
        <div className="text-xs text-slate-500">{inventoryTypeLabel(doc.inventory_type)}</div>
      </div>
      <div className="text-right">
        <InventoryStatusBadge status={doc.status} />
        <div className="mt-1 text-xs text-slate-500">
          {doc.coverage_percent}% • {doc.counted_lines}/{doc.total_lines}
        </div>
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
    <div className={erpSectionCard}>
      <div className={erpSectionHeader}>{title}</div>
      <div className={`p-2 ${empty ? "flex flex-1 items-center justify-center p-8" : "flex flex-col gap-1"}`}>
        {children}
      </div>
    </div>
  );
}

/** Dashboard — KPI grid + activity panels (presentation only). */
export default function InventoryDashboardView({ data }: Props) {
  const kpis = [
    { label: "AKTYWNE", value: String(data.kpis.active_inventories) },
    { label: "DO ZATWIERDZENIA", value: String(data.kpis.awaiting_approval) },
    { label: "OTWARTE RÓŻNICE", value: String(data.kpis.open_differences) },
    { label: "POKRYCIE MAGAZYNU", value: `${data.kpis.warehouse_coverage_percent}%` },
    { label: "ZAKOŃCZONE (7 DNI)", value: String(data.kpis.completed_last_7_days) },
    { label: "SESJE OPERATORÓW", value: String(data.kpis.active_operator_sessions) },
  ];

  return (
    <div className={erpPageShell}>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map((stat) => (
          <div key={stat.label} className={erpKpiCard}>
            <span className={erpKpiLabel}>{stat.label}</span>
            <span className={erpKpiValue}>{stat.value}</span>
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
