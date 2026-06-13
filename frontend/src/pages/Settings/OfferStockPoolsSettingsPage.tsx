import { useCallback, useEffect, useState } from "react";
import { Layers } from "lucide-react";

import PageLayout from "../../components/layout/PageLayout";
import { PageHeader } from "../../components/layout/PageHeader";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { extractApiErrorMessage } from "../../api/apiErrorMessage";
import {
  createOfferStockPool,
  listOfferStockPools,
  patchOfferStockPool,
  type OfferStockPoolRead,
} from "../../api/offerStockPoolApi";

const TENANT_ID = DAMAGE_TENANT_ID;

export default function OfferStockPoolsSettingsPage() {
  const [pools, setPools] = useState<OfferStockPoolRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OfferStockPoolRead | null>(null);
  const [name, setName] = useState("");
  const [selectedWhIds, setSelectedWhIds] = useState<number[]>([]);
  const [isDefault, setIsDefault] = useState(false);

  const eligibleWarehouses = pools[0]?.eligible_warehouses ?? [];

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await listOfferStockPools(TENANT_ID);
      setPools(items);
    } catch (e) {
      setError(extractApiErrorMessage(e));
      setPools([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setSelectedWhIds(eligibleWarehouses.map((w) => w.id));
    setIsDefault(false);
    setModalOpen(true);
  };

  const openEdit = (pool: OfferStockPoolRead) => {
    setEditing(pool);
    setName(pool.name);
    setSelectedWhIds([...pool.warehouse_ids]);
    setIsDefault(pool.is_default);
    setModalOpen(true);
  };

  const toggleWh = (id: number) => {
    setSelectedWhIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].sort((a, b) => a - b),
    );
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Podaj nazwę puli.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await patchOfferStockPool({
          tenantId: TENANT_ID,
          poolId: editing.id,
          body: {
            name: trimmed,
            warehouse_ids: selectedWhIds,
            is_default: isDefault,
          },
        });
      } else {
        await createOfferStockPool({
          tenantId: TENANT_ID,
          name: trimmed,
          warehouseIds: selectedWhIds,
          isDefault,
        });
      }
      setModalOpen(false);
      await reload();
    } catch (e) {
      setError(extractApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const whLabel = (id: number): string =>
    eligibleWarehouses.find((w) => w.id === id)?.name ?? `Magazyn #${id}`;

  return (
    <PageLayout>
      <PageHeader
        title="Pule stanów"
        description="Określ, z których magazynów oferty pobierają dostępny stan (tylko magazyny w sieci stanu)."
        icon={Layers}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Ustawienia → Sprzedaż → Pule stanów. Oferta bez przypisanej puli korzysta z puli domyślnej.
        </p>
        <button
          type="button"
          onClick={openCreate}
          disabled={busy}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
        >
          + Nowa pula
        </button>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Ładowanie…</p>
      ) : pools.length === 0 ? (
        <p className="text-sm text-slate-500">Brak pul — zostanie utworzona pula domyślna przy pierwszym wejściu.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Nazwa</th>
                <th className="px-4 py-3">Magazyny</th>
                <th className="px-4 py-3">Domyślna</th>
                <th className="px-4 py-3">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {pools.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.warehouse_ids.length === 0
                      ? "—"
                      : p.warehouse_ids.map((id) => whLabel(id)).join(", ")}
                  </td>
                  <td className="px-4 py-3">{p.is_default ? "Tak" : "—"}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="text-sky-700 hover:underline"
                    >
                      Edytuj
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold text-slate-900">
              {editing ? "Edytuj pulę" : "Nowa pula stanów"}
            </h2>
            <label className="mb-4 block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Nazwa</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="np. Allegro Polska"
              />
            </label>
            <fieldset className="mb-4">
              <legend className="mb-2 text-sm font-medium text-slate-700">Magazyny w puli</legend>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
                {eligibleWarehouses.length === 0 ? (
                  <p className="text-sm text-slate-500">Brak magazynów w sieci stanu.</p>
                ) : (
                  eligibleWarehouses.map((w) => (
                    <label key={w.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedWhIds.includes(w.id)}
                        onChange={() => toggleWh(w.id)}
                      />
                      {w.name}
                    </label>
                  ))
                )}
              </div>
            </fieldset>
            <label className="mb-6 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                disabled={editing?.is_default && isDefault}
              />
              Pula domyślna (dla ofert bez przypisania)
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void save()}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {busy ? "Zapisywanie…" : "Zapisz"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageLayout>
  );
}
