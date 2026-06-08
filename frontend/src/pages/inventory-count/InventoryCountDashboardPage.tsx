import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, ScanLine, TrendingUp, Users } from "lucide-react";

import {
  fetchInventoryCountDashboard,
  type InventoryDashboardPayload,
  type InventoryDocumentRead,
} from "../../api/inventoryCountApi";
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
    <div className={`rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ${ring}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
          {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        </div>
        <div className="rounded-xl bg-slate-50 p-2.5 text-slate-600">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </div>
    </div>
  );
}

function DocRow({ doc }: { doc: InventoryDocumentRead }) {
  return (
    <Link
      to={erpInventoryCountPaths.document(doc.id)}
      className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3 transition hover:border-teal-200 hover:bg-teal-50/30"
    >
      <div>
        <p className="font-medium text-slate-900">{doc.number}</p>
        <p className="text-xs text-slate-500">
          {doc.inventory_type} · {STATUS_PL[doc.status] ?? doc.status}
        </p>
      </div>
      <div className="text-right text-sm tabular-nums text-slate-700">
        <p>{doc.coverage_percent}% pokrycia</p>
        <p className="text-xs text-slate-500">
          {doc.counted_lines}/{doc.total_lines} pozycji
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

  if (loading) {
    return <p className="text-sm text-slate-500">Wczytywanie pulpitu…</p>;
  }
  if (err) {
    return <p className="text-sm text-rose-600">{err}</p>;
  }
  if (!data) return null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Pulpit inwentaryzacji</h2>
          <p className="text-sm text-slate-500">Aktywne liczenia, różnice i aktywność operatorów</p>
        </div>
        <Link
          to={erpInventoryCountPaths.wizard}
          className="inline-flex items-center rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
        >
          Nowa inwentaryzacja
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard title="Aktywne inwentaryzacje" value={data.kpis.active_inventories} icon={ClipboardList} tone="teal" />
        <KpiCard title="Do zatwierdzenia" value={data.kpis.awaiting_approval} icon={TrendingUp} tone="amber" />
        <KpiCard title="Otwarte różnice" value={data.kpis.open_differences} icon={ScanLine} tone="rose" />
        <KpiCard title="Pokrycie magazynu" value={`${data.kpis.warehouse_coverage_percent}%`} icon={TrendingUp} />
        <KpiCard title="Zakończone (7 dni)" value={data.kpis.completed_last_7_days} icon={ClipboardList} />
        <KpiCard title="Sesje operatorów" value={data.kpis.active_operator_sessions} icon={Users} tone="teal" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Aktywne inwentaryzacje</h3>
          <div className="mt-4 space-y-2">
            {data.active_inventories.length === 0 ? (
              <p className="text-sm text-slate-500">Brak aktywnych inwentaryzacji.</p>
            ) : (
              data.active_inventories.map((d) => <DocRow key={d.id} doc={d} />)
            )}
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Oczekujące zatwierdzenia</h3>
          <div className="mt-4 space-y-2">
            {data.awaiting_approval.length === 0 ? (
              <p className="text-sm text-slate-500">Brak dokumentów do zatwierdzenia.</p>
            ) : (
              data.awaiting_approval.map((d) => <DocRow key={d.id} doc={d} />)
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
