import { Link, useParams } from "react-router-dom";
import { Check, MapPin, Package } from "lucide-react";

import { useWmsInventoryCountExecution } from "../../../modules/inventoryCount/hooks/useWmsInventoryCountExecution";
import { wmsInventoryCountPaths } from "../../../modules/inventoryCount/inventoryCountPaths";
import { useWarehouse } from "../../../context/WarehouseContext";

const STEPS = [
  { id: "location", label: "Lokalizacja", icon: MapPin },
  { id: "product", label: "Produkt", icon: Package },
  { id: "qty", label: "Ilość", icon: Package },
  { id: "confirm", label: "Potwierdź", icon: Check },
] as const;

export default function WmsInventoryCountExecutionPage() {
  const { taskId } = useParams();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? 1;
  const warehouseId = warehouse?.id;
  const id = Number(taskId);

  const {
    loading,
    error,
    task,
    step,
    scanHint,
    activeProductLabel,
    pendingQty,
    scanMode,
    progressLabel,
    confirmQuantity,
    setManualQty,
    setScanMode,
  } = useWmsInventoryCountExecution(id, tenantId, warehouseId);

  if (loading) {
    return <p className="text-center text-lg text-slate-400">Wczytywanie zadania…</p>;
  }
  if (error || !task) {
    return (
      <div className="text-center">
        <p className="text-lg text-rose-400">{error ?? "Zadanie niedostępne."}</p>
        <Link to={wmsInventoryCountPaths.tasks} className="mt-6 inline-block text-sm text-slate-500 hover:text-slate-300">
          ← Lista zadań
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="flex items-center justify-between text-xs uppercase tracking-widest text-slate-500">
        <span>{task.task_number}</span>
        <span>{progressLabel}</span>
      </div>

      <div className="flex gap-2">
        {STEPS.map((s) => (
          <div
            key={s.id}
            className={`flex-1 rounded-lg py-2 text-center text-xs font-bold uppercase ${
              step === s.id ? "bg-teal-500 text-slate-950" : "bg-slate-800 text-slate-500"
            }`}
          >
            {s.label}
          </div>
        ))}
      </div>

      <div className="rounded-3xl border-2 border-dashed border-teal-500/50 bg-slate-900 px-6 py-14 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-teal-400">Skanuj</p>
        <p className="mt-4 text-3xl font-bold leading-tight">{scanHint}</p>
        {activeProductLabel ? (
          <p className="mt-4 text-xl font-semibold text-white">{activeProductLabel}</p>
        ) : null}
        <p className="mt-6 text-sm text-slate-500">Tryb blind — stan oczekiwany ukryty</p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setScanMode("increment")}
          className={`flex-1 rounded-xl py-2 text-xs font-bold uppercase ${
            scanMode === "increment" ? "bg-teal-600 text-white" : "bg-slate-800 text-slate-400"
          }`}
        >
          Skan +1
        </button>
        <button
          type="button"
          onClick={() => setScanMode("manual")}
          className={`flex-1 rounded-xl py-2 text-xs font-bold uppercase ${
            scanMode === "manual" ? "bg-teal-600 text-white" : "bg-slate-800 text-slate-400"
          }`}
        >
          Ilość ręczna
        </button>
      </div>

      {step === "qty" ? (
        <div className="grid grid-cols-3 gap-3">
          {[1, 5, 10, 25, 50, 100].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setManualQty(n)}
              className="rounded-2xl bg-slate-800 py-6 text-2xl font-bold tabular-nums hover:bg-teal-600 hover:text-slate-950"
            >
              {n}
            </button>
          ))}
        </div>
      ) : null}

      {step === "confirm" ? (
        <div className="space-y-3">
          <p className="text-center text-4xl font-black tabular-nums text-teal-400">{pendingQty}</p>
          <button
            type="button"
            onClick={() => void confirmQuantity()}
            className="w-full rounded-2xl bg-teal-500 py-5 text-lg font-bold text-slate-950"
          >
            Potwierdź i następny produkt
          </button>
        </div>
      ) : null}

      <Link to={wmsInventoryCountPaths.tasks} className="text-center text-sm text-slate-500 hover:text-slate-300">
        ← Lista zadań
      </Link>
    </div>
  );
}
