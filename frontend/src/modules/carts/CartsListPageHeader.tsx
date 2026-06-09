import type { ReactNode } from "react";

import {
  moduleListHeaderActionsClass,
  moduleListHeaderRowClass,
} from "../../components/listPage/moduleListLayoutTokens";

type CartsListPageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
};

export function CartsListPageHeader({ title, description, actions, meta }: CartsListPageHeaderProps) {
  return (
    <div className={`${moduleListHeaderRowClass} border-b border-slate-200/90 pb-3`}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-slate-600">{description}</p> : null}
        {meta ? <div className="mt-1.5 text-[11px] font-medium text-slate-500">{meta}</div> : null}
      </div>
      {actions ? <div className={moduleListHeaderActionsClass}>{actions}</div> : null}
    </div>
  );
}
