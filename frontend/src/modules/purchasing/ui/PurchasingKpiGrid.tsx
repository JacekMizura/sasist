import { memo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  columns?: 2 | 3 | 4 | 5 | 6;
  className?: string;
};

const COL_CLASS: Record<NonNullable<Props["columns"]>, string> = {
  2: "sm:grid-cols-2",
  3: "md:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
  5: "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
  6: "md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6",
};

function PurchasingKpiGridInner({ children, columns = 4, className = "" }: Props) {
  return (
    <div className={`grid grid-cols-1 gap-4 ${COL_CLASS[columns]} ${className}`.trim()}>{children}</div>
  );
}

export const PurchasingKpiGrid = memo(PurchasingKpiGridInner);
