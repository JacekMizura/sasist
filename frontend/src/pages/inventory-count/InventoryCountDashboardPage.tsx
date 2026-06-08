import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, ScanLine, TrendingUp, Users } from "lucide-react";

import {
  fetchInventoryCountDashboard,
  type InventoryDashboardPayload,
  type InventoryDocumentRead,
} from "../../api/inventoryCountApi";
import { ERP_INV } from "../../modules/inventoryCount/erp/erpInventoryTheme";
import { useWarehouse } from "../../context/WarehouseContext";
import { erpInventoryCountPaths } from "../../modules/inventoryCount/inventoryCountPaths";

const STATUS_PL: Record<string, string> = {
  draft: "Szkic",
  planned: "Zaplanowana",
  in_progress: "W trakcie",
  awaiting_approval: "Do zatwierdzenia",
  approved: "Zatwierdzona",
  posted: "Zaksięgowana",
  archived: "Archiwum",
  cancelled: "Anulowana",
};

function KpiCard({
  title,
  value,
  hint,
  icon: Icon,
  tone = "slate",
}: {
  title: string;
  value: string | number;
  hint?: string;
  icon: typeof ClipboardList;
  tone?: "slate" | "teal" | "amber" | "rose";
}) {
  const ring =
    tone === "teal"
      ? "ring-teal-200/80"
      : tone === "amber"
        ? "ring-amber-200/80"
        : tone === "rose"
          ? "ring-rose-200/80"
          : "ring-slate-200/90";
  return (
    <div className={`${ERP_INV.kpi} ring-1 ${ring}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
          {hint ? <p className="mt-0.5 text-[10px] text-slate-500">{hint}</p> : null}
        </div>
        <Icon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
      </div>
    </div>
  );
}

function DocRow({ doc }: { doc: InventoryDocumentRead }) {
  return (
    <Link
      to={erpInventoryCountPaths.document(doc.id)}
      className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50/60 px-3 py-2 transition hover:border-teal-200 hover:bg-teal-50/40"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{doc.number}</p>
        <p className="text-[10px] text-slate-500">
          {doc.inventory_type} · {STATUS_PL[doc.status] ?? doc.status}
        </p>
      </div>
      <div className="shrink-0 text-right text-xs tabular-nums text-slate-700">
        <p>{doc.coverage_percent}%</p>
        <p className="text-[10px] text-slate-500">
          {doc.counted_lines}/{doc.total_lines}
        </p>
      </div>
    </Link>
  );
}

export default function InventoryCountDashboardPage() {
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? 1;
  const warehouseId = warehouse?.id;
  const [data, setData] = useState<InventoryDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const payload = await fetchInventoryCountDashboard(tenantId, warehouseId);
      setData(payload);
    } catch {
      setErr("Nie udało się wczytać pulpitu inwentaryzacji.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="text-xs text-slate-500">Wczytywanie pulpitu…</p>;
  if (err) return <p className="text-xs text-rose-600">{err}</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Pulpit inwentaryzacji</h2>
          <p className="text-xs text-slate-500">Analiza i zatwierdzanie — liczenie w terminalu WMS</p>
        </div>
        <Link
          to={erpInventoryCountPaths.wizard}
          className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
        >
          Nowa inwentaryzacja
        </Link>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard title="Aktywne" value={data.kpis.active_inventories} icon={ClipboardList} tone="teal" />
        <KpiCard title="Do zatwierdzenia" value={data.kpis.awaiting_approval} icon={TrendingUp} tone="amber" />
        <KpiCard title="Otwarte różnice" value={data.kpis.open_differences} icon={ScanLine} tone="rose" />
        <KpiCard title="Pokrycie magazynu" value={`${data.kpis.warehouse_coverage_percent}%`} icon={TrendingUp} />
        <KpiCard title="Zakończone (7 dni)" value={data.kpis.completed_last_7_days} icon={ClipboardList} />
        <KpiCard title="Sesje WMS" value={data.kpis.active_operator_sessions} icon={Users} tone="teal" />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <section className={`${ERP_INV.section} lg:col-span-1`}>
          <div className={ERP_INV.sectionHead}>
            <h3 className="text-sm font-semibold text-slate-900">Aktywne inwentaryzacje</h3>
          </div>
          <div className="space-y-1.5 p-2">
            {data.active_inventories.length === 0 ? (
              <p className="px-2 py-4 text-xs text-slate-500">Brak aktywnych.</p>
            ) : (
              data.active_inventories.map((d) => <DocRow key={d.id} doc={d} />)
            )}
          </div>
        </section>
        <section className={`${ERP_INV.section} lg:col-span-1`}>
          <div className={ERP_INV.sectionHead}>
            <h3 className="text-sm font-semibold text-slate-900">Do zatwierdzenia</h3>
          </div>
          <div className="space-y-1.5 p-2">
            {data.awaiting_approval.length === 0 ? (
              <p className="px-2 py-4 text-xs text-slate-500">Brak oczekujących.</p>
            ) : (
              data.awaiting_approval.map((d) => <DocRow key={d.id} doc={d} />)
            )}
          </div>
        </section>
        <section className={`${ERP_INV.section} lg:col-span-1`}>
          <div className={ERP_INV.sectionHead}>
            <h3 className="text-sm font-semibold text-slate-900">Ostatnio zakończone</h3>
          </div>
          <div className="space-y-1.5 p-2">
            {data.recent_completed.length === 0 ? (
              <p className="px-2 py-4 text-xs text-slate-500">Brak w ostatnich 7 dniach.</p>
            ) : (
              data.recent_completed.map((d) => <DocRow key={d.id} doc={d} />)
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
