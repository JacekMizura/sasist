import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Loader2 } from "lucide-react";

import { CustomerMetaBadges } from "./CustomerMetaBadges";
import { CustomerQuickActions } from "./CustomerQuickActions";
import type { CustomerDetail } from "../../api/customersApi";
import type { CustomerHeaderSummary } from "../../hooks/customers/useCustomerHeaderSummary";
import { formatLastPurchaseLabel } from "../../hooks/customers/useCustomerHeaderSummary";
import { listSellasistToolbarSquareBtn } from "../listPage/listSellasistTokens";

type Props = {
  customerId: number | null;
  isNew?: boolean;
  title: string;
  summary: CustomerHeaderSummary;
  detailOverride?: Partial<CustomerDetail> | null;
  onCopyCustomerData?: () => void;
  onExportHistory?: () => void;
  onDeleteRequest?: () => void;
  onProfileUpdated?: (detail: CustomerDetail) => void;
  extraActions?: ReactNode;
};

export function CustomerDetailHeader({
  customerId,
  isNew,
  title,
  summary,
  detailOverride,
  onCopyCustomerData,
  onExportHistory,
  onDeleteRequest,
  onProfileUpdated,
  extraActions,
}: Props) {
  const detail = detailOverride
    ? ({ ...summary.detail, ...detailOverride } as CustomerDetail)
    : summary.detail;

  const lastLabel = formatLastPurchaseLabel(summary.lastPurchaseAt);

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white px-4 py-3 shadow-none">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          {customerId != null && !isNew ? (
            <Link
              to="/customers"
              className={`${listSellasistToolbarSquareBtn} mt-0.5 shrink-0`}
              title="Lista klientów"
              aria-label="Lista klientów"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
            </Link>
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold leading-tight text-slate-900 sm:text-xl">
              {summary.displayName || title}
            </h1>
            {summary.loading ? (
              <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Wczytywanie…
              </p>
            ) : customerId != null && !isNew ? (
              <div className="mt-1.5">
                <CustomerMetaBadges
                  detail={detail}
                  orderCount={summary.orderCount}
                  lastPurchaseAt={lastLabel !== "—" ? lastLabel : null}
                  compact
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {extraActions}
          {customerId != null && !isNew ? (
            <CustomerQuickActions
              customerId={customerId}
              detail={detail}
              onCopyCustomerData={onCopyCustomerData}
              onExportHistory={onExportHistory}
              onDeleteRequest={onDeleteRequest}
              onProfileUpdated={onProfileUpdated}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
