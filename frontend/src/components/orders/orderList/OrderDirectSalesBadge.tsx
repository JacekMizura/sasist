import { IMMEDIATE_ISSUE_LABEL, STATIONARY_SALE_TITLE } from "../../directSales/directSalesTerminology";

type Props = {
  orderChannel?: string | null;
  fulfillmentMode?: string | null;
};

export function OrderDirectSalesBadge({ orderChannel, fulfillmentMode }: Props) {
  const ch = String(orderChannel ?? "").toUpperCase();
  const fm = String(fulfillmentMode ?? "").toUpperCase();
  if (ch !== "DIRECT_SALE" && fm !== "IMMEDIATE") return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {ch === "DIRECT_SALE" ? (
        <span className="rounded-md border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-800">
          {STATIONARY_SALE_TITLE}
        </span>
      ) : null}
      {fm === "IMMEDIATE" ? (
        <span className="rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-800">
          {IMMEDIATE_ISSUE_LABEL}
        </span>
      ) : null}
    </span>
  );
}
