import { useEffect, useState } from "react";

import api from "../../api/axios";
import { AppEmptyState } from "../../components/app-shell/AppEmptyState";
import { cartsPageShellClass } from "../../modules/carts/cartsModuleTokens";
import { MapPin } from "lucide-react";
import ZoneConfigurator from "./ZoneConfigurator";

const TENANT_ID = 1;
const WAREHOUSE_ID = 1;

export type ZoneOrder = { order_id: number; order_number: string | null };
export type Zone = {
  id: number;
  name: string;
  capacity_volume: number;
  used_volume: number;
  occupancy_percent: number;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  max_weight_kg: number | null;
  orders: ZoneOrder[];
};

export default function ZonesTab() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchZones = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/zones/", {
        params: { tenant_id: TENANT_ID, warehouse_id: WAREHOUSE_ID },
      });
      setZones(
        Array.isArray(res.data)
          ? (res.data.map((z: Record<string, unknown>) => ({
              ...z,
              length_cm: z.length_cm ?? null,
              width_cm: z.width_cm ?? null,
              height_cm: z.height_cm ?? null,
              max_weight_kg: z.max_weight_kg ?? null,
            })) as Zone[])
          : []
      );
    } catch (err: unknown) {
      console.error("[ZonesTab] Błąd pobierania stref:", err);
      setError("Nie udało się załadować stref.");
      setZones([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchZones();
  }, []);

  if (loading) {
    return <div className="py-10 text-center text-[13px] text-slate-500">Ładowanie stref…</div>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-white p-4 text-[13px] font-medium text-red-700">{error}</div>
    );
  }

  return (
    <div className={cartsPageShellClass}>
      <ZoneConfigurator zones={zones} onZoneAdded={fetchZones} />
      {zones.length === 0 ? (
        <AppEmptyState
          icon={MapPin}
          title="Brak stref"
          description="Dodaj strefę w formularzu powyżej."
        />
      ) : null}
    </div>
  );
}
