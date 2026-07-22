import { Store, Truck } from "lucide-react";

export type FulfillmentMode = "PICKUP" | "DELIVERY";

type Props = {
  mode: FulfillmentMode;
  disabled?: boolean;
  onChange: (mode: FulfillmentMode) => void;
};

export function FulfillmentModePanel({ mode, disabled, onChange }: Props) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-blue-900/50">Sposób realizacji</h3>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("PICKUP")}
          className={`flex items-center justify-center gap-2 rounded-2xl border-2 px-3 py-3 text-sm font-bold transition-all disabled:opacity-50 ${
            mode === "PICKUP"
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-slate-100 bg-white text-slate-600 hover:border-blue-200"
          }`}
        >
          <Store size={18} />
          Odbiór osobisty
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("DELIVERY")}
          className={`flex items-center justify-center gap-2 rounded-2xl border-2 px-3 py-3 text-sm font-bold transition-all disabled:opacity-50 ${
            mode === "DELIVERY"
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-slate-100 bg-white text-slate-600 hover:border-blue-200"
          }`}
        >
          <Truck size={18} />
          Wysyłka
        </button>
      </div>
    </div>
  );
}
