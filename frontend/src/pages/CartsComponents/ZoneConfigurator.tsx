import { useState } from "react";
import api from "../../api/axios";
import ProgressBar from "./ui/ProgressBar";

const TENANT_ID = 1;
const WAREHOUSE_ID = 1;

type ZoneOrder = { order_id: number; order_number: string | null };
type Zone = {
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

export default function ZoneConfigurator({
  zones,
  onZoneAdded,
}: {
  zones: Zone[];
  onZoneAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [lengthCm, setLengthCm] = useState<string>("");
  const [widthCm, setWidthCm] = useState<string>("");
  const [heightCm, setHeightCm] = useState<string>("");
  const [maxWeightKg, setMaxWeightKg] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const volumeDm3 =
    lengthCm && widthCm && heightCm
      ? (Number(lengthCm) * Number(widthCm) * Number(heightCm)) / 1000
      : 0;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Podaj nazwę strefy.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/zones/", {
        tenant_id: TENANT_ID,
        warehouse_id: WAREHOUSE_ID,
        name: name.trim(),
        capacity_volume: volumeDm3 > 0 ? volumeDm3 : 0,
        length_cm: lengthCm ? Number(lengthCm) : null,
        width_cm: widthCm ? Number(widthCm) : null,
        height_cm: heightCm ? Number(heightCm) : null,
        max_weight_kg: maxWeightKg ? Number(maxWeightKg) : null,
      });
      setName("");
      setLengthCm("");
      setWidthCm("");
      setHeightCm("");
      setMaxWeightKg("");
      onZoneAdded();
    } catch (err: unknown) {
      console.error("Zone create error:", err);
      setError("Nie udało się dodać strefy.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleAdd}
        className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm"
      >
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-700 mb-4">
          Dodaj strefę podłogową
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
              Nazwa (np. Strefa G1)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Strefa G1"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
              Długość (cm)
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={lengthCm}
              onChange={(e) => setLengthCm(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
              Szerokość (cm)
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={widthCm}
              onChange={(e) => setWidthCm(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
              Wysokość (cm)
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
              Max waga (kg)
            </label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={maxWeightKg}
              onChange={(e) => setMaxWeightKg(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
        {lengthCm && widthCm && heightCm && (
          <p className="mt-2 text-xs text-slate-500">
            Objętość: {volumeDm3.toFixed(2)} dm³
          </p>
        )}
        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
        <div className="mt-4">
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold uppercase disabled:opacity-50 hover:bg-blue-700"
          >
            {submitting ? "Zapisywanie…" : "Dodaj strefę"}
          </button>
        </div>
      </form>

      {/* Grid of zone rectangles */}
      <div>
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-700 mb-3">
          Strefy (układ prostokątów)
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {zones.map((zone) => (
            <div
              key={zone.id}
              className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm min-h-[140px] flex flex-col"
            >
              <div className="font-bold text-slate-800 mb-2">{zone.name}</div>
              {(zone.length_cm != null && zone.width_cm != null && zone.height_cm != null) && (
                <div className="text-[10px] text-slate-500 mb-1">
                  {zone.length_cm} × {zone.width_cm} × {zone.height_cm} cm
                  {zone.max_weight_kg != null && zone.max_weight_kg > 0 && (
                    <> · max {Number(zone.max_weight_kg).toFixed(2)} kg</>
                  )}
                </div>
              )}
              <div className="mb-2">
                <ProgressBar percent={zone.occupancy_percent} />
              </div>
              <div className="text-[10px] text-slate-500 mb-2">
                {Number(zone.used_volume).toFixed(2)} / {Number(zone.capacity_volume).toFixed(2)} dm³
                ({Number(zone.occupancy_percent).toFixed(2)}%)
              </div>
              <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mt-auto">
                Zamówienia
              </div>
              <ul className="mt-1 space-y-0.5">
                {zone.orders.length === 0 ? (
                  <li className="text-slate-400 text-xs">Brak</li>
                ) : (
                  zone.orders.map((o) => (
                    <li key={`${zone.id}-${o.order_id}`} className="text-xs text-slate-700">
                      #{o.order_number ?? o.order_id}
                    </li>
                  ))
                )}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
