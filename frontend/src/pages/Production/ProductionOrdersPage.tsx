import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Plus, Search } from "lucide-react";
import toast from "react-hot-toast";
import { useWarehouse } from "../../context/WarehouseContext";
import {
  listProductionBatches,
  listProductionOrders,
  type ProductionBatchRead,
  type ProductionOrderRead,
} from "../../api/productionApi";
import { BATCH_STATUS_LABEL, PRODUCTION_STATUS_LABEL, batchStatusBadgeClass, productionStatusBadgeClass } from "./productionUi";
import { erpProductionPaths, wmsProductionPaths } from "./productionPaths";

const DEFAULT_TENANT = 1;

type Row =
  | { kind: "batch"; id: number; number: string; product: string; qty: number; status: string; date: string; operator: string; priority: string; hasShortages: boolean }
  | { kind: "order"; id: number; number: string; product: string; qty: number; status: string; date: string; operator: string; priority: string; hasShortages: false };

function batchRow(b: ProductionBatchRead): Row {
  const label = b.lines?.map((l) => l.product_name).filter(Boolean).join(", ") || `${b.products_count} prod.`;
  return {
    kind: "batch",
    id: b.id,
    number: b.number,
    product: label,
    qty: b.total_planned_units,
    status: b.status,
    date: (b.created_at ?? "").slice(0, 10) || "—",
    operator: b.operator_name ?? "—",
    priority: b.has_shortages ? "Zablokowane" : "Normalny",
    hasShortages: b.has_shortages ?? false,
  };
}

function orderRow(o: ProductionOrderRead): Row {
  return {
    kind: "order",
    id: o.id,
    number: o.number,
    product: o.product_name ?? `Produkt #${o.product_id}`,
    qty: o.planned_quantity,
    status: o.status,
    date: (o.created_at ?? "").slice(0, 10) || "—",
    operator: o.operator_name ?? "—",
    priority: o.priority > 5 ? "Wysoki" : "Normalny",
    hasShortages: false,
  };
}

export default function ProductionOrdersPage() {
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [batches, setBatches] = useState<ProductionBatchRead[]>([]);
  const [orders, setOrders] = useState<ProductionOrderRead[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (warehouseId == null) return;
    setLoading(true);
    try {
      const [b, o] = await Promise.all([
        listProductionBatches(tenantId, { warehouse_id: warehouseId }),
        listProductionOrders(tenantId, { warehouse_id: warehouseId }),
      ]);
      setBatches(b.filter((x) => x.status !== "completed" && x.status !== "cancelled"));
      setOrders(o.filter((x) => x.status !== "completed" && x.status !== "cancelled"));
    } catch {
      setBatches([]);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rows = useMemo(() => {
    const all = [...batches.map(batchRow), ...orders.map(orderRow)];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (r) => r.number.toLowerCase().includes(q) || r.product.toLowerCase().includes(q) || r.status.toLowerCase().includes(q),
    );
  }, [batches, orders, search]);

  const releaseToWms = (row: Row) => {
    if (row.hasShortages) {
      toast.error("Nie można wydać do WMS — braki materiałów.");
      return;
    }
    toast.success(`Zlecenie ${row.number} dostępne w terminalu WMS → Zbieranie.`);
    window.open(wmsProductionPaths.collecting(), "_blank", "noopener,noreferrer");
  };

  if (warehouseId == null) {
    return <p className="px-4 py-8 text-sm text-slate-500">Wybierz magazyn, aby zarządzać zleceniami.</p>;
  }

  return (
    <div className="space-y-4 px-4 pb-10 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Zlecenia produkcyjne</h2>
          <p className="text-sm text-slate-500">Tworzenie i planowanie w ERP — wydanie do wykonania w WMS.</p>
        </div>
        <Link
          to={erpProductionPaths.planning}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Utwórz zlecenie
        </Link>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Szukaj numeru, produktu, statusu…"
          className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3 text-sm"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Zlecenie</th>
              <th className="px-4 py-3">Produkt</th>
              <th className="px-4 py-3">Ilość</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Data plan.</th>
              <th className="px-4 py-3">Operator</th>
              <th className="px-4 py-3">Priorytet</th>
              <th className="px-4 py-3 text-right">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-slate-500">
                  Wczytywanie…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-slate-500">
                  Brak aktywnych zleceń.{" "}
                  <Link to={erpProductionPaths.planning} className="font-medium text-slate-800 underline">
                    Zaplanuj produkcję
                  </Link>
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={`${r.kind}-${r.id}`} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-mono font-medium text-slate-900">
                    {r.number}
                    <span className="ml-2 text-[10px] uppercase text-slate-400">{r.kind === "batch" ? "partia" : "MO"}</span>
                  </td>
                  <td className="px-4 py-3 max-w-[200px] truncate text-slate-700">{r.product}</td>
                  <td className="px-4 py-3 tabular-nums">{r.qty}</td>
                  <td className="px-4 py-3">
                    <span className={r.kind === "batch" ? batchStatusBadgeClass(r.status as never) : productionStatusBadgeClass(r.status as never)}>
                      {r.kind === "batch" ? BATCH_STATUS_LABEL[r.status as keyof typeof BATCH_STATUS_LABEL] : PRODUCTION_STATUS_LABEL[r.status as keyof typeof PRODUCTION_STATUS_LABEL]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.date}</td>
                  <td className="px-4 py-3 text-slate-600">{r.operator}</td>
                  <td className="px-4 py-3">
                    <span className={r.priority === "Wysoki" || r.priority === "Zablokowane" ? "text-amber-700 font-medium" : "text-slate-600"}>
                      {r.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Link
                        to={r.kind === "batch" ? erpProductionPaths.batch(r.id) : erpProductionPaths.orders}
                        className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Szczegóły
                      </Link>
                      {(r.status === "planned" || r.status === "draft") && r.kind === "batch" ? (
                        <button
                          type="button"
                          onClick={() => releaseToWms(r)}
                          className="inline-flex items-center gap-1 rounded border border-slate-800 bg-slate-800 px-2 py-1 text-xs font-medium text-white hover:bg-slate-900"
                        >
                          Wydaj do WMS
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </button>
                      ) : null}
                    </div>
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
