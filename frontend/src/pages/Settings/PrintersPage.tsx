import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import type { Printer } from "../../types/printer";
import type { PrinterProfile } from "../../types/printerProfiles";

const TENANT_ID = 1;

type Warehouse = { id: number; name: string };

export default function PrintersPage() {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    profile_id: null as number | null,
    warehouse_id: null as number | null,
    connection_type: "",
    description: "",
    provider: "",
    system_printer_name: "",
  });

  const loadPrinters = useCallback(async () => {
    try {
      const res = await api.get<Printer[]>("/printers/", { params: { tenant_id: TENANT_ID } });
      setPrinters(Array.isArray(res.data) ? res.data : []);
    } catch {
      setPrinters([]);
    }
  }, []);

  const loadProfiles = useCallback(async () => {
    try {
      const res = await api.get<PrinterProfile[]>("/printer-profiles/", { params: { tenant_id: TENANT_ID } });
      setProfiles(Array.isArray(res.data) ? res.data : []);
    } catch {
      setProfiles([]);
    }
  }, []);

  const loadWarehouses = useCallback(async () => {
    try {
      const res = await api.get<Warehouse[]>(`/tenants/${TENANT_ID}/warehouses/`);
      setWarehouses(Array.isArray(res.data) ? res.data : []);
    } catch {
      setWarehouses([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadPrinters(), loadProfiles(), loadWarehouses()]);
      setLoading(false);
    })();
  }, [loadPrinters, loadProfiles, loadWarehouses]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      name: "",
      profile_id: null,
      warehouse_id: null,
      connection_type: "",
      description: "",
      provider: "",
      system_printer_name: "",
    });
    setFormOpen(true);
  };

  const openEdit = (p: Printer) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      profile_id: p.profile_id ?? null,
      warehouse_id: p.warehouse_id ?? null,
      connection_type: p.connection_type ?? "",
      description: p.description ?? "",
      provider: p.provider ?? "",
      system_printer_name: p.system_printer_name ?? "",
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
  };

  const saveForm = async () => {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      profile_id: form.profile_id ?? undefined,
      warehouse_id: form.warehouse_id ?? undefined,
      connection_type: form.connection_type.trim() || undefined,
      description: form.description.trim() || undefined,
      provider: form.provider.trim() || undefined,
      system_printer_name: form.system_printer_name.trim() || undefined,
    };
    try {
      if (editingId != null) {
        await api.put(`/printers/${editingId}/`, payload, { params: { tenant_id: TENANT_ID } });
      } else {
        await api.post("/printers/", payload, { params: { tenant_id: TENANT_ID } });
      }
      await loadPrinters();
      closeForm();
    } catch (e) {
      console.error("Save printer failed:", e);
    }
  };

  const deletePrinter = async (id: number) => {
    if (!window.confirm("Usunąć tę drukarkę?")) return;
    try {
      await api.delete(`/printers/${id}/`, { params: { tenant_id: TENANT_ID } });
      await loadPrinters();
    } catch (e) {
      console.error("Delete printer failed:", e);
    }
  };

  const profileName = (id: number | null | undefined) => {
    if (id == null) return "—";
    return profiles.find((pr) => pr.id === id)?.name ?? `#${id}`;
  };

  const warehouseName = (id: number | null | undefined) => {
    if (id == null) return "—";
    return warehouses.find((w) => w.id === id)?.name ?? `#${id}`;
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <p className="text-gray-500">Ładowanie…</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/setup" className="text-slate-600 hover:text-slate-800 text-sm">
          ← Ustawienia
        </Link>
        <h1 className="text-2xl font-semibold text-gray-800">Drukarki</h1>
      </div>

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-lg font-medium text-gray-700">Lista drukarek</h2>
          <button
            type="button"
            onClick={openCreate}
            className="px-4 py-2 bg-cyan-600 text-white text-sm font-medium rounded-lg hover:bg-cyan-700 transition-colors"
          >
            Dodaj drukarkę
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-600 font-medium">
                <th className="p-3">Nazwa</th>
                <th className="p-3">Profil</th>
                <th className="p-3">Magazyn</th>
                <th className="p-3">Typ połączenia</th>
                <th className="p-3">System printer</th>
                <th className="p-3 w-28">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {printers.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-gray-500 text-center">
                    Brak drukarek. Kliknij „Dodaj drukarkę”.
                  </td>
                </tr>
              )}
              {printers.map((p) => (
                <tr key={p.id} className="border-t border-gray-100 hover:bg-slate-50/50">
                  <td className="p-3 font-medium text-gray-800">{p.name}</td>
                  <td className="p-3 text-gray-600">{profileName(p.profile_id)}</td>
                  <td className="p-3 text-gray-600">{warehouseName(p.warehouse_id)}</td>
                  <td className="p-3 text-gray-600">{p.connection_type ?? "—"}</td>
                  <td className="p-3 text-gray-600">{p.system_printer_name ?? "—"}</td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="text-cyan-600 hover:text-cyan-800 text-xs font-medium"
                      >
                        Edytuj
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePrinter(p.id)}
                        className="text-red-600 hover:text-red-800 text-xs font-medium"
                      >
                        Usuń
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {formOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={closeForm}>
          <div
            className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 w-full max-w-md space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-medium text-gray-800">
              {editingId != null ? "Edytuj drukarkę" : "Nowa drukarka"}
            </h3>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Nazwa *</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="np. Drukarka etykiet 1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Profil</label>
              <select
                value={form.profile_id ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, profile_id: e.target.value ? Number(e.target.value) : null }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">— wybierz —</option>
                {profiles.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Magazyn (opcjonalnie)</label>
              <select
                value={form.warehouse_id ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, warehouse_id: e.target.value ? Number(e.target.value) : null }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">— wybierz —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Typ połączenia</label>
              <input
                value={form.connection_type}
                onChange={(e) => setForm((f) => ({ ...f, connection_type: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="np. USB, sieć"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Opis</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm min-h-[80px]"
                placeholder="Opcjonalny opis"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Provider (np. qz)</label>
              <input
                value={form.provider}
                onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="qz"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">System printer name (QZ)</label>
              <input
                value={form.system_printer_name}
                onChange={(e) => setForm((f) => ({ ...f, system_printer_name: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="np. Zebra GK420"
              />
              <p className="text-xs text-gray-500 mt-1">Use &quot;Detect system printers&quot; in the label queue to see names.</p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={saveForm}
                disabled={!form.name.trim()}
                className="px-4 py-2 bg-cyan-600 text-white text-sm font-medium rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Zapisz
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200"
              >
                Anuluj
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
