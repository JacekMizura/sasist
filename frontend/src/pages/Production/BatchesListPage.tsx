import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CalendarClock, Factory, Package } from "lucide-react";

import { useWarehouse } from "../../context/WarehouseContext";
import { listProductionBatches, type ProductionBatchRead } from "../../api/productionApi";
import { AppEmptyState } from "../../components/app-shell";
import {
  productsListActionsCellClass,
  productsListActionsInnerClass,
  productsListActionsThClass,
} from "../../components/products/productList/productsListTableTokens";
import {
  moduleListTableClass,
  moduleListTableScrollClass,
  moduleListTdClass,
  moduleListThClass,
  moduleListTheadClass,
  moduleTableCardClass,
} from "../../components/listPage/moduleList";
import { ProductionKpiCard } from "./components/ProductionKpiCard";
import { ProductionKpiGrid } from "./components/ProductionKpiGrid";
import { BATCH_STATUS_LABEL, batchStatusBadgeClass } from "./productionUi";
import { erpProductionPaths } from "./productionPaths";
import { ProgressBar } from "./components/ProgressBar";
import { ProductionRowActionsMenu } from "./components/ProductionRowActionsMenu";

const DEFAULT_TENANT = 1;

type Props = {
  embedded?: boolean;
};

export default function BatchesListPage({ embedded = false }: Props) {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [batches, setBatches] = useState<ProductionBatchRead[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listProductionBatches(tenantId, { warehouse_id: warehouseId });
      setBatches(rows.filter((b) => b.status !== "completed" && b.status !== "cancelled"));
    } catch {
      setBatches([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const stats = useMemo(() => {
    const planned = batches.filter((b) => b.status === "planned" || b.status === "draft").length;
    const active = batches.filter((b) => ["collecting", "in_progress", "putaway"].includes(b.status)).length;
    const shortages = batches.filter((b) => b.has_shortages).length;
    const units = batches.reduce((s, b) => s + (b.total_planned_units ?? 0), 0);
    return { planned, active, shortages, units, total: batches.length };
  }, [batches]);

  const table = loading ? (
    <p className="text-sm text-slate-500">Wczytywanie…</p>
  ) : batches.length === 0 ? (
    <AppEmptyState
      icon={Package}
      title="Brak aktywnych partii"
      description="Utwórz partię masową, aby zaplanować produkcję wieloproduktową."
      action={
        <button
          type="button"
          className="text-sm font-semibold text-amber-700 hover:underline"
          onClick={() => navigate(erpProductionPaths.recipes)}
        >
          Przejdź do receptur
        </button>
      }
    />
  ) : (
    <div className={moduleTableCardClass}>
      <div className={moduleListTableScrollClass}>
        <table className={moduleListTableClass} style={{ minWidth: 900 }}>
          <thead className={moduleListTheadClass}>
            <tr>
              <th className={moduleListThClass}>Partia</th>
              <th className={moduleListThClass}>Produkty</th>
              <th className={`${moduleListThClass} text-right`}>Ilość</th>
              <th className={moduleListThClass}>Status</th>
              <th className={moduleListThClass}>Postęp</th>
              <th className={moduleListThClass}>Materiały</th>
              <th className={moduleListThClass}>Operator</th>
              <th className={moduleListThClass}>Termin</th>
              <th className={productsListActionsThClass}>Akcje</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className="group border-b border-slate-100 hover:bg-slate-50/70">
                <td className={`${moduleListTdClass} font-mono font-medium text-slate-900`}>{b.number}</td>
                <td className={moduleListTdClass}>{b.products_count ?? b.lines.length}</td>
                <td className={`${moduleListTdClass} text-right tabular-nums`}>{b.total_planned_units ?? 0}</td>
                <td className={moduleListTdClass}>
                  <span className={batchStatusBadgeClass(b.status)}>{BATCH_STATUS_LABEL[b.status]}</span>
                </td>
                <td className={`${moduleListTdClass} min-w-[140px]`}>
                  <ProgressBar value={b.progress_percent ?? 0} tone={b.has_shortages ? "amber" : "emerald"} />
                </td>
                <td className={moduleListTdClass}>
                  {b.has_shortages ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                      Braki
                    </span>
                  ) : (
                    <span className="text-xs text-emerald-700">OK</span>
                  )}
                </td>
                <td className={`${moduleListTdClass} text-slate-600`}>{b.operator_name ?? "—"}</td>
                <td className={`${moduleListTdClass} text-slate-600`}>{(b.created_at ?? "").slice(0, 10) || "—"}</td>
                <td className={productsListActionsCellClass} onClick={(e) => e.stopPropagation()}>
                  <div className={productsListActionsInnerClass}>
                    <ProductionRowActionsMenu
                      ariaLabel={`Akcje ${b.number}`}
                      actions={[
                        { id: "open", label: "Otwórz", onClick: () => navigate(erpProductionPaths.batch(b.id)) },
                        { id: "edit", label: "Edytuj", onClick: () => navigate(erpProductionPaths.batch(b.id)) },
                      ]}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-6">
        <ProductionKpiGrid>
          <ProductionKpiCard title="Partie aktywne" value={stats.total} tone="indigo" icon={<Package aria-hidden />} />
          <ProductionKpiCard title="Zaplanowane" value={stats.planned} tone="purple" icon={<CalendarClock aria-hidden />} />
          <ProductionKpiCard title="W realizacji" value={stats.active} tone="blue" icon={<Factory aria-hidden />} />
          <ProductionKpiCard title="Z brakami" value={stats.shortages} tone="amber" icon={<AlertTriangle aria-hidden />} />
        </ProductionKpiGrid>
        {table}
      </div>
    );
  }

  return (
    <div className="space-y-6 py-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Partie produkcyjne</h1>
        <p className="text-sm text-slate-500">Fale produkcyjne — wiele produktów, jeden zagregowany pobór surowców.</p>
      </div>
      {table}
    </div>
  );
}
