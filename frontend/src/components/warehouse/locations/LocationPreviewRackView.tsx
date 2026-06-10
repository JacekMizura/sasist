import type { LocationVisualBin } from "../../../api/wmsLocationVisualApi";

type Props = {
  bins: LocationVisualBin[];
  rackName?: string | null;
  selectedBinCode?: string | null;
  onBinSelect?: (bin: LocationVisualBin) => void;
  className?: string;
};

export function LocationPreviewRackView({
  bins,
  rackName,
  selectedBinCode,
  onBinSelect,
  className = "",
}: Props) {
  if (!bins.length) {
    return (
      <div
        className={`flex h-full min-h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-300/80 bg-gradient-to-b from-slate-100 to-slate-200/80 text-sm text-slate-500 ${className}`}
      >
        Brak widoku regału.
      </div>
    );
  }

  const levels = Array.from(new Set(bins.map((b) => b.level_number))).sort((a, b) => b - a);
  const segmentsPerLevel = Math.max(...levels.map((lv) => bins.filter((b) => b.level_number === lv).length));

  return (
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-300/70 bg-gradient-to-b from-[#cbd5e1] via-[#e2e8f0] to-[#94a3b8] shadow-inner ${className}`}
    >
      <div className="shrink-0 border-b border-slate-400/30 bg-slate-700/90 px-3 py-2 text-white">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-300">Widok regału</p>
        <p className="truncate text-sm font-bold">{rackName?.trim() || "Regał magazynowy"}</p>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-4">
        <div className="relative flex max-h-full w-full max-w-[320px] items-stretch gap-0">
          {/* Słup konstrukcji — lewy */}
          <div className="w-3 shrink-0 rounded-sm bg-gradient-to-r from-slate-600 via-slate-500 to-slate-400 shadow-[inset_-2px_0_4px_rgba(0,0,0,0.25)]" />

          <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-1">
            {levels.map((levelNum) => {
              const rowBins = bins
                .filter((b) => b.level_number === levelNum)
                .sort((a, b) => a.segment_index - b.segment_index);

              return (
                <div key={levelNum} className="relative">
                  {/* Belka pozioma / poziom */}
                  <div className="absolute -left-1 -right-1 top-0 h-1 rounded-sm bg-gradient-to-b from-slate-300 to-slate-500 shadow-sm" />

                  <div className="mt-1 flex gap-1">
                    {rowBins.map((bin) => {
                      const isActive = bin.is_active;
                      const isSelected =
                        (selectedBinCode && bin.code === selectedBinCode) || (!selectedBinCode && isActive);
                      const label = bin.code || `${levelNum}-${bin.segment_label}`;

                      return (
                        <button
                          key={`${bin.level_index}-${bin.segment_index}`}
                          type="button"
                          onClick={() => onBinSelect?.(bin)}
                          className={`group relative flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center rounded-md border-2 px-1 py-2 text-center transition-all ${
                            isActive
                              ? "border-sky-400 bg-gradient-to-b from-sky-100 to-sky-200 shadow-[0_0_0_3px_rgba(56,189,248,0.45),0_0_24px_rgba(37,99,235,0.35)] animate-[slotGlow_2.2s_ease-in-out_infinite]"
                              : isSelected
                                ? "border-blue-400 bg-blue-50 shadow-md"
                                : "border-slate-400/80 bg-gradient-to-b from-slate-50 to-slate-200 hover:border-slate-500 hover:shadow-md"
                          }`}
                          title={label}
                        >
                          {/* Półka — górna krawędź */}
                          <span className="pointer-events-none absolute inset-x-1 top-0 h-0.5 rounded-full bg-white/70" />
                          <span
                            className={`truncate font-mono text-[10px] font-bold leading-tight sm:text-[11px] ${
                              isActive ? "text-blue-900" : "text-slate-700"
                            }`}
                          >
                            {label}
                          </span>
                          <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                            L{levelNum} · {bin.segment_label}
                          </span>

                          {isActive ? (
                            <span className="absolute -right-2 -top-2 z-10 rounded-md bg-blue-600 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-lg ring-2 ring-sky-300">
                              TU
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                    {/* Wypełnij puste segmenty dla symetrii wizualnej */}
                    {rowBins.length < segmentsPerLevel
                      ? Array.from({ length: segmentsPerLevel - rowBins.length }).map((_, i) => (
                          <div
                            key={`empty-${levelNum}-${i}`}
                            className="min-h-[52px] min-w-0 flex-1 rounded-md border border-dashed border-slate-400/40 bg-slate-300/20"
                          />
                        ))
                      : null}
                  </div>

                  {/* Podłoga poziomu */}
                  <div className="mt-1 h-1 rounded-sm bg-gradient-to-b from-amber-700/70 to-amber-900/80 shadow-inner" />
                </div>
              );
            })}
          </div>

          {/* Słup konstrukcji — prawy */}
          <div className="w-3 shrink-0 rounded-sm bg-gradient-to-l from-slate-600 via-slate-500 to-slate-400 shadow-[inset_2px_0_4px_rgba(0,0,0,0.25)]" />
        </div>
      </div>

      <style>{`
        @keyframes slotGlow {
          0%, 100% { box-shadow: 0 0 0 3px rgba(56,189,248,0.45), 0 0 20px rgba(37,99,235,0.3); }
          50% { box-shadow: 0 0 0 5px rgba(56,189,248,0.55), 0 0 32px rgba(37,99,235,0.45); }
        }
      `}</style>
    </div>
  );
}
