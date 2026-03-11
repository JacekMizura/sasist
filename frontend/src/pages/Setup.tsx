import { useState, useEffect } from "react";
import api from "../api/axios";
import {
  warehouseService,
  type Warehouse,
  type TenantWarehouseAssignment,
} from "../services/warehouseService";

type Tenant = { id: number; name: string };

const ASSIGNMENT_ROLES = [
  { value: "owner", label: "Owner" },
  { value: "client", label: "Client" },
  { value: "operator", label: "Operator" },
] as const;

export default function Setup() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [assignments, setAssignments] = useState<TenantWarehouseAssignment[]>([]);

  const [tenantName, setTenantName] = useState("");
  const [warehouseName, setWarehouseName] = useState("");
  const [assignTenantId, setAssignTenantId] = useState<number | null>(null);
  const [assignWarehouseId, setAssignWarehouseId] = useState<number | null>(null);
  const [assignRole, setAssignRole] = useState<string>("operator");
  const [assignIsDefault, setAssignIsDefault] = useState(false);

  const loadTenants = async () => {
    const res = await api.get<Tenant[]>("/tenants/");
    setTenants(Array.isArray(res.data) ? res.data : []);
  };

  const loadWarehouses = async () => {
    const res = await warehouseService.getAllWarehouses();
    setWarehouses(Array.isArray(res.data) ? res.data : []);
  };

  const loadAssignments = async () => {
    const res = await warehouseService.getAssignments();
    setAssignments(Array.isArray(res.data) ? res.data : []);
  };

  useEffect(() => {
    loadTenants();
    loadWarehouses();
    loadAssignments();
  }, []);

  const createTenant = async () => {
    if (!tenantName.trim()) return;
    await api.post("/tenants/", { name: tenantName.trim() });
    setTenantName("");
    await loadTenants();
  };

  const createWarehouse = async () => {
    if (!warehouseName.trim()) return;
    await warehouseService.createWarehouseStandalone({ name: warehouseName.trim() });
    setWarehouseName("");
    await loadWarehouses();
  };

  const createAssignment = async () => {
    if (assignTenantId == null || assignWarehouseId == null) return;
    await warehouseService.createAssignment({
      tenant_id: assignTenantId,
      warehouse_id: assignWarehouseId,
      role: assignRole,
      is_default: assignIsDefault,
    });
    setAssignTenantId(null);
    setAssignWarehouseId(null);
    setAssignRole("operator");
    setAssignIsDefault(false);
    await loadAssignments();
  };

  const tenantById = (id: number) => tenants.find((t) => t.id === id)?.name ?? `#${id}`;
  const warehouseById = (id: number) => warehouses.find((w) => w.id === id)?.name ?? `#${id}`;

  return (
    <div className="space-y-8 max-w-3xl">
      <h1 className="text-2xl font-semibold text-gray-800">Ustawienia systemu</h1>

      {/* Tenants */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-medium text-gray-700 border-b border-gray-100 pb-3">Tenants</h2>
        <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
          {tenants.length === 0 && <li className="text-gray-400">Brak tenantów</li>}
          {tenants.map((t) => (
            <li key={t.id}>
              {t.name} <span className="text-gray-400">(id: {t.id})</span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 items-end">
          <label className="flex-1">
            <span className="text-sm font-medium text-gray-600 block mb-1">Nazwa tenanta</span>
            <input
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="np. Firma ABC"
            />
          </label>
          <button
            type="button"
            onClick={createTenant}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Utwórz tenant
          </button>
        </div>
      </section>

      {/* Warehouses */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-medium text-gray-700 border-b border-gray-100 pb-3">Warehouses</h2>
        <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
          {warehouses.length === 0 && <li className="text-gray-400">Brak magazynów</li>}
          {warehouses.map((w) => (
            <li key={w.id}>
              {w.name} <span className="text-gray-400">(id: {w.id})</span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 items-end">
          <label className="flex-1">
            <span className="text-sm font-medium text-gray-600 block mb-1">Nazwa magazynu</span>
            <input
              value={warehouseName}
              onChange={(e) => setWarehouseName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="np. Magazyn centralny"
            />
          </label>
          <button
            type="button"
            onClick={createWarehouse}
            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
          >
            Utwórz magazyn
          </button>
        </div>
      </section>

      {/* Assignments */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-medium text-gray-700 border-b border-gray-100 pb-3">Assignments</h2>
        <p className="text-sm text-gray-500">
          Przypisz tenant do magazynu z rolą (owner / client / operator). Jeden tenant może mieć wiele magazynów i
          odwrotnie.
        </p>
        <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
          {assignments.length === 0 && <li className="text-gray-400">Brak przypisań</li>}
          {assignments.map((a) => (
            <li key={a.id}>
              {tenantById(a.tenant_id)} → {warehouseById(a.warehouse_id)} ({a.role}
              {a.is_default ? ", default" : ""})
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label>
            <span className="text-sm font-medium text-gray-600 block mb-1">Tenant</span>
            <select
              value={assignTenantId ?? ""}
              onChange={(e) => setAssignTenantId(e.target.value ? Number(e.target.value) : null)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— wybierz —</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-sm font-medium text-gray-600 block mb-1">Magazyn</span>
            <select
              value={assignWarehouseId ?? ""}
              onChange={(e) => setAssignWarehouseId(e.target.value ? Number(e.target.value) : null)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— wybierz —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-sm font-medium text-gray-600 block mb-1">Rola</span>
            <select
              value={assignRole}
              onChange={(e) => setAssignRole(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            >
              {ASSIGNMENT_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              checked={assignIsDefault}
              onChange={(e) => setAssignIsDefault(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-600">Domyślny magazyn dla tenanta</span>
          </label>
        </div>
        <button
          type="button"
          onClick={createAssignment}
          disabled={assignTenantId == null || assignWarehouseId == null}
          className="px-4 py-2 bg-slate-700 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Utwórz przypisanie
        </button>
      </section>
    </div>
  );
}
