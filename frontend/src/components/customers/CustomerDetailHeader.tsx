import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Loader2 } from "lucide-react";

import { CustomerMetaBadges, resolveCustomerTypeLabel } from "./CustomerMetaBadges";
import { CustomerQuickActions } from "./CustomerQuickActions";
import type { CustomerDetail } from "../../api/customersApi";
import type { CustomerHeaderSummary } from "../../hooks/customers/useCustomerHeaderSummary";
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
  extraActions,
}: Props) {
  const detail = detailOverride
    ? ({ ...summary.detail, ...detailOverride } as CustomerDetail)
    : summary.detail;

  const customerType = resolveCustomerTypeLabel(detail);

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-none">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start gap-2">
            {customerId != null && !isNew ? (
              <Link
                to="/customers"
                className={`${listSellasistToolbarSquareBtn} mt-0.5 shrink-0 lg:hidden`}
                title="Lista klientów"
                aria-label="Lista klientów"
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
              </Link>
            ) : null}
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-slate-900 sm:text-xl">
                {summary.displayName || title}
              </h1>
              {summary.loading ? (
                <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Wczytywanie metadanych…
                </p>
              ) : customerId != null && !isNew ? (
                <CustomerMetaBadges
                  customerType={customerType}
                  email={detail?.email}
                  phone={detail?.phone}
                  nip={detail?.nip}
                  orderCount={summary.orderCount}
                  lastPurchaseAt={summary.lastPurchaseAt}
                />
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
          {extraActions}
          {customerId != null && !isNew ? (
            <CustomerQuickActions
              customerId={customerId}
              detail={detail}
              onCopyCustomerData={onCopyCustomerData}
              onExportHistory={onExportHistory}
              onDeleteRequest={onDeleteRequest}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
