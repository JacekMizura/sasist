import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Home } from "lucide-react";

import PageLayout from "../../components/layout/PageLayout";
import { CustomerDetailHeader } from "../../components/customers/CustomerDetailHeader";
import { CustomerSummaryStrip } from "../../components/customers/CustomerSummaryStrip";
import { UI_STRINGS } from "../../constants/uiStrings";
import { useCustomerHeaderSummary } from "../../hooks/customers/useCustomerHeaderSummary";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { CustomerDetailTabs } from "./CustomerDetailTabs";

type CustomerDetailPageShellProps = {
  customerId: number | null;
  title: string;
  isNew?: boolean;
  sectionLabel?: string;
  showTabs?: boolean;
  onCopyCustomerData?: () => void;
  onExportHistory?: () => void;
  onDeleteRequest?: () => void;
  headerExtra?: ReactNode;
  children: ReactNode;
};

export function CustomerDetailPageShell({
  customerId,
  title,
  isNew,
  sectionLabel,
  showTabs = false,
  onCopyCustomerData,
  onExportHistory,
  onDeleteRequest,
  headerExtra,
  children,
}: CustomerDetailPageShellProps) {
  const summary = useCustomerHeaderSummary(customerId, DAMAGE_TENANT_ID);

  const breadcrumbs = [
    { label: UI_STRINGS.navigation.customersList, to: "/customers" },
    ...(customerId != null
      ? [{ label: title, to: sectionLabel ? `/customers/${customerId}` : undefined }]
      : [{ label: title }]),
    ...(sectionLabel ? [{ label: sectionLabel }] : []),
  ];

  return (
    <PageLayout fullBleed>
      <div className="space-y-3">
        {breadcrumbs.length > 0 ? (
          <nav className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500" aria-label="Ścieżka nawigacji">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1 font-medium text-slate-500 transition hover:text-slate-800"
              aria-label="Panel"
            >
              <Home className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
            </Link>
            {breadcrumbs.map((item, idx) => (
              <span key={`${item.label}-${idx}`} className="inline-flex items-center gap-1.5">
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
                {item.to ? (
                  <Link to={item.to} className="font-medium text-slate-500 transition hover:text-slate-800">
                    {item.label}
                  </Link>
                ) : (
                  <span className="font-medium text-slate-600">{item.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}

        <CustomerDetailHeader
          customerId={customerId}
          isNew={isNew}
          title={title}
          summary={summary}
          onCopyCustomerData={onCopyCustomerData}
          onExportHistory={onExportHistory}
          onDeleteRequest={onDeleteRequest}
          onProfileUpdated={(detail) => {
            summary.applyDetail(detail);
            summary.refresh();
          }}
          extraActions={headerExtra}
        />

        {showTabs && customerId != null ? <CustomerDetailTabs /> : null}

        {customerId != null && !isNew ? (
          <CustomerSummaryStrip summary={summary} loading={summary.loading} />
        ) : null}
      </div>

      <div className="mt-4 space-y-4">{children}</div>
    </PageLayout>
  );
}
