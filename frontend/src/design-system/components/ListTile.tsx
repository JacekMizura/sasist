import type { HTMLAttributes, ReactNode } from "react";
import { Card } from "./Card";
import { typography } from "../tokens";
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
      <div className={typography.kpiLabel}>{label}</div>
      <div className="mt-3 flex items-end gap-2">
        <span className={typography.metric}>{value}</span>
        {unit ? <span className={`pb-0.5 ${typography.metricUnit}`}>{unit}</span> : null}
      </div>
      {hint ? <div className={`mt-2 ${typography.caption}`}>{hint}</div> : null}
    </Card>
  );
}
