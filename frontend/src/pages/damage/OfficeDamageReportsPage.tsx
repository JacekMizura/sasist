import { useEffect, useMemo, useState } from "react";
import PageLayout from "../../components/layout/PageLayout";
import { PageHeader } from "../../components/layout/PageHeader";
import { createDamageReport, listDamageEntries } from "../../api/damageReportsApi";
import { generateDamageReportPDF } from "../../pdf/generateDamageReportPDF";
import type { DamageEntry } from "../../types/damageReport";
import { useWarehouse } from "../../context/WarehouseContext";
import { DAMAGE_TENANT_ID } from "./damageShared";

function fmtPln(v: number): string {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 2 }).format(v);
}

export default function OfficeDamageReportsPage() {
  const { warehouse: activeWarehouse, showWarehouseSelector } = useWarehouse();
  const warehouseId = activeWarehouse?.id ?? null;
  const [rows, setRows] = useState<DamageEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [createdBy, setCreatedBy] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (warehouseId == null) return;
    void (async () => {
      setLoading(true);
      try {
        const data = await listDamageEntries(DAMAGE_TENANT_ID, warehouseId, ["REVIEWED"]);
        setRows(data);
      } finally {
        setLoading(false);
      }
    })();
  }, [warehouseId]);

  const totalSelected = useMemo(
    () => rows.filter((r) => selectedIds.includes(r.id)).reduce((s, r) => s + Number(r.total_value || 0), 0),
    [rows, selectedIds]
  );

  return (
    <PageLayout>
        <PageHeader title="Office - Raporty szkód" actions={<span className="text-xs text-slate-500">/office/damage-reports</span>} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {showWarehouseSelector ? (
            <div className="text-sm text-slate-600 md:col-span-3">
              Magazyn: <span className="font-semibold text-slate-800">{activeWarehouse?.name ?? "—"}</span>
              <span className="text-slate-500"> — wybór w pasku u góry</span>
            </div>
          ) : null}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Utworzył raport</label>
            <input value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className="w-full rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
              onClick={async () => {
                if (warehouseId == null) return;
                if (selectedIds.length === 0) {
                  alert("Wybierz pozycje REVIEWED.");
                  return;
                }
                const report = await createDamageReport({
                  tenant_id: DAMAGE_TENANT_ID,
                  warehouse_id: warehouseId,
                  created_by: createdBy || undefined,
                  entry_ids: selectedIds,
                });
                await generateDamageReportPDF(report);
                const refreshed = await listDamageEntries(DAMAGE_TENANT_ID, warehouseId, ["REVIEWED"]);
                setRows(refreshed);
                setSelectedIds([]);
              }}
            >
              Generuj protokół szkody
            </button>
          </div>
        </div>

      <div className="text-sm text-slate-600">
        Wybrano: <span className="font-semibold text-slate-900">{selectedIds.length}</span> • Wartość: <span className="font-semibold text-slate-900">{fmtPln(totalSelected)}</span>
      </div>

      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left"></th>
              <th className="px-3 py-2 text-left">Produkt</th>
              <th className="px-3 py-2 text-left">Lokalizacja</th>
              <th className="px-3 py-2 text-right">Ilość</th>
              <th className="px-3 py-2 text-left">Decyzja</th>
              <th className="px-3 py-2 text-right">Wartość</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-3 py-3 text-slate-500" colSpan={6}>Ładowanie...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-3 py-3 text-slate-500" colSpan={6}>Brak pozycji REVIEWED.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(r.id)}
                    onChange={(e) => setSelectedIds((prev) => e.target.checked ? [...prev, r.id] : prev.filter((x) => x !== r.id))}
                  />
                </td>
                <td className="px-3 py-2">{r.product_name}</td>
                <td className="px-3 py-2">{r.location_label ?? r.location_uuid}</td>
                <td className="px-3 py-2 text-right">{r.quantity}</td>
                <td className="px-3 py-2">{r.decision || "—"}</td>
                <td className="px-3 py-2 text-right font-semibold">{fmtPln(r.total_value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageLayout>
  );
}

