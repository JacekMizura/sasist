import type { ReceivingPzCarrierRead } from "../../../../api/stockDocumentsApi";
import { ReceivingCarrierBadge } from "./ReceivingCarrierBadge";

type Props = {
  carriers: ReceivingPzCarrierRead[];
  value: number | null;
  onChange: (carrierId: number | null) => void;
  disabled?: boolean;
};

/**
 * Wybór nośnika dla linii przyjęcia — tylko nośniki już przypisane do PZ (bez tworzenia / skanu).
 */
export function ReceivingCarrierSelector({ carriers, value, onChange, disabled }: Props) {
  if (!carriers.length) return null;
  return (
    <div className="w-full space-y-2 rounded-2xl border border-[#7a5c2e]/25 bg-[#faf6f0] p-4">
      <p className="text-center text-[10px] font-black uppercase tracking-widest text-[#5c4a32]">Nośnik</p>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-transparent bg-white px-3 py-2.5 shadow-sm hover:border-slate-200">
        <input
          type="radio"
          name="recv-carrier"
          className="h-4 w-4 shrink-0 accent-amber-800"
          checked={value == null}
          disabled={disabled}
          onChange={() => onChange(null)}
        />
        <span className="text-sm font-bold text-slate-800">Luzem</span>
      </label>
      {carriers.map((c) => {
        const label = (c.code || "").trim() || (c.barcode || "").trim() || `#${c.carrier_id}`;
        return (
          <label
            key={c.carrier_id}
            className="flex cursor-pointer items-center gap-3 rounded-xl border border-transparent bg-white px-3 py-2.5 shadow-sm hover:border-[#7a5c2e]/40"
          >
            <input
              type="radio"
              name="recv-carrier"
              className="h-4 w-4 shrink-0 accent-amber-800"
              checked={value === c.carrier_id}
              disabled={disabled}
              onChange={() => onChange(c.carrier_id)}
            />
            <ReceivingCarrierBadge code={label} className="text-[11px]" />
          </label>
        );
      })}
    </div>
  );
}
