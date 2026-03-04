import { useState } from "react";
import api from "../api/axios";

export default function Setup() {
  const [tenantName, setTenantName] = useState("");
  const [warehouseName, setWarehouseName] = useState("");
  const [tenantId, setTenantId] = useState<number | null>(null);

  const createTenant = async () => {
    const res = await api.post("/tenants/", { name: tenantName });
    setTenantId(res.data.id);
    alert("Tenant utworzony");
  };

  const createWarehouse = async () => {
    if (!tenantId) return alert("Najpierw utwórz tenant");
    await api.post(`/tenants/${tenantId}/warehouses/`, { name: warehouseName });
    alert("Magazyn utworzony");
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-800">Ustawienia systemu</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
        <h2 className="text-lg font-medium text-gray-700 border-b border-gray-100 pb-3">Tenant</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-600 block mb-1">Nazwa tenanta</span>
            <input
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="np. Firma ABC"
            />
          </label>
          <button
            onClick={createTenant}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Utwórz tenant
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
        <h2 className="text-lg font-medium text-gray-700 border-b border-gray-100 pb-3">Magazyn</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-600 block mb-1">Nazwa magazynu</span>
            <input
              value={warehouseName}
              onChange={(e) => setWarehouseName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="np. Magazyn centralny"
            />
          </label>
          <button
            onClick={createWarehouse}
            disabled={!tenantId}
            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Utwórz magazyn
          </button>
          {!tenantId && (
            <p className="text-xs text-gray-500">Najpierw utwórz tenant.</p>
          )}
        </div>
      </div>
    </div>
  );
}
