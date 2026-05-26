import { colors, spacing } from "../../layout/designTokens";

export type RowPreviewOverlayProps = {
  visible: boolean;
  x: number;
  y: number;
  rackCount: number;
  /** Physical length along the row axis (meters), from grid + building dimensions. */
  rowLengthMeters: number;
  /** When true, use position:fixed (viewport coords); otherwise position:absolute */
  useFixedPosition?: boolean;
};

const CURSOR_OFFSET_PX = 12;
const ANIM_DURATION_MS = 150;

export function RowPreviewOverlay({
  visible,
  x,
  y,
  rackCount,
  rowLengthMeters,
  useFixedPosition = false,
}: RowPreviewOverlayProps) {
  if (!visible) return null;

  const pos = useFixedPosition ? { left: x + CURSOR_OFFSET_PX, top: y + CURSOR_OFFSET_PX } : { left: x, top: y };
  const animate = rackCount > 0;

  return (
    <>
      <style>{`
        @keyframes row-preview-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      <div
        className="z-30 pointer-events-none"
        style={{
          position: useFixedPosition ? "fixed" : "absolute",
          ...pos,
          backgroundColor: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          border: "1px solid rgba(0,0,0,0.05)",
          boxShadow: "0 12px 30px rgba(0,0,0,0.08)",
          borderRadius: "8px",
          padding: `${spacing.sm} ${spacing.md}`,
          ...(animate && {
            animation: `row-preview-fade-in ${ANIM_DURATION_MS}ms ease-out forwards`,
          }),
        }}
      >
        <div style={{ fontSize: "10px", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: colors.textSecondary }}>Liczba regałów</div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: colors.textPrimary, marginTop: "2px" }}>{rackCount}</div>
        <div style={{ fontSize: "10px", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: colors.textSecondary, marginTop: "6px" }}>Długość rzędu</div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: colors.textPrimary, marginTop: "2px" }}>
          {rowLengthMeters.toFixed(1)} m
        </div>
      </div>
    </>
  );
}
