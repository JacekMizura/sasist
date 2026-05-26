import { useEffect, useState } from "react";
import { log } from "../utils/logger";
import api from "../api/axios";
import { useWarehouse } from "../context/WarehouseContext";

type Warehouse = {
  id: number;
  name: string;
};

export default function Topbar() {
  const { warehouse, setWarehouse } = useWarehouse();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  useEffect(() => {
    api.get("/tenants/1/warehouses/")
      .then((res) => setWarehouses(res.data))
      .catch(() => log("Błąd pobierania magazynów"));
  }, []);

  return (
    <div className="h-16 bg-white border-b flex items-center justify-between px-6 shadow-sm">
      <div className="font-semibold text-gray-800">
        Panel operacyjny
      </div>

      <div className="flex items-center gap-6">
        <select
          value={warehouse?.id || ""}
          onChange={(e) => {
            const selected = warehouses.find(
              (w) => w.id === Number(e.target.value)
            );
            if (selected) {
              setWarehouse(selected);
              localStorage.setItem("warehouse", JSON.stringify(selected));
            }
          }}
          className="border rounded px-3 py-1 text-sm"
        >
          <option value="">Wybierz magazyn</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>

        <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center">
          J
        </div>
      </div>
    </div>
  );
}
