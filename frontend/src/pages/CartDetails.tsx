import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/axios";

type Basket = {
  id: number;
  row: number;
  column: number;
  length: number;
  width: number;
  height: number;
  order_id?: number;
};

export default function CartDetails() {
  const { id } = useParams();
  const [cart, setCart] = useState<any>(null);
  const [editing, setEditing] = useState<Basket | null>(null);

  const load = async () => {
    const res = await api.get(`/carts/${id}/`);
    setCart(res.data);
  };

  useEffect(() => {
    load();
  }, []);

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

  if (!cart) return <div>Ładowanie...</div>;

  const maxWidth = Math.max(...cart.baskets.map((b: Basket) => b.width));
  const maxHeight = Math.max(...cart.baskets.map((b: Basket) => b.height));

  return (
    <div className="space-y-8">

      {/* HEADER */}
      <div>
        <div className="text-2xl font-semibold">{cart.name}</div>

        <div className="mt-3 flex gap-8 text-sm text-gray-600">
          <div>Wszystkie: {cart.total_baskets}</div>
          <div>Wolne: {cart.free_baskets}</div>
          <div>Zajęte: {cart.used_baskets}</div>
          <div>Zajętość: {cart.fill_percent}%</div>
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