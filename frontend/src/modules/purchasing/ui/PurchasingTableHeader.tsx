import { memo, type ReactNode } from "react";
import {
  purchasingTableThClass,
  purchasingTableTheadClass,
  purchasingTableThSortClass,
} from "./purchasingTableTokens";

type Align = "left" | "right" | "center";

type Props = {
  headers?: string[];
  align?: Align[];
  children?: ReactNode;
  className?: string;
  sticky?: boolean;
};

const ALIGN_CLASS: Record<Align, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

function PurchasingTableHeaderInner({
  headers = [],
  align = [],
  children,
  className = "",
  sticky = false,
}: Props) {
  const theadClass = [
    purchasingTableTheadClass,
    sticky ? "sticky top-0 z-10 shadow-sm" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (children) {
    return <thead className={theadClass}>{children}</thead>;
  }

  return (
    <thead className={theadClass}>
      <tr>
        {headers.map((h, i) => {
          const a = align[i] ?? "left";
          return (
            <th key={`${h}-${i}`} className={`${purchasingTableThClass} ${ALIGN_CLASS[a]}`}>
              {h}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

export const PurchasingTableHeader = memo(PurchasingTableHeaderInner);
export {
  purchasingTableThClass,
  purchasingTableTheadClass,
  purchasingTableThSortClass,
  purchasingTableTdClass,
} from "./purchasingTableTokens";
