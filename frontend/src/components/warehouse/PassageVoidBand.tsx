/**
 * Shared visual for structural passage under a rack — open floor clearance, not a solid block.
 */

type PassageVoidBandProps = {
  heightCm: number;
  /** Construction levels consumed by the void (1-based inclusive range). */
  constructionLevelFrom?: number;
  constructionLevelTo?: number;
  className?: string;
  compact?: boolean;
};

/** DOM band: double beams + open middle labeled PRZEJAZD. */
export function PassageVoidBand({
  heightCm,
  constructionLevelFrom = 1,
  constructionLevelTo,
  className = "",
  compact = false,
}: PassageVoidBandProps) {
  const to = constructionLevelTo ?? constructionLevelFrom;
  const levelHint =
    to > constructionLevelFrom
      ? `poziomy konstrukcyjne ${constructionLevelFrom}–${to}`
      : `poziom konstrukcyjny ${constructionLevelFrom}`;
  const minH = compact ? 48 : Math.max(56, Math.round(heightCm * 0.45));

  return (
    <div
      className={`flex w-full flex-col items-stretch ${className}`}
      style={{ minHeight: minH }}
      aria-label="Przejazd pod regałem"
    >
      <div className="h-0.5 w-full bg-slate-700" aria-hidden />
      <div className="h-px w-full bg-slate-400" aria-hidden />
      <div
        className="relative flex flex-1 flex-col items-center justify-center bg-[repeating-linear-gradient(-45deg,transparent,transparent_6px,rgba(148,163,184,0.18)_6px,rgba(148,163,184,0.18)_7px)]"
        style={{ minHeight: Math.max(36, minH - 8) }}
      >
        <span className={`font-bold uppercase tracking-[0.2em] text-slate-600 ${compact ? "text-[10px]" : "text-sm"}`}>
          Przejazd
        </span>
        <span className={`mt-0.5 text-slate-500 ${compact ? "text-[9px]" : "text-[11px]"}`}>
          {Math.round(heightCm)} cm wolnej przestrzeni · {levelHint} · bez lokalizacji
        </span>
      </div>
      <div className="h-px w-full bg-slate-400" aria-hidden />
      <div className="h-0.5 w-full bg-slate-700" aria-hidden />
    </div>
  );
}

/** SVG props for side-view / template preview passage void. */
export function passageVoidSvgProps(args: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const { x, y, width, height } = args;
  const h = Math.max(1, height);
  const beam = Math.max(1.5, Math.min(4, h * 0.08));
  return {
    outer: { x, y, width, height: h },
    topBeam: { x, y, width, height: beam },
    bottomBeam: { x, y: y + h - beam, width, height: beam },
    label: {
      x: x + width / 2,
      y: y + h / 2,
      fontSize: Math.min(18, Math.max(10, h * 0.28)),
    },
  };
}
