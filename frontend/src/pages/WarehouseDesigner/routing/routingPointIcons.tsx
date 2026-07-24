/**
 * Simple SVG icons for special routing points (no emoji).
 * Sized for canvas at normal zoom; connections stay visible under the glyph.
 */

export type RoutingPointIconKind = "picking_start" | "packing" | "receiving_dock" | "receiving_buffer";

export function routingPointIconKind(op: string | null | undefined): RoutingPointIconKind | null {
  if (!op) return null;
  if (op === "putaway_buffer") return "receiving_buffer";
  if (
    op === "picking_start" ||
    op === "packing" ||
    op === "receiving_dock" ||
    op === "receiving_buffer"
  ) {
    return op;
  }
  return null;
}

type IconProps = {
  cx: number;
  cy: number;
  size: number;
  fill: string;
};

/** Inline SVG group for a special point — stroke white for contrast on amber fill disc. */
export function RoutingPointIcon({
  kind,
  cx,
  cy,
  size,
  fill,
}: IconProps & { kind: RoutingPointIconKind }) {
  const s = size;
  const stroke = "#fff";
  const sw = Math.max(1.2, s * 0.12);
  switch (kind) {
    case "picking_start":
      // Play / start chevron
      return (
        <g style={{ pointerEvents: "none" }}>
          <circle cx={cx} cy={cy} r={s} fill={fill} stroke={stroke} strokeWidth={sw} />
          <path
            d={`M ${cx - s * 0.22} ${cy - s * 0.35} L ${cx + s * 0.38} ${cy} L ${cx - s * 0.22} ${cy + s * 0.35} Z`}
            fill={stroke}
          />
        </g>
      );
    case "packing":
      // Package box
      return (
        <g style={{ pointerEvents: "none" }}>
          <circle cx={cx} cy={cy} r={s} fill={fill} stroke={stroke} strokeWidth={sw} />
          <rect
            x={cx - s * 0.38}
            y={cy - s * 0.32}
            width={s * 0.76}
            height={s * 0.64}
            rx={1}
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
          />
          <line x1={cx} y1={cy - s * 0.32} x2={cx} y2={cy + s * 0.32} stroke={stroke} strokeWidth={sw} />
          <line x1={cx - s * 0.38} y1={cy} x2={cx + s * 0.38} y2={cy} stroke={stroke} strokeWidth={sw} />
        </g>
      );
    case "receiving_dock":
      // Dock / gate opening
      return (
        <g style={{ pointerEvents: "none" }}>
          <circle cx={cx} cy={cy} r={s} fill={fill} stroke={stroke} strokeWidth={sw} />
          <path
            d={`M ${cx - s * 0.4} ${cy + s * 0.35}
                L ${cx - s * 0.4} ${cy - s * 0.15}
                L ${cx - s * 0.15} ${cy - s * 0.35}
                L ${cx + s * 0.15} ${cy - s * 0.35}
                L ${cx + s * 0.4} ${cy - s * 0.15}
                L ${cx + s * 0.4} ${cy + s * 0.35}`}
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
          <line
            x1={cx - s * 0.18}
            y1={cy + s * 0.05}
            x2={cx + s * 0.18}
            y2={cy + s * 0.05}
            stroke={stroke}
            strokeWidth={sw}
          />
        </g>
      );
    case "receiving_buffer":
      // Stacked buffer layers
      return (
        <g style={{ pointerEvents: "none" }}>
          <circle cx={cx} cy={cy} r={s} fill={fill} stroke={stroke} strokeWidth={sw} />
          <rect
            x={cx - s * 0.4}
            y={cy - s * 0.38}
            width={s * 0.8}
            height={s * 0.22}
            rx={1}
            fill={stroke}
            opacity={0.95}
          />
          <rect
            x={cx - s * 0.4}
            y={cy - s * 0.08}
            width={s * 0.8}
            height={s * 0.22}
            rx={1}
            fill={stroke}
            opacity={0.75}
          />
          <rect
            x={cx - s * 0.4}
            y={cy + s * 0.22}
            width={s * 0.8}
            height={s * 0.22}
            rx={1}
            fill={stroke}
            opacity={0.55}
          />
        </g>
      );
    default:
      return null;
  }
}
