import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check, MapPin, Package } from "lucide-react";

import { wmsInventoryCountPaths } from "../../../modules/inventoryCount/inventoryCountPaths";
import { useWmsPageScanHandler } from "../../../components/wms/execution/useWmsPageScanHandler";

/** Fullscreen blind-count flow skeleton — location → product → qty → confirm. */
export default function WmsInventoryCountExecutionPage() {
  const { taskId } = useParams();
  const [step, setStep] = useState<"location" | "product" | "qty" | "confirm">("location");
  const [scanHint, setScanHint] = useState("Zeskanuj lokalizację");

  useWmsPageScanHandler((value) => {
    setScanHint(`Odczyt: ${value}`);
    if (step === "location") setStep("product");
    else if (step === "product") setStep("qty");
  }, true);

  const steps = [
    { id: "location", label: "Lokalizacja", icon: MapPin },
    { id: "product", label: "Produkt", icon: Package },
    { id: "qty", label: "Ilość", icon: Package },
    { id: "confirm", label: "Potwierdź", icon: Check },
  ] as const;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8">
      <div className="flex gap-2">
        {steps.map((s) => (
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

      <div className="rounded-3xl border-2 border-dashed border-teal-500/50 bg-slate-900 px-6 py-16 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-teal-400">Skanuj</p>
        <p className="mt-4 text-3xl font-bold leading-tight">{scanHint}</p>
        <p className="mt-6 text-sm text-slate-500">Tryb blind — stan oczekiwany ukryty</p>
      </div>

      {step === "qty" ? (
        <div className="grid grid-cols-3 gap-3">
          {[1, 5, 10, 25, 50, 100].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setStep("confirm")}
              className="rounded-2xl bg-slate-800 py-6 text-2xl font-bold tabular-nums hover:bg-teal-600 hover:text-slate-950"
            >
              {n}
            </button>
          ))}
        </div>
      ) : null}

      {step === "confirm" ? (
        <button
          type="button"
          onClick={() => {
            setStep("location");
            setScanHint("Zeskanuj lokalizację");
          }}
          className="w-full rounded-2xl bg-teal-500 py-5 text-lg font-bold text-slate-950"
        >
          Potwierdź i następna lokalizacja
        </button>
      ) : null}

      <p className="text-center text-xs text-slate-600">Zadanie #{taskId}</p>
      <Link to={wmsInventoryCountPaths.tasks} className="text-center text-sm text-slate-500 hover:text-slate-300">
        ← Lista zadań
      </Link>
    </div>
  );
}
