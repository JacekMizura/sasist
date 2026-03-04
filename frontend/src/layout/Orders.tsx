import { useEffect, useState } from "react";
import api from "../api/axios";
import { useWarehouse } from "../context/WarehouseContext";

type OrderItem = {
  id: number;
  quantity: number;
};

type Order = {
  id: number;
  number?: string;
  city?: string;
  country?: string;
  value?: number;
  shipping_method?: string;
  status?: string;
  items?: OrderItem[];
};

export default function Orders() {
  const { warehouse } = useWarehouse();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!warehouse) return;

    setLoading(true);

    api
      .get(`/orders?tenant_id=1&warehouse_id=${warehouse.id}`)
      .then((res) => setOrders(res.data))
      .catch(() => console.log("Błąd pobierania zamówień"))
      .finally(() => setLoading(false));
  }, [warehouse]);

  if (!warehouse) {
    return (
      <div className="text-gray-500">
        Najpierw wybierz magazyn
      </div>
    );
  }

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "NEW":
        return "bg-blue-100 text-blue-800";
      case "ASSIGNED":
        return "bg-yellow-100 text-yellow-800";
      case "DONE":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-6">

      <div className="text-2xl font-semibold">
        Zamówienia — {warehouse.name}
      </div>

      {loading ? (
        <div>Ładowanie...</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-3">ID</th>
                <th className="p-3">Numer</th>
                <th className="p-3">Miasto</th>
                <th className="p-3">Kraj</th>
                <th className="p-3">Pozycje</th>
                <th className="p-3">Status</th>
                <th className="p-3">Wartość</th>
                <th className="p-3">Metoda wysyłki</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.id}
                  className="border-t hover:bg-gray-50 transition"
                >
                  <td className="p-3">{o.id}</td>
                  <td className="p-3 font-medium">
                    {o.number || "-"}
                  </td>
                  <td className="p-3">{o.city || "-"}</td>
                  <td className="p-3">{o.country || "-"}</td>

                  {/* LICZBA POZYCJI */}
                  <td className="p-3">
                    {o.items ? o.items.length : 0}
                  </td>

                  {/* STATUS */}
                  <td className="p-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadge(
                        o.status
                      )}`}
                    >
                      {o.status || "—"}
                    </span>
                  </td>

                  <td className="p-3">
                    {o.value ? `${o.value} zł` : "-"}
                  </td>

                  <td className="p-3">
                    {o.shipping_method || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}