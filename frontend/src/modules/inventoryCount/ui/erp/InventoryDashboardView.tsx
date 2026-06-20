import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Percent,
  Users,
} from "lucide-react";

import type { InventoryDashboardPayload, InventoryDocumentRead } from "@/api/inventoryCountApi";
import { AppEmptyState } from "@/components/app-shell";
import { PurchasingKpiCard, PurchasingKpiGrid, PurchasingTableSection } from "@/modules/purchasing/ui";
import { erpInventoryCountPaths } from "../../inventoryCountPaths";
import { inventoryTypeLabel } from "../../inventoryCountUiLabels";
import { InventoryDocumentStatusBadge } from "./InventoryDocumentStatusBadge";

type Props = {
  data: InventoryDashboardPayload;
};

function DashboardDocRow({ doc }: { doc: InventoryDocumentRead }) {
  return (
    <tr className="group transition-colors hover:bg-slate-50/80">
      <td className="px-6 py-3">
        <Link
          to={erpInventoryCountPaths.document(doc.id)}
          className="font-medium text-slate-900 hover:text-amber-700 hover:underline"
        >
          {doc.number}
        </Link>
        <div className="mt-0.5 text-xs text-slate-500">{inventoryTypeLabel(doc.inventory_type)}</div>
      </td>
      <td className="px-6 py-3">
        <InventoryDocumentStatusBadge status={doc.status} />
      </td>
      <td className="px-6 py-3 text-right tabular-nums text-slate-700">
        {doc.coverage_percent}%
        <div className="text-xs text-slate-400">
          {doc.counted_lines}/{doc.total_lines}
        </div>
      </td>
      <td className="px-6 py-3 text-right">
        <Link
          to={erpInventoryCountPaths.document(doc.id)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-amber-700 opacity-0 transition-all group-hover:opacity-100 hover:bg-amber-50"
        >
          Otwórz
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </td>
    </tr>
  );
}

function DashboardSectionTable({
  title,
  subtitle,
  indicatorClass,
  docs,
  emptyMessage,
  action,
}: {
  title: string;
  subtitle: string;
  indicatorClass: string;
  docs: InventoryDocumentRead[];
  emptyMessage: string;
  action?: React.ReactNode;
}) {
  return (
    <PurchasingTableSection title={title} subtitle={subtitle} indicatorClass={indicatorClass} action={action}>
      {docs.length === 0 ? (
        <p className="px-6 py-8 text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-6 py-3">Dokument</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3 text-right">Pokrycie</th>
              <th className="px-6 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {docs.map((d) => (
              <DashboardDocRow key={d.id} doc={d} />
            ))}
          </tbody>
        </table>
      )}
    </PurchasingTableSection>
  );
}

/** Dashboard — system KPI + sekcje dokumentów. */
export default function InventoryDashboardView({ data }: Props) {
  return (
    <div className="space-y-6">
      <PurchasingKpiGrid columns={6}>
        <PurchasingKpiCard
          title="Aktywne"
          value={data.kpis.active_inventories}
          subtitle="Inwentaryzacje w toku"
          tone="blue"
          icon={<Activity aria-hidden />}
          to={erpInventoryCountPaths.documents}
        />
        <PurchasingKpiCard
          title="Do zatwierdzenia"
          value={data.kpis.awaiting_approval}
          subtitle="Oczekują na decyzję kierownika"
          tone="amber"
          icon={<ClipboardCheck aria-hidden />}
          to={erpInventoryCountPaths.documents}
        />
        <PurchasingKpiCard
          title="Otwarte różnice"
          value={data.kpis.open_differences}
          subtitle="Pozycje wymagające weryfikacji"
          tone="red"
          icon={<ClipboardList aria-hidden />}
          to={erpInventoryCountPaths.documents}
        />
        <PurchasingKpiCard
          title="Pokrycie magazynu"
          value={`${data.kpis.warehouse_coverage_percent}%`}
          subtitle="Udział policzonych lokalizacji"
          tone="emerald"
          icon={<Percent aria-hidden />}
        />
        <PurchasingKpiCard
          title="Zakończone (7 dni)"
          value={data.kpis.completed_last_7_days}
          subtitle="Zatwierdzone lub zaksięgowane"
          tone="indigo"
          icon={<CheckCircle2 aria-hidden />}
          to={erpInventoryCountPaths.documents}
        />
        <PurchasingKpiCard
          title="Sesje operatorów"
          value={data.kpis.active_operator_sessions}
          subtitle="Aktywne sesje WMS"
          tone="purple"
          icon={<Users aria-hidden />}
        />
      </PurchasingKpiGrid>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <DashboardSectionTable
          title="Aktywne inwentaryzacje"
          subtitle={`${data.active_inventories.length} dokumentów`}
          indicatorClass="bg-sky-500"
          docs={data.active_inventories}
          emptyMessage="Brak aktywnych inwentaryzacji."
          action={
            <Link to={erpInventoryCountPaths.documents} className="text-sm font-medium text-amber-700 hover:text-amber-800">
              Wszystkie dokumenty
            </Link>
          }
        />
        <DashboardSectionTable
          title="Do zatwierdzenia"
          subtitle={`${data.awaiting_approval.length} oczekujących`}
          indicatorClass="bg-amber-500"
          docs={data.awaiting_approval}
          emptyMessage="Brak dokumentów do zatwierdzenia."
        />
        <DashboardSectionTable
          title="Ostatnio zakończone"
          subtitle="Ostatnie 7 dni"
          indicatorClass="bg-emerald-500"
          docs={data.recent_completed}
          emptyMessage="Brak zakończonych inwentaryzacji w ostatnich 7 dniach."
        />
      </div>

      {data.active_inventories.length === 0 &&
      data.awaiting_approval.length === 0 &&
      data.recent_completed.length === 0 ? (
        <AppEmptyState
          title="Brak aktywności inwentaryzacyjnej"
          description="Utwórz nową inwentaryzację, aby rozpocząć liczenie stanów magazynowych."
          action={
            <Link to={erpInventoryCountPaths.wizard} className="text-sm font-semibold text-amber-700 hover:underline">
              + Nowa inwentaryzacja
            </Link>
          }
        />
      ) : null}
    </div>
  );
}
