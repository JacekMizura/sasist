import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/axios";
import { BarcodeIcon, ChevronIcon } from "./CartsComponents/ui/Icons";

type Basket = {
  id: number;
  row: number;
  column: number;
  length: number;
  width: number;
  height: number;
  order_id?: number;
  barcode?: string;
};

type LabelPack = { id: number; name: string };

export default function CartDetails() {
  const { id } = useParams();
  const [cart, setCart] = useState<any>(null);
  const [editing, setEditing] = useState<Basket | null>(null);
  const [labelsDropdownOpen, setLabelsDropdownOpen] = useState(false);
  const [labelPacks, setLabelPacks] = useState<LabelPack[]>([]);

  const load = async () => {
    const res = await api.get(`/carts/${id}/`);
    setCart(res.data);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!labelsDropdownOpen || !id) return;
    api.get<LabelPack[]>("/label-packs/", { params: { tenant_id: 1 } })
      .then((res) => setLabelPacks(Array.isArray(res.data) ? res.data : []))
      .catch(() => setLabelPacks([]));
  }, [labelsDropdownOpen, id]);

  const deleteBasket = async (basketId: number) => {
    await api.delete(`/carts/basket/${basketId}/`);
    load();
  };

  const saveBasket = async () => {
    if (!editing) return;

    await api.put(`/carts/basket/${editing.id}/`, {
      length: editing.length,
      width: editing.width,
      height: editing.height
    });

    setEditing(null);
    load();
  };

  const downloadLabelPdf = async (path: string, filename: string, method: "GET" | "POST" = "GET", body?: object) => {
    if (!id) return;
    try {
      const res = method === "POST"
        ? await api.post(path, body ?? {}, { responseType: "blob" })
        : await api.get(path, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.setAttribute("download", filename);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      // ignore
    } finally {
      setLabelsDropdownOpen(false);
    }
  };

  const downloadPackPdf = (packId: number) => {
    downloadLabelPdf(`/label-packs/${packId}/generate/`, `cart-${id}-labels-pack.pdf`, "POST", { cart_id: Number(id) });
  };

  if (!cart) return <div>Ładowanie...</div>;

  const maxWidth = Math.max(...cart.baskets.map((b: Basket) => b.width));
  const maxHeight = Math.max(...cart.baskets.map((b: Basket) => b.height));

  return (
    <div className="space-y-8">

      {/* HEADER */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold">{cart.name}</div>
          {cart.barcode && (
            <div className="mt-1 text-sm text-slate-500">Kod kreskowy: {cart.barcode}</div>
          )}
          <div className="mt-3 flex gap-8 text-sm text-gray-600">
            <div>Wszystkie: {cart.total_baskets ?? cart.baskets?.length}</div>
            <div>Wolne: {cart.free_baskets ?? (cart.baskets?.filter((b: Basket) => !b.order_id).length ?? 0)}</div>
            <div>Zajęte: {cart.used_baskets ?? cart.baskets_used ?? 0}</div>
            <div>Zajętość: {cart.fill_percent ?? (cart.total_volume_dm3 ? Math.round(((cart.used_volume ?? 0) / cart.total_volume_dm3) * 100) : 0)}%</div>
          </div>
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setLabelsDropdownOpen((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
          >
            <BarcodeIcon className="w-4 h-4" />
            Labels
            <ChevronIcon className="w-4 h-4" />
          </button>
          {labelsDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                aria-hidden
                onClick={() => setLabelsDropdownOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 z-20 py-1 min-w-[200px] rounded-lg bg-white border border-slate-200 shadow-lg">
                <button
                  type="button"
                  onClick={() => downloadLabelPdf(`/carts/${id}/labels/`, `cart-${id}-labels.pdf`)}
                  className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                >
                  Cart label
                </button>
                <button
                  type="button"
                  onClick={() => downloadLabelPdf(`/carts/${id}/basket-labels/`, `cart-${id}-basket-labels.pdf`)}
                  className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                >
                  Basket labels
                </button>
                {labelPacks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => downloadPackPdf(labelPacks[0].id)}
                    className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                  >
                    Cart + baskets
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* GRID */}
      <div className="bg-white p-6 rounded-xl shadow">
        <div
          className="grid gap-6"
          style={{
            gridTemplateColumns: `repeat(${Math.max(...cart.baskets.map((b: Basket) => b.column))}, auto)`
          }}
        >
          {cart.baskets.map((b: Basket) => {

            const widthPercent = (b.width / maxWidth) * 120;
            const heightPercent = (b.height / maxHeight) * 120;

            return (
              <div
                key={b.id}
                className={`rounded flex flex-col justify-between p-2 text-xs cursor-pointer transition ${
                  b.order_id ? "bg-red-200" : "bg-green-200"
                }`}
                style={{
                  width: widthPercent,
                  height: heightPercent
                }}
                onClick={() => setEditing(b)}
              >
                <div>R{b.row} C{b.column}</div>
                {b.barcode && <div className="font-mono text-[10px] truncate" title={b.barcode}>{b.barcode}</div>}
                <div>{b.length}×{b.width}×{b.height}</div>
                <button
                  className="text-red-600 text-[10px]"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteBasket(b.id);
                  }}
                >
                  Usuń
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL */}
      {editing && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center">
          <div className="bg-white p-6 rounded-xl space-y-4 w-80">
            <div className="text-lg font-semibold">
              Edycja koszyka
            </div>

            <input
              type="number"
              value={editing.length}
              onChange={(e) =>
                setEditing({ ...editing, length: Number(e.target.value) })
              }
              className="border p-2 w-full"
              placeholder="Długość"
            />

            <input
              type="number"
              value={editing.width}
              onChange={(e) =>
                setEditing({ ...editing, width: Number(e.target.value) })
              }
              className="border p-2 w-full"
              placeholder="Szerokość"
            />

            <input
              type="number"
              value={editing.height}
              onChange={(e) =>
                setEditing({ ...editing, height: Number(e.target.value) })
              }
              className="border p-2 w-full"
              placeholder="Wysokość"
            />

            <div className="flex justify-between">
              <button
                onClick={() => setEditing(null)}
                className="bg-gray-200 px-4 py-2 rounded"
              >
                Anuluj
              </button>

              <button
                onClick={saveBasket}
                className="bg-blue-600 text-white px-4 py-2 rounded"
              >
                Zapisz
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}