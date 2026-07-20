import { memo } from "react";

const GREEN = "#4CAF50";
const ORANGE = "#FF9800";
const BLUE = "#2196F3";
const RED = "#E53935";

const LABELS = {
  packing: { done: "Spakowane", todo: "Do spakowania", progress: "W trakcie", shortage: "Braki" },
  picking: { done: "Zebrane", todo: "Do zebrania", progress: "W trakcie", shortage: "Braki" },
} as const;

export type WmsSessionCounterVariant = keyof typeof LABELS;

export type WmsSessionCounterPillsProps = {
  variant: WmsSessionCounterVariant;
  done: number;
  todo: number;
  progress: number;
  /**
   * Picking: sztuki braku („Braki: N szt.”).
   * Packing: legacy count (bez „szt.”) unless shortageAsUnits.
   */
  shortage?: number;
  /** Gdy true — dopisek „szt.” (domyślnie dla picking). */
  shortageAsUnits?: boolean;
};

function WmsSessionCounterPillsInner({
  variant,
  done,
  todo,
  progress,
  shortage = 0,
  shortageAsUnits,
}: WmsSessionCounterPillsProps) {
  const L = LABELS[variant];
  const units = shortageAsUnits ?? variant === "picking";
  const pill =
    "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold leading-none text-white shadow-sm sm:px-4 sm:py-2 sm:text-sm";
  const shortageLabel =
    units && shortage > 0 ? `${L.shortage}: ${shortage} szt.` : `${L.shortage}: ${shortage}`;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-2.5">
      <span className={pill} style={{ background: GREEN }}>
        {L.done}: {done}
      </span>
      <span className={pill} style={{ background: ORANGE }}>
        {L.todo}: {todo}
      </span>
      <span className={pill} style={{ background: BLUE }}>
        {L.progress}: {progress}
      </span>
      {shortage > 0 ? (
        <span className={pill} style={{ background: RED }}>
          {shortageLabel}
        </span>
      ) : null}
    </div>
  );
}

function equal(a: WmsSessionCounterPillsProps, b: WmsSessionCounterPillsProps): boolean {
  return (
    a.variant === b.variant &&
    a.done === b.done &&
    a.todo === b.todo &&
    a.progress === b.progress &&
    (a.shortage ?? 0) === (b.shortage ?? 0) &&
    (a.shortageAsUnits ?? a.variant === "picking") === (b.shortageAsUnits ?? b.variant === "picking")
  );
}

export const WmsSessionCounterPills = memo(WmsSessionCounterPillsInner, equal);
