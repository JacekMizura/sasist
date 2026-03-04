import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { useWarehouse } from "../context/WarehouseContext";

type Warehouse = {
  id: number;
  name: string;
};

export default function MainLayout({ children }: { children: ReactNode }) {
  const { warehouse, setWarehouse } = useWarehouse();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  useEffect(() => {
    api
      .get("/tenants/1/warehouses")
      .then((res) => setWarehouses(res.data))
      .catch(() => console.log("Błąd pobierania magazynów"));
  }, []);

  const handleChange = (id: number) => {
    const selected = warehouses.find((w) => w.id === id);
    if (selected) {
      setWarehouse(selected);
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">

      {/* SIDEBAR */}
      <div className="w-60 bg-white shadow-md p-6 flex flex-col justify-between">

        <div>
          <h2 className="text-xl font-bold mb-8">WMS</h2>

          <nav className="flex flex-col gap-4 text-sm">
            <Link to="/dashboard" className="hover:text-blue-600">
              Dashboard
            </Link>
            <Link to="/import" className="hover:text-blue-600">
              Import
            </Link>
            <Link to="/products" className="hover:text-blue-600">
              Produkty
            </Link>
            <Link to="/orders" className="hover:text-blue-600">
              Zamówienia
            </Link>
            <Link to="/carts" className="hover:text-blue-600">
              Wózki
            </Link>
          </nav>
        </div>

        {/* SELECTOR MAGAZYNU */}
        <div className="mt-8">
          <div className="text-xs text-gray-500 mb-2">
            Aktywny magazyn
          </div>

          <select
            className="w-full border rounded p-2 text-sm"
            value={warehouse?.id || ""}
            onChange={(e) => handleChange(Number(e.target.value))}
          >
            <option value="">-- wybierz --</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto p-10">
        {children}
      </div>
    </div>
  );
}