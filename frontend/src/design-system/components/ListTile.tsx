import type { HTMLAttributes, ReactNode } from "react";
import { Card } from "./Card";
import { colors, typography } from "../tokens";
import { DENSITY_DEFAULT, type UiDensity } from "../tokens/density";

export type ListTileProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  selected?: boolean;
  density?: UiDensity;
};

/** Catalog / “Użyte w układzie” style tile. */
export function ListTile({
  children,
  selected = false,
  density = DENSITY_DEFAULT,
  className = "",
  ...props
}: ListTileProps) {
  return (
    <Card variant="listTile" selected={selected} density={density} className={className} {...props}>
      {children}
    </Card>
  );
}

export type MetricCardProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  density?: UiDensity;
};

/** KPI metric block. */
export function MetricCard({
  label,
  value,
  unit,
  hint,
  density = "comfortable",
  className = "",
  ...props
}: MetricCardProps) {
  return (
    <Card variant="section" density={density} className={className} {...props}>
      <div className={typography.section}>{label}</div>
      <div className="mt-3 flex items-end gap-2">
        <span className={typography.metric}>{value}</span>
        {unit ? <span className={`pb-1 ${typography.metricUnit}`}>{unit}</span> : null}
      </div>
      {hint ? <div className={`mt-2 text-[13px] ${colors.text.muted}`}>{hint}</div> : null}
    </Card>
  );
}
