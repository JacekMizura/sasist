import { useEffect, useState, useCallback } from "react";
import api from "../api/axios";
import { UI_STRINGS } from "../constants/uiStrings";
import PageLayout from "../components/layout/PageLayout";

type Tenant = { id: number; name: string };
type Warehouse = { id: number; name: string };

type InventoryRow = {
  id: number;
  tenant_id: number;
  product_id: number;
  warehouse_id: number;
  location_id: number;
  quantity: number;
  reserved_quantity?: number;
  available_quantity?: number;
  tenant_name?: string;
  product_name?: string;
  warehouse_name?: string;
  location_name?: string;
};

export default function InventoryList() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [tenantFilter, setTenantFilter] = useState<number | null>(null);
  const [warehouseFilter, setWarehouseFilter] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchInventory = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (tenantFilter != null) params.set("tenant_id", String(tenantFilter));
    if (warehouseFilter != null) params.set("warehouse_id", String(warehouseFilter));
    api
      .get<InventoryRow[]>(`/inventory/?${params.toString()}`)
      .then((res) => setRows(Array.isArray(res.data) ? res.data : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [tenantFilter, warehouseFilter]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  useEffect(() => {
    api.get<Tenant[]>("/tenants/").then((r) => setTenants(Array.isArray(r.data) ? r.data : [])).catch(() => setTenants([]));
    api.get<Warehouse[]>("/warehouses/").then((r) => setWarehouses(Array.isArray(r.data) ? r.data : [])).catch(() => setWarehouses([]));
  }, []);

  return (
    <PageLayout title={UI_STRINGS.navigation.inventory}>
      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Tenant</span>
          <select
            value={tenantFilter ?? ""}
            onChange={(e) => setTenantFilter(e.target.value === "" ? null : Number(e.target.value))}
            className="border rounded px-2 py-1.5 text-sm min-w-[160px]"
          >
            <option value="">All tenants</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Warehouse</span>
          <select
            value={warehouseFilter ?? ""}
            onChange={(e) => setWarehouseFilter(e.target.value === "" ? null : Number(e.target.value))}
            className="border rounded px-2 py-1.5 text-sm min-w-[160px]"
          >
            <option value="">All warehouses</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="text-slate-500">Ładowanie…</p>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="py-3 px-4">Tenant</th>
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4">Warehouse</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4 text-right">Quantity</th>
                <th className="py-3 px-4 text-right">Reserved</th>
                <th className="py-3 px-4 text-right">Available</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-500">
                    Brak stanów magazynowych. Inventory jest per tenant, product, location.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="py-3 px-4">{r.tenant_name ?? `#${r.tenant_id}`}</td>
                    <td className="py-3 px-4">{r.product_name ?? `#${r.product_id}`}</td>
                    <td className="py-3 px-4">{r.warehouse_name ?? `#${r.warehouse_id}`}</td>
                    <td className="py-3 px-4">{r.location_name ?? `#${r.location_id}`}</td>
                    <td className="py-3 px-4 text-right font-medium">{Number(r.quantity)}</td>
                    <td className="py-3 px-4 text-right text-amber-700">{Number(r.reserved_quantity ?? 0)}</td>
                    <td className="py-3 px-4 text-right text-slate-700">{Number(r.available_quantity ?? r.quantity)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </PageLayout>
  );
}
