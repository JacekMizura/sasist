import { useState } from "react";

import api from "../../api/axios";
import {
  cartsAppInputClass,
  cartsBtnApply,
  cartsFieldLabelClass,
  cartsGroupShellClass,
  cartsSectionClass,
  cartsSectionTitleClass,
} from "../../modules/carts/cartsModuleTokens";
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
    <div className="space-y-4">
      <form onSubmit={handleAdd} className={cartsSectionClass}>
        <h3 className={cartsSectionTitleClass}>Dodaj strefę podłogową</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className={cartsFieldLabelClass}>Nazwa (np. Strefa G1)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Strefa G1"
              className={cartsAppInputClass}
            />
          </div>
          {(
            [
              ["Długość (cm)", lengthCm, setLengthCm],
              ["Szerokość (cm)", widthCm, setWidthCm],
              ["Wysokość (cm)", heightCm, setHeightCm],
              ["Max waga (kg)", maxWeightKg, setMaxWeightKg],
            ] as const
          ).map(([label, value, setter]) => (
            <div key={label}>
              <label className={cartsFieldLabelClass}>{label}</label>
              <input
                type="number"
                min="0"
                step={label.includes("waga") ? "0.1" : "1"}
                value={value}
                onChange={(e) => setter(e.target.value)}
                className={`${cartsAppInputClass} no-number-spinner`}
              />
            </div>
          ))}
        </div>
        {lengthCm && widthCm && heightCm ? (
          <p className="mt-2 text-[12px] text-slate-500">Objętość: {volumeDm3.toFixed(2)} dm³</p>
        ) : null}
        {error ? <p className="mt-2 text-[13px] text-red-600">{error}</p> : null}
        <div className="mt-3">
          <button type="submit" disabled={submitting || !name.trim()} className={cartsBtnApply}>
            {submitting ? "Zapisywanie…" : "Dodaj strefę"}
          </button>
        </div>
      </form>

      {zones.length > 0 ? (
        <div>
          <h3 className={cartsSectionTitleClass}>Strefy (układ prostokątów)</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {zones.map((zone) => (
              <div key={zone.id} className={`${cartsGroupShellClass} flex min-h-[120px] flex-col p-3`}>
                <div className="text-[13px] font-semibold text-slate-900">{zone.name}</div>
                {zone.length_cm != null && zone.width_cm != null && zone.height_cm != null ? (
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {zone.length_cm} × {zone.width_cm} × {zone.height_cm} cm
                    {zone.max_weight_kg != null && zone.max_weight_kg > 0 ? (
                      <> · max {Number(zone.max_weight_kg).toFixed(2)} kg</>
                    ) : null}
                  </div>
                ) : null}
                <div className="my-2">
                  <ProgressBar percent={zone.occupancy_percent} />
                </div>
                <div className="text-[11px] text-slate-500">
                  {Number(zone.used_volume).toFixed(2)} / {Number(zone.capacity_volume).toFixed(2)} dm³ (
                  {Number(zone.occupancy_percent).toFixed(2)}%)
                </div>
                <div className="mt-auto pt-2 text-[11px] font-medium text-slate-500">Zamówienia</div>
                <ul className="mt-0.5 space-y-0.5">
                  {zone.orders.length === 0 ? (
                    <li className="text-[12px] text-slate-400">Brak</li>
                  ) : (
                    zone.orders.map((o) => (
                      <li key={`${zone.id}-${o.order_id}`} className="text-[12px] text-slate-700">
                        #{o.order_number ?? o.order_id}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
