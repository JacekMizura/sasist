import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import PageLayout from "../../components/layout/PageLayout";
import { PageHeader } from "../../components/layout/PageHeader";
import { listSellasistToolbarSquareBtn } from "../../components/listPage/listSellasistTokens";
import { UI_STRINGS } from "../../constants/uiStrings";
import { CustomerDetailTabs } from "./CustomerDetailTabs";

type CustomerDetailPageShellProps = {
  customerId: number | null;
  title: string;
  subtitle?: string;
  sectionLabel?: string;
  showTabs?: boolean;
  actions?: ReactNode;
  children: ReactNode;
};

export function CustomerDetailPageShell({
  customerId,
  title,
  subtitle,
  sectionLabel,
  showTabs = false,
  actions,
  children,
}: CustomerDetailPageShellProps) {
  const breadcrumbs = [
    { label: UI_STRINGS.navigation.customersList, to: "/customers" },
    ...(customerId != null
      ? [{ label: title, to: sectionLabel ? `/customers/${customerId}` : undefined }]
      : [{ label: title }]),
    ...(sectionLabel ? [{ label: sectionLabel }] : []),
  ];

  const defaultActions = (
    <Link
      to="/customers"
      className={listSellasistToolbarSquareBtn}
      title="Lista klientów"
      aria-label="Lista klientów"
    >
      <ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
    </Link>
  );

  return (
    <PageLayout fullBleed>
      <PageHeader
        title={title}
        subtitle={subtitle}
        breadcrumbs={breadcrumbs}
        tabs={showTabs && customerId != null ? <CustomerDetailTabs /> : undefined}
        actions={actions ?? defaultActions}
      />
      <div className="space-y-4">{children}</div>
    </PageLayout>
  );
}
