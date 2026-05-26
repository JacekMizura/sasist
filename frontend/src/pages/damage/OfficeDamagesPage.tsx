import { useEffect, useMemo, useState } from "react";
import PageLayout from "../../components/layout/PageLayout";
import { PageHeader } from "../../components/layout/PageHeader";
import { listDamageEntries, reviewDamageEntry } from "../../api/damageReportsApi";
import { resolveDamageMediaUrl } from "../../utils/resolveDamageMediaUrl";
import type { DamageDecision, DamageEntry, DamageType } from "../../types/damageReport";
import { useWarehouse } from "../../context/WarehouseContext";
import { DAMAGE_TENANT_ID } from "./damageShared";

const DECISIONS: DamageDecision[] = ["SELLABLE", "REPAIR", "RETURN_TO_SUPPLIER", "DISPOSE"];
const TYPES: DamageType[] = ["mechanical", "missing_parts", "flood", "other"];

export default function OfficeDamagesPage() {
  const { warehouse: activeWarehouse, warehouses, showWarehouseSelector } = useWarehouse();
  const warehouseId = activeWarehouse?.id ?? null;
  const [rows, setRows] = useState<DamageEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<DamageEntry | null>(null);
  const [damageType, setDamageType] = useState<DamageType>("mechanical");
  const [description, setDescription] = useState("");
  const [decision, setDecision] = useState<DamageDecision>("REPAIR");
  const [reviewedBy, setReviewedBy] = useState("");

  useEffect(() => {
    if (warehouseId == null) return;
    void (async () => {
      setLoading(true);
      try {
        const data = await listDamageEntries(DAMAGE_TENANT_ID, warehouseId, ["NEW", "REVIEWED"]);
        setRows(data);
      } finally {
        setLoading(false);
      }
    })();
  }, [warehouseId]);

  const warehouseName = useMemo(
    () => activeWarehouse?.name ?? warehouses.find((w) => w.id === warehouseId)?.name ?? "—",
    [activeWarehouse?.name, warehouses, warehouseId]
  );

  return (
    <PageLayout>
      <PageHeader title="Office - Szkody" actions={<span className="text-xs text-slate-500">/office/damages</span>} />
      {showWarehouseSelector ? (
        <p className="text-sm text-slate-600">
          Magazyn: <span className="font-semibold text-slate-800">{warehouseName}</span>
          <span className="text-slate-500"> — wybór w pasku u góry</span>
        </p>
      ) : null}

      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">Produkt</th>
              <th className="px-3 py-2 text-right">Ilość</th>
              <th className="px-3 py-2 text-left">Lokalizacja</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Decyzja</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-3 py-3 text-slate-500" colSpan={5}>Ładowanie...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-3 py-3 text-slate-500" colSpan={5}>Brak wpisów NEW/REVIEWED.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => {
                setSelected(r);
                setDamageType((r.damage_type ?? "mechanical") as DamageType);
                setDescription(r.description ?? "");
                setDecision((r.decision ?? "REPAIR") as DamageDecision);
              }}>
                <td className="px-3 py-2">{r.product_name}</td>
                <td className="px-3 py-2 text-right">{r.quantity}</td>
                <td className="px-3 py-2">{r.location_label ?? r.location_uuid}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2">{r.decision ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 z-[90] bg-black/30" onClick={() => setSelected(null)}>
          <aside
            className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{selected.product_name}</h3>
                <p className="text-xs text-slate-500">{selected.sku || "—"} • {selected.location_label ?? selected.location_uuid} • {warehouseName}</p>
              </div>
              <button type="button" className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100" onClick={() => setSelected(null)}>Zamknij</button>
            </div>

            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              {(selected.photo_urls?.length ? selected.photo_urls : [selected.photo_url]).filter(Boolean).map((url, i) => (
                <img
                  key={i}
                  src={resolveDamageMediaUrl(url)}
                  alt={i === 0 ? "Damage evidence" : `Damage evidence ${i + 1}`}
                  className="mb-2 max-h-72 w-full rounded-md object-contain bg-white last:mb-0"
                />
              ))}
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Typ szkody</label>
                <select value={damageType} onChange={(e) => setDamageType(e.target.value as DamageType)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm">
                  {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Opis</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Decyzja</label>
                <div className="space-y-2 rounded-md border border-slate-200 p-3">
                  {DECISIONS.map((d) => (
                    <label key={d} className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="radio" name="decision" checked={decision === d} onChange={() => setDecision(d)} />
                      <span>{d}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Reviewed by</label>
                <input value={reviewedBy} onChange={(e) => setReviewedBy(e.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                  onClick={async () => {
                    const reviewed = await reviewDamageEntry(selected.id, DAMAGE_TENANT_ID, {
                      damage_type: damageType,
                      description: description || undefined,
                      decision,
                      reviewed_by: reviewedBy || undefined,
                    });
                    setRows((prev) => prev.map((x) => (x.id === reviewed.id ? reviewed : x)));
                    setSelected(reviewed);
                  }}
                >
                  Zapisz i oznacz REVIEWED
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </PageLayout>
  );
}

