/**
 * Persistent floating badge showing current layout mode (top-right of canvas).
 */
export type LayoutModeBadgeProps = {
  modeLabel: string;
  modeColor: string;
  className?: string;
};

export function LayoutModeBadge({ modeLabel, modeColor: _modeColor, className = "" }: LayoutModeBadgeProps) {
  return (
    <div
      className={`absolute top-3 right-3 z-20 rounded-lg border text-xs font-medium transition-[background-color,border-color,color,opacity] duration-150 ease-out ${className}`}
      style={{
        backgroundColor: "#f3f4f6",
        borderColor: "#e5e7eb",
        color: "#374151",
        padding: "6px 10px",
        borderRadius: "8px",
      }}
      role="status"
      aria-live="polite"
      aria-label={`Tryb: ${modeLabel}`}
    >
      Tryb: {modeLabel}
    </div>
  );
}
