import { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { fetchTenantsList } from "../api/tenantsApi";
import { UI_STRINGS } from "../constants/uiStrings";
import PageLayout from "../components/layout/PageLayout";
import { PageModuleHeader } from "../components/layout/PageModuleHeader";
import { useWarehouse } from "../context/WarehouseContext";

type Tenant = { id: number; name: string };

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
  const { warehouse: activeWarehouse, showWarehouseSelector } = useWarehouse();
  const warehouseFilter = activeWarehouse?.id ?? null;

  const [searchParams] = useSearchParams();
  const productIdFromUrl = searchParams.get("product_id");
  const parsedProductId =
    productIdFromUrl != null && productIdFromUrl.trim() !== "" ? Number.parseInt(productIdFromUrl, 10) : null;
  const validProductId =
    parsedProductId != null && Number.isInteger(parsedProductId) && parsedProductId > 0 ? parsedProductId : null;

  const tenantIdFromUrl = searchParams.get("tenant_id");
  const parsedTenantFromUrl =
    tenantIdFromUrl != null && tenantIdFromUrl.trim() !== "" ? Number.parseInt(tenantIdFromUrl, 10) : null;
  const validTenantFromUrl =
    parsedTenantFromUrl != null && Number.isInteger(parsedTenantFromUrl) && parsedTenantFromUrl > 0
      ? parsedTenantFromUrl
      : null;

  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantFilter, setTenantFilter] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [inventoryDebug, setInventoryDebug] = useState(false);

  const fetchInventory = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (tenantFilter != null) params.set("tenant_id", String(tenantFilter));
    if (warehouseFilter != null) params.set("warehouse_id", String(warehouseFilter));
    if (validProductId != null) params.set("product_id", String(validProductId));
    if (inventoryDebug) params.set("inventory_debug", "true");
    api
      .get<InventoryRow[]>(`/inventory/?${params.toString()}`)
      .then((res) => setRows(Array.isArray(res.data) ? res.data : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [tenantFilter, warehouseFilter, validProductId, inventoryDebug]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  useEffect(() => {
    if (validTenantFromUrl != null) {
      setTenantFilter(validTenantFromUrl);
    }
  }, [validTenantFromUrl]);

  useEffect(() => {
    void fetchTenantsList().then(setTenants).catch(() => setTenants([]));
  }, []);

  return (
    <PageLayout>
      <PageModuleHeader title={UI_STRINGS.navigation.inventory} />
      {validProductId != null && (
        <div className="mb-3 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm text-cyan-900">
          Filtrowanie: produkt <span className="font-mono font-medium">#{validProductId}</span>
          {" · "}
          <Link to="/inventory" className="underline hover:text-cyan-700">
            Wyczyść filtr
          </Link>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Podmiot</span>
          <select
            value={tenantFilter ?? ""}
            onChange={(e) => setTenantFilter(e.target.value === "" ? null : Number(e.target.value))}
            className="border rounded px-2 py-1.5 text-sm min-w-[160px]"
          >
            <option value="">Wszystkie podmioty</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        {showWarehouseSelector ? (
          <p className="text-xs text-slate-600">
            Filtrowanie magazynu: <span className="font-medium text-slate-800">{activeWarehouse?.name ?? "—"}</span> (wybór w pasku u góry)
          </p>
        ) : null}
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={inventoryDebug}
            onChange={(e) => setInventoryDebug(e.target.checked)}
            className="rounded border-slate-300"
          />
          Tryb diagnostyczny (puste wiersze, zarchiwizowane produkty, nieaktywne lokalizacje, bufory techniczne: PRZYJĘCIE, RECEIVING, BUFOR itd.)
        </label>
      </div>

      {loading ? (
        <p className="text-slate-500">Ładowanie…</p>
      ) : (
        <div className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="py-3 px-4">Podmiot</th>
                <th className="py-3 px-4">Produkt</th>
                <th className="py-3 px-4">Magazyn</th>
                <th className="py-3 px-4">Lokalizacja</th>
                <th className="py-3 px-4 text-right">Ilość</th>
                <th className="py-3 px-4 text-right">Rezerwacja</th>
                <th className="py-3 px-4 text-right">Dostępne</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-500">
                    Brak widocznego stanu (tylko realne lokalizacje magazynowe). Włącz tryb diagnostyczny, aby zobaczyć
                    bufory techniczne i wiersze pomocnicze.
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
