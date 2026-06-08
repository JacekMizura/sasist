import { capacityStateClass, capacityStateLabel } from "../../api/slottingApi";

type CapacityBadgeProps = {
  utilizationPercent: number;
  className?: string;
};

export default function CapacityBadge({ utilizationPercent, className = "" }: CapacityBadgeProps) {
  const util = Number.isFinite(utilizationPercent) ? utilizationPercent : 0;
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${capacityStateClass(util)} ${className}`}
    >
      {Math.round(util)}% · {capacityStateLabel(util)}
    </span>
  );
}
