import { useEffect, useState } from "react";
import api from "../api/axios";

const tenantId = 1;
const warehouseId = 1;

type PendingStats = {
  orders_to_pick: number;
  total_items: number;
  total_volume: number;
};

export default function Dashboard() {
  const [stats, setStats] = useState<PendingStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/orders/pending-stats/?tenant_id=${tenantId}&warehouse_id=${warehouseId}`)
      .then((res) => {
        if (!cancelled) setStats(res.data ?? null);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-gray-800">Dashboard operacyjny</h1>

      {loading ? (
        <div className="text-slate-500">Ładowanie…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">Zamówienia do kompletacji</div>
            <div className="mt-2 text-3xl font-bold text-blue-600">
              {stats?.orders_to_pick ?? 0}
            </div>
            <p className="mt-1 text-sm text-gray-500">Zamówienia ze statusem NEW</p>
          </div>
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">Łączna liczba sztuk</div>
            <div className="mt-2 text-3xl font-bold text-green-600">
              {stats?.total_items ?? 0}
            </div>
            <p className="mt-1 text-sm text-gray-500">Suma ilości z zamówień do realizacji</p>
          </div>
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">Łączna objętość</div>
            <div className="mt-2 text-3xl font-bold text-amber-600">
              {stats?.total_volume != null ? `${Number(stats.total_volume).toFixed(2)}` : "0"} <span className="text-lg font-normal text-gray-500">dm³</span>
            </div>
            <p className="mt-1 text-sm text-gray-500">Suma objętości (L×W×H/1000) zamówień NEW</p>
          </div>
        </div>
      )}
    </div>
  );
}
