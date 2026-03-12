import React from "react";

export type PathLayerProps = {
  pickingPathPoints: { x: number; y: number }[];
  manualPathPoints: { x: number; y: number }[];
  cellPx: number;
};

export function PathLayer({ pickingPathPoints, manualPathPoints, cellPx }: PathLayerProps) {
  if (!pickingPathPoints || pickingPathPoints.length < 2) return null;
  return (
    <g>
      <polyline
        points={pickingPathPoints.map((p) => `${p.x * cellPx + cellPx / 2},${p.y * cellPx + cellPx / 2}`).join(" ")}
        fill="none"
        stroke="#22d3ee"
        strokeWidth={2}
        strokeDasharray="6 4"
        opacity={0.9}
      />
      {manualPathPoints.length > 0 && manualPathPoints.map((p, i) => (
        <g key={i}>
          <circle cx={p.x * cellPx + cellPx / 2} cy={p.y * cellPx + cellPx / 2} r={cellPx / 2 - 1} fill="rgba(34,211,238,0.3)" stroke="#22d3ee" strokeWidth={1} />
          <text x={p.x * cellPx + cellPx / 2} y={p.y * cellPx + cellPx / 2} textAnchor="middle" dominantBaseline="middle" fill="#0f172a" fontSize={Math.max(10, cellPx / 2)} fontWeight="bold" style={{ pointerEvents: "none" }}>{i + 1}</text>
        </g>
      ))}
    </g>
  );
}
