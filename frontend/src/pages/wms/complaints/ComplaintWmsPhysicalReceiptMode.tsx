import type { ComplaintPhysicalReceiptMode } from "../../../api/complaintsApi";

const OPTIONS: { value: ComplaintPhysicalReceiptMode; label: string; hint: string }[] = [
  {
    value: "WAREHOUSE",
    label: "Przyjęcie do magazynu",
    hint: "Z-PZ → kwarantanna → rozlokowanie",
  },
  {
    value: "SERVICE_FORWARD",
    label: "Przekazanie do serwisu",
    hint: "Magazyn odbiera → Z-PZ → serwis (bez rozlokowania)",
  },
  {
    value: "DIRECT_SERVICE",
    label: "Bezpośrednio do serwisu",
    hint: "Magazyn nie uczestniczy — brak Z-PZ",
  },
];

type Props = {
  value: ComplaintPhysicalReceiptMode;
  disabled?: boolean;
  onChange: (mode: ComplaintPhysicalReceiptMode) => void | Promise<void>;
};

export function ComplaintWmsPhysicalReceiptMode({ value, disabled, onChange }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Sposób obsługi towaru</p>
      <div className="mt-3 space-y-2">
        {OPTIONS.map((opt) => {
          const checked = value === opt.value;
          return (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                checked ? "border-indigo-400 bg-white shadow-sm" : "border-slate-200 bg-white/60 hover:border-slate-300"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                type="radio"
                name="physical_receipt_mode"
                value={opt.value}
                checked={checked}
                disabled={disabled}
                className="mt-1 h-4 w-4 shrink-0 accent-indigo-600"
                onChange={() => void onChange(opt.value)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-900">{opt.label}</span>
                <span className="mt-0.5 block text-xs text-slate-600">{opt.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function normalizePhysicalReceiptMode(raw?: string | null): ComplaintPhysicalReceiptMode {
  const u = String(raw ?? "WAREHOUSE").trim().toUpperCase();
  if (u === "SERVICE_FORWARD" || u === "DIRECT_SERVICE") return u;
  return "WAREHOUSE";
}
