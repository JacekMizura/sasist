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
        className={`flex h-full min-h-[220px] items-center justify-center bg-[#0a0e14] text-sm text-slate-500 ${className}`}
      >
        Brak widoku regału.
      </div>
    );
  }

  const levels = Array.from(new Set(bins.map((b) => b.level_number))).sort((a, b) => b - a);
  const segmentsPerLevel = Math.max(...levels.map((lv) => bins.filter((b) => b.level_number === lv).length));

  return (
    <div className={`relative flex h-full min-h-0 flex-col overflow-hidden bg-[#0a0e14] ${className}`}>
      {/* Tło hali — gradient + siatka */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(30,41,59,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(30,41,59,0.35) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#121820]/80 via-transparent to-[#080c12]" />

      <div className="relative z-10 shrink-0 border-b border-slate-700/50 bg-[#0f1520]/90 px-4 py-2.5 backdrop-blur-sm">
        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-500/70">Widok regału · front</p>
        <p className="truncate text-base font-bold text-slate-100">{rackName?.trim() || "Regał wysokiego składowania"}</p>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center p-4 sm:p-5">
        <div
          className="relative flex w-full max-w-[340px] items-stretch"
          style={{ perspective: "900px" }}
        >
          {/* Lewy słup nośny */}
          <div className="relative w-4 shrink-0">
            <div className="absolute inset-y-0 left-0 w-full rounded-sm bg-gradient-to-r from-[#1e293b] via-[#475569] to-[#334155] shadow-[inset_-3px_0_6px_rgba(0,0,0,0.5),4px_0_12px_rgba(0,0,0,0.35)]" />
            {[0.15, 0.45, 0.75].map((t) => (
              <div
                key={`bolt-l-${t}`}
                className="absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-slate-300/30"
                style={{ top: `${t * 100}%` }}
              />
            ))}
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-center gap-0 py-2">
            {levels.map((levelNum, levelIdx) => {
              const rowBins = bins
                .filter((b) => b.level_number === levelNum)
                .sort((a, b) => a.segment_index - b.segment_index);

              return (
                <div key={levelNum} className="relative">
                  {/* Belka poziomu */}
                  <div className="absolute -left-1 -right-1 top-0 z-10 h-[3px] bg-gradient-to-b from-[#64748b] to-[#334155] shadow-[0_2px_4px_rgba(0,0,0,0.4)]" />

                  <div className="flex gap-[3px] px-[2px] pt-[5px]">
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
                          className={`group relative flex min-h-[56px] min-w-0 flex-1 flex-col items-stretch overflow-hidden transition-all duration-200 ${
                            isActive
                              ? "z-20 scale-[1.02] shadow-[0_0_0_2px_rgba(56,189,248,0.6),0_0_28px_rgba(14,165,233,0.45),inset_0_1px_0_rgba(255,255,255,0.15)] animate-[rackSlotPulse_2.5s_ease-in-out_infinite]"
                              : isSelected
                                ? "shadow-[0_4px_16px_rgba(0,0,0,0.35)] ring-1 ring-slate-500/60"
                                : "shadow-[0_2px_8px_rgba(0,0,0,0.25)] hover:ring-1 hover:ring-slate-500/40"
                          }`}
                          title={label}
                        >
                          {/* Półka — blat */}
                          <div
                            className={`h-[4px] shrink-0 ${
                              isActive
                                ? "bg-gradient-to-r from-cyan-400/80 via-sky-300 to-cyan-400/80"
                                : "bg-gradient-to-r from-[#64748b] via-[#94a3b8] to-[#64748b]"
                            }`}
                          />
                          {/* Komora */}
                          <div
                            className={`relative flex flex-1 flex-col items-center justify-center border-x border-b px-1 py-2 ${
                              isActive
                                ? "border-cyan-400/50 bg-gradient-to-b from-[#1e3a5f] via-[#0f2744] to-[#0c1929]"
                                : "border-[#334155] bg-gradient-to-b from-[#1a2332] via-[#151c28] to-[#0f141c]"
                            }`}
                          >
                            {/* Głębia tylnej ścianki */}
                            <div className="pointer-events-none absolute inset-x-2 bottom-2 top-3 rounded-sm bg-black/20" />

                            <span
                              className={`relative z-10 truncate font-mono text-[10px] font-bold leading-tight sm:text-[11px] ${
                                isActive ? "text-cyan-100" : "text-slate-300"
                              }`}
                            >
                              {label}
                            </span>
                            <span className="relative z-10 mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-slate-500">
                              L{levelNum} · {bin.segment_label}
                            </span>

                            {isActive ? (
                              <>
                                <span className="absolute -right-1 -top-1 z-20 rounded bg-cyan-500 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-[#042f49] shadow-[0_0_12px_rgba(34,211,238,0.8)]">
                                  TU
                                </span>
                                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(56,189,248,0.15),transparent_70%)]" />
                              </>
                            ) : null}
                          </div>
                          {/* Podpórka dolna */}
                          <div className="h-[2px] shrink-0 bg-[#475569]" />
                        </button>
                      );
                    })}
                    {rowBins.length < segmentsPerLevel
                      ? Array.from({ length: segmentsPerLevel - rowBins.length }).map((_, i) => (
                          <div
                            key={`empty-${levelNum}-${i}`}
                            className="min-h-[56px] min-w-0 flex-1 border border-dashed border-slate-700/40 bg-[#0c1018]/50"
                          />
                        ))
                      : null}
                  </div>

                  {/* Odległość między poziomami — wizualna głębia */}
                  {levelIdx < levels.length - 1 ? (
                    <div className="mx-1 h-[6px] bg-gradient-to-b from-transparent via-[#080c12]/60 to-transparent" />
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Prawy słup nośny */}
          <div className="relative w-4 shrink-0">
            <div className="absolute inset-y-0 right-0 w-full rounded-sm bg-gradient-to-l from-[#1e293b] via-[#475569] to-[#334155] shadow-[inset_3px_0_6px_rgba(0,0,0,0.5),-4px_0_12px_rgba(0,0,0,0.35)]" />
            {[0.15, 0.45, 0.75].map((t) => (
              <div
                key={`bolt-r-${t}`}
                className="absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-slate-300/30"
                style={{ top: `${t * 100}%` }}
              />
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes rackSlotPulse {
          0%, 100% { box-shadow: 0 0 0 2px rgba(56,189,248,0.5), 0 0 24px rgba(14,165,233,0.35); }
          50% { box-shadow: 0 0 0 3px rgba(56,189,248,0.75), 0 0 36px rgba(14,165,233,0.55); }
        }
      `}</style>
    </div>
  );
}
