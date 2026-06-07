import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { useWarehouse } from "../../context/WarehouseContext";
import {
  listProductionBatches,
  listProductionOrders,
  type ProductionBatchRead,
  type ProductionOrderRead,
} from "../../api/productionApi";
import { BATCH_STATUS_LABEL, PRODUCTION_STATUS_LABEL, batchStatusBadgeClass, formatProductionMoney, productionStatusBadgeClass } from "./productionUi";
import { erpProductionPaths } from "./productionPaths";

const DEFAULT_TENANT = 1;

type HistoryRow = {
  key: string;
  number: string;
  kind: "batch" | "order";
  product: string;
  qty: number;
  status: string;
  completedAt: string;
  operator: string;
  unitCost: string;
  linkTo: string;
};

function toBatchRow(b: ProductionBatchRead): HistoryRow {
  const label = b.lines?.map((l) => l.product_name).filter(Boolean).join(", ") || `${b.products_count ?? b.lines.length} prod.`;
  return {
    key: `batch-${b.id}`,
    number: b.number,
    kind: "batch",
    product: label,
    qty: b.total_completed_units ?? b.total_planned_units ?? 0,
    status: b.status,
    completedAt: (b.completed_at ?? b.production_completed_at ?? b.created_at ?? "").slice(0, 10) || "—",
    operator: b.operator_name ?? "—",
    unitCost: "—",
    linkTo: erpProductionPaths.batch(b.id),
  };
}

function toOrderRow(o: ProductionOrderRead): HistoryRow {
  return {
    key: `order-${o.id}`,
    number: o.number,
    kind: "order",
    product: o.product_name ?? `Produkt #${o.product_id}`,
    qty: o.produced_quantity || o.planned_quantity,
    status: o.status,
    completedAt: (o.completed_at ?? o.created_at ?? "").slice(0, 10) || "—",
    operator: o.operator_name ?? "—",
    unitCost: formatProductionMoney(o.calculated_unit_cost),
    linkTo: erpProductionPaths.orders,
  };
}

export default function ProductionHistoryPage() {
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (warehouseId == null) return;
    setLoading(true);
    try {
      const [batches, orders] = await Promise.all([
        listProductionBatches(tenantId, { warehouse_id: warehouseId, status: "completed" }),
        listProductionOrders(tenantId, { warehouse_id: warehouseId, status: "completed" }),
      ]);
      const merged = [...batches.map(toBatchRow), ...orders.map(toOrderRow)].sort((a, b) =>
        b.completedAt.localeCompare(a.completedAt),
      );
      setRows(merged);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.number.toLowerCase().includes(q) || r.product.toLowerCase().includes(q) || r.operator.toLowerCase().includes(q),
    );
  }, [rows, search]);

  if (warehouseId == null) {
    return <p className="px-4 py-8 text-sm text-slate-500">Wybierz magazyn, aby wyświetlić historię produkcji.</p>;
  }

  return (
    <div className="space-y-4 px-4 pb-10 lg:px-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Historia produkcji</h2>
        <p className="text-sm text-slate-500">Zakończone partie masowe i zlecenia produkcyjne (MO).</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Szukaj numeru, produktu, operatora…"
          className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3 text-sm"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Dokument</th>
              <th className="px-4 py-3">Produkt</th>
              <th className="px-4 py-3">Ilość</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Data zakończenia</th>
              <th className="px-4 py-3">Operator</th>
              <th className="px-4 py-3">Koszt jdn.</th>
              <th className="px-4 py-3 text-right">Szczegóły</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-slate-500">
                  Wczytywanie…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-slate-500">
                  Brak zakończonych zleceń w historii.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.key} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-mono font-medium text-slate-900">
                    {r.number}
                    <span className="ml-2 text-[10px] uppercase text-slate-400">{r.kind === "batch" ? "partia" : "MO"}</span>
                  </td>
                  <td className="px-4 py-3 max-w-[220px] truncate text-slate-700">{r.product}</td>
                  <td className="px-4 py-3 tabular-nums">{r.qty}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        r.kind === "batch"
                          ? batchStatusBadgeClass(r.status as never)
                          : productionStatusBadgeClass(r.status as never)
                      }
                    >
                      {r.kind === "batch"
                        ? BATCH_STATUS_LABEL[r.status as keyof typeof BATCH_STATUS_LABEL]
                        : PRODUCTION_STATUS_LABEL[r.status as keyof typeof PRODUCTION_STATUS_LABEL]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.completedAt}</td>
                  <td className="px-4 py-3 text-slate-600">{r.operator}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">{r.unitCost}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={r.linkTo} className="text-xs font-medium text-slate-800 underline hover:text-slate-600">
                      Otwórz
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
