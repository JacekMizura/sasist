import type { ReactNode } from "react";

import {
  moduleListHeaderActionsClass,
  moduleListHeaderRowClass,
} from "../../components/listPage/moduleListLayoutTokens";

type CartsListPageHeaderProps = {
  /** Opcjonalny — tytuł modułu jest w CartsModuleLayout; zakładki pokazują tylko opis/akcje. */
  title?: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
};

/** Pasek pod tabami: opis + akcje (bez breadcrumb / tytułu strony). */
export function CartsListPageHeader({ title, description, actions, meta }: CartsListPageHeaderProps) {
  const hasLeft = Boolean(title || description || meta);
  if (!hasLeft && !actions) return null;

  return (
    <div className={`${moduleListHeaderRowClass} border-b border-slate-200/90 pb-3`}>
      {hasLeft ? (
        <div className="min-w-0">
          {title ? <h2 className="text-base font-semibold text-slate-900">{title}</h2> : null}
          {description ? (
            <p className={`text-[13px] text-slate-600 ${title ? "mt-0.5" : ""}`}>{description}</p>
          ) : null}
          {meta ? <div className="mt-1.5 text-[11px] font-medium text-slate-500">{meta}</div> : null}
        </div>
      ) : (
        <div className="min-w-0" />
      )}
      {actions ? <div className={moduleListHeaderActionsClass}>{actions}</div> : null}
    </div>
  );
}
