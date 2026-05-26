import { memo } from "react";

const GREEN = "#4CAF50";
const ORANGE = "#FF9800";
const BLUE = "#2196F3";

const LABELS = {
  packing: { done: "Spakowane", todo: "Do spakowania", progress: "W trakcie" },
  picking: { done: "Zebrane", todo: "Do zebrania", progress: "W trakcie" },
} as const;

export type WmsSessionCounterVariant = keyof typeof LABELS;

export type WmsSessionCounterPillsProps = {
  variant: WmsSessionCounterVariant;
  done: number;
  todo: number;
  progress: number;
};

function WmsSessionCounterPillsInner({ variant, done, todo, progress }: WmsSessionCounterPillsProps) {
  const L = LABELS[variant];
  const pill =
    "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold leading-none text-white shadow-sm sm:px-4 sm:py-2 sm:text-sm";
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
    </div>
  );
}

function equal(a: WmsSessionCounterPillsProps, b: WmsSessionCounterPillsProps): boolean {
  return a.variant === b.variant && a.done === b.done && a.todo === b.todo && a.progress === b.progress;
}

export const WmsSessionCounterPills = memo(WmsSessionCounterPillsInner, equal);
