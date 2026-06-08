import { useState } from "react";
import toast from "react-hot-toast";

import {
  mapInventoryUnknownProduct,
  rejectInventoryUnknownProduct,
  type InventoryUnknownProductRead,
} from "@/api/inventoryCountApi";
import { searchProductsCatalog, type ProductSearchHit } from "@/api/productsSearchApi";
import { InventorySection } from "./InventoryPageShell";

type Props = {
  tenantId: number;
  items: InventoryUnknownProductRead[];
  loading?: boolean;
  onChanged: () => void;
};

export default function InventoryUnknownProductsPanel({ tenantId, items, loading, onChanged }: Props) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [searchById, setSearchById] = useState<Record<number, string>>({});
  const [hitsById, setHitsById] = useState<Record<number, ProductSearchHit[]>>({});

  if (loading) return <p className="px-3 py-4 text-xs text-slate-500">Wczytywanie…</p>;
  if (items.length === 0) return null;

  const runSearch = async (id: number, q: string) => {
    setSearchById((s) => ({ ...s, [id]: q }));
    if (q.trim().length < 2) {
      setHitsById((h) => ({ ...h, [id]: [] }));
      return;
    }
    const hits = await searchProductsCatalog(tenantId, q, 8);
    setHitsById((h) => ({ ...h, [id]: hits }));
  };

  const mapProduct = async (unknownId: number, productId: number) => {
    setBusyId(unknownId);
    try {
      await mapInventoryUnknownProduct(tenantId, unknownId, productId);
      toast.success("Przypisano produkt.");
      onChanged();
    } catch {
      toast.error("Nie udało się przypisać produktu.");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (unknownId: number) => {
    setBusyId(unknownId);
    try {
      await rejectInventoryUnknownProduct(tenantId, unknownId, "Odrzucono przez supervisora");
      toast.success("Odrzucono skan.");
      onChanged();
    } catch {
      toast.error("Nie udało się odrzucić.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <InventorySection title={`Nieznane produkty (${items.length})`}>
      <div className="divide-y divide-slate-100">
        {items.map((u) => (
          <div key={u.id} className="space-y-2 px-3 py-2 text-xs">
            <p className="font-bold text-slate-900">{u.temporary_name}</p>
            <p className="text-slate-600">
              Lokalizacja #{u.location_id} · {u.quantity} szt.
              {u.barcode_value ? ` · ${u.barcode_value}` : ""}
            </p>
            <input
              className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
              placeholder="Szukaj produktu do przypisania…"
              value={searchById[u.id] ?? ""}
              onChange={(e) => void runSearch(u.id, e.target.value)}
            />
            {(hitsById[u.id] ?? []).length > 0 ? (
              <ul className="max-h-24 overflow-auto rounded border border-slate-100">
                {(hitsById[u.id] ?? []).map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={busyId === u.id}
                      className="w-full px-2 py-1 text-left hover:bg-slate-50"
                      onClick={() => void mapProduct(u.id, p.id)}
                    >
                      {p.name ?? p.sku} <span className="text-slate-400">{p.sku ?? p.ean}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              disabled={busyId === u.id}
              onClick={() => void reject(u.id)}
              className="text-[11px] font-semibold text-rose-700 underline"
            >
              Odrzuć skan
            </button>
          </div>
        ))}
      </div>
    </InventorySection>
  );
}
