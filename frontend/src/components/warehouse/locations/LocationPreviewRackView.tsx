import type { LocationVisualBin } from "../../../api/wmsLocationVisualApi";

type Props = {
  bins: LocationVisualBin[];
  rackName?: string | null;
  className?: string;
};

export function LocationPreviewRackView({ bins, rackName, className = "" }: Props) {
  if (!bins.length) {
    return (
      <div className={`rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500 ${className}`}>
        Brak widoku regału.
      </div>
    );
  }

  const levels = Array.from(new Set(bins.map((b) => b.level_number))).sort((a, b) => b - a);

  return (
    <div className={className}>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
        Regał {rackName?.trim() || ""}
      </p>
      <div className="flex justify-center">
        <div className="w-full max-w-[220px] rounded-xl border-2 border-slate-300 bg-white p-2 shadow-sm">
          {levels.map((levelNum) => {
            const rowBins = bins.filter((b) => b.level_number === levelNum);
            return (
              <div key={levelNum} className="border-b border-slate-200 last:border-0">
                {rowBins.map((bin) => (
                  <div
                    key={`${bin.level_index}-${bin.segment_index}`}
                    className={`relative flex min-h-[44px] items-center justify-center border-b border-slate-100 px-2 py-2 text-center last:border-0 ${
                      bin.is_active
                        ? "bg-blue-50 ring-2 ring-inset ring-blue-500 animate-pulse"
                        : "bg-white"
                    }`}
                  >
                    <span className={`text-[12px] font-bold ${bin.is_active ? "text-blue-800" : "text-slate-600"}`}>
                      {bin.code || `${levelNum}-${bin.segment_label}`}
                    </span>
                    {bin.is_active ? (
                      <span className="absolute -right-1 top-1/2 -translate-y-1/2 translate-x-full whitespace-nowrap rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                        TU
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
