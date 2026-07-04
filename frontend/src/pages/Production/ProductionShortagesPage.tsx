import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Plus, RefreshCw, ShoppingCart, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";

import {
  addShortageToPurchaseOrder,
  createMaterialSubstitute,
  createPurchaseRequisitionFromShortage,
  deleteMaterialSubstitute,
  fetchMaterialSubstitutes,
  fetchProductionShortagesQueue,
  type MaterialSubstitute,
  type ProductionShortageQueueRow,
} from "@/api/productionShortageApi";
import { listPurchaseOrders, type PurchaseOrderListRow } from "@/api/purchasingOrdersApi";
import { extractApiErrorMessage } from "@/api/apiErrorMessage";
import { LocationBadge } from "@/components/warehouse/LocationBadge";
import { useWarehouse } from "@/context/WarehouseContext";
import { erpProductionPaths } from "./productionPaths";

const DEFAULT_TENANT = 1;

const PRIORITY_CLASS: Record<string, string> = {
  CRITICAL: "bg-rose-100 text-rose-800",
  HIGH: "bg-orange-100 text-orange-900",
  MEDIUM: "bg-amber-50 text-amber-900",
  LOW: "bg-slate-100 text-slate-700",
};

export default function ProductionShortagesPage() {
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;

  const [rows, setRows] = useState<ProductionShortageQueueRow[]>([]);
  const [substitutes, setSubstitutes] = useState<MaterialSubstitute[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSubstitutes, setShowSubstitutes] = useState(false);
  const [poPickerFor, setPoPickerFor] = useState<ProductionShortageQueueRow | null>(null);
  const [openPos, setOpenPos] = useState<PurchaseOrderListRow[]>([]);
  const [poLoading, setPoLoading] = useState(false);

  const load = useCallback(async () => {
    if (warehouseId == null) return;
    setLoading(true);
    try {
      const [queue, subs] = await Promise.all([
        fetchProductionShortagesQueue(tenantId, warehouseId),
        fetchMaterialSubstitutes(tenantId),
      ]);
      setRows(queue);
      setSubstitutes(subs);
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, "Nie udało się wczytać braków produkcyjnych."));
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const createRequisition = async (row: ProductionShortageQueueRow) => {
    if (warehouseId == null) return;
    try {
      const result = await createPurchaseRequisitionFromShortage(tenantId, warehouseId, {
        component_product_id: row.component_product_id,
        quantity: row.missing_qty,
      });
      toast.success(`Utworzono zapotrzebowanie ${result.order_number}`);
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, "Nie udało się utworzyć zapotrzebowania."));
    }
  };

  const openPoPicker = async (row: ProductionShortageQueueRow) => {
    setPoPickerFor(row);
    setPoLoading(true);
    try {
      const { rows: pos } = await listPurchaseOrders({
        tenant_id: tenantId,
        status: "Draft",
        page: 1,
        page_size: 50,
      });
      setOpenPos(pos);
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, "Nie udało się wczytać zamówień zakupu."));
      setPoPickerFor(null);
    } finally {
      setPoLoading(false);
    }
  };

  const addToPo = async (poId: number) => {
    if (!poPickerFor || warehouseId == null) return;
    try {
      const result = await addShortageToPurchaseOrder(tenantId, warehouseId, {
        purchase_order_id: poId,
        component_product_id: poPickerFor.component_product_id,
        quantity: poPickerFor.missing_qty,
      });
      toast.success(`Dodano do ${result.order_number}`);
      setPoPickerFor(null);
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, "Nie udało się dodać do zamówienia."));
    }
  };

  if (warehouseId == null) {
    return <p className="px-4 py-6 text-sm text-slate-500">Wybierz magazyn.</p>;
  }

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Braki produkcyjne</h1>
          <p className="text-sm text-slate-500">
            Zablokowane partie i zlecenia z powodu brakujących surowców. Utwórz zapotrzebowanie zakupowe lub dodaj do
            istniejącego PO.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          Odśwież
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Wczytywanie…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 px-4 py-8 text-center text-sm text-emerald-800">
          Brak aktywnych braków produkcyjnych — wszystkie partie i MO mają wystarczające materiały.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Składnik</th>
                <th className="px-4 py-3 text-right">Brak</th>
                <th className="px-4 py-3 text-right">Partie</th>
                <th className="px-4 py-3 text-right">MO</th>
                <th className="px-4 py-3">Priorytet</th>
                <th className="px-4 py-3">Lokalizacje</th>
                <th className="px-4 py-3">ETA dostawy</th>
                <th className="px-4 py-3">Zamienniki</th>
                <th className="px-4 py-3">Zakupy</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.component_product_id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{r.product_name}</p>
                    {r.product_sku ? <p className="font-mono text-xs text-slate-500">{r.product_sku}</p> : null}
                    <p className="mt-1 text-xs text-slate-500">
                      Dostępne: {r.available_qty ?? "—"} / wymagane: {r.required_qty ?? "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-rose-700">{r.missing_qty}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.blocked_batches_count > 0 ? (
                      <span className="font-semibold text-amber-800">{r.blocked_batches_count}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.blocked_orders_count > 0 ? (
                      <span className="font-semibold text-amber-800">{r.blocked_orders_count}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${PRIORITY_CLASS[r.priority] ?? PRIORITY_CLASS.MEDIUM}`}
                    >
                      {r.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {r.locations.length ? (
                        r.locations.map((loc) => (
                          <span key={loc.location_id} className="inline-flex items-center gap-1 text-xs">
                            <LocationBadge code={loc.location_code} type="PICK" />
                            <span className="tabular-nums text-slate-600">{loc.available_qty}</span>
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{r.expected_availability_date ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    {r.substitute_proposals.length ? (
                      <ul className="space-y-1">
                        {r.substitute_proposals.slice(0, 2).map((s) => (
                          <li key={s.substitute_product_id} className="text-slate-700">
                            {s.substitute_product_name}{" "}
                            <span className="text-slate-500">
                              (×{s.conversion_ratio}, eff. {s.effective_qty})
                            </span>
                            {s.can_cover_shortage ? (
                              <span className="ml-1 font-semibold text-emerald-700">OK</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => void createRequisition(r)}
                        className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-2 py-1.5 text-xs font-bold text-white hover:bg-violet-700"
                      >
                        <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
                        Zapotrzebowanie
                      </button>
                      <button
                        type="button"
                        onClick={() => void openPoPicker(r)}
                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Dodaj do PO
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Zamienniki materiałów</h2>
            <p className="text-sm text-slate-500">Priorytet, współczynnik zamiany i aktywność — propozycje w planowaniu.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowSubstitutes((v) => !v)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {showSubstitutes ? "Ukryj" : "Zarządzaj"}
          </button>
        </div>
        {showSubstitutes ? (
          <SubstitutesPanel
            tenantId={tenantId}
            rows={substitutes}
            onChanged={() => void load()}
          />
        ) : substitutes.length > 0 ? (
          <p className="mt-3 text-sm text-slate-600">Zdefiniowano {substitutes.length} zamienników.</p>
        ) : null}
      </section>

      {poPickerFor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden />
              Dodaj do zamówienia zakupu
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {poPickerFor.product_name} · brak {poPickerFor.missing_qty}
            </p>
            {poLoading ? (
              <p className="mt-4 text-sm text-slate-500">Wczytywanie zamówień…</p>
            ) : openPos.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">Brak otwartych zamówień (Draft). Utwórz zapotrzebowanie.</p>
            ) : (
              <ul className="mt-4 max-h-60 space-y-2 overflow-y-auto">
                {openPos.map((po) => (
                  <li key={po.id}>
                    <button
                      type="button"
                      onClick={() => void addToPo(po.id)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-violet-300 hover:bg-violet-50"
                    >
                      <span className="font-mono font-semibold">{po.order_number}</span>
                      <span className="ml-2 text-slate-500">{po.supplier_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setPoPickerFor(null)}
              className="mt-4 w-full rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Anuluj
            </button>
          </div>
        </div>
      ) : null}

      <p className="text-xs text-slate-500">
        Powiązane partie:{" "}
        <Link to={erpProductionPaths.planning} className="font-semibold text-violet-700 hover:underline">
          Planowanie
        </Link>
        {" · "}
        <Link to={erpProductionPaths.orders} className="font-semibold text-violet-700 hover:underline">
          Zlecenia
        </Link>
      </p>
    </div>
  );
}

function SubstitutesPanel({
  tenantId,
  rows,
  onChanged,
}: {
  tenantId: number;
  rows: MaterialSubstitute[];
  onChanged: () => void;
}) {
  const [productId, setProductId] = useState("");
  const [substituteId, setSubstituteId] = useState("");
  const [priority, setPriority] = useState("10");
  const [ratio, setRatio] = useState("1");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const pid = Number(productId);
    const sid = Number(substituteId);
    if (!pid || !sid) {
      toast.error("Podaj ID produktu i zamiennika.");
      return;
    }
    setBusy(true);
    try {
      await createMaterialSubstitute(tenantId, {
        product_id: pid,
        substitute_product_id: sid,
        priority: Number(priority) || 10,
        conversion_ratio: Number(ratio) || 1,
      });
      toast.success("Zamiennik dodany.");
      setProductId("");
      setSubstituteId("");
      onChanged();
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, "Nie udało się dodać zamiennika."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await deleteMaterialSubstitute(tenantId, id);
      toast.success("Usunięto zamiennik.");
      onChanged();
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, "Nie udało się usunąć zamiennika."));
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-2 sm:grid-cols-5">
        <input
          type="number"
          placeholder="ID produktu (BOM)"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <input
          type="number"
          placeholder="ID zamiennika"
          value={substituteId}
          onChange={(e) => setSubstituteId(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <input
          type="number"
          placeholder="Priorytet"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <input
          type="number"
          step="0.01"
          placeholder="Współczynnik"
          value={ratio}
          onChange={(e) => setRatio(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void add()}
          className="inline-flex items-center justify-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Dodaj
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Brak zdefiniowanych zamienników.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-100">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Produkt</th>
                <th className="px-3 py-2 text-left">Zamiennik</th>
                <th className="px-3 py-2 text-right">Priorytet</th>
                <th className="px-3 py-2 text-right">Współcz.</th>
                <th className="px-3 py-2">Aktywny</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    {r.product_name}
                    {r.product_sku ? <span className="ml-1 font-mono text-xs text-slate-500">{r.product_sku}</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    {r.substitute_product_name}
                    {r.substitute_product_sku ? (
                      <span className="ml-1 font-mono text-xs text-slate-500">{r.substitute_product_sku}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.priority}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.conversion_ratio}</td>
                  <td className="px-3 py-2">{r.is_active ? "Tak" : "Nie"}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void remove(r.id)}
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Usuń"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
