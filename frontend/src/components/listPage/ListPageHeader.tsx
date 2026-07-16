import type { ReactNode } from "react";
import { PageHeader } from "../layout/PageHeader";

type ListPageHeaderBreadcrumb = {
  label: string;
  to?: string;
};

type ListPageHeaderProps = {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: ListPageHeaderBreadcrumb[];
  tabs?: ReactNode;
  className?: string;
};

export function ListPageHeader({ title, description, actions, breadcrumbs = [], tabs, className }: ListPageHeaderProps) {
  return (
    <PageHeader
      title={title}
      subtitle={description}
      actions={actions}
      breadcrumbs={breadcrumbs}
      tabs={tabs}
      className={className}
    />
  );
}
